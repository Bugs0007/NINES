"use client";
/**
 * War-room panels: dashboards, logs, host terminals, traces, change timeline.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import type { WindowMetrics } from "@/engine/types";
import type { SimHandle } from "@/engine/useSim";
import { FlowView } from "@/ui/flow/FlowView";
import { Chip, cx, fmtLatency, fmtNum, fmtPct, Led, Panel, Sparkline } from "@/ui/kit";
import { useReducedMotion } from "@/ui/motion";
import { MetricStrip } from "@/widgets/sim/SimStage";
import { fleetLayout, serversFor } from "@/widgets/fleet/spec";
import { clockAt } from "./inc-fourth-box";
import type { Incident, IncidentState, LogLine, Trace } from "./types";

export interface Pin {
  key: string;
  evidence?: string;
  text: string;
  where: string;
}

export function PinButton({ pinned, onPin }: { pinned: boolean; onPin: () => void }) {
  return (
    <button onClick={onPin} aria-pressed={pinned} title={pinned ? "Pinned to the evidence board" : "Pin as evidence"} className={cx("shrink-0 rounded-[2px] px-1 font-mono text-[10px]", pinned ? "bg-amber text-bg-0" : "text-ink-3 hover:text-amber")}>
      {pinned ? "PINNED" : "PIN"}
    </button>
  );
}

// ---------------------------------------------------------------- dashboards

export function Dashboards({ inc, sim, pins, pin }: { inc: Incident; sim: SimHandle; pins: Pin[]; pin: (p: Pin) => void }) {
  const ws = sim.windows;
  const last = ws[ws.length - 1];
  const reduced = useReducedMotion();
  const layout = useMemo(() => {
    const ids = Object.keys(last?.nodes ?? {}).filter((id) => /^app-\d+$/.test(id));
    const servers = (ids.length ? ids : inc.hosts).map((id) => ({ ...serversFor("m7i.large", 1)[0]!, id, label: id, workers: 16 }));
    return fleetLayout({ servers, session: "none" });
  }, [last, inc.hosts]);
  const targets = Object.keys(last?.nodes ?? {}).filter((id) => /^app-\d+$/.test(id)).sort();
  const healthy = new Set(last?.nodes["lb"]?.healthy ?? []);
  const series = (id: string, f: (w: WindowMetrics) => number) => ws.slice(-60).map(f);
  return (
    <div className="flex flex-col gap-3">
      <MetricStrip windows={ws} keys={["p50", "p99", "errors", "rps"]} slo={inc.slo} />
      <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr]">
        <Panel label="targets · pigeon-app-tg" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left font-mono text-2xs">
              <thead className="text-ink-3">
                <tr>
                  <th className="px-2 py-1.5 font-normal">target</th>
                  <th className="font-normal">health</th>
                  <th className="font-normal">req/s</th>
                  <th className="font-normal">p99 (60s)</th>
                  <th className="font-normal">CPU</th>
                  <th className="font-normal">workers busy</th>
                  <th className="font-normal">queued</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {targets.map((id) => {
                  const nw = last!.nodes[id]!;
                  const p99s = series(id, (w) => w.nodes[id]?.p99 ?? 0);
                  const bad = nw.p99 > 2 || nw.queue > 20;
                  const key = `dash:${id}`;
                  const evidence = id === "app-4" && bad ? "target-latency" : undefined;
                  return (
                    <tr key={id} className={cx("border-t border-line", bad && "bg-alert-dim/40")}>
                      <td className={cx("px-2 py-1.5", bad ? "text-alert" : "text-ink-0")}>{id}</td>
                      <td>
                        <span className="flex items-center gap-1">
                          <Led tone={nw.up ? (healthy.size === 0 || healthy.has(id) ? "ok" : "warn") : "alert"} />
                          {nw.up ? (healthy.size === 0 || healthy.has(id) ? "healthy" : "unhealthy") : "down"}
                        </span>
                      </td>
                      <td className="tabular text-ink-1">{fmtNum(nw.completed / Math.max(0.5, last!.dt))}</td>
                      <td className="tabular">
                        <span className={bad ? "text-alert" : "text-ink-1"}>{nw.completed ? fmtLatency(nw.p99) : "—"}</span>
                        <Sparkline values={p99s} width={60} height={14} tone={bad ? "alert" : "ink"} className="ml-1 inline-block align-middle" fill={false} />
                      </td>
                      <td className={cx("tabular", id === "app-4" && nw.util < 0.15 && bad ? "text-amber" : "text-ink-1")}>{fmtPct(nw.util, 0)}</td>
                      <td className="tabular text-ink-1">{fmtPct(nw.workerUtil, 0)}</td>
                      <td className={cx("tabular", nw.queue > 20 ? "text-alert" : "text-ink-1")}>{fmtNum(nw.queue)}</td>
                      <td className="pr-2 text-right">
                        <PinButton
                          pinned={pins.some((p) => p.key === key)}
                          onPin={() => pin({ key, evidence: evidence ?? (id === "app-4" && nw.util < 0.15 ? "cpu-low" : undefined), text: `${id}: p99 ${fmtLatency(nw.p99)}, CPU ${fmtPct(nw.util, 0)}, workers ${fmtPct(nw.workerUtil, 0)}, ${fmtNum(nw.queue)} queued`, where: `dashboard @ ${clockAt(last!.t)}` })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="flex flex-col gap-3">
          {inc.extraSeries.map((s) => {
            const vals = ws.slice(-60).map((w) => s.at(w.t));
            const v = vals[vals.length - 1] ?? 0;
            const key = `dash:${s.id}`;
            return (
              <Panel key={s.id} label={s.label} right={<PinButton pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: "db-cron", text: `${s.label} at ${v.toFixed(0)}${s.unit}`, where: "dashboard" })} />}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cx("font-mono text-2xl tabular", v > 65 ? "text-amber" : "text-ink-0")}>
                    {v.toFixed(0)}
                    {s.unit}
                  </span>
                  <Sparkline values={vals} width={140} height={30} max={100} tone={v > 65 ? "amber" : "ink"} />
                </div>
              </Panel>
            );
          })}
          <Panel label="service map" bodyClassName="p-0">
            <div className="relative h-48 grid-paper">
              <FlowView nodes={layout.nodes} edges={layout.edges} frame={sim.frame} consumeFinished={sim.consumeFinished} reducedMotion={reduced} sound={false} className="absolute inset-0" />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- logs

export function Logs({ lines, pins, pin, clock0 }: { lines: LogLine[]; pins: Pin[]; pin: (p: Pin) => void; clock0: string }) {
  const [q, setQ] = useState("");
  const [host, setHost] = useState("all");
  const [level, setLevel] = useState<"all" | "WARN+">("all");
  const hosts = useMemo(() => ["all", ...Array.from(new Set(lines.map((l) => l.host))).sort()], [lines]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return lines
      .filter((l) => (host === "all" || l.host === host) && (level === "all" || l.level !== "INFO") && (!s || `${l.host} ${l.source} ${l.text}`.toLowerCase().includes(s)))
      .slice(-400);
  }, [lines, q, host, level]);
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search logs…  e.g. 504, Booting, WEB_CONCURRENCY" aria-label="Search logs" className="h-9 min-w-0 flex-1 rounded-sm border border-line-2 bg-bg-0 px-2.5 font-mono text-xs text-ink-0 outline-none focus:border-amber" />
        <select value={host} onChange={(e) => setHost(e.target.value)} aria-label="Filter by host" className="h-9 rounded-sm border border-line-2 bg-bg-0 px-2 font-mono text-xs text-ink-0">
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as "all" | "WARN+")} aria-label="Filter by level" className="h-9 rounded-sm border border-line-2 bg-bg-0 px-2 font-mono text-xs text-ink-0">
          <option value="all">all levels</option>
          <option value="WARN+">warn+</option>
        </select>
        <span className="font-mono text-[10px] text-ink-3">{shown.length} lines</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-line bg-bg-0 p-1 font-mono text-[11px] leading-relaxed" role="log" aria-label="Logs">
        {shown.map((l, i) => {
          const key = `log:${l.t.toFixed(2)}:${l.host}:${l.text.slice(0, 40)}`;
          return (
            <div key={`${key}-${i}`} className="group flex items-start gap-2 rounded-[2px] px-1 py-0.5 hover:bg-bg-2">
              <span className="shrink-0 text-ink-3">{clockAt(l.t, clock0)}</span>
              <span className="w-12 shrink-0 text-ink-2">{l.host}</span>
              <span className={cx("w-10 shrink-0", l.level === "ERROR" || l.level === "CRIT" ? "text-alert" : l.level === "WARN" ? "text-amber" : "text-ink-3")}>{l.level}</span>
              <span className="min-w-0 flex-1 break-all text-ink-1">
                <span className="text-ink-3">[{l.source}] </span>
                {highlight(l.text, q)}
              </span>
              <span className="opacity-60 group-hover:opacity-100">
                <PinButton pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: l.evidence, text: `${l.host} ${l.source}: ${l.text}`, where: `logs @ ${clockAt(l.t, clock0)}` })} />
              </span>
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-3 text-ink-3">no lines match</div>}
      </div>
    </div>
  );
}

function highlight(text: string, q: string): ReactNode {
  const s = q.trim();
  if (!s) return text;
  const i = text.toLowerCase().indexOf(s.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[1px] bg-amber/40 text-ink-0">{text.slice(i, i + s.length)}</mark>
      {text.slice(i + s.length)}
    </>
  );
}

// ---------------------------------------------------------------- hosts

export function Hosts({ inc, state, pins, pin }: { inc: Incident; state: IncidentState; pins: Pin[]; pin: (p: Pin) => void }) {
  const [host, setHost] = useState(inc.hosts[0]!);
  const [history, setHistory] = useState<{ host: string; cmd: string; out: string; evidence?: string; t: number }[]>([]);
  const [input, setInput] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const run = (cmd: string) => {
    const c = inc.commands.find((x) => x.cmd === cmd.trim()) ?? inc.commands.find((x) => cmd.trim().startsWith(x.cmd.split(" ")[0]!) && x.cmd.includes(cmd.trim()));
    const res = cmd.trim() === "help" ? { out: `available here:\n${inc.commands.map((x) => `  ${x.cmd.padEnd(58)} # ${x.describe}`).join("\n")}` } : c ? c.run(host, state) : { out: `bash: ${cmd.split(" ")[0]}: not available in this simulation (try: help)` };
    setHistory((h) => [...h.slice(-40), { host, cmd, out: res.out, evidence: "evidence" in res ? res.evidence : undefined, t: state.t }]);
    setInput("");
    setTimeout(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight }), 20);
  };
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Host">
        {inc.hosts.map((h) => (
          <button key={h} role="tab" aria-selected={host === h} onClick={() => setHost(h)} className={cx("h-8 rounded-[2px] border px-3 font-mono text-2xs uppercase", host === h ? "border-amber bg-amber text-bg-0" : "border-line-2 text-ink-1 hover:border-line-3")}>
            {h}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {inc.commands.map((c) => (
          <button key={c.cmd} onClick={() => run(c.cmd)} title={c.describe} className="rounded-[2px] border border-line-2 bg-bg-2 px-2 py-1 font-mono text-[10px] text-ink-1 hover:border-amber hover:text-amber">
            {c.cmd.length > 34 ? `${c.cmd.slice(0, 32)}…` : c.cmd}
          </button>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-line bg-bg-0 p-2 font-mono text-[11px] leading-relaxed">
        {history.length === 0 && <div className="text-ink-3">ssh ubuntu@{host} · pick a command above or type one (try: help)</div>}
        {history.map((h, i) => {
          const key = `cmd:${h.host}:${h.cmd}`;
          return (
            <div key={i} className="mb-2">
              <div className="flex items-center justify-between gap-2">
                <span>
                  <span className="text-phos">ubuntu@{h.host}</span>
                  <span className="text-ink-3">:~$ </span>
                  <span className="text-ink-0">{h.cmd}</span>
                </span>
                <PinButton pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: h.evidence, text: `${h.host}$ ${h.cmd}\n${h.out}`, where: `terminal @ ${clockAt(h.t, inc.clock0)}` })} />
              </div>
              <pre className="whitespace-pre-wrap break-all text-ink-1">{h.out}</pre>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) run(input);
        }}
        className="flex items-center gap-2 rounded-sm border border-line-2 bg-bg-0 px-2"
      >
        <span className="font-mono text-xs text-phos">{host}$</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} aria-label={`Command on ${host}`} className="h-9 flex-1 bg-transparent font-mono text-xs text-ink-0 outline-none" placeholder="type a command" />
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- traces

export function Traces({ traces, pins, pin }: { traces: Trace[]; pins: Pin[]; pin: (p: Pin) => void }) {
  const [sel, setSel] = useState(traces[0]!.id);
  const t = traces.find((x) => x.id === sel)!;
  const total = Math.max(...t.spans.map((s) => s.start + s.ms));
  const color = { net: "bg-ink-2/60", queue: "bg-alert/70", cpu: "bg-phos/60", db: "bg-amber/70", cache: "bg-phos/40" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {traces.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cx("rounded-[2px] border px-2.5 py-1.5 text-left font-mono text-2xs", sel === x.id ? "border-amber bg-amber-dim/50 text-ink-0" : "border-line-2 text-ink-1")}>
            <span className={x.status >= 500 ? "text-alert" : "text-phos"}>{x.status}</span> {x.title}
          </button>
        ))}
      </div>
      <Panel label={`trace · ${fmtLatency(total / 1000)}`} right={<PinButton pinned={pins.some((p) => p.key === `trace:${t.id}`)} onPin={() => pin({ key: `trace:${t.id}`, evidence: t.evidence, text: `${t.title}: ${t.spans.map((s) => `${s.name} ${fmtLatency(s.ms / 1000)}`).join(" · ")}`, where: "traces" })} />}>
        <div className="space-y-1">
          {t.spans.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-[45%] truncate font-mono text-[11px] text-ink-1" style={{ paddingLeft: s.depth * 10 }} title={s.name}>
                {s.name}
              </div>
              <div className="relative h-4 flex-1 bg-bg-0">
                <div className={cx("absolute inset-y-0.5 rounded-[1px]", color[s.kind])} style={{ left: `${(s.start / total) * 100}%`, width: `${Math.max(0.5, (s.ms / total) * 100)}%` }} />
              </div>
              <div className="w-16 text-right font-mono text-[10px] tabular text-ink-2">{fmtLatency(s.ms / 1000)}</div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- timeline

export function Timeline({ inc, feed }: { inc: Incident; feed: { t: number; label: string; kind: string }[] }) {
  const all = [...inc.timeline, ...feed].sort((a, b) => a.t - b.t);
  return (
    <ol className="relative ml-2 border-l border-line-2 pl-4">
      {all.map((e, i) => (
        <li key={i} className="mb-3">
          <span className={cx("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full", e.kind === "page" ? "bg-alert" : e.kind === "action" ? "bg-amber" : e.kind === "recover" ? "bg-phos" : "bg-line-3")} />
          <div className="font-mono text-2xs text-ink-3">{clockAt(e.t, inc.clock0)}</div>
          <div className="text-sm text-ink-0">{e.label}</div>
        </li>
      ))}
      {!all.length && <Chip tone="muted">nothing yet</Chip>}
    </ol>
  );
}
