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
import { Button, cx, Led } from "@/ui/kit";
import { spring } from "@/ui/motion";
import { Widget } from "@/widgets/registry";
import { evalCond } from "@/widgets/shared";
import type { ChallengeVerdict } from "@/widgets/types";
import { Debrief, type XpLine } from "./Debrief";
import { HookScreen } from "./HookScreen";
import { ChallengePanel, DeeperSheet, ExplainPanel, MechanismPanel } from "./panels";
import { describeCall, judge, PredictPanel, type Call } from "./PredictPanel";
import { RevealOverlay } from "./RevealOverlay";
import { CONCEPT_LEARNING } from "@/content/learning";

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
        <HookScreen hook={pack.hook} title={pack.title} kicker={`Chapter ${node.chapter.toUpperCase()} · Mission`} objective={CONCEPT_LEARNING[pack.id]} onGo={() => setBeat("predict")} />
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
  // On phones the rail and the stage stack. The rail (what to do) comes first, except once a challenge
  // has run: then the stage leads, with the verdict and next step under it.
  const textFirst = beat !== "challenge" || (attempts === 0 && !verdict);
  const widgetRef = inChallenge ? challenge.widget : pack.widget;
  const mode = inChallenge ? "challenge" : beat === "predict" ? "preview" : "play";

  return (
    <Frame pack={pack} beatIdx={beatIdx} chapter={node.chapter}>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1 2xl:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 lg:p-5">
        {/* stage: grows with its content on phones, fixed to the viewport on desktop */}
        <div className={cx("relative min-h-[440px] rounded-lg lg:h-[calc(100dvh-96px)] lg:min-h-0 lg:overflow-hidden", textFirst && "order-2 lg:order-none")}>
          <div className={cx("h-full transition-[filter,opacity] duration-500", beat === "predict" && "pointer-events-none opacity-50 blur-[1.5px]")}>
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
              <span className="rounded-full border border-amber-3/50 bg-bg-1/90 px-4 py-2 text-[13px] font-medium text-amber shadow-lift">
                Make your call first <span className="lg:hidden">↑</span>
                <span className="hidden lg:inline">→</span>
              </span>
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
        <aside className={cx("min-h-0 rounded-lg border border-line/70 bg-bg-1/75 p-5 shadow-card backdrop-blur-[2px] lg:h-[calc(100dvh-96px)] lg:overflow-y-auto lg:p-6", textFirst && "order-1 lg:order-none")}>
          <AnimatePresence mode="wait">
            <motion.div key={beat + predIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring.soft}>
              {beat === "predict" && <PredictPanel p={pack.predictions[predIdx]!} index={predIdx} total={pack.predictions.length} onLock={(c) => lock(pack.predictions[predIdx]!, c)} />}
              {beat === "play" && <PlayPanel pack={pack} calls={calls} revealed={revealed} />}
              {beat === "mechanism" && (
                <MechanismPanel captions={pack.mechanism} index={capIdx} onIndex={setCapIdx} onDone={() => setBeat("challenge")} sources={pack.sources} onDeeper={() => setDeeper(true)} />
              )}
              {beat === "challenge" && (
                <ChallengePanel
                  challenge={challenge}
                  missionTitle={pack.title}
                  verdict={verdict}
                  attempts={attempts}
                  onHintUsed={setHintsUsed}
                  situation={verdict ? `Last run failed: ${verdict.failed.map((f) => `${f.label} (got ${verdict.metrics[f.metric]?.toFixed(3)})`).join("; ")}` : "Has not run yet."}
                >
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
                </ChallengePanel>
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
    <div className="flex flex-col gap-5">
      <div>
        <div className="eyebrow text-xs text-amber">Play</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-1">Your calls are locked. Now make it happen in the sim and see who was right.</p>
      </div>
      <ul className="space-y-3">
        {pack.predictions.map((p) => {
          const c = calls[p.id];
          const done = revealed.includes(p.id);
          return (
            <li key={p.id} className={cx("rounded-md border p-4 transition-colors duration-300", done ? "border-line/70 bg-bg-2/40" : "border-amber-3/50 bg-amber-dim/25")}>
              <div className="text-sm leading-relaxed text-ink-0">{p.prompt}</div>
              {c && (
                <div className="mt-2 text-[13px] text-ink-2">
                  Your call: <span className="font-medium text-amber">{describeCall(p, c.value)}</span> · <span className="tabular">{c.confidence}%</span> sure
                </div>
              )}
              <div className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-ink-1">
                <Led tone={done ? "ok" : "warn"} className="mt-[5px]" />
                {done ? (
                  <span className="text-ink-2">Revealed</span>
                ) : (
                  <span>
                    <span className="text-ink-2">Try this: </span>
                    {observeHint(p.observe)}
                  </span>
                )}
              </div>
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
  compared: "push both sides to 80%+ busy and hold it",
  "killed-both": "kill a box on each side",
  "slow-rr": "make one server slow while on round robin",
  "lor-recovers": "switch to least outstanding while a server is slow",
  "sticky-reshuffle": "use sticky routing, then change the number of boxes",
  sliced: "slice some text",
  "script-gap": "slice the Telugu or Hindi sample",
  "json-dense": "slice the JSON sample",
  strawberry: "slice 'strawberry'",
  "history-cost": "play the chat with full history past turn 20",
  forgot: "keep only the last 10 turns, then drag the chat past turn 30",
  overflow: "play full history until the window overflows",
};
function observeHint(e: string) {
  return OBSERVE_HINTS[e] ?? e.replace(/-/g, " ");
}

function Frame({ pack, beatIdx, chapter, children }: { pack: ConceptPack; beatIdx: number; chapter: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line/60 bg-bg-0/80 px-4 backdrop-blur-md lg:gap-4 lg:px-6">
        <Link
          href="/"
          className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-medium text-ink-2 transition-colors hover:bg-bg-2 hover:text-ink-0 lg:ml-0 lg:flex lg:h-auto lg:w-auto lg:px-2 lg:py-1 lg:text-[13px]"
          aria-label="Back to HQ"
        >
          <span aria-hidden>←</span>
          <span aria-hidden className="hidden lg:inline">&nbsp;HQ</span>
        </Link>
        <span className="hidden h-4 w-px shrink-0 bg-line-2 sm:block" />
        <Link href={`/campaign/${chapter}`} className="hidden shrink-0 font-mono text-xs text-ink-3 transition-colors hover:text-amber sm:inline">
          {chapter.toUpperCase()}
        </Link>
        <span className="line-clamp-2 min-w-0 font-display text-[17px] font-semibold leading-tight text-ink-0 lg:line-clamp-1 lg:text-lg">{pack.title}</span>
        {/* Gentle progress: sage dots behind you, a sand pill where you are, quiet labels ahead. */}
        <ol className="ml-auto hidden shrink-0 items-center gap-1 lg:flex" aria-label="Mission progress">
          {BEATS.map((b, i) => (
            <li key={b.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden className={cx("h-px w-3 rounded-full transition-colors duration-500", i <= beatIdx ? "bg-phos-3" : "bg-line-2")} />}
              <span
                aria-current={i === beatIdx ? "step" : undefined}
                className={cx(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-500",
                  i === beatIdx ? "bg-amber-dim text-amber ring-1 ring-inset ring-amber-3/60" : i < beatIdx ? "text-ink-2" : "text-ink-3",
                )}
              >
                <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", i === beatIdx ? "bg-amber" : i < beatIdx ? "bg-phos" : "bg-line-3")} />
                {b.label}
              </span>
            </li>
          ))}
        </ol>
        {/* Phones: a hairline of progress along the header's bottom edge, so the title keeps the room. */}
        <div
          role="progressbar"
          aria-label="Mission progress"
          aria-valuemin={1}
          aria-valuemax={BEATS.length}
          aria-valuenow={beatIdx + 1}
          aria-valuetext={`Step ${beatIdx + 1} of ${BEATS.length}: ${BEATS[beatIdx]?.label ?? ""}`}
          className="absolute inset-x-0 -bottom-px h-0.5 lg:hidden"
        >
          <div className="h-full rounded-r-full bg-phos/70 transition-[width] duration-500 ease-out" style={{ width: `${((beatIdx + 1) / BEATS.length) * 100}%` }} />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
