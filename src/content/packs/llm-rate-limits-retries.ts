import { definePack } from "../define";

export const RL = { start: { policy: "none", retries: 5 } };
export const RL_CHALLENGE = { start: { policy: "immediate", retries: 5 } };

const ANTHROPIC_RL = { id: "anthropic-rate-limits", title: "Claude docs: Rate limits (requests, input and output tokens per minute; 429 and retry-after)", url: "https://docs.anthropic.com/en/api/rate-limits" };
const AWS_JITTER = { id: "aws-jitter", title: "AWS Architecture Blog: Exponential backoff and jitter", url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/" };
const AWS_TIMEOUTS = { id: "aws-timeouts-retries", title: "AWS Builders' Library: Timeouts, retries, and backoff with jitter", url: "https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" };

export default definePack({
  id: "llm-rate-limits-retries",
  title: "LLM Rate Limits & Retries",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "429 rate · 71% of calls rejected", detail: "retry-per-failure enabled" },
    lines: [
      { speaker: "kabir", line: "A traffic burst hit the provider limit, so we retried every failure straight away. Two minutes later most of our calls were retries." },
      { speaker: "meera", line: "Retrying a rate limit with no pause is asking the same question louder. The limit is capacity, and capacity does not grow because you ask again." },
    ],
  },
  predictions: [
    {
      id: "immediate",
      kind: "choice",
      prompt: "A provider allows 100 requests a second. You send 85 a second, plus a one-second burst of 500. Each rejected request retries immediately, up to 8 times. How many attempts do you make per original request?",
      options: [
        { id: "1", label: "About 1.1 attempts" },
        { id: "18", label: "About 1.8 attempts" },
        { id: "5", label: "About 5 attempts" },
      ],
      answer: "18",
      observe: "storm",
      reveal: {
        text: "Each second the rejected requests come straight back on top of the new ones, so the overload feeds itself: 1.79 attempts per request, and 4,400 wasted calls from one burst. The system does recover here because the burst is short and every request gives up after 8 tries. Raise the base load towards the limit and it never does.",
        derived: true,
        line: { speaker: "rao", line: "Retries are load. Count them as load." },
      },
    },
    {
      id: "jitter",
      kind: "choice",
      prompt: "You switch to exponential backoff, doubling the wait each time. Without jitter all rejected requests come back together; with full jitter they spread out. Which clears the backlog sooner?",
      options: [
        { id: "plain", label: "Plain backoff, because the waits are predictable" },
        { id: "jitter", label: "Jitter, about 22 seconds against 59" },
        { id: "same", label: "No difference" },
      ],
      answer: "jitter",
      observe: "calm",
      reveal: {
        text: "Without jitter every rejected request retries at exactly the same instant, producing waves that hit the limit together: recovery takes 59 seconds. Spread across the window with full jitter, the same retries arrive evenly and clear in 22. Honouring the provider's retry-after header does about as well and uses its knowledge of when capacity returns.",
        derived: true,
        line: { speaker: "meera", line: "Backoff spaces the retries out. Jitter stops them marching in step." },
      },
    },
  ],
  widget: { id: "llmretry-lab", config: RL },
  mechanism: [
    {
      id: "limits",
      text: "Model providers limit requests per minute and tokens per minute, and answer with HTTP 429 when you exceed them, often with a retry-after header. Your quota is a ceiling shared by every instance of your service. Different limits can bind in different ways: a few huge requests hit the token limit, many tiny ones hit the request limit.",
      sourceIds: ["anthropic-rate-limits"],
    },
    {
      id: "immediate",
      scene: "immediate",
      text: "Retrying at once makes things worse. The rejected requests return immediately and join the new ones, so offered load stays above the limit and most calls are rejections. Each retry also counts against your limit and your client's connections, so a short burst can turn into a long outage, a retry storm.",
      sourceIds: ["aws-timeouts-retries"],
    },
    {
      id: "jitter",
      scene: "jitter",
      text: "Back off exponentially, waiting longer after each failure, and add random jitter so clients do not retry in step. Cap the delay, cap the number of attempts, and retry only errors that can succeed later: 429s, timeouts and 5xx, never 400s. Better still, budget retries as a fraction of traffic so they cannot dominate it.",
      sourceIds: ["aws-jitter", "aws-timeouts-retries"],
    },
    {
      id: "retryafter",
      scene: "retryafter",
      text: "When the provider says when to come back with a retry-after header, believe it: it knows its own capacity. Combine this with a client-side limiter that keeps your own sending rate under the quota, a queue that smooths bursts, and, for work that can wait, a batch interface that has its own, larger limit.",
      sourceIds: ["anthropic-rate-limits"],
    },
  ],
  challenges: [
    {
      id: "no-storm",
      title: "Set the retry policy",
      brief: "Serve at least 99.5% of requests from the burst, with no more than 1.45 attempts per request and the rejections ending within 30 seconds of the burst.",
      line: { speaker: "rao", line: "I want every request served and no storm." },
      widget: { id: "llmretry-lab", config: RL_CHALLENGE },
      conditions: [
        { metric: "successRate", op: ">=", value: 0.995, label: "At least 99.5% of requests served" },
        { metric: "amplification", op: "<=", value: 1.45, label: "At most 1.45 attempts per request" },
        { metric: "recoverySec", op: "<=", value: 30, label: "Rejections end within 30 s of the burst" },
      ],
      stars: [{ metric: "amplification", op: "<=", value: 1.39, label: "At most 1.39 attempts per request" }],
      hints: ["Which policies serve everyone eventually?", "Which of those leave a long tail?", "How many retries are enough?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to retry model calls without causing a retry storm.",
    rubric: [
      { id: "why", criterion: "A rate limit is capacity; immediate retries add load on top of the burst and prolong the overload", keyIdea: "retries are load" },
      { id: "how", criterion: "Exponential backoff with jitter, capped attempts, and retrying only retryable errors; honour retry-after", keyIdea: "backoff with jitter" },
      { id: "also", criterion: "Limit your own sending rate, budget retries, queue bursts and use batch for work that can wait", keyIdea: "stay under the limit" },
    ],
    exemplar:
      "A rate limit is capacity, so retrying immediately only adds load on top of the burst and keeps the overload going. I would back off exponentially with full jitter so retries spread out, cap the attempts and retry only errors that can succeed later, and honour the provider's retry-after header. And I would keep my own sending rate under the quota, queue bursts, budget retries as a share of traffic and use a batch interface for work that can wait.",
  },
  reviews: [
    {
      id: "rl-est",
      format: "estimate",
      scenario: "A provider allows 100 requests a second. You send 85 a second, so 15 a second of headroom. A burst leaves 400 requests waiting. How many seconds to clear them at best?",
      unit: "seconds",
      answer: 27,
      acceptFactor: 1.15,
      breakdown: ["400 ÷ 15 = 26.7 seconds", "and only if nothing retries wastefully"],
      explain: "Recovery is limited by the headroom, not by how hard you retry.",
    },
    {
      id: "rl-pick",
      format: "pick-fix",
      scenario: "A service retries every failed model call 3 times, immediately, including HTTP 400 errors for invalid requests. What should change?",
      options: [
        { id: "a", label: "Retry only 429, timeouts and 5xx, with backoff and jitter; never retry a 400" },
        { id: "b", label: "Increase the retries to 10" },
        { id: "c", label: "Remove retries entirely" },
        { id: "d", label: "Retry faster" },
      ],
      answer: "a",
      explain: "A 400 will fail the same way every time. Retrying only what can succeed later, with spacing, adds resilience without the storm.",
    },
    {
      id: "rl-order",
      format: "order",
      scenario: "Order these retry policies by attempts per request in the lab, most first (5 retries unless noted).",
      items: [
        { id: "imm8", label: "Immediate, 8 retries" },
        { id: "ra", label: "Honour retry-after" },
        { id: "jit", label: "Backoff with full jitter" },
        { id: "none", label: "No retries" },
      ],
      answer: ["imm8", "ra", "jit", "none"],
      explain: "1.79, 1.39, 1.38 and 1.00: spreading retries wastes fewer calls than immediate ones.",
    },
    {
      id: "rl-graph",
      format: "predict-graph",
      scenario: "With immediate retries, how does the rate of calls to the provider change over the seconds after a short burst, when load is close to the limit?",
      xLabel: "seconds →",
      yLabel: "calls per second",
      options: [
        { id: "plateau", label: "Stays above the limit for a long time as retries add to new requests", points: [85, 585, 300, 220, 190, 170, 150, 130] },
        { id: "spike", label: "One spike, then straight back to normal", points: [85, 585, 85, 85, 85, 85, 85, 85] },
        { id: "grow", label: "Grows without bound", points: [85, 585, 700, 900, 1100, 1400, 1700, 2000] },
      ],
      answer: "plateau",
      explain: "Rejected requests return on top of the normal load, so offered load decays only as retries run out or are served.",
    },
    {
      id: "rl-flaw",
      format: "spot-flaw",
      scenario: "A fleet of 200 workers all use exponential backoff of 1, 2, 4, 8 seconds with no jitter. After a provider blip they all fail at once. Tap the problem.",
      diagram: {
        nodes: [
          { id: "w", label: "200 workers", kind: "worker", col: 0, row: 1 },
          { id: "bo", label: "wait 1, 2, 4, 8 s", kind: "server", col: 1, row: 1 },
          { id: "prov", label: "model provider", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "w", to: "bo" },
          { from: "bo", to: "prov" },
        ],
      },
      answer: "w->bo",
      explain: "Identical deterministic waits keep the workers synchronised: they retry together in waves. Random jitter spreads each wave across its window.",
    },
    {
      id: "rl-explain",
      format: "explain",
      scenario: "In two sentences: why does the retry-after header beat a guessed backoff?",
      rubric: [
        { id: "knows", criterion: "The provider knows when its capacity will return, which the client can only guess" },
        { id: "waste", criterion: "Following it avoids early retries that are rejected again and add to load" },
      ],
      exemplar: "The provider knows when its capacity will return, while the client can only guess. Following the header avoids early retries that would be rejected again and add to the load.",
      explain: "Use the hint when you have it. Fall back to jittered backoff when you do not.",
    },
  ],
  codex: {
    oneLiner: "A 429 means capacity, not a glitch. Back off with jitter, cap attempts, retry only what can succeed, honour retry-after, and stay under your quota.",
    keyNumbers: [
      { label: "Immediate retries, 8 attempts, one burst (lab)", value: "1.79 attempts per request", sourceId: "aws-timeouts-retries" },
      { label: "Backoff without jitter vs with, recovery (lab)", value: "59 s vs 22 s", sourceId: "aws-jitter" },
    ],
    tradeoffs: [
      { choice: "Immediate retry", gain: "Lowest latency when it works", cost: "Feeds overload" },
      { choice: "Backoff plus jitter", gain: "Spreads load, recovers sooner", cost: "Slower for the unlucky" },
      { choice: "Client-side limiter", gain: "Never hits the limit", cost: "Needs to know the quota" },
    ],
    seenIn: ["SDK retry defaults with exponential backoff.", "Gateway-level limiters and queues in front of providers."],
    interviewAngle: "Say: 'exponential backoff with full jitter, bounded attempts, retry only retryable errors, honour retry-after, and a retry budget'.",
    aws: [{ concept: "Retries and quotas", service: "AWS SDK retry modes; Amazon Bedrock quotas" }],
    replay: { id: "llmretry-lab", config: RL, scene: "jitter" },
  },
  interview: [
    "How should you retry a rate-limited model API?",
    "What is a retry storm and how do you prevent one?",
    "Which errors should you not retry?",
  ],
  deeper: [
    {
      title: "Token limits are a different limit",
      body: "A request limit counts calls, and a token limit counts the size of what you send and receive. A service of many small calls hits the first, and one that sends long documents hits the second. Track both, estimate tokens before sending, and shed or queue work when either is near, rather than waiting for a 429.",
      sourceIds: ["anthropic-rate-limits"],
    },
  ],
  honestPhysics: [
    "A provider allows 100 requests a second and returns 429 beyond that. The service sends 85 new requests a second, with a one-second burst of 500 at second 10. The sim is per second and treats requests as fluid counts.",
    "A rejected request retries by the policy, up to the maximum, and is then dropped. Backoff waits 2, 4, 8 seconds and so on, capped at 30; jitter spreads each wait uniformly from 1 to that value; retry-after spreads over the time the backlog needs to drain. Success counts requests served within 150 seconds.",
  ],
  sources: [ANTHROPIC_RL, AWS_JITTER, AWS_TIMEOUTS],
  verify: [
    { id: "imm-amp", claim: "Immediate retries, 8 attempts, make 1.79 attempts per request", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "immediate", retries: 8 }, metric: "amplification" }, expect: { min: 1.7, max: 1.9 } },
    { id: "imm-fail", claim: "…and still lose requests", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "immediate", retries: 8 }, metric: "successRate" }, expect: { max: 0.995 } },
    { id: "none", claim: "Without retries 7% of the burst is lost", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "none" }, metric: "successRate" }, expect: { min: 0.92, max: 0.935 } },
    { id: "plain", claim: "Plain backoff takes 59 seconds to clear", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "backoff", retries: 5 }, metric: "recoverySec" }, expect: { min: 50 } },
    { id: "jit", claim: "Full jitter clears in 22 seconds", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "jitter", retries: 5 }, metric: "recoverySec" }, expect: { min: 18, max: 26 } },
    { id: "jit-amp", claim: "…with 1.38 attempts per request", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "jitter", retries: 5 }, metric: "amplification" }, expect: { max: 1.45 } },
    { id: "ra", claim: "Honouring retry-after also passes", run: "lab", params: { model: "llmretry-lab", config: RL_CHALLENGE, values: { policy: "retryafter", retries: 5 }, metric: "successRate" }, expect: { min: 0.995 } },
  ],
});
