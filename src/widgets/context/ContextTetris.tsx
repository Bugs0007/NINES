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
  system: "bg-ink-2/40 border-line-3",
  tools: "bg-amber/25 border-amber-3",
  docs: "bg-phos/20 border-phos-3",
  pinned: "bg-amber/50 border-amber",
  summary: "bg-ink-1/30 border-line-3",
  history: "bg-phos/35 border-phos-2",
  question: "bg-ink-0/40 border-ink-1",
  reserve: "border-dashed border-line-3 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(66_84_94/0.35)_4px,rgb(66_84_94/0.35)_5px)]",
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
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      {/* the well */}
      <div className="flex flex-col items-center gap-2">
        <div className="eyebrow text-2xs text-ink-2">context window · {(c.window / 1000).toFixed(0)}k tokens</div>
        <div className="relative h-[380px] w-[210px]">
          <div className={cx("absolute inset-0 rounded-sm border-2", st.overflow ? "border-alert shadow-glow-alert" : "border-line-3")} />
          <div className="absolute inset-x-1 bottom-1 top-1 flex flex-col-reverse overflow-visible">
            <AnimatePresence initial={false}>
              {st.blocks.map((b) => (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, height: "0%" }}
                  animate={{ opacity: 1, height: scale(b.tokens) }}
                  exit={{ opacity: 0, height: "0%" }}
                  transition={reduced ? { duration: 0 } : spring.soft}
                  className={cx("relative mt-[2px] flex shrink-0 items-center justify-center overflow-hidden rounded-xs border px-1", b.kind === "pinned" ? "min-h-[13px]" : "min-h-[3px]", KIND_STYLE[b.kind])}
                  title={`${b.label}: ${b.tokens.toLocaleString()} tokens`}
                >
                  {(b.tokens / c.window > 0.045 || b.kind === "pinned") && (
                    <span className={cx("truncate font-mono text-ink-0", b.kind === "pinned" ? "text-[8px] leading-none" : "text-[11px]")}>
                      {b.label} · {b.tokens >= 1000 ? `${(b.tokens / 1000).toFixed(1)}k` : b.tokens}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {st.overflow && (
            <div className="absolute -top-7 inset-x-0 text-center font-mono text-[11px] text-alert">
              over by {overBy.toLocaleString()} · 400 prompt is too long
            </div>
          )}
        </div>
        <div className="w-[210px]">
          <Slider label="turn" value={turn} min={1} max={c.turns} step={1} onChange={setTurn} format={(v) => `${v} / ${c.turns}`} />
          <div className="mt-1 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => { setTurn(1); setPlaying(true); }} sound="none" disabled={wmode === "preview"}>
              ▶ play chat
            </Button>
            <Chip tone={st.overflow ? "alert" : "muted"}>{st.input.toLocaleString()} in</Chip>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Panel label="context policy">
          <div className={cx("flex flex-col gap-3", controlsLocked && "pointer-events-none opacity-50")}>
            <Segmented<HistoryMode>
              label="History policy"
              size="sm"
              wrap
              value={p.mode}
              onChange={(v) => set("mode", v)}
              options={[
                { value: "full", label: "full history" },
                { value: "last", label: "last N turns" },
                { value: "summary", label: "summarize" },
                { value: "pinned", label: "pinned + last N" },
              ]}
            />
            {(p.mode === "last" || p.mode === "pinned") && <Slider label="keep the last" value={p.lastN} min={2} max={40} step={1} onChange={(v) => set("lastN", v)} format={(v) => `${v} turns`} />}
            <Slider label="retrieved docs per turn" value={p.docs} min={0} max={8} step={1} onChange={(v) => set("docs", v)} format={(v) => `${v} × ${c.docTokens} tokens`} />
            {bill && (
              <>
                <label className="flex items-start gap-2 text-sm text-ink-1">
                  <input type="checkbox" checked={!!p.cache} onChange={(e) => set("cache", e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#e8b77d]" />
                  <span>
                    Cache the stable prefix
                    <span className="block font-mono text-[11px] text-ink-3">
                      system + tools{p.mode === "pinned" ? " + profile" : ""} = {prefixTokens(c, p).toLocaleString()} tokens, identical every turn · first write {CACHE_WRITE_MULT}×, reads {CACHE_READ_MULT}× input price
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
                      { value: "router", label: "router" },
                    ]}
                  />
                  <div className="mt-1 font-mono text-[11px] text-ink-3">
                    {p.model === "router"
                      ? `a cheap classifier sends ~${Math.round((1 - ROUTER_FAST_SHARE) * 100)}% of turns (the hard ones) to Sonnet-class, the rest to Haiku-class`
                      : `per million tokens: Sonnet-class $${g.input} in / $${g.output} out · Haiku-class $${f.input} in / $${f.output} out`}
                  </div>
                </div>
              </>
            )}
          </div>
        </Panel>
        <Panel
          label="input tokens per turn"
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
              <div key={i} className={cx("flex-1 rounded-t-[1px]", ev.perTurn[i]!.overflow ? "bg-alert/70" : i + 1 === turn ? "bg-amber" : "bg-phos/50")} style={{ height: `${ev.perTurn[i]!.overflow ? 100 : (v / maxBar) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between gap-2 font-mono text-[11px] text-ink-3">
            <span className="hidden sm:inline">turn 1</span>
            <span>
              {ev.inputTokens.toLocaleString()} input{bill ? ` + ${(c.outputTokens * c.turns).toLocaleString()} output` : ""} tokens across {ev.overflowTurn ? `${ev.overflowTurn - 1} turns (then rejected)` : `${c.turns} turns`} · ttft ≈ {ev.ttftS.toFixed(2)}s
            </span>
            <span className="hidden sm:inline">turn {c.turns}</span>
          </div>
        </Panel>
        <Panel label={`at turn ${c.turns}, can the model answer?`} right={<Chip tone={ev.quality >= 4 ? "ok" : "alert"}>{ev.quality}/5</Chip>}>
          <ul className="space-y-1">
            {ev.facts.map((f) => (
              <li key={f.fact.id} className="flex items-start gap-2 text-sm">
                <span className={cx("mt-0.5 font-mono text-xs", f.ok ? "text-phos" : "text-alert")}>{f.ok ? "✓" : "✗"}</span>
                <span className="min-w-0">
                  <span className="text-ink-0">{f.fact.question}</span>
                  <span className="block font-mono text-[11px] text-ink-3">
                    needs: {f.fact.label} · {f.why}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        {c.variant !== "lab" && (
          <div className="flex flex-col gap-2">
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
