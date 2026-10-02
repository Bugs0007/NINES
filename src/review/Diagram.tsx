"use client";
/**
 * Mini architecture diagram for spot-the-flaw reviews. Tap a node or an edge.
 */
import type { Diagram as DiagramT } from "@/content/schema";
import { cx } from "@/ui/kit";

const CELL_W = 150;
const CELL_H = 74;
const NODE_W = 124;
const NODE_H = 42;

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

export function MiniDiagram({ d, picked, answer, reveal, onPick }: { d: DiagramT; picked: string | null; answer?: string; reveal: boolean; onPick: (id: string) => void }) {
  const cols = Math.max(...d.nodes.map((n) => n.col)) + 1;
  const rows = Math.max(...d.nodes.map((n) => n.row)) + 1;
  const W = cols * CELL_W;
  const H = rows * CELL_H;
  const pos = new Map(d.nodes.map((n) => [n.id, { x: n.col * CELL_W + CELL_W / 2, y: n.row * CELL_H + CELL_H / 2 }]));
  const tone = (id: string) => (reveal ? (id === answer ? "ok" : id === picked ? "bad" : "none") : id === picked ? "picked" : "none");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-full" role="group" aria-label="Architecture diagram: tap the flawed part">
      {d.edges.map((e) => {
        const a = pos.get(e.from)!;
        const b = pos.get(e.to)!;
        const id = `${e.from}->${e.to}`;
        const t = tone(id);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={id}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t === "ok" ? "#5cf29a" : t === "bad" ? "#ff5a4e" : t === "picked" ? "#ffb547" : "#365a66"} strokeWidth={t === "none" ? 1.5 : 3} />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={18}
              className="cursor-pointer outline-none focus-visible:stroke-amber/40"
              onClick={() => !reveal && onPick(id)}
              {...keyPick(reveal ? null : () => onPick(id))}
              role="button"
              aria-label={`Connection ${e.from} to ${e.to}${e.label ? `, ${e.label}` : ""}`}
            />
            {e.label && (
              <text x={mx} y={my - 5} textAnchor="middle" fontSize={10} className="pointer-events-none fill-ink-1 font-mono">
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
            className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-amber"
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
              rx={3}
              fill={t === "ok" ? "rgb(15 51 34 / 0.9)" : t === "bad" ? "rgb(46 15 13 / 0.9)" : "rgb(13 23 28 / 0.95)"}
              stroke={t === "ok" ? "#5cf29a" : t === "bad" ? "#ff5a4e" : t === "picked" ? "#ffb547" : "#365a66"}
              strokeWidth={t === "none" ? 1 : 2}
            />
            <text x={p.x - NODE_W / 2 + 7} y={p.y - 6} fontSize={8.5} className={cx("fill-ink-3 font-mono uppercase")} letterSpacing="0.1em">
              {KIND_TAG[n.kind] ?? n.kind}
            </text>
            <foreignObject x={p.x - NODE_W / 2 + 5} y={p.y - 3} width={NODE_W - 10} height={NODE_H / 2 + 2}>
              <div className="truncate text-[11px] leading-tight text-ink-0">{n.label}</div>
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
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cx(
        "flex flex-col items-start gap-1 rounded-sm border p-2 text-left transition-colors",
        state === "ok" ? "border-phos bg-phos-dim/40" : state === "bad" ? "border-alert bg-alert-dim/40" : selected ? "border-amber bg-amber-dim/40" : "border-line-2 bg-bg-2 hover:border-line-3",
      )}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" aria-hidden>
        <path d={d} fill="none" stroke={state === "ok" ? "#5cf29a" : state === "bad" ? "#ff5a4e" : selected ? "#ffb547" : "#a6bab1"} strokeWidth={2} />
      </svg>
      <span className="text-xs text-ink-1">{label}</span>
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
