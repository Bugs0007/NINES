"use client";
/**
 * The recurring cast: one or two lines at a time, never more.
 */
import type { CastLine as CastLineT, Speaker } from "@/content/schema";
import { cx } from "./kit";
import { Typewriter } from "./motion";

export const CAST: Record<Speaker, { name: string; role: string; glyph: string; tone: string }> = {
  meera: { name: "Meera Iyer", role: "Principal SRE", glyph: "MI", tone: "text-phos border-phos-3 bg-phos-dim/50" },
  kabir: { name: "Kabir Sethi", role: "Founder & CEO", glyph: "KS", tone: "text-amber border-amber-3 bg-amber-dim/50" },
  rao: { name: "Mr. Rao", role: "CFO", glyph: "₹", tone: "text-alert border-alert-3 bg-alert-dim/60" },
  system: { name: "NINES", role: "System", glyph: "//", tone: "text-ink-1 border-line-2 bg-bg-2" },
  pager: { name: "PagerDuty", role: "Alert", glyph: "!!", tone: "text-alert border-alert-3 bg-alert-dim/60" },
  user: { name: "A user", role: "Support ticket", glyph: "@", tone: "text-ink-1 border-line-2 bg-bg-2" },
};

export function CastLine({ line, className, typewriter = true, compact = false }: { line: CastLineT; className?: string; typewriter?: boolean; compact?: boolean }) {
  const who = CAST[line.speaker];
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <div className={cx("grid shrink-0 place-items-center rounded-sm border font-mono font-semibold", compact ? "h-7 w-7 text-2xs" : "h-9 w-9 text-xs", who.tone)} aria-hidden>
        {who.glyph}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-2xs uppercase tracking-[0.12em] text-ink-2">
          {who.name} <span className="text-ink-3">· {who.role}</span>
        </div>
        <p className={cx("text-ink-0", compact ? "text-sm" : "text-[15px] leading-snug")}>{typewriter ? <Typewriter text={line.line} /> : line.line}</p>
      </div>
    </div>
  );
}
