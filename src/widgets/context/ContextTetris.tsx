"use client";
/**
 * Context Tetris: the context window as a well that fills turn by turn. Pick what goes in; watch what
 * falls out, what it costs, and which questions the model can still answer.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, fmtUsd, Panel, Segmented } from "@/ui/kit";
import { spring, useReducedMotion } from "@/ui/motion";
import { Slider } from "@/ui/Slider";
import { ConditionList } from "../shared";
import type { WidgetProps } from "../types";
import { TEACHING_CACHE_READ_MULT as CACHE_READ_MULT, TEACHING_CACHE_WRITE_MULT as CACHE_WRITE_MULT, TEACHING_PRICES } from "@/content/prices";
import { ContextConfig, evaluate, FACTS, prefixTokens, ROUTER_FAST_SHARE, turnState, type HistoryMode, type Policy } from "./model";

export { ContextConfig };

const KIND_STYLE: Record<string, string> = {
  system: "bg-ink-2/30 border-line-3/80",
  tools: "bg-amber/20 border-amber-3/80",
  docs: "bg-phos/15 border-phos-3/80",
  pinned: "bg-amber/40 border-amber/80",
  summary: "bg-ink-1/25 border-line-3/80",
  history: "bg-phos/30 border-phos-3",
  question: "bg-ink-0/30 border-ink-2",
  reserve: "border-dashed border-line-3/80 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,color-mix(in_srgb,var(--color-line-3)_35%,transparent)_4px,color-mix(in_srgb,var(--color-line-3)_35%,transparent)_5px)]",
};

export default function ContextTetris({ config, scene, onObserve, onResult, conditions, locked, runLocked, verdict, mode: wmode }: WidgetProps<ContextConfig>) {
  const c = ContextConfig.parse(config);
  const bill = c.variant === "bill";
  const reduced = useReducedMotion();
  const [p, setP] = useState<Policy>(() => ({ mode: "full", lastN: 10, docs: 3, cache: false, model: "grader", ...c.start }));
  const [turn, setTurn] = useState(c.variant === "lab" ? 8 : c.turns);
  const [playing, setPlaying] = useState(false);
  const [shipped, setShipped] = useState(false);
  const ev = useMemo(() => evaluate(c, p), [c, p]);
  const st = turnState(c, p, turn);
  const fired = useRef(new Set<string>());
  const fire = (e: string) => {
    if (fired.current.has(e)) return;
    fired.current.add(e);
    onObserve?.(e);
  };

  useEffect(() => {
    if (c.variant !== "lab") return;
    if (p.mode === "full" && turn >= 20) fire("history-cost");
    if ((p.mode === "last" || p.mode === "pinned") && p.lastN <= 20 && turn >= 30 && !ev.facts.find((f) => f.fact.id === "diet")?.ok) fire("forgot");
    if (st.overflow) fire("overflow");
  }, [turn, p]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    if (turn >= c.turns) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setTurn((x) => x + 1);
      sfx.tick();
    }, reduced ? 60 : 180);
    return () => clearTimeout(t);
  }, [playing, turn, c.turns, reduced]);

  useEffect(() => {
    if (scene === "window") setTurn(c.turns);
    if (scene === "stateless") setP((x) => ({ ...x, mode: "full" }));
    if (scene === "policies") setP((x) => ({ ...x, mode: "pinned", lastN: 10 }));
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => {
    if (shipped) return;
    setP((x) => ({ ...x, [k]: v }));
  };

  const ship = () => {
    setShipped(true);
    sfx.confirm();
    onResult?.({ overflow: ev.overflowTurn ? 1 : 0, quality: ev.quality, costPerConversation: ev.costPerConversation, monthly: ev.monthly, ttft: ev.ttftS });
  };

  const scale = (tokens: number) => `${(tokens / c.window) * 100}%`;
  const total = st.blocks.reduce((s, b) => s + b.tokens, 0);
  const overBy = Math.max(0, total - c.window);

  // cumulative bill series
  const bars = ev.perTurn.map((t) => (t.overflow ? 0 : t.input));
  const maxBar = Math.max(...bars, 1);

  const controlsLocked = locked || shipped || wmode === "preview";
  // In the boss the bill stays hidden until you ship: you forecast it from tokens and prices.
  const showUsd = !bill || shipped;
  const g = TEACHING_PRICES.big;
  const f = TEACHING_PRICES.small;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* the well */}
      <div className="flex flex-col items-center gap-3">
        <div className="eyebrow text-xs text-ink-2">Context window · {(c.window / 1000).toFixed(0)}k tokens</div>
        <div className="relative h-[380px] w-[210px]">
          <div className={cx("absolute inset-0 rounded-lg border bg-bg-1/50 transition-colors duration-300", st.overflow ? "border-alert/80 shadow-glow-alert" : "border-line-2")} />
          <div className="absolute inset-x-1.5 bottom-1.5 top-1.5 flex flex-col-reverse overflow-visible">
            <AnimatePresence initial={false}>
              {st.blocks.map((b) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, height: "0%" }}
                  animate={{ opacity: 1, height: scale(b.tokens) }}
                  exit={{ opacity: 0, height: "0%" }}
                  transition={reduced ? { duration: 0 } : spring.soft}
                  className={cx("relative mt-[2px] flex shrink-0 items-center justify-center overflow-hidden rounded-xs border px-1", b.kind === "pinned" ? "min-h-[16px]" : "min-h-[3px]", KIND_STYLE[b.kind])}
                  title={`${b.label}: ${b.tokens.toLocaleString()} tokens`}
                >
                  {(b.tokens / c.window > 0.045 || b.kind === "pinned") && (
                    <span className={cx("truncate text-[11px] font-medium tabular text-ink-0", b.kind === "pinned" && "leading-none")}>
                      {b.label} · {b.tokens >= 1000 ? `${(b.tokens / 1000).toFixed(1)}k` : b.tokens}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {st.overflow && (
            <div className="absolute -top-7 inset-x-0 text-center text-xs font-medium tabular text-alert">
              over by {overBy.toLocaleString()} · 400 prompt is too long
            </div>
          )}
        </div>
        <div className="w-[210px]">
          <Slider label="Turn" value={turn} min={1} max={c.turns} step={1} onChange={setTurn} format={(v) => `${v} / ${c.turns}`} />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setTurn(1); setPlaying(true); }} sound="none" disabled={wmode === "preview"}>
              ▶ Play chat
            </Button>
            <Chip tone={st.overflow ? "alert" : "muted"}>
              <span className="font-mono tabular">{st.input.toLocaleString()}</span> in
            </Chip>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto lg:pr-1 [scrollbar-gutter:stable]">
        <Panel label="Context policy">
          <div className={cx("flex flex-col gap-4", controlsLocked && "pointer-events-none opacity-50")}>
            <Segmented<HistoryMode>
              label="History policy"
              size="sm"
              wrap
              value={p.mode}
              onChange={(v) => set("mode", v)}
              options={[
                { value: "full", label: "Full history" },
                { value: "last", label: "Last N turns" },
                { value: "summary", label: "Summarize" },
                { value: "pinned", label: "Pinned + last N" },
              ]}
            />
            {(p.mode === "last" || p.mode === "pinned") && <Slider label="Keep the last" value={p.lastN} min={2} max={40} step={1} onChange={(v) => set("lastN", v)} format={(v) => `${v} turns`} />}
            <Slider label="Retrieved docs per turn" value={p.docs} min={0} max={8} step={1} onChange={(v) => set("docs", v)} format={(v) => `${v} × ${c.docTokens} tokens`} />
            {bill && (
              <>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-1">
                  <input type="checkbox" checked={!!p.cache} onChange={(e) => set("cache", e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-amber" />
                  <span>
                    Cache the stable prefix
                    <span className="mt-0.5 block text-xs leading-snug text-ink-3">
                      System + tools{p.mode === "pinned" ? " + profile" : ""} = {prefixTokens(c, p).toLocaleString()} tokens, identical every turn · first write {CACHE_WRITE_MULT}×, reads {CACHE_READ_MULT}× input price
                    </span>
                  </span>
                </label>
                <div>
                  <Segmented
                    label="Model"
                    size="sm"
                    value={p.model ?? "grader"}
                    onChange={(v) => set("model", v)}
                    options={[
                      { value: "grader", label: "Sonnet-class" },
                      { value: "fast", label: "Haiku-class" },
                      { value: "router", label: "Router" },
                    ]}
                  />
                  <div className="mt-1.5 text-xs leading-snug text-ink-3">
                    {p.model === "router"
                      ? `A cheap classifier sends ~${Math.round((1 - ROUTER_FAST_SHARE) * 100)}% of turns (the hard ones) to Sonnet-class, the rest to Haiku-class`
                      : `Per million tokens: Sonnet-class $${g.input} in / $${g.output} out · Haiku-class $${f.input} in / $${f.output} out`}
                  </div>
                </div>
              </>
            )}
          </div>
        </Panel>
        <Panel
          label="Input tokens per turn"
          right={
            showUsd ? (
              <span className="tabular">
                {fmtUsd(ev.costPerConversation)} / conversation{bill ? ` · ${fmtUsd(ev.monthly)}/mo` : ""}
              </span>
            ) : (
              <span className="tabular">{c.conversationsPerDay.toLocaleString()} conversations/day · bill after you ship</span>
            )
          }
        >
          <div className="flex h-20 items-end gap-[2px]" aria-label="Input tokens per turn">
            {bars.map((v, i) => (
              <div key={i} className={cx("flex-1 rounded-t-[2px] transition-colors duration-200", ev.perTurn[i]!.overflow ? "bg-alert/60" : i + 1 === turn ? "bg-amber" : "bg-phos/40")} style={{ height: `${ev.perTurn[i]!.overflow ? 100 : (v / maxBar) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-3 text-[11px] tabular text-ink-3">
            <span className="hidden shrink-0 sm:inline">Turn 1</span>
            <span>
              {ev.inputTokens.toLocaleString()} input{bill ? ` + ${(c.outputTokens * c.turns).toLocaleString()} output` : ""} tokens across {ev.overflowTurn ? `${ev.overflowTurn - 1} turns (then rejected)` : `${c.turns} turns`} · ttft ≈ {ev.ttftS.toFixed(2)}s
            </span>
            <span className="hidden shrink-0 sm:inline">Turn {c.turns}</span>
          </div>
        </Panel>
        <Panel label={`At turn ${c.turns}, can the model answer?`} right={<Chip tone={ev.quality >= 4 ? "ok" : "alert"}>{ev.quality}/5</Chip>}>
          <ul className="space-y-2.5">
            {ev.facts.map((f) => (
              <li key={f.fact.id} className="flex items-start gap-2.5 text-sm">
                <span className={cx("mt-0.5 font-mono text-xs", f.ok ? "text-phos" : "text-alert")}>{f.ok ? "✓" : "✗"}</span>
                <span className="min-w-0">
                  <span className="text-ink-0">{f.fact.question}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-3">
                    Needs: {f.fact.label} · {f.why}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        {c.variant !== "lab" && (
          <div className="flex flex-col gap-3">
            <ConditionList conditions={conditions} metrics={shipped ? { overflow: ev.overflowTurn ? 1 : 0, quality: ev.quality, costPerConversation: ev.costPerConversation, monthly: ev.monthly, ttft: ev.ttftS } : undefined} />
            {!shipped ? (
              runLocked ? (
                <Chip tone="warn">Lock your forecast before you ship</Chip>
              ) : (
                <Button variant="go" size="lg" onClick={ship} disabled={locked} sound="none">
                  Ship this policy
                </Button>
              )
            ) : (
              verdict && !verdict.won && <Button variant="secondary" onClick={() => setShipped(false)}>Back to the policy</Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export { FACTS };
