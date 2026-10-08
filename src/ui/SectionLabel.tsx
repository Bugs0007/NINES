"use client";
/**
 * One place that draws a section's name: "Core Grid (System Design: …)". The text comes from
 * src/content/sections.ts, which generates it from what is built, so every screen agrees.
 */
import { useId, useState } from "react";
import { getSection, type SectionId } from "@/content/sections";
import { cx } from "./kit";

/** The label, short by default; "Details" expands the fuller breakdown. */
export function SectionLabel({ id, className, expandable = true }: { id: SectionId; className?: string; expandable?: boolean }) {
  const s = getSection(id);
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={className} title={s.label}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-medium text-ink-0">{s.name}</span>
        <span className="min-w-0 text-ink-2">({s.short})</span>
        {expandable && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={panel}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-amber transition-colors duration-200 hover:bg-amber-dim/50"
          >
            {open ? "Hide details" : "Details"}
          </button>
        )}
      </div>
      {expandable && open && (
        <div id={panel} className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-line/70 bg-bg-1/60 p-4 text-[13px] leading-relaxed text-ink-1 sm:grid-cols-2">
          {s.detail.map((d) => (
            <div key={d.heading}>
              <div className="eyebrow text-xs text-ink-2">{d.heading}</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 marker:text-ink-3">
                {d.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The one-line tie to the Pigeon story that opens a section. */
export function SectionStory({ id, className }: { id: SectionId; className?: string }) {
  const s = getSection(id);
  return (
    <p className={cx("text-[13px] italic leading-relaxed text-ink-2", className)}>
      <span className="font-medium not-italic text-ink-1">{s.department}</span> · {s.story}
    </p>
  );
}

/** Label plus story line, for the top of a section's main screen. */
export function SectionHeader({ id, className }: { id: SectionId; className?: string }) {
  return (
    <div className={cx("text-[13px]", className)}>
      <SectionLabel id={id} />
      <SectionStory id={id} className="mt-1.5" />
    </div>
  );
}
