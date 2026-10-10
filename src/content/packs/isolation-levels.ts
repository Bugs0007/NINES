import { definePack } from "../define";

export const ISO_PLAY = { start: { level: "rc", forUpdate: false } };
export const ISO_CHALLENGE = { start: { level: "rc", forUpdate: false } };

const PG_ISO = { id: "pg-isolation", title: "PostgreSQL docs: Transaction Isolation (Read Committed, Repeatable Read, Serializable)", url: "https://www.postgresql.org/docs/current/transaction-iso.html" };
const BERENSON = { id: "berenson-1995", title: "H. Berenson et al. (1995), A Critique of ANSI SQL Isolation Levels, ACM SIGMOD", url: "https://doi.org/10.1145/568271.223785" };
const PG_LOCK = { id: "pg-explicit-locking", title: "PostgreSQL docs: Explicit Locking (row-level locks, SELECT FOR UPDATE)", url: "https://www.postgresql.org/docs/current/explicit-locking.html" };

export default definePack({
  id: "isolation-levels",
  title: "Isolation Levels & Anomalies",
  kind: "concept",
  estimatedMinutes: 16,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "Hospital rota · on-call", detail: "two doctors went off call at the same moment; nobody is on call" },
    lines: [
      { speaker: "pager", line: "The rota rule says at least one doctor stays on call. Two requested leave at once, both checks passed, and the ward has nobody." },
      { speaker: "meera", line: "Each transaction was correct alone, and together they broke a rule neither saw. That is write skew, and some isolation levels allow it." },
    ],
  },
  predictions: [
    {
      id: "skew",
      kind: "choice",
      prompt: "Two transactions each read the count of on-call doctors (2), see that it is safe, and set their own doctor off call. They run at the same time under Repeatable Read, PostgreSQL's snapshot isolation. How many doctors are on call afterwards?",
      options: [
        { id: "two", label: "Two, nothing changed" },
        { id: "one", label: "One, the second transaction was blocked" },
        { id: "zero", label: "Zero: both commit, each saw a snapshot where the other was still on call" },
        { id: "error", label: "The database reports an error" },
      ],
      answer: "zero",
      observe: "skew-seen",
      reveal: {
        text: "Each transaction reads its own snapshot and updates a different row, so neither conflicts on a write and both commit. Snapshot isolation prevents lost updates and phantoms but not write skew. Serializable would abort one of them.",
        sourceIds: ["pg-isolation"],
        line: { speaker: "meera", line: "No conflict on a row does not mean no conflict on a rule." },
      },
    },
  ],
  widget: { id: "iso-lab", config: ISO_PLAY },
  mechanism: [
    {
      id: "levels",
      scene: "rc",
      text: "Isolation says how much one transaction can see of another's work. Read Committed, PostgreSQL's default, lets each statement see everything committed so far, so two reads in one transaction can differ. It is fast and permits several anomalies.",
      sourceIds: ["pg-isolation"],
    },
    {
      id: "snapshot",
      scene: "rr",
      text: "Repeatable Read gives a transaction a single snapshot for its whole life, which removes non-repeatable reads and, in PostgreSQL, phantoms, and makes the database abort one of two writers that update the same row. It still allows write skew, where the transactions write different rows.",
      sourceIds: ["pg-isolation", "berenson-1995"],
    },
    {
      id: "serial",
      scene: "ser",
      text: "Serializable promises the outcome is as if transactions had run one at a time. PostgreSQL gets there with serializable snapshot isolation, which watches for dangerous read-write patterns and aborts a transaction when it finds one. Nothing slips through, and the application must retry aborted transactions.",
      sourceIds: ["pg-isolation"],
    },
    {
      id: "locks",
      scene: "lock",
      text: "You can also be explicit. SELECT … FOR UPDATE locks the rows you read until commit, so a competing transaction waits instead of racing. It prevents lost updates and, if it covers every row the decision depends on, write skew, at the price of waiting and the risk of deadlocks.",
      sourceIds: ["pg-explicit-locking"],
    },
  ],
  challenges: [
    {
      id: "seat-booking",
      title: "No double bookings",
      brief: "Booking reads a seat's status and then marks it taken. Two buyers can race. Choose isolation and locking so no lost updates and no write skew can happen, at most 5% of transactions abort, and relative throughput stays at 75% or better.",
      line: { speaker: "kabir", line: "Serializable sounds safest. I am told it has a price." },
      widget: { id: "iso-lab", config: ISO_CHALLENGE },
      conditions: [
        { metric: "lostUpdate", op: "<=", value: 0, label: "No lost updates" },
        { metric: "writeSkew", op: "<=", value: 0, label: "No write skew" },
        { metric: "abortRate", op: "<=", value: 0.05, label: "At most 5% of transactions abort" },
        { metric: "throughput", op: ">=", value: 0.75, label: "Throughput at least 75%" },
      ],
      stars: [{ metric: "abortRate", op: "<=", value: 0, label: "Nobody has to retry" }],
      hints: [
        "Which isolation levels prevent each anomaly on their own, and which let one through?",
        "Serializable is safe but aborts transactions. What else stops two buyers racing on a row they both read?",
        "A lock on the rows you read removes the race without aborts. What does it cost in throughput?",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe lost update and write skew, and how you would prevent each in PostgreSQL.",
    rubric: [
      { id: "lost", criterion: "Lost update: two transactions read then write the same row and one overwrites the other; prevented by atomic updates, FOR UPDATE, or Repeatable Read and above", keyIdea: "read-modify-write race" },
      { id: "skew", criterion: "Write skew: two transactions read overlapping data and write different rows, breaking a rule; snapshot isolation allows it, so use Serializable or lock the rows read", keyIdea: "different rows, shared rule" },
      { id: "cost", criterion: "Names the tradeoff: Serializable aborts and needs retries, locks cause waiting", keyIdea: "aborts versus waiting" },
    ],
    exemplar:
      "A lost update happens when two transactions read a value and write it back, so one overwrites the other; an atomic UPDATE, SELECT FOR UPDATE, or Repeatable Read prevents it. Write skew happens when two transactions read overlapping rows and then write different rows, breaking a rule neither saw broken; snapshot isolation allows it, so I would use Serializable and retry on failure, or lock every row the decision reads. Serializable costs aborts and retries, while locks cost waiting.",
  },
  reviews: [
    {
      id: "il-pick",
      format: "pick-fix",
      scenario: "Two requests run UPDATE accounts SET balance = balance - 10 WHERE id = 1 at the same time, with no explicit transaction control and default settings. Is there a lost update?",
      options: [
        { id: "a", label: "No: the update is atomic on the row, so both decrements apply" },
        { id: "b", label: "Yes: Read Committed always loses one" },
        { id: "c", label: "Only if the table has no index" },
        { id: "d", label: "Only under Serializable" },
      ],
      answer: "a",
      explain: "A single UPDATE that computes the new value from the current row is atomic: the second one waits for the first to commit, then applies to the new value. Lost updates come from reading in one statement and writing in another.",
    },
    {
      id: "il-pick2",
      format: "pick-fix",
      scenario: "A report runs two SELECT COUNT(*) queries in one transaction at Read Committed, and the second gets a larger number because another transaction committed in between. What is this anomaly, and what avoids it?",
      options: [
        { id: "a", label: "A non-repeatable or phantom read; use Repeatable Read for one snapshot" },
        { id: "b", label: "A lost update; use a bigger instance" },
        { id: "c", label: "Write skew; use FOR UPDATE" },
        { id: "d", label: "A dirty read; PostgreSQL does not allow that" },
      ],
      answer: "a",
      explain: "Each Read Committed statement sees a fresh snapshot, so two queries in a transaction can disagree. Repeatable Read gives the whole transaction one snapshot.",
    },
    {
      id: "il-order",
      format: "order",
      scenario: "Order these PostgreSQL isolation levels by how many anomalies they permit, most first.",
      items: [
        { id: "ser", label: "Serializable" },
        { id: "rr", label: "Repeatable Read" },
        { id: "rc", label: "Read Committed" },
      ],
      answer: ["rc", "rr", "ser"],
      explain: "Read Committed permits the most, Repeatable Read removes everything except write skew, and Serializable removes that too, by aborting transactions.",
    },
    {
      id: "il-flaw",
      format: "spot-flaw",
      scenario: "A booking handler reads the seat's status in one statement, checks it in Python, then updates it, at the default isolation level with no locks. Two buyers get the same seat. Tap the weak point.",
      diagram: {
        nodes: [
          { id: "app", label: "app: SELECT status, if free then UPDATE", kind: "server", col: 0, row: 1 },
          { id: "pg", label: "postgres · Read Committed, no FOR UPDATE", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "pg" }],
      },
      answer: "app->pg",
      explain: "The check and the update are separate statements, so another buyer can slip in between them. Do it in one UPDATE … WHERE status = 'free', lock the row with FOR UPDATE, or run at Serializable and retry.",
    },
    {
      id: "il-graph",
      format: "predict-graph",
      scenario: "Hold the workload fixed and move from Read Committed to Repeatable Read to Serializable. How does the abort rate behave?",
      xLabel: "stronger isolation →",
      yLabel: "aborted transactions",
      options: [
        { id: "flat", label: "Zero at every level", points: [0, 0, 0, 0, 0, 0, 0, 0] },
        { id: "rise", label: "Zero at first, then rising at the strongest levels", points: [0, 0, 0.5, 1, 2, 4, 6, 8] },
        { id: "fall", label: "Falls as isolation grows", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "jump", label: "Always high", points: [8, 8, 8, 8, 8, 8, 8, 8] },
      ],
      answer: "rise",
      explain: "Read Committed never aborts for conflicts. Repeatable Read aborts writers that collide on a row, and Serializable also aborts dangerous patterns, so retries rise with strength.",
    },
    {
      id: "il-explain",
      format: "explain",
      scenario: "In two sentences: why do systems that use Serializable need retry logic?",
      rubric: [
        { id: "abort", criterion: "The database aborts a transaction when it detects a serialisation conflict" },
        { id: "retry", criterion: "The application must catch the failure and rerun the whole transaction" },
      ],
      exemplar: "Serializable lets the database abort a transaction that would break the illusion of running one at a time. The application has to catch that failure and run the whole transaction again.",
      explain: "Safety is bought with retries.",
    },
  ],
  codex: {
    oneLiner: "Isolation controls what concurrent transactions see. Read Committed permits races, Repeatable Read still permits write skew, Serializable aborts to prevent everything.",
    keyNumbers: [
      { label: "PostgreSQL default", value: "Read Committed", sourceId: "pg-isolation" },
      { label: "Snapshot isolation allows", value: "write skew", sourceId: "berenson-1995" },
      { label: "Row locks", value: "SELECT … FOR UPDATE", sourceId: "pg-explicit-locking" },
    ],
    tradeoffs: [
      { choice: "Read Committed", gain: "Fast; no serialisation aborts", cost: "Non-repeatable reads, phantoms, lost updates for read-modify-write" },
      { choice: "Repeatable Read", gain: "One snapshot per transaction; no lost updates", cost: "Write skew; retry on conflict" },
      { choice: "Serializable", gain: "No anomalies", cost: "More aborts and retries, some throughput" },
      { choice: "SELECT FOR UPDATE", gain: "No aborts for the locked rows", cost: "Waiting, deadlock risk, lock duration" },
    ],
    seenIn: ["Double-booked seats and negative inventory.", "Serialization failure errors that a retry loop must handle."],
    interviewAngle: "Name the anomaly the design must prevent and match the tool: 'lost update, so SELECT FOR UPDATE; invariants across rows, so Serializable with retries.'",
    aws: [{ concept: "Isolation setting", service: "RDS PostgreSQL default_transaction_isolation" }],
    replay: { id: "iso-lab", config: { start: { level: "rr", forUpdate: false } }, scene: "rr" },
  },
  interview: [
    "What is write skew and how do you prevent it?",
    "Why is Read Committed the default in most databases?",
    "When would you choose SELECT FOR UPDATE over Serializable?",
  ],
  deeper: [
    {
      title: "Serializable snapshot isolation",
      body: "PostgreSQL's Serializable level tracks read-write dependencies between concurrent transactions and aborts one when it finds a cycle that could not have come from a serial order. It keeps snapshot isolation's lack of read blocking, so readers do not wait for writers, while closing the write-skew gap. The cost is bookkeeping and false-positive aborts, which a retry loop absorbs.",
      sourceIds: ["pg-isolation"],
    },
  ],
  honestPhysics: [
    "The table shows PostgreSQL's behaviour. Abort rates are illustrative for a workload where half the transactions touch the same hot rows; real rates depend on the access pattern.",
    "SELECT FOR UPDATE removes lost updates and write skew in the lab because it is assumed to lock every row the decision reads. Locking only some of them would not.",
    "Relative throughput is a round figure per setting, not a benchmark.",
  ],
  sources: [PG_ISO, BERENSON, PG_LOCK],
  verify: [
    { id: "rc-lost", claim: "Read Committed with a read-modify-write can lose updates", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "rc", forUpdate: false }, metric: "lostUpdate" }, expect: { min: 1 } },
    { id: "rr-skew", claim: "Repeatable Read still allows write skew", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "rr", forUpdate: false }, metric: "writeSkew" }, expect: { min: 1 } },
    { id: "ser-safe", claim: "Serializable has no anomalies", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "ser", forUpdate: false }, metric: "anomalies" }, expect: { max: 0 } },
    { id: "ser-aborts", claim: "…but aborts too many transactions for this target", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "ser", forUpdate: false }, metric: "abortRate" }, expect: { min: 0.05 } },
    { id: "lock-wins", claim: "Read Committed with FOR UPDATE has no aborts", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "rc", forUpdate: true }, metric: "abortRate" }, expect: { max: 0 } },
    { id: "lock-skew", claim: "…and no write skew", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "rc", forUpdate: true }, metric: "writeSkew" }, expect: { max: 0 } },
    { id: "lock-tput", claim: "…keeping throughput at 75% or better", run: "lab", params: { model: "iso-lab", config: ISO_CHALLENGE, values: { level: "rc", forUpdate: true }, metric: "throughput" }, expect: { min: 0.75 } },
  ],
});
