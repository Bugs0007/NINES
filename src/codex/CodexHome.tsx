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
import { PALETTE } from "@/ui/palette";
import { PageBar } from "@/ui/Shell";
import { useIntro } from "@/intro/useIntro";
import { SECTION_INTROS } from "@/intro/specs";

export function CodexHome() {
  const intro = useIntro(SECTION_INTROS.codex);
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
      {intro.node}
      <PageBar
        backHref="/"
        backLabel="HQ"
        title="Codex"
        right={
          <span className="text-[13px] tabular text-ink-2">
            <span className="font-medium text-ink-0">{owned.length}</span> cards earned<span className="hidden sm:inline"> · {GRAPH.filter((g) => g.kind === "concept").length} in the curriculum</span>
          </span>
        }
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={tab} onChange={setTab} label="Codex view" options={[{ value: "cards", label: "Cards" }, { value: "profile", label: "Profile" }]} />
          {tab === "cards" && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search cards, numbers, AWS services…"
              aria-label="Search the codex"
              className="h-11 min-w-0 flex-1 basis-56 rounded-sm border border-line-2/80 bg-bg-1/75 px-4 text-sm text-ink-0 outline-none transition-colors duration-200 placeholder:text-ink-3 focus:border-amber-3"
            />
          )}
        </div>
        {tab === "cards" ? (
          <>
            {owned.length === 0 && <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-ink-1">No cards yet. Cards are earned by building a concept in the campaign, not by reading about it.</p>}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hits.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.soft, delay: i * 0.03 }}>
                  <Link href={`/codex/${p.id}`} className="group flex h-full flex-col rounded-lg border border-line/80 bg-bg-1/75 p-5 shadow-card transition-colors duration-200 hover:border-sky-3/70">
                    <div className="flex items-center justify-between text-xs text-ink-3">
                      <span className="font-semibold tabular">{GRAPH.find((g) => g.id === p.id)?.chapter.toUpperCase()}</span>
                      <span className="flex gap-1">
                        {[1, 2, 3].map((l) => (
                          <span key={l} className={cx("h-1.5 w-3 rounded-full", l <= (concepts[p.id]?.mastery ?? 0) ? "bg-phos/80" : "bg-line-2")} />
                        ))}
                      </span>
                    </div>
                    <div className="mt-2 font-display text-xl font-semibold leading-tight text-ink-0 transition-colors duration-200 group-hover:text-sky">{p.title}</div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-1">{p.codex.oneLiner}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                      {p.codex.keyNumbers.slice(0, 2).map((k) => (
                        <Chip key={k.label} tone="muted" className="tabular">
                          {k.value}
                        </Chip>
                      ))}
                    </div>
                  </Link>
                </motion.div>
              ))}
              {!q &&
                locked.map((p) => (
                  <div key={p.id} className="rounded-lg border border-dashed border-line-2/70 p-5">
                    <div className="text-xs text-ink-3">Locked</div>
                    <div className="mt-2 font-display text-xl font-semibold leading-tight text-ink-2">{p.title}</div>
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
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel label="Calibration">
        <p className="max-w-prose text-sm leading-relaxed text-ink-1">When you say you&apos;re 90% sure, are you right 90% of the time? Points on the diagonal mean your confidence is honest.</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full max-w-sm" role="img" aria-label="Calibration: stated confidence against actual accuracy">
          <line x1={x(0.4)} y1={y(0.4)} x2={x(1)} y2={y(1)} stroke={PALETTE.line3} strokeDasharray="4 3" />
          {[0.5, 0.7, 0.9].map((v) => (
            <text key={v} x={x(v)} y={H - 10} textAnchor="middle" fontSize={10} className="fill-ink-3 tabular">
              {v * 100}%
            </text>
          ))}
          {[0, 0.5, 1].map((v) => (
            <text key={v} x={pad - 6} y={y(v) + 3} textAnchor="end" fontSize={10} className="fill-ink-3 tabular">
              {v * 100}
            </text>
          ))}
          {bins.map((b) =>
            b.actual === null ? null : (
              <g key={b.stated}>
                <circle cx={x(b.stated)} cy={y(b.actual)} r={4 + Math.min(8, Math.sqrt(b.n))} fill={Math.abs(b.actual - b.stated) < 0.12 ? PALETTE.phos : PALETTE.amber} fillOpacity={0.75} />
                <text x={x(b.stated) + 12} y={y(b.actual) + 3} fontSize={10} className="fill-ink-1 tabular">
                  n={b.n}
                </text>
              </g>
            ),
          )}
        </svg>
        <div className="mt-3 text-[13px] tabular text-ink-2">
          {bins.map((b) => `${Math.round(b.stated * 100)}% sure → ${b.actual === null ? "no data" : `${Math.round(b.actual * 100)}% right`}`).join(" · ")}
        </div>
      </Panel>
      <Panel label="Rank and mastery">
        <div className="text-[13px] font-medium text-ink-1">
          {rank.tierName} {rank.sub}
        </div>
        <div className="num-display mt-1 text-4xl font-semibold text-phos">{formatUptime(rank.nines)}%</div>
        <div className="mt-2 text-[13px] tabular text-ink-2">
          {profile.xp} XP · best streak {profile.streak.best} · {profile.bossesBeaten.length} bosses
        </div>
        <ul className="mt-6 space-y-4">
          {tracks.map((t) => (
            <li key={t.t}>
              <div className="flex flex-wrap justify-between gap-x-3 text-sm">
                <span className="text-ink-0">{t.name}</span>
                <span className="text-xs tabular text-ink-2">
                  {t.built}/{t.total} built · {t.mastered} mastered
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-phos/80" style={{ width: `${(t.built / Math.max(1, t.total)) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
