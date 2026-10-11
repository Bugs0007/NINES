/**
 * INC-0014 · Production: The Unreachable t3.micro.
 *
 * The whole product runs on one t3.micro (2 vCPUs, 20% baseline, burstable). It has been above baseline for a week, a
 * nightly report job and a traffic bump finished off the CPU credit balance at 13:40, and the instance is now held to
 * 20% of one vCPU's worth of baseline. Everything takes ten times as long: requests queue, workers fill, health checks
 * time out, and SSH connections stall until they time out, so the instance looks unreachable.
 * Red herrings: a security-group edit that morning and an unattended-upgrades run.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const web = (slow = 10): ServerSpec => ({
  kind: "server",
  id: "web",
  label: "t3.micro",
  cores: 2,
  workers: 20,
  queueLimit: 60,
  steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.012, p99: 0.05 } }],
  failure: slow === 1 ? undefined : { slowFactor: slow },
  bootS: 40,
  instance: "t3.micro",
});

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", target: "web", rate: { kind: "const", rps: 40 }, users: 2000, timeoutS: 5 },
      web(),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -86400 * 7, host: "cloudwatch", source: "app", level: "INFO", text: "CPUUtilization avg 26% for 7 days (baseline for t3.micro: 20%); CPUCreditBalance falling 11 credits/hour", evidence: "above-baseline" },
  { t: -9000, host: "web", source: "cron", level: "INFO", text: "03:00 nightly-report started (pandas, single process), finished in 49 min (was 11 min)", evidence: "report-job" },
  { t: -7200, host: "ops", source: "app", level: "INFO", text: "aws ec2 authorize-security-group-ingress: added 203.0.113.0/24 tcp/22 (office VPN)", evidence: "sg-change" },
  { t: -3600, host: "web", source: "app", level: "INFO", text: "unattended-upgrades: installed 4 packages (libssl3, curl...), no reboot required", evidence: "upgrades" },
  { t: -1500, host: "cloudwatch", source: "app", level: "WARN", text: "CPUCreditBalance 0.0 since 13:40; CPUSurplusCreditBalance n/a (credit specification: standard)", evidence: "credits-zero" },
  { t: -600, host: "web", source: "nginx", level: "WARN", text: "upstream timed out (110: Connection timed out) while reading response header; request time 9.8 s", evidence: "slow" },
  { t: -300, host: "web", source: "app", level: "WARN", text: "top: %Cpu(s): 12.0 us, 0.0 sy, 88.0 st (steal) - hypervisor is withholding cpu", evidence: "steal" },
  { t: -60, host: "alb", source: "alb", level: "ERROR", text: "target web unhealthy: health check timed out 5/5 (timeout 5 s)", evidence: "slow" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 3 === 0) out.push({ t: w.t + rand(), host: "web", source: "nginx", level: "WARN", text: "upstream timed out (110: Connection timed out); request time " + (8 + rand() * 2).toFixed(1) + " s", evidence: "slow" });
  if (Math.floor(w.t) % 8 === 0) out.push({ t: w.t + 0.5, host: "ops", source: "app", level: "ERROR", text: "ssh: connect to host web port 22: Connection timed out (banner exchange took 31 s)", evidence: "ssh-timeout" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const PROD_T3: Incident = {
  id: "prod-t3-unreachable",
  code: "INC-0014",
  title: "Production: The Unreachable t3.micro",
  severity: "SEV-1",
  clock0: "14:10:00",
  pageAt: 90,
  page: { title: "Site down, server unreachable over SSH", detail: "Health checks time out, SSH hangs, the instance shows 'running' with no status-check failures." },
  intro: [
    { speaker: "pager", line: "SEV-1: the site is down and you cannot log in. The EC2 console says running, 2/2 checks passed." },
    { speaker: "meera", line: "A machine can be on and still not given any CPU. Look at what the cloud, not the box, says about it." },
  ],
  spec: spec(),
  seed: "prod-t3-unreachable",
  service: "the site",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "Credit exhaustion is modelled as every CPU operation taking ten times as long; real throttling holds the instance to its baseline share and the slowdown depends on how much CPU each request needs.",
    "SSH and health checks stall for the same reason as web requests; the sim only shows the web side.",
  ],
  hosts: ["web", "cloudwatch"],
  services: ["web", "alb"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("the instance", ["web"], (id, nw) => (nw.util > 0.8 ? "steal" : undefined), {
    nodes: [
      { id: "users", label: "users", kind: "client", x: 100, y: 300 },
      { id: "web", label: "t3.micro", kind: "server", x: 560, y: 300, workers: 20, cores: 2 },
    ],
    edges: [{ from: "users", to: "web" }],
  }),
  commands: [
    {
      cmd: "aws cloudwatch get-metric-statistics --metric-name CPUCreditBalance --period 300 --statistics Minimum",
      describe: "CPU credit balance",
      run: (h, s) => ({ out: has(s, "unlimited", "resize") ? "13:40 0.0\n14:10 18.0  (rising; credits earned at baseline)" : "13:00 41.2\n13:30 4.9\n13:40 0.0\n14:10 0.0", evidence: has(s, "unlimited", "resize") ? undefined : "credits-zero" }),
    },
    { cmd: "aws ec2 describe-instance-credit-specifications", describe: "credit mode", run: (h, s) => ({ out: has(s, "unlimited") ? "i-0b3a CpuCredits: unlimited" : "i-0b3a CpuCredits: standard   (throttles at zero credits)", evidence: has(s, "unlimited") ? undefined : "credits-zero" }) },
    { cmd: "top -bn1 | head -4", describe: "CPU on the box", run: (h, s) => ({ out: has(s, "unlimited", "resize", "stop-job") ? "%Cpu(s): 31.0 us, 3.0 sy, 0.0 st, 66.0 id" : "%Cpu(s): 12.0 us, 0.0 sy, 0.0 ni, 0.0 id, 0.0 wa, 0.0 hi, 88.0 st", evidence: has(s, "unlimited", "resize", "stop-job") ? undefined : "steal" }) },
    { cmd: "sudo journalctl -u nightly-report --since 03:00", describe: "the nightly job", run: () => ({ out: "03:00 started\n03:49 finished (49 min; usually 11)", evidence: "report-job" }) },
    { cmd: "aws ec2 describe-security-groups --group-ids sg-0a1", describe: "security group rules", run: () => ({ out: "tcp/22 from 203.0.113.0/24 (added 12:10), tcp/443 from 0.0.0.0/0\n(rule is correct for the office VPN)", evidence: "sg-change" }) },
    uptime((h, s) => (has(s, "unlimited", "resize") ? 0.5 : 14.2)),
    free(() => 520),
    df(),
  ],
  evidence: [
    { id: "credits-zero", label: "CPUCreditBalance is zero since 13:40 on a standard-mode burstable instance", key: true },
    { id: "steal", label: "88% of CPU time is steal: the hypervisor is withholding CPU", key: true },
    { id: "above-baseline", label: "The instance has run above its 20% baseline for a week", key: true },
    { id: "report-job", label: "The nightly report takes 49 minutes instead of 11", key: false },
    { id: "ssh-timeout", label: "SSH stalls and times out", key: false },
    { id: "sg-change", label: "A security group rule was added this morning", key: false },
    { id: "upgrades", label: "Unattended upgrades ran an hour ago", key: false },
  ],
  hypotheses: [
    { id: "credits", label: "The burstable instance exhausted its CPU credits and is throttled to baseline, so everything including SSH crawls", correct: true },
    { id: "sg", label: "The security group change blocked SSH and the site", correct: false },
    { id: "upgrade", label: "A package upgrade broke the web server", correct: false },
    { id: "oom", label: "The instance ran out of memory", correct: false },
    { id: "net", label: "An AWS network problem in the availability zone", correct: false },
  ],
  mitigations: [
    {
      id: "unlimited",
      label: "Switch the instance to unlimited credit mode",
      detail: "Bursts above baseline are allowed and billed per vCPU-hour.",
      takesS: 20,
      kind: "fix",
      patches: () => [{ delay: 20, patch: { op: "set", node: "web", changes: { failure: { slowFactor: 1 } } } }],
      note: "modify-instance-credit-specification --cpu-credits unlimited. CPU is available at once; surplus credits are billed at $0.05 per vCPU-hour.",
    },
    {
      id: "resize",
      label: "Stop the instance and change it to an m6i.large",
      detail: "A fixed-performance instance. Takes a stop and a start.",
      takesS: 100,
      kind: "mitigate",
      patches: () => [{ delay: 100, patch: { op: "set", node: "web", changes: { failure: { slowFactor: 1 }, cores: 2, workers: 40 } } }],
      note: "instance type t3.micro -> m6i.large (two vCPUs at full speed, 8 GiB). About 90 seconds of downtime during the stop/start.",
    },
    {
      id: "stop-job",
      label: "Kill the nightly report and disable its cron entry",
      detail: "Removes the heaviest consumer; the web app still has to run on baseline.",
      takesS: 10,
      kind: "neutral",
      patches: () => [],
      note: "report job stopped. With zero credits the instance is still limited to its 20% baseline, which cannot serve 40 requests a second.",
    },
    { ...decoy("reboot", "Reboot the instance", "Restart from the console.", "Rebooted. Credits are still zero, so the instance is throttled again as soon as it is busy.", 60), patches: () => [{ delay: 60, patch: { op: "restart", node: "web" } }] },
    { ...decoy("add-instance", "Launch a second t3.micro behind the load balancer", "Share the load.", "Second instance joining: it starts with launch credits for a short while, then the same thing happens, and the first stays throttled.", 60, "harmful"), patches: () => [] },
    decoy("revert-sg", "Revert the security group change", "Remove the new SSH rule.", "Rule reverted. The office VPN loses SSH access; nothing else changes.", 15),
    decoy("rollback-upgrade", "Downgrade the upgraded packages", "Revert libssl3 and curl.", "Packages downgraded. The slowness is the CPU limit, not the packages.", 120),
  ],
  traces: [
    {
      id: "slow",
      title: "GET /api/orders · 504 · nginx",
      status: 504,
      evidence: "slow",
      spans: [
        { name: "nginx → gunicorn", start: 0, ms: 9800, depth: 0, kind: "net" },
        { name: "handler (CPU time 12 ms, wall time 9.7 s: throttled)", start: 3, ms: 9780, depth: 1, kind: "cpu" },
      ],
    },
    {
      id: "ok",
      title: "GET /api/orders · 200 · nginx (13:15, credits positive)",
      status: 200,
      spans: [
        { name: "nginx → gunicorn", start: 0, ms: 34, depth: 0, kind: "net" },
        { name: "handler (CPU time 12 ms)", start: 3, ms: 30, depth: 1, kind: "cpu" },
      ],
    },
  ],
  timeline: [
    { t: -604800, label: "CPU above baseline all week", kind: "scale" },
    { t: -9000, label: "nightly report starts (49 min)", kind: "cron" },
    { t: -7200, label: "security group rule added", kind: "deploy" },
    { t: -1500, label: "credits hit zero", kind: "scale" },
    { t: 90, label: "Page: site down, SSH unreachable", kind: "page" },
  ],
  extraSeries: [{ id: "credits", label: "CPU credit balance (percent of max)", unit: "%", at: (t) => (t < -3600 ? Math.max(0, 80 + t / 800) : t < -1500 ? Math.max(0, 25 + (t + 3600) / 100 * 0.1) : 0) }],
  evidenceVia: ["credits-zero", "steal", "above-baseline", "ssh-timeout"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: site down and the server unreachable, with the time window" },
      { id: "cause", criterion: "Root cause: a burstable t3.micro ran above its baseline for a week, its CPU credits reached zero, and in standard mode it was throttled to baseline so requests, health checks and SSH all stalled" },
      { id: "detect", criterion: "Why it was confusing: the instance was running with passing status checks; CPUCreditBalance and steal time, not logs or the security group, showed the cause" },
      { id: "prevent", criterion: "Prevention: alarm on CPUCreditBalance, size by sustained CPU not peak, unlimited mode or a non-burstable type for always-on workloads, and keep batch jobs off the serving host" },
      { id: "mitigate", criterion: "States what worked (unlimited mode or a larger fixed-performance instance) and why killing the job or rebooting did not" },
    ],
    exemplar:
      "What happened: From 14:10 the site was down and the server unreachable over SSH. Root cause: the single t3.micro had run above its 20% CPU baseline for a week, a longer nightly report and a traffic bump took its credit balance to zero at 13:40, and in standard credit mode the hypervisor then withheld CPU (88% steal). Requests, health checks and SSH all stalled together. The security group edit and package upgrade were unrelated. Mitigation: switching to unlimited mode gave CPU back immediately; resizing to a fixed-performance type was the durable fix. Killing the report or rebooting did not help, since the balance was already zero. Prevention: alarm on CPU credit balance, size for sustained load, and run batch jobs elsewhere.",
  },
  hints: [
    "The instance is running and status checks pass, yet nothing responds. What could be withholding the CPU?",
    "Ask CloudWatch about the credit balance and look at steal time on the box.",
    "Which of today's changes could not slow a machine down, and which could not be reversed by rebooting?",
  ],
  exercises: ["memory-oom", "cpu-credits", "reading-logs"],
};
