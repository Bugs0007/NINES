"use client";
/**
 * HQ: live uptime, rank, today's shift, and the infrastructure map.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHAPTERS, GRAPH, NODE_BY_ID, TRACKS } from "@/content/graph";
import { hrefFor, isPlayable, lockReason, nextStep, type NextStep } from "@/content/progression";
import { PACK_BY_ID } from "@/content/packs";
import { gameNow } from "@/game/clock";
import { formatUptime, MAX_NINES, TIER_NAMES } from "@/game/rank";
import { dueConcepts, istDay, useGame, useLive } from "@/game/store";
import { sfx } from "@/audio/engine";
import { Chip, cx, Led, LinkButton, Tip } from "@/ui/kit";
import { spring, Ticker, useReducedMotion } from "@/ui/motion";
import { InfraMap, lotInfo, type LotInfo } from "./InfraMap";
import { BriefingButton } from "@/briefing/BriefingButton";
import { useSignInUi } from "@/account/ui";
import { HqTour } from "@/tour/Tour";
import { useAccount } from "@/game/account";
import { getSection, sectionForTrack, type SectionId } from "@/content/sections";

export function HQ() {
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const profile = useGame((s) => s.profile);
  const live = useLive();
  const [selected, setSelected] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const built = useMemo(() => new Set(Object.values(concepts).filter((c) => c.builtAt).map((c) => c.id)), [concepts]);
  const beaten = useMemo(() => new Set([...profile.bossesBeaten, ...profile.incidentsResolved]), [profile.bossesBeaten, profile.incidentsResolved]);
  const rMap = useMemo(() => new Map(live.health.map((h) => [h.id, h.r])), [live.health]);
  const now = gameNow().getTime();
  const infos = useMemo(
    () => new Map(GRAPH.map((n) => [n.id, lotInfo(n, concepts, built, beaten, (x) => rMap.get(x), now)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [concepts, built, beaten, rMap],
  );
  const infoOf = useCallback((id: string): LotInfo => infos.get(id)!, [infos]);

  const due = useMemo(() => dueConcepts(concepts), [concepts, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useMemo(() => new Set([...built, ...beaten]), [built, beaten]);
  const step = useMemo(() => nextStep(done, due.length), [done, due.length]);
  const focusChapter = useMemo(() => {
    // Focus the first chapter with something available to do.
    for (const n of GRAPH) if (infoOf(n.id).state === "available") return n.chapter;
    return "a1";
  }, [infoOf]);

  // Rank-up / degradation sounds on arrival
  useEffect(() => {
    if (!hydrated) return;
    if (live.degraded > 0) sfx.setLoad(0.15);
    return () => sfx.stopLoad();
  }, [hydrated, live.degraded]);

  if (!hydrated) return <Boot />;

  const rank = live.rank;
  const degraded = live.degraded;
  const liveN = live.nines;

  return (
    <div className="flex min-h-dvh flex-col">
      <HqTour ready={hydrated} />
      <TopBar />
      <NextStepCard step={step} firstTime={done.size === 0} />
      <section className="grid grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:px-8">
        {/* uptime */}
        <div data-tour="uptime" className="relative overflow-hidden rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-6">
          <div className="flex items-center justify-between gap-3 text-[13px]">
            <span className="eyebrow flex items-center gap-2 text-ink-2">
              <Led tone={degraded ? "warn" : "ok"} blink={!!degraded && !reduced} /> Uptime · live
            </span>
            <span className="font-medium text-ink-1">
              {rank.tierName} {rank.sub}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Ticker
              value={liveN}
              format={(v) => `${formatUptime(v)}%`}
              className={cx("num-display text-[clamp(2.75rem,10vw,4.75rem)] font-semibold leading-none", degraded ? "text-amber" : "text-phos")}
            />
            <div className="text-[13px] text-ink-2">
              <span className="tabular font-medium text-ink-1">{liveN.toFixed(2)}</span> nines
            </div>
          </div>
          <NinesScale earned={rank.nines} live={liveN} />
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2">
            {rank.gate ? (
              <Chip tone={rank.gated ? "warn" : "muted"}>
                Gate · {rank.gate.label}
              </Chip>
            ) : null}
            <span className="tabular">
              <span className="font-medium text-ink-0">{Math.round(rank.xpIntoTier)}</span> / {rank.xpForTier} XP toward {TIER_NAMES[rank.tier + 1] ?? "the top"}
            </span>
            {degraded > 0 && (
              <span className="tabular text-amber">
                {degraded} service{degraded === 1 ? "" : "s"} degraded (−{live.debt.toFixed(2)} nines until repaired)
              </span>
            )}
          </div>
        </div>
        {/* shift */}
        <ShiftCard due={due.length} built={built.size} streak={profile.streak.count} tokens={profile.streak.freezeTokens} lastDay={profile.streak.lastDay} />
      </section>

      <section data-tour="map" className="relative mx-4 mt-4 flex min-h-[420px] flex-1 overflow-hidden rounded-lg border border-line/70 shadow-card lg:mx-8">
        <InfraMap className="h-[62dvh] min-h-[420px] w-full lg:h-auto" info={infoOf} selected={selected} onSelect={(id) => {
          if (id) sfx.select();
          setSelected(id);
        }} focusChapter={focusChapter} />
        <Legend />
        <AnimatePresence>{selected && <LotPanel id={selected} info={infoOf(selected)} done={done} r={rMap.get(selected)} due={due.some((d) => d.id === selected)} onClose={() => setSelected(null)} onSelect={setSelected} />}</AnimatePresence>
      </section>

      <Dock />
      <ServiceList infoOf={infoOf} onSelect={setSelected} />
    </div>
  );
}

function Boot() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center">
        <div className="font-display text-5xl font-semibold text-ink-0">
          Nine<span className="text-phos">s</span>
        </div>
        <div className="mt-2 text-[13px] text-ink-3">restoring state…</div>
      </div>
    </div>
  );
}

function TopBar() {
  const acct = useAccount();
  const showSignIn = useSignInUi((u) => u.show);
  const link = "inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0";
  return (
    <header className="flex h-14 shrink-0 items-center gap-0.5 border-b border-line/70 px-4 sm:gap-1 lg:gap-3 lg:px-8">
      <span className="mr-auto font-display text-2xl font-semibold text-ink-0">
        Nine<span className="text-phos">s</span>
        <span className="ml-3 hidden font-body text-[13px] font-normal text-ink-3 md:inline">Pigeon · ops console</span>
      </span>
      <Link href="/learn" className={cx(link, "max-sm:hidden")} title="How the game teaches, and why each part exists">
        How NINES teaches
      </Link>
      <BriefingButton />
      {acct.status === "guest" && (
        <button type="button" onClick={() => showSignIn("manual")} aria-label="Save progress" className={cx(link, "text-amber hover:text-amber-2")} title="Sign in to keep your progress and use it on another device">
          <span className="sm:hidden">Save</span>
          <span className="hidden sm:inline">Save progress</span>
        </button>
      )}
      <Link href="/settings" className={cx(link, "-mr-2")}>
        Settings
      </Link>
    </header>
  );
}

function NextStepCard({ step, firstTime }: { step: NextStep; firstTime: boolean }) {
  return (
    <section data-tour="next-step" aria-label="Your next step" className="mx-4 mt-4 lg:mx-8">
      <div className="flex flex-col gap-4 rounded-lg border border-amber-3/70 bg-amber-dim/30 p-4 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="eyebrow text-xs text-amber">{firstTime ? "Start here" : "Next step"}</div>
          <div className="mt-1 font-display text-2xl font-semibold leading-tight text-ink-0">{step.title}</div>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-1">
            {step.why}
            {step.minutes ? <span className="text-ink-2"> About {step.minutes} min.</span> : null}
          </p>
        </div>
        <LinkButton href={step.href} variant="primary" size="lg" className="w-full shrink-0 sm:w-auto">
          {step.cta}
        </LinkButton>
      </div>
    </section>
  );
}

function NinesScale({ earned, live }: { earned: number; live: number }) {
  const pos = (n: number) => ((n - 1) / (MAX_NINES - 1)) * 100;
  const labels = ["90%", "99%", "99.9%", "99.99%", "99.999%"];
  return (
    <div className="mt-5" aria-hidden>
      <div className="relative h-1.5 rounded-full bg-line">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-phos/75" initial={{ width: 0 }} animate={{ width: `${pos(live)}%` }} transition={spring.soft} />
        {earned > live && <div className="absolute inset-y-0 rounded-full bg-amber/60" style={{ left: `${pos(live)}%`, width: `${pos(earned) - pos(live)}%` }} />}
        {[2, 3, 4].map((n) => (
          <span key={n} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-line-3/80" style={{ left: `${pos(n)}%` }} />
        ))}
      </div>
      <div className="relative mt-2 h-4 text-[11px] tabular text-ink-3">
        {labels.map((l, i) => (
          <span key={l} className={cx("absolute", i === 0 ? "left-0" : i === 4 ? "right-0" : "-translate-x-1/2")} style={i > 0 && i < 4 ? { left: `${pos(i + 1)}%` } : undefined}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShiftCard({ due, built, streak, tokens, lastDay }: { due: number; built: number; streak: number; tokens: number; lastDay?: string }) {
  const minutes = Math.max(6, Math.min(15, due * 1.4 + 5));
  const doneToday = lastDay === istDay();
  return (
    <div className="flex flex-col justify-between gap-5 rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card sm:p-6">
      <div>
        <div className="eyebrow text-[13px] text-amber" title={getSection("daily-shift").label}>Daily Shift</div>
        <div className="mt-2 font-display text-[1.75rem] font-semibold leading-tight text-ink-0 sm:text-3xl">
          {built === 0 ? "No services in rotation yet" : due > 0 ? `${due} service${due === 1 ? " needs" : "s need"} attention` : doneToday ? "Shift complete" : "All systems nominal"}
        </div>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-1">
          {built === 0
            ? "Today's shift is an estimation drill. Then go build your first service."
            : `${due > 0 ? `${Math.min(8, due)} repair${Math.min(8, due) === 1 ? "" : "s"}, ` : ""}one micro-challenge, one estimation drill. About ${Math.round(minutes)} minutes.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <LinkButton href="/shift" variant={due > 0 ? "primary" : "secondary"} size="lg" title={getSection("daily-shift").label}>
          {doneToday ? "Run another shift" : "Start shift"}
        </LinkButton>
        <span className="ml-auto text-[13px] tabular text-ink-3" title="Daily shift streak">
          Streak {streak}
          {tokens ? ` · ${tokens} freeze token${tokens === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, React.ReactNode][] = [
    ["Online", <span key="o" className="inline-block h-2.5 w-2.5 rounded-[4px] border border-phos-2 bg-phos/35" />],
    ["Decaying", <span key="d" className="inline-block h-2.5 w-2.5 rounded-[4px] border border-amber-2 bg-amber/25" />],
    ["Incident", <span key="i" className="inline-block h-2.5 w-2.5 rounded-[4px] border border-alert-2 bg-alert/30" />],
    ["Ready to build", <span key="a" className="inline-block h-2.5 w-2.5 rounded-[4px] border border-dashed border-amber" />],
    ["Blueprint", <span key="b" className="inline-block h-2.5 w-2.5 rounded-[4px] border border-dashed border-line-3" />],
  ];
  return (
    <div className="pointer-events-none absolute left-4 top-3 hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-full bg-bg-0/55 px-3 py-1.5 text-xs text-ink-2 backdrop-blur-sm sm:flex">
      {items.map(([l, i]) => (
        <span key={l} className="flex items-center gap-1.5 whitespace-nowrap">
          {i}
          {l}
        </span>
      ))}
    </div>
  );
}

function LotPanel({ id, info, done, r, due, onClose, onSelect }: { id: string; info: LotInfo; done: ReadonlySet<string>; r?: number; due: boolean; onClose: () => void; onSelect: (id: string) => void }) {
  const n = NODE_BY_ID.get(id)!;
  const ch = CHAPTERS.find((c) => c.id === n.chapter)!;
  const concepts = useGame((s) => s.concepts);
  const c = concepts[id];
  const pack = PACK_BY_ID.get(id);
  const dueIn = c?.card ? Math.round((new Date(c.card.due).getTime() - gameNow().getTime()) / 86_400_000) : null;
  const status =
    info.state === "built"
      ? info.health === "online"
        ? "Online"
        : info.health === "incident"
          ? "Incident: memory of this is fading fast"
          : "Degraded: due for a review"
      : info.state === "available"
        ? "Ready to build"
        : info.state === "blueprint"
          ? "Blueprint: not yet constructed in this build"
          : "Locked";
  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={spring.soft}
      className="absolute inset-x-3 bottom-3 z-10 max-h-[70%] overflow-y-auto rounded-lg border border-line-2/80 bg-bg-1/95 p-5 shadow-lift backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[360px]"
      role="dialog"
      aria-label={n.title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="pt-1 text-xs text-ink-2">
          {sectionForTrack(n.track)?.name ?? TRACKS[n.track].district} · {ch.title} · {n.kind}
        </div>
        <Tip label="Close" side="left" className="-mr-2 -mt-2 shrink-0">
          <button onClick={onClose} aria-label="Close this panel" title="Close" className="grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0">
            ✕
          </button>
        </Tip>
      </div>
      <h3 className="mt-1 font-display text-2xl font-semibold leading-tight text-ink-0">{n.title}</h3>
      <div className={cx("mt-1.5 text-[13px] font-medium", info.state === "built" ? (info.health === "online" ? "text-phos" : info.health === "incident" ? "text-alert" : "text-amber") : info.state === "available" ? "text-amber" : "text-ink-2")}>{status}</div>
      {info.state === "built" && r !== undefined && (
        <div className="mt-4 grid grid-cols-3 gap-2 rounded-md bg-bg-2/60 px-3 py-2.5 text-xs text-ink-2">
          <div>
            Recall<span className="mt-0.5 block text-[15px] font-medium tabular text-ink-0">{Math.round(r * 100)}%</span>
          </div>
          <div>
            Review<span className="mt-0.5 block text-[15px] font-medium tabular text-ink-0">{dueIn === null ? "—" : dueIn <= 0 ? "now" : `in ${dueIn}d`}</span>
          </div>
          <div>
            Mastery<span className="mt-0.5 block text-[15px] font-medium text-ink-0">{["—", "Built", "Hardened", "Mastered"][info.mastery ?? 1]}</span>
          </div>
        </div>
      )}
      {(info.state === "locked" || info.state === "blueprint") && lockReason(id, done) && (
        <p className="mt-3 rounded-md border border-line-2/70 bg-bg-2/50 px-3 py-2 text-[13px] leading-relaxed text-ink-1">{lockReason(id, done)}</p>
      )}
      <p className="mt-4 text-sm leading-relaxed text-ink-1">Signature: {n.interaction}.</p>
      {n.prereqs.length > 0 && (
        <div className="mt-4">
          <div className="eyebrow text-xs text-ink-2">Needs</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {n.prereqs.map((p) => (
              <button key={p} onClick={() => onSelect(p)} className="rounded-full border border-line-2 bg-bg-2/50 px-2.5 py-0.5 text-left text-xs text-ink-1 transition-colors duration-200 hover:border-amber-3 hover:text-amber">
                {NODE_BY_ID.get(p)?.title ?? p}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {due && (
          <LinkButton href={`/shift?focus=${id}`} variant="primary">
            Repair now
          </LinkButton>
        )}
        {(info.state === "available" || (info.state === "built" && isPlayable(id))) && (
          <LinkButton href={hrefFor(n)} variant={info.state === "available" ? "primary" : "secondary"}>
            {info.state === "available" ? "Build it" : "Replay mission"}
          </LinkButton>
        )}
        {info.state === "built" && pack && (
          <LinkButton href={`/codex/${id}`} variant="ghost">
            Codex card
          </LinkButton>
        )}
      </div>
    </motion.aside>
  );
}

const DOCK: { id: SectionId; dot: string }[] = [
  { id: "core-grid", dot: "bg-phos" },
  { id: "agent-foundry", dot: "bg-lilac" },
  { id: "incident-room", dot: "bg-alert" },
  { id: "codex", dot: "bg-sky" },
];

function Dock() {
  return (
    <nav aria-label="Sections" data-tour="dock" className="sticky bottom-0 z-20 mt-4 grid grid-cols-4 gap-0.5 border-t border-line/70 bg-bg-0/90 px-1.5 py-1.5 backdrop-blur sm:gap-1 sm:px-2 sm:py-2 lg:px-8">
      {DOCK.map(({ id, dot }) => {
        const s = getSection(id);
        return (
          <Link key={id} href={s.href} title={s.label} className="group flex min-h-12 flex-col items-center justify-center rounded-md px-0.5 py-1.5 text-center transition-colors duration-200 hover:bg-bg-2/80 sm:px-1 sm:py-2">
            <div className="flex flex-col items-center gap-1.5 whitespace-nowrap text-xs font-medium leading-tight text-ink-0 transition-colors duration-200 group-hover:text-amber sm:flex-row sm:gap-2 sm:font-display sm:text-lg sm:font-semibold">
              <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
              {s.name}
            </div>
            <div className="mt-0.5 hidden text-xs text-ink-3 sm:block">{s.area}</div>
          </Link>
        );
      })}
    </nav>
  );
}

/** Keyboard/screen-reader path through the map: a plain list of what's built and what's next. */
function ServiceList({ infoOf, onSelect }: { infoOf: (id: string) => LotInfo; onSelect: (id: string) => void }) {
  const rows = GRAPH.filter((n) => {
    const s = infoOf(n.id).state;
    return s === "built" || s === "available";
  });
  return (
    <details className="mx-4 mb-4 mt-4 rounded-lg border border-line/70 bg-bg-1/50 px-4 py-3 lg:mx-8">
      <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink-0">
        Services list (<span className="tabular">{rows.length}</span>)
      </summary>
      <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((n) => {
          const i = infoOf(n.id);
          return (
            <li key={n.id}>
              <button onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-ink-1 transition-colors duration-200 hover:bg-bg-2 hover:text-ink-0">
                <Led tone={i.state === "available" ? "info" : i.health === "online" ? "ok" : i.health === "incident" ? "alert" : "warn"} />
                <span className="min-w-0 truncate">{n.title}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">{i.state === "available" ? "ready" : i.health}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
