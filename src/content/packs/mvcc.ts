import { definePack } from "../define";

export const MVCC = { start: { report: "none", scale: 0.2 } };
export const MVCC_CHALLENGE = { start: { report: "primary", scale: 0.2 } };

const PG_MVCC = { id: "pg-mvcc", title: "PostgreSQL docs: Introduction to concurrency control (MVCC)", url: "https://www.postgresql.org/docs/current/mvcc-intro.html" };
const PG_VACUUM = { id: "pg-vacuum", title: "PostgreSQL docs: Routine Vacuuming (dead tuples, autovacuum thresholds and scale factors)", url: "https://www.postgresql.org/docs/current/routine-vacuuming.html" };
const PG_AUTOVAC = { id: "pg-autovacuum-config", title: "PostgreSQL docs: Automatic Vacuuming settings (autovacuum_vacuum_scale_factor default 0.2, threshold 50)", url: "https://www.postgresql.org/docs/current/runtime-config-autovacuum.html" };

export default definePack({
  id: "mvcc",
  title: "MVCC",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "postgres · table size", detail: "orders: 10M live rows, 54M with dead tuples" },
    lines: [
      { speaker: "kabir", line: "The orders table is ten million rows and forty gigabytes bigger than it should be. We only update rows; we delete almost nothing." },
      { speaker: "meera", line: "Postgres never updates in place. Every update leaves the old version behind until something is allowed to clean it up." },
    ],
  },
  predictions: [
    {
      id: "long-txn",
      kind: "choice",
      prompt: "A table takes 2,000 updates a second and autovacuum runs normally. A nightly report holds one transaction open for six hours on the primary. What happens to the table while it runs?",
      options: [
        { id: "same", label: "Nothing; vacuum is independent of other transactions" },
        { id: "small", label: "A little extra bloat that clears afterwards" },
        { id: "grow", label: "Dead tuples pile up for six hours, because vacuum cannot remove versions the report might still see" },
        { id: "lock", label: "Updates block until the report finishes" },
      ],
      answer: "grow",
      observe: "bloat-seen",
      reveal: {
        text: "Vacuum may only remove a dead version when no open transaction could still need it. The report's old snapshot might need almost any version, so for six hours nothing is cleaned. At 2,000 updates a second that is 43 million dead rows, over four times the table.",
        derived: true,
        line: { speaker: "meera", line: "Vacuum is not slow. It is forbidden, and the cause is a report that forgot to finish." },
      },
    },
  ],
  widget: { id: "mvcc-lab", config: MVCC },
  mechanism: [
    {
      id: "versions",
      scene: "versions",
      text: "MVCC keeps several versions of a row. An UPDATE writes a new version and marks the old one as ended, so readers keep seeing the snapshot they started with while writers work on newer ones. Readers never block writers, and writers never block readers.",
      sourceIds: ["pg-mvcc"],
    },
    {
      id: "dead",
      scene: "vacuum",
      text: "The old versions are dead tuples, and they take space and slow scans until vacuum removes them. Autovacuum starts when dead tuples exceed 50 plus a scale factor times the table's rows, which is 0.2 by default, so a ten-million-row table is cleaned about every two million dead rows.",
      sourceIds: ["pg-vacuum", "pg-autovacuum-config"],
    },
    {
      id: "pinned",
      scene: "pinned",
      text: "Vacuum can only remove a version that no transaction can still see. One long-running or idle-in-transaction session holds back the cleanup horizon for the whole database, so dead tuples accumulate on every busy table until it ends. Tuning vacuum cannot fix that.",
      sourceIds: ["pg-vacuum"],
    },
    {
      id: "fix",
      text: "Keep transactions short. Run reports on a read replica, set idle_in_transaction_session_timeout and statement timeouts, and alert on the oldest transaction's age. Then tune autovacuum for hot tables with a lower scale factor so cleanup keeps pace.",
    },
  ],
  challenges: [
    {
      id: "bloat-budget",
      title: "Stop the bloat",
      brief: "A 10-million-row table takes 2,000 updates a second. A six-hour nightly report runs on the primary and bloat reaches four times the table. Change the settings so the worst bloat stays under 30% of the live rows, and keep vacuums under 200 a day.",
      line: { speaker: "rao", line: "Do not just make vacuum run constantly. It spends I/O I would like to keep." },
      widget: { id: "mvcc-lab", config: MVCC_CHALLENGE },
      conditions: [
        { metric: "maxBloat", op: "<", value: 0.3, label: "Worst bloat under 30%" },
        { metric: "vacuums", op: "<", value: 200, label: "Fewer than 200 vacuums a day" },
      ],
      stars: [{ metric: "vacuums", op: "<", value: 100, label: "Fewer than 100 vacuums a day" }],
      hints: [
        "Try lowering the scale factor first. What happens to the worst bloat while the report runs?",
        "Why can vacuum not clean while the report's transaction is open?",
        "Where else could the report run so it does not hold back the primary's cleanup?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain MVCC and why a long-running transaction can cause table bloat.",
    rubric: [
      { id: "versions", criterion: "Updates create new row versions, leaving old ones for readers with older snapshots, so readers and writers do not block each other", keyIdea: "multiple versions" },
      { id: "vacuum", criterion: "Vacuum removes dead versions that no open transaction can see", keyIdea: "vacuum reclaims dead tuples" },
      { id: "long", criterion: "A long transaction holds the cleanup horizon back, so dead tuples pile up until it ends; fix with short transactions or replicas", keyIdea: "old snapshot blocks cleanup" },
    ],
    exemplar:
      "With MVCC an update writes a new row version and keeps the old one so readers using older snapshots are not blocked. Vacuum later removes versions that no open transaction can still see. A long-running transaction might still need old versions, so vacuum cannot remove them and dead tuples pile up until it ends, which I avoid with short transactions, timeouts, and by running reports on a replica.",
  },
  reviews: [
    {
      id: "mv-est-thr",
      format: "estimate",
      scenario: "A table has 10 million live rows. Autovacuum's trigger is 50 plus 0.2 times the rows. About how many dead tuples build up before a vacuum starts?",
      unit: "tuples",
      answer: 2000000,
      acceptFactor: 1.1,
      breakdown: ["0.2 × 10,000,000 = 2,000,000", "plus 50", "≈ 2 million"],
      explain: "At the default scale factor a vacuum starts when a fifth of the table is dead. For hot tables that is a lot, which is why per-table settings exist.",
    },
    {
      id: "mv-est-day",
      format: "estimate",
      scenario: "A table takes 2,000 updates a second. If vacuum cannot clean for six hours, roughly how many dead tuples accumulate?",
      unit: "tuples",
      answer: 43200000,
      acceptFactor: 1.1,
      breakdown: ["2,000 per second × 6 × 3,600 seconds", "= 43,200,000 dead tuples"],
      explain: "Forty-three million dead rows on a ten-million-row table is over four times its live size.",
    },
    {
      id: "mv-pick",
      format: "pick-fix",
      scenario: "Table bloat keeps coming back even after you lowered autovacuum_vacuum_scale_factor. pg_stat_activity shows a session idle in transaction for 9 hours. What do you do?",
      options: [
        { id: "a", label: "Fix the application that left the transaction open, and set idle_in_transaction_session_timeout" },
        { id: "b", label: "Lower the scale factor again" },
        { id: "c", label: "Run VACUUM FULL every hour" },
        { id: "d", label: "Add more disk" },
      ],
      answer: "a",
      explain: "While the old session holds its snapshot, no vacuum setting can reclaim the rows it might see. End or prevent the long transaction, then vacuum can do its job.",
    },
    {
      id: "mv-order",
      format: "order",
      scenario: "Order these by how much table bloat they produce over a day on a hot table, least first.",
      items: [
        { id: "replica-tuned", label: "Report on a replica, tuned autovacuum" },
        { id: "replica", label: "Report on a replica, default autovacuum" },
        { id: "default", label: "Report on the primary, default autovacuum" },
      ],
      answer: ["replica-tuned", "replica", "default"],
      explain: "On a replica nothing holds back cleanup, and a tuned scale factor keeps even less dead data around. On the primary the report blocks vacuum for hours whatever the settings.",
    },
    {
      id: "mv-graph",
      format: "predict-graph",
      scenario: "A long transaction starts at hour 2 and ends at hour 8 on a table that is otherwise vacuumed regularly. Plot dead tuples over the day.",
      xLabel: "hours →",
      yLabel: "dead tuples",
      options: [
        { id: "saw", label: "Small sawtooth the whole day", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "hill", label: "A sawtooth, then a long climb during the transaction, then a drop", points: [1, 1, 3, 6, 8, 2, 1, 1] },
        { id: "up", label: "Steady growth all day", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "down", label: "Falls during the transaction", points: [4, 4, 3, 2, 1, 1, 1, 1] },
      ],
      answer: "hill",
      explain: "While the transaction holds the horizon, nothing is removed, so dead tuples climb at the update rate. Once it ends, the next vacuum clears the backlog.",
    },
    {
      id: "mv-flaw",
      format: "spot-flaw",
      scenario: "A Django management command opens a transaction, loops over a million rows calling an external API, and commits at the end. Table bloat grows while it runs. Tap the part that is wrong.",
      diagram: {
        nodes: [
          { id: "cmd", label: "command: one transaction around a slow external API loop", kind: "worker", col: 0, row: 1 },
          { id: "pg", label: "postgres · vacuum blocked while it runs", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "cmd", to: "pg" }],
      },
      answer: "cmd",
      explain: "A transaction that spans slow external calls holds its snapshot for the whole time. Commit in small batches, and do not keep transactions open across network calls.",
    },
    {
      id: "mv-explain",
      format: "explain",
      scenario: "In two sentences: why can readers and writers proceed without blocking each other in an MVCC database?",
      rubric: [
        { id: "versions", criterion: "Each transaction sees a snapshot of row versions, and writers create new versions instead of changing the one readers see" },
        { id: "cleanup", criterion: "Old versions remain until vacuum removes them, which is the cost of not blocking" },
      ],
      exemplar: "A writer creates a new version of a row while readers keep seeing the version from their snapshot, so neither waits. The old versions stay until vacuum removes them, which is the price of not blocking.",
      explain: "Not blocking is paid for in space and cleanup.",
    },
  ],
  codex: {
    oneLiner: "MVCC keeps row versions so readers and writers do not block. Vacuum removes dead versions, and a long transaction forbids it.",
    keyNumbers: [
      { label: "Autovacuum trigger", value: "50 + 0.2 × rows dead tuples (defaults)", sourceId: "pg-autovacuum-config" },
      { label: "Dead tuples from a pinned horizon", value: "update rate × seconds held", sourceId: "pg-vacuum" },
    ],
    tradeoffs: [
      { choice: "MVCC", gain: "Readers never block writers; consistent snapshots", cost: "Dead tuples, vacuum work, and bloat" },
      { choice: "Lower autovacuum scale factor", gain: "Cleanup keeps up on hot tables", cost: "More frequent vacuums and I/O" },
      { choice: "Reports on a replica", gain: "No horizon pinned on the primary", cost: "Replica lag and extra infrastructure" },
    ],
    seenIn: ["Tables much larger on disk than their live data.", "pg_stat_activity rows in idle in transaction state for hours."],
    interviewAngle: "Mention the cost of MVCC when you propose Postgres for update-heavy tables: 'short transactions, tuned autovacuum on hot tables, and reports on a replica.'",
    aws: [{ concept: "Reports away from the primary", service: "Amazon RDS read replicas", note: "Also enable idle_in_transaction_session_timeout" }],
    replay: { id: "mvcc-lab", config: MVCC_CHALLENGE, scene: "pinned" },
  },
  interview: [
    "What is MVCC, and what does it cost?",
    "Why does a long-running transaction cause table bloat?",
    "How would you find and fix bloat in production?",
  ],
  deeper: [
    {
      title: "Why VACUUM FULL is not the answer",
      body: "Plain vacuum marks the space from dead tuples reusable inside the table, without shrinking the file. VACUUM FULL rewrites the whole table and shrinks it, but holds an exclusive lock for the duration, so it is a maintenance-window tool. The real fix is to prevent the bloat: short transactions and autovacuum tuned to the table's churn.",
      sourceIds: ["pg-vacuum"],
    },
  ],
  honestPhysics: [
    "An UPDATE leaves a dead tuple; the lab counts dead tuples against 10 million live rows at 2,000 updates a second, and treats a vacuum as instant once it can run.",
    "Vacuum cannot remove versions that any open transaction might still see. The lab holds all cleanup back for the six hours the report runs.",
    "Autovacuum triggers at 50 plus the scale factor times the row count. Real vacuums take time, and cost limits slow them on busy servers.",
  ],
  sources: [PG_MVCC, PG_VACUUM, PG_AUTOVAC],
  verify: [
    { id: "pinned", claim: "A six-hour report on the primary bloats the table to over four times its live size", run: "lab", params: { model: "mvcc-lab", config: MVCC_CHALLENGE, values: {}, metric: "maxBloat" }, expect: { min: 4 } },
    { id: "tuning-no-help", claim: "Lowering the scale factor does not fix a pinned horizon", run: "lab", params: { model: "mvcc-lab", config: MVCC_CHALLENGE, values: { scale: 0.01 }, metric: "maxBloat" }, expect: { min: 4 } },
    { id: "replica", claim: "Running the report on a replica keeps bloat under 30%", run: "lab", params: { model: "mvcc-lab", config: MVCC_CHALLENGE, values: { report: "replica" }, metric: "maxBloat" }, expect: { max: 0.3 } },
    { id: "replica-vac", claim: "…with fewer than 100 vacuums a day", run: "lab", params: { model: "mvcc-lab", config: MVCC_CHALLENGE, values: { report: "replica" }, metric: "vacuums" }, expect: { max: 99 } },
    { id: "overtuned", claim: "An aggressive scale factor works but runs over a thousand vacuums", run: "lab", params: { model: "mvcc-lab", config: MVCC_CHALLENGE, values: { report: "replica", scale: 0.01 }, metric: "vacuums" }, expect: { min: 1000 } },
  ],
});
