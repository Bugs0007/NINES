"use client";
/**
 * The recurring cast: one or two lines at a time, never more.
 */
import type { CastLine as CastLineT, Speaker } from "@/content/schema";
import { cx } from "./kit";
import { Typewriter } from "./motion";

/** Each character gets a soft round avatar tinted in their colour: Meera sage, Kabir sand, Rao coral. */
export const CAST: Record<Speaker, { name: string; role: string; glyph: string; tone: string }> = {
  meera: { name: "Meera Iyer", role: "Principal SRE", glyph: "MI", tone: "text-phos bg-phos-dim ring-phos-3/50" },
  kabir: { name: "Kabir Sethi", role: "Founder & CEO", glyph: "KS", tone: "text-amber bg-amber-dim ring-amber-3/50" },
  rao: { name: "Mr. Rao", role: "CFO", glyph: "₹", tone: "text-alert bg-alert-dim ring-alert-3/50" },
  system: { name: "NINES", role: "System", glyph: "N", tone: "text-ink-1 bg-bg-3 ring-line-3/60" },
  pager: { name: "PagerDuty", role: "Alert", glyph: "!", tone: "text-alert bg-alert-dim ring-alert-3/50" },
  user: { name: "A user", role: "Support ticket", glyph: "@", tone: "text-sky bg-sky-dim ring-sky-3/50" },
};

export function CastLine({ line, className, typewriter = true, compact = false }: { line: CastLineT; className?: string; typewriter?: boolean; compact?: boolean }) {
  const who = CAST[line.speaker];
  return (
    <div className={cx("flex items-start", compact ? "gap-2.5" : "gap-3.5", className)}>
      <div
        className={cx(
          "grid shrink-0 select-none place-items-center rounded-full font-semibold ring-1 ring-inset",
          compact ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-[13px]",
          who.tone,
        )}
        aria-hidden
      >
        {who.glyph}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className={cx("leading-tight", compact ? "text-xs" : "text-[13px]")}>
          <span className="font-semibold text-ink-1">{who.name}</span>
          <span className="text-ink-3"> · {who.role}</span>
        </div>
        <p className={cx("mt-1 text-ink-0", compact ? "text-sm leading-relaxed" : "text-[15px] leading-relaxed")}>{typewriter ? <Typewriter text={line.line} /> : line.line}</p>
      </div>
    </div>
  );
}
