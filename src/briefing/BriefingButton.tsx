"use client";
import { cx } from "@/ui/kit";
import { useBriefingUi } from "./Briefing";

/** Replays the briefing. Sits in every screen's header, so the story is always one click away. */
export function BriefingButton({ className }: { className?: string }) {
  const show = useBriefingUi((s) => s.show);
  return (
    <button
      type="button"
      onClick={show}
      title="Replay the story so far: Pigeon, what's going wrong, and what you do"
      data-tour="briefing"
      className={cx("inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0", className)}
    >
      Briefing
    </button>
  );
}
