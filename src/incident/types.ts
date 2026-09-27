/**
 * Incident Room scenario model. Incidents are code (they generate logs and command output from live
 * sim state), so they're TypeScript modules rather than Zod-validated data.
 */
import type { CastLine } from "@/content/schema";
import type { SimPatch, SimSpec, WindowMetrics } from "@/engine/types";

export type LogSource = "nginx" | "gunicorn" | "alb" | "asg" | "deploy" | "cron" | "postgres" | "app";
export type LogLevel = "INFO" | "WARN" | "ERROR" | "CRIT";

export interface LogLine {
  /** Sim seconds; negative = before the sim started. */
  t: number;
  host: string;
  source: LogSource;
  level: LogLevel;
  text: string;
  /** Evidence category this line supports (pinnable). */
  evidence?: string;
}

export interface Evidence {
  id: string;
  label: string;
  /** Key evidence for the true root cause; false = red herring. */
  key: boolean;
}

export interface CommandResult {
  out: string;
  evidence?: string;
}

export interface HostCommand {
  cmd: string;
  describe: string;
  run: (host: string, state: IncidentState) => CommandResult;
}

export interface IncidentState {
  t: number;
  applied: string[];
  last?: WindowMetrics;
}

export interface Mitigation {
  id: string;
  label: string;
  detail: string;
  /** Seconds of sim time before the change takes effect (a real action takes time). */
  takesS: number;
  kind: "fix" | "mitigate" | "neutral" | "harmful";
  patches: (state: IncidentState) => { delay: number; patch: SimPatch }[];
  /** Shown in the event feed once it lands. */
  note: string;
}

export interface Hypothesis {
  id: string;
  label: string;
  correct: boolean;
}

export interface Trace {
  id: string;
  title: string;
  status: number;
  spans: { name: string; start: number; ms: number; depth: number; kind: "net" | "queue" | "cpu" | "db" | "cache" }[];
  evidence?: string;
}

export interface Incident {
  id: string;
  code: string;
  title: string;
  severity: "SEV-1" | "SEV-2";
  /** Wall-clock at sim t = 0, "HH:MM:SS" IST. */
  clock0: string;
  pageAt: number;
  page: { title: string; detail: string };
  intro: CastLine[];
  spec: SimSpec;
  seed: string;
  slo: { p99: number; errorRate: number };
  hosts: string[];
  services: string[];
  staticLogs: LogLine[];
  liveLogs: (w: WindowMetrics, rand: () => number) => LogLine[];
  commands: HostCommand[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  mitigations: Mitigation[];
  traces: Trace[];
  timeline: { t: number; label: string; kind: "deploy" | "scale" | "cron" | "page" }[];
  /** Extra dashboard series not modelled by the sim (e.g. database CPU), as a function of sim time. */
  extraSeries: { id: string; label: string; unit: "%" | "ms"; at: (t: number) => number }[];
  postmortem: { rubric: { id: string; criterion: string }[]; exemplar: string };
  hints: string[];
  /** Concepts this incident exercises (transfer credit). */
  exercises: string[];
}
