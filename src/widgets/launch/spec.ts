/**
 * Launch Day boss: every Chapter 1 idea at once. Pure scenario builder (widget + verifiers).
 */
import { z } from "zod";
import { albMonthly, instance, monthly, REDIS_NODES } from "@/engine/catalog";
import type { LbAlgorithm, ServerSpec, SimSpec } from "@/engine/types";
import { buildFleet, serverId, serversFor, type FleetOptions, type HcMode, type SessionMode } from "../fleet/spec";
import { DistSchema } from "../queue-lab/spec";

export const LaunchConfig = z.object({
  cpu: DistSchema,
  io: DistSchema,
  baseRps: z.number().default(50),
  peakRps: z.number().default(400),
  spikeRps: z.number().default(650),
  users: z.number().default(5000),
  durationS: z.number().default(240),
  fromS: z.number().default(10),
  budget: z.number().default(600),
  reservedGiB: z.number().default(1.5),
  workerMb: z.number().default(150),
  sloP99: z.number().default(0.6),
  seed: z.string().default("launch-day"),
  instances: z.array(z.string()).default(["m7i.large", "m7i.xlarge", "m7i.2xlarge"]),
});
export type LaunchConfig = z.infer<typeof LaunchConfig>;

export interface LaunchDesign {
  instance: string;
  count: number;
  workers: number;
  algorithm: LbAlgorithm;
  outlier: boolean;
  hc: HcMode;
  session: Exclude<SessionMode, "none">;
}

export const DEFAULT_DESIGN: LaunchDesign = { instance: "m7i.large", count: 2, workers: 5, algorithm: "round-robin", outlier: false, hc: "shallow", session: "local" };

export const TIMELINE = [
  { t: 0, label: "Product Hunt goes live" },
  { t: 40, label: "Front page: 400 req/s" },
  { t: 80, label: "app-2 gets a noisy neighbour" },
  { t: 100, label: "Kabir tweets: spike to 650 req/s" },
  { t: 150, label: "app-1: gunicorn crashes" },
  { t: 190, label: "Hotfix deploy: app-3 restarts" },
];

export function memPerBox(c: LaunchConfig, d: LaunchDesign): { used: number; total: number } {
  return { used: c.reservedGiB + (d.workers * c.workerMb) / 1024, total: instance(d.instance).memGiB };
}

export function designCost(d: LaunchDesign): number {
  const it = instance(d.instance);
  return monthly(it.usdPerHour) * d.count + albMonthly() + (d.session === "redis" ? monthly(REDIS_NODES[1]!.usdPerHour) : 0);
}

export function launchOptions(c: LaunchConfig, d: LaunchDesign): FleetOptions {
  const servers = serversFor(d.instance, d.count, 20).map((s) => ({ ...s, workers: d.workers }));
  const rate: FleetOptions["rate"] = {
    kind: "keyframes",
    points: [
      [0, c.baseRps],
      [40, c.peakRps],
      [100, c.peakRps],
      [108, c.spikeRps],
      [128, c.spikeRps],
      [138, c.peakRps],
      [c.durationS, c.peakRps],
    ],
  };
  const script: FleetOptions["script"] = [];
  if (d.count >= 2) script.push({ t: 80, server: 1, kind: "slow", factor: 5, note: "app-2: noisy neighbour, 5× slower" });
  script.push({ t: 150, server: 0, kind: "crash", note: "app-1: gunicorn crashed, nginx returns instant 502s" });
  if (d.count >= 3) script.push({ t: 190, server: 2, kind: "deploy", note: "hotfix deploy: app-3 drained and restarting" });
  return {
    servers,
    algorithm: d.algorithm,
    hc: d.hc,
    hcIntervalS: 5,
    hcThreshold: 2,
    outlier: d.outlier,
    session: d.session,
    rate,
    users: c.users,
    cpu: c.cpu,
    io: c.io,
    timeoutS: 10,
    retry: { maxAttempts: 2, backoff: "constant", baseS: 0.1, capS: 0.1, jitter: "full" },
    script,
  };
}

export function launchSpec(c: LaunchConfig, d: LaunchDesign): SimSpec {
  return buildFleet(launchOptions(c, d));
}

/** A server spec for the "launch another box" live action. */
export function extraServer(c: LaunchConfig, d: LaunchDesign, index: number): ServerSpec {
  const base = launchSpec(c, d).nodes.find((n) => n.kind === "server") as ServerSpec;
  const it = instance(d.instance);
  return { ...base, id: serverId(index), label: serverId(index), failure: undefined, costPerMonth: monthly(it.usdPerHour) };
}

export { serversFor };
