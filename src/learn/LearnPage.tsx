"use client";
/**
 * "How NINES teaches": the learning loop and why each step exists, what each section trains, how rank and
 * decay work, and the curriculum with what every built concept teaches and why.
 */
import Link from "next/link";
import { motion } from "motion/react";
import { CHAPTERS, GRAPH, TRACKS, type Track } from "@/content/graph";
import { CHAPTER_LEARNING, CONCEPT_LEARNING, LOOP, SECTION_LEARNING, type SectionId } from "@/content/learning";
import { hrefFor, isPlayable } from "@/content/progression";
import { useGame } from "@/game/store";
import { Chip, cx } from "@/ui/kit";
import { useReducedMotion } from "@/ui/motion";

const SECTION_LOOK: Record<SectionId, { href: string; dot: string; text: string }> = {
  campaign: { href: "/campaign/a1", dot: "bg-phos", text: "text-phos" },
  foundry: { href: "/foundry", dot: "bg-lilac", text: "text-lilac" },
  shift: { href: "/shift", dot: "bg-amber", text: "text-amber" },
  incident: { href: "/incident", dot: "bg-alert", text: "text-alert" },
  codex: { href: "/codex", dot: "bg-sky", text: "text-sky" },
  boss: { href: "/campaign/a1", dot: "bg-alert", text: "text-alert" },
};

const TRACK_TONE: Record<Track, string> = { A: "text-phos", B: "text-lilac", C: "text-sky", D: "text-amber" };

export function LearnPage() {
  const reduced = useReducedMotion();
  const concepts = useGame((s) => s.concepts);
  // Appear on load with a short stagger (not on scroll: content must never depend on an observer firing).
  const appear = (i: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0.1 : 0.5, delay: reduced ? 0 : 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <div className="min-h-dvh pb-24">
      <header className="flex h-14 items-center gap-3 border-b border-line/70 px-4 lg:px-8">
        <Link href="/" className="text-sm text-ink-2 hover:text-amber" aria-label="Back to HQ">
          ← HQ
        </Link>
        <span className="text-line-3">|</span>
        <span className="text-sm text-ink-1">How NINES teaches</span>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 lg:px-8">
        <section className="pt-12 lg:pt-16">
          <div className="eyebrow text-sm text-amber">How NINES teaches</div>
          <h1 className="mt-2 max-w-3xl font-display text-5xl font-semibold leading-[1.05] text-ink-0 sm:text-6xl">You learn systems by predicting them, breaking them, and explaining them.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-1">
            You&apos;re the first backend engineer at Pigeon, a messaging startup in Hyderabad. Every idea you learn becomes a running service on your map, and your uptime is your rank. Then NINES keeps what you learned from fading.
          </p>
        </section>

        {/* the loop */}
        <section className="mt-14">
          <h2 className="font-display text-3xl font-semibold text-ink-0">The mission loop</h2>
          <p className="mt-2 max-w-2xl text-ink-2">Every mission, in both the Campaign and the Agent Foundry, follows the same seven steps. Each one is there for a reason.</p>
          <ol className="relative mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((s, i) => (
              <motion.li key={s.step} {...appear(i)} className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-dim text-sm font-semibold text-amber">{i + 1}</span>
                  <span className="font-display text-xl font-semibold text-ink-0">{s.step}</span>
                </div>
                <p className="mt-3 text-[15px] text-ink-0">{s.what}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.why}</p>
              </motion.li>
            ))}
          </ol>
        </section>

        {/* the sections */}
        <section className="mt-16">
          <h2 className="font-display text-3xl font-semibold text-ink-0">What each part of the game trains</h2>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {(Object.keys(SECTION_LEARNING) as SectionId[]).map((id, i) => {
              const s = SECTION_LEARNING[id];
              const look = SECTION_LOOK[id];
              return (
                <motion.div key={id} {...appear(i)}>
                  <Link href={look.href} className="group block h-full rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card transition-colors hover:border-line-3 hover:bg-bg-2/70">
                    <div className="flex items-center gap-2">
                      <span className={cx("h-2 w-2 rounded-full", look.dot)} />
                      <span className="font-display text-xl font-semibold text-ink-0">{s.name}</span>
                    </div>
                    <p className="mt-2 text-[15px] text-ink-0">{s.does}</p>
                    <p className={cx("mt-3 text-sm font-medium", look.text)}>Trains · {s.trains}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{s.because}</p>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* rank and decay */}
        <section className="mt-16 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { t: "Uptime is your rank", b: "Rank is measured in nines: 90% is One Nine, 99.9% is Three Nines. Building services raises it, and each next nine is gated by a boss." },
            { t: "Forgetting shows as rust", b: "Each concept has a memory model. When it's due for review, its building on the map starts to flicker and rust, and your uptime dips until you repair it." },
            { t: "Repair in the Daily Shift", b: "A few minutes a day of mixed reviews, timed for just before you'd forget, keeps the whole map green. Streaks are kind: freeze tokens cover missed days." },
          ].map((c, i) => (
            <motion.div key={c.t} {...appear(i)} className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
              <div className="font-display text-xl font-semibold text-ink-0">{c.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{c.b}</p>
            </motion.div>
          ))}
        </section>

        {/* the curriculum */}
        <section className="mt-16">
          <h2 className="font-display text-3xl font-semibold text-ink-0">The curriculum</h2>
          <p className="mt-2 max-w-2xl text-ink-2">Four tracks, ordered by prerequisites rather than strictly in sequence. Here is what each built concept teaches and why it&apos;s worth your time.</p>
          {(["A", "B"] as Track[]).map((track) => {
            const chapters = CHAPTERS.filter((c) => c.track === track).sort((a, b) => a.order - b.order);
            const built = chapters.filter((c) => CHAPTER_LEARNING[c.id]);
            const later = chapters.filter((c) => !CHAPTER_LEARNING[c.id]);
            return (
              <div key={track} className="mt-8">
                <div className={cx("eyebrow text-sm", TRACK_TONE[track])}>
                  {TRACKS[track].district} · {TRACKS[track].name}
                </div>
                {built.map((ch) => {
                  const cl = CHAPTER_LEARNING[ch.id]!;
                  const nodes = GRAPH.filter((n) => n.chapter === ch.id && CONCEPT_LEARNING[n.id]);
                  return (
                    <motion.div key={ch.id} {...appear(0)} className="mt-3 rounded-xl border border-line/80 bg-bg-1/75 p-5 shadow-card lg:p-6">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-2xl font-semibold text-ink-0">
                          <span className="text-ink-3">{ch.id.toUpperCase()} · </span>
                          {ch.title}
                        </h3>
                        <span className="text-sm text-ink-2">{ch.stage}</span>
                      </div>
                      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-1">{cl.why}</p>
                      <ul className="mt-4 divide-y divide-line/70">
                        {nodes.map((n) => {
                          const l = CONCEPT_LEARNING[n.id]!;
                          const done = !!concepts[n.id]?.builtAt;
                          const playable = isPlayable(n.id);
                          return (
                            <li key={n.id} className="grid grid-cols-1 gap-1 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-6">
                              <div className="flex items-start gap-2">
                                {playable ? (
                                  <Link href={hrefFor(n)} className="font-medium text-ink-0 hover:text-amber">
                                    {n.title}
                                  </Link>
                                ) : (
                                  <span className="font-medium text-ink-0">{n.title}</span>
                                )}
                                {done && <Chip tone="ok">built</Chip>}
                              </div>
                              <div>
                                <p className="text-[15px] text-ink-0">{l.canDo}</p>
                                <p className="mt-1 text-sm leading-relaxed text-ink-2">{l.why}</p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 rounded-md bg-bg-2/60 p-3 text-sm leading-relaxed text-ink-1">
                        <span className="font-medium text-ink-0">Payoff · </span>
                        {cl.payoff}
                      </p>
                    </motion.div>
                  );
                })}
                {later.length > 0 && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-2">
                    <span className="text-ink-1">Later in this track: </span>
                    {later.map((c) => c.title).join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
          <p className="mt-8 text-sm leading-relaxed text-ink-2">
            <span className="text-ink-1">Also planned: </span>
            {TRACKS.C.name} ({TRACKS.C.district}), and {TRACKS.D.name} ({TRACKS.D.district}): incidents drawn from Case Intel, unlocked once you have the concepts to prove their root causes.
          </p>
        </section>

        <section className="mt-16 rounded-xl border border-line/80 bg-bg-1/75 p-6 shadow-card">
          <h2 className="font-display text-2xl font-semibold text-ink-0">The AI coach</h2>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-ink-1">
            When a key is configured, a model grades your explanations against each concept&apos;s rubric and Meera gives Socratic hints that point you at the right signal without handing over the answer. Without one, everything still works: you grade yourself against the same rubric and the hints come from the script.
          </p>
        </section>
      </main>
    </div>
  );
}
