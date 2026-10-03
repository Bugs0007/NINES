"use client";
/**
 * Flow view: the topology as a quiet schematic with requests as particles.
 *
 * Canvas 2D (DECISIONS D-002). Particles are coloured AND sized by how long the request has been
 * alive, so slowness is visible without colour. Queued requests stack in a lane in front of the
 * node, which is what makes a bottleneck visibly pile up.
 *
 * Draw order: edges, node cards, particles, then all text, so names and counts are never buried
 * under traffic. Cards keep a readable size when the layout is scaled down to fit, as long as they
 * don't collide.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { sfx } from "@/audio/engine";
import type { FrameData } from "@/engine/useSim";
import { VizState, type VizParticle } from "@/engine/types";
import { alpha, canvasFont, PALETTE } from "@/ui/palette";

export type FlowKind = "client" | "lb" | "server" | "db" | "cache";

export interface FlowNode {
  id: string;
  label: string;
  kind: FlowKind;
  /** World coordinates, 0..1000 x 0..600 (landscape). Rotated automatically in portrait. */
  x: number;
  y: number;
  workers?: number;
  cores?: number;
  sub?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
}

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  state: number;
  retry: number;
  seen: number;
}

interface Burst {
  x: number;
  y: number;
  t0: number;
  ok: boolean;
}

const W = 1000;
const H = 600;
const NODE_W = 116;
const NODE_H = 58;
/** World units kept in front of the first node along the flow axis, for its queue lane. */
const LANE_ROOM = 90;
const LANE_ROWS = 4;
/** Queued requests drawn per node. The rest show as the "n queued" count and a sand bar. */
const MAX_DRAWN_QUEUE = 24;
/** Screen px above a card for its load bar. */
const BAR_ROOM = 8;
const TAU = Math.PI * 2;

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// latency colour ramp: sage -> sand -> coral, on log(age)
const RAMP: [number, number, number][] = [PALETTE.phos, PALETTE.amber, PALETTE.alert].map(rgbOf);
const BUCKETS = 12;
const BUCKET_RGB = Array.from({ length: BUCKETS }, (_, i) => {
  const x = (i / (BUCKETS - 1)) * (RAMP.length - 1);
  const a = RAMP[Math.floor(x)]!;
  const b = RAMP[Math.min(RAMP.length - 1, Math.floor(x) + 1)]!;
  const f = x - Math.floor(x);
  return a.map((v, k) => Math.round(v + (b[k]! - v) * f)) as [number, number, number];
});
const BUCKET_COLORS = BUCKET_RGB.map(([r, g, b]) => `rgb(${r},${g},${b})`);

/**
 * A soft round halo per colour bucket, drawn once and stamped behind each particle. Normal blending:
 * a dense queue settles into its own colour instead of burning white.
 */
const GLOW_PX = 32;
function glowSprites(): HTMLCanvasElement[] {
  return BUCKET_RGB.map(([r, g, b]) => {
    const c = document.createElement("canvas");
    c.width = c.height = GLOW_PX;
    const x = c.getContext("2d")!;
    const h = GLOW_PX / 2;
    const grd = x.createRadialGradient(h, h, 0, h, h, h);
    grd.addColorStop(0, `rgb(${r} ${g} ${b} / 0.26)`);
    grd.addColorStop(0.5, `rgb(${r} ${g} ${b} / 0.08)`);
    grd.addColorStop(1, `rgb(${r} ${g} ${b} / 0)`);
    x.fillStyle = grd;
    x.fillRect(0, 0, GLOW_PX, GLOW_PX);
    return c;
  });
}

/** Trim text to a width with an ellipsis instead of squeezing the glyphs. Measures with the current ctx.font. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? text.slice(0, lo).trimEnd() + "…" : "";
}

/** Node names read in sentence case; identifiers (app-1, ALB, m7i.large) stay as written. */
function displayLabel(l: string): string {
  return /^[a-z][a-z ]*$/.test(l) ? l[0]!.toUpperCase() + l.slice(1) : l;
}

/** 10ms -> bucket 0, ~3s -> last bucket. */
function bucketOf(ageS: number): number {
  const lo = Math.log10(0.01);
  const hi = Math.log10(3);
  const f = (Math.log10(Math.max(ageS, 0.001)) - lo) / (hi - lo);
  return Math.max(0, Math.min(BUCKETS - 1, Math.round(f * (BUCKETS - 1))));
}

export interface FlowViewProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  frame: MutableRefObject<FrameData>;
  consumeFinished: () => VizParticle[];
  className?: string;
  /** Nodes to ring in amber (replays, hints). */
  highlight?: string[];
  selected?: string | null;
  onNodeTap?: (id: string) => void;
  reducedMotion?: boolean;
  /** Play latency blips for finished requests. */
  sound?: boolean;
  /** Force an orientation; default picks by container aspect ratio. */
  orientation?: "auto" | "landscape" | "portrait";
  ariaLabel?: string;
}

export function FlowView({
  nodes,
  edges,
  frame,
  consumeFinished,
  className,
  highlight,
  selected,
  onNodeTap,
  reducedMotion,
  sound = true,
  orientation = "auto",
  ariaLabel = "Live request flow",
}: FlowViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const props = useRef({ nodes, edges, highlight, selected, reducedMotion, sound, onNodeTap, orientation });
  props.current = { nodes, edges, highlight, selected, reducedMotion, sound, onNodeTap, orientation };

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d", { alpha: true })!;
    const parts = new Map<number, P>();
    const bursts: Burst[] = [];
    let raf = 0;
    let last = performance.now();
    // Adaptive quality: on slow devices, drop the glow pass (most of the overdraw) while frames run long.
    let frameEma = 16.7;
    let lowQuality = false;
    let cssW = 0,
      cssH = 0,
      dpr = 1;
    const sprites = glowSprites();

    const host = wrap.current!;
    const resize = () => {
      if (!host.isConnected) return;
      const r = host.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = Math.max(10, r.width);
      cssH = Math.max(10, r.height);
      cv.width = Math.round(cssW * dpr);
      cv.height = Math.round(cssH * dpr);
      cv.style.width = `${cssW}px`;
      cv.style.height = `${cssH}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // world -> screen transform
    const portrait = () => {
      const o = props.current.orientation;
      return o === "portrait" || (o === "auto" && cssH > cssW * 1.1);
    };
    /** Card scale: at least 1x when the layout shrinks, but never so big that cards collide or crowd a small canvas. */
    const cardScale = (s: number, p: boolean) => {
      const list = props.current.nodes;
      let lim = Math.min((cssW * 0.22) / NODE_W, (cssH * 0.3) / NODE_H);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]!;
          const b = list[j]!;
          const dx = Math.abs(p ? a.y - b.y : a.x - b.x) * s;
          const dy = Math.abs(p ? a.x - b.x : a.y - b.y) * s;
          lim = Math.min(lim, Math.max((dx - 14) / NODE_W, (dy - 18) / NODE_H));
        }
      }
      return Math.min(1.25, Math.max(s, Math.min(1, lim)));
    };
    const tf = () => {
      const p = portrait();
      // Fit the nodes' bounding box (plus room for queue lanes) instead of a fixed world frame.
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const n of props.current.nodes) {
        minX = Math.min(minX, n.x);
        maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y);
        maxY = Math.max(maxY, n.y);
      }
      if (!Number.isFinite(minX)) {
        minX = 0;
        maxX = W;
        minY = 0;
        maxY = H;
      }
      // Screen axes in world units (portrait swaps them). The lane room sits before the first node along the flow.
      const ax0 = p ? minY : minX;
      const ay0 = p ? minX : minY;
      const mL = p ? 40 : LANE_ROOM;
      const mT = p ? LANE_ROOM : 40;
      const spanX = (p ? maxY - minY : maxX - minX) + mL + 30;
      const spanY = (p ? maxX - minX : maxY - minY) + mT + 30;
      const pad = 10;
      // Pass 1: cards scale with the layout. Pass 2: reserve screen room for the cards at their readable size.
      let s = Math.max(0.05, Math.min(2.2, (cssW - pad * 2) / (spanX + NODE_W), (cssH - pad * 2) / (spanY + NODE_H)));
      let cs = cardScale(s, p);
      s = Math.max(0.05, Math.min(2.2, (cssW - pad * 2 - NODE_W * cs) / spanX, (cssH - pad * 2 - NODE_H * cs - BAR_ROOM) / spanY));
      cs = cardScale(s, p);
      const ox = (cssW - (spanX * s + NODE_W * cs)) / 2 - (ax0 - mL) * s + (NODE_W * cs) / 2;
      const oy = (cssH - (spanY * s + NODE_H * cs + BAR_ROOM)) / 2 - (ay0 - mT) * s + (NODE_H * cs) / 2 + BAR_ROOM;
      return { p, s, cs, ox, oy };
    };
    const toScreen = (x: number, y: number, t: ReturnType<typeof tf>) => {
      const wx = t.p ? y : x;
      const wy = t.p ? x : y;
      return [t.ox + wx * t.s, t.oy + wy * t.s] as const;
    };

    const nodeMap = () => {
      const m = new Map<string, FlowNode>();
      for (const n of props.current.nodes) m.set(n.id, n);
      return m;
    };

    const onPointer = (e: PointerEvent) => {
      const cb = props.current.onNodeTap;
      if (!cb) return;
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const t = tf();
      for (const n of props.current.nodes) {
        const [x, y] = toScreen(n.x, n.y, t);
        const hw = (NODE_W / 2) * t.cs + 6;
        const hh = (NODE_H / 2) * t.cs + 6;
        if (Math.abs(px - x) <= hw && Math.abs(py - y) <= hh) {
          cb(n.id);
          return;
        }
      }
    };
    cv.addEventListener("pointerdown", onPointer);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const gap = (now - last) / 1000;
      const dt = Math.min(0.05, gap);
      // After a long pause (hidden tab), snap instead of crawling from stale positions.
      const snap = gap > 0.25;
      last = now;
      if (!snap) {
        frameEma += (gap * 1000 - frameEma) * 0.05;
        if (!lowQuality && frameEma > 21) lowQuality = true;
        else if (lowQuality && frameEma < 17.5) lowQuality = false;
      }
      const { nodes: ns, edges: es, highlight: hl, selected: sel, reducedMotion: rm } = props.current;
      const nm = nodeMap();
      const t = tf();
      const cs = t.cs;
      const f = frame.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // ---- edges: soft solid curves, quieter than the traffic on them
      ctx.lineWidth = 1.25;
      ctx.lineCap = "round";
      ctx.strokeStyle = alpha(PALETTE.line3, 0.5);
      for (const e of es) {
        const a = nm.get(e.from);
        const b = nm.get(e.to);
        if (!a || !b) continue;
        const [x1, y1] = toScreen(a.x, a.y, t);
        const [x2, y2] = toScreen(b.x, b.y, t);
        ctx.beginPath();
        if (t.p) {
          const my = (y1 + y2) / 2;
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(x1, my, x2, my, x2, y2);
        } else {
          const mx = (x1 + x2) / 2;
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(mx, y1, mx, y2, x2, y2);
        }
        ctx.stroke();
      }

      // ---- card geometry for this frame
      const cards = new Map<string, Card>();
      for (const n of ns) {
        const [x, y] = toScreen(n.x, n.y, t);
        cards.set(n.id, cardGeom(n, x, y, cs));
      }

      // ---- particle targets
      const groups = new Map<string, { queued: VizParticle[]; svc: VizParticle[] }>();
      for (const p of f.live) {
        let g = groups.get(p.node);
        if (!g) groups.set(p.node, (g = { queued: [], svc: [] }));
        (p.state === VizState.Queued ? g.queued : g.svc).push(p);
      }
      const target = new Map<number, [number, number]>();
      const queues = new Map<string, { lane: Lane; cap: number; n: number }>();
      const hidden = new Set<number>();
      const cell = Math.max(2.2, 5.5 * cs);
      for (const [nid, g] of groups) {
        const cg = cards.get(nid);
        if (!cg) continue;
        const { x: cx0, y: cy0, hw, hh } = cg;
        // service slots inside the node (grid)
        if (cg.slots) {
          const sg = cg.slots;
          g.svc.forEach((p, i) => target.set(p.id, [...sg.at(i % Math.max(1, sg.count))] as [number, number]));
        } else {
          const cols = Math.max(2, Math.floor((hw * 2 - 16 * cs) / cell));
          g.svc.forEach((p, i) => {
            const x = cx0 - hw + 8 * cs + (i % cols) * cell + cell / 2;
            const y = cy0 + hh - 7 * cs - Math.floor(i / cols) * cell;
            target.set(p.id, [x, Math.max(cy0 - hh + 4, y)]);
          });
        }
        // queue lane in front of the node (left in landscape, above in portrait); a long tail waits, undrawn, at its end
        g.queued.sort((a, b) => a.since - b.since);
        const lane = laneGeom(cg, cell, t.p);
        const maxInLane = t.p ? Math.floor(((cy0 - (t.oy + 4)) / cell) * LANE_ROWS * 0.5) : Math.floor(((cx0 - hw - (t.ox + 4)) / cell) * LANE_ROWS * 0.45);
        const cap = Math.min(MAX_DRAWN_QUEUE, Math.max(8, maxInLane));
        g.queued.forEach((p, i) => {
          target.set(p.id, lane.at(Math.min(i, cap - 1)));
          if (i >= cap) hidden.add(p.id);
        });
        if (g.queued.length) queues.set(nid, { lane, cap, n: g.queued.length });
      }

      // ---- integrate particles
      const seen = f.seq;
      for (const p of f.live) {
        const tg = target.get(p.id);
        if (!tg) continue;
        let q = parts.get(p.id);
        if (!q) {
          // spawn at the client node if we know it, else at the target
          const client = ns.find((n) => n.kind === "client");
          const [sx, sy] = client ? toScreen(client.x, client.y, t) : tg;
          q = { x: sx, y: sy, vx: 0, vy: 0, age: p.age, state: p.state, retry: p.retry, seen };
          parts.set(p.id, q);
        }
        q.age = p.age;
        q.state = p.state;
        q.retry = p.retry;
        q.seen = seen;
        if (rm || snap) {
          q.x = tg[0];
          q.y = tg[1];
          q.vx = q.vy = 0;
        } else {
          // critically damped spring toward the target
          const k = 90;
          const d = 2 * Math.sqrt(k);
          q.vx += ((tg[0] - q.x) * k - q.vx * d) * dt;
          q.vy += ((tg[1] - q.y) * k - q.vy * d) * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        }
      }
      for (const [id, q] of parts) if (q.seen !== seen) parts.delete(id);
      if (process.env.NODE_ENV !== "production") (window as unknown as { __flow?: unknown }).__flow = { parts, target, live: f.live, t };

      // finished -> bursts, low on the card so a busy stream never covers its name
      const fin = consumeFinished();
      const client = ns.find((n) => n.kind === "client");
      for (const p of fin) {
        const at = nm.get(p.node) ?? client;
        if (!at) continue;
        const cg = cards.get(at.id);
        const [bx, by] = toScreen(at.x, at.y, t);
        const bw = cg ? cg.hw * 1.1 : 20 * cs;
        const bh = cg ? cg.hh * 0.35 : 10 * cs;
        if (bursts.length < 160) bursts.push({ x: bx + (Math.random() - 0.5) * bw, y: by + bh + (Math.random() - 0.5) * bh, t0: now, ok: p.state === VizState.Done });
        if (props.current.sound) sfx.blip(p.age, p.state !== VizState.Done);
      }

      // ---- node cards (bodies, slots, load bars); their text is drawn last
      for (const n of ns) {
        const cg = cards.get(n.id)!;
        const { x, y, hw, hh, rad } = cg;
        const inst = f.instant[n.id];
        const up = inst ? inst.up : true;
        const workUtil = inst && n.workers ? inst.busyWorkers / n.workers : 0;
        const cpuUtil = inst && n.cores ? inst.busyCores / n.cores : 0;
        const util = Math.max(workUtil, cpuUtil);
        const hot = util > 0.9 || (inst?.queue ?? 0) > (n.workers ?? 4);
        const selected = sel === n.id;
        // body: a soft card, its border warming only when something needs attention
        ctx.fillStyle = up ? alpha(PALETTE.bg2, 0.94) : alpha(PALETTE.alertDim, 0.92);
        ctx.strokeStyle = !up ? alpha(PALETTE.alert, 0.75) : selected ? PALETTE.amber : hot ? alpha(PALETTE.amber, 0.6) : alpha(PALETTE.line3, 0.6);
        ctx.lineWidth = selected ? 1.6 : 1;
        roundRect(ctx, x - hw, y - hh, hw * 2, hh * 2, rad);
        ctx.fill();
        ctx.stroke();
        // worker slots: filled = busy (exact count from the sim, not just sampled particles)
        if (cg.slots && up) {
          const sg = cg.slots;
          const busy = inst ? Math.min(sg.count, inst.busyWorkers) : 0;
          const full = busy >= sg.count;
          ctx.lineWidth = 0.8;
          ctx.fillStyle = full ? alpha(PALETTE.alert, 0.3) : alpha(PALETTE.phos, 0.26);
          ctx.strokeStyle = full ? alpha(PALETTE.alert, 0.5) : alpha(PALETTE.line3, 0.5);
          for (let i = 0; i < sg.count; i++) {
            const [sx, sy] = sg.at(i);
            const r = sg.cell / 2 - 0.9;
            if (i < busy) ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
            ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
          }
        }
        // utilization: a slim rounded bar just above the card
        if (n.workers || n.cores) {
          const bx = x - hw + rad;
          const bw = hw * 2 - rad * 2;
          const by = y - hh - 6;
          ctx.fillStyle = alpha(PALETTE.line2, 0.8);
          roundRect(ctx, bx, by, bw, 3, 1.5);
          ctx.fill();
          const uw = bw * Math.min(1, util);
          if (uw > 0.5) {
            ctx.fillStyle = util > 0.9 ? PALETTE.alert : util > 0.7 ? PALETTE.amber : PALETTE.phos;
            roundRect(ctx, bx, by, Math.max(3, uw), 3, 1.5);
            ctx.fill();
          }
        }
        if (!up) {
          ctx.strokeStyle = alpha(PALETTE.alert, 0.75);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 9 * cs, y - 9 * cs);
          ctx.lineTo(x + 9 * cs, y + 9 * cs);
          ctx.moveTo(x + 9 * cs, y - 9 * cs);
          ctx.lineTo(x - 9 * cs, y + 9 * cs);
          ctx.stroke();
        }
        if (hl?.includes(n.id)) {
          const pulse = rm ? 0.85 : 0.55 + 0.3 * Math.sin(now / 420);
          ctx.strokeStyle = alpha(PALETTE.amber, pulse);
          ctx.lineWidth = 2;
          roundRect(ctx, x - hw - 6, y - hh - 11, hw * 2 + 12, hh * 2 + 17, rad + 5);
          ctx.stroke();
        }
        // a queue longer than the drawn lane: a soft sand bar carries on past the dots, longer as the queue grows
        const q = queues.get(n.id);
        if (q && q.n > q.cap) {
          const reach = cell * (1.5 + 2.5 * Math.log2(q.n / q.cap));
          const thick = Math.max(3, cell * 0.9);
          const [ex, ey] = q.lane.tail(q.cap);
          if (t.p) {
            const len = Math.max(0, Math.min(reach, ey - 4));
            const grd = ctx.createLinearGradient(0, ey, 0, ey - len);
            grd.addColorStop(0, alpha(PALETTE.amber, 0.5));
            grd.addColorStop(1, alpha(PALETTE.amber, 0.06));
            ctx.fillStyle = grd;
            roundRect(ctx, ex - thick / 2, ey - len, thick, len, Math.min(thick / 2, len / 2, 4));
          } else {
            const len = Math.max(0, Math.min(reach, ex - 4));
            const grd = ctx.createLinearGradient(ex, 0, ex - len, 0);
            grd.addColorStop(0, alpha(PALETTE.amber, 0.5));
            grd.addColorStop(1, alpha(PALETTE.amber, 0.06));
            ctx.fillStyle = grd;
            roundRect(ctx, ex - len, ey - thick / 2, len, thick, Math.min(thick / 2, len / 2, 4));
          }
          ctx.fill();
        }
      }

      // ---- particles: round dots with a soft halo, batched by colour bucket, normal blending
      const size = (age: number) => Math.max(1.6, Math.min(4.2, (1.6 + 0.9 * Math.log10(Math.max(1, age * 1000) / 10)) * Math.max(0.7, cs)));
      const byBucket: P[][] = Array.from({ length: BUCKETS }, () => []);
      const orphans: P[] = [];
      for (const [id, q] of parts) {
        // a request that has reached the undrawn tail of a long queue joins the sand bar
        if (hidden.has(id)) {
          const tg = target.get(id);
          if (tg && Math.abs(tg[0] - q.x) + Math.abs(tg[1] - q.y) < cell * 1.5) continue;
        }
        if (q.state === VizState.Orphan) orphans.push(q);
        else byBucket[bucketOf(q.age)]!.push(q);
      }
      for (let b = 0; b < BUCKETS; b++) {
        const list = byBucket[b]!;
        if (!list.length) continue;
        if (!lowQuality || parts.size < 600) {
          const spr = sprites[b]!;
          for (const q of list) {
            const r = size(q.age) * 2.2;
            ctx.drawImage(spr, q.x - r, q.y - r, r * 2, r * 2);
          }
        }
        ctx.fillStyle = BUCKET_COLORS[b]!;
        ctx.beginPath();
        for (const q of list) {
          const r = size(q.age) * 0.56;
          ctx.moveTo(q.x + r, q.y);
          ctx.arc(q.x, q.y, r, 0, TAU);
        }
        ctx.fill();
      }
      // orphans: hollow, dim red: the client gave up but the server is still working
      if (orphans.length) {
        ctx.strokeStyle = alpha(PALETTE.alert, 0.55);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const q of orphans) {
          const r = size(q.age) * 0.56 + 0.6;
          ctx.moveTo(q.x + r, q.y);
          ctx.arc(q.x, q.y, r, 0, TAU);
        }
        ctx.stroke();
      }

      // ---- bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const bt = bursts[i]!;
        const age = (now - bt.t0) / 1000;
        if (age > 0.45) {
          bursts.splice(i, 1);
          continue;
        }
        const k = age / 0.45;
        ctx.strokeStyle = bt.ok ? alpha(PALETTE.phos, 0.45 * (1 - k)) : alpha(PALETTE.alert, 0.6 * (1 - k));
        ctx.lineWidth = 1.2;
        if (bt.ok) {
          ctx.beginPath();
          ctx.arc(bt.x, bt.y, 2 + k * 8 * Math.max(0.6, cs), 0, TAU);
          ctx.stroke();
        } else {
          const r = 3 + k * 6;
          ctx.beginPath();
          ctx.moveTo(bt.x - r, bt.y - r);
          ctx.lineTo(bt.x + r, bt.y + r);
          ctx.moveTo(bt.x + r, bt.y - r);
          ctx.lineTo(bt.x - r, bt.y + r);
          ctx.stroke();
        }
      }

      // ---- text, on top of everything: name (with busy/total when it fits), sub line, queue count
      for (const n of ns) {
        const cg = cards.get(n.id)!;
        const { x, y, hw, hh, fs, padX, top, dotR } = cg;
        const inst = f.instant[n.id];
        const up = inst ? inst.up : true;
        ctx.fillStyle = kindColor(n.kind, up);
        ctx.beginPath();
        ctx.arc(x - hw + padX + dotR, top + fs * 0.55, dotR, 0, TAU);
        ctx.fill();
        const tx = x - hw + padX + dotR * 2 + 5 * cs;
        const right = x + hw - padX;
        const name = displayLabel(n.label);
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.font = canvasFont("sans", fs, 600);
        const nameW = ctx.measureText(name).width;
        if (cg.slots && up && !cg.compact) {
          const busy = inst ? Math.min(cg.slots.count, inst.busyWorkers) : 0;
          const cnt = `${busy}/${cg.slots.count}`;
          ctx.font = canvasFont("mono", cg.cntFs, 500);
          if (nameW + 6 + ctx.measureText(cnt).width <= right - tx) {
            ctx.fillStyle = busy >= cg.slots.count ? PALETTE.alert : PALETTE.ink2;
            ctx.textAlign = "right";
            ctx.fillText(cnt, right, top + (fs - cg.cntFs) * 0.7);
            ctx.textAlign = "left";
          }
          ctx.font = canvasFont("sans", fs, 600);
        }
        ctx.fillStyle = up ? PALETTE.ink0 : PALETTE.alert;
        ctx.fillText(fitText(ctx, name, right - tx), tx, top);
        if (cg.showSub && n.sub) {
          ctx.font = canvasFont("sans", cg.subFs, 500);
          ctx.fillStyle = PALETTE.ink2;
          ctx.fillText(fitText(ctx, n.sub, hw * 2 - padX * 2), x - hw + padX, top + fs + 3 * cs);
        }
        const q = queues.get(n.id);
        if (q && q.n > q.cap) {
          const text = `${q.n} queued`;
          ctx.font = canvasFont("sans", Math.max(11, 11 * cs), 600);
          ctx.fillStyle = PALETTE.alert;
          const w = ctx.measureText(text).width;
          if (t.p) {
            ctx.textBaseline = "middle";
            ctx.fillText(text, Math.min(cssW - 4 - w, x + (LANE_ROWS / 2) * cell + 6), y - hh - BAR_ROOM - 3 - cell);
          } else {
            ctx.textBaseline = "bottom";
            ctx.textAlign = "right";
            ctx.fillText(text, Math.max(4 + w, x - hw - 4), y - (LANE_ROWS / 2) * cell - 3);
            ctx.textAlign = "left";
          }
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointerdown", onPointer);
    };
  }, [frame, consumeFinished]);

  return (
    <div ref={wrap} className={className} role="img" aria-label={ariaLabel}>
      <canvas ref={canvas} className="block h-full w-full touch-manipulation" />
    </div>
  );
}

interface SlotGeom {
  count: number;
  cols: number;
  rows: number;
  cell: number;
  x0: number;
  y0: number;
  at: (i: number) => readonly [number, number];
}

interface Card {
  x: number;
  y: number;
  hw: number;
  hh: number;
  rad: number;
  /** Small cards keep the name and slots; the sub line and count would only collide. */
  compact: boolean;
  fs: number;
  subFs: number;
  cntFs: number;
  padX: number;
  top: number;
  dotR: number;
  showSub: boolean;
  slots: SlotGeom | null;
}

/** Card layout at card scale cs: the name on top, an optional sub line, worker slots (up to 12 per row) along the bottom. */
function cardGeom(n: FlowNode, x: number, y: number, cs: number): Card {
  const hw = (NODE_W / 2) * cs;
  const hh = (NODE_H / 2) * cs;
  const compact = cs < 0.83;
  const fs = Math.max(12, 12.5 * cs);
  const subFs = Math.max(11, 10.5 * cs);
  const cntFs = Math.max(11, 10 * cs);
  const padX = Math.max(5, 9 * cs);
  const topPad = Math.max(3, 6 * cs);
  let showSub = !!n.sub && !compact;
  let slots: SlotGeom | null = null;
  if (n.workers && n.workers <= 96) {
    const count = Math.min(n.workers, 96);
    const cols = Math.max(1, Math.min(count, 12));
    const rows = Math.max(1, Math.ceil(count / cols));
    const avail = hw * 2 - 14 * cs;
    const room = (sub: boolean) => hh * 2 - topPad - fs - (sub ? 3 * cs + subFs : 0) - 9 * cs;
    let cell = Math.min(8 * cs, avail / cols, room(showSub) / rows);
    // Many slots on a small card: the slots get the sub line's room.
    if (showSub && cell < 3.5) {
      showSub = false;
      cell = Math.min(8 * cs, avail / cols, room(false) / rows);
    }
    cell = Math.max(2, cell);
    const x0 = x - hw + 7 * cs;
    const y0 = y + hh - 5 * cs - rows * cell;
    slots = { count, cols, rows, cell, x0, y0, at: (i: number) => [x0 + (i % cols) * cell + cell / 2, y0 + Math.floor(i / cols) * cell + cell / 2] as const };
  }
  return { x, y, hw, hh, rad: Math.min(hh, Math.max(4, 9 * cs)), compact, fs, subFs, cntFs, padX, top: y - hh + topPad, dotR: Math.max(2, 3 * cs), showSub, slots };
}

interface Lane {
  at: (k: number) => [number, number];
  /** Where the sand bar starts: just past the last drawn column, for a lane of cap requests. */
  tail: (cap: number) => [number, number];
}

/** The queue lane: LANE_ROWS across, growing away from the card (left in landscape, up in portrait). */
function laneGeom(cg: Card, cell: number, portrait: boolean): Lane {
  const cols = (cap: number) => Math.ceil(cap / LANE_ROWS) - 0.4;
  if (portrait) {
    const y0 = cg.y - cg.hh - BAR_ROOM - 3;
    const x0 = cg.x - ((LANE_ROWS - 1) / 2) * cell;
    return { at: (k) => [x0 + (k % LANE_ROWS) * cell, y0 - Math.floor(k / LANE_ROWS) * cell], tail: (cap) => [cg.x, y0 - cols(cap) * cell] };
  }
  const x0 = cg.x - cg.hw - 6;
  const y0 = cg.y - ((LANE_ROWS - 1) / 2) * cell;
  return { at: (k) => [x0 - Math.floor(k / LANE_ROWS) * cell, y0 + (k % LANE_ROWS) * cell], tail: (cap) => [x0 - cols(cap) * cell, cg.y] };
}

function kindColor(k: FlowKind, up: boolean): string {
  if (!up) return PALETTE.alert;
  switch (k) {
    case "client":
      return PALETTE.ink3;
    case "lb":
      return PALETTE.ink2;
    default:
      return PALETTE.phos2;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
