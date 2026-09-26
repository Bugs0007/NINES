/**
 * Pure scenario builders for Queue Lab. Shared by the widget and by content verifiers,
 * so a pack's claims are tested against exactly what the player runs.
 */
import { z } from "zod";
import { mean, type Dist } from "@/engine/dist";
import type { RateCurve } from "@/engine/traffic";
import type { SimSpec } from "@/engine/types";

export const DistSchema: z.ZodType<Dist> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("const"), value: z.number() }),
    z.object({ kind: z.literal("exp"), mean: z.number() }),
    z.object({ kind: z.literal("uniform"), min: z.number(), max: z.number() }),
    z.object({ kind: z.literal("lognormal"), median: z.number(), p99: z.number() }),
    z.object({ kind: z.literal("pareto"), min: z.number(), alpha: z.number(), max: z.number() }),
    z.object({ kind: z.literal("mix"), p: z.number(), a: DistSchema, b: DistSchema }),
  ]),
);

export const QueueLabConfig = z.object({
  variant: z.enum(["little", "hockey", "sizing", "capacity"]),
  label: z.string().default("api-1"),
  /** CPU time per request. */
  cpu: DistSchema.optional(),
  /** Waiting per request that holds a worker but not a core (DB, external calls). */
  io: DistSchema.optional(),
  cores: z.number().default(2),
  workers: z.number().default(4),
  rps: z.number().default(10),
  rpsMax: z.number().default(60),
  // sizing challenge
  ramGiB: z.number().optional(),
  reservedGiB: z.number().optional(),
  workerMb: z.number().optional(),
  maxWorkers: z.number().optional(),
  // capacity challenge
  peakRps: z.number().optional(),
  baseRps: z.number().optional(),
  usdPerCoreMonth: z.number().optional(),
  maxCores: z.number().optional(),
  durationS: z.number().default(70),
  fromS: z.number().default(10),
  sloP99: z.number().optional(),
  seed: z.string().default("queue-lab"),
});
export type QueueLabConfig = z.infer<typeof QueueLabConfig>;

export function serviceMean(c: QueueLabConfig): number {
  return (c.cpu ? mean(c.cpu) : 0) + (c.io ? mean(c.io) : 0);
}

function steps(c: QueueLabConfig) {
  const s = [] as { kind: "cpu" | "io"; dist: Dist }[];
  if (c.cpu) s.push({ kind: "cpu", dist: c.cpu });
  if (c.io) s.push({ kind: "io", dist: c.io });
  return s;
}

/** Live play spec (rate and workers are patched as the player drags). */
export function playSpec(c: QueueLabConfig, rps: number, workers: number, cores: number): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", target: "api", rate: { kind: "const", rps }, timeoutS: 30 },
      { kind: "server", id: "api", label: c.label, cores, workers, steps: steps(c) },
    ],
  };
}

/** Challenge spec: sizing (constant traffic, pick workers) or capacity (a peak, pick vCPUs). */
export function challengeSpec(c: QueueLabConfig, choice: number): { spec: SimSpec; workers: number; cores: number; memGiB: number; costPerMonth: number } {
  const sizing = c.variant === "sizing";
  const workers = choice;
  const cores = sizing ? c.cores : choice;
  const memGiB = sizing ? (c.reservedGiB ?? 1) + (workers * (c.workerMb ?? 150)) / 1024 : 0;
  const costPerMonth = sizing ? 0 : workers * (c.usdPerCoreMonth ?? 36.8);
  const rate: RateCurve = sizing
    ? { kind: "const", rps: c.rps }
    : {
        kind: "keyframes",
        points: [
          [0, c.baseRps ?? 40],
          [30, c.peakRps ?? 140],
          [c.durationS - 10, c.peakRps ?? 140],
          [c.durationS, (c.baseRps ?? 40) * 1.5],
        ],
      };
  return {
    spec: {
      nodes: [
        { kind: "client", id: "users", target: "api", rate, timeoutS: 10 },
        { kind: "server", id: "api", label: c.label, cores, workers, steps: steps(c), costPerMonth },
      ],
    },
    workers,
    cores,
    memGiB,
    costPerMonth,
  };
}
