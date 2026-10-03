"use client";
/**
 * A Codex card: the only note-like thing in NINES, and it's earned.
 */
import { motion } from "motion/react";
import type { ConceptPack } from "@/content/schema";
import { NODE_BY_ID, TRACKS } from "@/content/graph";
import type { MasteryLevel } from "@/game/db";
import { Chip, cx } from "@/ui/kit";
import { spring } from "@/ui/motion";

const MASTERY = ["Unbuilt", "Built", "Hardened", "Mastered"];

export function CodexCard({ pack, mastery = 1, compact = false, onReplay, className }: { pack: ConceptPack; mastery?: MasteryLevel; compact?: boolean; onReplay?: () => void; className?: string }) {
  const node = NODE_BY_ID.get(pack.id);
  const c = pack.codex;
  return (
    <article className={cx("relative overflow-hidden rounded-lg border border-line/80 bg-bg-1/75 shadow-card", className)}>
      <header className="relative border-b border-line/70 bg-bg-2/50 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
          <span>
            {node ? `${TRACKS[node.track].district} · ${node.chapter.toUpperCase()}` : "codex"}
          </span>
          <span className="flex items-center gap-1" aria-label={`Mastery: ${MASTERY[mastery]}`}>
            {[1, 2, 3].map((l) => (
              <span key={l} className={cx("h-1.5 w-4 rounded-full", l <= mastery ? "bg-phos/80" : "bg-line-2")} />
            ))}
          </span>
        </div>
        <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-0 sm:text-3xl">{pack.title}</h3>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-1">{c.oneLiner}</p>
      </header>
      <div className={cx("grid grid-cols-1 gap-x-8 gap-y-6 p-5", compact ? "" : "md:grid-cols-2")}>
        <section>
          <h4 className="eyebrow text-xs text-sky">Key numbers</h4>
          <dl className="mt-2 space-y-1.5">
            {c.keyNumbers.map((k, i) => {
              const src = pack.sources.find((s) => s.id === k.sourceId);
              return (
                <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-line/50 pb-1.5 text-sm">
                  <dt className="min-w-0 text-ink-1">{k.label}</dt>
                  <dd className="ml-auto min-w-0 break-words text-right font-medium tabular text-ink-0">
                    {src ? (
                      <a href={src.url} target="_blank" rel="noreferrer" title={src.title} className="hover:text-amber">
                        {k.value}
                      </a>
                    ) : (
                      k.value
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
        <section>
          <h4 className="eyebrow text-xs text-sky">Tradeoffs</h4>
          <ul className="mt-2 space-y-3 text-sm">
            {c.tradeoffs.map((t, i) => (
              <li key={i}>
                <div className="font-medium text-ink-0">{t.choice}</div>
                <div className="mt-1 grid grid-cols-[1rem_minmax(0,1fr)] gap-y-0.5 text-[13px] leading-snug text-ink-1">
                  <span aria-hidden className="text-phos">+</span>
                  <span>
                    <span className="sr-only">Gain: </span>
                    {t.gain}
                  </span>
                  <span aria-hidden className="text-alert/80">−</span>
                  <span>
                    <span className="sr-only">Cost: </span>
                    {t.cost}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
        {!compact && (
          <>
            <section>
              <h4 className="eyebrow text-xs text-sky">Where you&apos;ve seen it</h4>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-ink-1 marker:text-ink-3">
                {c.seenIn.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="eyebrow text-xs text-sky">Interview angle</h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-1">{c.interviewAngle}</p>
            </section>
            {c.aws.length > 0 && (
              <section className="md:col-span-2">
                <h4 className="eyebrow text-xs text-sky">On AWS</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.aws.map((a, i) => (
                    <Chip key={i} tone="default">
                      {a.concept} → <span className="text-ink-0">{a.service}</span>
                    </Chip>
                  ))}
                </div>
                {c.otherClouds && <p className="mt-2 text-xs text-ink-3">{c.otherClouds}</p>}
              </section>
            )}
          </>
        )}
      </div>
      {onReplay && (
        <footer className="flex items-center justify-between gap-3 border-t border-line/70 px-5 py-3">
          <span className="text-xs tabular text-ink-3">{pack.sources.length} sources</span>
          <button onClick={onReplay} className="-mr-2 inline-flex h-8 items-center rounded-full px-3 text-[13px] font-semibold text-amber transition-colors duration-200 hover:bg-amber-dim/60">
            ▶ Replay the sim
          </button>
        </footer>
      )}
    </article>
  );
}

/** Card flip from the back (unlocked!) to the front. */
export function CodexReveal({ pack }: { pack: ConceptPack }) {
  return (
    <div className="[perspective:1400px]">
      <motion.div initial={{ rotateY: 180, scale: 0.9 }} animate={{ rotateY: 0, scale: 1 }} transition={{ ...spring.heavy, delay: 0.4 }} style={{ transformStyle: "preserve-3d" }} className="relative">
        <div style={{ backfaceVisibility: "hidden" }}>
          <CodexCard pack={pack} compact />
        </div>
        <div
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          className="absolute inset-0 grid place-items-center rounded-lg border border-sky-3/60 bg-bg-2 grid-paper"
        >
          <div className="text-center">
            <div className="eyebrow text-[13px] text-sky">Codex card</div>
            <div className="mt-1 font-display text-4xl font-semibold text-ink-0">Unlocked</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
