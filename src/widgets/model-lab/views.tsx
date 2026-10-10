"use client";
/** Views for Model Lab: curve (SVG at real pixel size so text stays readable), bars, waterfall, grid, steps. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { alpha, PALETTE } from "@/ui/palette";
import { cx } from "@/ui/kit";
import { fmtVal, type CurveSeries, type Tone, type View } from "./types";

const TONE_BG: Record<Tone, string> = {
  ok: "bg-phos/70",
  warn: "bg-amber/70",
  alert: "bg-alert/70",
  info: "bg-sky/70",
  muted: "bg-ink-3/60",
  lilac: "bg-lilac/70",
  amber: "bg-amber/70",
};
const TONE_TEXT: Record<Tone, string> = { ok: "text-phos", warn: "text-amber", alert: "text-alert", info: "text-sky", muted: "text-ink-2", lilac: "text-lilac", amber: "text-amber" };
const TONE_HEX: Record<Tone, string> = { ok: PALETTE.phos, warn: PALETTE.amber, alert: PALETTE.alert, info: PALETTE.sky, muted: PALETTE.ink2, lilac: PALETTE.lilac, amber: PALETTE.amber };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e!.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function ViewRenderer({ view }: { view: View }) {
  switch (view.kind) {
    case "curve":
      return <Curve view={view} />;
    case "bars":
      return <Bars view={view} />;
    case "waterfall":
      return <Waterfall view={view} />;
    case "grid":
      return <Grid view={view} />;
    case "steps":
      return <Steps view={view} />;
    case "scatter":
      return <Scatter view={view} />;
  }
}

// ---------------------------------------------------------------- curve

function niceTicks(lo: number, hi: number, n: number, log: boolean): number[] {
  if (log) {
    const out: number[] = [];
    for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++)
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** p;
        if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
      }
    return out.length > 7 ? out.filter((_, i) => i % 3 === 0) : out;
  }
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}

function Curve({ view }: { view: Extract<View, { kind: "curve" }> }) {
  const [ref, w] = useWidth();
  const h = Math.max(220, Math.min(300, w * 0.52));
  const pad = { l: 66, r: 14, t: 14, b: 38 };
  const all = view.series.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]).concat(view.vLines?.map((l) => l.x) ?? [], view.marker ? [view.marker.x] : []);
  const ys = all.map((p) => p[1]).concat(view.hLines?.map((l) => l.y) ?? [], view.marker ? [view.marker.y] : []);
  const x0 = Math.min(...xs);
  let x1 = Math.max(...xs);
  const y0 = view.yLog ? Math.max(1e-9, Math.min(...ys.filter((y) => y > 0))) : Math.min(0, ...ys);
  let y1 = view.yMax ?? Math.max(...ys);
  if (x1 === x0) x1 = x0 + 1;
  if (y1 <= y0) y1 = y0 + 1;
  if (!view.yLog && !view.yMax) y1 *= 1.08;
  const lx = (x: number) => (view.xLog ? Math.log(x) : x);
  const ly = (y: number) => (view.yLog ? Math.log(Math.max(y, y0)) : y);
  const X = (x: number) => pad.l + ((lx(x) - lx(x0)) / (lx(x1) - lx(x0))) * Math.max(10, w - pad.l - pad.r);
  const Y = (y: number) => h - pad.b - ((ly(Math.min(y, y1)) - ly(y0)) / (ly(y1) - ly(y0))) * (h - pad.t - pad.b);
  const path = (s: CurveSeries) => s.points.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
  const xt = niceTicks(x0, x1, w < 420 ? 4 : 6, !!view.xLog);
  const yt = niceTicks(y0, y1, 4, !!view.yLog);
  const mono = "var(--font-mono), monospace";
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`${view.yLabel} against ${view.xLabel}`} className="block overflow-visible">
          {yt.map((t) => (
            <g key={`y${t}`}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} stroke={PALETTE.line} strokeWidth={1} />
              <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" fontSize={11} fill={PALETTE.ink2} fontFamily={mono}>
                {fmtVal(t, view.yFmt)}
              </text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={`x${t}`} x={X(t)} y={h - pad.b + 16} textAnchor="middle" fontSize={11} fill={PALETTE.ink2} fontFamily={mono}>
              {fmtVal(t, view.xFmt)}
            </text>
          ))}
          <text x={pad.l + (w - pad.l - pad.r) / 2} y={h - 4} textAnchor="middle" fontSize={12} fill={PALETTE.ink2}>
            {view.xLabel}
          </text>
          <text transform={`translate(11 ${pad.t + (h - pad.t - pad.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill={PALETTE.ink2}>
            {view.yLabel}
          </text>
          {view.hLines?.map((l) => (
            <g key={l.label}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(l.y)} y2={Y(l.y)} stroke={TONE_HEX[l.tone ?? "ok"]} strokeDasharray="5 4" strokeOpacity={0.8} />
              <text x={w - pad.r - 4} y={Y(l.y) - 5} textAnchor="end" fontSize={11} fill={TONE_HEX[l.tone ?? "ok"]}>
                {l.label}
              </text>
            </g>
          ))}
          {view.vLines?.map((l) => (
            <g key={l.label}>
              <line x1={X(l.x)} x2={X(l.x)} y1={pad.t} y2={h - pad.b} stroke={TONE_HEX[l.tone ?? "info"]} strokeDasharray="5 4" strokeOpacity={0.8} />
              <text x={X(l.x) + 4} y={pad.t + 10} fontSize={11} fill={TONE_HEX[l.tone ?? "info"]}>
                {l.label}
              </text>
            </g>
          ))}
          {view.series.map((s) => (
            <path key={s.id} d={path(s)} fill="none" stroke={TONE_HEX[s.tone ?? "amber"]} strokeWidth={2.25} strokeDasharray={s.dashed ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {view.marker && (
            <g>
              <circle cx={X(view.marker.x)} cy={Y(view.marker.y)} r={9} fill={alpha(TONE_HEX[view.marker.tone ?? "amber"], 0.22)} />
              <circle cx={X(view.marker.x)} cy={Y(view.marker.y)} r={4.5} fill={TONE_HEX[view.marker.tone ?? "amber"]} stroke={PALETTE.bg0} strokeWidth={1.5} />
              {view.marker.label && (
                <text x={Math.min(X(view.marker.x) + 10, w - pad.r - 60)} y={Y(view.marker.y) - 12} fontSize={12} fill={PALETTE.ink0} fontFamily={mono}>
                  {view.marker.label}
                </text>
              )}
            </g>
          )}
        </svg>
      )}
      {view.series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-[66px] text-xs text-ink-2">
          {view.series.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className={cx("inline-block h-0.5 w-4 rounded-full", TONE_BG[s.tone ?? "amber"])} /> {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- bars

function Bars({ view }: { view: Extract<View, { kind: "bars" }> }) {
  const totals = view.bars.map((b) => b.value ?? b.segs?.reduce((s, x) => s + x.value, 0) ?? 0);
  const max = view.max ?? Math.max(...totals, ...(view.lines?.map((l) => l.value) ?? []), 1e-9) * 1.05;
  return (
    <div className="space-y-2.5">
      {view.bars.map((b, i) => {
        let at = 0;
        const segs: ReactNode[] = [];
        (b.segs ?? [{ value: b.value ?? 0, tone: b.tone }]).forEach((s, j) => {
          const wd = Math.max(0, (s.value / max) * 100);
          segs.push(<span key={j} className={cx("absolute inset-y-0.5 rounded-full transition-[left,width] duration-300", TONE_BG[s.tone ?? b.tone ?? "amber"])} style={{ left: `${at}%`, width: `${Math.min(100 - at, wd)}%` }} />);
          at += wd;
        });
        return (
          <div key={b.label} className="flex items-center gap-3">
            <div className="w-[34%] min-w-0 text-xs leading-tight text-ink-1">
              <div className="line-clamp-2" title={b.label}>
                {b.label}
              </div>
              {b.sub && <div className="mt-0.5 text-[11px] text-ink-3">{b.sub}</div>}
            </div>
            <div className="relative h-6 flex-1 rounded-full bg-bg-0/70">
              {segs}
              {view.lines?.map((l) => (
                <span key={l.label} className="absolute inset-y-[-3px] w-px bg-phos/70" style={{ left: `${(l.value / max) * 100}%` }} />
              ))}
            </div>
            <div className="w-16 shrink-0 text-right font-mono text-xs tabular text-ink-0">{fmtVal(totals[i] ?? 0, view.fmt)}</div>
          </div>
        );
      })}
      {view.lines?.map((l) => (
        <div key={l.label} className="flex items-center gap-1.5 text-[11px] text-phos">
          <span className="inline-block h-3 w-px bg-phos/70" /> {l.label}: <span className="font-mono tabular">{fmtVal(l.value, view.fmt)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- waterfall

function Waterfall({ view }: { view: Extract<View, { kind: "waterfall" }> }) {
  const end = Math.max(...view.rows.map((r) => r.start + r.ms), view.target?.ms ?? 0, 1);
  const scale = end * 1.08;
  return (
    <div className="space-y-2">
      {view.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="line-clamp-2 w-[34%] text-xs leading-tight text-ink-1" title={r.label}>
            {r.label}
          </div>
          <div className="relative h-5 flex-1 rounded-full bg-bg-0/70">
            {view.target && <span className="absolute inset-y-[-2px] w-px bg-phos/60" style={{ left: `${(view.target.ms / scale) * 100}%` }} />}
            <span className={cx("absolute inset-y-0.5 rounded-full transition-[left,width] duration-300", TONE_BG[r.tone ?? "info"])} style={{ left: `${(r.start / scale) * 100}%`, width: `${Math.max(0.6, (r.ms / scale) * 100)}%` }} />
            <span className="absolute top-1/2 -translate-y-1/2 pl-1 font-mono text-[11px] tabular text-ink-0" style={{ left: `${Math.min(84, ((r.start + r.ms) / scale) * 100)}%` }}>
              {fmtVal(r.ms, "ms")}
            </span>
          </div>
        </div>
      ))}
      {view.target && <div className="text-[11px] text-phos">{view.target.label}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- grid

function Grid({ view }: { view: Extract<View, { kind: "grid" }> }) {
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))` }}>
        {view.cells.map((c, i) => (
          <div key={i} title={c.title ?? c.label} className={cx("grid aspect-square min-h-6 place-items-center overflow-hidden rounded-sm border border-line/60 px-0.5 text-[11px] leading-none text-bg-0 transition-colors duration-300", TONE_BG[c.tone ?? "muted"])}>
            <span className="truncate font-mono tabular">{c.label}</span>
          </div>
        ))}
      </div>
      {view.caption && <p className="mt-3 text-xs text-ink-2">{view.caption}</p>}
      {view.legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {view.legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={cx("inline-block h-2.5 w-2.5 rounded-sm", TONE_BG[l.tone])} /> {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- steps

function Steps({ view }: { view: Extract<View, { kind: "steps" }> }) {
  return (
    <ol className="space-y-2">
      {view.steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-md border border-line/60 bg-bg-2/40 px-3 py-2">
          <span className={cx("mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full", TONE_BG[s.tone ?? "info"])} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink-0">{s.label}</div>
            {s.detail && <div className="mt-0.5 text-xs leading-snug text-ink-2">{s.detail}</div>}
          </div>
          {s.value && <span className={cx("shrink-0 font-mono text-xs tabular", TONE_TEXT[s.tone ?? "info"])}>{s.value}</span>}
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- scatter

function Scatter({ view }: { view: Extract<View, { kind: "scatter" }> }) {
  const [ref, w] = useWidth();
  const h = Math.max(240, Math.min(340, w * 0.62));
  const pad = 14;
  const X = (x: number) => pad + x * Math.max(10, w - pad * 2);
  const Y = (y: number) => h - pad - y * (h - pad * 2);
  const q = view.points.find((p) => p.ring);
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Scatter plot" className="block overflow-visible">
          <rect x={pad} y={pad} width={Math.max(10, w - pad * 2)} height={h - pad * 2} rx={8} fill={alpha(PALETTE.bg0, 0.5)} stroke={PALETTE.line} />
          {q && view.radius !== undefined && <circle cx={X(q.x)} cy={Y(q.y)} r={view.radius * Math.max(10, w - pad * 2)} fill={alpha(PALETTE.amber, 0.08)} stroke={PALETTE.amber} strokeDasharray="5 4" strokeOpacity={0.7} />}
          {view.points.map((p, i) => (
            <g key={i}>
              {p.ring ? (
                <>
                  <circle cx={X(p.x)} cy={Y(p.y)} r={9} fill={alpha(PALETTE.amber, 0.25)} />
                  <circle cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={PALETTE.amber} stroke={PALETTE.bg0} strokeWidth={1.5} />
                </>
              ) : (
                <circle cx={X(p.x)} cy={Y(p.y)} r={p.size ?? 5} fill={TONE_HEX[p.tone ?? "muted"]} fillOpacity={0.85} stroke={PALETTE.bg0} strokeWidth={1} />
              )}
              {p.label && (
                <text x={X(p.x) + 9} y={Y(p.y) + 4} fontSize={11} fill={p.ring ? PALETTE.amber : PALETTE.ink1}>
                  {p.label}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
      {view.caption && <p className="mt-2 text-xs text-ink-2">{view.caption}</p>}
      {view.legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {view.legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={cx("inline-block h-2.5 w-2.5 rounded-full", TONE_BG[l.tone])} /> {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
