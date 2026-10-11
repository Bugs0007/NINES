import { definePack } from "../define";

export const SECRETS = { start: { store: "vault", rotation: "hourly", scope: "least", scan: true } };
export const SECRETS_CHALLENGE = {};

const OWASP_SECRETS = { id: "owasp-secrets", title: "OWASP Cheat Sheet Series: Secrets Management", url: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html" };
const GH_SCAN = { id: "github-secret-scanning", title: "GitHub docs: About secret scanning", url: "https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning" };
const VAULT_LEASE = { id: "vault-lease", title: "HashiCorp Vault docs: Lease, renew, and revoke", url: "https://developer.hashicorp.com/vault/docs/concepts/lease" };

export default definePack({
  id: "secrets-management",
  title: "Secrets Management",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "page", title: "cloud bill · $41,000 in compute you did not start", detail: "an admin access key, committed to a public repo three months ago" },
    lines: [
      { speaker: "kabir", line: "An intern committed an admin cloud key to a public repository. We found out three months later when the bill arrived, forty thousand dollars of crypto mining." },
      { speaker: "meera", line: "Assume a secret will leak. Then design for how quickly you notice, how quickly it dies, and how little it can do." },
    ],
  },
  predictions: [
    {
      id: "late",
      kind: "choice",
      prompt: "A key is committed publicly and nobody scans for secrets. How long, on average, does it take to notice?",
      options: [
        { id: "hour", label: "About an hour" },
        { id: "day", label: "About a day" },
        { id: "quarter", label: "About three months, when the bill or a breach arrives" },
      ],
      answer: "quarter",
      observe: "found-late",
      reveal: {
        text: "Attackers scrape public commits within minutes, but you only learn of it when its misuse shows up as a bill, a breach notice or a stranger's email. The lab uses 90 days, 2,160 hours. Commit scanning notices in minutes, which changes the exposure from months to the time it takes to read an alert.",
        derived: true,
        line: { speaker: "meera", line: "The key was in the open the whole time. Nobody was looking." },
      },
    },
    {
      id: "cost",
      kind: "choice",
      prompt: "An administrator key reaches everything and attackers use it for about $2,000 an hour. It works for the 2,164 hours until you notice and cut it off. What is the damage?",
      options: [
        { id: "k", label: "About $40,000" },
        { id: "hundred-k", label: "About $400,000" },
        { id: "million", label: "About $4 million" },
      ],
      answer: "million",
      observe: "costly-leak",
      reveal: {
        text: "2,164 hours × $2,000 × full scope is $4.3 million. Three things shrink it, each by a different factor: scanning cuts the hours from months to minutes, rotation makes the key die on its own, and least privilege cuts the dollars per hour by 20 times.",
        derived: true,
        line: { speaker: "rao", line: "Hours, dollars an hour, and how much the key can reach. Shrink any of the three." },
      },
    },
  ],
  widget: { id: "secrets-lab", config: SECRETS },
  mechanism: [
    {
      id: "never",
      text: "A secret in source code is in every clone, build log, backup and developer laptop, and git history keeps it after it is deleted. Keep secrets out of code and images. Inject them at runtime from a secrets manager, or at least from the environment, and never log them or print them in errors.",
      sourceIds: ["owasp-secrets"],
    },
    {
      id: "scan",
      scene: "scan",
      text: "Scan commits before they land. Pre-commit hooks and server-side push protection block known secret formats, and providers such as GitHub also scan public repositories and alert the issuer. Detection speed sets exposure: minutes with scanning, months without. It is the cheapest control here.",
      sourceIds: ["github-secret-scanning", "owasp-secrets"],
    },
    {
      id: "rotate",
      scene: "rotate",
      text: "Rotation limits how long a leaked secret works. A key that never changes is valid forever. Dynamic credentials, issued by a secrets manager for an hour with a lease, expire by themselves and are never shared between services, so a leak is over almost as soon as it starts.",
      sourceIds: ["vault-lease", "owasp-secrets"],
    },
    {
      id: "scope",
      scene: "scope",
      text: "Least privilege limits what a leaked secret can do. A job that reads one bucket should hold a role that reads one bucket, not administrator rights. Scope multiplies everything else: with a narrow role, even months of exposure costs far less than hours of an administrator key.",
      sourceIds: ["owasp-secrets"],
    },
  ],
  challenges: [
    {
      id: "plan-for-leak",
      title: "Plan for the leak",
      brief: "A key will leak one day and attackers will use it at $2,000 an hour at full scope. Choose storage, rotation, scope and scanning so that the damage from a leak is at most $5,000.",
      line: { speaker: "rao", line: "I can afford a small leak. I cannot afford another forty-thousand-dollar month." },
      widget: { id: "secrets-lab", config: SECRETS_CHALLENGE },
      conditions: [{ metric: "damageUsd", op: "<=", value: 5000, label: "Leak damage at most $5,000" }],
      stars: [{ metric: "damageUsd", op: "<=", value: 500, label: "Leak damage at most $500" }],
      hints: [
        "Damage is exposure hours × dollars per hour × scope. Which of the three can you shrink most cheaply?",
        "How quickly can you notice?",
        "How much can the key reach?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how you would manage secrets so that a leak is survivable.",
    rubric: [
      { id: "store", criterion: "Keep secrets out of code; fetch them at runtime from a secrets manager, and never log them", keyIdea: "out of code, into a manager" },
      { id: "detect", criterion: "Scan commits so a leak is noticed in minutes, not months", keyIdea: "scan for secrets" },
      { id: "limit", criterion: "Rotate or issue short-lived credentials and give each a least-privilege scope, limiting time and reach", keyIdea: "short-lived and least privilege" },
    ],
    exemplar:
      "I would keep secrets out of code and fetch them at runtime from a secrets manager, and never log them. I would scan every commit so a leak is noticed in minutes, not months. Then I would limit what a leak can do: issue short-lived credentials that expire on their own and give each job a least-privilege role, so exposure is short and reach is narrow.",
  },
  reviews: [
    {
      id: "sm-est",
      format: "estimate",
      scenario: "A leaked key is noticed after 6 hours with a scanner and cut off after 4 more. Attackers use a service-role key (30% of resources) at $2,000 an hour at full scope. About what is the damage?",
      unit: "USD",
      answer: 6000,
      acceptFactor: 1.05,
      breakdown: ["10 hours × $2,000 = $20,000", "× 30% = $6,000"],
      explain: "Damage is hours × rate × scope, so shortening any one factor shrinks it.",
    },
    {
      id: "sm-pick",
      format: "pick-fix",
      scenario: "A database password is committed and later deleted in a follow-up commit. The team considers the problem solved. What is the right response?",
      options: [
        { id: "a", label: "Treat it as leaked: rotate the password, then remove it from history and scan for use" },
        { id: "b", label: "Nothing: it is deleted" },
        { id: "c", label: "Make the repository private" },
        { id: "d", label: "Rename the variable" },
      ],
      answer: "a",
      explain: "Git history, forks and clones keep every version. Once a secret has been committed it must be rotated, whatever happens to the file.",
    },
    {
      id: "sm-order",
      format: "order",
      scenario: "Order these by damage from a leaked administrator key, highest first.",
      items: [
        { id: "none", label: "No scanning, never rotated" },
        { id: "scan", label: "Scanning, never rotated" },
        { id: "dyn", label: "Hourly dynamic credentials" },
      ],
      answer: ["none", "scan", "dyn"],
      explain: "The key lives 2,164 hours, then 4, then 1. Each step cuts exposure by orders of magnitude.",
    },
    {
      id: "sm-graph",
      format: "predict-graph",
      scenario: "An administrator key leaks and is cut off by hand 4 hours after you notice. As the time to notice falls from 90 days to 6 minutes, how does the damage change?",
      xLabel: "time to notice (falls) →",
      yLabel: "damage",
      options: [
        { id: "fall", label: "Falls roughly in proportion to the time", points: [4300000, 2000000, 700000, 100000, 20000, 12000, 8200, 8200] },
        { id: "flat", label: "Barely changes", points: [4300000, 4300000, 4300000, 4300000, 4300000, 4300000, 4300000, 4300000] },
        { id: "step", label: "Zero until the last step", points: [4300000, 4300000, 4300000, 4300000, 4300000, 4300000, 4300000, 8200] },
      ],
      answer: "fall",
      explain: "Damage is proportional to the hours the key works. It levels off at the response time, 4 hours, which is why automated rotation matters too.",
    },
    {
      id: "sm-flaw",
      format: "spot-flaw",
      scenario: "A container image contains the production API key in an environment variable baked in at build time. The image is stored in a registry that dozens of people can pull from. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "build", label: "build bakes the key into the image", kind: "worker", col: 0, row: 1 },
          { id: "registry", label: "shared image registry", kind: "store", col: 1, row: 1 },
          { id: "prod", label: "production", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "build", to: "registry" },
          { from: "registry", to: "prod" },
        ],
      },
      answer: "build->registry",
      explain: "Anyone who can pull the image has the key. Inject secrets when the container starts, from a manager, so images contain none.",
    },
    {
      id: "sm-explain",
      format: "explain",
      scenario: "In two sentences: why are short-lived credentials better than long-lived ones?",
      rubric: [
        { id: "time", criterion: "A leaked short-lived credential expires on its own, so the window of misuse is small" },
        { id: "rotation", criterion: "Automatic issuance removes manual rotation work and keeps credentials from being shared or copied around" },
      ],
      exemplar: "A leaked short-lived credential expires by itself, so the window in which an attacker can use it is small. Automatic issuance also removes manual rotation and stops credentials being copied around.",
      explain: "Make the secret die before it can be misused.",
    },
  ],
  codex: {
    oneLiner: "Keep secrets out of code, scan commits, issue short-lived credentials with least privilege, and treat anything committed as leaked.",
    keyNumbers: [
      { label: "Leak damage", value: "hours exposed × dollars per hour × scope", sourceId: "owasp-secrets" },
      { label: "Dynamic credential lifetime", value: "minutes to hours", sourceId: "vault-lease" },
    ],
    tradeoffs: [
      { choice: "Secrets manager", gain: "Central, audited, rotatable", cost: "A dependency at startup" },
      { choice: "Short-lived credentials", gain: "Leaks expire", cost: "Needs automation to issue and renew" },
      { choice: "Commit scanning", gain: "Minutes to notice", cost: "False positives to triage" },
    ],
    seenIn: ["AWS Secrets Manager, HashiCorp Vault, GCP Secret Manager.", "GitHub push protection for secrets."],
    interviewAngle: "Say: 'secrets in a manager, injected at runtime, scanned for in commits, short-lived and least-privilege, rotated on any suspicion'.",
    aws: [{ concept: "Secrets with automatic rotation; IAM roles instead of keys", service: "Secrets Manager, IAM roles" }],
    replay: { id: "secrets-lab", config: SECRETS, scene: "rotate" },
  },
  interview: [
    "Where should an application keep its database password?",
    "What do you do if a secret is committed to git?",
    "How do you limit the impact of a leaked credential?",
  ],
  deeper: [
    {
      title: "Prefer identity to secrets",
      body: "The best secret is one that does not exist. Cloud workloads can prove who they are with an attached identity, such as an instance or pod role, and receive short-lived credentials without any stored key. Where it is available, replace stored keys with workload identity, and keep real secrets only for what cannot use it.",
      sourceIds: ["owasp-secrets"],
    },
  ],
  honestPhysics: [
    "A key is committed publicly. Attackers use it at $2,000 an hour at full scope. Exposure is the time to notice plus the time to cut it off, capped by how long the key is valid.",
    "Without scanning a leak is noticed after about 2,160 hours; with scanning 6 minutes. Cutting off by hand takes 4 hours; hourly dynamic credentials from a secrets manager end themselves after 1. Keys never rotated stay valid forever; yearly, monthly: 8,760 and 720 hours.",
    "Scope: administrator 100% of resources, a service role 30%, least privilege 5%.",
  ],
  sources: [OWASP_SECRETS, GH_SCAN, VAULT_LEASE],
  verify: [
    { id: "bad", claim: "An unscanned, never-rotated administrator key leaks about $4.3 million", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: {}, metric: "damageUsd" }, expect: { min: 4000000, max: 4600000 } },
    { id: "scan", claim: "Scanning alone cuts it to $8,200", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: { scan: true }, metric: "damageUsd" }, expect: { min: 8000, max: 8400 } },
    { id: "scan-scope", claim: "Scanning plus a service role brings it to about $2,500", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: { scan: true, scope: "service" }, metric: "damageUsd" }, expect: { max: 5000 } },
    { id: "dynamic", claim: "Hourly dynamic credentials with a manager cap an administrator leak at $2,000", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: { store: "vault", rotation: "hourly" }, metric: "damageUsd" }, expect: { max: 2000 } },
    { id: "no-manager", claim: "Hourly rotation without a manager is not dynamic", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: { store: "env", rotation: "hourly", scan: false }, metric: "exposureHours" }, expect: { min: 700 } },
    { id: "least", claim: "Least privilege alone still leaks over $200,000 over 90 days", run: "lab", params: { model: "secrets-lab", config: SECRETS_CHALLENGE, values: { scope: "least" }, metric: "damageUsd" }, expect: { min: 200000 } },
  ],
});
