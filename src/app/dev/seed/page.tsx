"use client";
/**
 * Dev-only: seed IndexedDB with progress states for visual QA of the map (decay, mastery, incidents).
 */
import { useState } from "react";
import { db, freshConcept, freshProfile, type ConceptProgress } from "@/game/db";
import { newCard, rateCard, Rating } from "@/game/fsrs";
import { Button } from "@/ui/kit";

const DAY = 86_400_000;

function built(id: string, daysAgo: number, reviews: number, mastery: 1 | 2 | 3): ConceptProgress {
  const t0 = Date.now() - daysAgo * DAY;
  let card = rateCard(newCard(new Date(t0)), Rating.Good, new Date(t0));
  for (let i = 0; i < reviews; i++) card = rateCard(card, Rating.Good, new Date(t0 + (i + 1) * 3 * DAY));
  return { ...freshConcept(id), builtAt: t0, card, mastery, reviews, spacedSuccesses: reviews, transferWins: mastery === 3 ? 1 : 0 };
}

export default function Seed() {
  const [msg, setMsg] = useState("");
  const seed = async (kind: "fresh" | "decay" | "healthy") => {
    const d = db();
    await Promise.all([d.profile.clear(), d.concepts.clear(), d.events.clear()]);
    const p = freshProfile();
    if (kind !== "fresh") {
      p.xp = 1180;
      p.streak = { count: 6, best: 9, freezeTokens: 1, frozenDays: [], lastDay: undefined };
      const list: ConceptProgress[] =
        kind === "decay"
          ? [built("latency-numbers", 30, 2, 2), built("littles-law", 9, 1, 1), built("queueing-utilization", 5, 0, 1), built("scale-up-vs-out", 2, 0, 1), built("tokens", 60, 0, 1), built("processes-signals", 40, 3, 3)]
          : [built("latency-numbers", 1, 0, 1), built("littles-law", 1, 0, 1), built("tokens", 0, 0, 1)];
      await d.concepts.bulkPut(list);
    }
    await d.profile.put(p);
    setMsg(`seeded: ${kind}. Reload the HQ.`);
  };
  return (
    <main className="flex min-h-dvh flex-col items-start gap-3 p-6">
      <h1 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-2">dev · seed progress</h1>
      <div className="flex gap-2">
        <Button onClick={() => seed("fresh")}>Fresh player</Button>
        <Button onClick={() => seed("healthy")}>A few built, healthy</Button>
        <Button onClick={() => seed("decay")}>Mixed decay</Button>
      </div>
      <p className="font-mono text-xs text-phos">{msg}</p>
    </main>
  );
}
