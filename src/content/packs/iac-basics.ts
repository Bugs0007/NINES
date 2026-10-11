import { definePack } from "../define";

export const IAC = { start: { manual: false, remote: true, prPlan: true, ciOnly: true, drift: true } };
export const IAC_CHALLENGE = { start: { manual: true, remote: false, prPlan: false, ciOnly: false, drift: false } };

const TF_STATE = { id: "tf-state", title: "Terraform docs: State (what it records and why)", url: "https://developer.hashicorp.com/terraform/language/state" };
const TF_LOCK = { id: "tf-locking", title: "Terraform docs: State locking", url: "https://developer.hashicorp.com/terraform/language/state/locking" };
const TF_PLAN = { id: "tf-plan", title: "Terraform docs: terraform plan (comparing configuration, state and reality)", url: "https://developer.hashicorp.com/terraform/cli/commands/plan" };
const FOWLER_IAC = { id: "fowler-iac", title: "Martin Fowler: Infrastructure As Code", url: "https://martinfowler.com/bliki/InfrastructureAsCode.html" };

export default definePack({
  id: "iac-basics",
  title: "Infrastructure as Code",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "prod rebuild failed · 14 resources differ from the code", detail: "nobody remembers who changed the security groups" },
    lines: [
      { speaker: "kabir", line: "We tried to rebuild production in a new region from our scripts, and it did not match. Months of console changes never made it back into the code." },
      { speaker: "meera", line: "Code that describes your servers is only true if it is the only way they change. Otherwise it is a story about last spring." },
    ],
  },
  predictions: [
    {
      id: "collision",
      kind: "choice",
      prompt: "Four engineers share one infrastructure state file with no locking. Two of them apply changes at the same moment about 1.5 times a month. What happens?",
      options: [
        { id: "fine", label: "Nothing, the tool merges the changes" },
        { id: "corrupt", label: "One overwrites the other's state, which can leave real resources the tool no longer knows about" },
        { id: "queue", label: "The second one waits automatically" },
      ],
      answer: "corrupt",
      observe: "collision",
      reveal: {
        text: "The state file records what the tool believes exists. Two writers without a lock each read the old state and write back their own version, and the last write wins. Resources created by the loser are now orphaned: real, billed and unmanaged. A remote backend with locking makes the second apply wait or fail cleanly.",
        derived: true,
        line: { speaker: "rao", line: "State is a shared database. It needs a lock like one." },
      },
    },
    {
      id: "drift",
      kind: "choice",
      prompt: "Engineers may change infrastructure in the console, about 6 times a month, and nothing checks for drift. At any moment, about how many hand-made changes sit in production unrecorded in the code?",
      options: [
        { id: "0", label: "None, the tool reverts them" },
        { id: "6", label: "About 6, found only at the next unrelated apply" },
        { id: "60", label: "About 60" },
      ],
      answer: "6",
      observe: "drift",
      reveal: {
        text: "Changes made outside the code accumulate until something compares reality with the files. With no scheduled check that is the next apply, about 30 days on average, so roughly the month's six changes are sitting there. The next apply may undo them, causing an outage, or fail. A daily plan finds each within a day.",
        derived: true,
        line: { speaker: "meera", line: "Drift you have not looked for is drift you have." },
      },
    },
  ],
  widget: { id: "iac-lab", config: IAC },
  mechanism: [
    {
      id: "declare",
      text: "Infrastructure as code describes servers, networks, databases and permissions in files that live in version control. A tool reads them and makes reality match. You get review, history and repeatability: the same files build staging and production, and a lost environment can be recreated in minutes rather than recalled from memory.",
      sourceIds: ["fowler-iac", "tf-state"],
    },
    {
      id: "plan",
      scene: "plan",
      text: "The workflow has two steps. plan compares the files with the recorded state and with what really exists, and shows what would be created, changed or destroyed. apply carries it out. Post the plan on each pull request so people review the effect, and let only CI run apply.",
      sourceIds: ["tf-plan"],
    },
    {
      id: "state",
      scene: "state",
      text: "State is the tool's record of what it manages. Keep it in a shared remote backend with encryption and a lock, so two people cannot apply at once and nobody has a stale local copy. State holds secrets and identifiers, so protect it like production data, and never edit it by hand unless you know why.",
      sourceIds: ["tf-state", "tf-locking"],
    },
    {
      id: "drift",
      scene: "drift",
      text: "Drift is the gap between the code and reality, made by console changes, emergency fixes and other tools. Reduce it by making the code the normal path, restricting write access in the console, and running a scheduled plan that reports differences. Either bring a hand-made change into the code or revert it, so the files stay true.",
      sourceIds: ["tf-plan", "fowler-iac"],
    },
  ],
  challenges: [
    {
      id: "iac-workflow",
      title: "Set up the workflow",
      brief: "Keep undetected drift to 0.6 changes or fewer, never collide on state, apply no more than 5% of changes without review, and rebuild an environment in 30 minutes or less.",
      line: { speaker: "rao", line: "I want to rebuild production from a pull request and trust it." },
      widget: { id: "iac-lab", config: IAC_CHALLENGE },
      conditions: [
        { metric: "undetectedDrift", op: "<=", value: 0.6, label: "At most 0.6 undetected hand-made changes" },
        { metric: "stateConflicts", op: "<=", value: 0, label: "No state collisions" },
        { metric: "unreviewedChanges", op: "<=", value: 0.05, label: "At most 5% of changes unreviewed" },
        { metric: "rebuildMin", op: "<=", value: 30, label: "Rebuild in 30 minutes or less" },
      ],
      stars: [{ metric: "undetectedDrift", op: "<=", value: 0.1, label: "At most 0.1 undetected changes" }],
      hints: ["What causes most drift?", "What stops two applies at once?", "Who should be allowed to apply?"],
    },
  ],
  explainBack: {
    prompt: "Explain the infrastructure-as-code workflow and what can go wrong.",
    rubric: [
      { id: "flow", criterion: "Files in version control describe the infrastructure; plan shows the change, apply makes it, and the plan is reviewed on the pull request", keyIdea: "plan, review, apply" },
      { id: "state", criterion: "State records what is managed and must be shared, locked and protected, because concurrent applies corrupt it", keyIdea: "remote locked state" },
      { id: "drift", criterion: "Console changes cause drift, so restrict them, run scheduled plans, and reconcile each difference", keyIdea: "detect and reconcile drift" },
    ],
    exemplar:
      "Files in version control describe the infrastructure, plan shows what would change, apply makes the change, and the plan is reviewed on the pull request with only CI allowed to apply. State records what is managed, so it must be shared, locked and protected, because concurrent applies can corrupt it. Console changes cause drift, so I would restrict them, run a scheduled plan, and reconcile each difference by bringing it into the code or reverting it.",
  },
  reviews: [
    {
      id: "ia-est",
      format: "estimate",
      scenario: "Hand-made changes arrive at 6 a month and drift is found only at the next unrelated apply, 30 days on average. About how many undetected changes sit in production at a time?",
      unit: "changes",
      answer: 6,
      acceptFactor: 1.05,
      breakdown: ["6 a month × 30 days of undetected time ÷ 30 days = 6"],
      explain: "Open drift is arrival rate times how long it stays unnoticed. A daily check cuts the time to a thirtieth.",
    },
    {
      id: "ia-pick",
      format: "pick-fix",
      scenario: "Terraform state lives on one engineer's laptop and teammates keep re-importing resources. What is the right fix?",
      options: [
        { id: "a", label: "Move state to a remote backend with locking and encryption" },
        { id: "b", label: "Email the state file around" },
        { id: "c", label: "Commit the state file to git" },
        { id: "d", label: "Stop using state" },
      ],
      answer: "a",
      explain: "A shared, locked, encrypted backend is the standard answer. State in git exposes secrets and has no lock.",
    },
    {
      id: "ia-order",
      format: "order",
      scenario: "Order these workflows by changes applied without review, most first.",
      items: [
        { id: "none", label: "No plan on the pull request" },
        { id: "plan", label: "Plan on the PR, anyone may apply" },
        { id: "ci", label: "Plan on the PR, only CI applies" },
      ],
      answer: ["none", "plan", "ci"],
      explain: "60%, 8% and 2%.",
    },
    {
      id: "ia-graph",
      format: "predict-graph",
      scenario: "As the time between drift checks lengthens from 1 day to 30 days, how does the number of undetected hand-made changes (6 a month) change?",
      xLabel: "days between checks →",
      yLabel: "undetected changes",
      options: [
        { id: "linear", label: "Rises in proportion to the interval", points: [0.2, 1, 2, 3, 4, 5, 5.5, 6] },
        { id: "flat", label: "Stays at six", points: [6, 6, 6, 6, 6, 6, 6, 6] },
        { id: "fall", label: "Falls", points: [6, 5, 4, 3, 2, 1, 0.5, 0.2] },
      ],
      answer: "linear",
      explain: "Open drift is arrivals times the time to notice them. Check more often, and fewer pile up.",
    },
    {
      id: "ia-flaw",
      format: "spot-flaw",
      scenario: "During an incident an engineer opens a port in the console 'just for now' and never records it. Weeks later an apply closes it. Tap the weak step.",
      diagram: {
        nodes: [
          { id: "inc", label: "incident: port opened in the console", kind: "client", col: 0, row: 1 },
          { id: "code", label: "code does not mention it", kind: "store", col: 1, row: 1 },
          { id: "apply", label: "later apply reverts it silently", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "inc", to: "code" },
          { from: "code", to: "apply" },
        ],
      },
      answer: "inc->code",
      explain: "An emergency change is fine, and leaving it unrecorded is the failure. Add it to the code afterwards, or revert it deliberately, so the files stay true.",
    },
    {
      id: "ia-explain",
      format: "explain",
      scenario: "In two sentences: why review the plan and not only the code change?",
      rubric: [
        { id: "effect", criterion: "The plan shows the real effect on existing resources, such as a destroy and recreate, that the diff of the code cannot show" },
        { id: "safety", criterion: "Reviewers can catch a destructive change before it runs, when it costs nothing to stop" },
      ],
      exemplar: "The plan shows the real effect on existing resources, such as a destroy and recreate, which the diff of the code cannot show. Reviewers can then catch a destructive change before it runs, when it costs nothing to stop.",
      explain: "Review the outcome, not just the input.",
    },
  ],
  codex: {
    oneLiner: "Infrastructure in version-controlled files: plan, review the plan, apply from CI. Keep state remote and locked, and detect and reconcile drift.",
    keyNumbers: [
      { label: "Undetected drift: console changes, no check (lab)", value: "6 at a time", sourceId: "tf-plan" },
      { label: "Rebuild from code (lab)", value: "25 minutes", sourceId: "fowler-iac" },
    ],
    tradeoffs: [
      { choice: "Code as the only path", gain: "Reproducible, reviewable", cost: "Slower emergency fixes" },
      { choice: "Remote locked state", gain: "No collisions", cost: "A backend to run and protect" },
      { choice: "Scheduled drift plans", gain: "Finds drift within a day", cost: "Noise to triage" },
    ],
    seenIn: ["Terraform, OpenTofu, Pulumi and CloudFormation.", "Atlantis and CI-based plan and apply workflows."],
    interviewAngle: "Say: 'declarative files, plan reviewed on the PR, apply only from CI, remote locked state, and scheduled drift detection'.",
    aws: [{ concept: "State and stacks", service: "S3 backend with DynamoDB locking; AWS CloudFormation" }],
    replay: { id: "iac-lab", config: IAC, scene: "drift" },
  },
  interview: [
    "What problems does infrastructure as code solve?",
    "What is Terraform state and why does it need locking?",
    "How do you deal with configuration drift?",
  ],
  deeper: [
    {
      title: "Modules and blast radius",
      body: "A single huge configuration means every change plans against everything, and a mistake can affect everything. Split infrastructure into modules and separate states by lifetime and risk: networking, data stores and applications change at different rates. Smaller blast radius gives faster plans and safer applies, at the cost of managing dependencies between states.",
      sourceIds: ["fowler-iac"],
    },
  ],
  honestPhysics: [
    "Four engineers change infrastructure. Console changes arrive at 6 a month (0.5 emergency fixes if disallowed). A scheduled plan finds drift within a day; otherwise it is found at the next unrelated change, about 30 days. A shared state file without locking collides 1.5 times a month.",
    "Without plans on pull requests 60% of changes are unreviewed, with them 8%, and 2% if only CI may apply. Rebuilding an environment from code takes about 25 minutes, plus 2 hours of finding what was done by hand if there were console changes. Round figures.",
  ],
  sources: [TF_STATE, TF_LOCK, TF_PLAN, FOWLER_IAC],
  verify: [
    { id: "drift", claim: "Console changes with no drift check leave about 6 undetected", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: {}, metric: "undetectedDrift" }, expect: { min: 5.9, max: 6.1 } },
    { id: "collide", claim: "Unlocked shared state collides 1.5 times a month", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: {}, metric: "stateConflicts" }, expect: { min: 1.4, max: 1.6 } },
    { id: "remote", claim: "Remote locked state removes the collisions", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: { remote: true }, metric: "stateConflicts" }, expect: { max: 0 } },
    { id: "unreviewed", claim: "Without plan review 60% of changes are unreviewed", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: {}, metric: "unreviewedChanges" }, expect: { min: 0.59, max: 0.61 } },
    { id: "ci", claim: "Plan review with CI-only apply cuts it to 2%", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: { prPlan: true, ciOnly: true }, metric: "unreviewedChanges" }, expect: { min: 0.019, max: 0.021 } },
    { id: "rebuild", claim: "Without console changes a rebuild takes 25 minutes", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: { manual: false }, metric: "rebuildMin" }, expect: { min: 25, max: 25 } },
    { id: "daily", claim: "A daily drift plan cuts open drift to 0.2 even with console changes", run: "lab", params: { model: "iac-lab", config: IAC_CHALLENGE, values: { drift: true }, metric: "undetectedDrift" }, expect: { min: 0.19, max: 0.21 } },
  ],
});
