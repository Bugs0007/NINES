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

export function PinButton({ pinned, onPin, compact = false }: { pinned: boolean; onPin: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onPin}
      aria-pressed={pinned}
      title={pinned ? "Pinned to the evidence board" : "Pin as evidence"}
      className={cx(
        "inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border px-3.5 font-sans text-[13px] font-medium transition-colors duration-200",
        // A mouse on a wide screen doesn't need a 40px target, so dense rows stay dense there.
        compact ? "sm:pointer-fine:min-h-6 sm:pointer-fine:px-2.5 sm:pointer-fine:text-xs" : "sm:pointer-fine:min-h-8 sm:pointer-fine:px-3",
        pinned ? "border-amber-3/70 bg-amber-dim text-amber" : "border-line-2/80 text-ink-2 hover:border-amber-3/70 hover:bg-amber-dim/50 hover:text-amber",
      )}
    >
      {pinned ? "Pinned" : "Pin"}
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
    <div className="flex flex-col gap-4">
      <MetricStrip windows={ws} keys={["p50", "p99", "errors", "rps"]} slo={inc.slo} />
      <Panel
        label={
          <>
            Targets <span className="font-mono font-normal text-ink-3">· pigeon-app-tg</span>
          </>
        }
        bodyClassName="px-0 pb-2"
      >
        <div className="overflow-x-auto">
          {/* Phones keep what finds the bad box (health, p99, CPU) and the pin; the rest from sm up. */}
          <table className="w-full text-left text-xs">
            <thead className="text-ink-2">
              <tr className="whitespace-nowrap">
                <th className="py-2 pl-4 pr-2 font-medium">Target</th>
                <th className="px-2 font-medium">Health</th>
                <th className="hidden px-2 font-medium sm:table-cell">req/s</th>
                <th className="px-2 font-medium">
                  p99<span className="hidden sm:inline"> (60s)</span>
                </th>
                <th className="px-2 font-medium">CPU</th>
                <th className="hidden px-2 font-medium sm:table-cell">Workers busy</th>
                <th className="hidden px-2 font-medium sm:table-cell">Queued</th>
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
                  <tr key={id} className={cx("whitespace-nowrap border-t border-line/60 transition-colors duration-500", bad && "bg-alert-dim/35")}>
                    <td className={cx("py-1.5 pl-4 pr-2 font-mono", bad ? "text-alert" : "text-ink-0")}>{id}</td>
                    <td className="px-2 text-ink-1">
                      <span className="flex items-center gap-1.5">
                        <Led tone={nw.up ? (healthy.size === 0 || healthy.has(id) ? "ok" : "warn") : "alert"} />
                        {nw.up ? (healthy.size === 0 || healthy.has(id) ? "healthy" : "unhealthy") : "down"}
                      </span>
                    </td>
                    <td className="hidden px-2 font-mono tabular text-ink-1 sm:table-cell">{fmtNum(nw.completed / Math.max(0.5, last!.dt))}</td>
                    <td className="px-2 font-mono tabular">
                      <span className={bad ? "text-alert" : "text-ink-1"}>{nw.completed ? fmtLatency(nw.p99) : "—"}</span>
                      <Sparkline values={p99s} width={60} height={14} tone={bad ? "alert" : "ink"} className="ml-1.5 hidden align-middle sm:inline-block lg:hidden xl:inline-block" fill={false} />
                    </td>
                    <td className={cx("px-2 font-mono tabular", id === "app-4" && nw.util < 0.15 && bad ? "text-amber" : "text-ink-1")}>{fmtPct(nw.util, 0)}</td>
                    <td className="hidden px-2 font-mono tabular text-ink-1 sm:table-cell">{fmtPct(nw.workerUtil, 0)}</td>
                    <td className={cx("hidden px-2 font-mono tabular sm:table-cell", nw.queue > 20 ? "text-alert" : "text-ink-1")}>{fmtNum(nw.queue)}</td>
                    <td className="py-1 pl-2 pr-3 text-right">
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
      <div className={cx("grid grid-cols-1 gap-4", inc.extraSeries.length > 0 && "xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]")}>
        {inc.extraSeries.length > 0 && (
          <div className="flex flex-col gap-4">
            {inc.extraSeries.map((s) => {
              const vals = ws.slice(-60).map((w) => s.at(w.t));
              const v = vals[vals.length - 1] ?? 0;
              const key = `dash:${s.id}`;
              return (
                <Panel key={s.id} label={s.label} right={<PinButton pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: "db-cron", text: `${s.label} at ${v.toFixed(0)}${s.unit}`, where: "dashboard" })} />} className="xl:flex xl:flex-1 xl:flex-col" bodyClassName="xl:flex xl:flex-1 xl:flex-col">
                  <div className="flex items-center justify-between gap-3 xl:flex-1 xl:flex-col xl:items-stretch">
                    <span className={cx("num-display text-3xl font-semibold transition-colors duration-500", v > 65 ? "text-amber" : "text-ink-0")}>
                      {v.toFixed(0)}
                      {s.unit}
                    </span>
                    <Sparkline values={vals} width={140} height={30} max={100} tone={v > 65 ? "amber" : "ink"} className="xl:hidden" />
                    <Sparkline values={vals} width={280} height={150} max={100} tone={v > 65 ? "amber" : "ink"} className="hidden h-auto w-full xl:block" />
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
        <Panel label="Service map" bodyClassName="p-0">
          <div className="relative h-56 overflow-hidden rounded-b-lg grid-paper xl:h-72">
            <FlowView nodes={layout.nodes} edges={layout.edges} frame={sim.frame} consumeFinished={sim.consumeFinished} reducedMotion={reduced} sound={false} className="absolute inset-0" />
          </div>
        </Panel>
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
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search logs…  e.g. 504, Booting, WEB_CONCURRENCY" aria-label="Search logs" className="h-10 min-w-0 flex-1 basis-56 rounded-sm border border-line-2 bg-bg-2/60 px-3.5 text-[13px] text-ink-0 outline-none transition-colors placeholder:text-ink-3 focus:border-amber/80" />
        <select value={host} onChange={(e) => setHost(e.target.value)} aria-label="Filter by host" className="h-10 rounded-sm border border-line-2 bg-bg-2/60 px-2.5 text-[13px] text-ink-0 outline-none focus:border-amber/80">
          {hosts.map((h) => (
            <option key={h} value={h}>
              {h === "all" ? "All hosts" : h}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as "all" | "WARN+")} aria-label="Filter by level" className="h-10 rounded-sm border border-line-2 bg-bg-2/60 px-2.5 text-[13px] text-ink-0 outline-none focus:border-amber/80">
          <option value="all">All levels</option>
          <option value="WARN+">Warn+</option>
        </select>
        <span className="text-xs text-ink-3">
          <span className="tabular">{shown.length}</span> {shown.length === 1 ? "line" : "lines"}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-line/70 bg-bg-0/70 p-2 font-mono text-xs leading-relaxed" role="log" aria-label="Logs">
        {shown.map((l, i) => {
          const key = `log:${l.t.toFixed(2)}:${l.host}:${l.text.slice(0, 40)}`;
          return (
            <div key={`${key}-${i}`} className="group flex flex-wrap items-center gap-x-2.5 rounded-xs px-1.5 py-1 hover:bg-bg-2/70 sm:flex-nowrap sm:items-start sm:py-0.5">
              <span className="shrink-0 tabular text-ink-3">{clockAt(l.t, clock0)}</span>
              <span className="w-12 shrink-0 text-ink-2">{l.host}</span>
              <span className={cx("w-10 shrink-0", l.level === "ERROR" || l.level === "CRIT" ? "text-alert" : l.level === "WARN" ? "text-amber" : "text-ink-3")}>{l.level}</span>
              <span className="order-last min-w-0 basis-full text-ink-1 [overflow-wrap:anywhere] sm:order-none sm:basis-auto sm:flex-1">
                <span className="text-ink-3">[{l.source}] </span>
                {highlight(l.text, q)}
              </span>
              <span className="ml-auto sm:order-last sm:ml-0 sm:pointer-fine:opacity-60 sm:pointer-fine:group-focus-within:opacity-100 sm:pointer-fine:group-hover:opacity-100">
                <PinButton compact pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: l.evidence, text: `${l.host} ${l.source}: ${l.text}`, where: `logs @ ${clockAt(l.t, clock0)}` })} />
              </span>
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-3 font-sans text-[13px] text-ink-3">No lines match</div>}
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
      <mark className="rounded-xs bg-amber/30 text-ink-0">{text.slice(i, i + s.length)}</mark>
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
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Host">
        {inc.hosts.map((h) => (
          <button key={h} role="tab" aria-selected={host === h} onClick={() => setHost(h)} className={cx("h-8 rounded-full border px-3.5 font-mono text-xs transition-colors duration-200", host === h ? "border-amber bg-amber text-bg-0" : "border-line-2/80 text-ink-1 hover:border-line-3 hover:bg-bg-2")}>
            {h}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {inc.commands.map((c) => (
          <button key={c.cmd} onClick={() => run(c.cmd)} title={c.describe} className="max-w-full truncate rounded-xs border border-line-2/80 bg-bg-2/60 px-2.5 py-1.5 font-mono text-xs text-ink-1 transition-colors hover:border-amber-3 hover:text-amber">
            {c.cmd.length > 34 ? `${c.cmd.slice(0, 32)}…` : c.cmd}
          </button>
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto rounded-md border border-line/70 bg-bg-0/70 p-3 font-mono text-xs leading-relaxed">
        {history.length === 0 && <div className="text-ink-3">ssh ubuntu@{host} · pick a command above or type one (try: help)</div>}
        {history.map((h, i) => {
          const key = `cmd:${h.host}:${h.cmd}`;
          return (
            <div key={i} className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-phos">ubuntu@{h.host}</span>
                  <span className="text-ink-3">:~$ </span>
                  <span className="text-ink-0">{h.cmd}</span>
                </span>
                <PinButton pinned={pins.some((p) => p.key === key)} onPin={() => pin({ key, evidence: h.evidence, text: `${h.host}$ ${h.cmd}\n${h.out}`, where: `terminal @ ${clockAt(h.t, inc.clock0)}` })} />
              </div>
              <pre className="whitespace-pre-wrap text-ink-1 [overflow-wrap:anywhere]">{h.out}</pre>
            </div>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) run(input);
        }}
        className="flex items-center gap-2 rounded-sm border border-line-2 bg-bg-0/70 px-3 transition-colors focus-within:border-amber/80"
      >
        <span className="font-mono text-xs text-phos">{host}$</span>
        <input value={input} onChange={(e) => setInput(e.target.value)} aria-label={`Command on ${host}`} className="h-10 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-ink-0 outline-none placeholder:text-ink-3" placeholder="type a command" />
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {traces.map((x) => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cx("rounded-md border px-3 py-2 text-left text-[13px] transition-colors duration-200", sel === x.id ? "border-amber/70 bg-amber-dim/50 text-ink-0" : "border-line-2/80 text-ink-1 hover:border-line-3 hover:bg-bg-2/60")}>
            <span className={cx("font-mono tabular", x.status >= 500 ? "text-alert" : "text-phos")}>{x.status}</span> {x.title}
          </button>
        ))}
      </div>
      <Panel label={`Trace · ${fmtLatency(total / 1000)}`} right={<PinButton pinned={pins.some((p) => p.key === `trace:${t.id}`)} onPin={() => pin({ key: `trace:${t.id}`, evidence: t.evidence, text: `${t.title}: ${t.spans.map((s) => `${s.name} ${fmtLatency(s.ms / 1000)}`).join(" · ")}`, where: "traces" })} />}>
        <div className="space-y-1.5">
          {t.spans.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-[42%] truncate font-mono text-xs text-ink-1" style={{ paddingLeft: s.depth * 10 }} title={s.name}>
                {s.name}
              </div>
              <div className="relative h-4 flex-1 rounded-full bg-bg-0/70">
                <div className={cx("absolute inset-y-0.5 rounded-full", color[s.kind])} style={{ left: `${(s.start / total) * 100}%`, width: `${Math.max(0.5, (s.ms / total) * 100)}%` }} />
              </div>
              <div className="w-14 shrink-0 text-right font-mono text-xs tabular text-ink-2">{fmtLatency(s.ms / 1000)}</div>
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
    <ol className="relative ml-2 mt-1 border-l border-line-2/70 pl-5">
      {all.map((e, i) => (
        <li key={i} className="mb-4">
          <span className={cx("absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-bg-0", e.kind === "page" ? "bg-alert" : e.kind === "action" ? "bg-amber" : e.kind === "recover" ? "bg-phos" : "bg-line-3")} />
          <div className="font-mono text-xs tabular text-ink-3">{clockAt(e.t, inc.clock0)}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-ink-0">{e.label}</div>
        </li>
      ))}
      {!all.length && <Chip tone="muted">Nothing yet</Chip>}
    </ol>
  );
}
