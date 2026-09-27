/**
 * Fleet scenarios: users -> load balancer -> N app servers (-> session store).
 * Shared by Scale Lab, LB Lab, Session Lab, and the Launch Day boss. Pure: also used by verifiers.
 */
import { z } from "zod";
import { albMonthly, instance, monthly, REDIS_NODES } from "@/engine/catalog";
import type { Dist } from "@/engine/dist";
import type { RateCurve } from "@/engine/traffic";
import type { HealthCheckSpec, LbAlgorithm, NodeSpec, RetryPolicy, ServerSpec, SimPatch, SimSpec } from "@/engine/types";
import { DistSchema } from "../queue-lab/spec";

export type SessionMode = "none" | "local" | "sticky" | "redis" | "cookie";
export type HcMode = "off" | "shallow" | "deep";

export const RateSchema: z.ZodType<RateCurve> = z.union([
  z.object({ kind: z.literal("const"), rps: z.number() }),
  z.object({ kind: z.literal("keyframes"), points: z.array(z.tuple([z.number(), z.number()])), step: z.boolean().optional() }),
  z.object({ kind: z.literal("diurnal"), base: z.number(), peak: z.number(), periodS: z.number() }),
  z.object({ kind: z.literal("spike"), base: z.number(), peak: z.number(), at: z.number(), rampS: z.number(), holdS: z.number(), decayS: z.number() }),
]);

export const ScriptEvent = z.object({
  t: z.number(),
  /** Server index (0-based) the event targets. */
  server: z.number(),
  /** deploy = graceful rolling restart: drain from the LB, restart, re-add after boot. */
  kind: z.enum(["crash", "restart", "slow", "heal", "deploy"]),
  factor: z.number().optional(),
  note: z.string().optional(),
});
export type ScriptEvent = z.infer<typeof ScriptEvent>;

export interface FleetServer {
  id: string;
  label: string;
  cores: number;
  workers: number;
  instance?: string;
  costPerMonth?: number;
  slowFactor?: number;
  down?: boolean;
  bootS?: number;
}

export interface FleetOptions {
  servers: FleetServer[];
  algorithm: LbAlgorithm;
  hc: HcMode;
  hcIntervalS?: number;
  hcThreshold?: number;
  outlier?: boolean;
  session: SessionMode;
  rate: RateCurve;
  users?: number;
  cpu: Dist;
  io?: Dist;
  timeoutS?: number;
  retry?: RetryPolicy;
  script?: ScriptEvent[];
  redisNode?: string;
  withAlbCost?: boolean;
}

export function serverId(i: number): string {
  return `app-${i + 1}`;
}

/** Servers sized from an EC2 instance type: one gunicorn worker per ~vCPU/2 rule of (2 × cores) + 1. */
export function serversFor(instanceName: string, count: number, bootS = 60): FleetServer[] {
  const it = instance(instanceName);
  return Array.from({ length: count }, (_, i) => ({
    id: serverId(i),
    label: serverId(i),
    cores: it.vcpu,
    workers: 2 * it.vcpu + 1,
    instance: it.name,
    costPerMonth: monthly(it.usdPerHour),
    bootS,
  }));
}

function hcSpec(o: FleetOptions): HealthCheckSpec | undefined {
  if (o.hc === "off") return undefined;
  return { intervalS: o.hcIntervalS ?? 10, timeoutS: 2, unhealthyThreshold: o.hcThreshold ?? 2, healthyThreshold: 3, deep: o.hc === "deep" };
}

export function scriptPatches(events: ScriptEvent[] = [], servers: FleetServer[] = []): NonNullable<SimSpec["script"]> {
  const out: NonNullable<SimSpec["script"]> = [];
  const all = servers.map((s) => s.id);
  for (const e of events) {
    const node = serverId(e.server);
    if (e.kind === "deploy") {
      const boot = servers[e.server]?.bootS ?? 20;
      out.push({ t: e.t, patch: { op: "set", node: "lb", changes: { targets: all.filter((x) => x !== node) } }, note: e.note ?? `${node} drained for deploy` });
      out.push({ t: e.t + 3, patch: { op: "restart", node } });
      out.push({ t: e.t + 3 + boot + 1, patch: { op: "set", node: "lb", changes: { targets: all } }, note: `${node} back in rotation` });
      continue;
    }
    let patch: SimPatch;
    switch (e.kind) {
      case "crash":
        patch = { op: "set", node, changes: { failure: { down: true } } };
        break;
      case "restart":
        patch = { op: "restart", node };
        break;
      case "slow":
        patch = { op: "set", node, changes: { failure: { slowFactor: e.factor ?? 5 } } };
        break;
      case "heal":
        patch = { op: "set", node, changes: { failure: {} } };
        break;
    }
    out.push({ t: e.t, patch, note: e.note });
  }
  return out;
}

export function buildFleet(o: FleetOptions): SimSpec {
  const steps: ServerSpec["steps"] = [];
  if (o.session !== "none") steps.push({ kind: "session" });
  steps.push({ kind: "cpu", dist: o.cpu });
  if (o.io) steps.push({ kind: "io", dist: o.io });
  const session: ServerSpec["session"] =
    o.session === "redis" ? { mode: "external", store: "redis" } : o.session === "cookie" ? { mode: "cookie" } : o.session === "none" ? undefined : { mode: "local" };
  const nodes: NodeSpec[] = [
    { kind: "client", id: "users", label: "users", target: "lb", rate: o.rate, users: o.users ?? 2000, timeoutS: o.timeoutS ?? 10, retry: o.retry },
    {
      kind: "lb",
      id: "lb",
      label: "ALB",
      targets: o.servers.map((s) => s.id),
      algorithm: o.session === "sticky" ? "sticky" : o.algorithm,
      healthCheck: hcSpec(o),
      outlier: o.outlier ? { consecutiveErrors: 5, ejectS: 30 } : undefined,
      overhead: { kind: "const", value: 0.0004 },
      costPerMonth: o.withAlbCost === false ? 0 : albMonthly(),
    },
    ...o.servers.map(
      (s): ServerSpec => ({
        kind: "server",
        id: s.id,
        label: s.label,
        cores: s.cores,
        workers: s.workers,
        instance: s.instance,
        costPerMonth: s.costPerMonth,
        steps,
        session,
        bootS: s.bootS ?? 60,
        failure: s.slowFactor || s.down ? { slowFactor: s.slowFactor, down: s.down } : undefined,
      }),
    ),
  ];
  if (o.session === "redis") {
    const r = REDIS_NODES.find((x) => x.name === (o.redisNode ?? "cache.t4g.small")) ?? REDIS_NODES[1]!;
    nodes.push({
      kind: "db",
      id: "redis",
      label: "redis",
      cores: 1,
      workers: 10_000,
      steps: [{ kind: "cpu", dist: { kind: "const", value: 0.00005 } }],
      costPerMonth: monthly(r.usdPerHour),
    });
  }
  return { nodes, script: scriptPatches(o.script, o.servers) };
}

/** Flow-view layout for a fleet: users | lb | servers column | redis. */
export function fleetLayout(o: Pick<FleetOptions, "servers" | "session">): { nodes: import("@/ui/flow/FlowView").FlowNode[]; edges: import("@/ui/flow/FlowView").FlowEdge[] } {
  const n = o.servers.length;
  const top = 300 - ((n - 1) * 120) / 2;
  const nodes: import("@/ui/flow/FlowView").FlowNode[] = [
    { id: "users", label: "users", kind: "client", x: 60, y: 300 },
    { id: "lb", label: "ALB", kind: "lb", x: 300, y: 300 },
    ...o.servers.map((s, i) => ({
      id: s.id,
      label: s.label,
      kind: "server" as const,
      x: 620,
      y: top + i * 120,
      workers: s.workers,
      cores: s.cores,
      sub: s.instance ? `${s.instance}` : `${s.workers} workers · ${s.cores} vCPU`,
    })),
  ];
  const edges = [{ from: "users", to: "lb" }, ...o.servers.map((s) => ({ from: "lb", to: s.id }))];
  if (o.session === "redis") {
    nodes.push({ id: "redis", label: "redis", kind: "cache", x: 900, y: 300 });
    for (const s of o.servers) edges.push({ from: s.id, to: "redis" });
  }
  return { nodes, edges };
}

export { DistSchema };
