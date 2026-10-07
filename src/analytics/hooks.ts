"use client";
import { useEffect } from "react";
import { LEVEL_BY_ID } from "@/content/progress-model";
import { track } from "./track";

/** Report that a level screen was opened (the "started" step of the funnel). */
export function useTrackLevelStart(level: string): void {
  useEffect(() => {
    const section = LEVEL_BY_ID.get(level)?.chapter;
    if (section) track("level_started", { section, level });
  }, [level]);
}
