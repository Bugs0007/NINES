"use client";
/**
 * NINES UI kit: panels, buttons, LEDs, stat readouts, meters, sparklines, chips, segmented controls.
 */
import { motion } from "motion/react";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import { spring } from "./motion";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Panel

export function Panel({
  label,
  right,
  children,
  className,
  bodyClassName,
  tone = "default",
}: {
  label?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "default" | "alert" | "amber" | "phos";
}) {
  const border = {
    default: "border-line",
    alert: "border-alert-3",
    amber: "border-amber-3",
    phos: "border-phos-3",
  }[tone];
  return (
    <section className={cx("relative rounded-sm border bg-bg-1/80", border, className)}>
      {(label || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <h3 className="rack-label font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">{label}</h3>
          {right && <div className="flex items-center gap-2 font-mono text-2xs text-ink-2">{right}</div>}
        </header>
      )}
      <div className={cx("p-3", bodyClassName)}>{children}</div>
      {/* corner ticks */}
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-2 w-2 border-l border-t border-line-3" />
      <span aria-hidden className="pointer-events-none absolute -right-px -bottom-px h-2 w-2 border-r border-b border-line-3" />
    </section>
  );
}

// ---------------------------------------------------------------- Button

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "go";

export interface NButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  sound?: "tick" | "confirm" | "thunk" | "latch" | "none";
}

export const Button = forwardRef<HTMLButtonElement, NButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, sound = "tick", className, children, onClick, disabled, ...rest },
  ref,
) {
  const styles: Record<ButtonVariant, string> = {
    primary: "bg-amber text-bg-0 border-amber hover:bg-[#ffc56b] shadow-[0_0_24px_-6px_rgb(255_181_71/0.6)]",
    go: "bg-phos text-bg-0 border-phos hover:bg-[#7cf7b0] shadow-[0_0_24px_-6px_rgb(92_242_154/0.6)]",
    secondary: "bg-bg-2 text-ink-0 border-line-2 hover:border-line-3 hover:bg-bg-3",
    ghost: "bg-transparent text-ink-1 border-transparent hover:text-ink-0 hover:bg-bg-2",
    danger: "bg-alert-dim text-alert border-alert-3 hover:bg-alert-3/40",
  };
  const sizes = {
    sm: "h-8 px-2.5 text-xs gap-1.5",
    md: "h-10 px-3.5 text-sm gap-2",
    lg: "h-12 px-5 text-base gap-2.5",
  };
  return (
    <motion.button
      ref={ref}
      whileTap={disabled ? undefined : { scale: 0.96, y: 1 }}
      transition={spring.snap}
      disabled={disabled}
      onClick={(e) => {
        if (sound !== "none") {
          sfx.unlock();
          sfx[sound]();
        }
        onClick?.(e);
      }}
      className={cx(
        "inline-flex select-none items-center justify-center rounded-sm border font-mono font-medium uppercase tracking-[0.08em] transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        styles[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
});

// ---------------------------------------------------------------- LED

export type LedTone = "ok" | "warn" | "alert" | "off" | "info";

export function Led({ tone, blink = false, className, label }: { tone: LedTone; blink?: boolean; className?: string; label?: string }) {
  const c = {
    ok: "bg-phos shadow-[0_0_8px_rgb(92_242_154/0.9)]",
    warn: "bg-amber shadow-[0_0_8px_rgb(255_181_71/0.9)]",
    alert: "bg-alert shadow-[0_0_10px_rgb(255_90_78/0.95)]",
    info: "bg-ink-1",
    off: "bg-ink-3",
  }[tone];
  return <span role={label ? "img" : undefined} aria-label={label} className={cx("inline-block h-2 w-2 shrink-0 rounded-full", c, blink && "animate-blink", className)} />;
}

// ---------------------------------------------------------------- Stat

export function Stat({
  label,
  value,
  unit,
  tone = "default",
  sub,
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "default" | "ok" | "warn" | "alert";
  sub?: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const color = { default: "text-ink-0", ok: "text-phos", warn: "text-amber", alert: "text-alert" }[tone];
  const glow = { default: "", ok: "glow-phos", warn: "glow-amber", alert: "glow-alert" }[tone];
  const sz = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" }[size];
  return (
    <div className={cx("min-w-0", className)}>
      <div className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">{label}</div>
      <div className={cx("font-mono font-medium tabular leading-tight", sz, color, glow)}>
        {value}
        {unit && <span className="ml-1 text-[0.55em] font-normal text-ink-2">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 font-mono text-2xs text-ink-2">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Meter

/** Segmented VU-style meter. value 0..1 (can exceed 1: shows overload). */
export function Meter({ value, segments = 20, warnAt = 0.7, alertAt = 0.9, className, label }: { value: number; segments?: number; warnAt?: number; alertAt?: number; className?: string; label?: string }) {
  const lit = Math.round(Math.min(1, Math.max(0, value)) * segments);
  return (
    <div className={cx("flex h-2.5 gap-[2px]", className)} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      {Array.from({ length: segments }, (_, i) => {
        const frac = (i + 1) / segments;
        const on = i < lit;
        const col = frac > alertAt ? "bg-alert" : frac > warnAt ? "bg-amber" : "bg-phos";
        return <span key={i} className={cx("flex-1 rounded-[1px] transition-opacity duration-150", on ? col : "bg-line", on ? "opacity-100" : "opacity-60")} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Sparkline

export function Sparkline({
  values,
  width = 120,
  height = 28,
  max,
  min = 0,
  tone = "phos",
  threshold,
  className,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  max?: number;
  min?: number;
  tone?: "phos" | "amber" | "alert" | "ink";
  threshold?: number;
  className?: string;
  fill?: boolean;
}) {
  const id = useId();
  const color = { phos: "#5cf29a", amber: "#ffb547", alert: "#ff5a4e", ink: "#a6bab1" }[tone];
  const hi = max ?? Math.max(1e-9, ...values, threshold ?? 0);
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = n <= 1 ? width : (i / (n - 1)) * width;
    const y = height - ((Math.min(hi, Math.max(min, v)) - min) / (hi - min || 1)) * (height - 2) - 1;
    return [x, y] as const;
  });
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const thY = threshold !== undefined ? height - ((threshold - min) / (hi - min || 1)) * (height - 2) - 1 : null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {thY !== null && <line x1={0} x2={width} y1={thY} y2={thY} stroke="#ff5a4e" strokeOpacity="0.5" strokeDasharray="3 3" strokeWidth="1" />}
      {n > 1 && fill && <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#g${id})`} />}
      {n > 1 && <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />}
      {n > 0 && <circle cx={pts[n - 1]![0]} cy={pts[n - 1]![1]} r="2" fill={color} />}
    </svg>
  );
}

// ---------------------------------------------------------------- Chip / Tag

export function Chip({ children, tone = "default", className }: { children: ReactNode; tone?: "default" | "ok" | "warn" | "alert" | "muted"; className?: string }) {
  const t = {
    default: "border-line-2 text-ink-1",
    ok: "border-phos-3 text-phos bg-phos-dim/40",
    warn: "border-amber-3 text-amber bg-amber-dim/40",
    alert: "border-alert-3 text-alert bg-alert-dim/50",
    muted: "border-line text-ink-2",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.1em]", t, className)}>{children}</span>;
}

// ---------------------------------------------------------------- Segmented

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = "md",
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  const layout = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-sm border border-line-2 bg-bg-1 p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => {
              if (!active) {
                sfx.unlock();
                sfx.tick();
                onChange(o.value);
              }
            }}
            className={cx(
              "relative flex-1 whitespace-nowrap rounded-[2px] font-mono uppercase tracking-[0.08em] transition-colors",
              size === "sm" ? "h-7 px-2 text-2xs" : "h-9 px-3 text-xs",
              active ? "text-bg-0" : "text-ink-1 hover:text-ink-0",
            )}
          >
            {active && <motion.span layoutId={`seg-${layout}`} transition={spring.snap} className="absolute inset-0 rounded-[2px] bg-amber" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- misc

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[2px] border border-line-2 bg-bg-2 px-1 font-mono text-2xs text-ink-1">{children}</kbd>;
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-1" role="separator">
      <span className="h-px flex-1 bg-line" />
      {label && <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">{label}</span>}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Format seconds as a human latency: 850µs, 12ms, 1.4s. */
export function fmtLatency(s: number): string {
  if (!Number.isFinite(s)) return "∞";
  if (s <= 0) return "0";
  if (s < 1e-6) return `${(s * 1e9).toFixed(0)}ns`;
  if (s < 1e-3) return `${(s * 1e6).toFixed(s < 1e-5 ? 1 : 0)}µs`;
  if (s < 1) return `${(s * 1e3).toFixed(s < 0.01 ? 1 : 0)}ms`;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  if (s < 86400 * 365) return `${(s / 86400).toFixed(1)}d`;
  return `${(s / (86400 * 365)).toFixed(1)}y`;
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function fmtUsd(x: number): string {
  if (x >= 1000) return `$${(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k`;
  return `$${x.toFixed(x < 10 ? 2 : 0)}`;
}

export function fmtNum(x: number): string {
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)}B`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (x >= 1e4) return `${(x / 1e3).toFixed(0)}k`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(1)}k`;
  return x < 10 && x % 1 ? x.toFixed(1) : x.toFixed(0);
}
