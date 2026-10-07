"use client";
/**
 * A chapter: its missions as a small prerequisite graph, the boss at the end, side incidents alongside.
 */
import Link from "next/link";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { CHAPTERS, GRAPH, NODE_BY_ID, TRACKS, type PlannedNode } from "@/content/graph";
import { BOSS_BY_ID, PACK_BY_ID } from "@/content/packs";
import { CHAPTER_LEARNING, CONCEPT_LEARNING } from "@/content/learning";
import { hrefFor, isPlayable, lockReason } from "@/content/progression";
import { GATES } from "@/game/rank";
import { useGame, useRank } from "@/game/store";
import { chapterIntro } from "@/intro/specs";
import { useIntro } from "@/intro/useIntro";
import { Chip, cx, Led, LinkButton } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { PageBar } from "@/ui/Shell";
import { SectionHeader } from "@/ui/SectionLabel";
import { sectionForTrack } from "@/content/sections";

type State = "locked" | "available" | "built" | "blueprint";

export function ChapterView({ chapterId }: { chapterId: string }) {
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const profile = useGame((s) => s.profile);
  const rank = useRank();
  const ch = CHAPTERS.find((c) => c.id === chapterId)!;
  const learning = CHAPTER_LEARNING[chapterId];
  const intro = useIntro(useMemo(() => chapterIntro(chapterId), [chapterId]));
  const nodes = GRAPH.filter((n) => n.chapter === chapterId);
  const done = useMemo(() => new Set([...Object.values(concepts).filter((c) => c.builtAt).map((c) => c.id), ...profile.bossesBeaten, ...profile.incidentsResolved]), [concepts, profile]);

  const stateOf = (n: PlannedNode): State => {
    if (done.has(n.id)) return "built";
    if (!n.prereqs.every((p) => done.has(p))) return "locked";
    return isPlayable(n.id) ? "available" : "blueprint";
  };
  const missions = nodes.filter((n) => n.kind === "concept");
  const bosses = nodes.filter((n) => n.kind === "boss" || n.kind === "case");
  const side = nodes.filter((n) => n.kind === "incident" || n.kind === "field");
  const builtCount = missions.filter((n) => done.has(n.id)).length;
  const gate = Object.entries(GATES).find(([, g]) => bosses.some((b) => g.bosses.includes(b.id)));
  // The one thing to do next: the first mission ready to build, else the boss once it opens.
  const nextMission = missions.find((n) => stateOf(n) === "available");
  const nextBoss = nextMission ? undefined : bosses.find((n) => stateOf(n) === "available" && BOSS_BY_ID.has(n.id));
  const next = nextMission ?? nextBoss;
  const [about, setAbout] = useState(false);
  const section = sectionForTrack(ch.track);

  return (
    <div className="flex min-h-dvh flex-col">
      <PageBar
        backHref="/"
        backLabel="HQ"
        title={sectionForTrack(ch.track)?.name ?? TRACKS[ch.track].district}
        right={
          <button onClick={intro.replay} className="-mr-2 inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0">
            Replay intro
          </button>
        }
      />
      <section className="mx-auto w-full max-w-5xl px-4 pb-6 pt-8 sm:pt-12 lg:px-8">
        {section && <SectionHeader id={section.id} className="mb-8 max-w-3xl" />}
        <div className={cx("eyebrow text-[13px]", ch.track === "B" ? "text-lilac" : ch.track === "A" ? "text-phos" : "text-ink-2")}>
          Chapter {ch.id.toUpperCase()} · {ch.stage}
        </div>
        <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.05] text-ink-0 sm:text-6xl">{ch.title}</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-1">{learning?.story ?? ch.blurb}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
          <span className="tabular">
            <span className="font-medium text-ink-0">{builtCount}</span> / {missions.length} services built
          </span>
          {gate && (
            <Chip tone={rank.tier > Number(gate[0]) ? "ok" : "warn"}>
              {rank.tier > Number(gate[0]) ? "Gate open" : `Gate to the next nine: ${gate[1].label}`}
            </Chip>
          )}
        </div>
        {next && (
          <LinkButton href={hrefFor(next)} variant="primary" size="lg" className="mt-6  sm: w-full sm:w-auto">
              {nextBoss ? `Face the boss: ${next.title.replace(/^Boss: /, "")}` : `${builtCount === 0 ? "Start" : "Continue"}: ${next.title}`}
            </LinkButton>
        )}
        {learning && (
          <>
            {/* On phones the learning notes fold away so the missions sit near the top. */}
            <button
              type="button"
              onClick={() => setAbout((o) => !o)}
              aria-expanded={about}
              aria-controls="chapter-about"
              className="mt-6 flex w-full items-center justify-between gap-3 rounded-lg border border-line/80 bg-bg-1/60 px-4 py-3 text-left text-sm font-medium text-ink-1 transition-colors duration-200 hover:text-ink-0 lg:hidden"
            >
              What this chapter teaches, and why
              <svg aria-hidden viewBox="0 0 16 16" className={cx("h-4 w-4 shrink-0 text-ink-2 transition-transform duration-300", about && "rotate-180")}>
                <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div id="chapter-about" className={cx("grid-cols-1 gap-3 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]", about ? "mt-3 grid" : "hidden")}>
              <div className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
                <div className="eyebrow text-xs text-ink-2">By the end of this chapter you can</div>
                <ul className="mt-3 space-y-2">
                  {learning.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-3 text-[15px] text-ink-0">
                      <span className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", ch.track === "B" ? "bg-lilac" : "bg-phos")} />
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card">
                <div className="eyebrow text-xs text-ink-2">Why this chapter</div>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-1">{learning.why}</p>
                <div className="eyebrow mt-4 text-xs text-ink-2">The payoff</div>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{learning.payoff}</p>
                <Link href="/learn" className="mt-4 inline-block text-[13px] font-medium text-amber hover:text-amber-2">
                  How NINES teaches →
                </Link>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 px-4 pb-12 lg:px-8">
        <div className="eyebrow text-[13px] text-ink-2">Missions, in order</div>
        {missions.map((n, i) => (
          <MissionRow key={n.id} n={n} index={i + 1} state={stateOf(n)} mastery={concepts[n.id]?.mastery ?? 0} reason={lockReason(n.id, done)} />
        ))}
        {bosses.map((n) => (
          <BossRow key={n.id} n={n} state={stateOf(n)} reason={lockReason(n.id, done)} />
        ))}
        {side.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3">
            <div className="eyebrow text-[13px] text-ink-2">On call this chapter</div>
            {side.map((n) => (
              <MissionRow key={n.id} n={n} index={0} state={stateOf(n)} mastery={0} reason={lockReason(n.id, done)} />
            ))}
          </div>
        )}
      </section>

      {intro.node}
    </div>
  );
}

function MissionRow({ n, index, state, mastery, reason }: { n: PlannedNode; index: number; state: State; mastery: number; reason: string | null }) {
  const pack = PACK_BY_ID.get(n.id);
  const learn = CONCEPT_LEARNING[n.id];
  const inner = (
    <motion.div
      whileHover={state === "available" || state === "built" ? { x: 4 } : undefined}
      transition={spring.snap}
      className={cx(
        "flex items-center gap-4 rounded-lg border p-4 transition-colors duration-200 sm:px-5",
        state === "available" ? "border-amber-3/70 bg-amber-dim/30 shadow-card hover:border-amber-3" : state === "built" ? "border-line/80 bg-bg-1/75 shadow-card hover:border-line-3" : "border-line/60 bg-bg-1/35",
      )}
    >
      <div
        className={cx(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular",
          state === "built" ? "border-phos-3/60 bg-phos-dim/50 text-phos" : state === "available" ? "border-amber-3 bg-amber-dim/50 text-amber" : "border-line-2/80 text-ink-3",
        )}
      >
        {n.kind === "incident" ? "INC" : String(index).padStart(2, "0")}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx("font-display text-xl font-semibold leading-tight sm:text-[1.375rem]", state === "locked" || state === "blueprint" ? "text-ink-2" : "text-ink-0")}>{n.title}</div>
        {learn && <p className={cx("mt-1 text-[14px] leading-snug", state === "locked" || state === "blueprint" ? "text-ink-3" : "text-ink-1")}>{learn.canDo}</p>}
        <div className={cx("mt-1 truncate text-xs tabular", state === "locked" || state === "blueprint" ? "text-ink-3" : "text-ink-2")}>
          {n.interaction}
          {pack ? ` · ~${pack.estimatedMinutes} min` : ""}
        </div>
        {(state === "locked" || state === "blueprint") && reason && <div className="mt-1.5 text-[13px] leading-snug text-amber/90">{reason}</div>}
      </div>
      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        {state === "built" && (
          <span className="flex gap-1" aria-label={`Mastery ${mastery} of 3`}>
            {[1, 2, 3].map((l) => (
              <span key={l} className={cx("h-1.5 w-4 rounded-full", l <= mastery ? "bg-phos/80" : "bg-line-2")} />
            ))}
          </span>
        )}
        {state === "available" && <Led tone="warn" blink />}
        <span title={reason ?? undefined} className={cx("text-[13px] font-medium", state === "available" ? "text-amber" : state === "built" ? "text-ink-1" : "text-ink-3")}>
          {state === "built" ? "Online" : state === "available" ? "Build" : state === "blueprint" ? "Blueprint" : "Locked"}
        </span>
      </div>
    </motion.div>
  );
  return state === "available" || state === "built" ? (
    <Link href={hrefFor(n)} className="block">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function BossRow({ n, state, reason }: { n: PlannedNode; state: State; reason: string | null }) {
  const boss = BOSS_BY_ID.get(n.id);
  const learn = CONCEPT_LEARNING[n.id];
  const open = state === "available" || state === "built";
  return (
    <div className={cx("mt-3 overflow-hidden rounded-xl border p-5 sm:p-7", state === "available" ? "border-alert-3/70 bg-alert-dim/35 shadow-glow-alert" : state === "built" ? "border-phos-3/50 bg-phos-dim/25 shadow-card" : "border-line/60 bg-bg-1/35")}>
      <div className="eyebrow text-[13px] text-alert">Boss incident</div>
      <div className="mt-2 font-display text-3xl font-semibold leading-tight text-ink-0 sm:text-4xl">{n.title.replace(/^Boss: /, "")}</div>
      {learn && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-0">{learn.canDo}</p>}
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-1">{state === "locked" || state === "blueprint" ? (reason ?? "Not available yet.") : state === "built" ? "Survived. The gate is open." : boss ? `~${boss.estimatedMinutes} minutes. Everything from this chapter, at once, under a budget.` : "Blueprint: not yet constructed in this build."}</p>
      {open && boss && (
        <LinkButton href={hrefFor(n)} variant={state === "built" ? "secondary" : "danger"} size="lg" className="mt-5">
            {state === "built" ? "Fight it again" : boss.challenge.title}
          </LinkButton>
      )}
    </div>
  );
}
