"use client";
/**
 * Animated scenes for the section intros. Each is a full-bleed SVG (1600 × 900, anchored right so the
 * action sits beside the text on desktop and fills the top on phones). Motion is slow and looping;
 * with reduced motion each scene renders its settled final state.
 */
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { alpha, PALETTE as C } from "@/ui/palette";

export type SceneId = "launch" | "tokens" | "incident" | "shift" | "codex" | "bill";

interface SceneProps {
  reduced: boolean;
}

/** Deterministic pseudo-random, so scenes look the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function Frame({ children, glow }: { children: ReactNode; glow: string }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMaxYMid slice" className="h-full w-full">
      <defs>
        <radialGradient id="scene-glow" cx="78%" cy="52%" r="45%">
          <stop offset="0%" stopColor={glow} stopOpacity="0.16" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#scene-glow)" />
      {children}
    </svg>
  );
}

function Stars({ n = 40, seed = 7, reduced }: { n?: number; seed?: number; reduced: boolean }) {
  const stars = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: n }, () => ({ x: 700 + r() * 900, y: 40 + r() * 380, s: 0.8 + r() * 1.6, d: r() * 4 }));
  }, [n, seed]);
  return (
    <g>
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.s} fill={C.ink0} opacity={0.35}>
          {!reduced && <animate attributeName="opacity" values="0.15;0.55;0.15" dur={`${4 + s.d}s`} begin={`${s.d}s`} repeatCount="indefinite" />}
        </circle>
      ))}
    </g>
  );
}

/** Particles flowing along SVG paths (SMIL), or a few still dots when motion is reduced. */
function Flow({ paths, color, count = 6, dur = 2.2, r = 3.2, reduced }: { paths: string[]; color: string; count?: number; dur?: number; r?: number; reduced: boolean }) {
  return (
    <g>
      {paths.map((d, pi) => (
        <g key={pi}>
          <path d={d} fill="none" stroke={alpha(color, 0.12)} strokeWidth={2} strokeLinecap="round" />
          {Array.from({ length: count }, (_, i) =>
            reduced ? null : (
              <circle key={i} r={r} fill={color} opacity={0.85}>
                <animateMotion dur={`${dur}s`} begin={`${(i * dur) / count + pi * 0.17}s`} repeatCount="indefinite" path={d} />
              </circle>
            ),
          )}
        </g>
      ))}
    </g>
  );
}

function Skyline({ seed = 3 }: { seed?: number }) {
  const blocks = useMemo(() => {
    const r = rng(seed);
    const out: { x: number; w: number; h: number; lit: { x: number; y: number }[] }[] = [];
    let x = 560;
    while (x < 1640) {
      const w = 50 + r() * 70;
      const h = 60 + r() * 150;
      const lit: { x: number; y: number }[] = [];
      for (let yy = 900 - h + 14; yy < 880; yy += 22) for (let xx = x + 10; xx < x + w - 12; xx += 18) if (r() < 0.22) lit.push({ x: xx, y: yy });
      out.push({ x, w, h, lit });
      x += w + 8 + r() * 14;
    }
    return out;
  }, [seed]);
  return (
    <g>
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={900 - b.h} width={b.w} height={b.h + 10} rx={6} fill={C.bg2} />
          {b.lit.map((l, j) => (
            <rect key={j} x={l.x} y={l.y} width={7} height={9} rx={1.5} fill={alpha(C.amber, 0.35)} />
          ))}
        </g>
      ))}
      <rect x={0} y={895} width={1600} height={5} fill={C.bg1} />
    </g>
  );
}

function useTimeline(steps: number[], reduced: boolean, loopMs?: number): number {
  const [phase, setPhase] = useState(reduced ? steps.length : 0);
  useEffect(() => {
    if (reduced) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setPhase(0);
      steps.forEach((ms, i) => timers.push(setTimeout(() => setPhase(i + 1), ms)));
      if (loopMs) timers.push(setTimeout(run, loopMs));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return phase;
}

// ---------------------------------------------------------------- Launch Day: one box drowns, then scales out

function LaunchScene({ reduced }: SceneProps) {
  // 0: one calm server; 1: traffic surges, server strains; 2: overloaded; 3: scaled out behind a balancer
  const phase = useTimeline([1400, 2600, 3800], reduced);
  const out = phase >= 3;
  const hot = phase === 2 ? C.alert : phase === 1 ? C.amber : C.phos;
  const servers = out ? [300, 450, 600] : [450];
  const users = useMemo(() => [330, 390, 450, 510, 570], []);
  const toServer = (y: number) => `M 880 ${y} C 1050 ${y}, 1150 450, 1300 450`;
  const toLb = (y: number) => `M 880 ${y} C 980 ${y}, 1020 450, 1080 450`;
  const lbTo = (y: number) => `M 1120 450 C 1200 450, 1230 ${y}, 1330 ${y}`;
  return (
    <Frame glow={out ? C.phos : hot}>
      <Stars reduced={reduced} />
      <circle cx={1420} cy={140} r={46} fill={alpha(C.ink0, 0.07)} />
      <circle cx={1420} cy={140} r={30} fill={alpha(C.ink0, 0.12)} />
      <Skyline />
      {users.map((y, i) => (
        <circle key={i} cx={870} cy={y} r={5} fill={C.ink1} opacity={0.6} />
      ))}
      {!out && <Flow key={`a${phase}`} paths={users.map(toServer)} color={hot} count={phase === 0 ? 3 : phase === 1 ? 7 : 11} dur={phase === 2 ? 3.4 : 2.2} reduced={reduced} />}
      {out && (
        <>
          <Flow key="b1" paths={users.map(toLb)} color={C.phos} count={5} dur={1.6} reduced={reduced} />
          <Flow key="b2" paths={servers.map(lbTo)} color={C.phos} count={5} dur={1.5} reduced={reduced} />
          <motion.rect
            x={1080}
            y={420}
            width={60}
            height={60}
            rx={14}
            fill={C.bg2}
            stroke={C.sky}
            strokeWidth={2}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformOrigin: "1110px 450px" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </>
      )}
      {servers.map((y, i) => {
        const h = out ? 110 : 190;
        return (
          <motion.g key={`${out}-${i}`} initial={{ opacity: 0, y: out ? (450 - y) * 0.6 : 0 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <rect x={1330} y={y - h / 2} width={out ? 110 : 140} height={h} rx={16} fill={C.bg1} stroke={out ? C.phos : hot} strokeWidth={2} />
            {Array.from({ length: out ? 3 : 6 }, (_, k) => (
              <rect key={k} x={1350} y={y - h / 2 + 22 + k * 26} width={out ? 70 : 100} height={8} rx={4} fill={alpha(out ? C.phos : hot, phase === 2 && !out ? 0.7 : 0.35)}>
                {!reduced && phase === 2 && !out && <animate attributeName="opacity" values="0.4;1;0.4" dur="0.9s" begin={`${k * 0.1}s`} repeatCount="indefinite" />}
              </rect>
            ))}
          </motion.g>
        );
      })}
    </Frame>
  );
}

// ---------------------------------------------------------------- Agent Foundry: tokens fill a context window

const TOKEN_WIDTHS = [62, 38, 84, 46, 58, 30, 74, 52, 40, 66, 34, 56, 70, 44, 50, 36, 80, 42, 60, 48];

function TokensScene({ reduced }: SceneProps) {
  const ROWS = 11;
  const [n, setN] = useState(reduced ? 30 : 12);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setN((x) => x + 1), 380);
    return () => clearInterval(id);
  }, [reduced]);
  // lay tokens into rows inside the window, oldest at the bottom; only the newest ROWS rows fit
  const tokens = useMemo(() => {
    const out: { id: number; row: number; x: number; w: number }[] = [];
    let row = 0;
    let x = 0;
    for (let i = 0; i < n; i++) {
      const w = TOKEN_WIDTHS[i % TOKEN_WIDTHS.length]!;
      if (x + w > 196) {
        row++;
        x = 0;
      }
      out.push({ id: i, row, x, w });
      x += w + 6;
    }
    return out;
  }, [n]);
  const top = tokens.length ? tokens[tokens.length - 1]!.row : 0;
  const first = Math.max(0, top - ROWS + 1);
  const count = useMotionValue(0);
  const label = useTransform(count, (v) => `${Math.round(v).toLocaleString()} tokens`);
  useEffect(() => {
    const c = animate(count, n * 7 + 140, { duration: reduced ? 0 : 0.35 });
    return () => c.stop();
  }, [n, count, reduced]);
  return (
    <Frame glow={C.lilac}>
      <Stars reduced={reduced} seed={11} n={30} />
      {/* the stream coming in */}
      <Flow paths={["M 820 300 C 980 300, 1080 420, 1210 420", "M 820 560 C 960 560, 1080 470, 1210 470"]} color={C.lilac} count={5} dur={2.6} r={3} reduced={reduced} />
      {/* the window */}
      <rect x={1220} y={150} width={236} height={610} rx={22} fill={alpha(C.bg1, 0.9)} stroke={C.lilac3} strokeWidth={2} />
      <rect x={1220} y={150} width={236} height={610} rx={22} fill="none" stroke={alpha(C.lilac, 0.25)} strokeWidth={8} />
      <text x={1338} y={790} textAnchor="middle" fill={C.ink2} fontSize={18} style={{ fontFamily: "var(--font-sans-face)" }}>
        context window
      </text>
      <motion.text x={1338} y={128} textAnchor="middle" fill={C.lilac} fontSize={20} style={{ fontFamily: "var(--font-mono-face)" }}>
        {label}
      </motion.text>
      {tokens
        .filter((t) => t.row >= first - 1)
        .map((t) => {
          const visibleRow = t.row - first;
          const y = 728 - visibleRow * 52;
          const gone = t.row < first;
          return (
            <motion.rect
              key={t.id}
              width={t.w}
              height={30}
              rx={8}
              initial={reduced ? false : { x: 1050, y: 440, opacity: 0 }}
              animate={{ x: 1240 + t.x, y: gone ? y + 30 : y, opacity: gone ? 0 : 1, fill: gone ? C.alert : t.row === top ? C.lilac : alpha(C.lilac, 0.55) }}
              transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
    </Frame>
  );
}

// ---------------------------------------------------------------- Incident Room: a spike, a page, a recovery

function IncidentScene({ reduced }: SceneProps) {
  const phase = useTimeline([700, 2600, 4200], reduced, 9000);
  const pts = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 48 }, (_, i) => {
      const base = 520 - r() * 26;
      const spike = i >= 20 && i <= 33 ? Math.sin(((i - 20) / 13) * Math.PI) * 250 : 0;
      return [960 + i * 11.5, base - spike] as const;
    });
  }, []);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const logs = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: 9 }, (_, i) => ({ y: 600 + i * 26, w: 120 + r() * 300, warn: r() < 0.3 }));
  }, []);
  return (
    <Frame glow={phase >= 3 ? C.phos : C.alert}>
      <Stars reduced={reduced} seed={21} n={26} />
      <rect x={930} y={250} width={600} height={540} rx={24} fill={alpha(C.bg1, 0.92)} stroke={C.line2} strokeWidth={2} />
      {[330, 400, 470, 540].map((y) => (
        <line key={y} x1={960} x2={1500} y1={y} y2={y} stroke={alpha(C.ink0, 0.05)} />
      ))}
      <line x1={960} x2={1500} y1={380} y2={380} stroke={alpha(C.alert, 0.45)} strokeDasharray="6 6" />
      <motion.path d={d} fill="none" stroke={phase >= 3 ? C.phos : phase >= 2 ? C.alert : C.phos} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: phase >= 1 ? 1 : 0.05 }} transition={{ duration: reduced ? 0 : 3.4, ease: "easeInOut" }} />
      {/* pager */}
      <circle cx={1490} cy={285} r={9} fill={phase >= 3 ? C.phos : C.alert} />
      {!reduced && phase >= 2 && phase < 3 && (
        <circle cx={1490} cy={285} r={9} fill="none" stroke={C.alert} strokeWidth={2}>
          <animate attributeName="r" values="9;30" dur="1.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
      <g clipPath="inset(0)">
        {logs.map((l, i) => (
          <motion.rect key={i} x={960} y={l.y} width={l.w} height={10} rx={5} fill={l.warn && phase >= 2 && phase < 3 ? alpha(C.alert, 0.6) : alpha(C.ink2, 0.35)} initial={{ opacity: 0 }} animate={{ opacity: phase >= 1 ? 1 : 0 }} transition={{ delay: reduced ? 0 : i * 0.12 }} />
        ))}
      </g>
      {phase >= 3 && (
        <motion.g initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.8 }}>
          <rect x={1300} y={300} width={190} height={40} rx={20} fill={alpha(C.phos, 0.15)} stroke={C.phos3} />
          <text x={1395} y={326} textAnchor="middle" fill={C.phos} fontSize={18} style={{ fontFamily: "var(--font-sans-face)" }}>
            mitigated
          </text>
        </motion.g>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------- Daily Shift: dawn, and rust turning back to green

function ShiftScene({ reduced }: SceneProps) {
  const phase = useTimeline([1200, 2100, 3000, 3900], reduced);
  const services = [960, 1090, 1220, 1350, 1480];
  const rusty = [0, 2, 3];
  return (
    <Frame glow={C.amber}>
      <defs>
        <linearGradient id="dawn" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.amber} stopOpacity="0" />
          <stop offset="100%" stopColor={C.amber} stopOpacity="0.14" />
        </linearGradient>
      </defs>
      <rect x={0} y={420} width={1600} height={320} fill="url(#dawn)" />
      <motion.circle cx={1240} r={110} fill={alpha(C.amber, 0.22)} initial={{ cy: reduced ? 640 : 780 }} animate={{ cy: 640 }} transition={{ duration: reduced ? 0 : 6, ease: "easeOut" }} />
      <motion.circle cx={1240} r={72} fill={alpha(C.amber, 0.4)} initial={{ cy: reduced ? 640 : 780 }} animate={{ cy: 640 }} transition={{ duration: reduced ? 0 : 6, ease: "easeOut" }} />
      <rect x={0} y={700} width={1600} height={200} fill={C.bg0} />
      <line x1={0} x2={1600} y1={700} y2={700} stroke={alpha(C.amber, 0.3)} />
      {services.map((x, i) => {
        const idx = rusty.indexOf(i);
        const fixed = idx < 0 || phase > idx + 1;
        const col = fixed ? C.phos : idx === 0 ? C.alert : C.amber;
        return (
          <g key={i}>
            <motion.rect x={x} y={590} width={90} height={110} rx={14} fill={C.bg1} animate={{ stroke: col }} strokeWidth={2} transition={{ duration: reduced ? 0 : 0.8 }} />
            {[0, 1, 2].map((k) => (
              <motion.rect key={k} x={x + 16} y={612 + k * 24} width={58} height={8} rx={4} animate={{ fill: alpha(col, 0.45) }} transition={{ duration: reduced ? 0 : 0.8 }} />
            ))}
            {idx >= 0 && (
              <motion.g style={{ transformOrigin: `${x + 45}px 520px` }} initial={reduced ? false : { scaleX: 1 }} animate={{ scaleX: phase > idx + 1 ? [1, 0, 1] : 1 }} transition={{ duration: 0.7 }}>
                <rect x={x + 10} y={480} width={70} height={84} rx={10} fill={fixed ? alpha(C.phos, 0.18) : C.bg2} stroke={fixed ? C.phos3 : C.line3} />
                <text x={x + 45} y={530} textAnchor="middle" fill={fixed ? C.phos : C.ink2} fontSize={22} style={{ fontFamily: "var(--font-display-face)" }}>
                  {fixed ? "✓" : "?"}
                </text>
              </motion.g>
            )}
          </g>
        );
      })}
    </Frame>
  );
}

// ---------------------------------------------------------------- Codex: cards fan out under a constellation

function CodexScene({ reduced }: SceneProps) {
  const cards = 7;
  const stars = useMemo(() => {
    const r = rng(13);
    return Array.from({ length: 14 }, () => ({ x: 900 + r() * 640, y: 140 + r() * 240 }));
  }, []);
  const links = useMemo(() => stars.slice(1).map((s, i) => [stars[i]!, s] as const).filter((_, i) => i % 3 !== 2), [stars]);
  return (
    <Frame glow={C.sky}>
      <Stars reduced={reduced} seed={31} n={30} />
      {links.map(([a, b], i) => (
        <motion.line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={alpha(C.sky, 0.35)} strokeWidth={1.5} initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 1.2, delay: reduced ? 0 : 1.6 + i * 0.12 }} />
      ))}
      {stars.map((s, i) => (
        <motion.circle key={i} cx={s.x} cy={s.y} r={5} fill={C.sky} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 1.2 + i * 0.08 }} />
      ))}
      {Array.from({ length: cards }, (_, i) => {
        const a = (i - (cards - 1) / 2) * 6.5;
        return (
          <motion.g key={i} style={{ transformOrigin: "1230px 1650px" }} initial={{ rotate: 0, opacity: reduced ? 1 : 0 }} animate={{ rotate: a, opacity: 1 }} transition={{ duration: reduced ? 0 : 1.1, delay: reduced ? 0 : 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}>
            <rect x={1165} y={470} width={130} height={190} rx={16} fill={C.bg1} stroke={i === 3 ? C.sky : C.line3} strokeWidth={2} />
            <rect x={1185} y={500} width={70} height={10} rx={5} fill={alpha(C.sky, i === 3 ? 0.7 : 0.3)} />
            <rect x={1185} y={522} width={90} height={7} rx={3.5} fill={alpha(C.ink2, 0.3)} />
            <rect x={1185} y={538} width={80} height={7} rx={3.5} fill={alpha(C.ink2, 0.3)} />
          </motion.g>
        );
      })}
    </Frame>
  );
}

// ---------------------------------------------------------------- The Bill: an invoice that comes down

function BillScene({ reduced }: SceneProps) {
  const v = useMotionValue(reduced ? 26224 : 107460);
  const text = useTransform(v, (x) => `$${Math.round(x).toLocaleString("en-US")}`);
  const [done, setDone] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const c = animate(v, 26224, { duration: 4.2, delay: 1.8, ease: [0.4, 0, 0.2, 1], onComplete: () => setDone(true) });
    return () => c.stop();
  }, [v, reduced]);
  return (
    <Frame glow={done ? C.phos : C.amber}>
      <Stars reduced={reduced} seed={41} n={24} />
      <motion.g initial={{ y: reduced ? 0 : 260, opacity: reduced ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: reduced ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}>
        <path d="M 1110 170 h 330 v 600 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 l -22 14 l -22 -14 z" fill={C.bg1} stroke={C.line3} strokeWidth={2} />
        <text x={1140} y={225} fill={C.ink2} fontSize={18} style={{ fontFamily: "var(--font-sans-face)" }}>
          Pigeon Copilot · monthly
        </text>
        {[270, 305, 340, 375, 410].map((y, i) => (
          <g key={y}>
            <rect x={1140} y={y} width={150 - i * 12} height={9} rx={4.5} fill={alpha(C.ink2, 0.3)} />
            <rect x={1360} y={y} width={50} height={9} rx={4.5} fill={alpha(C.ink2, 0.3)} />
          </g>
        ))}
        <line x1={1140} x2={1410} y1={460} y2={460} stroke={C.line3} />
        <motion.text x={1410} y={530} textAnchor="end" fontSize={56} animate={{ fill: done ? C.phos : C.amber }} style={{ fontFamily: "var(--font-display-face)", fontVariantNumeric: "tabular-nums lining-nums" }}>
          {text}
        </motion.text>
        <motion.text x={1410} y={570} textAnchor="end" fill={C.ink2} fontSize={18} initial={{ opacity: 0 }} animate={{ opacity: done ? 1 : 0 }} style={{ fontFamily: "var(--font-sans-face)" }}>
          same answers, fewer tokens
        </motion.text>
      </motion.g>
    </Frame>
  );
}

export const SCENES: Record<SceneId, (p: SceneProps) => ReactNode> = {
  launch: LaunchScene,
  tokens: TokensScene,
  incident: IncidentScene,
  shift: ShiftScene,
  codex: CodexScene,
  bill: BillScene,
};
