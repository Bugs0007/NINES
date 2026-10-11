/**
 * INC-0009 · $400 of Tool Calls.
 *
 * A prompt edit at 14:02 removed the line telling the research agent when to stop. When a search tool returns nothing,
 * the agent now calls it again with a slightly reworded query, 25 times, until it hits a hard step limit. Every task
 * that used to cost 3 model calls costs 25, the model gateway's shared concurrency fills, and ordinary tasks queue past
 * the client timeout. The spend alert and the error alert fired in the same minute.
 * Red herrings: a model version change the week before and a flaky search index.
 */
import type { ServerSpec, SimSpec, Step, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const calls = (n: number): Step[] => Array.from({ length: n }, () => ({ kind: "call", target: "llm" }));

const agent = (): ServerSpec => ({ kind: "server", id: "agent", label: "research-agent", cores: 4, workers: 40, queueLimit: 40, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.01 } }, ...calls(25)], bootS: 30 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", label: "users", target: "agent", rate: { kind: "const", rps: 2 }, users: 500, timeoutS: 60 },
      agent(),
      { kind: "db", id: "llm", label: "model gateway", cores: 8, workers: 20, queueLimit: 100, steps: [{ kind: "io", dist: { kind: "lognormal", median: 1.5, p99: 4 } }] },
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -604800, host: "ci", source: "deploy", level: "INFO", text: "model alias 'research-default' now points to model-2026-03 (was model-2026-01)", evidence: "model-bump" },
  { t: -7200, host: "search", source: "app", level: "WARN", text: "search index shard 3 returned 0 hits for 12% of queries (reindex in progress)", evidence: "flaky-search" },
  { t: -600, host: "ci", source: "deploy", level: "INFO", text: "prompt research-agent v14 deployed: removed 'Stop and answer once you have two sources, or after three searches.'", evidence: "prompt-edit" },
  { t: -420, host: "agent", source: "app", level: "INFO", text: "task t-8812: step 4 search(\"vector index recall tradeoffs 2026\") -> 0 results; step 5 search(\"recall tradeoffs vector index\") -> 0 results; step 6 search(...)", evidence: "loop" },
  { t: -300, host: "agent", source: "app", level: "WARN", text: "task t-8812 reached max_steps=25 without a final answer (tokens in 412,880; cost $3.10)", evidence: "loop" },
  { t: -120, host: "billing", source: "app", level: "WARN", text: "spend alert: model gateway $412 in last 60 min (baseline $38); 91% of spend from research-agent", evidence: "spend" },
  { t: -30, host: "gateway", source: "app", level: "ERROR", text: "queue full: 100/100 waiting; 429 returned to research-agent for ordinary tasks", evidence: "gateway-full" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0) out.push({ t: w.t + rand(), host: "agent", source: "app", level: "INFO", text: "task t-" + (8900 + Math.floor(w.t)) + ": step " + (8 + Math.floor(rand() * 16)) + " search(\"" + ["recall tradeoffs vector", "vector recall index tradeoff", "index vector recall tradeoffs"][Math.floor(rand() * 3)] + "\") -> 0 results", evidence: "loop" });
  if (Math.floor(w.t) % 6 === 0 && w.failed > 0) out.push({ t: w.t + 0.4, host: "gateway", source: "app", level: "ERROR", text: "queue full: ordinary task rejected with 429 (queue 100/100)", evidence: "gateway-full" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const INC_AGENT_LOOP: Incident = {
  id: "inc-agent-loop",
  code: "INC-0009",
  title: "$400 of Tool Calls",
  severity: "SEV-2",
  clock0: "14:12:00",
  pageAt: 100,
  page: { title: "Agent tasks failing and spend 10x baseline", detail: "Model gateway spend is $412 in an hour. Most research tasks now time out." },
  intro: [
    { speaker: "pager", line: "SEV-2: two alerts at once: model spend 10x baseline, and research tasks failing." },
    { speaker: "meera", line: "Cost and errors rising together usually share one cause. Count the model calls per task." },
  ],
  spec: spec(),
  seed: "inc-agent-loop",
  service: "research tasks",
  slo: { p99: 60, errorRate: 0.01 },
  honestPhysics: [
    "An agent that loops is modelled as a task that makes 25 sequential model calls instead of 3. Real loops vary in length and each turn's prompt grows with the history, so the cost per call rises as it goes.",
    "Spend is shown as a derived series; the sim itself only knows about concurrency and queueing at the gateway.",
  ],
  hosts: ["agent", "gateway", "search"],
  services: ["research-agent", "model-gateway", "search"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("agent and gateway", ["agent", "llm"], (id, nw) => (id === "llm" && nw.workerUtil > 0.9 ? "gateway-full" : undefined), {
    nodes: [
      { id: "users", label: "users", kind: "client", x: 60, y: 300 },
      { id: "agent", label: "research-agent", kind: "server", x: 400, y: 300, workers: 40, cores: 4 },
      { id: "llm", label: "model gateway", kind: "db", x: 760, y: 300 },
    ],
    edges: [{ from: "users", to: "agent" }, { from: "agent", to: "llm" }],
  }),
  commands: [
    {
      cmd: "agentctl trace --task t-8812",
      describe: "one task, step by step",
      run: (h, s) => ({ out: has(s, "step-cap", "kill-switch") ? "task t-9101: 4 steps, 2 searches, answered (cost $0.04)" : "step 1 search(q1) -> 0 results\nstep 2 search(q1') -> 0 results\nstep 3 search(q1'') -> 0 results\n...\nstep 25 search(q1''''...) -> 0 results\nmax_steps reached, no answer (cost $3.10)", evidence: has(s, "step-cap", "kill-switch") ? undefined : "loop" }),
    },
    {
      cmd: "agentctl stats --window 60m",
      describe: "model calls per task",
      run: (h, s) => ({ out: has(s, "step-cap", "kill-switch") ? "model calls per task: 3.4\ncost per task: $0.05" : "model calls per task: 24.6 (was 3.1)\ncost per task: $3.02 (was $0.06)\nshare of tasks hitting max_steps: 88%", evidence: has(s, "step-cap", "kill-switch") ? undefined : "spend" }),
    },
    { cmd: "git -C prompts log -3 --oneline research-agent", describe: "recent prompt changes", run: () => ({ out: "a41c9e2 v14: simplify prompt (removed stopping rule)\n77b0e18 v13: cite sources\n02f9d11 v12: tone", evidence: "prompt-edit" }) },
    { cmd: "curl -s search/health", describe: "search service", run: () => ({ out: "{\"status\":\"ok\",\"reindex\":\"in progress (shard 3)\"}" }) },
    uptime(() => 0.9),
    free(() => 2400),
    df(),
  ],
  evidence: [
    { id: "loop", label: "Tasks repeat near-identical searches until max_steps", key: true },
    { id: "prompt-edit", label: "Prompt v14 removed the stopping rule", key: true },
    { id: "spend", label: "Model calls per task rose from 3 to 25 and cost per task 50x", key: true },
    { id: "gateway-full", label: "The gateway queue is full, so ordinary tasks are rejected", key: true },
    { id: "model-bump", label: "The model alias moved to a newer model last week", key: false },
    { id: "flaky-search", label: "Search shard 3 is reindexing and returning empty results", key: false },
  ],
  hypotheses: [
    { id: "loop", label: "The agent never learned to stop: with the stopping rule gone, a failed search triggers repeated calls up to the step limit, flooding the gateway", correct: true },
    { id: "model", label: "The new model version is slower and failing more", correct: false },
    { id: "search", label: "The search outage is causing the failures", correct: false },
    { id: "traffic", label: "A traffic surge is overloading the gateway", correct: false },
    { id: "provider", label: "The model provider is having an incident", correct: false },
  ],
  mitigations: [
    {
      id: "step-cap",
      label: "Roll back the prompt to v13 and set max_steps to 5 with repeated-call detection",
      detail: "Restores the stopping rule and adds a guard in code so it cannot recur.",
      takesS: 40,
      kind: "fix",
      patches: () => [{ delay: 40, patch: { op: "set", node: "agent", changes: { steps: [{ kind: "cpu", dist: { kind: "const", value: 0.01 } }, ...calls(3)] } } }],
      note: "prompt v13 restored; max_steps=5; duplicate-query guard aborts after two identical searches. Calls per task back to about 3.",
    },
    {
      id: "kill-switch",
      label: "Turn the research agent feature flag off",
      detail: "Users see 'temporarily unavailable'. The gateway drains and normal traffic recovers.",
      takesS: 15,
      kind: "mitigate",
      patches: () => [{ delay: 15, patch: { op: "set", node: "users", changes: { rateScale: 0 } } }],
      note: "flag research_agent=false. New tasks are refused at the door with a clear message; running ones finish or time out.",
    },
    {
      ...decoy("raise-quota", "Raise the gateway concurrency and the monthly budget cap", "More concurrent calls and spend headroom.", "Gateway concurrency 20 to 40, budget cap lifted. The loops use the new capacity too, and the bill grows faster.", 20, "harmful"),
      patches: () => [{ delay: 20, patch: { op: "set", node: "llm", changes: { workers: 40 } } }],
    },
    { ...decoy("cheaper-model", "Switch the agent to the small model", "Cheaper and faster per call.", "Agent now uses the small model: calls are 3x cheaper and 2x faster; tasks still make 25 of them.", 20), patches: () => [{ delay: 20, patch: { op: "set", node: "llm", changes: { steps: [{ kind: "io", dist: { kind: "lognormal", median: 0.7, p99: 2 } }] } } }] },
    { ...decoy("restart-agent", "Restart the agent pods", "Rolling restart.", "research-agent restarted. The new pods run the same prompt and loop the same way.", 20), patches: () => [{ delay: 20, patch: { op: "restart", node: "agent" } }] },
    decoy("rollback-model", "Point the alias back to the old model version", "Revert model-2026-03 to 2026-01.", "Alias reverted. The loop does not depend on the model version.", 30),
    decoy("fix-search", "Wait for the search reindex to finish", "Shard 3 is reindexing.", "Reindex ETA 40 minutes. Empty results were only the trigger for the loop.", 600),
  ],
  traces: [
    {
      id: "loop",
      title: "task t-8812 · max_steps · research-agent",
      status: 500,
      evidence: "loop",
      spans: [
        { name: "agent.run (25 steps, no answer)", start: 0, ms: 62000, depth: 0, kind: "cpu" },
        { name: "model call 1..3: plan + search(q) -> 0 results", start: 10, ms: 4800, depth: 1, kind: "net" },
        { name: "model call 4..24: search(reworded q) -> 0 results", start: 4810, ms: 55000, depth: 1, kind: "net" },
        { name: "model call 25: max_steps reached", start: 59810, ms: 2100, depth: 1, kind: "net" },
      ],
    },
    {
      id: "ok",
      title: "task t-7001 · answered · research-agent (before v14)",
      status: 200,
      spans: [
        { name: "agent.run (3 steps)", start: 0, ms: 5400, depth: 0, kind: "cpu" },
        { name: "model call 1: plan", start: 10, ms: 1500, depth: 1, kind: "net" },
        { name: "model call 2: search(q) + read", start: 1510, ms: 2200, depth: 1, kind: "net" },
        { name: "model call 3: answer with two sources", start: 3710, ms: 1700, depth: 1, kind: "net" },
      ],
    },
  ],
  timeline: [
    { t: -604800, label: "model alias moved to a newer version", kind: "deploy" },
    { t: -7200, label: "search shard 3 reindex starts", kind: "cron" },
    { t: -600, label: "prompt v14 deployed", kind: "deploy" },
    { t: 100, label: "Page: spend 10x and tasks failing", kind: "page" },
  ],
  extraSeries: [{ id: "spend", label: "Gateway spend ($/hour, scaled: 100 = $400)", unit: "%", at: (t) => (t < -600 ? 10 : Math.min(100, 10 + (t + 600) / 6)) }],
  evidenceVia: ["spend", "gateway-full"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: spend about 10x baseline in an hour and most research tasks failing, with the dollar and time figures" },
      { id: "cause", criterion: "Root cause: the prompt edit removed the stopping rule, so an empty search triggered repeated reworded searches up to max_steps, multiplying model calls per task about eight times" },
      { id: "detect", criterion: "Why two alerts fired together: the loop both cost money and consumed the shared gateway concurrency that ordinary tasks needed" },
      { id: "prevent", criterion: "Prevention: hard step and cost caps per task, duplicate-call detection, eval cases for tool failures, canarying prompt changes, per-feature budgets and quotas" },
      { id: "mitigate", criterion: "States what stopped it (rollback and caps, or the kill switch) and why raising quotas or changing the model made it worse or no better" },
    ],
    exemplar:
      "What happened: From 14:02 to about 14:20, research tasks timed out and the model gateway billed $412 in an hour against a $38 baseline. Root cause: prompt v14 deleted the sentence that told the agent when to stop. When a search returned nothing, the agent searched again with slightly different words until it hit the 25-step limit, so each task made about 25 model calls instead of 3. The extra calls filled the gateway's shared concurrency and ordinary tasks were rejected. The model upgrade and the search reindex were background. Mitigation: rolling back the prompt, with max_steps=5 and a duplicate-call guard, restored 3 calls per task; the kill switch was a faster stopgap. Raising the quota made the bill grow faster. Prevention: per-task step and cost caps, loop detection, evals that include tool failures, and canary rollouts for prompts.",
  },
  hints: [
    "Two alerts at once: what changes both the bill and the error rate?",
    "Look at one failing task from start to finish. How many model calls does it make?",
    "What changed in the agent's instructions shortly before the spend started climbing?",
  ],
  exercises: ["agent-failure-modes"],
};
