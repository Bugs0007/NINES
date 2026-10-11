/**
 * INC-0010 · The 429 Storm.
 *
 * The model provider allows about 18 requests a second on our key (36 in flight at 2 s a call). Interactive traffic
 * uses about 12. At 02:00 a backfill job started embedding 25 documents a second with a client that retries a 429
 * six times, 200 ms apart, and ignores the Retry-After header. The provider rejects almost everything, the backfill
 * keeps retrying, and the support chat that shares the key gets 429s for most of its calls.
 * Red herrings: a provider status page that reads 'operational' and a model alias change.
 */
import type { SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "chat", label: "support chat", target: "llm", rate: { kind: "const", rps: 12 }, users: 3000, timeoutS: 20, retry: { maxAttempts: 3, backoff: "exponential", baseS: 0.5, capS: 8, jitter: "full" } },
      { kind: "client", id: "backfill", label: "nightly backfill", target: "llm", rate: { kind: "const", rps: 25 }, users: 1, timeoutS: 20, retry: { maxAttempts: 6, backoff: "constant", baseS: 0.2, capS: 0.2, jitter: "none" } },
      { kind: "db", id: "llm", label: "model provider (our key)", cores: 8, workers: 36, queueLimit: 10, steps: [{ kind: "io", dist: { kind: "lognormal", median: 2, p99: 5 } }] },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -86400, host: "ci", source: "deploy", level: "INFO", text: "model alias 'chat-default' -> chat-model-2026-02 (same price, same limits)", evidence: "alias" },
  { t: -3600, host: "cron", source: "cron", level: "INFO", text: "02:00 backfill-embeddings started: 1.2M documents, concurrency 64, retries 6", evidence: "backfill" },
  { t: -1800, host: "provider", source: "app", level: "INFO", text: "status.provider.example: all systems operational", evidence: "status-ok" },
  { t: -900, host: "backfill", source: "app", level: "WARN", text: "429 Too Many Requests; retry-after: 3; retrying in 0.2 s (attempt 3/6)", evidence: "ignores-retry-after" },
  { t: -300, host: "chat", source: "app", level: "ERROR", text: "chat completion failed after 3 attempts: 429 rate_limit_exceeded (requests: 18/s, limit 18/s)", evidence: "limit" },
  { t: -120, host: "gateway", source: "app", level: "WARN", text: "provider 429 ratio 82% (backfill 91%, chat 54%); requests to provider 138/s (accepted 18/s)", evidence: "ratio" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0) out.push({ t: w.t + rand(), host: "backfill", source: "app", level: "WARN", text: "429 Too Many Requests; retry-after: 3; retrying in 0.2 s (attempt " + (2 + Math.floor(rand() * 5)) + "/6)", evidence: "ignores-retry-after" });
  if (Math.floor(w.t) % 4 === 0) out.push({ t: w.t + 0.4, host: "chat", source: "app", level: "ERROR", text: "chat completion failed after 3 attempts: 429 rate_limit_exceeded", evidence: "limit" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const INC_429: Incident = {
  id: "inc-429-storm",
  code: "INC-0010",
  title: "The 429 Storm",
  severity: "SEV-2",
  clock0: "02:14:00",
  pageAt: 100,
  page: { title: "Support chat failing with rate-limit errors", detail: "More than half of chat completions return 429. The provider status page says everything is fine." },
  intro: [
    { speaker: "pager", line: "SEV-2: support chat cannot get answers from the model. 429s on every second request." },
    { speaker: "meera", line: "A 429 means you asked for more than you are allowed. Who else is asking on the same key?" },
  ],
  spec: spec(),
  seed: "inc-429-storm",
  service: "support chat",
  slo: { p99: 20, errorRate: 0.02 },
  honestPhysics: [
    "Real providers limit requests and tokens per minute per key and per model; the sim uses a single concurrency limit as a stand-in, which behaves the same under this load.",
    "The backfill is one client population with its own retry policy. A real job would have many workers, but the offered load and the retry amplification are the same.",
  ],
  hosts: ["gateway", "chat", "backfill"],
  services: ["chat", "backfill", "model-provider"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("shared model key", ["llm"], (id, nw) => (nw.rejected > 0 ? "ratio" : undefined), {
    nodes: [
      { id: "chat", label: "support chat", kind: "client", x: 80, y: 180 },
      { id: "backfill", label: "nightly backfill", kind: "client", x: 80, y: 420 },
      { id: "llm", label: "model provider", kind: "db", x: 620, y: 300 },
    ],
    edges: [{ from: "chat", to: "llm" }, { from: "backfill", to: "llm" }],
  }),
  commands: [
    {
      cmd: "gwctl usage --by caller --window 5m",
      describe: "who is using the shared key",
      run: (h, s) => ({ out: has(s, "throttle-backfill", "pause-backfill", "second-provider") ? "chat  12.1 req/s  accepted 99%\nbackfill  1.2 req/s  accepted 100%" : "backfill  138 req/s (attempts)  accepted 9%\nchat       12.4 req/s  accepted 46%\nprovider limit: 15 req/s", evidence: has(s, "throttle-backfill", "pause-backfill", "second-provider") ? undefined : "ratio" }),
    },
    { cmd: "cat backfill/config.yaml", describe: "backfill client settings", run: () => ({ out: "concurrency: 64\nretries: 5\nretry_delay_s: 0.2\nrespect_retry_after: false", evidence: "ignores-retry-after" }) },
    { cmd: "curl -si $PROVIDER/v1/limits | head -8", describe: "the key's limits", run: () => ({ out: "HTTP/2 200\nx-ratelimit-limit-requests: 18\nx-ratelimit-remaining-requests: 0\nretry-after: 3", evidence: "limit" }) },
    { cmd: "curl -s status.provider.example/api", describe: "provider status", run: () => ({ out: "{\"status\":\"operational\"}  # the provider is fine; we are over our own limit", evidence: "status-ok" }) },
    uptime(() => 0.7),
    free(() => 1900),
    df(),
  ],
  evidence: [
    { id: "ratio", label: "The provider rejects 82% of attempts; the backfill sends 138 attempts a second", key: true },
    { id: "backfill", label: "A backfill job started at 02:00 on the same key", key: true },
    { id: "ignores-retry-after", label: "The backfill retries 200 ms later and ignores Retry-After", key: true },
    { id: "limit", label: "The key is limited to 18 requests a second", key: true },
    { id: "status-ok", label: "The provider's status page is green", key: false },
    { id: "alias", label: "The model alias changed yesterday", key: false },
  ],
  hypotheses: [
    { id: "shared", label: "A backfill sharing the key exhausted the rate limit, and its fixed-delay retries keep the limit saturated so chat also gets 429s", correct: true },
    { id: "provider", label: "The model provider is having an outage", correct: false },
    { id: "alias", label: "The new model alias has stricter limits", correct: false },
    { id: "chat", label: "Support chat traffic grew past its allowance", correct: false },
    { id: "key", label: "The API key was revoked", correct: false },
  ],
  mitigations: [
    {
      id: "throttle-backfill",
      label: "Cap the backfill at 2 concurrent workers and honour Retry-After",
      detail: "The job slows down and stays inside its share of the limit.",
      takesS: 40,
      kind: "fix",
      patches: () => [{ delay: 40, patch: { op: "set", node: "backfill", changes: { rateScale: 0.05, retry: { maxAttempts: 4, backoff: "exponential", baseS: 3, capS: 30, jitter: "full" } } } }],
      note: "backfill: concurrency 64 -> 2, respect_retry_after=true, exponential backoff with jitter. Backfill proceeds at about 1 request a second.",
    },
    {
      id: "pause-backfill",
      label: "Pause the backfill",
      detail: "Stops its traffic completely; resume in a window with a lower concurrency.",
      takesS: 15,
      kind: "mitigate",
      patches: () => [{ delay: 15, patch: { op: "set", node: "backfill", changes: { rateScale: 0 } } }],
      note: "backfill-embeddings paused at document 188,402. Chat traffic recovers within seconds.",
    },
    {
      id: "second-provider",
      label: "Fail chat over to the second provider",
      detail: "Chat uses a separate key and provider with its own limits.",
      takesS: 30,
      kind: "neutral",
      patches: () => [{ delay: 30, patch: { op: "set", node: "chat", changes: { target: "llm2" } } }, { delay: 30, patch: { op: "add", spec: { kind: "db", id: "llm2", label: "second provider", cores: 8, workers: 30, queueLimit: 4, steps: [{ kind: "io", dist: { kind: "lognormal", median: 2.4, p99: 6 } }] } } }],
      note: "gateway route chat -> provider-b. Chat recovers, answers are slightly slower and priced differently; the backfill still hammers provider-a, so the incident stays open.",
    },
    {
      ...decoy("more-retries", "Raise client retries to 10 so chat gets through eventually", "Retries up to 10 with 100 ms delay.", "chat retries 3 -> 10. Each failing call now makes ten attempts into a limit that is already saturated.", 15, "harmful"),
      patches: () => [{ delay: 15, patch: { op: "set", node: "chat", changes: { retry: { maxAttempts: 10, backoff: "constant", baseS: 0.1, capS: 0.1, jitter: "none" } } } }],
    },
    decoy("request-tier", "Request a higher rate-limit tier from the provider", "Open a limit-increase request.", "Request submitted. Provider review takes one business day.", 5),
    decoy("rollback-alias", "Pin the model alias back to the old version", "Revert the alias change.", "Alias pinned. The old model has the same 18 requests-per-second limit.", 20),
    decoy("rotate-key", "Rotate the API key", "Issue a new key.", "New key issued. The backfill picks it up on its next restart and carries on at the same rate.", 30),
  ],
  traces: [
    {
      id: "chat",
      title: "POST /chat · 502 · after 3 attempts",
      status: 502,
      evidence: "limit",
      spans: [
        { name: "gateway → provider: attempt 1 (429, retry-after 3)", start: 0, ms: 40, depth: 0, kind: "net" },
        { name: "backoff 0.4 s", start: 40, ms: 400, depth: 0, kind: "queue" },
        { name: "gateway → provider: attempt 2 (429)", start: 440, ms: 38, depth: 0, kind: "net" },
        { name: "backoff 1.1 s, attempt 3 (429)", start: 478, ms: 1140, depth: 0, kind: "net" },
      ],
    },
    {
      id: "backfill",
      title: "embed batch 12f · 429 x6 · backfill",
      status: 429,
      evidence: "ignores-retry-after",
      spans: [
        { name: "attempt 1..6, 200 ms apart, retry-after header ignored", start: 0, ms: 1200, depth: 0, kind: "net" },
      ],
    },
  ],
  timeline: [
    { t: -86400, label: "model alias changed", kind: "deploy" },
    { t: -3600, label: "02:00 backfill starts at concurrency 64", kind: "cron" },
    { t: 100, label: "Page: chat 429s above 50%", kind: "page" },
  ],
  extraSeries: [{ id: "attempts", label: "Attempts per second at the provider (scaled: 100 = 150)", unit: "%", at: (t) => (t < -3600 ? 8 : 92) }],
  evidenceVia: ["ratio", "limit"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: more than half of support chat completions failing with 429s, and for how long" },
      { id: "cause", criterion: "Root cause: a backfill shared the key and retried 429s every 200 ms ignoring Retry-After, keeping the limit saturated and starving chat" },
      { id: "detect", criterion: "Why it was confusing: the provider was healthy; the limit was ours, and chat itself had not grown" },
      { id: "prevent", criterion: "Prevention: separate keys or quotas for batch and interactive traffic, priority queueing at the gateway, honour Retry-After with jittered backoff, and concurrency caps on batch jobs" },
      { id: "mitigate", criterion: "States what worked (throttling or pausing the backfill, or failing chat over) and why more retries or a new key did not" },
    ],
    exemplar:
      "What happened: From 02:00 to about 02:20, more than half of support chat requests failed with 429. Root cause: the nightly backfill shared our API key with chat, ran at concurrency 64, and retried every rejected request after 200 ms without honouring Retry-After, sending about 138 attempts a second into an 18-per-second limit. Chat got whatever the backfill left, which was almost nothing. The provider was healthy. Mitigation: capping the backfill at two workers with backoff restored the limit to chat; pausing it was faster. Prevention: separate keys or quotas for batch work, priority queueing for interactive traffic, Retry-After and jitter in every client, and concurrency caps on jobs.",
  },
  hints: [
    "The provider says it is fine. What does a 429 actually tell you?",
    "Find out who else is using the key, and how many attempts they are making.",
    "What does the backfill do when it gets a 429, and how long does it wait?",
  ],
  exercises: ["llm-rate-limits-retries"],
};
