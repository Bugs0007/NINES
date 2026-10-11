/**
 * INC-0003 · The Migration That Wouldn't Propagate.
 *
 * The API moved to new servers behind a new load balancer. The DNS record was changed at 09:00 with its TTL still at
 * 24 hours, and the old servers were switched off at 11:00. Resolvers and clients that cached the old address at 08:59
 * keep sending traffic to a box that no longer exists, and will until their cache expires tomorrow morning.
 * Red herrings: a deploy of the new service and a certificate that was reissued the day before.
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, tierMap, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const APP = (id: string): ServerSpec => ({ kind: "server", id, label: id, cores: 4, workers: 24, steps: [{ kind: "cpu", dist: { kind: "lognormal", median: 0.012, p99: 0.05 } }], bootS: 30 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "users with fresh DNS", target: "lb", rate: { kind: "const", rps: 90 }, users: 4000, timeoutS: 6 },
      { kind: "client", id: "stale", label: "users with cached DNS", target: "old-1", rate: { kind: "const", rps: 60 }, users: 3000, timeoutS: 6 },
      { kind: "lb", id: "lb", label: "new ALB", targets: ["api-1", "api-2"], algorithm: "round-robin", overhead: { kind: "const", value: 0.0004 } },
      APP("api-1"),
      APP("api-2"),
      { ...APP("old-1"), label: "old-1 (shut down)", failure: { down: true } },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -19800, host: "ci", source: "deploy", level: "INFO", text: "deploy api v3.2.0 to new fleet (api-1, api-2): complete", evidence: "deploy-new" },
  { t: -10800, host: "dns", source: "app", level: "INFO", text: "route53: UPSERT api.pigeon.example A ALIAS new-alb-1182.ap-south-1.elb.amazonaws.com (TTL 86400 unchanged)", evidence: "ttl-86400" },
  { t: -3600, host: "ops", source: "app", level: "INFO", text: "ec2: terminated i-0b77aa (old-1) per migration checklist step 9 'decommission old stack'", evidence: "old-off" },
  { t: -1800, host: "cert", source: "app", level: "INFO", text: "acm: certificate for api.pigeon.example reissued (valid 395 days)", evidence: "cert-reissue" },
  { t: -60, host: "alb", source: "alb", level: "INFO", text: "new-alb: request count steady at 90 rps (expected 150 rps after cut-over; 60 rps missing)", evidence: "missing-traffic" },
  { t: -30, host: "mobile", source: "app", level: "ERROR", text: "client: connect ETIMEDOUT 13.126.44.20:443 (api.pigeon.example resolved from cache 08:41)", evidence: "stale-ip" },
  { t: 20, host: "mobile", source: "app", level: "ERROR", text: "client: connect ETIMEDOUT 13.126.44.20:443 (api.pigeon.example resolved from cache 07:12)", evidence: "stale-ip" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failReasons.down + w.failReasons.timeout > 0) out.push({ t: w.t + rand(), host: "mobile", source: "app", level: "ERROR", text: "client: connect ETIMEDOUT 13.126.44.20:443 (api.pigeon.example resolved from cache)", evidence: "stale-ip" });
  return out;
}

const mapped = (s: { applied: string[] }) => s.applied.includes("elastic-ip") || s.applied.includes("proxy-old");

export const INC_DNS: Incident = {
  id: "inc-dns-ttl",
  code: "INC-0003",
  title: "The Migration That Wouldn't Propagate",
  severity: "SEV-2",
  clock0: "12:00:00",
  pageAt: 90,
  page: { title: "40% of mobile users cannot reach the API", detail: "The new stack looks perfect: 0% errors. Support tickets say 'server not found' and 'timed out' from users on the old address." },
  intro: [
    { speaker: "pager", line: "SEV-2: a share of app users are timing out. Our own dashboards show the new API healthy." },
    { speaker: "meera", line: "If your servers are fine and users are failing, ask where those users are sending their requests." },
  ],
  spec: spec(),
  seed: "inc-dns-ttl",
  service: "API",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "Cached DNS answers are modelled as a second client population (60 of 150 requests a second, 40%) whose target is the old address. In reality the share shrinks as individual caches expire, over up to 24 hours, so the error rate would decay slowly rather than stay constant.",
    "Reassigning the old address to the new load balancer is shown as a retarget. In AWS an Elastic IP can be moved between instances but not onto an ALB; a small proxy instance on the old address is the realistic version.",
  ],
  hosts: ["dns", "alb", "api-1", "old-1"],
  services: ["dns", "alb", "api-1", "api-2", "old-1"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("new ALB targets and old-1", ["api-1", "api-2", "old-1"], (id, nw) => (id === "old-1" && !nw.up ? "stale-ip" : undefined), tierMap(["api-1", "api-2", "old-1"], { lb: true })),
  commands: [
    { cmd: "dig +noall +answer api.pigeon.example", describe: "what DNS says now", run: () => ({ out: "api.pigeon.example. 86400 IN A 65.1.33.18\n(new ALB; TTL is 86400 seconds: 24 hours)", evidence: "ttl-86400" }) },
    { cmd: "dig +short api.pigeon.example @8.8.8.8", describe: "a public resolver's cached answer", run: () => ({ out: "13.126.44.20\n(old address, cached; this resolver last asked at 08:41 and keeps it until tomorrow 08:41)", evidence: "stale-ip" }) },
    { cmd: "aws ec2 describe-instances --filters Name=ip-address,Values=13.126.44.20", describe: "who owns the old address", run: (h, s) => ({ out: mapped(s) ? "i-0c91ee (proxy-old) running; forwards to the new ALB" : "(no instances: terminated)", evidence: mapped(s) ? undefined : "old-off" }) },
    { cmd: "curl -sI https://api.pigeon.example/health", describe: "check the API from here", run: () => ({ out: "HTTP/2 200\nserver: nginx\nx-served-by: api-2\n(from this laptop, which has fresh DNS)" }) },
    { cmd: "curl -sI --resolve api.pigeon.example:443:13.126.44.20 https://api.pigeon.example/health", describe: "check the old address directly", run: (h, s) => ({ out: mapped(s) ? "HTTP/2 200\nx-served-by: api-1 (via proxy-old)" : "curl: (28) Connection timed out after 5001 milliseconds", evidence: mapped(s) ? undefined : "stale-ip" }) },
    uptime(() => 0.5),
    df(),
  ],
  evidence: [
    { id: "ttl-86400", label: "The DNS record has a 24-hour TTL", key: true },
    { id: "stale-ip", label: "Failing clients connect to the old address from a cached lookup", key: true },
    { id: "old-off", label: "The old servers were terminated at 11:00", key: true },
    { id: "missing-traffic", label: "The new ALB sees 90 of the expected 150 requests a second", key: true },
    { id: "deploy-new", label: "A deploy of the new service went out this morning", key: false },
    { id: "cert-reissue", label: "The certificate was reissued yesterday", key: false },
  ],
  hypotheses: [
    { id: "dns", label: "Clients with cached DNS still send traffic to the old address, which was decommissioned before the 24-hour TTL expired", correct: true },
    { id: "deploy", label: "The new service has a bug that fails for some users", correct: false },
    { id: "cert", label: "The reissued certificate is invalid for some clients", correct: false },
    { id: "alb", label: "The new load balancer is dropping requests", correct: false },
    { id: "region", label: "A regional network outage is cutting off mobile users", correct: false },
  ],
  mitigations: [
    {
      id: "proxy-old",
      label: "Start a proxy on the old address that forwards to the new ALB",
      detail: "Re-attach the old Elastic IP to a small instance running nginx.",
      takesS: 30,
      kind: "fix",
      patches: () => [{ delay: 30, patch: { op: "set", node: "stale", changes: { target: "lb" } } }],
      note: "Elastic IP 13.126.44.20 associated with proxy-old (nginx, proxy_pass to the new ALB). Cached clients connect again.",
    },
    {
      id: "elastic-ip",
      label: "Move the old IP onto the new stack (reassign the Elastic IP to api-1)",
      detail: "The old address answers again, from a real API server.",
      takesS: 20,
      kind: "fix",
      patches: () => [{ delay: 20, patch: { op: "set", node: "stale", changes: { target: "api-1" } } }],
      note: "Elastic IP 13.126.44.20 reassociated with api-1. Clients with the old address reach the new code.",
    },
    decoy("lower-ttl", "Lower the DNS TTL to 60 seconds", "Edit the record now.", "TTL set to 60 s. Caches that already hold the old answer ignore it until they expire.", 10),
    decoy("flush-resolver", "Flush our own resolver cache", "unbound-control flush.", "Our resolver flushed. The failing users are on other networks.", 5),
    decoy("rollback", "Roll back the API deploy", "Revert v3.2.0.", "Rollback complete. The new API was never the problem.", 120),
    decoy("reissue-cert", "Reissue the certificate", "Request a new ACM certificate.", "Certificate reissued. Failing clients never reached TLS.", 60),
    { ...decoy("scale-new", "Scale the new fleet to six servers", "More capacity behind the ALB.", "api fleet scaled 2 → 6. The failing traffic was not reaching it.", 20, "harmful"), patches: () => [] },
  ],
  traces: [
    {
      id: "stale",
      title: "GET /v2/feed · client timeout · resolved 08:41",
      status: 504,
      evidence: "stale-ip",
      spans: [
        { name: "DNS (cached on device, TTL 86400)", start: 0, ms: 2, depth: 0, kind: "cache" },
        { name: "TCP connect to 13.126.44.20:443", start: 2, ms: 6000, depth: 0, kind: "net" },
      ],
    },
    {
      id: "fresh",
      title: "GET /v2/feed · 200 · fresh DNS",
      status: 200,
      spans: [
        { name: "DNS lookup (new answer)", start: 0, ms: 24, depth: 0, kind: "net" },
        { name: "ALB → api-2", start: 24, ms: 41, depth: 0, kind: "net" },
        { name: "nginx + app handler", start: 25, ms: 40, depth: 1, kind: "cpu" },
      ],
    },
  ],
  timeline: [
    { t: -19800, label: "deploy api v3.2.0 to the new fleet", kind: "deploy" },
    { t: -10800, label: "DNS record switched to the new ALB (TTL unchanged: 24 h)", kind: "deploy" },
    { t: -3600, label: "old servers terminated", kind: "scale" },
    { t: -1800, label: "certificate reissued", kind: "deploy" },
    { t: 90, label: "Page: 40% of mobile users cannot connect", kind: "page" },
  ],
  extraSeries: [{ id: "alb-rps", label: "New ALB requests / s (expected 150)", unit: "%", at: (t) => (t < -3600 ? 100 : 60) }],
  evidenceVia: ["ttl-86400"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: about 40% of requests timing out, for how long, and that our own monitoring showed healthy" },
      { id: "cause", criterion: "Root cause: the record changed with a 24-hour TTL, and the old servers were switched off long before caches expired, so cached clients hit a dead address" },
      { id: "detect", criterion: "Why monitoring missed it: dashboards measured the new stack; the failing requests never arrived. The tell was traffic below expectation" },
      { id: "prevent", criterion: "Prevention: lower the TTL days before the cut-over, keep the old stack serving (or proxying) until the old TTL has passed, and watch traffic against the expected volume" },
      { id: "mitigate", criterion: "States what stopped the failures (answering on the old address again) and why lowering the TTL then would not have helped" },
    ],
    exemplar:
      "What happened: About 40% of requests failed for the hours after the migration. Root cause: the DNS record moved to the new load balancer with its 24-hour TTL unchanged, and the old servers were terminated two hours later, so every client or resolver that cached the old address kept connecting to something that no longer existed. Our dashboards showed the new stack healthy because the failing requests never reached it; the signal was 90 requests a second where 150 were expected. Mitigation: re-attaching the old address to a proxy that forwards to the new stack restored service. Lowering the TTL then did nothing for caches already holding the old answer. Prevention: drop the TTL to a minute at least one old TTL before the migration, keep the old endpoint serving until that time has passed, and alarm on traffic below its expected level.",
  },
  hints: [
    "Your dashboards are green and users are failing. Where are the failing requests going?",
    "Compare the traffic arriving at the new load balancer with what you expected, and look at how long a DNS answer may be cached.",
    "Which of your changes could not have been undone for a client that already looked up the old address?",
  ],
  exercises: ["dns"],
};
