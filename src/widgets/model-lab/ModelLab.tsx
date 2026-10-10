"use client";
/**
 * Model Lab: the generic lab widget. Renders any LabModel (see types.ts): controls on the right, the model's
 * view and readouts on the left. In `play` mode everything is live; in `challenge` mode the player sets the
 * controls and presses the run button, which reports the model's metrics.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, Panel, Stat } from "@/ui/kit";
import { Slider } from "@/ui/Slider";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { LAB_MODELS } from "./models";
import { fmtVal, type Control, type Values } from "./types";
import { ViewRenderer } from "./views";

export interface LabConfig {
  title?: string;
  /** Start values that override the model's defaults. */
  start?: Values;
  /** Controls to hide. */
  hide?: string[];
  /** Controls shown but not editable. */
  readonly?: string[];
  runLabel?: string;
  [k: string]: unknown;
}

export function makeLab(modelId: string) {
  const model = LAB_MODELS[modelId];
  if (!model) throw new Error(`Unknown lab model ${modelId}`);
  return function Lab({ config, mode, scene, onObserve, onResult, onDesign, verdict, conditions, locked, runLocked }: WidgetProps<LabConfig>) {
    const cfg = config as LabConfig;
    const [values, setValues] = useState<Values>(() => ({ ...model.init(cfg), ...(cfg.start ?? {}) }));
    const [lastRun, setLastRun] = useState<Record<string, number> | null>(null);
    const [ran, setRan] = useState(0);
    const controls = useMemo(() => model.controls(cfg).filter((c) => !cfg.hide?.includes(c.id)), [cfg]);
    const out = useMemo(() => model.evaluate(values, cfg), [values, cfg]);
    const challenge = mode === "challenge";
    const frozen = locked || mode === "preview";

    // Scenes move controls and highlight them while a mechanism caption is showing.
    const [focus, setFocus] = useState<string[]>([]);
    useEffect(() => {
      if (!scene) {
        setFocus([]);
        return;
      }
      const s = model.scene?.(scene, cfg);
      if (!s) return;
      if (s.set) setValues((v) => ({ ...v, ...s.set }));
      setFocus(s.focus ?? []);
    }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

    const fired = useRef(new Set<string>());
    useEffect(() => {
      if (mode === "preview" || locked) return;
      for (const e of model.events?.(values, out, cfg) ?? []) {
        if (fired.current.has(e)) continue;
        fired.current.add(e);
        onObserve?.(e);
      }
    }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      onDesign?.(values as Record<string, unknown>);
    }, [values]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (id: string, v: number | string | boolean) => setValues((cur) => ({ ...cur, [id]: v }));
    const run = () => {
      sfx.confirm();
      setLastRun(out.metrics);
      setRan((n) => n + 1);
      onResult?.(out.metrics);
    };

    return (
      <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
          <Panel label={cfg.title ?? "Lab"}>
            <ViewRenderer view={out.view} />
          </Panel>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border border-line/70 bg-bg-1/75 p-4 shadow-card sm:grid-cols-3">
            {out.readouts.map((r) => (
              <Stat key={r.label} size="sm" label={r.label} value={fmtVal(r.value, r.fmt)} tone={r.tone === "ok" || r.tone === "warn" || r.tone === "alert" ? r.tone : "default"} sub={r.sub} />
            ))}
          </div>
          {out.notes && out.notes.length > 0 && (
            <ul className="space-y-1 px-1 text-sm text-ink-1">
              {out.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {model.honest && model.honest.length > 0 && (
            <details className="rounded-lg border border-line/60 bg-bg-1/50 px-4 py-2 text-xs text-ink-2">
              <summary className="cursor-pointer select-none text-ink-1">What this model leaves out</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {model.honest.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:overflow-y-auto 2xl:w-[340px]">
          <Panel label={challenge ? "Your design" : "Controls"}>
            <div className={cx("flex flex-col gap-4", frozen && "pointer-events-none opacity-50")}>
              {controls.map((c) => (
                <ControlView key={c.id} c={c} value={values[c.id]} onChange={(v) => set(c.id, v)} disabled={!!cfg.readonly?.includes(c.id)} focus={focus.includes(c.id)} />
              ))}
            </div>
          </Panel>
          {challenge && (
            <>
              <ConditionList conditions={conditions} metrics={lastRun ?? undefined} />
              <Button variant="go" size="lg" onClick={run} disabled={locked || runLocked} sound="none">
                {ran ? "Run again" : (cfg.runLabel ?? model.runLabel ?? "Run it")}
              </Button>
              {verdict && !verdict.won && <Chip tone="alert">Not yet. Adjust and run again.</Chip>}
            </>
          )}
        </div>
      </div>
    );
  };
}

function ControlView({ c, value, onChange, disabled, focus }: { c: Control; value: number | string | boolean | undefined; onChange: (v: number | string | boolean) => void; disabled: boolean; focus: boolean }) {
  const ring = focus ? "ring-1 ring-amber/70 rounded-md" : "";
  if (c.kind === "slider") {
    return (
      <div className={cx(ring, "p-0.5", disabled && "pointer-events-none opacity-60")}>
        <Slider label={c.label} value={Number(value)} min={c.min} max={c.max} step={c.step} log={c.log} onChange={onChange} format={(v) => fmtVal(v, c.fmt)} />
        {c.hint && <div className="mt-1 text-[11px] text-ink-3">{c.hint}</div>}
      </div>
    );
  }
  if (c.kind === "choice") {
    return (
      <div className={cx(ring, "p-0.5", disabled && "pointer-events-none opacity-60")}>
        <div className="eyebrow mb-1.5 text-xs text-ink-2">{c.label}</div>
        <div className="flex flex-col gap-1.5">
          {c.options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                sfx.tick();
                onChange(o.id);
              }}
              aria-pressed={value === o.id}
              className={cx("rounded-md border px-3 py-2 text-left transition-colors duration-200", value === o.id ? "border-amber/80 bg-amber-dim/40" : "border-line-2/80 bg-bg-2/40 hover:border-line-3")}
            >
              <div className="text-sm text-ink-0">{o.label}</div>
              {o.detail && <div className="mt-0.5 text-xs leading-snug text-ink-2">{o.detail}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <button
      onClick={() => {
        sfx.tick();
        onChange(!value);
      }}
      aria-pressed={!!value}
      disabled={disabled}
      className={cx(ring, "rounded-md border px-3 py-2 text-left transition-colors duration-200", value ? "border-amber/80 bg-amber-dim/40" : "border-line-2/80 bg-bg-2/40 hover:border-line-3")}
    >
      <div className="flex items-center justify-between gap-2 text-sm text-ink-0">
        {c.label}
        <span className="font-mono text-xs text-ink-2">{value ? "on" : "off"}</span>
      </div>
      {c.detail && <div className="mt-0.5 text-xs leading-snug text-ink-2">{c.detail}</div>}
    </button>
  );
}
