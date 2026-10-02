"use client";
/**
 * A chapter: its missions as a small prerequisite graph, the boss at the end, side incidents alongside.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { CHAPTER_INTROS } from "@/content/chapters";
import { CHAPTERS, GRAPH, NODE_BY_ID, TRACKS, type PlannedNode } from "@/content/graph";
import { BOSS_BY_ID, PACK_BY_ID } from "@/content/packs";
import { hrefFor, isPlayable } from "@/content/progression";
import { GATES } from "@/game/rank";
import { useGame, useRank } from "@/game/store";
import { Cinematic } from "@/ui/Cinematic";
import { Button, Chip, cx, Led } from "@/ui/kit";
import { spring } from "@/ui/motion";

type State = "locked" | "available" | "built" | "blueprint";

export function ChapterView({ chapterId }: { chapterId: string }) {
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const profile = useGame((s) => s.profile);
  const markSeen = useGame((s) => s.markSeen);
  const rank = useRank();
  const ch = CHAPTERS.find((c) => c.id === chapterId)!;
  const intro = CHAPTER_INTROS[chapterId];
  const [showIntro, setShowIntro] = useState<boolean | null>(null);
  const nodes = GRAPH.filter((n) => n.chapter === chapterId);
  const done = useMemo(() => new Set([...Object.values(concepts).filter((c) => c.builtAt).map((c) => c.id), ...profile.bossesBeaten, ...profile.incidentsResolved]), [concepts, profile]);

  if (hydrated && showIntro === null) setShowIntro(!!intro && !profile.seen.includes(`intro:${chapterId}`));

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

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-line px-3 lg:px-5">
        <Link href="/" className="eyebrow text-2xs text-ink-2 hover:text-amber">
          ← HQ
        </Link>
        <span className="h-4 w-px bg-line-2" />
        <span className="eyebrow text-2xs text-ink-2">{TRACKS[ch.track].district}</span>
        <button onClick={() => setShowIntro(true)} className="ml-auto eyebrow text-2xs text-ink-3 hover:text-amber">
          replay intro
        </button>
      </header>
      <section className="mx-auto w-full max-w-5xl px-4 pb-4 pt-8">
        <div className="eyebrow text-2xs text-amber">
          Chapter {ch.id.toUpperCase()} · {ch.stage}
        </div>
        <h1 className="mt-1 font-display text-6xl font-semibold leading-none text-ink-0 sm:text-7xl">{ch.title}</h1>
        <p className="mt-2 max-w-xl text-ink-1">{ch.blurb}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-2xs text-ink-2">
          <span>
            <span className="tabular text-ink-0">{builtCount}</span> / {missions.length} services built
          </span>
          {gate && (
            <Chip tone={rank.tier > Number(gate[0]) ? "ok" : "warn"}>
              {rank.tier > Number(gate[0]) ? "gate open" : `gate to the next nine: ${gate[1].label}`}
            </Chip>
          )}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-2 px-4 pb-6">
        {missions.map((n, i) => (
          <MissionRow key={n.id} n={n} index={i + 1} state={stateOf(n)} mastery={concepts[n.id]?.mastery ?? 0} />
        ))}
        {bosses.map((n) => (
          <BossRow key={n.id} n={n} state={stateOf(n)} />
        ))}
        {side.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 eyebrow text-2xs text-ink-2">On call this chapter</div>
            {side.map((n) => (
              <MissionRow key={n.id} n={n} index={0} state={stateOf(n)} mastery={0} />
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {showIntro && intro && (
          <Cinematic
            frames={[{ kind: "title", kicker: `Chapter ${ch.id.toUpperCase()}`, title: ch.title, sub: intro.sub, stencil: true }, ...intro.lines.map((line) => ({ kind: "line" as const, line }))]}
            onDone={() => {
              setShowIntro(false);
              void markSeen(`intro:${chapterId}`);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MissionRow({ n, index, state, mastery }: { n: PlannedNode; index: number; state: State; mastery: number }) {
  const pack = PACK_BY_ID.get(n.id);
  const needs = n.prereqs.map((p) => NODE_BY_ID.get(p)?.title ?? p);
  const inner = (
    <motion.div
      whileHover={state === "available" || state === "built" ? { x: 4 } : undefined}
      transition={spring.snap}
      className={cx(
        "flex items-center gap-4 rounded-sm border p-3 sm:p-4",
        state === "available" ? "border-amber-3 bg-amber-dim/25" : state === "built" ? "border-phos-3/70 bg-bg-1" : "border-line bg-bg-1/50",
      )}
    >
      <div className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-sm border font-mono text-sm", state === "built" ? "border-phos-3 text-phos" : state === "available" ? "border-amber text-amber" : "border-line-2 text-ink-3")}>
        {n.kind === "incident" ? "INC" : String(index).padStart(2, "0")}
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx("font-display text-2xl font-semibold leading-none", state === "locked" || state === "blueprint" ? "text-ink-2" : "text-ink-0")}>{n.title}</div>
        <div className="mt-1 truncate font-mono text-2xs text-ink-2">
          {n.interaction}
          {pack ? ` · ~${pack.estimatedMinutes} min` : ""}
          {state === "locked" && needs.length ? ` · needs ${needs.join(", ")}` : ""}
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        {state === "built" && (
          <span className="flex gap-1" aria-label={`Mastery ${mastery} of 3`}>
            {[1, 2, 3].map((l) => (
              <span key={l} className={cx("h-1.5 w-4 rounded-full", l <= mastery ? "bg-phos" : "bg-line-2")} />
            ))}
          </span>
        )}
        {state === "available" && <Led tone="warn" blink />}
        <span className="eyebrow text-2xs text-ink-2">{state === "built" ? "online" : state === "available" ? "build" : state === "blueprint" ? "blueprint" : "locked"}</span>
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

function BossRow({ n, state }: { n: PlannedNode; state: State }) {
  const boss = BOSS_BY_ID.get(n.id);
  const open = state === "available" || state === "built";
  return (
    <div className={cx("mt-3 overflow-hidden rounded-sm border p-4 sm:p-5", state === "available" ? "border-alert-3 bg-alert-dim/30 shadow-glow-alert" : state === "built" ? "border-phos-3 bg-phos-dim/20" : "border-line bg-bg-1/50")}>
      <div className="eyebrow text-2xs text-alert">Boss incident</div>
      <div className="mt-1 font-display text-4xl font-semibold leading-none text-ink-0">{n.title.replace(/^Boss: /, "")}</div>
      <p className="mt-2 text-sm text-ink-1">{state === "locked" ? `Needs every service in this chapter online. ${n.prereqs.length} prerequisites.` : state === "built" ? "Survived. The gate is open." : boss ? `~${boss.estimatedMinutes} minutes. Everything from this chapter, at once, under a budget.` : "Blueprint: not yet constructed in this build."}</p>
      {open && boss && (
        <Link href={hrefFor(n)} className="mt-3 inline-block">
          <Button variant={state === "built" ? "secondary" : "danger"} size="lg">
            {state === "built" ? "Fight it again" : boss.challenge.title}
          </Button>
        </Link>
      )}
    </div>
  );
}
