import { definePack } from "../define";

export const LP = { start: { db: "own", mail: "any", files: "drive", pay: "limit", creds: "user" } };
export const LP_CHALLENGE = { start: { db: "admin", mail: "any", files: "drive", pay: "any", creds: "shared" } };

const SALTZER = { id: "saltzer", title: "Saltzer & Schroeder (1975), The protection of information in computer systems (principle of least privilege)", url: "https://www.cs.virginia.edu/~evans/cs551/saltzer/" };
const OWASP_AGENCY = { id: "owasp-agency", title: "OWASP GenAI: LLM06 Excessive Agency", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" };
const AGENT_PATTERNS = { id: "agent-patterns", title: "Beurer-Kellner et al. (2025), Design patterns for securing LLM agents against prompt injections", url: "https://arxiv.org/abs/2506.08837" };

export default definePack({
  id: "least-privilege-tools",
  title: "Least-privilege Tool Design",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "ops · 1,904 production rows deleted by the assistant", detail: "credential: the shared admin token" },
    lines: [
      { speaker: "kabir", line: "A misread instruction made the assistant run a delete. It could, because we gave it the same administrator token our deploy scripts use." },
      { speaker: "meera", line: "You will not stop every mistake or attack. You can decide how much damage the worst of them can do, before it happens." },
    ],
  },
  predictions: [
    {
      id: "wide",
      kind: "choice",
      prompt: "An agent has an administrator database role ($100,000 reachable), email to anyone ($40,000), the whole drive ($50,000) and unlimited payments ($200,000), all through one shared token. What is the worst case if it is hijacked?",
      options: [
        { id: "50", label: "About $50,000, the largest single area" },
        { id: "390", label: "About $390,000, the sum of what it can reach" },
        { id: "unknown", label: "Impossible to say" },
      ],
      answer: "390",
      observe: "admin-everything",
      reveal: {
        text: "A hijacked agent can use every power it holds, so exposure adds up: $100,000 + $40,000 + $50,000 + $200,000 = $390,000 for one prompt. The worst case is knowable because it is the sum of the grants. That makes it the design number to shrink.",
        derived: true,
        line: { speaker: "rao", line: "The permissions list is the blast radius." },
      },
    },
    {
      id: "narrow",
      kind: "choice",
      prompt: "You scope it down: tables the user owns, internal email, one project folder, payments up to $50 with approval, and short-lived per-action tokens. What is the worst case, and what share of tasks can it still do?",
      options: [
        { id: "a", label: "About $3,000 worst case, 91% of tasks" },
        { id: "b", label: "About $3,000 worst case, 40% of tasks" },
        { id: "c", label: "About $150,000 worst case, 99% of tasks" },
      ],
      answer: "a",
      observe: "least-priv",
      reveal: {
        text: "$20,000 + $6,000 + $4,000 + $2,500 is $32,500, and a token that works for one action cuts it to a tenth: $3,250. Capability falls only to 91%, because most tasks never needed the removed powers. Careful scoping removes most of the risk for a small part of the capability.",
        derived: true,
        line: { speaker: "meera", line: "The last few percent of capability are the expensive ones. Ask whether you need them." },
      },
    },
  ],
  widget: { id: "scope-lab", config: LP },
  mechanism: [
    {
      id: "principle",
      text: "Least privilege says each component gets only the access it needs for the task at hand and no more. For an agent, that means each tool is limited in what it can read, write and spend, and each action runs under credentials that cannot do more. The model is treated as an untrusted component that sometimes follows the wrong instructions.",
      sourceIds: ["saltzer", "owasp-agency"],
    },
    {
      id: "scope",
      scene: "narrow",
      text: "Give tools narrow shapes. A tool to look up an order is safer than one that runs SQL; an email draft that a person sends is safer than a send. Prefer read-only views, a single folder, internal recipients and spending limits with approval. A good tool does one job and makes the unsafe request impossible, not just discouraged.",
      sourceIds: ["owasp-agency", "agent-patterns"],
    },
    {
      id: "creds",
      scene: "creds",
      text: "Credentials set the ceiling. A shared service token lets a hijacked agent do anything the service can. A token for the signed-in user limits it to what that person could do. A short-lived token issued for one action limits it to that action and expires. Authorisation is enforced by the system the tool calls, never by the model.",
      sourceIds: ["saltzer"],
    },
    {
      id: "review",
      scene: "wide",
      text: "Review grants like code. Write down what each tool can reach, add the exposures, and ask what the sum would cost. Revisit when a tool is added. Teams usually widen permissions to make something work and never narrow them again, so make narrowing a regular task and log what the agent actually uses.",
      sourceIds: ["owasp-agency"],
    },
  ],
  challenges: [
    {
      id: "scope-it",
      title: "Scope the tools",
      brief: "Bring the worst case to $10,000 or less while the agent still does at least 85% of its tasks. It starts with every power and one shared token.",
      line: { speaker: "rao", line: "Take away what it never needed." },
      widget: { id: "scope-lab", config: LP_CHALLENGE },
      conditions: [
        { metric: "maxLoss", op: "<=", value: 10000, label: "Worst case at most $10,000" },
        { metric: "capability", op: ">=", value: 0.85, label: "At least 85% of tasks still possible" },
      ],
      stars: [{ metric: "maxLoss", op: "<=", value: 3500, label: "Worst case at most $3,500" }],
      hints: ["Which grants add the most to the worst case?", "What does a per-user or short-lived token multiply?", "Which narrowings cost almost no capability?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to design tools for an agent using least privilege.",
    rubric: [
      { id: "shape", criterion: "Narrow, single-purpose tools: read-only views, scoped folders, internal recipients, drafts for a person to send and spending limits with approval", keyIdea: "narrow tool shapes" },
      { id: "creds", criterion: "Credentials set the ceiling: use the user's token or short-lived per-action tokens, and enforce authorisation in the downstream system, not the model", keyIdea: "credentials set the ceiling" },
      { id: "sum", criterion: "The worst case is the sum of what the grants can reach, so review it, shrink it, and keep capability that tasks actually need", keyIdea: "the sum is the blast radius" },
    ],
    exemplar:
      "I would give the agent narrow, single-purpose tools: read-only views instead of SQL, a project folder instead of a drive, internal recipients or drafts a person sends, and spending limits with approval. Credentials set the ceiling, so I would use the user's own token or short-lived per-action tokens and enforce authorisation in the downstream system rather than trusting the model. Then I would add up what the grants can reach as the worst case, shrink it, and keep only the capability that tasks need.",
  },
  reviews: [
    {
      id: "lp-est",
      format: "estimate",
      scenario: "Grants reach $20,000, $6,000, $4,000 and $2,500. A per-action token limits any attack to a tenth. What is the worst case?",
      unit: "$",
      answer: 3250,
      acceptFactor: 1.05,
      breakdown: ["20,000 + 6,000 + 4,000 + 2,500 = 32,500", "× 0.1 = $3,250"],
      explain: "Credentials multiply everything beneath them.",
    },
    {
      id: "lp-pick",
      format: "pick-fix",
      scenario: "An agent needs to answer questions from a customer database. It is given a SQL tool with a write-capable role. What is the best change?",
      options: [
        { id: "a", label: "Replace it with read-only, parameterised lookup tools over a view of the needed columns" },
        { id: "b", label: "Tell the model not to run writes" },
        { id: "c", label: "Log every query" },
        { id: "d", label: "Use a larger model" },
      ],
      answer: "a",
      explain: "A tool that cannot write cannot be steered into writing. Logging tells you afterwards, and instructions rely on the model.",
    },
    {
      id: "lp-order",
      format: "order",
      scenario: "Order these credential choices by worst case, highest first, for the same scopes.",
      items: [
        { id: "shared", label: "One shared service token" },
        { id: "user", label: "The signed-in user's own token" },
        { id: "short", label: "Short-lived token per action" },
      ],
      answer: ["shared", "user", "short"],
      explain: "In the lab, 100%, 35% and 10% of the exposure.",
    },
    {
      id: "lp-graph",
      format: "predict-graph",
      scenario: "As you narrow grants one by one from the widest to the narrowest, how does the share of tasks the agent can still do change?",
      xLabel: "grants narrowed →",
      yLabel: "tasks still possible",
      options: [
        { id: "late", label: "Stays high, then drops at the end", points: [100, 98, 96, 93, 91, 85, 75, 66] },
        { id: "linear", label: "Falls in a straight line", points: [100, 85, 70, 55, 40, 25, 10, 0] },
        { id: "flat", label: "Does not change", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "late",
      explain: "Most tasks use a small part of the permissions. The last grants removed are the ones tasks actually need.",
    },
    {
      id: "lp-flaw",
      format: "spot-flaw",
      scenario: "An agent calls a billing API with a single service key stored in its configuration. The API trusts any request carrying the key. Tap the problem.",
      diagram: {
        nodes: [
          { id: "user", label: "user A (limited rights)", kind: "client", col: 0, row: 1 },
          { id: "agent", label: "agent with the service key", kind: "llm", col: 1, row: 1 },
          { id: "api", label: "billing API: key = full access", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "user", to: "agent" },
          { from: "agent", to: "api" },
        ],
      },
      answer: "agent->api",
      explain: "The agent acts with the service's full rights on behalf of any user. Pass the user's identity and let the API authorise the user, not the key.",
    },
    {
      id: "lp-explain",
      format: "explain",
      scenario: "In two sentences: why can least privilege be the strongest defence against prompt injection?",
      rubric: [
        { id: "indep", criterion: "It does not depend on detecting or resisting the attack: the permissions are enforced outside the model" },
        { id: "bound", criterion: "It bounds the damage of every injection, including ones nobody has seen, to what the granted access allows" },
      ],
      exemplar: "It does not depend on detecting or resisting the attack, because the permissions are enforced outside the model. And it bounds the damage of every injection, including ones nobody has seen, to what the granted access allows.",
      explain: "Controls that hold even when the model fails are the ones to count on.",
    },
  ],
  codex: {
    oneLiner: "Treat the model as untrusted: narrow single-purpose tools, per-user or short-lived credentials, authorisation in the downstream system, and a reviewed sum of exposure.",
    keyNumbers: [
      { label: "All powers, shared token (lab)", value: "$390,000 worst case", sourceId: "owasp-agency" },
      { label: "Scoped tools, per-action tokens (lab)", value: "$3,250 worst case, 91% of tasks", sourceId: "saltzer" },
    ],
    tradeoffs: [
      { choice: "Narrow tools", gain: "Small blast radius", cost: "Some tasks need a new tool or an approval" },
      { choice: "Per-user credentials", gain: "Agent cannot exceed the user", cost: "Token plumbing" },
      { choice: "Approvals", gain: "A person stops the dangerous ones", cost: "Attention and delay" },
    ],
    seenIn: ["OWASP LLM06 Excessive Agency.", "Tool permission systems in agent platforms."],
    interviewAngle: "Say: 'assume the model is hijacked; add up what the grants can reach and shrink it with narrow tools and scoped, short-lived credentials'.",
    aws: [{ concept: "Scoped, short-lived credentials", service: "IAM roles with session policies; STS temporary credentials" }],
    replay: { id: "scope-lab", config: LP, scene: "creds" },
  },
  interview: [
    "How would you apply least privilege to an AI agent?",
    "Why should authorisation not be done by the model?",
    "How do you decide which tools an agent gets?",
  ],
  deeper: [
    {
      title: "Capabilities, not roles",
      body: "A role says who the agent is, and a capability says what one specific action may do. Issue the agent a capability for the exact thing the user asked, such as 'read order 1234', valid for one request. This is more work than a role and it turns a hijack from 'anything this role can do' into 'at most this one action'.",
      sourceIds: ["saltzer"],
    },
  ],
  honestPhysics: [
    "An agent with four tool families: a database, email, files and payments. The worst a hijacked agent could do is the sum of what the grants reach: administrator database $100,000, tables the user owns $20,000, a read-only view $3,000; email to anyone $40,000, internal $6,000, drafts $500; the whole drive $50,000, one folder $4,000; payments of any size $200,000, a $50 limit with approval $2,500.",
    "Narrower scopes cut capability a little: the share of tasks possible is a weighted sum (database 30%, email 20%, files 20%, payments 10%, and 20% needing no tools). A shared token keeps all of the exposure, the user's token 35%, and a short-lived per-action token 10%. Round figures.",
  ],
  sources: [SALTZER, OWASP_AGENCY, AGENT_PATTERNS],
  verify: [
    { id: "wide", claim: "All powers on a shared token reach $390,000", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: {}, metric: "maxLoss" }, expect: { min: 389000, max: 391000 } },
    { id: "narrow", claim: "Scoped tools with per-action tokens reach $3,250", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: { db: "own", mail: "internal", files: "folder", pay: "limit", creds: "short" }, metric: "maxLoss" }, expect: { min: 3200, max: 3300 } },
    { id: "narrow-cap", claim: "…and the agent still does 91% of tasks", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: { db: "own", mail: "internal", files: "folder", pay: "limit", creds: "short" }, metric: "capability" }, expect: { min: 0.9, max: 0.92 } },
    { id: "full", claim: "Everything wide keeps full capability", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: {}, metric: "capability" }, expect: { min: 0.99 } },
    { id: "user-token", claim: "A per-user token alone cuts the worst case to $136,500", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: { creds: "user" }, metric: "maxLoss" }, expect: { min: 136000, max: 137000 } },
    { id: "too-tight", claim: "Locking everything down drops capability to 66%", run: "lab", params: { model: "scope-lab", config: LP_CHALLENGE, values: { db: "view", mail: "draft", files: "none", pay: "none", creds: "short" }, metric: "capability" }, expect: { min: 0.65, max: 0.67 } },
  ],
});
