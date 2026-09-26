"use client";
/**
 * Motion primitives. Springs everywhere; reduced motion collapses to fades.
 */
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion as useOsReducedMotion, useTransform, type Transition } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGame } from "@/game/store";

export const spring = {
  /** UI response: buttons, toggles, chips. */
  snap: { type: "spring", stiffness: 700, damping: 38, mass: 0.6 } satisfies Transition,
  /** Panels, sheets, cards. */
  soft: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 } satisfies Transition,
  /** Placements, thunks, heavy things landing. */
  heavy: { type: "spring", stiffness: 420, damping: 22, mass: 1.4 } satisfies Transition,
  /** Rewards. */
  bounce: { type: "spring", stiffness: 500, damping: 14, mass: 0.8 } satisfies Transition,
} as const;

/** Reduced motion: the in-app setting wins over the OS preference. */
export function useReducedMotion(): boolean {
  const os = useOsReducedMotion();
  const pref = useGame((s) => s.profile.settings.reducedMotion);
  if (pref === "on") return true;
  if (pref === "off") return false;
  return !!os;
}

export function Appear({ children, delay = 0, y = 10, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.15, delay } : { ...spring.soft, delay }}
    >
      {children}
    </motion.div>
  );
}

export function Stagger({ children, className, gap = 0.05 }: { children: ReactNode[]; className?: string; gap?: number }) {
  return (
    <div className={className}>
      {children.map((c, i) => (
        <Appear key={i} delay={i * gap}>
          {c}
        </Appear>
      ))}
    </div>
  );
}

/** Spring-animated number. `format` renders the current value. */
export function Ticker({ value, format, className, stiffness = 90 }: { value: number; format: (v: number) => string; className?: string; stiffness?: number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { type: "spring", stiffness, damping: 24, mass: 1 });
    return () => c.stop();
  }, [value, reduced, mv, stiffness]);
  return <motion.span className={className}>{text}</motion.span>;
}

const GLYPHS = "▓▒░█▌▐<>/\\|_-=+*#%@0123456789ABCDEF";

/** Text that resolves out of glyph noise. Used for reveals and headers. */
export function GlitchText({ text, className, duration = 0.6, delay = 0 }: { text: string; className?: string; duration?: number; delay?: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? text : "");
  useEffect(() => {
    if (reduced) {
      setShown(text);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const step = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / (duration * 1000)));
      const settled = Math.floor(p * text.length);
      let out = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) {
        const ch = text[i]!;
        out += ch === " " ? " " : p === 0 && now < start ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setShown(out);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, duration, delay, reduced]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

/** Restrained shake. Increment `trigger` to shake once. */
export function Shake({ trigger, children, className, intensity = 1 }: { trigger: number; children: ReactNode; className?: string; intensity?: number }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced || trigger === 0) return;
    const a = 6 * intensity;
    const c = animate(x, [0, -a, a * 0.8, -a * 0.5, a * 0.3, 0], { duration: 0.38, ease: "easeOut" });
    return () => c.stop();
  }, [trigger, reduced, x, intensity]);
  return (
    <motion.div className={className} style={{ x }}>
      {children}
    </motion.div>
  );
}

/** Typewriter reveal for cast lines. */
export function Typewriter({ text, className, cps = 70, onDone }: { text: string; className?: string; cps?: number; onDone?: () => void }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? text.length : 0);
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
    if (reduced) {
      setN(text.length);
      onDone?.();
      return;
    }
    setN(0);
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(text.length, Math.floor(((now - start) / 1000) * cps));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(step);
      else if (!done.current) {
        done.current = true;
        onDone?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, cps, reduced]);
  return (
    <span className={className} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      {n < text.length && <span aria-hidden className="ml-px inline-block h-[1em] w-[0.5ch] translate-y-[0.15em] bg-current opacity-70" />}
    </span>
  );
}

export { AnimatePresence, motion };
