"use client";
/**
 * HQ: live uptime, rank, today's shift, and the infrastructure map.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHAPTERS, GRAPH, NODE_BY_ID, TRACKS } from "@/content/graph";
import { hrefFor, isPlayable } from "@/content/progression";
import { PACK_BY_ID } from "@/content/packs";
import { gameNow } from "@/game/clock";
import { formatUptime, MAX_NINES, TIER_NAMES } from "@/game/rank";
import { dueConcepts, istDay, useGame, useLive } from "@/game/store";
import { sfx } from "@/audio/engine";
import { Button, Chip, cx, Led } from "@/ui/kit";
import { spring, Ticker, useReducedMotion } from "@/ui/motion";
import { InfraMap, lotInfo, type LotInfo } from "./InfraMap";

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
      <TopBar streak={profile.streak.count} tokens={profile.streak.freezeTokens} />
      <section className="grid grid-cols-1 gap-3 px-3 pt-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:px-5">
        {/* uptime */}
        <div className="relative overflow-hidden rounded-sm border border-line bg-bg-1/80 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-ink-2">
            <span className="flex items-center gap-2">
              <Led tone={degraded ? "warn" : "ok"} blink={!!degraded && !reduced} /> Uptime · live
            </span>
            <span>
              {rank.tierName} {rank.sub}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
            <Ticker
              value={liveN}
              format={(v) => `${formatUptime(v)}%`}
              className={cx("font-mono text-[clamp(3rem,11vw,5.5rem)] font-medium leading-none tabular", degraded ? "text-amber glow-amber" : "text-phos glow-phos")}
            />
            <div className="pb-2 font-mono text-xs text-ink-2">
              <span className="tabular text-ink-1">{liveN.toFixed(2)}</span> nines
            </div>
          </div>
          <NinesScale earned={rank.nines} live={liveN} />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            {rank.gate ? (
              <Chip tone={rank.gated ? "warn" : "muted"}>
                gate · {rank.gate.label}
              </Chip>
            ) : null}
            <span className="font-mono text-xs text-ink-2">
              <span className="tabular text-ink-0">{Math.round(rank.xpIntoTier)}</span> / {rank.xpForTier} XP toward {TIER_NAMES[rank.tier + 1] ?? "the top"}
            </span>
            {degraded > 0 && (
              <span className="font-mono text-xs text-amber">
                · {degraded} service{degraded === 1 ? "" : "s"} degraded (−{live.debt.toFixed(2)} nines until repaired)
              </span>
            )}
          </div>
        </div>
        {/* shift */}
        <ShiftCard due={due.length} built={built.size} streak={profile.streak.count} tokens={profile.streak.freezeTokens} lastDay={profile.streak.lastDay} />
      </section>

      <section className="relative mx-3 mt-3 flex min-h-[420px] flex-1 overflow-hidden rounded-sm border border-line lg:mx-5">
        <InfraMap className="h-[62dvh] min-h-[420px] w-full lg:h-auto" info={infoOf} selected={selected} onSelect={(id) => {
          if (id) sfx.select();
          setSelected(id);
        }} focusChapter={focusChapter} />
        <Legend />
        <AnimatePresence>{selected && <LotPanel id={selected} info={infoOf(selected)} r={rMap.get(selected)} due={due.some((d) => d.id === selected)} onClose={() => setSelected(null)} onSelect={setSelected} />}</AnimatePresence>
      </section>

      <Dock />
      <ServiceList infoOf={infoOf} onSelect={setSelected} />
    </div>
  );
}

function Boot() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="text-center font-mono text-2xs uppercase tracking-[0.3em] text-ink-3">
        <div className="font-display text-6xl font-extrabold tracking-tight text-phos glow-phos">NINES</div>
        restoring state…
      </div>
    </div>
  );
}

function TopBar({ streak, tokens }: { streak: number; tokens: number }) {
  return (
    <header className="flex h-12 items-center gap-3 border-b border-line px-3 lg:px-5">
      <span className="font-display text-2xl font-extrabold uppercase tracking-tight text-ink-0">
        Nine<span className="text-phos">s</span>
      </span>
      <span className="hidden font-mono text-2xs uppercase tracking-[0.18em] text-ink-3 sm:inline">Pigeon · ops console</span>
      <div className="ml-auto flex items-center gap-3 font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">
        <span title="Daily shift streak">
          streak <span className="tabular text-ink-0">{streak}</span>
          {tokens > 0 && <span className="text-amber"> · {tokens} freeze</span>}
        </span>
        <Link href="/settings" className="hover:text-amber" aria-label="Settings">
          settings
        </Link>
      </div>
    </header>
  );
}

function NinesScale({ earned, live }: { earned: number; live: number }) {
  const pos = (n: number) => ((n - 1) / (MAX_NINES - 1)) * 100;
  const labels = ["90%", "99%", "99.9%", "99.99%", "99.999%"];
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-2 rounded-full bg-line">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-phos/80" initial={{ width: 0 }} animate={{ width: `${pos(live)}%` }} transition={spring.soft} />
        {earned > live && <div className="absolute inset-y-0 rounded-full bg-amber/70" style={{ left: `${pos(live)}%`, width: `${pos(earned) - pos(live)}%` }} />}
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-line-3" style={{ left: `${pos(n)}%` }} />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 font-mono text-[10px] text-ink-3">
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
    <div className="flex flex-col justify-between gap-3 rounded-sm border border-line bg-bg-1/80 p-4 sm:p-5">
      <div>
        <div className="font-mono text-2xs uppercase tracking-[0.18em] text-ink-2">Daily shift</div>
        <div className="mt-1 font-display text-3xl font-extrabold uppercase leading-none text-ink-0">
          {built === 0 ? "No services in rotation yet" : due > 0 ? `${due} service${due === 1 ? " needs" : "s need"} attention` : doneToday ? "Shift complete" : "All systems nominal"}
        </div>
        <p className="mt-2 text-sm text-ink-1">
          {built === 0
            ? "Today's shift is an estimation drill. Then go build your first service."
            : `${due > 0 ? `${Math.min(8, due)} repair${Math.min(8, due) === 1 ? "" : "s"}, ` : ""}one micro-challenge, one estimation drill. About ${Math.round(minutes)} minutes.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/shift">
          <Button variant={due > 0 ? "primary" : "secondary"} size="lg">
            {doneToday ? "Run another shift" : "Start shift"}
          </Button>
        </Link>
        <Link href="/campaign/a1">
          <Button variant="ghost" size="lg">
            Campaign
          </Button>
        </Link>
        <span className="ml-auto font-mono text-2xs text-ink-3">
          streak {streak}
          {tokens ? ` · ${tokens} freeze token${tokens === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}

function Legend() {
  const items: [string, React.ReactNode][] = [
    ["online", <span key="o" className="inline-block h-2.5 w-2.5 rounded-[1px] border border-phos-2 bg-phos/40" />],
    ["decaying", <span key="d" className="inline-block h-2.5 w-2.5 rounded-[1px] border border-amber-2 bg-amber/30" />],
    ["incident", <span key="i" className="inline-block h-2.5 w-2.5 rounded-[1px] border border-alert bg-alert/40" />],
    ["ready to build", <span key="a" className="inline-block h-2.5 w-2.5 rounded-[1px] border border-dashed border-amber" />],
    ["blueprint", <span key="b" className="inline-block h-2.5 w-2.5 rounded-[1px] border border-dashed border-line-3" />],
  ];
  return (
    <div className="pointer-events-none absolute left-3 top-3 hidden flex-col gap-1 rounded-sm border border-line bg-bg-1/85 p-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2 sm:flex">
      {items.map(([l, i]) => (
        <span key={l} className="flex items-center gap-2">
          {i}
          {l}
        </span>
      ))}
    </div>
  );
}

function LotPanel({ id, info, r, due, onClose, onSelect }: { id: string; info: LotInfo; r?: number; due: boolean; onClose: () => void; onSelect: (id: string) => void }) {
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
      className="absolute inset-x-2 bottom-2 z-10 max-h-[70%] overflow-y-auto rounded-sm border border-line-2 bg-bg-1/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:w-[340px]"
      role="dialog"
      aria-label={n.title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">
          {TRACKS[n.track].district} · {ch.title} · {n.kind}
        </div>
        <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 grid h-8 w-8 place-items-center text-ink-2 hover:text-ink-0">
          ✕
        </button>
      </div>
      <h3 className="font-display text-2xl font-extrabold uppercase leading-none text-ink-0">{n.title}</h3>
      <div className={cx("mt-2 font-mono text-xs", info.state === "built" ? (info.health === "online" ? "text-phos" : info.health === "incident" ? "text-alert" : "text-amber") : info.state === "available" ? "text-amber" : "text-ink-2")}>{status}</div>
      {info.state === "built" && r !== undefined && (
        <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-2xs text-ink-2">
          <div>
            recall<span className="block text-sm tabular text-ink-0">{Math.round(r * 100)}%</span>
          </div>
          <div>
            review<span className="block text-sm tabular text-ink-0">{dueIn === null ? "—" : dueIn <= 0 ? "now" : `in ${dueIn}d`}</span>
          </div>
          <div>
            mastery<span className="block text-sm text-ink-0">{["—", "Built", "Hardened", "Mastered"][info.mastery ?? 1]}</span>
          </div>
        </div>
      )}
      <p className="mt-2 text-sm text-ink-1">Signature: {n.interaction}.</p>
      {n.prereqs.length > 0 && (
        <div className="mt-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">needs</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {n.prereqs.map((p) => (
              <button key={p} onClick={() => onSelect(p)} className="rounded-sm border border-line-2 px-1.5 py-0.5 text-left text-xs text-ink-1 hover:border-amber hover:text-amber">
                {NODE_BY_ID.get(p)?.title ?? p}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {due && (
          <Link href={`/shift?focus=${id}`}>
            <Button variant="primary">Repair now</Button>
          </Link>
        )}
        {(info.state === "available" || (info.state === "built" && isPlayable(id))) && (
          <Link href={hrefFor(n)}>
            <Button variant={info.state === "available" ? "primary" : "secondary"}>{info.state === "available" ? "Build it" : "Replay mission"}</Button>
          </Link>
        )}
        {info.state === "built" && pack && (
          <Link href={`/codex/${id}`}>
            <Button variant="ghost">Codex card</Button>
          </Link>
        )}
      </div>
    </motion.aside>
  );
}

function Dock() {
  const links = [
    { href: "/campaign/a1", label: "Campaign", sub: "Launch Day" },
    { href: "/foundry", label: "Agent Foundry", sub: "Tokens & Context" },
    { href: "/incident", label: "Incident Room", sub: "on-call" },
    { href: "/codex", label: "Codex", sub: "earned cards" },
  ];
  return (
    <nav aria-label="Modes" className="sticky bottom-0 z-20 mt-3 grid grid-cols-4 gap-px border-t border-line bg-line">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="group bg-bg-0/95 px-2 py-2.5 text-center backdrop-blur hover:bg-bg-2">
          <div className="font-display text-base font-extrabold uppercase leading-none text-ink-0 group-hover:text-amber sm:text-lg">{l.label}</div>
          <div className="mt-0.5 hidden font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 sm:block">{l.sub}</div>
        </Link>
      ))}
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
    <details className="mx-3 mb-3 mt-3 rounded-sm border border-line p-3 lg:mx-5">
      <summary className="cursor-pointer font-mono text-2xs uppercase tracking-[0.16em] text-ink-2">Services list ({rows.length})</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((n) => {
          const i = infoOf(n.id);
          return (
            <li key={n.id}>
              <button onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-ink-1 hover:bg-bg-2 hover:text-ink-0">
                <Led tone={i.state === "available" ? "info" : i.health === "online" ? "ok" : i.health === "incident" ? "alert" : "warn"} />
                {n.title}
                <span className="ml-auto font-mono text-[10px] uppercase text-ink-3">{i.state === "available" ? "ready" : i.health}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
