import { definePack } from "../define";

export const TENANT = { lockTenants: true, tenants: 20000, start: { model: "rls", quota: true } };
export const TENANT_CHALLENGE = { lockTenants: true, tenants: 20000 };

const AWS_SAAS = { id: "aws-saas-isolation", title: "AWS Whitepaper: SaaS Architecture Fundamentals, Tenant isolation", url: "https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html" };
const PG_RLS = { id: "pg-rls", title: "PostgreSQL docs: Row Security Policies", url: "https://www.postgresql.org/docs/current/ddl-rowsecurity.html" };
const SAAS_LENS = { id: "aws-saas-lens", title: "AWS Well-Architected SaaS Lens: Silo, pool and bridge models", url: "https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html" };

export default definePack({
  id: "multi-tenant-isolation",
  title: "Multi-tenant Isolation",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "customer report · saw another company's dashboard", detail: "a new report query forgot the tenant filter" },
    lines: [
      { speaker: "kabir", line: "A customer saw another company's numbers because a new report query forgot the tenant filter. Every other query had remembered it." },
      { speaker: "meera", line: "A rule that every query must remember is a rule that one will forget. Isolation should not depend on everyone being careful every time." },
    ],
  },
  predictions: [
    {
      id: "leak",
      kind: "choice",
      prompt: "All tenants share tables, and the app adds a tenant_id filter to every query. In the lab, about one query in a few hundred forgets it. How many cross-tenant leaks a year does that produce?",
      options: [
        { id: "none", label: "Practically none" },
        { id: "one", label: "About 1" },
        { id: "eight", label: "About 8" },
        { id: "hundred", label: "About 100" },
      ],
      answer: "eight",
      observe: "leak-seen",
      reveal: {
        text: "With hundreds of queries and new ones written all the time, the filter is forgotten somewhere every few weeks. The lab's rate is eight leaks a year, each a customer seeing another's data. Moving the rule into the database, as row-level security, makes a forgotten filter return nothing instead of everything.",
        derived: true,
        line: { speaker: "meera", line: "Each missing filter is a bug that only the unlucky customer ever sees." },
      },
    },
    {
      id: "scale",
      kind: "choice",
      prompt: "To be safe you give every tenant their own database. You have 20,000 tenants. Operations can manage about 500 databases. What happens?",
      options: [
        { id: "fine", label: "Nothing: automation handles it" },
        { id: "strain", label: "Migrations, backups and monitoring multiply by 20,000 and become unmanageable" },
        { id: "cheaper", label: "It becomes cheaper per tenant" },
      ],
      answer: "strain",
      observe: "unsupported",
      reveal: {
        text: "Each database is separately migrated, backed up, monitored and patched, and a schema change must be run 20,000 times. At $60 a tenant it is also about 30 times the cost of shared tables. Strong walls scale with the number of tenants in effort, not just in money.",
        derived: true,
        line: { speaker: "rao", line: "A thousand small databases are a thousand things to keep alive." },
      },
    },
  ],
  widget: { id: "tenant-lab", config: TENANT },
  mechanism: [
    {
      id: "spectrum",
      text: "A multi-tenant system serves many customers from one deployment. The choice is how much they share. The pool model shares everything and separates data by a tenant id; the silo model gives each tenant their own resources; a bridge in between shares some layers and not others. More sharing is cheaper and easier to run, less is safer and costlier.",
      sourceIds: ["aws-saas-lens", "aws-saas-isolation"],
    },
    {
      id: "column",
      scene: "column",
      text: "With shared tables and a tenant_id column, the application adds the filter to every query. It is simple and cheap, and every query is a chance to forget. One missing filter leaks every tenant's data to whoever runs it, so the isolation is only as good as the least careful query.",
      sourceIds: ["aws-saas-isolation"],
    },
    {
      id: "rls",
      scene: "rls",
      text: "Row-level security moves the rule into the database: the connection sets the current tenant, and policies hide every other row, whatever the query says. A forgotten WHERE clause then returns only the caller's rows. Per-tenant quotas on requests and storage add the other half, limiting how much one tenant can slow the rest.",
      sourceIds: ["pg-rls", "aws-saas-isolation"],
    },
    {
      id: "database",
      scene: "database",
      text: "Separate schemas or databases give strong walls, per-tenant backup and restore, and the ability to move a tenant. They also multiply operations: every migration runs once per tenant, and costs rise. Use them for the few large or regulated tenants who need them, and keep the long tail on shared tables.",
      sourceIds: ["aws-saas-lens"],
    },
  ],
  challenges: [
    {
      id: "isolation",
      title: "Choose the isolation for 20,000 tenants",
      brief: "20,000 tenants. Choose the isolation and quotas so that cross-tenant leaks are at most half a leak a year, one tenant's tenfold load slows others by at most 10%, cost is at most $5 per tenant per month, and operations can manage the tenant count.",
      line: { speaker: "rao", line: "Strong walls for a few big customers are fine. For twenty thousand I need something that scales." },
      widget: { id: "tenant-lab", config: TENANT_CHALLENGE },
      conditions: [
        { metric: "leaksPerYear", op: "<=", value: 0.5, label: "At most 0.5 leaks a year" },
        { metric: "noisyImpactPct", op: "<=", value: 0.1, label: "A noisy tenant slows others by at most 10%" },
        { metric: "costPerTenant", op: "<=", value: 5, label: "At most $5 per tenant a month" },
        { metric: "supported", op: ">=", value: 1, label: "Operable at 20,000 tenants" },
      ],
      stars: [],
      hints: [
        "Which isolation options can operations manage at 20,000 tenants?",
        "Which of those makes a forgotten filter harmless?",
        "What limits how much one tenant can slow the others?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare ways to isolate tenants in a SaaS product and say how you would handle 20,000 tenants.",
    rubric: [
      { id: "shared", criterion: "Shared tables are cheap but an app-enforced tenant filter fails whenever one query forgets it", keyIdea: "app filter is fragile" },
      { id: "rls", criterion: "Row-level security enforces the filter in the database, making a forgotten filter harmless", keyIdea: "enforce in the database" },
      { id: "noisy", criterion: "Per-tenant quotas limit noisy neighbours; separate schemas or databases cost more and do not scale to many tenants", keyIdea: "quotas; per-tenant databases do not scale" },
    ],
    exemplar:
      "Shared tables are cheapest, but when the app adds the tenant filter to every query, one forgotten filter leaks every tenant's data. I would enforce the filter in the database with row-level security, so a missing WHERE clause returns only the caller's rows, and add per-tenant quotas so one tenant's burst cannot slow the others. Separate schemas or databases give stronger walls but multiply migrations and cost, so I would keep them for the few tenants that need them.",
  },
  reviews: [
    {
      id: "mt-est",
      format: "estimate",
      scenario: "A database per tenant costs $60 a tenant a month. For 2,000 tenants, how much is that a year?",
      unit: "$ thousand",
      answer: 1440,
      acceptFactor: 1.01,
      breakdown: ["2,000 × $60 = $120,000 a month", "× 12 = $1.44 million"],
      explain: "Per-tenant resources scale with tenants. Shared tables would cost about $2 each, $48,000 a year.",
    },
    {
      id: "mt-pick",
      format: "pick-fix",
      scenario: "One tenant runs a huge report every hour and the app slows for every other tenant on the shared database. What is the standard remedy?",
      options: [
        { id: "a", label: "Per-tenant quotas and rate limits, with heavy tenants moved to their own resources" },
        { id: "b", label: "Move every tenant to its own database" },
        { id: "c", label: "Ask the tenant to stop" },
        { id: "d", label: "Add an index on tenant_id only" },
      ],
      answer: "a",
      explain: "Quotas contain a noisy tenant on shared infrastructure. Moving only the heavy ones to dedicated resources keeps the cost of the many small ones low.",
    },
    {
      id: "mt-order",
      format: "order",
      scenario: "Order these by cross-tenant leaks a year in the lab, most first.",
      items: [
        { id: "column", label: "Shared tables, app filter" },
        { id: "rls", label: "Shared tables, row-level security" },
        { id: "db", label: "Database per tenant" },
      ],
      answer: ["column", "rls", "db"],
      explain: "Eight, 0.3 and 0.05: the more the wall is enforced below the application, the fewer leaks.",
    },
    {
      id: "mt-graph",
      format: "predict-graph",
      scenario: "As the number of tenants grows from 100 to 1,000,000, how does the operations burden of a database per tenant compare with shared tables?",
      xLabel: "tenants →",
      yLabel: "operations burden",
      options: [
        { id: "diverge", label: "Per-tenant databases grow in proportion; shared tables barely grow", points: [1, 2, 5, 20, 100, 500, 2000, 10000] },
        { id: "same", label: "Both grow the same", points: [1, 2, 5, 20, 100, 500, 2000, 10000] },
        { id: "flat", label: "Neither grows", points: [1, 1, 1, 1, 1, 1, 1, 1] },
      ],
      answer: "diverge",
      explain: "Every migration, backup and monitor runs per database, so effort grows with tenants. Shared tables are run once for all.",
    },
    {
      id: "mt-flaw",
      format: "spot-flaw",
      scenario: "A multi-tenant app caches rendered pages under the key '/dashboard'. The first tenant to load it fills the cache, and every other tenant sees their data. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "req", label: "GET /dashboard", kind: "client", col: 0, row: 1 },
          { id: "cache", label: "cache key: '/dashboard'", kind: "cache", col: 1, row: 1 },
          { id: "app", label: "app", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "cache" },
          { from: "cache", to: "app" },
        ],
      },
      answer: "req->cache",
      explain: "The tenant is not part of the cache key. Isolation has to include every shared layer: caches, queues, search indexes and file storage, not only the database.",
    },
    {
      id: "mt-explain",
      format: "explain",
      scenario: "In two sentences: why does multi-tenant isolation involve more than the database?",
      rubric: [
        { id: "layers", criterion: "Caches, queues, search indexes, logs and file storage are all shared, and each can mix tenants' data" },
        { id: "keys", criterion: "Tenant identity has to be carried and checked in every layer, for example in cache keys and queue messages" },
      ],
      exemplar: "Caches, queues, search indexes, logs and file storage are shared too, and any of them can mix tenants' data. The tenant identity has to travel with each request and be part of every cache key and message.",
      explain: "Isolation is a property of the whole stack.",
    },
  ],
  codex: {
    oneLiner: "Shared tables with row-level security and per-tenant quotas scale to many tenants. Give schemas or databases to the few that need strong walls.",
    keyNumbers: [
      { label: "Leaks a year, app filter versus row-level security (lab)", value: "8 versus 0.3", sourceId: "aws-saas-isolation" },
      { label: "Cost per tenant a month, shared versus own database (lab)", value: "$2 versus $60", sourceId: "aws-saas-lens" },
    ],
    tradeoffs: [
      { choice: "App-enforced filter", gain: "Simplest and cheapest", cost: "One forgotten filter leaks everything" },
      { choice: "Row-level security", gain: "The database enforces the wall", cost: "Policy design and per-request tenant context" },
      { choice: "Schema or database per tenant", gain: "Strong walls; per-tenant restore", cost: "Operations and cost scale with tenants" },
    ],
    seenIn: ["Postgres row-level security in SaaS backends.", "Silo plans for enterprise tenants beside a pooled plan for the rest."],
    interviewAngle: "Say: 'pool by default with row-level security and per-tenant quotas; silo the large or regulated tenants; include the tenant in every cache key'.",
    aws: [{ concept: "Silo, pool and bridge models", service: "RDS / Aurora, DynamoDB with tenant-scoped IAM" }],
    replay: { id: "tenant-lab", config: TENANT, scene: "rls" },
  },
  interview: [
    "How do you isolate tenants in a multi-tenant database?",
    "What is the noisy neighbour problem and how do you handle it?",
    "When would you give a tenant its own database?",
  ],
  deeper: [
    {
      title: "Tenant context everywhere",
      body: "Isolation fails most often in the places people forget: background jobs, caches, search indexes, exports and log lines. Carry a tenant context through every request and job, make it part of cache keys and queue messages, and test with two tenants in the same suite that deliberately try to read each other's data.",
      sourceIds: ["aws-saas-isolation"],
    },
  ],
  honestPhysics: [
    "Cross-tenant leaks a year: app-enforced filter 8, row-level security 0.3, schema per tenant 0.2, database per tenant 0.05. Noisy neighbour is the slowdown to others from a tenant's tenfold load: 40%, 40%, 25% and 3%; quotas cut it by 80%.",
    "Cost per tenant a month: $2, $2, $8, $60. Operations manage about 5,000 schemas or 500 databases.",
    "Round figures for comparison.",
  ],
  sources: [AWS_SAAS, PG_RLS, SAAS_LENS],
  verify: [
    { id: "column", claim: "An app-enforced filter leaks about 8 times a year", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "column" }, metric: "leaksPerYear" }, expect: { min: 8, max: 8 } },
    { id: "rls", claim: "Row-level security cuts it to 0.3", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "rls" }, metric: "leaksPerYear" }, expect: { max: 0.5 } },
    { id: "rls-noisy", claim: "Quotas bring a noisy neighbour to 8%", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "rls", quota: true }, metric: "noisyImpactPct" }, expect: { max: 0.1 } },
    { id: "no-quota", claim: "Without quotas a noisy tenant slows others by 40%", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "rls", quota: false }, metric: "noisyImpactPct" }, expect: { min: 0.4, max: 0.4 } },
    { id: "db", claim: "A database per tenant is not operable at 20,000", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "database" }, metric: "supported" }, expect: { max: 0 } },
    { id: "schema", claim: "Nor is a schema per tenant", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "schema" }, metric: "supported" }, expect: { max: 0 } },
    { id: "cost", claim: "A database per tenant costs $60 a month each", run: "lab", params: { model: "tenant-lab", config: TENANT_CHALLENGE, values: { model: "database" }, metric: "costPerTenant" }, expect: { min: 60, max: 60 } },
  ],
});
