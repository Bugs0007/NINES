"use client";
/**
 * The Codex: collectible cards, earned by building concepts. Searchable. Plus your calibration profile.
 */
import Link from "next/link";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { GRAPH, TRACKS, type Track } from "@/content/graph";
import { PACKS } from "@/content/packs";
import { useGame, useRank } from "@/game/store";
import { formatUptime } from "@/game/rank";
import { Chip, cx, Panel, Segmented } from "@/ui/kit";
import { spring } from "@/ui/motion";

export function CodexHome() {
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const [tab, setTab] = useState<"cards" | "profile">("cards");
  const [q, setQ] = useState("");
  const owned = useMemo(() => PACKS.filter((p) => concepts[p.id]?.builtAt), [concepts]);
  const locked = PACKS.filter((p) => !concepts[p.id]?.builtAt);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return owned;
    return owned.filter((p) =>
      [p.title, p.codex.oneLiner, p.codex.interviewAngle, ...p.codex.keyNumbers.map((k) => `${k.label} ${k.value}`), ...p.codex.aws.map((a) => `${a.concept} ${a.service}`), ...p.codex.tradeoffs.map((t) => `${t.choice} ${t.gain} ${t.cost}`)]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [q, owned]);

  if (!hydrated) return null;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-line px-3 lg:px-5">
        <Link href="/" className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber">
          ← HQ
        </Link>
        <span className="font-display text-lg font-extrabold uppercase text-ink-0">Codex</span>
        <span className="ml-auto font-mono text-2xs text-ink-2">
          <span className="tabular text-ink-0">{owned.length}</span> cards earned · {GRAPH.filter((g) => g.kind === "concept").length} in the curriculum
        </span>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={tab} onChange={setTab} label="Codex view" options={[{ value: "cards", label: "cards" }, { value: "profile", label: "profile" }]} />
          {tab === "cards" && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search cards, numbers, AWS services…"
              aria-label="Search the codex"
              className="h-10 min-w-0 flex-1 rounded-sm border border-line-2 bg-bg-1 px-3 font-mono text-sm text-ink-0 outline-none placeholder:text-ink-3 focus:border-amber"
            />
          )}
        </div>
        {tab === "cards" ? (
          <>
            {owned.length === 0 && <p className="mt-8 text-ink-1">No cards yet. Cards are earned by building a concept in the campaign, not by reading about it.</p>}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hits.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: i * 0.03 }}>
                  <Link href={`/codex/${p.id}`} className="group block h-full rounded-sm border border-line-2 bg-bg-1 p-4 hover:border-amber-3">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">
                      <span>{GRAPH.find((g) => g.id === p.id)?.chapter.toUpperCase()}</span>
                      <span className="flex gap-1">
                        {[1, 2, 3].map((l) => (
                          <span key={l} className={cx("h-1.5 w-3 rounded-full", l <= (concepts[p.id]?.mastery ?? 0) ? "bg-phos" : "bg-line-2")} />
                        ))}
                      </span>
                    </div>
                    <div className="mt-1 font-display text-2xl font-extrabold uppercase leading-none text-ink-0 group-hover:text-amber">{p.title}</div>
                    <p className="mt-2 text-sm text-ink-1">{p.codex.oneLiner}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.codex.keyNumbers.slice(0, 2).map((k) => (
                        <Chip key={k.label} tone="muted">
                          {k.value}
                        </Chip>
                      ))}
                    </div>
                  </Link>
                </motion.div>
              ))}
              {!q &&
                locked.map((p) => (
                  <div key={p.id} className="rounded-sm border border-dashed border-line-2 p-4 opacity-60">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">locked</div>
                    <div className="mt-1 font-display text-2xl font-extrabold uppercase leading-none text-ink-3">{p.title}</div>
                    <p className="mt-2 text-sm text-ink-3">Build it in the campaign to earn this card.</p>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <Profile />
        )}
      </div>
    </div>
  );
}

function Profile() {
  const profile = useGame((s) => s.profile);
  const concepts = useGame((s) => s.concepts);
  const rank = useRank();
  const bins = (["50", "70", "90"] as const).map((k) => ({ stated: Number(k) / 100, n: profile.calibration[k].n, actual: profile.calibration[k].n ? profile.calibration[k].correct / profile.calibration[k].n : null }));
  const tracks = (["A", "B", "C", "D"] as Track[]).map((t) => {
    const nodes = GRAPH.filter((g) => g.track === t && g.kind === "concept");
    const built = nodes.filter((n) => concepts[n.id]?.builtAt).length;
    const mastered = nodes.filter((n) => (concepts[n.id]?.mastery ?? 0) >= 3).length;
    return { t, name: TRACKS[t].name, total: nodes.length, built, mastered };
  });
  const W = 260,
    H = 200,
    pad = 30;
  const x = (v: number) => pad + ((v - 0.4) / 0.6) * (W - pad - 10);
  const y = (v: number) => H - pad - v * (H - pad - 10);
  return (
    <div className="mt-5 grid gap-3 lg:grid-cols-2">
      <Panel label="calibration">
        <p className="text-sm text-ink-1">When you say you&apos;re 90% sure, are you right 90% of the time? Points on the diagonal mean your confidence is honest.</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full max-w-sm" role="img" aria-label="Calibration: stated confidence against actual accuracy">
          <line x1={x(0.4)} y1={y(0.4)} x2={x(1)} y2={y(1)} stroke="#365a66" strokeDasharray="4 3" />
          {[0.5, 0.7, 0.9].map((v) => (
            <text key={v} x={x(v)} y={H - 10} textAnchor="middle" fontSize={9} className="fill-ink-3 font-mono">
              {v * 100}%
            </text>
          ))}
          {[0, 0.5, 1].map((v) => (
            <text key={v} x={pad - 6} y={y(v) + 3} textAnchor="end" fontSize={9} className="fill-ink-3 font-mono">
              {v * 100}
            </text>
          ))}
          {bins.map((b) =>
            b.actual === null ? null : (
              <g key={b.stated}>
                <circle cx={x(b.stated)} cy={y(b.actual)} r={4 + Math.min(8, Math.sqrt(b.n))} fill={Math.abs(b.actual - b.stated) < 0.12 ? "#5cf29a" : "#ffb547"} fillOpacity={0.8} />
                <text x={x(b.stated) + 12} y={y(b.actual) + 3} fontSize={9} className="fill-ink-1 font-mono">
                  n={b.n}
                </text>
              </g>
            ),
          )}
        </svg>
        <div className="mt-2 font-mono text-2xs text-ink-2">
          {bins.map((b) => `${Math.round(b.stated * 100)}% sure → ${b.actual === null ? "no data" : `${Math.round(b.actual * 100)}% right`}`).join(" · ")}
        </div>
      </Panel>
      <Panel label="rank & mastery">
        <div className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-2">
          {rank.tierName} {rank.sub}
        </div>
        <div className="font-mono text-3xl tabular text-phos glow-phos">{formatUptime(rank.nines)}%</div>
        <div className="mt-1 font-mono text-2xs text-ink-2">
          {profile.xp} XP · best streak {profile.streak.best} · {profile.bossesBeaten.length} bosses
        </div>
        <ul className="mt-4 space-y-2">
          {tracks.map((t) => (
            <li key={t.t}>
              <div className="flex justify-between text-sm">
                <span className="text-ink-0">{t.name}</span>
                <span className="font-mono text-xs text-ink-2">
                  {t.built}/{t.total} built · {t.mastered} mastered
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-phos" style={{ width: `${(t.built / Math.max(1, t.total)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
