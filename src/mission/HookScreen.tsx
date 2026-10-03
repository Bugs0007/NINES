"use client";
/**
 * The hook: a concrete problem in under 30 seconds. Never a definition.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { sfx } from "@/audio/engine";
import type { Hook } from "@/content/schema";
import { CastLine } from "@/ui/Cast";
import { Button, cx, Kbd, Led } from "@/ui/kit";
import { Shake, spring, useReducedMotion } from "@/ui/motion";
import { alpha, PALETTE } from "@/ui/palette";

export function HookScreen({ hook, title, kicker, onGo, objective }: { hook: Hook; title: string; kicker: string; onGo: () => void; objective?: { canDo: string; why: string } }) {
  const [step, setStep] = useState(0); // 0 visual, 1..n cast lines
  const [shake, setShake] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (hook.visual === "pager" || hook.alert?.severity === "page") {
      sfx.pager();
      setShake((s) => s + 1);
    } else sfx.whoosh();
    const t = setTimeout(() => setStep(1), reduced ? 200 : 1300);
    return () => clearTimeout(t);
  }, [hook, reduced]);

  const advance = () => {
    if (step < hook.lines.length) setStep((s) => s + 1);
    else onGo();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:py-14">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <div className="rounded-full border border-line-2/70 bg-bg-1/60 px-3 py-1 text-xs font-medium text-ink-2">{kicker}</div>
        <h1 className="mt-4 text-balance font-display text-[2.6rem] font-semibold leading-[1.05] text-ink-0 sm:text-6xl">
          <motion.span
            className="inline-block"
            initial={{ opacity: 0, y: reduced ? 0 : 10, filter: reduced ? "none" : "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            {title}
          </motion.span>
        </h1>
        {objective && (
          <motion.p
            className="mt-4 max-w-xl text-balance text-[15px] leading-relaxed text-ink-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.8, delay: reduced ? 0 : 0.5 }}
          >
            <span className="text-ink-2">You&apos;ll learn to </span>
            {objective.canDo.charAt(0).toLowerCase() + objective.canDo.slice(1)}
          </motion.p>
        )}
      </div>

      <Shake trigger={shake} intensity={0.6} className="w-full max-w-lg">
        <HookVisual hook={hook} />
      </Shake>

      <div className="flex min-h-[140px] w-full max-w-lg flex-col gap-4">
        <AnimatePresence>
          {hook.lines.slice(0, step).map((l, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
              <CastLine line={l} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-4">
        <Button variant={step >= hook.lines.length ? "primary" : "secondary"} size="lg" className="min-w-40" onClick={advance} sound={step >= hook.lines.length ? "confirm" : "tick"}>
          {step >= hook.lines.length ? (hook.alert?.severity === "page" ? "Acknowledge page" : "Take it") : "Continue"}
        </Button>
        <span className="hidden text-ink-3 sm:inline">
          <Kbd>Enter</Kbd>
        </span>
      </div>
    </div>
  );
}

const card = "rounded-lg border bg-bg-1/80 shadow-card";

function HookVisual({ hook }: { hook: Hook }) {
  const a = hook.alert;
  switch (hook.visual) {
    case "pager":
      return (
        <div className={cx(card, "overflow-hidden border-alert-3/50")}>
          <div className="flex items-center justify-between gap-3 border-b border-alert-3/30 bg-alert-dim/45 px-4 py-2.5">
            <span className="flex items-center gap-2.5 text-[13px] font-medium text-alert">
              <Led tone="alert" blink /> {a?.severity === "warn" ? "Warning" : "Page · high urgency"}
            </span>
            <span className="font-mono text-xs tabular text-ink-2">02:14 IST</span>
          </div>
          <div className="px-4 pb-4 pt-3.5">
            <div className="font-mono text-[15px] leading-snug text-ink-0">{a?.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-ink-1">{a?.detail}</div>
          </div>
        </div>
      );
    case "graph-spike":
      return (
        <div className={cx(card, "border-line/70 p-4")}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-1">{a?.title ?? "p99 latency"}</span>
            <span className="font-mono text-[13px] tabular text-alert">{a?.detail}</span>
          </div>
          <SpikeChart />
        </div>
      );
    case "complaint":
      return (
        <div className="flex flex-col gap-2.5">
          {(a?.detail ?? "").split("|").map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.soft, delay: 0.15 + i * 0.25 }}
              className={cx(card, "border-line/70 px-4 py-3 text-sm leading-relaxed text-ink-0", i % 2 ? "ml-6 sm:ml-10" : "mr-6 sm:mr-10")}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-ink-3">
                <span className="h-1.5 w-1.5 rounded-full bg-sky/70" aria-hidden />
                Support ticket <span className="font-mono tabular">#{4812 + i * 7}</span>
              </div>
              {t.trim()}
            </motion.div>
          ))}
        </div>
      );
    case "bill":
      return (
        <div className={cx(card, "border-amber-3/50 p-5")} style={{ backgroundImage: `linear-gradient(160deg, ${alpha(PALETTE.amber, 0.07)}, transparent 60%)` }}>
          <div className="eyebrow text-xs text-amber">{a?.title ?? "Invoice"}</div>
          <div className="num-display mt-3 break-words text-4xl font-semibold text-ink-0 sm:text-5xl">{a?.detail}</div>
        </div>
      );
    case "launch":
      return (
        <div className={cx(card, "border-phos-3/50 p-5 text-center")} style={{ backgroundImage: `linear-gradient(160deg, ${alpha(PALETTE.phos, 0.07)}, transparent 60%)` }}>
          <div className="eyebrow text-xs text-phos">{a?.title ?? "Launch"}</div>
          <div className="mt-2 text-balance font-display text-2xl font-semibold leading-snug text-ink-0 sm:text-[1.75rem]">{a?.detail}</div>
        </div>
      );
    case "terminal":
      return (
        <div className={cx(card, "overflow-hidden border-line/70 bg-bg-0/80")}>
          <div className="flex gap-1.5 border-b border-line/60 px-4 py-2.5" aria-hidden>
            <span className="h-2 w-2 rounded-full bg-line-3" />
            <span className="h-2 w-2 rounded-full bg-line-3" />
            <span className="h-2 w-2 rounded-full bg-line-3" />
          </div>
          <div className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-ink-1">
            {(a?.detail ?? "").split("|").map((l, i) => (
              <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 * i }}>
                <span className="text-ink-3">$ </span>
                {l.trim()}
              </motion.div>
            ))}
          </div>
        </div>
      );
  }
}

function SpikeChart() {
  const pts = [18, 19, 17, 20, 18, 19, 21, 20, 22, 21, 24, 30, 46, 80, 140, 210, 240, 236];
  const w = 360,
    h = 96;
  const max = 250;
  const y = (v: number) => h - (v / max) * (h - 8) - 4;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="hook-spike" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={PALETTE.alert} stopOpacity="0.22" />
          <stop offset="100%" stopColor={PALETTE.alert} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke={PALETTE.line} strokeWidth={1} />
      ))}
      <line x1={0} x2={w} y1={y(40)} y2={y(40)} stroke={PALETTE.alert} strokeOpacity="0.45" strokeDasharray="4 4" />
      <motion.path d={`${d}L${w},${h}L0,${h}Z`} fill="url(#hook-spike)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }} />
      <motion.path d={d} fill="none" stroke={PALETTE.alert} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeIn" }} />
    </svg>
  );
}
