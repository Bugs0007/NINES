/** Pure scenarios for Session Lab (shared by the widget and content verifiers). */
import { z } from "zod";
import { buildFleet, serversFor, type FleetOptions, type SessionMode } from "../fleet/spec";
import { DistSchema } from "../queue-lab/spec";

export const SessionConfig = z.object({
  variant: z.enum(["lab", "deploy"]),
  cpu: DistSchema,
  instance: z.string().default("m7i.large"),
  rps: z.number().default(150),
  users: z.number().default(3000),
  durationS: z.number().default(120),
  fromS: z.number().default(10),
  seed: z.string().default("sessions"),
});
export type SessionConfig = z.infer<typeof SessionConfig>;

export const MODE_LABEL: Record<Exclude<SessionMode, "none">, string> = {
  local: "in memory",
  sticky: "sticky + memory",
  redis: "redis",
  cookie: "signed cookie",
};

/** Lab: four boxes built, the first `active` in rotation. */
export function labOptions(c: SessionConfig, mode: Exclude<SessionMode, "none">): FleetOptions {
  const servers = serversFor(c.instance, 4, 15);
  return {
    servers,
    algorithm: "round-robin",
    hc: "shallow",
    hcIntervalS: 5,
    session: mode,
    rate: { kind: "const", rps: c.rps },
    users: c.users,
    cpu: c.cpu,
    timeoutS: 5,
  };
}

export function labSpec(c: SessionConfig, mode: Exclude<SessionMode, "none">, active: number) {
  const o = labOptions(c, mode);
  const spec = buildFleet(o);
  const lb = spec.nodes.find((n) => n.id === "lb");
  if (lb && lb.kind === "lb") lb.targets = o.servers.slice(0, active).map((s) => s.id);
  return spec;
}

/** Challenge: three boxes, a rolling deploy one box at a time. */
export function deployOptions(c: SessionConfig, mode: Exclude<SessionMode, "none">): FleetOptions {
  return {
    servers: serversFor(c.instance, 3, 15),
    algorithm: "round-robin",
    hc: "shallow",
    hcIntervalS: 5,
    hcThreshold: 2,
    session: mode,
    rate: { kind: "const", rps: c.rps },
    users: c.users,
    cpu: c.cpu,
    timeoutS: 5,
    script: [
      { t: 25, server: 0, kind: "deploy", note: "deploy v42: app-1 drained and restarting" },
      { t: 55, server: 1, kind: "deploy", note: "deploy v42: app-2 drained and restarting" },
      { t: 85, server: 2, kind: "deploy", note: "deploy v42: app-3 drained and restarting" },
    ],
  };
}
