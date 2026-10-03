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
import { comesBackIn, CONCEPT_LEARNING } from "@/content/learning";

export interface XpLine {
  label: string;
  xp: number;
}

export function Debrief({ pack, lines, firstBuild, stars, nextHref, nextLabel }: { pack: ConceptPack; lines: XpLine[]; firstBuild: boolean; stars: number; nextHref?: string; nextLabel?: string }) {
  const total = lines.reduce((s, l) => s + l.xp, 0);
  const rank = useRank();
  const learn = CONCEPT_LEARNING[pack.id];
  const comesBack = comesBackIn(pack.id);
  useEffect(() => {
    sfx.recovery();
  }, []);
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10 lg:px-8 lg:py-14">
      <div className="flex flex-col gap-6">
        <div>
          <div className="eyebrow text-[13px] text-phos">{firstBuild ? "Service built" : "Service re-run"}</div>
          <h1 className="mt-2 text-balance font-display text-5xl font-semibold leading-[1.05] text-ink-0 sm:text-6xl">{pack.title}</h1>
          <div className="mt-3 flex gap-1.5 text-2xl" aria-label={`${stars} of 2 bonus stars`}>
            {[0, 1].map((i) => (
              <motion.span key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring.bounce, delay: 0.6 + i * 0.2 }} className={i < stars ? "text-amber" : "text-line-3"}>
                ★
              </motion.span>
            ))}
          </div>
        </div>
        {learn && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: 0.3 }} className="rounded-lg border border-phos-3/50 bg-phos-dim/25 p-5 shadow-card">
            <div className="eyebrow text-xs text-phos">Now you can</div>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-0">{learn.canDo}</p>
            <div className="eyebrow mt-4 text-xs text-ink-2">If you remember one thing</div>
            <p className="mt-1 font-display text-xl font-semibold leading-snug text-ink-0">{learn.keyIdea}</p>
            {comesBack.length > 0 && (
              <>
                <div className="eyebrow mt-4 text-xs text-ink-2">Where this comes back</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-1">{comesBack.join(" · ")}</p>
              </>
            )}
            <p className="mt-4 text-[13px] leading-relaxed text-ink-2">It joins your Daily Shift now, and comes back for review just before you&apos;d forget it.</p>
          </motion.div>
        )}
        <ul className="rounded-lg border border-line/70 bg-bg-1/75 px-5 py-2 shadow-card">
          {lines.map((l, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.soft, delay: 0.2 + i * 0.12 }}
              className="flex items-baseline justify-between gap-4 border-b border-line/60 py-3 text-sm"
            >
              <span className="min-w-0 text-ink-1">{l.label}</span>
              <span className={cx("shrink-0 font-medium tabular", l.xp > 0 ? "text-phos" : "text-ink-3")}>+{l.xp}</span>
            </motion.li>
          ))}
          <li className="flex items-baseline justify-between gap-4 py-3.5">
            <span className="text-sm font-semibold text-ink-0">Total</span>
            <Ticker value={total} format={(v) => `+${Math.round(v)} XP`} className="num-display text-2xl font-semibold text-phos" />
          </li>
        </ul>
        <div className="rounded-lg border border-line/70 bg-bg-1/75 p-5 shadow-card">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
            <span className="eyebrow text-ink-2">
              {rank.tierName} {rank.sub}
            </span>
            <span className="text-ink-3">{rank.gate ? `Gate: ${rank.gate.label}` : ""}</span>
          </div>
          <Ticker value={rank.nines} format={(v) => `${formatUptime(v)}%`} className="num-display mt-2 block text-4xl font-semibold text-phos" />
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-3">
            <motion.div className="h-full rounded-full bg-phos" initial={{ width: 0 }} animate={{ width: `${rank.progress * 100}%` }} transition={{ ...spring.soft, delay: 0.8 }} />
          </div>
          {rank.gated && <div className="mt-2.5 text-[13px] leading-relaxed text-amber">XP banked. Beat {rank.gate?.label} to open the next nine.</div>}
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-ink-2">It&apos;s on your map now, and in the review queue. Retrieval tomorrow-ish keeps the lights on.</p>
        <div className="flex flex-wrap gap-3">
          {nextHref && (
            <Link href={nextHref}>
              <Button variant="primary" size="lg">
                {nextLabel ?? "Next mission"}
              </Button>
            </Link>
          )}
          <Link href="/">
            <Button variant={nextHref ? "ghost" : "secondary"} size="lg">
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
