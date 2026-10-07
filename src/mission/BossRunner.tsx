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
import { Button, Chip, cx, LinkButton } from "@/ui/kit";
import { useTrackLevelStart } from "@/analytics/hooks";
import { spring, Ticker } from "@/ui/motion";
import { Slider } from "@/ui/Slider";
import { Widget } from "@/widgets/registry";
import { evalCond, formatMetric } from "@/widgets/shared";
import type { ChallengeVerdict } from "@/widgets/types";
import { ChallengePanel, ExplainPanel, RichText } from "./panels";
import { ConfidencePicker, formatNumeric, WAITING_PRIMARY } from "./PredictPanel";
import type { XpLine } from "./Debrief";
import { useMusic } from "@/audio/useMusic";
import { HonestNotes } from "@/ui/HonestNotes";
import { SectionIntro } from "@/intro/SectionIntro";
import { bossIntro } from "@/intro/specs";

type Beat = "intro" | "fight" | "explain" | "debrief";

export function BossRunner({ boss }: { boss: BossPack }) {
  useTrackLevelStart(boss.id);
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

  // Phones stack the rail and the stage: the brief and forecast lead until the first launch, the explanation after.
  const textFirst = beat === "explain" || (attempts === 0 && !verdict);

  const retry = () => {
    setVerdict(null);
    setReveal(null);
    setRunKey((k) => k + 1);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-alert-3/35 bg-bg-0/80 px-4 backdrop-blur-md lg:gap-4 lg:px-6">
        <Link href={`/campaign/${node.chapter}`} className="shrink-0 rounded-full px-2 py-1 text-[13px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink-0">
          ← <span className="font-mono text-xs">{node.chapter.toUpperCase()}</span>
        </Link>
        <span className="h-4 w-px shrink-0 bg-line-2" />
        <Chip tone="alert" className="shrink-0">
          Boss
        </Chip>
        <span className="min-w-0 truncate font-display text-lg font-semibold text-ink-0">{boss.title.replace(/^Boss: /, "")}</span>
        {verdict && (
          <Chip tone={verdict.won ? "ok" : "alert"} className="ml-auto shrink-0">
            {verdict.won ? "Survived" : <span className="tabular">Attempt {attempts + (verdict.won ? 0 : 0)}</span>}
          </Chip>
        )}
      </header>

      <AnimatePresence>
        {beat === "intro" && bossIntro(boss.id) && (
          <SectionIntro
            spec={bossIntro(boss.id)!}
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
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5 lg:p-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className={cx("relative min-h-[520px] rounded-lg lg:h-[calc(100dvh-96px)] lg:min-h-0 lg:overflow-hidden", textFirst && "order-2 lg:order-none")}>
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
          </div>
          <aside className={cx("min-h-0 rounded-lg border border-line/70 bg-bg-1/75 p-5 shadow-card backdrop-blur-[2px] lg:h-[calc(100dvh-96px)] lg:overflow-y-auto lg:p-6", textFirst && "order-1 lg:order-none")}>
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
              <ChallengePanel
                challenge={ch}
                missionTitle={boss.title}
                verdict={verdict}
                attempts={attempts}
                onHintUsed={setHints}
                situation={verdict ? `Last run: ${verdict.failed.map((f) => `${f.label} failed (got ${formatMetric(f.metric, verdict.metrics[f.metric] ?? NaN)})`).join("; ") || "won"}` : "Designing, has not launched yet."}
              >
                {!forecast ? (
                  <div className="rounded-md border border-amber-3/50 bg-amber-dim/25 p-4">
                    <div className="eyebrow text-xs text-amber">Forecast your design</div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-0">{boss.forecast.prompt}</p>
                    <div className={cx("num-display my-3 text-center text-4xl font-semibold", touched ? "text-amber" : "text-ink-3")}>{touched ? formatNumeric(fv, boss.forecast.unit) : "?"}</div>
                    <Slider label="Forecast" value={fv} min={boss.forecast.min} max={boss.forecast.max} log onChange={(v) => { setTouched(true); setFv(v); }} hideValue />
                    <div className="mt-4">
                      <ConfidencePicker value={conf} onChange={setConf} />
                    </div>
                    <Button className={cx("mt-4 w-full", WAITING_PRIMARY)} variant="primary" size="lg" sound="latch" disabled={!touched || !conf} onClick={() => setForecast({ value: fv, confidence: conf! })}>
                      Lock the forecast
                    </Button>
                  </div>
                ) : reveal && verdict ? (
                  // The forecast result sits in the rail, under the verdict, instead of over the stage.
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.soft, delay: 0.15 }}
                    className={cx("rounded-md border p-4", reveal.correct ? "border-phos-3/60 bg-phos-dim/30" : "border-amber-3/60 bg-amber-dim/25")}
                  >
                    <div className="eyebrow text-xs text-ink-2">Your forecast</div>
                    <div className={cx("mt-1 font-display text-xl font-semibold leading-snug", reveal.correct ? "text-phos" : "text-amber")}>{reveal.correct ? "You knew your own system." : "Your system surprised you."}</div>
                    <div className="mt-2 text-[13px] tabular leading-relaxed text-ink-1">
                      Forecast <span className="font-medium text-ink-0">{formatNumeric(forecast.value, boss.forecast.unit)}</span> · actual{" "}
                      <span className="font-medium text-ink-0">{formatNumeric(reveal.actual, boss.forecast.unit)}</span> · {forecast.confidence}% sure
                    </div>
                  </motion.div>
                ) : (
                  <Chip tone="warn" className="self-start">
                    <span className="tabular">
                      Forecast: {formatNumeric(forecast.value, boss.forecast.unit)} · {forecast.confidence}%
                    </span>
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
              </ChallengePanel>
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
    <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-10 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:py-14">
      <div className="flex flex-col gap-6">
        <div>
          <div className="eyebrow text-[13px] text-phos">Boss survived</div>
          <h1 className="mt-2 text-balance font-display text-5xl font-semibold leading-[1.05] text-ink-0 sm:text-6xl">
            <motion.span className="inline-block" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
              {boss.title.replace(/^Boss: /, "")}
            </motion.span>
          </h1>
          <div className="mt-3 flex gap-1.5 text-2xl" aria-label={`${stars} stars`}>
            {[0, 1].map((i) => (
              <span key={i} className={i < stars ? "text-amber" : "text-line-3"}>
                ★
              </span>
            ))}
          </div>
        </div>
        <ul className="rounded-lg border border-line/70 bg-bg-1/75 px-5 py-2 shadow-card">
          {lines.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-4 border-b border-line/60 py-3 text-sm">
              <span className="min-w-0 text-ink-1">{l.label}</span>
              <span className="shrink-0 font-medium tabular text-phos">+{l.xp}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 py-3.5">
            <span className="text-sm font-semibold text-ink-0">Total</span>
            <Ticker value={total} format={(v) => `+${Math.round(v)} XP`} className="num-display text-2xl font-semibold text-phos" />
          </li>
        </ul>
        <div className="rounded-lg border border-line/70 bg-bg-1/75 p-5 shadow-card">
          <div className="eyebrow text-xs text-ink-2">
            {rank.tierName} {rank.sub}
          </div>
          <Ticker value={rank.nines} format={(v) => `${formatUptime(v)}%`} className="num-display mt-2 block text-4xl font-semibold text-phos" />
        </div>
        <div className="flex gap-3">
          <LinkButton href="/" variant="primary" size="lg">
              Back to HQ
            </LinkButton>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="eyebrow text-[13px] text-amber">What actually saved you</div>
        {boss.debrief.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.soft, delay: 0.1 + i * 0.08 }}
            className="rounded-lg border border-line/70 bg-bg-1/75 p-5 shadow-card"
          >
            <RichText text={c.text} />
          </motion.div>
        ))}
        {boss.outro && <CastLine line={boss.outro} />}
        <HonestNotes notes={boss.honestPhysics} />
      </div>
    </div>
  );
}
