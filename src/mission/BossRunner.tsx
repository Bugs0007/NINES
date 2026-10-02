"use client";
/**
 * Boss fights: intro cinematic -> design + forecast your own design -> fight -> explain -> debrief (+ rank-up).
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { sfx } from "@/audio/engine";
import type { BossPack } from "@/content/schema";
import { getNode } from "@/content/graph";
import { predictionXp, type Confidence } from "@/game/scoring";
import { formatUptime, rankFromXp, TIER_NAMES } from "@/game/rank";
import { useGame, useRank } from "@/game/store";
import { CastLine } from "@/ui/Cast";
import { Cinematic } from "@/ui/Cinematic";
import { Button, Chip, cx } from "@/ui/kit";
import { GlitchText, spring, Ticker } from "@/ui/motion";
import { Slider } from "@/ui/Slider";
import { Widget } from "@/widgets/registry";
import { evalCond, formatMetric } from "@/widgets/shared";
import type { ChallengeVerdict } from "@/widgets/types";
import { ChallengePanel, ExplainPanel, RichText } from "./panels";
import { ConfidencePicker, formatNumeric } from "./PredictPanel";
import type { XpLine } from "./Debrief";
import { useMusic } from "@/audio/useMusic";
import { HonestNotes } from "@/ui/HonestNotes";

type Beat = "intro" | "fight" | "explain" | "debrief";

export function BossRunner({ boss }: { boss: BossPack }) {
  const node = getNode(boss.id);
  const store = useGame();
  const [beat, setBeat] = useState<Beat>("intro");
  const [forecast, setForecast] = useState<{ value: number; confidence: Confidence } | null>(null);
  const [fv, setFv] = useState(Math.sqrt(boss.forecast.min * boss.forecast.max));
  const [touched, setTouched] = useState(false);
  const [conf, setConf] = useState<Confidence | null>(null);
  const [verdict, setVerdict] = useState<ChallengeVerdict | null>(null);
  const [reveal, setReveal] = useState<{ actual: number; correct: boolean } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [lines, setLines] = useState<XpLine[]>([]);
  const [runKey, setRunKey] = useState(0);
  const [rankUp, setRankUp] = useState<{ from: number; to: number } | null>(null);
  const [stars, setStars] = useState(0);
  const ch = boss.challenge;
  const markSeen = useGame((s) => s.markSeen);
  const skipIntro = useGame((s) => s.hydrated && s.profile.settings.skipSeenCinematics && s.profile.seen.includes(`intro:${boss.id}`));
  if (skipIntro && beat === "intro") setBeat("fight");
  // Score during the fight: builds once the forecast is locked, resolves on a win.
  useMusic(beat === "fight" ? { root: 45, scale: "pentatonic", intensity: verdict?.won ? 0.1 : forecast ? 0.7 : 0.35 } : null);

  const onResult = async (metrics: Record<string, number>) => {
    const failed = ch.conditions.filter((c) => !evalCond(metrics[c.metric] ?? NaN, c.op, c.value));
    const won = failed.length === 0;
    setVerdict({ won, failed, metrics });
    const actual = (metrics[boss.forecast.metric] ?? 0) * boss.forecast.scale;
    if (forecast) {
      const r = forecast.value / Math.max(1e-9, actual);
      const correct = r <= boss.forecast.tolerance && r >= 1 / boss.forecast.tolerance;
      setReveal({ actual, correct });
      const xp = predictionXp(correct, forecast.confidence);
      await store.recordPrediction({ conceptId: boss.id, predictionId: "forecast", correct, confidence: forecast.confidence, xp });
      if (xp && attempts === 0) setLines((l) => [...l, { label: `Forecast of your own design (${forecast.confidence}%)`, xp }]);
    }
    if (won) {
      sfx.recovery();
      const s = ch.stars.filter((c) => evalCond(metrics[c.metric] ?? NaN, c.op, c.value)).length;
      setStars(s);
      const before = rankFromXp(store.profile.xp, new Set(store.profile.bossesBeaten));
      const xp = Math.max(0, 300 + 25 * s - Math.max(0, hints - 1) * 10);
      await store.beatBoss(boss.id, xp, { stars: s, attempts: attempts + 1 });
      await store.recordTransfer(boss.exercises);
      const after = rankFromXp(useGame.getState().profile.xp, new Set(useGame.getState().profile.bossesBeaten));
      if (after.tier > before.tier) setRankUp({ from: before.nines, to: after.nines });
      setLines((l) => [...l, { label: `Boss survived${s ? ` · ${"★".repeat(s)}` : ""}${attempts ? ` (attempt ${attempts + 1})` : ""}`, xp }]);
    } else {
      sfx.error();
      setAttempts((a) => a + 1);
    }
  };

  const retry = () => {
    setVerdict(null);
    setReveal(null);
    setRunKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-alert-3/60 bg-bg-0/90 px-3 backdrop-blur lg:px-4">
        <Link href={`/campaign/${node.chapter}`} className="eyebrow text-2xs text-ink-2 hover:text-amber">
          ← {node.chapter.toUpperCase()}
        </Link>
        <span className="h-4 w-px bg-line-2" />
        <span className="eyebrow text-2xs text-alert">boss</span>
        <span className="truncate font-display text-lg font-semibold text-ink-0">{boss.title.replace(/^Boss: /, "")}</span>
        {verdict && <Chip tone={verdict.won ? "ok" : "alert"}>{verdict.won ? "survived" : `attempt ${attempts + (verdict.won ? 0 : 0)}`}</Chip>}
      </header>

      <AnimatePresence>
        {beat === "intro" && (
          <Cinematic
            tone="alert"
            sound="alarm"
            frames={[{ kind: "title", kicker: "Boss incident", title: boss.title.replace(/^Boss: /, ""), sub: boss.hook.alert?.detail, tone: "alert", stencil: true }, ...boss.intro.map((line) => ({ kind: "line" as const, line }))]}
            onDone={() => {
              void markSeen(`intro:${boss.id}`);
              setBeat("fight");
            }}
          />
        )}
      </AnimatePresence>

      {beat === "debrief" ? (
        <BossDebrief boss={boss} lines={lines} stars={stars} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-4">
          <div className="relative min-h-[520px] lg:h-[calc(100dvh-88px)] lg:min-h-0 lg:overflow-hidden">
            <Widget
              key={runKey}
              id={ch.widget.id}
              config={ch.widget.config}
              mode="challenge"
              onResult={onResult}
              verdict={verdict}
              conditions={ch.conditions}
              runLocked={!forecast}
              locked={beat === "explain"}
            />
            <AnimatePresence>
              {reveal && forecast && verdict && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={spring.soft}
                  className={cx("absolute left-1/2 top-3 z-20 w-[min(92%,420px)] -translate-x-1/2 rounded-sm border bg-bg-1/95 p-3 shadow-2xl backdrop-blur", reveal.correct ? "border-phos-3" : "border-amber-3")}
                >
                  <div className={cx("font-display text-2xl font-semibold", reveal.correct ? "text-phos" : "text-amber")}>{reveal.correct ? "You knew your own system." : "Your system surprised you."}</div>
                  <div className="mt-1 font-mono text-xs text-ink-1">
                    forecast {formatNumeric(forecast.value, boss.forecast.unit)} · actual {formatNumeric(reveal.actual, boss.forecast.unit)} · {forecast.confidence}% sure
                  </div>
                  <button onClick={() => setReveal(null)} className="mt-2 eyebrow text-2xs text-ink-2 hover:text-amber">
                    dismiss
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <aside className="min-h-0 rounded-sm border border-line bg-bg-1/80 p-4 lg:h-[calc(100dvh-88px)] lg:overflow-y-auto">
            {beat === "explain" ? (
              <ExplainPanel concept={boss.title} eb={boss.explainBack} required onDone={async (score, how) => {
                if (how !== "skipped") {
                  const xp = Math.round(10 + 30 * score);
                  await store.log("explain", xp, { score, how }, boss.id);
                  setLines((l) => [...l, { label: `Explained the design (${Math.round(score * 100)}%)`, xp }]);
                }
                setBeat("debrief");
              }} />
            ) : (
              <div className="flex flex-col gap-4">
                <ChallengePanel
                  challenge={ch}
                  missionTitle={boss.title}
                  verdict={verdict}
                  attempts={attempts}
                  onHintUsed={setHints}
                  situation={verdict ? `Last run: ${verdict.failed.map((f) => `${f.label} failed (got ${formatMetric(f.metric, verdict.metrics[f.metric] ?? NaN)})`).join("; ") || "won"}` : "Designing, has not launched yet."}
                />
                {!forecast ? (
                  <div className="rounded-sm border border-amber-3 bg-amber-dim/20 p-3">
                    <div className="eyebrow text-2xs text-amber">Forecast your design</div>
                    <p className="mt-1 text-sm text-ink-0">{boss.forecast.prompt}</p>
                    <div className="mt-2 text-center font-mono text-2xl tabular text-amber">{touched ? formatNumeric(fv, boss.forecast.unit) : "?"}</div>
                    <Slider label="forecast" value={fv} min={boss.forecast.min} max={boss.forecast.max} log onChange={(v) => { setTouched(true); setFv(v); }} hideValue />
                    <div className="mt-2">
                      <ConfidencePicker value={conf} onChange={setConf} />
                    </div>
                    <Button className="mt-3 w-full" variant="primary" sound="latch" disabled={!touched || !conf} onClick={() => setForecast({ value: fv, confidence: conf! })}>
                      Lock the forecast
                    </Button>
                  </div>
                ) : (
                  <Chip tone="warn">
                    forecast: {formatNumeric(forecast.value, boss.forecast.unit)} · {forecast.confidence}%
                  </Chip>
                )}
                {verdict?.won && (
                  <Button variant="go" size="lg" onClick={() => setBeat("explain")}>
                    Debrief
                  </Button>
                )}
                {verdict && !verdict.won && (
                  <Button variant="secondary" onClick={retry}>
                    Redesign and try again
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      <AnimatePresence>
        {rankUp && beat === "debrief" && (
          <Cinematic
            sound="rank"
            frames={[
              { kind: "title", kicker: "Rank up · the gate is open", title: TIER_NAMES[Math.floor(rankUp.to)] ?? "", sub: `${formatUptime(rankUp.from)}% → ${formatUptime(Math.floor(rankUp.to))}%`, tone: "phos", ms: 3200 },
              { kind: "line", line: { speaker: "meera", line: "Two nines. Most of the internet is proud of this. You're just getting started." } },
            ]}
            onDone={() => setRankUp(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BossDebrief({ boss, lines, stars }: { boss: BossPack; lines: XpLine[]; stars: number }) {
  const rank = useRank();
  const total = lines.reduce((s, l) => s + l.xp, 0);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div>
          <div className="eyebrow text-2xs text-phos">Boss survived</div>
          <h1 className="font-display text-6xl font-semibold leading-none text-ink-0">
            <GlitchText text={boss.title.replace(/^Boss: /, "")} />
          </h1>
          <div className="mt-2 text-2xl" aria-label={`${stars} stars`}>
            {[0, 1].map((i) => (
              <span key={i} className={i < stars ? "text-amber glow-amber" : "text-ink-3"}>
                ★
              </span>
            ))}
          </div>
        </div>
        <ul className="space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between border-b border-line pb-1.5 font-mono text-sm">
              <span className="text-ink-1">{l.label}</span>
              <span className="tabular text-phos">+{l.xp}</span>
            </li>
          ))}
          <li className="flex justify-between pt-1 font-mono">
            <span className="text-ink-0">Total</span>
            <Ticker value={total} format={(v) => `+${Math.round(v)} XP`} className="tabular text-phos glow-phos" />
          </li>
        </ul>
        <div className="rounded-sm border border-line p-3">
          <div className="eyebrow text-2xs text-ink-2">
            {rank.tierName} {rank.sub}
          </div>
          <Ticker value={rank.nines} format={(v) => `${formatUptime(v)}%`} className="font-mono text-4xl tabular text-phos glow-phos" />
        </div>
        <div className="flex gap-2">
          <Link href="/">
            <Button variant="primary" size="lg">
              Back to HQ
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="eyebrow text-2xs text-amber">What actually saved you</div>
        {boss.debrief.map((c) => (
          <motion.div key={c.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="rounded-sm border border-line bg-bg-1 p-3">
            <RichText text={c.text} />
          </motion.div>
        ))}
        {boss.outro && <CastLine line={boss.outro} />}
        <HonestNotes notes={boss.honestPhysics} />
      </div>
    </div>
  );
}
