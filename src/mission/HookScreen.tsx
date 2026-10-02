"use client";
/**
 * The hook: a concrete problem in under 30 seconds. Never a definition.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { sfx } from "@/audio/engine";
import type { Hook } from "@/content/schema";
import { CastLine } from "@/ui/Cast";
import { Button, cx, Kbd } from "@/ui/kit";
import { GlitchText, Shake, spring, useReducedMotion } from "@/ui/motion";

export function HookScreen({ hook, title, kicker, onGo }: { hook: Hook; title: string; kicker: string; onGo: () => void }) {
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
    <div className="relative flex min-h-full flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="text-center">
        <div className="font-mono text-2xs uppercase tracking-[0.3em] text-ink-2">{kicker}</div>
        <h1 className="mt-2 font-display text-5xl font-extrabold uppercase leading-none tracking-tight text-ink-0 sm:text-6xl">
          <GlitchText text={title} />
        </h1>
      </div>

      <Shake trigger={shake} className="w-full max-w-md">
        <HookVisual hook={hook} />
      </Shake>

      <div className="flex min-h-[132px] w-full max-w-md flex-col gap-3">
        <AnimatePresence>
          {hook.lines.slice(0, step).map((l, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
              <CastLine line={l} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <Button variant={step >= hook.lines.length ? "primary" : "secondary"} size="lg" onClick={advance} sound={step >= hook.lines.length ? "confirm" : "tick"}>
          {step >= hook.lines.length ? (hook.alert?.severity === "page" ? "Acknowledge page" : "Take it") : "Continue"}
        </Button>
        <span className="hidden font-mono text-2xs text-ink-3 sm:inline">
          <Kbd>Enter</Kbd>
        </span>
      </div>
    </div>
  );
}

function HookVisual({ hook }: { hook: Hook }) {
  const a = hook.alert;
  switch (hook.visual) {
    case "pager":
      return (
        <div className="rounded-sm border border-alert-3 bg-alert-dim/60 p-4 shadow-glow-alert">
          <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-[0.16em]">
            <span className="flex items-center gap-2 text-alert">
              <span className="inline-block h-2 w-2 animate-blink rounded-full bg-alert" /> {a?.severity === "warn" ? "warning" : "page · high urgency"}
            </span>
            <span className="text-ink-2">02:14 IST</span>
          </div>
          <div className="mt-2 font-mono text-lg text-ink-0">{a?.title}</div>
          <div className="mt-1 text-sm text-ink-1">{a?.detail}</div>
        </div>
      );
    case "graph-spike":
      return (
        <div className="rounded-sm border border-line-2 bg-bg-1 p-3">
          <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">
            <span>{a?.title ?? "p99 latency"}</span>
            <span className="text-alert">{a?.detail}</span>
          </div>
          <SpikeChart />
        </div>
      );
    case "complaint":
      return (
        <div className="flex flex-col gap-2">
          {(a?.detail ?? "").split("|").map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: i % 2 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.soft, delay: 0.15 + i * 0.25 }}
              className={cx("rounded-sm border border-line-2 bg-bg-2 px-3 py-2 text-sm text-ink-0", i % 2 ? "ml-8" : "mr-8")}
            >
              <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">support ticket #{4812 + i * 7}</div>
              {t.trim()}
            </motion.div>
          ))}
        </div>
      );
    case "bill":
      return (
        <div className="rounded-sm border border-amber-3 bg-amber-dim/30 p-4 font-mono">
          <div className="text-2xs uppercase tracking-[0.16em] text-amber">{a?.title ?? "Invoice"}</div>
          <div className="mt-2 text-4xl tabular text-ink-0">{a?.detail}</div>
        </div>
      );
    case "launch":
      return (
        <div className="rounded-sm border border-phos-3 bg-phos-dim/30 p-4 text-center">
          <div className="font-mono text-2xs uppercase tracking-[0.2em] text-phos">{a?.title ?? "Launch"}</div>
          <div className="mt-1 font-display text-4xl font-extrabold uppercase text-ink-0">{a?.detail}</div>
        </div>
      );
    case "terminal":
      return (
        <div className="rounded-sm border border-line-2 bg-bg-0 p-3 font-mono text-xs leading-relaxed text-ink-1">
          {(a?.detail ?? "").split("|").map((l, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 * i }}>
              <span className="text-ink-3">$ </span>
              {l.trim()}
            </motion.div>
          ))}
        </div>
      );
  }
}

function SpikeChart() {
  const pts = [18, 19, 17, 20, 18, 19, 21, 20, 22, 21, 24, 30, 46, 80, 140, 210, 240, 236];
  const w = 360,
    h = 90;
  const max = 250;
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 w-full" aria-hidden>
      <line x1={0} x2={w} y1={h - (40 / max) * (h - 6) - 3} y2={h - (40 / max) * (h - 6) - 3} stroke="#ff5a4e" strokeOpacity="0.5" strokeDasharray="4 3" />
      <motion.path d={d} fill="none" stroke="#ff5a4e" strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeIn" }} />
    </svg>
  );
}
