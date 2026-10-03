"use client";
/**
 * "Honest physics": where a simulation or model simplifies reality, said plainly. Hidden when the player
 * turns the notes off in Settings.
 */
import { useGame } from "@/game/store";
import { cx } from "./kit";

export function HonestNotes({ notes, className }: { notes: string[]; className?: string }) {
  const show = useGame((s) => s.profile.settings.showHonestPhysics);
  if (!show || notes.length === 0) return null;
  return (
    <details className={cx("group rounded-md border border-line/70 bg-bg-1/50 px-4 py-3", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium text-ink-2 transition-colors hover:text-ink-0 [&::-webkit-details-marker]:hidden">
        <span>Honest physics · what this model leaves out</span>
        <span aria-hidden className="text-ink-3 transition-transform duration-200 group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-1 marker:text-ink-3">
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </details>
  );
}
