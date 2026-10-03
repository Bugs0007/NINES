"use client";
/**
 * Mini architecture diagram for spot-the-flaw reviews. Tap a node or an edge.
 */
import type { CSSProperties } from "react";
import type { Diagram as DiagramT } from "@/content/schema";
import { cx } from "@/ui/kit";
import { alpha, PALETTE } from "@/ui/palette";

const CELL_W = 160;
const CELL_H = 86;
const NODE_W = 140;
const NODE_H = 56;

const KIND_TAG: Record<string, string> = {
  client: "users",
  lb: "LB",
  server: "app",
  db: "DB",
  cache: "cache",
  queue: "queue",
  store: "blob",
  external: "3rd party",
  worker: "worker",
  llm: "LLM",
};

type Tone = "none" | "picked" | "ok" | "bad";

const STROKE: Record<Tone, string> = { none: PALETTE.line3, picked: PALETTE.amber, ok: PALETTE.phos, bad: PALETTE.alert };
const FILL: Record<Tone, string> = { none: alpha(PALETTE.bg2, 0.96), picked: alpha(PALETTE.amberDim, 0.95), ok: alpha(PALETTE.phosDim, 0.95), bad: alpha(PALETTE.alertDim, 0.95) };

export function MiniDiagram({ d, picked, answer, reveal, onPick }: { d: DiagramT; picked: string | null; answer?: string; reveal: boolean; onPick: (id: string) => void }) {
  const cols = Math.max(...d.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...d.nodes.map((n) => n.row)) + 1;
  const W = cols * CELL_W;
  const H = rows * CELL_H;
  const pos = new Map(d.nodes.map((n) => [n.id, { x: n.col * CELL_W + CELL_W / 2, y: n.row * CELL_H + CELL_H / 2 }]));
  const tone = (id: string): Tone => (reveal ? (id === answer ? "ok" : id === picked ? "bad" : "none") : id === picked ? "picked" : "none");
  // On phones the diagram keeps a readable size and scrolls inside its frame instead of shrinking its labels.
  const minW = { "--diagram-min-w": `${Math.round(W * 0.9)}px` } as CSSProperties;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={minW} className="block h-auto w-full min-w-(--diagram-min-w) sm:min-w-0" role="group" aria-label="Architecture diagram: tap the flawed part">
      {d.edges.map((e) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        const id = `${e.from}->${e.to}`;
        const t = tone(id);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={STROKE[t]} strokeOpacity={t === "none" ? 0.9 : 1} strokeWidth={t === "none" ? 1.5 : 3} strokeLinecap="round" />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={20}
              className="cursor-pointer outline-none focus-visible:stroke-amber/40"
              onClick={() => !reveal && onPick(id)}
              {...keyPick(reveal ? null : () => onPick(id))}
              role="button"
              aria-label={`Connection ${e.from} to ${e.to}${e.label ? `, ${e.label}` : ""}`}
            />
            {e.label && (
              <text x={mx} y={my - 7} textAnchor="middle" fontSize={12} fill={PALETTE.ink1} stroke={PALETTE.bg0} strokeWidth={4} paintOrder="stroke" className="pointer-events-none font-sans tabular">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {d.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const t = tone(n.id);
        return (
          <g
            key={n.id}
            className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-amber [&:hover>rect]:brightness-125"
            onClick={() => !reveal && onPick(n.id)}
            {...keyPick(reveal ? null : () => onPick(n.id))}
            role="button"
            aria-label={`${n.label}${n.note ? `: ${n.note}` : ""}`}
          >
            <rect
              x={p.x - NODE_W / 2}
              y={p.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={10}
              fill={FILL[t]}
              stroke={STROKE[t]}
              strokeOpacity={t === "none" ? 0.8 : 1}
              strokeWidth={t === "none" ? 1 : 2}
              className="transition-[filter] duration-200"
            />
            <foreignObject x={p.x - NODE_W / 2 + 9} y={p.y - NODE_H / 2 + 6} width={NODE_W - 18} height={NODE_H - 10}>
              <div className={cx("text-[12.5px] font-medium leading-none", t === "ok" ? "text-phos" : t === "bad" ? "text-alert" : t === "picked" ? "text-amber" : "text-ink-2")}>{KIND_TAG[n.kind] ?? n.kind}</div>
              <div className="mt-1 line-clamp-2 text-[14px] leading-[1.2] text-ink-0">{n.label}</div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

export function GraphOption({ points, selected, state, label, onClick }: { points: number[]; selected: boolean; state: "none" | "ok" | "bad"; label: string; onClick: () => void }) {
  const w = 120;
  const h = 44;
  const max = Math.max(...points);
  const min = Math.min(0, ...points);
  const d = points.map((v, i) => `${i ? "L" : "M"}${((i / (points.length - 1)) * (w - 8) + 4).toFixed(1)},${(h - 4 - ((v - min) / (max - min || 1)) * (h - 8)).toFixed(1)}`).join("");
  const stroke = state === "ok" ? PALETTE.phos : state === "bad" ? PALETTE.alert : selected ? PALETTE.amber : PALETTE.ink1;
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex flex-col items-start gap-2 rounded-md border p-3 text-left transition-colors duration-200",
        state === "ok" ? "border-phos-3 bg-phos-dim/40" : state === "bad" ? "border-alert-3 bg-alert-dim/40" : selected ? "border-amber-3 bg-amber-dim/50" : "border-line-2/80 bg-bg-2/60 hover:border-line-3 hover:bg-bg-2",
      )}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" aria-hidden>
        <line x1={4} x2={w - 4} y1={h - 4} y2={h - 4} stroke={PALETTE.line2} strokeWidth={1} />
        <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className={cx("text-[13px] leading-snug", selected || state !== "none" ? "text-ink-0" : "text-ink-1")}>{label}</span>
    </button>
  );
}

/** Keyboard access for SVG "buttons": focusable, and Enter or Space picks. */
function keyPick(pick: (() => void) | null) {
  return {
    tabIndex: pick ? 0 : -1,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (pick && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        pick();
      }
    },
  };
}
