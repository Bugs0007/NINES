/**
 * Small helpers shared by incident modules: generic host commands, a no-op "red herring" mitigation maker and the
 * dashboard config for a three-tier layout.
 */
import type { FlowEdge, FlowNode } from "@/ui/flow/FlowView";
import { clockAt } from "./clock";
import type { DashboardConfig, HostCommand, IncidentState, Mitigation } from "./types";

export { clockAt };

export const df = (used = 27): HostCommand => ({
  cmd: "df -h /",
  describe: "disk space",
  run: () => ({ out: `Filesystem      Size  Used Avail Use% Mounted on\n/dev/nvme0n1p1   30G  ${((30 * used) / 100).toFixed(1)}G   ${((30 * (100 - used)) / 100).toFixed(0)}G  ${used}% /` }),
});

export const uptime = (loadOf: (host: string, s: IncidentState) => number, evidence?: (host: string, s: IncidentState) => string | undefined): HostCommand => ({
  cmd: "uptime",
  describe: "load average",
  run: (h, s) => {
    const load = loadOf(h, s);
    return { out: ` up 41 days,  1 user,  load average: ${load.toFixed(2)}, ${(load * 0.9).toFixed(2)}, ${(load * 0.7).toFixed(2)}`, evidence: evidence?.(h, s) };
  },
});

export const free = (usedMb: (host: string, s: IncidentState) => number, evidence?: (host: string, s: IncidentState) => string | undefined): HostCommand => ({
  cmd: "free -m",
  describe: "memory",
  run: (h, s) => {
    const used = usedMb(h, s);
    return { out: `               total        used        free      shared  buff/cache   available\nMem:            7812        ${Math.round(used)}        ${Math.round(7812 - used - 900)}          12         900        ${Math.round(7812 - used)}`, evidence: evidence?.(h, s) };
  },
});

/** A mitigation that does nothing to the sim, for red herrings and "feels productive" actions. */
export const decoy = (id: string, label: string, detail: string, note: string, takesS = 10, kind: Mitigation["kind"] = "neutral"): Mitigation => ({ id, label, detail, takesS, kind, patches: () => [], note });

/** Targets table config that lists the named nodes. */
export function dashboardFor(label: string, ids: string[], evidence?: DashboardConfig["evidence"], map?: DashboardConfig["map"]): DashboardConfig {
  return { label, ids: (all) => all.filter((x) => ids.includes(x)), evidence, map };
}

/** A left-to-right service map: users, lb, a column of apps, then a store and optionally a cache. */
export function tierMap(apps: string[], opts: { db?: string; cache?: string; lb?: boolean; extra?: { id: string; label: string; kind: FlowNode["kind"]; x: number; y: number }[] } = {}): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const n = apps.length;
  const top = 300 - ((n - 1) * 110) / 2;
  const nodes: FlowNode[] = [{ id: "users", label: "users", kind: "client", x: 60, y: 300 }];
  const edges: FlowEdge[] = [];
  const entry = opts.lb === false ? apps : ["lb"];
  if (opts.lb !== false) {
    nodes.push({ id: "lb", label: "load balancer", kind: "lb", x: 280, y: 300 });
    edges.push({ from: "users", to: "lb" });
  } else apps.forEach((a) => edges.push({ from: "users", to: a }));
  void entry;
  apps.forEach((a, i) => {
    nodes.push({ id: a, label: a, kind: "server", x: 560, y: top + i * 110, workers: 16, cores: 4 });
    if (opts.lb !== false) edges.push({ from: "lb", to: a });
    if (opts.cache) edges.push({ from: a, to: opts.cache });
    else if (opts.db) edges.push({ from: a, to: opts.db });
  });
  if (opts.cache) {
    nodes.push({ id: opts.cache, label: opts.cache, kind: "cache", x: 840, y: 180 });
    if (opts.db) {
      nodes.push({ id: opts.db, label: opts.db, kind: "db", x: 1080, y: 300 });
      edges.push({ from: opts.cache, to: opts.db });
    }
  } else if (opts.db) nodes.push({ id: opts.db, label: opts.db, kind: "db", x: 840, y: 300 });
  for (const e of opts.extra ?? []) nodes.push({ id: e.id, label: e.label, kind: e.kind, x: e.x, y: e.y });
  return { nodes, edges };
}
