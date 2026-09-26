"use client";
/**
 * The Mission Runner: plays any Concept Pack through
 * HOOK -> PREDICT -> PLAY (+ REVEAL) -> MECHANISM -> CHALLENGE -> EXPLAIN -> DEBRIEF.
 */
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sfx } from "@/audio/engine";
import type { ConceptPack, Prediction } from "@/content/schema";
import { getNode } from "@/content/graph";
import { challengeXp, explainXp, predictionXp, type Confidence } from "@/game/scoring";
import { useGame } from "@/game/store";
import { Button, Chip, cx } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { Widget } from "@/widgets/registry";
import { evalCond } from "@/widgets/shared";
import type { ChallengeVerdict } from "@/widgets/types";
import { Debrief, type XpLine } from "./Debrief";
import { HookScreen } from "./HookScreen";
import { ChallengePanel, DeeperSheet, ExplainPanel, MechanismPanel } from "./panels";
import { describeCall, judge, PredictPanel, type Call } from "./PredictPanel";
import { RevealOverlay } from "./RevealOverlay";

type Beat = "hook" | "predict" | "play" | "mechanism" | "challenge" | "explain" | "debrief";
const BEATS: { id: Beat; label: string }[] = [
  { id: "hook", label: "Hook" },
  { id: "predict", label: "Predict" },
  { id: "play", label: "Play" },
  { id: "mechanism", label: "Why" },
  { id: "challenge", label: "Challenge" },
  { id: "explain", label: "Explain" },
  { id: "debrief", label: "Debrief" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function MissionRunner({ pack, next }: { pack: ConceptPack; next?: { href: string; label: string } }) {
  const node = getNode(pack.id);
  const store = useGame();
  const built = !!store.concepts[pack.id]?.builtAt;
  const [beat, setBeat] = useState<Beat>("hook");
  const [predIdx, setPredIdx] = useState(0);
  const [calls, setCalls] = useState<Record<string, Call>>({});
  const [revealed, setRevealed] = useState<string[]>([]);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [capIdx, setCapIdx] = useState(0);
  const [deeper, setDeeper] = useState(false);
  const [verdict, setVerdict] = useState<ChallengeVerdict | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [xpLines, setXpLines] = useState<XpLine[]>([]);
  const [runKey, setRunKey] = useState(0);
  const [firstBuild, setFirstBuild] = useState(false);
  const [stars, setStars] = useState(0);
  const pendingObs = useRef<Set<string>>(new Set());

  const challenge = pack.challenges[0]!;
  // Explain-it-back is required on first build for about half the missions, optional otherwise.
  const explainRequired = !built && hash(pack.id) % 2 === 0;

  const calledValues = useMemo(() => Object.fromEntries(Object.entries(calls).map(([k, v]) => [k, v.value])), [calls]);

  // ---- predictions
  const lock = async (p: Prediction, call: Call) => {
    setCalls((c) => ({ ...c, [p.id]: call }));
    if (predIdx + 1 < pack.predictions.length) setPredIdx(predIdx + 1);
    else {
      setBeat("play");
      // Observations that already happened (rare) reveal immediately.
      for (const e of pendingObs.current) onObserve(e);
    }
  };

  const onObserve = useCallback(
    (event: string) => {
      pendingObs.current.add(event);
      if (beat !== "play") return;
      const p = pack.predictions.find((x) => x.observe === event && !revealed.includes(x.id));
      if (p && calls[p.id] && !revealing) setRevealing(p.id);
    },
    [beat, pack.predictions, revealed, calls, revealing],
  );

  const finishReveal = async () => {
    const p = pack.predictions.find((x) => x.id === revealing)!;
    const call = calls[p.id]!;
    const { correct } = judge(p, call.value);
    const xp = predictionXp(correct, call.confidence);
    await store.recordPrediction({ conceptId: pack.id, predictionId: p.id, correct, confidence: call.confidence, xp });
    if (xp > 0) setXpLines((l) => [...l, { label: `Prediction: ${correct ? "called it" : "missed"} (${call.confidence}%)`, xp }]);
    const nextRevealed = [...revealed, p.id];
    setRevealed(nextRevealed);
    setRevealing(null);
    // Chain the next pending observation, or move on to the mechanism once everything is revealed.
    const nextP = pack.predictions.find((x) => !nextRevealed.includes(x.id) && pendingObs.current.has(x.observe));
    if (nextP) setRevealing(nextP.id);
    else if (nextRevealed.length === pack.predictions.length) {
      setBeat("mechanism");
      sfx.whoosh();
    }
  };

  // ---- challenge
  const onResult = async (metrics: Record<string, number>) => {
    const failed = challenge.conditions.filter((c) => !evalCond(metrics[c.metric] ?? NaN, c.op, c.value));
    const won = failed.length === 0;
    const v = { won, failed, metrics };
    setVerdict(v);
    if (won) {
      const s = challenge.stars.filter((c) => evalCond(metrics[c.metric] ?? NaN, c.op, c.value)).length;
      setStars(s);
      sfx.recovery();
      const hintPenalty = Math.max(0, hintsUsed - 1) * 10;
      const cxp = Math.max(0, challengeXp(true, s) - hintPenalty);
      const clean = attempts === 0 && hintsUsed <= 1 && Object.entries(calls).every(([id, c]) => judge(pack.predictions.find((p) => p.id === id)!, c.value).correct);
      const res = await store.completeMission({ conceptId: pack.id, stars: s, xp: cxp, cleanRun: clean });
      setFirstBuild(res.firstBuild);
      setXpLines((l) => [...l, { label: `Challenge won${s ? ` · ${"★".repeat(s)}` : ""}${hintPenalty ? ` (−${hintPenalty} hints)` : ""}`, xp: cxp }]);
    } else {
      sfx.error();
      setAttempts((a) => a + 1);
    }
  };

  const onExplained = async (score: number, how: "claude" | "self" | "skipped") => {
    if (how !== "skipped") {
      const xp = explainXp(score);
      await store.log("explain", xp, { score, how }, pack.id);
      setXpLines((l) => [...l, { label: `Explained it back (${Math.round(score * 100)}%${how === "self" ? ", self-graded" : ""})`, xp }]);
    }
    setBeat("debrief");
  };

  // Enter the challenge fresh.
  useEffect(() => {
    if (beat === "challenge") setVerdict(null);
  }, [beat]);

  const scene = beat === "mechanism" ? pack.mechanism[capIdx]?.scene ?? null : null;
  const beatIdx = BEATS.findIndex((b) => b.id === beat);

  if (beat === "hook") {
    return (
      <Frame pack={pack} beatIdx={beatIdx} chapter={node.chapter}>
        <HookScreen hook={pack.hook} title={pack.title} kicker={`${node.chapter.toUpperCase()} · mission`} onGo={() => setBeat("predict")} />
      </Frame>
    );
  }
  if (beat === "debrief") {
    return (
      <Frame pack={pack} beatIdx={beatIdx} chapter={node.chapter}>
        <Debrief pack={pack} lines={xpLines} firstBuild={firstBuild} stars={stars} nextHref={next?.href} nextLabel={next?.label} />
      </Frame>
    );
  }

  const inChallenge = beat === "challenge" || beat === "explain";
  const widgetRef = inChallenge ? challenge.widget : pack.widget;
  const mode = inChallenge ? "challenge" : beat === "predict" ? "preview" : "play";

  return (
    <Frame pack={pack} beatIdx={beatIdx} chapter={node.chapter}>
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(420px,62dvh)_auto] gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-1 lg:p-4">
        {/* stage */}
        <div className="relative min-h-0 overflow-hidden rounded-sm lg:h-[calc(100dvh-88px)]">
          <div className={cx("h-full transition-[filter,opacity] duration-300", beat === "predict" && "pointer-events-none opacity-60 blur-[1px]")}>
            <Widget
              key={`${inChallenge ? "ch" : "play"}-${runKey}`}
              id={widgetRef.id}
              config={widgetRef.config}
              mode={mode}
              scene={scene}
              calls={calledValues}
              onObserve={onObserve}
              onResult={onResult}
              verdict={verdict}
              conditions={inChallenge ? challenge.conditions : undefined}
              locked={beat === "predict" || beat === "explain"}
            />
          </div>
          {beat === "predict" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <Chip tone="warn">make your call first →</Chip>
            </div>
          )}
          <AnimatePresence>
            {revealing &&
              (() => {
                const p = pack.predictions.find((x) => x.id === revealing)!;
                const call = calls[p.id]!;
                const j = judge(p, call.value);
                return <RevealOverlay key={p.id} p={p} call={call} correct={j.correct} detail={j.detail} xp={predictionXp(j.correct, call.confidence as Confidence)} onDone={finishReveal} />;
              })()}
          </AnimatePresence>
        </div>

        {/* rail */}
        <aside className="min-h-0 overflow-y-auto rounded-sm border border-line bg-bg-1/80 p-4 lg:h-[calc(100dvh-88px)]">
          <AnimatePresence mode="wait">
            <motion.div key={beat + predIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.soft}>
              {beat === "predict" && <PredictPanel p={pack.predictions[predIdx]!} index={predIdx} total={pack.predictions.length} onLock={(c) => lock(pack.predictions[predIdx]!, c)} />}
              {beat === "play" && <PlayPanel pack={pack} calls={calls} revealed={revealed} />}
              {beat === "mechanism" && (
                <MechanismPanel captions={pack.mechanism} index={capIdx} onIndex={setCapIdx} onDone={() => setBeat("challenge")} sources={pack.sources} onDeeper={() => setDeeper(true)} />
              )}
              {beat === "challenge" && (
                <div className="flex flex-col gap-4">
                  <ChallengePanel
                    challenge={challenge}
                    missionTitle={pack.title}
                    verdict={verdict}
                    attempts={attempts}
                    onHintUsed={setHintsUsed}
                    situation={verdict ? `Last run failed: ${verdict.failed.map((f) => `${f.label} (got ${verdict.metrics[f.metric]?.toFixed(3)})`).join("; ")}` : "Has not run yet."}
                  />
                  {verdict?.won && (
                    <Button variant="go" size="lg" onClick={() => setBeat("explain")}>
                      Collect
                    </Button>
                  )}
                  {verdict && !verdict.won && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setVerdict(null);
                        setRunKey((k) => k + 1);
                      }}
                    >
                      Reset the challenge
                    </Button>
                  )}
                </div>
              )}
              {beat === "explain" && <ExplainPanel concept={pack.title} eb={pack.explainBack} required={explainRequired} onDone={onExplained} />}
            </motion.div>
          </AnimatePresence>
        </aside>
      </div>
      <DeeperSheet open={deeper} onClose={() => setDeeper(false)} deeper={pack.deeper} honest={pack.honestPhysics} sources={pack.sources} interview={pack.interview} />
    </Frame>
  );
}

function PlayPanel({ pack, calls, revealed }: { pack: ConceptPack; calls: Record<string, Call>; revealed: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="font-mono text-2xs uppercase tracking-[0.16em] text-amber">Play</div>
      <p className="text-[15px] leading-snug text-ink-1">Your calls are locked. Now make it happen in the sim and see who was right.</p>
      <ul className="space-y-2">
        {pack.predictions.map((p) => {
          const c = calls[p.id];
          const done = revealed.includes(p.id);
          return (
            <li key={p.id} className={cx("rounded-sm border p-2.5", done ? "border-line" : "border-amber-3 bg-amber-dim/20")}>
              <div className="text-sm text-ink-0">{p.prompt}</div>
              {c && (
                <div className="mt-1 font-mono text-2xs text-ink-2">
                  your call: <span className="text-amber">{describeCall(p, c.value)}</span> · {c.confidence}% sure
                </div>
              )}
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{done ? "revealed" : `waiting for: ${observeHint(p.observe)}`}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Human description of what the player needs to do to trigger an observation. */
const OBSERVE_HINTS: Record<string, string> = {
  "over-capacity": "push arrivals past what the workers can handle",
  "little-holds": "let it run a few seconds",
  "rho-high": "drag load above 85% and hold it there",
  raced: "run the race",
  "slow-server-rr": "make one server slow under round-robin",
  "session-loss": "send logged-in users through the load balancer",
  "big-box-wins": "compare both setups at the same load",
  "sliced": "slice some text",
  "overflow": "overfill the window",
};
function observeHint(e: string) {
  return OBSERVE_HINTS[e] ?? e.replace(/-/g, " ");
}

function Frame({ pack, beatIdx, chapter, children }: { pack: ConceptPack; beatIdx: number; chapter: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b border-line bg-bg-0/90 px-3 backdrop-blur lg:px-4">
        <Link href="/" className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber" aria-label="Back to HQ">
          ← HQ
        </Link>
        <span className="h-4 w-px bg-line-2" />
        <Link href={`/campaign/${chapter}`} className="hidden font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber sm:inline">
          {chapter.toUpperCase()}
        </Link>
        <span className="truncate font-display text-lg font-extrabold uppercase tracking-tight text-ink-0">{pack.title}</span>
        <ol className="ml-auto hidden items-center gap-1 md:flex" aria-label="Mission progress">
          {BEATS.map((b, i) => (
            <li key={b.id} className={cx("rounded-[2px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]", i === beatIdx ? "bg-amber text-bg-0" : i < beatIdx ? "text-phos" : "text-ink-3")}>
              {b.label}
            </li>
          ))}
        </ol>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-ink-2 md:hidden">
          {BEATS[beatIdx]?.label} · {beatIdx + 1}/{BEATS.length}
        </span>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
