/** Pure scenarios for LB Lab (shared by the widget and content verifiers). */
import { z } from "zod";
import type { LbAlgorithm } from "@/engine/types";
import { buildFleet, serversFor, type FleetOptions, type HcMode } from "../fleet/spec";
import { DistSchema } from "../queue-lab/spec";

export const LbConfig = z.object({
  variant: z.enum(["lab", "noisy"]),
  cpu: DistSchema,
  instance: z.string().default("m7i.large"),
  count: z.number().default(4),
  rps: z.number().default(200),
  slowFactor: z.number().default(6),
  slowAt: z.number().default(30),
  crashAt: z.number().default(70),
  durationS: z.number().default(130),
  fromS: z.number().default(10),
  sloP99: z.number().default(0.4),
  seed: z.string().default("lb"),
});
export type LbConfig = z.infer<typeof LbConfig>;

export interface LbChoice {
  algorithm: LbAlgorithm;
  hc: HcMode;
  outlier: boolean;
}

export function noisyOptions(c: LbConfig, ch: LbChoice): FleetOptions {
  return {
    servers: serversFor(c.instance, c.count, 60),
    algorithm: ch.algorithm,
    hc: ch.hc,
    hcIntervalS: 10,
    hcThreshold: 2,
    outlier: ch.outlier,
    session: "none",
    rate: { kind: "const", rps: c.rps },
    cpu: c.cpu,
    timeoutS: 5,
    script: [
      { t: c.slowAt, server: 1, kind: "slow", factor: c.slowFactor, note: "app-2: noisy neighbour, everything 6× slower" },
      { t: c.crashAt, server: 2, kind: "crash", note: "app-3: gunicorn crashed, nginx returns instant 502s" },
    ],
  };
}

export function labSpec(c: LbConfig) {
  return buildFleet({ servers: serversFor(c.instance, c.count, 30), algorithm: "round-robin", hc: "off", session: "none", rate: { kind: "const", rps: c.rps }, cpu: c.cpu, timeoutS: 10 });
}
