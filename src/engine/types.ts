/**
 * Simulation specs (inputs) and metrics (outputs). Plain data: serialisable across the worker boundary.
 */
import type { Dist } from "./dist";
import type { RateCurve } from "./traffic";

export type NodeKind = "client" | "lb" | "server" | "db" | "cache";

export type FailReason = "timeout" | "rejected" | "error" | "session" | "down";
export const FAIL_REASONS: FailReason[] = ["timeout", "rejected", "error", "session", "down"];

interface BaseSpec {
  id: string;
  label?: string;
  /** USD per month, on-demand. */
  costPerMonth?: number;
}

export interface RetryPolicy {
  /** Total attempts including the first (1 = no retries). */
  maxAttempts: number;
  backoff: "constant" | "exponential";
  baseS: number;
  capS: number;
  jitter: "none" | "full" | "equal";
  retryOn?: FailReason[];
}

export interface ClientSpec extends BaseSpec {
  kind: "client";
  target: string;
  rate: RateCurve;
  /** Live multiplier on the rate curve (a slider). Default 1. */
  rateScale?: number;
  /** Distinct users; each request carries a uniformly chosen user id. Default 10,000. */
  users?: number;
  /** Zipf keyspace for caching and sharding. Default n=100,000, s=0.99. */
  keys?: { n: number; s: number };
  /** Fraction of requests that are writes. Default 0. */
  writeFraction?: number;
  /** Per-attempt client timeout. Default 10s. */
  timeoutS?: number;
  retry?: RetryPolicy;
}

export type LbAlgorithm = "round-robin" | "random" | "least-outstanding" | "p2c" | "sticky";

export interface HealthCheckSpec {
  intervalS: number;
  timeoutS: number;
  unhealthyThreshold: number;
  healthyThreshold: number;
  /** Deep checks run the real request path (and queue behind real traffic). Shallow checks only see "process is up". */
  deep: boolean;
}

export interface LbSpec extends BaseSpec {
  kind: "lb";
  targets: string[];
  algorithm: LbAlgorithm;
  overhead?: Dist;
  healthCheck?: HealthCheckSpec;
}

export type Step =
  /** Needs a CPU core (queues in the run-queue when all cores are busy). */
  | { kind: "cpu"; dist: Dist }
  /** Local waiting that holds a worker but not a core (disk, sleep, a slow syscall). */
  | { kind: "io"; dist: Dist }
  /** Synchronous call to another node; the worker is held until it returns. */
  | { kind: "call"; target: string; prob?: number }
  /** Parallel calls; waits for all of them. */
  | { kind: "fanout"; targets: string[] }
  /** Look up the user's session (local memory or an external store, per the server's session config). */
  | { kind: "session" };

export interface FailureSpec {
  down?: boolean;
  /** Multiplies every service/io time (a noisy neighbour, a bad disk, GC). */
  slowFactor?: number;
  /** Probability a request fails after doing its work. */
  errorRate?: number;
}

export interface ServerSpec extends BaseSpec {
  kind: "server" | "db";
  /** CPU cores (vCPUs). */
  cores: number;
  /** Concurrency: worker processes/threads, or DB connections. */
  workers: number;
  /** Max waiting requests before new ones are rejected. Default: unbounded. */
  queueLimit?: number;
  steps: Step[];
  /** Program for write requests; defaults to `steps`. */
  writeSteps?: Step[];
  failure?: FailureSpec;
  session?: { mode: "local" } | { mode: "external"; store: string };
  /** Seconds to come back after a restart. Default 20. */
  bootS?: number;
  /** Informational: instance type name from the catalog. */
  instance?: string;
}

export interface CacheSpec extends BaseSpec {
  kind: "cache";
  /** Entries. */
  capacity: number;
  ttlS?: number;
  /** Latency of a cache operation (hit or the miss check). */
  op: Dist;
  /** Node that serves misses. */
  backing: string;
  cores?: number;
  failure?: FailureSpec;
}

export type NodeSpec = ClientSpec | LbSpec | ServerSpec | CacheSpec;

export interface SimSpec {
  nodes: NodeSpec[];
  /** Metrics window, seconds. Default 1. */
  windowS?: number;
  /** One-way network latency per hop, seconds. Default 0.25ms (intra-AZ). */
  hopS?: number;
  /** Probability a request is tracked as a visible particle. Default 0 (host adjusts). */
  vizRate?: number;
  /** Scripted events (part of the scenario, so replays reproduce them without logging). */
  script?: { t: number; patch: SimPatch; note?: string }[];
}

export type SimPatch =
  | { op: "set"; node: string; changes: Record<string, unknown> }
  | { op: "add"; spec: NodeSpec }
  | { op: "remove"; node: string }
  /** Crash + reboot: down for bootS, local state (sessions, cache) wiped. */
  | { op: "restart"; node: string }
  | { op: "vizRate"; value: number };

export interface TimedPatch {
  t: number;
  patch: SimPatch;
}

// ---------- outputs ----------

export interface NodeWindow {
  /** Busy cores / cores (CPU saturation). */
  util: number;
  /** Busy workers / workers (concurrency saturation). */
  workerUtil: number;
  /** Time-averaged queue length. */
  queue: number;
  queueMax: number;
  /** Time-averaged requests in the node (queued + in service). */
  inflight: number;
  arrivals: number;
  completed: number;
  rejected: number;
  errors: number;
  /** Node-local latency (queue + service + downstream waits). */
  p50: number;
  p99: number;
  up: boolean;
  /** LB only: healthy target ids. */
  healthy?: string[];
  /** Cache only. */
  hits?: number;
  misses?: number;
}

export interface WindowMetrics {
  t: number;
  dt: number;
  /** New user requests (not attempts). */
  arrivals: number;
  attempts: number;
  ok: number;
  failed: number;
  failReasons: Record<FailReason, number>;
  /** Attempt-level client timeouts (including ones that were retried). */
  timeouts: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  max: number;
  throughput: number;
  errorRate: number;
  costPerMonth: number;
  nodes: Record<string, NodeWindow>;
  /** Sparse latency histogram of successful requests: [bucket, count] pairs. */
  hist: [number, number][];
}

export type NotableKind =
  | "saturated"
  | "recovered"
  | "queue-overflow"
  | "timeouts"
  | "retry-amplification"
  | "session-loss"
  | "health-eject"
  | "health-restore"
  | "node-down"
  | "node-up"
  | "patch";

export interface NotableEvent {
  t: number;
  kind: NotableKind;
  node?: string;
  detail: string;
}

export interface Aggregate {
  from: number;
  to: number;
  arrivals: number;
  attempts: number;
  ok: number;
  failed: number;
  failReasons: Record<FailReason, number>;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  throughput: number;
  errorRate: number;
  /** ok / (ok + failed). */
  availability: number;
  /** Fraction of all finished requests that succeeded within `sloS` (1 if no sloS given). */
  sloGood: number;
  sloS?: number;
  costPerMonth: number;
  /** Time-averaged utilization per node over the range. */
  util: Record<string, number>;
}

/** Particle states for the flow view. */
export const VizState = {
  Queued: 0,
  Service: 1,
  /** Parked at a node while a downstream call is in progress. */
  Waiting: 2,
  Done: 3,
  Failed: 4,
  /** The client gave up (timeout) but the server is still doing the work. */
  Orphan: 5,
} as const;
export type VizStateCode = (typeof VizState)[keyof typeof VizState];

/** One tracked request in a particle snapshot. */
export interface VizParticle {
  id: number;
  node: string;
  state: VizStateCode;
  /** Seconds since the user's request started (drives colour). */
  age: number;
  /** Sim time the particle entered its current state (for queue ordering). */
  since: number;
  /** 1 if this is a retry attempt. */
  retry: 0 | 1;
}
