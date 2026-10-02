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
    <details className={cx("rounded-sm border border-line p-3", className)}>
      <summary className="cursor-pointer eyebrow text-2xs text-ink-2 hover:text-amber">Honest physics · what this model leaves out</summary>
      <ul className="mt-2 space-y-1.5 text-sm text-ink-1">
        {notes.map((n, i) => (
          <li key={i}>· {n}</li>
        ))}
      </ul>
    </details>
  );
}
