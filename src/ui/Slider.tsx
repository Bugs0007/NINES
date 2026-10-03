"use client";
/**
 * Tactile slider: spring thumb, detent ticks with sound, log scale, full keyboard support.
 */
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sfx } from "@/audio/engine";
import { cx } from "./kit";
import { spring } from "./motion";

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  /** Called on release (pointer up / key up). */
  onCommit?: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  log?: boolean;
  label: string;
  format?: (v: number) => ReactNode;
  /** Values to draw as labelled ticks. */
  marks?: { value: number; label: string }[];
  /** A highlighted band (e.g. the danger zone). */
  zone?: { from: number; to: number; tone: "warn" | "alert" };
  disabled?: boolean;
  className?: string;
  hideValue?: boolean;
}

export function Slider({ value, onChange, onCommit, min, max, step, log, label, format, marks, zone, disabled, className, hideValue }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const lastStep = useRef<number>(value);

  const toFrac = useCallback(
    (v: number) => {
      if (log) return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min));
      return (v - min) / (max - min);
    },
    [log, min, max],
  );
  const fromFrac = useCallback(
    (f: number) => {
      const c = Math.min(1, Math.max(0, f));
      let v = log ? Math.exp(Math.log(min) + c * (Math.log(max) - Math.log(min))) : min + c * (max - min);
      if (step) v = Math.round(v / step) * step;
      else if (log) {
        // snap log sliders to 2 significant figures
        const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
        v = Math.round(v / p) * p;
      }
      return Math.min(max, Math.max(min, v));
    },
    [log, min, max, step],
  );

  const emit = useCallback(
    (v: number) => {
      if (v !== lastStep.current) {
        lastStep.current = v;
        sfx.tick();
        onChange(v);
      }
    },
    [onChange],
  );

  useEffect(() => {
    lastStep.current = value;
  }, [value]);

  const fromPointer = (clientX: number) => {
    if (!track.current) return value;
    const r = track.current.getBoundingClientRect();
    return fromFrac((clientX - r.left) / r.width);
  };

  const frac = Math.min(1, Math.max(0, toFrac(value)));
  const keyStep = step ?? (max - min) / 100;

  return (
    <div className={cx("select-none", className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="eyebrow text-xs text-ink-2">{label}</span>
        {!hideValue && <span className="font-mono text-sm tabular text-amber">{format ? format(value) : value}</span>}
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={typeof format?.(value) === "string" ? (format(value) as string) : String(value)}
        aria-disabled={disabled}
        className={cx("group relative h-9 touch-none outline-none", disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer")}
        onPointerDown={(e) => {
          if (disabled) return;
          sfx.unlock();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setDragging(true);
          emit(fromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          emit(fromPointer(e.clientX));
        }}
        onPointerUp={() => {
          if (!dragging) return;
          setDragging(false);
          onCommit?.(lastStep.current);
        }}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={(e) => {
          if (disabled) return;
          let v = value;
          const big = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") v = log ? fromFrac(frac + 0.02 * big) : value + keyStep * big;
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = log ? fromFrac(frac - 0.02 * big) : value - keyStep * big;
          else if (e.key === "Home") v = min;
          else if (e.key === "End") v = max;
          else return;
          e.preventDefault();
          emit(Math.min(max, Math.max(min, step ? Math.round(v / step) * step : v)));
        }}
        onKeyUp={() => onCommit?.(lastStep.current)}
      >
        {/* track: a soft rounded groove, filled in sand up to the thumb */}
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-bg-3 shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]" />
        {zone && (
          <div
            className={cx("absolute top-1/2 h-2 -translate-y-1/2 rounded-full", zone.tone === "alert" ? "bg-alert/30" : "bg-amber/25")}
            style={{ left: `${toFrac(zone.from) * 100}%`, width: `${(toFrac(zone.to) - toFrac(zone.from)) * 100}%` }}
          />
        )}
        <motion.div className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-amber/70" animate={{ width: `${frac * 100}%` }} transition={spring.snap} />
        {marks?.map((m) => (
          <div key={m.value} className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3/70" style={{ left: `${toFrac(m.value) * 100}%` }} />
        ))}
        {/* thumb: a round pebble with a soft halo while held; keyboard focus rings the thumb, not the whole track */}
        <motion.div
          className={cx(
            "absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber bg-ink-0 transition-shadow duration-200 group-focus-visible:ring-4 group-focus-visible:ring-amber/30",
            dragging ? "shadow-[0_0_0_7px_rgb(232_183_125/0.18),0_2px_8px_rgb(0_0_0/0.45)]" : "shadow-[0_2px_8px_rgb(0_0_0/0.45)]",
          )}
          animate={{ left: `${frac * 100}%`, scale: dragging ? 1.1 : 1 }}
          transition={spring.snap}
        />
      </div>
      {marks && (
        <div className="relative mt-1 h-4">
          {marks.map((m) => (
            <span key={m.value} className="absolute -translate-x-1/2 text-[11px] tabular text-ink-3" style={{ left: `${toFrac(m.value) * 100}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
