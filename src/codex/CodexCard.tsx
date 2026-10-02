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
    <article className={cx("relative overflow-hidden rounded-sm border border-line-2 bg-bg-1", className)}>
      <header className="relative border-b border-line-2 bg-bg-2 px-4 pb-3 pt-3">
        <div className="flex items-center justify-between eyebrow text-[11px] text-ink-2">
          <span>
            {node ? `${TRACKS[node.track].district} · ${node.chapter.toUpperCase()}` : "codex"}
          </span>
          <span className="flex items-center gap-1" aria-label={`Mastery: ${MASTERY[mastery]}`}>
            {[1, 2, 3].map((l) => (
              <span key={l} className={cx("h-1.5 w-4 rounded-full", l <= mastery ? "bg-phos shadow-[0_0_6px_rgb(143_212_178/0.7)]" : "bg-line-2")} />
            ))}
          </span>
        </div>
        <h3 className="mt-1 font-display text-3xl font-semibold leading-none text-ink-0">{pack.title}</h3>
        <p className="mt-2 text-[15px] leading-snug text-ink-0">{c.oneLiner}</p>
      </header>
      <div className={cx("grid gap-4 p-4", compact ? "" : "md:grid-cols-2")}>
        <section>
          <h4 className="eyebrow text-[11px] text-amber">Key numbers</h4>
          <dl className="mt-1.5 space-y-1">
            {c.keyNumbers.map((k, i) => {
              const src = pack.sources.find((s) => s.id === k.sourceId);
              return (
                <div key={i} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1 text-sm">
                  <dt className="text-ink-1">{k.label}</dt>
                  <dd className="shrink-0 font-mono tabular text-ink-0">
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
          <h4 className="eyebrow text-[11px] text-amber">Tradeoffs</h4>
          <ul className="mt-1.5 space-y-2 text-sm">
            {c.tradeoffs.map((t, i) => (
              <li key={i}>
                <div className="text-ink-0">{t.choice}</div>
                <div className="text-xs text-phos">+ {t.gain}</div>
                <div className="text-xs text-alert">− {t.cost}</div>
              </li>
            ))}
          </ul>
        </section>
        {!compact && (
          <>
            <section>
              <h4 className="eyebrow text-[11px] text-amber">Where you&apos;ve seen it</h4>
              <ul className="mt-1.5 space-y-1 text-sm text-ink-1">
                {c.seenIn.map((s, i) => (
                  <li key={i}>· {s}</li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="eyebrow text-[11px] text-amber">Interview angle</h4>
              <p className="mt-1.5 text-sm text-ink-1">{c.interviewAngle}</p>
            </section>
            {c.aws.length > 0 && (
              <section className="md:col-span-2">
                <h4 className="eyebrow text-[11px] text-amber">On AWS</h4>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {c.aws.map((a, i) => (
                    <Chip key={i} tone="default">
                      {a.concept} → <span className="text-ink-0">{a.service}</span>
                    </Chip>
                  ))}
                </div>
                {c.otherClouds && <p className="mt-1.5 font-mono text-[11px] text-ink-3">{c.otherClouds}</p>}
              </section>
            )}
          </>
        )}
      </div>
      {onReplay && (
        <footer className="flex items-center justify-between border-t border-line px-4 py-2">
          <span className="font-mono text-[11px] text-ink-3">{pack.sources.length} sources</span>
          <button onClick={onReplay} className="eyebrow text-2xs text-amber hover:underline">
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
          className="absolute inset-0 grid place-items-center rounded-sm border border-amber-3 bg-bg-2 grid-paper"
        >
          <div className="text-center">
            <div className="eyebrow text-2xs text-amber">Codex card</div>
            <div className="font-display text-5xl font-semibold text-ink-0">Unlocked</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
