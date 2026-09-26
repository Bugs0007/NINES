"use client";
/**
 * Flow view: the topology as a control-room schematic with requests as particles.
 *
 * Canvas 2D (DECISIONS D-002). Particles are coloured AND sized by how long the request has been
 * alive, so slowness is visible without colour. Queued requests stack in a lane in front of the
 * node, which is what makes a bottleneck visibly pile up.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import { sfx } from "@/audio/engine";
import type { FrameData } from "@/engine/useSim";
import { VizState, type VizParticle } from "@/engine/types";

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

// latency colour ramp: phos -> amber -> alert, on log(age)
const RAMP: [number, number, number][] = [
  [92, 242, 154],
  [180, 230, 110],
  [255, 181, 71],
  [255, 130, 60],
  [255, 90, 78],
];
const BUCKETS = 12;
const BUCKET_COLORS = Array.from({ length: BUCKETS }, (_, i) => {
  const x = (i / (BUCKETS - 1)) * (RAMP.length - 1);
  const a = RAMP[Math.floor(x)]!;
  const b = RAMP[Math.min(RAMP.length - 1, Math.floor(x) + 1)]!;
  const f = x - Math.floor(x);
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
});

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
    let cssW = 0,
      cssH = 0,
      dpr = 1;
    let fontMono = "monospace";
    const fam = getComputedStyle(document.documentElement).getPropertyValue("--font-mono-face").trim();
    if (fam) fontMono = fam;

    const resize = () => {
      const r = wrap.current!.getBoundingClientRect();
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
    ro.observe(wrap.current!);

    // world -> screen transform
    const portrait = () => {
      const o = props.current.orientation;
      return o === "portrait" || (o === "auto" && cssH > cssW * 1.1);
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
      const laneRoom = 150; // world units in front of the leftmost/topmost node
      const bx0 = minX - NODE_W / 2 - laneRoom;
      const bx1 = maxX + NODE_W / 2 + 30;
      const by0 = minY - NODE_H / 2 - 40;
      const by1 = maxY + NODE_H / 2 + 30;
      const ww = p ? by1 - by0 : bx1 - bx0;
      const wh = p ? bx1 - bx0 : by1 - by0;
      const pad = 10;
      const s = Math.min(1.7, (cssW - pad * 2) / ww, (cssH - pad * 2) / wh);
      const ox = (cssW - ww * s) / 2 - (p ? by0 : bx0) * s;
      const oy = (cssH - wh * s) / 2 - (p ? bx0 : by0) * s;
      return { p, s, ox, oy };
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
        const hw = (NODE_W / 2) * t.s + 6;
        const hh = (NODE_H / 2) * t.s + 6;
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
      const { nodes: ns, edges: es, highlight: hl, selected: sel, reducedMotion: rm } = props.current;
      const nm = nodeMap();
      const t = tf();
      const s = t.s;
      const f = frame.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // ---- edges
      ctx.lineWidth = 1;
      for (const e of es) {
        const a = nm.get(e.from);
        const b = nm.get(e.to);
        if (!a || !b) continue;
        const [x1, y1] = toScreen(a.x, a.y, t);
        const [x2, y2] = toScreen(b.x, b.y, t);
        ctx.strokeStyle = "rgba(54,90,102,0.55)";
        ctx.setLineDash([3, 4]);
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
      ctx.setLineDash([]);

      // ---- particle targets
      const groups = new Map<string, { queued: VizParticle[]; svc: VizParticle[] }>();
      for (const p of f.live) {
        let g = groups.get(p.node);
        if (!g) groups.set(p.node, (g = { queued: [], svc: [] }));
        (p.state === VizState.Queued ? g.queued : g.svc).push(p);
      }
      const target = new Map<number, [number, number]>();
      const overflow = new Map<string, number>();
      const cell = Math.max(2.2, 5.5 * s);
      for (const [nid, g] of groups) {
        const n = nm.get(nid);
        if (!n) continue;
        const [cx0, cy0] = toScreen(n.x, n.y, t);
        const hw = (NODE_W / 2) * s;
        const hh = (NODE_H / 2) * s;
        // service slots inside the node (grid)
        const cols = Math.max(2, Math.floor((hw * 2 - 16 * s) / cell));
        g.svc.forEach((p, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          const x = cx0 - hw + 8 * s + c * cell + cell / 2;
          const y = cy0 + hh - 7 * s - r * cell;
          target.set(p.id, [x, Math.max(cy0 - hh + 4, y)]);
        });
        // queue lane in front of the node (left in landscape, above in portrait)
        g.queued.sort((a, b) => a.since - b.since);
        const laneRows = 4;
        const maxInLane = t.p ? Math.floor(((toScreen(n.x, n.y, t)[1] - (t.oy + 4)) / cell) * laneRows * 0.5) : Math.floor(((cx0 - hw - (t.ox + 4)) / cell) * laneRows * 0.45);
        const cap = Math.max(8, maxInLane);
        g.queued.forEach((p, i) => {
          const k = Math.min(i, cap - 1);
          const col = Math.floor(k / laneRows);
          const row = k % laneRows;
          let x: number, y: number;
          if (t.p) {
            x = cx0 - ((laneRows - 1) / 2) * cell + row * cell;
            y = cy0 - hh - 6 - col * cell;
          } else {
            x = cx0 - hw - 6 - col * cell;
            y = cy0 - ((laneRows - 1) / 2) * cell + row * cell;
          }
          target.set(p.id, [x, y]);
        });
        if (g.queued.length > cap) overflow.set(nid, g.queued.length);
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

      // finished -> bursts at the client
      const fin = consumeFinished();
      const client = ns.find((n) => n.kind === "client");
      for (const p of fin) {
        const at = nm.get(p.node) ?? client;
        if (!at) continue;
        const [bx, by] = toScreen(at.x, at.y, t);
        if (bursts.length < 160) bursts.push({ x: bx + (Math.random() - 0.5) * 20 * s, y: by + (Math.random() - 0.5) * 20 * s, t0: now, ok: p.state === VizState.Done });
        if (props.current.sound) sfx.blip(p.age, p.state !== VizState.Done);
      }

      // ---- nodes
      for (const n of ns) {
        const [x, y] = toScreen(n.x, n.y, t);
        const hw = (NODE_W / 2) * s;
        const hh = (NODE_H / 2) * s;
        const inst = f.instant[n.id];
        const up = inst ? inst.up : true;
        const workUtil = inst && n.workers ? inst.busyWorkers / n.workers : 0;
        const cpuUtil = inst && n.cores ? inst.busyCores / n.cores : 0;
        const util = Math.max(workUtil, cpuUtil);
        const hot = util > 0.9 || (inst?.queue ?? 0) > (n.workers ?? 4);
        // body
        ctx.fillStyle = up ? "rgba(13,23,28,0.92)" : "rgba(46,15,13,0.9)";
        ctx.strokeStyle = !up ? "#ff5a4e" : sel === n.id ? "#ffb547" : hot ? "rgba(255,181,71,0.85)" : "rgba(54,90,102,0.9)";
        ctx.lineWidth = sel === n.id ? 1.6 : 1;
        roundRect(ctx, x - hw, y - hh, hw * 2, hh * 2, 3);
        ctx.fill();
        ctx.stroke();
        // kind glyph strip
        ctx.fillStyle = kindColor(n.kind, up);
        ctx.fillRect(x - hw, y - hh, 3, hh * 2);
        // label
        const fs = Math.max(8, 12 * s);
        ctx.font = `600 ${fs}px ${fontMono}`;
        ctx.fillStyle = up ? "#e2efe8" : "#ff5a4e";
        ctx.textBaseline = "top";
        ctx.fillText(n.label.toUpperCase(), x - hw + 8 * s, y - hh + 5 * s, hw * 2 - 12 * s);
        if (n.sub) {
          ctx.font = `${Math.max(7, 9.5 * s)}px ${fontMono}`;
          ctx.fillStyle = "#6f857c";
          ctx.fillText(n.sub, x - hw + 8 * s, y - hh + 5 * s + fs + 2 * s, hw * 2 - 12 * s);
        }
        // utilization bar along the top edge
        if (n.workers || n.cores) {
          const bw = hw * 2 - 6;
          ctx.fillStyle = "rgba(26,42,49,0.9)";
          ctx.fillRect(x - hw + 3, y - hh - 4, bw, 2.5);
          ctx.fillStyle = util > 0.9 ? "#ff5a4e" : util > 0.7 ? "#ffb547" : "#5cf29a";
          ctx.fillRect(x - hw + 3, y - hh - 4, bw * Math.min(1, util), 2.5);
        }
        if (!up) {
          ctx.strokeStyle = "rgba(255,90,78,0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 10 * s, y - 10 * s);
          ctx.lineTo(x + 10 * s, y + 10 * s);
          ctx.moveTo(x + 10 * s, y - 10 * s);
          ctx.lineTo(x - 10 * s, y + 10 * s);
          ctx.stroke();
        }
        if (hl?.includes(n.id)) {
          const pulse = rm ? 1 : 0.6 + 0.4 * Math.sin(now / 180);
          ctx.strokeStyle = `rgba(255,181,71,${pulse})`;
          ctx.lineWidth = 2;
          roundRect(ctx, x - hw - 6, y - hh - 8, hw * 2 + 12, hh * 2 + 14, 5);
          ctx.stroke();
        }
        const ov = overflow.get(n.id);
        if (ov) {
          ctx.font = `600 ${Math.max(8, 10 * s)}px ${fontMono}`;
          ctx.fillStyle = "#ff5a4e";
          ctx.textBaseline = "bottom";
          const label = `${ov} queued`;
          if (t.p) ctx.fillText(label, x - hw, y - hh - 8);
          else ctx.fillText(label, Math.max(4, x - hw - 60 * s), y - hh - 8);
        }
      }

      // ---- particles, batched by colour bucket
      const size = (age: number) => Math.max(1.6, Math.min(4.2, (1.6 + 0.9 * Math.log10(Math.max(1, age * 1000) / 10)) * Math.max(0.7, s)));
      ctx.globalCompositeOperation = "lighter";
      const byBucket: P[][] = Array.from({ length: BUCKETS }, () => []);
      const orphans: P[] = [];
      for (const q of parts.values()) {
        if (q.state === VizState.Orphan) orphans.push(q);
        else byBucket[bucketOf(q.age)]!.push(q);
      }
      for (let b = 0; b < BUCKETS; b++) {
        const list = byBucket[b]!;
        if (!list.length) continue;
        ctx.fillStyle = BUCKET_COLORS[b]!;
        ctx.globalAlpha = 0.16;
        for (const q of list) {
          const r = size(q.age) * 2.2;
          ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        for (const q of list) {
          const r = size(q.age) / 2;
          ctx.fillRect(q.x - r, q.y - r, r * 2, r * 2);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      // orphans: hollow, dim red: the client gave up but the server is still working
      ctx.strokeStyle = "rgba(255,90,78,0.55)";
      ctx.lineWidth = 1;
      for (const q of orphans) {
        const r = size(q.age) / 2 + 0.5;
        ctx.strokeRect(q.x - r, q.y - r, r * 2, r * 2);
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
        ctx.strokeStyle = bt.ok ? `rgba(92,242,154,${0.6 * (1 - k)})` : `rgba(255,90,78,${0.8 * (1 - k)})`;
        ctx.lineWidth = 1.2;
        if (bt.ok) {
          ctx.beginPath();
          ctx.arc(bt.x, bt.y, 2 + k * 9 * Math.max(0.6, s), 0, Math.PI * 2);
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

function kindColor(k: FlowKind, up: boolean): string {
  if (!up) return "#ff5a4e";
  switch (k) {
    case "client":
      return "#465851";
    case "lb":
      return "#6f857c";
    default:
      return "#33c275";
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
