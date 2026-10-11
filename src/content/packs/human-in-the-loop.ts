import { definePack } from "../define";

export const HITL = { start: { policy: "irreversible", undo: true } };
export const HITL_CHALLENGE = {};

const BEA = { id: "building-effective-agents", title: "Anthropic (2024), Building effective agents (checkpoints and human feedback)", url: "https://www.anthropic.com/engineering/building-effective-agents" };
const LANGGRAPH_HITL = { id: "langgraph-hitl", title: "LangGraph docs: Human-in-the-loop (interrupts and approval)", url: "https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/" };
const OWASP_LLM = { id: "owasp-llm", title: "OWASP Top 10 for LLM Applications: Excessive Agency (LLM06)", url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/" };

export default definePack({
  id: "human-in-the-loop",
  title: "Human-in-the-loop",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "ops · reviewer approved 1,000 actions today", detail: "and one of them was a $20,000 refund to the wrong account" },
    lines: [
      { speaker: "kabir", line: "We made the agent ask permission for everything. The reviewer clicked approve a thousand times a day, and the one that mattered went through like the rest." },
      { speaker: "meera", line: "A person who approves everything approves nothing. Put a human where a mistake cannot be undone, and make that rare enough to look at." },
    ],
  },
  predictions: [
    {
      id: "flood",
      kind: "choice",
      prompt: "An agent takes 1,000 actions a day, 50 of them irreversible, and every action needs approval. The lab's reviewer catches 97% of bad actions at a gentle pace and fewer as the load climbs. How many irreversible mistakes still get through each day?",
      options: [
        { id: "0", label: "None: every action is checked" },
        { id: "04", label: "About 0.4" },
        { id: "4", label: "About 4" },
      ],
      answer: "04",
      observe: "rubber-stamp",
      reveal: {
        text: "At 125 approvals an hour the reviewer's attention collapses: the catch rate falls to about 42%, so roughly 0.43 irreversible mistakes get through a day, eight times more than if only the 50 weighty actions were reviewed. It also takes more than eight hours of review work every day.",
        derived: true,
        line: { speaker: "meera", line: "Approval fatigue is a real control failure. It just looks like diligence." },
      },
    },
    {
      id: "none",
      kind: "choice",
      prompt: "You remove approvals entirely. The agent errs on 1.5% of irreversible actions. With 50 of them a day, how many irreversible mistakes happen?",
      options: [
        { id: "0", label: "None" },
        { id: "075", label: "About 0.75 a day, one every day and a half" },
        { id: "7", label: "About 7 a day" },
      ],
      answer: "075",
      observe: "unreviewed",
      reveal: {
        text: "1.5% of 50 is 0.75 a day: a wrong refund, a deleted record, an email to the wrong customer about every day and a half, with nobody looking. A gate on only those 50 actions takes 25 minutes of a person's day, and cuts the rate to about 0.05.",
        derived: true,
        line: { speaker: "rao", line: "Twenty-five minutes a day for an order of magnitude fewer disasters is cheap." },
      },
    },
  ],
  widget: { id: "hitl-lab", config: HITL },
  mechanism: [
    {
      id: "why",
      text: "Agents act on the world, and some actions cannot be undone. A human in the loop is a checkpoint where a person approves, edits or rejects what the agent is about to do. It trades speed for safety, and its value depends entirely on putting it in the right places.",
      sourceIds: ["building-effective-agents", "langgraph-hitl"],
    },
    {
      id: "risk",
      scene: "risk",
      text: "Gate by consequence, not by count. Reads are harmless and need no approval. Reversible writes, drafts and tags, can go ahead and be undone. Irreversible or costly actions, sending money, deleting data, messaging customers, need a person's approval first. This is least privilege applied to autonomy.",
      sourceIds: ["owasp-llm", "building-effective-agents"],
    },
    {
      id: "fatigue",
      scene: "all",
      text: "Reviewers are people. A reviewer who sees a few weighty requests an hour reads them. One who sees a hundred stops reading and approves. Every low-risk approval you add dilutes attention for the high-risk ones, so the more you gate, the less each gate protects.",
      sourceIds: ["langgraph-hitl"],
      derived: true,
    },
    {
      id: "undo",
      scene: "undo",
      text: "Make mistakes cheap to reverse wherever you can. Soft deletes, drafts, a day's undo window and idempotent operations let the agent act freely on the reversible bulk, leaving the reviewer only the truly permanent. Show the reviewer what will happen, with context and a diff, not just a request to approve.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  challenges: [
    {
      id: "gate",
      title: "Set the approval gate",
      brief: "1,000 actions a day: 700 reads, 250 reversible writes, 50 irreversible. Choose which actions need approval and whether reversible ones can be undone, so at most 0.1 irreversible mistakes happen a day, the reviewer works at most 3 hours, and reversible mistakes do almost no lasting damage.",
      line: { speaker: "kabir", line: "I want a person looking at the dangerous things, with time to actually look." },
      widget: { id: "hitl-lab", config: HITL_CHALLENGE },
      conditions: [
        { metric: "irreversibleErrors", op: "<=", value: 0.1, label: "At most 0.1 irreversible mistakes a day" },
        { metric: "reviewerHours", op: "<=", value: 3, label: "Reviewer works at most 3 hours" },
        { metric: "reversibleDamage", op: "<=", value: 1, label: "Reversible mistakes leave little damage" },
      ],
      stars: [{ metric: "irreversibleErrors", op: "<=", value: 0.06, label: "At most 0.06 irreversible mistakes" }],
      hints: [
        "How does the reviewer's catch rate change as approvals per hour rise?",
        "Which actions are worth a person's attention?",
        "What can you do about the reversible mistakes without a person?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain where to put humans in an agent's loop and where not to.",
    rubric: [
      { id: "risk", criterion: "Gate by consequence: reads free, reversible writes undoable, irreversible actions need approval", keyIdea: "gate by risk" },
      { id: "fatigue", criterion: "Too many approvals cause fatigue and rubber-stamping, lowering protection where it matters", keyIdea: "approval fatigue" },
      { id: "undo", criterion: "Make low-risk mistakes reversible and give reviewers context so each decision is informed", keyIdea: "reversibility and context" },
    ],
    exemplar:
      "I would gate by consequence: reads need no approval, reversible writes go ahead with an undo window, and irreversible actions such as payments and deletes need a person first. Asking for approval on everything backfires, because the reviewer stops reading and approves by habit, so more gates protect less. I would also make low-risk mistakes reversible and show the reviewer what will happen and why, so each of the few decisions is informed.",
  },
  reviews: [
    {
      id: "hl-est",
      format: "estimate",
      scenario: "A reviewer takes 30 seconds per approval. Approving 50 irreversible actions a day takes how many hours?",
      unit: "hours",
      answer: 0.42,
      acceptFactor: 1.1,
      breakdown: ["50 × 0.5 minutes = 25 minutes", "= 0.42 hours"],
      explain: "Narrow gates are cheap. Approving all 1,000 actions would need 8.3 hours.",
    },
    {
      id: "hl-pick",
      format: "pick-fix",
      scenario: "An agent drafts emails to customers and sends them automatically. One draft promised a refund the company does not offer. What is the best change?",
      options: [
        { id: "a", label: "Require approval before sending, since sending is irreversible; keep drafting automatic" },
        { id: "b", label: "Require approval for every draft and every tool call" },
        { id: "c", label: "Remove the drafting feature" },
        { id: "d", label: "Ask the model to be careful" },
      ],
      answer: "a",
      explain: "Sending cannot be undone, so it deserves a person. Drafting is reversible and should stay fast.",
    },
    {
      id: "hl-order",
      format: "order",
      scenario: "Order these approval policies by the reviewer's catch rate on bad actions in the lab, lowest first.",
      items: [
        { id: "all", label: "Approve every action (1,000 a day)" },
        { id: "writes", label: "Approve every write (300 a day)" },
        { id: "irr", label: "Approve irreversible actions (50 a day)" },
      ],
      answer: ["all", "writes", "irr"],
      explain: "The more approvals a reviewer faces per hour, the lower the chance each is read properly.",
    },
    {
      id: "hl-graph",
      format: "predict-graph",
      scenario: "As approvals per hour rise from 5 to 150, how does the reviewer's chance of catching a bad action change?",
      xLabel: "approvals per hour →",
      yLabel: "catch rate",
      options: [
        { id: "fall", label: "Falls steadily, from about 94% to 36%", points: [94, 92, 87, 80, 70, 57, 46, 36] },
        { id: "flat", label: "Stays at 97%", points: [97, 97, 97, 97, 97, 97, 97, 97] },
        { id: "rise", label: "Rises with practice", points: [60, 65, 70, 75, 80, 85, 90, 95] },
      ],
      answer: "fall",
      explain: "Attention is limited. Past a certain pace people approve on habit, which no amount of diligence on paper fixes.",
    },
    {
      id: "hl-flaw",
      format: "spot-flaw",
      scenario: "An approval screen shows only 'Agent wants to run: execute_sql' with Approve and Reject buttons. Reviewers approve nearly everything. Tap the missing piece.",
      diagram: {
        nodes: [
          { id: "agent", label: "agent proposes action", kind: "llm", col: 0, row: 1 },
          { id: "screen", label: "screen: 'run execute_sql?'", kind: "client", col: 1, row: 1 },
          { id: "run", label: "runs the query", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "agent", to: "screen" },
          { from: "screen", to: "run" },
        ],
      },
      answer: "agent->screen",
      explain: "The reviewer cannot judge what they cannot see. Show the query, the rows affected, the reason, and what changes if it is approved.",
    },
    {
      id: "hl-explain",
      format: "explain",
      scenario: "In two sentences: why not simply have the agent ask for approval whenever it is unsure?",
      rubric: [
        { id: "calibration", criterion: "Models are often confidently wrong, so their own uncertainty is a poor trigger for the cases that matter" },
        { id: "policy", criterion: "Risk-based rules on the action itself give a predictable gate that does not depend on the model's judgement" },
      ],
      exemplar: "Models are often confidently wrong, so their own sense of uncertainty is a poor trigger for the cases that matter. Rules based on the action itself, such as irreversibility and amount, give a predictable gate that does not depend on the model's judgement.",
      explain: "Gate on what the action can do, not how the model feels.",
    },
  ],
  codex: {
    oneLiner: "Approve by consequence: reads free, reversible writes undoable, irreversible actions gated. Too many approvals cause rubber-stamping.",
    keyNumbers: [
      { label: "Reviewer catch rate (lab)", value: "97% × e^(−approvals per hour ÷ 150)", sourceId: "langgraph-hitl" },
      { label: "Irreversible errors with no gate (lab)", value: "0.75 a day", sourceId: "owasp-llm" },
    ],
    tradeoffs: [
      { choice: "Approve everything", gain: "Feels safe", cost: "Fatigue; hours of review; little real protection" },
      { choice: "Gate irreversible actions", gain: "Attention where it matters", cost: "Needs a clear definition of irreversible" },
      { choice: "Undo windows", gain: "Mistakes are cheap", cost: "Engineering for reversibility" },
    ],
    seenIn: ["Coding agents asking before running commands that change files or the network.", "Payment and ticketing agents with approval queues."],
    interviewAngle: "Say: 'gate by consequence, keep reversible actions fast with undo, show the reviewer context, and watch approval volume'.",
    aws: [{ concept: "Return of control and user confirmation", service: "Amazon Bedrock Agents" }],
    replay: { id: "hitl-lab", config: HITL, scene: "risk" },
  },
  interview: [
    "Where would you put a human in an agent workflow?",
    "What is approval fatigue?",
    "How do you make an agent's mistakes recoverable?",
  ],
  deeper: [
    {
      title: "Autonomy as a dial",
      body: "Teams usually raise an agent's autonomy in steps: suggest only, then act with approval, then act with an undo window, then act and report. Each step is earned by a measured record on that class of action. Track approval rates by action type: an action that is approved 99.9% of the time is a candidate for automation.",
      sourceIds: ["building-effective-agents"],
    },
  ],
  honestPhysics: [
    "An agent takes 1,000 actions a day: 700 reads, 250 reversible writes, 50 irreversible. It errs on 0.5% of reads, 3% of reversible writes and 1.5% of irreversible ones. Reads are harmless.",
    "A reviewer takes 30 seconds per approval and catches bad actions with probability 97% × e^(−approvals per hour ÷ 150) over an 8-hour day. If reversible actions can be undone within a day, their errors leave no lasting damage.",
    "Round figures for the exercise.",
  ],
  sources: [BEA, LANGGRAPH_HITL, OWASP_LLM],
  verify: [
    { id: "none", claim: "With no approvals, 0.75 irreversible mistakes happen a day", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "none" }, metric: "irreversibleErrors" }, expect: { min: 0.75, max: 0.75 } },
    { id: "all", claim: "Approving everything leaves 0.43 irreversible mistakes", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "all" }, metric: "irreversibleErrors" }, expect: { min: 0.4, max: 0.46 } },
    { id: "all-hours", claim: "…and needs over 8 hours of review", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "all" }, metric: "reviewerHours" }, expect: { min: 8 } },
    { id: "irr", claim: "Gating only irreversible actions leaves 0.05 a day", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "irreversible" }, metric: "irreversibleErrors" }, expect: { max: 0.1 } },
    { id: "irr-hours", claim: "…in 25 minutes of review", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "irreversible" }, metric: "reviewerHours" }, expect: { max: 0.5 } },
    { id: "undo", claim: "An undo window removes lasting damage from reversible mistakes", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "irreversible", undo: true }, metric: "reversibleDamage" }, expect: { max: 0 } },
    { id: "no-undo", claim: "Without it, 7.5 reversible mistakes a day stand", run: "lab", params: { model: "hitl-lab", config: HITL_CHALLENGE, values: { policy: "irreversible", undo: false }, metric: "reversibleDamage" }, expect: { min: 7 } },
  ],
});
