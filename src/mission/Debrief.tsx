"use client";
/**
 * Debrief: what you earned, what you built, where it sits on the map.
 */
import Link from "next/link";
import { motion } from "motion/react";
import { useEffect } from "react";
import { sfx } from "@/audio/engine";
import { CodexReveal } from "@/codex/CodexCard";
import type { ConceptPack } from "@/content/schema";
import { formatUptime } from "@/game/rank";
import { useRank } from "@/game/store";
import { Button, cx } from "@/ui/kit";
import { spring, Ticker } from "@/ui/motion";

export interface XpLine {
  label: string;
  xp: number;
}

export function Debrief({ pack, lines, firstBuild, stars, nextHref, nextLabel }: { pack: ConceptPack; lines: XpLine[]; firstBuild: boolean; stars: number; nextHref?: string; nextLabel?: string }) {
  const total = lines.reduce((s, l) => s + l.xp, 0);
  const rank = useRank();
  useEffect(() => {
    sfx.recovery();
  }, []);
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col gap-5">
        <div>
          <div className="eyebrow text-2xs text-phos">{firstBuild ? "Service built" : "Service re-run"}</div>
          <h1 className="font-display text-5xl font-semibold leading-none text-ink-0 sm:text-6xl">{pack.title}</h1>
          <div className="mt-2 flex gap-1 text-2xl" aria-label={`${stars} of 2 bonus stars`}>
            {[0, 1].map((i) => (
              <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.bounce, delay: 0.6 + i * 0.2 }} className={i < stars ? "text-amber glow-amber" : "text-ink-3"}>
                ★
              </motion.span>
            ))}
          </div>
        </div>
        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring.soft, delay: 0.2 + i * 0.12 }} className="flex justify-between border-b border-line pb-1.5 font-mono text-sm">
              <span className="text-ink-1">{l.label}</span>
              <span className={cx("tabular", l.xp > 0 ? "text-phos" : "text-ink-3")}>+{l.xp}</span>
            </motion.li>
          ))}
          <li className="flex justify-between pt-1 font-mono text-base">
            <span className="text-ink-0">Total</span>
            <Ticker value={total} format={(v) => `+${Math.round(v)} XP`} className="tabular text-phos glow-phos" />
          </li>
        </ul>
        <div className="rounded-sm border border-line p-3">
          <div className="flex items-baseline justify-between eyebrow text-2xs text-ink-2">
            <span>
              {rank.tierName} {rank.sub}
            </span>
            <span>{rank.gate ? `gate: ${rank.gate.label}` : ""}</span>
          </div>
          <Ticker value={rank.nines} format={(v) => `${formatUptime(v)}%`} className="font-mono text-3xl tabular text-phos glow-phos" />
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div className="h-full bg-phos" initial={{ width: 0 }} animate={{ width: `${rank.progress * 100}%` }} transition={{ ...spring.soft, delay: 0.8 }} />
          </div>
          {rank.gated && <div className="mt-1.5 text-xs text-amber">XP banked. Beat {rank.gate?.label} to open the next nine.</div>}
        </div>
        <p className="text-sm text-ink-2">It&apos;s on your map now, and in the review queue. Retrieval tomorrow-ish keeps the lights on.</p>
        <div className="flex flex-wrap gap-2">
          {nextHref && (
            <Link href={nextHref}>
              <Button variant="primary" size="lg">
                {nextLabel ?? "Next mission"}
              </Button>
            </Link>
          )}
          <Link href="/">
            <Button variant="secondary" size="lg">
              Back to HQ
            </Button>
          </Link>
        </div>
      </div>
      <div>
        <CodexReveal pack={pack} />
      </div>
    </div>
  );
}
