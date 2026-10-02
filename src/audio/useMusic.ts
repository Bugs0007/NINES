"use client";
/**
 * Generative score for tense moments. Pass a mood to play, null to fade out. Intensity changes glide;
 * the score stops when the component unmounts. Silent until the audio context is unlocked by a gesture.
 */
import { useEffect } from "react";
import { sfx, type Mood } from "./engine";

export function useMusic(mood: Mood | null): void {
  const on = mood !== null;
  const root = mood?.root ?? 0;
  const scale = mood?.scale ?? "pentatonic";
  const intensity = mood ? Math.round(mood.intensity * 10) / 10 : 0;

  useEffect(() => {
    if (!on) {
      sfx.stopMusic();
      return;
    }
    sfx.startMusic({ root, scale, intensity });
  }, [on, root, scale, intensity]);

  useEffect(() => () => sfx.stopMusic(), []);
}
