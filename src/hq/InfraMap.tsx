"use client";
/**
 * The infrastructure map: a circuit-board city of everything you know (and everything you don't yet).
 * Built concepts are buildings whose condition follows FSRS retrievability. Pan, zoom, pinch, tap.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NODE_BY_ID, type PlannedNode } from "@/content/graph";
import { isPlayable } from "@/content/progression";
import type { ConceptProgress } from "@/game/db";
import { healthFrom, type BuildingHealth } from "@/game/fsrs";
import { cx } from "@/ui/kit";
import { useReducedMotion } from "@/ui/motion";
import { blockRect, crossTrace, LOT, mapLayout } from "./layout";

export type LotState = "locked" | "blueprint" | "available" | "built";

export interface LotInfo {
  state: LotState;
  health?: BuildingHealth;
  r?: number;
  mastery?: number;
  /** Recently repaired by a review: play the repair animation once. */
  repaired?: boolean;
  beaten?: boolean;
}

export function lotInfo(n: PlannedNode, concepts: Record<string, ConceptProgress>, built: ReadonlySet<string>, beaten: ReadonlySet<string>, rOf: (id: string) => number | undefined, now: number): LotInfo {
  const c = concepts[n.id];
  if (c?.builtAt) {
    const r = rOf(n.id) ?? 1;
    let health = healthFrom(r);
    // A due concept is never shown as fully healthy, even if fuzz kept R just above 0.9.
    if (health === "online" && c.card && new Date(c.card.due).getTime() <= now) health = "flicker";
    return { state: "built", r, health, mastery: c.mastery, repaired: !!c.lastRepairAt && now - c.lastRepairAt < 90_000 };
  }
  if (beaten.has(n.id)) return { state: "built", r: 1, health: "online", mastery: 1, beaten: true };
  const open = n.prereqs.every((p) => built.has(p) || beaten.has(p));
  if (!open) return { state: "locked" };
  return { state: isPlayable(n.id) ? "available" : "blueprint" };
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function InfraMap({
  info,
  selected,
  onSelect,
  focusChapter,
  className,
}: {
  info: (id: string) => LotInfo;
  selected: string | null;
  onSelect: (id: string | null) => void;
  focusChapter?: string;
  className?: string;
}) {
  const L = mapLayout();
  const reduced = useReducedMotion();
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: -40, y: -40, w: L.width + 80, h: L.height + 80 });
  const [aspect, setAspect] = useState(1.6);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean; pinch?: number } | null>(null);

  // Fit a rect into the viewport, respecting the container's aspect ratio.
  const fit = useCallback(
    (r: { x: number; y: number; w: number; h: number }, pad = 40) => {
      let w = r.w + pad * 2;
      let h = r.h + pad * 2;
      if (w / h > aspect) h = w / aspect;
      else w = h * aspect;
      setView({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h });
    },
    [aspect],
  );

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      if (b.height > 0) setAspect(b.width / b.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const didFocus = useRef(false);
  useEffect(() => {
    if (didFocus.current) return;
    const r = focusChapter ? blockRect(focusChapter) : null;
    if (r && aspect < 1) {
      // Portrait: fit the block's width and pin it to the top so the city continues below.
      const w = r.w + 40;
      const h = w / aspect;
      setView({ x: r.x - 20, y: r.y - 30, w, h });
    } else if (r) {
      // Show the focused block with some of the city around it.
      fit({ x: r.x - 40, y: r.y - 40, w: Math.max(r.w + 380, 700), h: Math.max(r.h + 200, 360) });
    } else fit({ x: 0, y: 0, w: L.width, h: L.height });
    didFocus.current = true;
  }, [aspect, focusChapter, fit, L.width, L.height]);

  const toWorld = (cx: number, cy: number, v: View) => {
    const b = svg.current!.getBoundingClientRect();
    // preserveAspectRatio="xMidYMid meet"
    const s = Math.min(b.width / v.w, b.height / v.h);
    const ox = (b.width - v.w * s) / 2;
    const oy = (b.height - v.h * s) / 2;
    return { x: v.x + (cx - b.left - ox) / s, y: v.y + (cy - b.top - oy) / s, s };
  };

  const zoomAt = (cx: number, cy: number, k: number, base: View = view) => {
    const p = toWorld(cx, cy, base);
    const w = Math.min(L.width * 2.5, Math.max(260, base.w * k));
    const h = (w / base.w) * base.h;
    return { x: p.x - ((p.x - base.x) * w) / base.w, y: p.y - ((p.y - base.y) * h) / base.h, w, h };
  };

  const onWheel = (e: React.WheelEvent) => {
    const k = Math.exp(e.deltaY * 0.0015);
    setView((v) => zoomAt(e.clientX, e.clientY, k, v));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2, view, moved: true, pinch: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
    } else drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !drag.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (d.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      setView(zoomAt(d.x, d.y, d.pinch / Math.max(1, dist), d.view));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    const b = svg.current!.getBoundingClientRect();
    const s = Math.min(b.width / d.view.w, b.height / d.view.h);
    setView({ ...d.view, x: d.view.x - dx / s, y: d.view.y - dy / s });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      const d = drag.current;
      drag.current = null;
      if (d && !d.moved) {
        // Tap: select the lot under the pointer, if any.
        const p = toWorld(e.clientX, e.clientY, view);
        let best: string | null = null;
        let bestD = (LOT * 0.9) ** 2;
        for (const [id, l] of L.lots) {
          const dd = (l.x - p.x) ** 2 + (l.y - p.y) ** 2;
          if (dd < bestD) {
            bestD = dd;
            best = id;
          }
        }
        onSelect(best);
      }
    }
  };

  const sel = selected ? NODE_BY_ID.get(selected) : null;
  const crossLinks = useMemo(() => {
    if (!sel) return [];
    const ins = sel.prereqs.map((p) => crossTrace(p, sel.id)).filter(Boolean) as string[];
    return ins;
  }, [sel]);

  return (
    <div ref={wrap} className={cx("relative overflow-hidden grid-paper", className)}>
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full touch-none select-none"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="application"
        aria-label="Infrastructure map. Use the list below the map for keyboard navigation."
      >
        <defs>
          <pattern id="rust" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="rgb(138 90 24 / 0.35)" />
            <circle cx="1.5" cy="2" r="0.9" fill="rgb(224 146 42 / 0.6)" />
            <circle cx="4.5" cy="4.6" r="0.7" fill="rgb(122 34 28 / 0.7)" />
          </pattern>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {L.districts.map((d) => (
          <g key={d.track} transform={`translate(${d.x},${d.y})`}>
            <rect width={d.w} height={d.h} rx={6} fill="rgb(8 16 20 / 0.55)" stroke="#1a2a31" strokeDasharray="6 5" />
            <text x={22} y={27} className="fill-ink-2 font-mono" fontSize={13} letterSpacing="0.2em">
              {d.name.toUpperCase()} · TRACK {d.track}
            </text>
            {d.blocks.map((b) => (
              <g key={b.chapter} transform={`translate(${b.x},${b.y})`}>
                <rect width={b.w} height={b.h} rx={3} fill="rgb(13 23 28 / 0.75)" stroke="#26404a" />
                <text x={10} y={18} className="fill-ink-1 font-mono" fontSize={10} letterSpacing="0.14em">
                  {b.chapter.toUpperCase()} · {b.title.toUpperCase()}
                </text>
              </g>
            ))}
          </g>
        ))}

        {/* traces */}
        {L.edges.map((e) => {
          const a = info(e.from);
          const b = info(e.to);
          const live = a.state === "built" && b.state === "built" && a.health === "online" && b.health === "online";
          const lit = a.state === "built";
          return (
            <g key={`${e.from}-${e.to}`}>
              <path d={e.d} fill="none" stroke={lit ? "#1f7a4b" : "#1a2a31"} strokeWidth={lit ? 1.6 : 1.2} />
              {live && !reduced && <path d={e.d} fill="none" stroke="#5cf29a" strokeWidth={1.6} strokeDasharray="2 14" className="trace-flow" />}
            </g>
          );
        })}
        {crossLinks.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#ffb547" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="4 4" />
        ))}

        {/* lots */}
        {[...L.lots.values()].map((l) => (
          <Building key={l.node.id} x={l.x} y={l.y} node={l.node} info={info(l.node.id)} selected={selected === l.node.id} reduced={reduced} />
        ))}
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        {[
          { label: "+", k: 0.7 },
          { label: "−", k: 1.4 },
        ].map((z) => (
          <button
            key={z.label}
            aria-label={z.label === "+" ? "Zoom in" : "Zoom out"}
            onClick={() => {
              const b = svg.current!.getBoundingClientRect();
              setView((v) => zoomAt(b.left + b.width / 2, b.top + b.height / 2, z.k, v));
            }}
            className="grid h-9 w-9 place-items-center rounded-sm border border-line-2 bg-bg-1/90 font-mono text-ink-1 hover:border-amber hover:text-amber"
          >
            {z.label}
          </button>
        ))}
        <button
          aria-label="Fit the whole map"
          onClick={() => fit({ x: 0, y: 0, w: L.width, h: L.height })}
          className="grid h-9 w-9 place-items-center rounded-sm border border-line-2 bg-bg-1/90 font-mono text-2xs text-ink-1 hover:border-amber hover:text-amber"
        >
          ⤢
        </button>
      </div>
    </div>
  );
}

function Building({ x, y, node, info, selected, reduced }: { x: number; y: number; node: PlannedNode; info: LotInfo; selected: boolean; reduced: boolean }) {
  const h = LOT / 2;
  const boss = node.kind === "boss" || node.kind === "case";
  const incident = node.kind === "incident";
  const field = node.kind === "field";
  const shape = (props: React.SVGProps<SVGElement>) =>
    boss ? (
      <polygon points={`${x},${y - h - 3} ${x + h + 3},${y} ${x},${y + h + 3} ${x - h - 3},${y}`} {...(props as React.SVGProps<SVGPolygonElement>)} />
    ) : incident ? (
      <polygon points={`${x},${y - h} ${x + h},${y + h - 2} ${x - h},${y + h - 2}`} {...(props as React.SVGProps<SVGPolygonElement>)} />
    ) : (
      <rect x={x - h} y={y - h} width={LOT} height={LOT} rx={2} {...(props as React.SVGProps<SVGRectElement>)} />
    );

  const ring = selected ? <rect x={x - h - 6} y={y - h - 6} width={LOT + 12} height={LOT + 12} rx={4} fill="none" stroke="#ffb547" strokeWidth={1.6} /> : null;

  if (info.state === "locked") {
    return (
      <g opacity={0.55}>
        {shape({ fill: "none", stroke: "#26404a", strokeDasharray: "2 3" })}
        {ring}
      </g>
    );
  }
  if (info.state === "blueprint") {
    return (
      <g>
        {shape({ fill: "rgb(19 33 40 / 0.4)", stroke: "#365a66", strokeDasharray: "4 3" })}
        {field && <path d={`M${x - 4},${y + 6}V${y - 7}L${x + 6},${y - 3}L${x - 4},${y + 1}`} fill="none" stroke="#365a66" />}
        {ring}
      </g>
    );
  }
  if (info.state === "available") {
    return (
      <g>
        {shape({ fill: "rgb(51 35 12 / 0.55)", stroke: "#ffb547", strokeDasharray: "4 3", strokeWidth: 1.4 })}
        <circle cx={x} cy={y} r={3.2} fill="#ffb547" className={reduced ? "" : "animate-pulse-soft"} filter="url(#glow)" />
        {ring}
      </g>
    );
  }
  // built
  const hl = info.health ?? "online";
  const bodyStroke = hl === "incident" ? "#ff5a4e" : hl === "sparks" || hl === "rust" ? "#e0922a" : "#33c275";
  const light = hl === "online" || hl === "flicker" ? "#5cf29a" : hl === "rust" ? "#ffb547" : "#ff5a4e";
  const lightClass = hl === "flicker" || hl === "sparks" ? (reduced ? "" : "animate-flicker") : "";
  const m = info.mastery ?? 1;
  const floors = m >= 3 ? 3 : m >= 2 ? 3 : 2;
  const lights: React.ReactNode[] = [];
  for (let r = 0; r < floors; r++) {
    for (let c = 0; c < 3; c++) {
      const lit = hl === "online" || (r + c) % 2 === 0;
      lights.push(<rect key={`${r}-${c}`} x={x - 8 + c * 6} y={y + 6 - r * 7} width={3.5} height={3.5} fill={lit ? light : "#132128"} opacity={lit ? 0.95 : 1} />);
    }
  }
  return (
    <g>
      {info.repaired && !reduced && <rect x={x - h - 4} y={y - h - 4} width={LOT + 8} height={LOT + 8} rx={4} fill="none" stroke="#5cf29a" className="repair-ping" />}
      {shape({ fill: hl === "rust" || hl === "sparks" ? "url(#rust)" : "#132128", stroke: bodyStroke, strokeWidth: 1.4 })}
      <g className={lightClass} filter={hl === "online" ? "url(#glow)" : undefined}>
        {boss ? <circle cx={x} cy={y} r={5} fill={light} /> : lights}
      </g>
      {m >= 3 && !boss && (
        <g>
          <line x1={x} y1={y - h} x2={x} y2={y - h - 9} stroke="#5cf29a" strokeWidth={1.2} />
          <circle cx={x} cy={y - h - 10} r={2.2} fill="#5cf29a" className={reduced ? "" : "animate-pulse-soft"} />
        </g>
      )}
      {m >= 2 && !boss && <rect x={x + h - 1} y={y - 4} width={4} height={12} fill="#1a2a31" stroke="#33c275" strokeWidth={0.8} />}
      {hl === "sparks" && !reduced && (
        <g className="sparks">
          <path d={`M${x + h},${y - h}l5,-5M${x + h + 2},${y - h + 4}l6,-1`} stroke="#ffb547" strokeWidth={1.2} />
        </g>
      )}
      {hl === "incident" && (
        <g>
          <rect x={x + h - 12} y={y - h - 9} width={22} height={11} rx={1.5} fill="#ff5a4e" />
          <text x={x + h - 1} y={y - h - 0.8} textAnchor="middle" fontSize={7.5} fontWeight={700} className="font-mono" fill="#04070a">
            INC
          </text>
        </g>
      )}
      {ring}
    </g>
  );
}
