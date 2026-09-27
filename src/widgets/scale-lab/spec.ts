/** Pure scenarios for Scale Lab (shared by the widget and content verifiers). */
import { z } from "zod";
import { instance, monthly } from "@/engine/catalog";
import type { SimSpec } from "@/engine/types";
import { buildFleet, serversFor, type FleetOptions } from "../fleet/spec";
import { DistSchema } from "../queue-lab/spec";

export const ScaleConfig = z.object({
  variant: z.enum(["compare", "hug"]),
  cpu: DistSchema,
  // compare
  bigInstance: z.string().default("m7i.2xlarge"),
  smallInstance: z.string().default("m7i.large"),
  smallCount: z.number().default(4),
  // hug
  peakRps: z.number().default(300),
  baseRps: z.number().default(30),
  durationS: z.number().default(150),
  fromS: z.number().default(10),
  crashAt: z.number().default(60),
  hcIntervalS: z.number().default(5),
  sloP99: z.number().default(0.2),
  seed: z.string().default("scale"),
  instances: z.array(z.string()).default(["m7i.large", "m7i.xlarge", "m7i.2xlarge", "m7i.4xlarge"]),
});
export type ScaleConfig = z.infer<typeof ScaleConfig>;

/** Same vCPUs and traffic: one big box vs N small boxes behind round-robin. `load` is utilization. */
export function compareSpecs(c: ScaleConfig, load: number): { big: SimSpec; small: SimSpec } {
  const big = instance(c.bigInstance);
  const small = instance(c.smallInstance);
  const rps = (load * big.vcpu) / 0.019;
  return {
    big: buildFleet({
      servers: [{ id: "big", label: "big box", cores: big.vcpu, workers: 2 * big.vcpu + 1, instance: big.name, costPerMonth: monthly(big.usdPerHour), bootS: 90 }],
      algorithm: "round-robin",
      hc: "off",
      session: "none",
      rate: { kind: "const", rps },
      cpu: c.cpu,
      withAlbCost: false,
    }),
    small: buildFleet({ servers: serversFor(small.name, c.smallCount, 90), algorithm: "round-robin", hc: "shallow", hcIntervalS: 5, session: "none", rate: { kind: "const", rps }, cpu: c.cpu }),
  };
}

export function hugOptions(c: ScaleConfig, inst: string, count: number): FleetOptions {
  return {
    servers: serversFor(inst, count, 90),
    algorithm: "round-robin",
    hc: "shallow",
    hcIntervalS: c.hcIntervalS,
    hcThreshold: 2,
    session: "none",
    rate: {
      kind: "keyframes",
      points: [
        [0, c.baseRps],
        [30, c.peakRps],
        [c.durationS, c.peakRps],
      ],
    },
    cpu: c.cpu,
    timeoutS: 10,
    retry: { maxAttempts: 2, backoff: "constant", baseS: 0.1, capS: 0.1, jitter: "full" },
    script: [{ t: c.crashAt, server: 0, kind: "crash", note: "app-1: hardware failure (instance retired)" }],
  };
}

