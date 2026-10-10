import { definePack } from "../define";

export const TXN = { start: { txn: true, crash: "mid", sync: true } };
export const TXN_CHALLENGE = { start: { txn: false, crash: "mid", sync: false } };

const PG_TXN = { id: "pg-transactions", title: "PostgreSQL docs: Transactions (tutorial; BEGIN, COMMIT, atomicity)", url: "https://www.postgresql.org/docs/current/tutorial-transactions.html" };
const PG_WAL = { id: "pg-wal", title: "PostgreSQL docs: Reliability and the Write-Ahead Log (WAL introduction)", url: "https://www.postgresql.org/docs/current/wal-intro.html" };
const PG_ASYNC = { id: "pg-async-commit", title: "PostgreSQL docs: Asynchronous Commit (synchronous_commit, risk window of three times wal_writer_delay)", url: "https://www.postgresql.org/docs/current/wal-async-commit.html" };

export default definePack({
  id: "transactions-acid",
  title: "Transactions & ACID",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "Wallet balances · reconciliation", detail: "600 rupees in, 500 rupees accounted for" },
    lines: [
      { speaker: "pager", line: "Reconciliation found a hundred rupees missing after last night's crash. The debit is in the table and the credit is not." },
      { speaker: "meera", line: "Two statements, one crash between them. A transaction is how you make them one thing." },
    ],
  },
  predictions: [
    {
      id: "torn",
      kind: "choice",
      prompt: "A transfer debits account A by 100 and then credits account B by 100, as two separate statements with no transaction. The server crashes between them. What do the accounts show after restart?",
      options: [
        { id: "both", label: "Both updates are rolled back automatically" },
        { id: "neither", label: "Neither update survived" },
        { id: "half", label: "The debit survived and the credit did not: 100 has vanished" },
        { id: "credit", label: "The credit happened and the debit did not" },
      ],
      answer: "half",
      observe: "torn",
      reveal: {
        text: "Without BEGIN and COMMIT each statement is its own transaction, committed as soon as it finishes. The debit was already durable, the credit never ran, and nothing ties the two together, so the total is 100 short.",
        sourceIds: ["pg-transactions"],
        line: { speaker: "meera", line: "The database kept every promise it made. You just did not ask it to promise both together." },
      },
    },
  ],
  widget: { id: "txn-lab", config: TXN },
  mechanism: [
    {
      id: "atomic",
      scene: "atomic",
      text: "A transaction groups statements into one unit: all of them happen or none do. If the server crashes before COMMIT, recovery discards the partial work, so the debit and credit are never seen apart. That is the A in ACID.",
      sourceIds: ["pg-transactions"],
    },
    {
      id: "wal",
      scene: "wal",
      text: "Durability comes from the write-ahead log. Before a commit returns, the database writes its changes to the WAL and flushes it to disk. After a crash it replays the WAL, so committed work survives even if the data pages were never written.",
      sourceIds: ["pg-wal"],
    },
    {
      id: "async",
      scene: "async",
      text: "That flush costs a disk round trip on every commit, about three milliseconds on a cloud SSD. With synchronous_commit off, COMMIT returns before the flush: faster, but a crash can lose recent acknowledged commits, up to three times the WAL writer delay. The database stays consistent; it just forgets the last moment.",
      sourceIds: ["pg-async-commit"],
    },
    {
      id: "acid",
      text: "ACID is four promises: atomicity (all or nothing), consistency (constraints hold before and after), isolation (concurrent transactions do not see each other's half-done work), and durability (committed means it survives a crash). The next missions cover isolation in depth.",
    },
  ],
  challenges: [
    {
      id: "safe-transfer",
      title: "Make the transfer safe",
      brief: "Wallet transfers are two updates today with asynchronous commit. Change the design so no crash, after the debit or after COMMIT returns, can lose money or lose an acknowledged transfer, with a commit that takes at most 5 ms.",
      line: { speaker: "rao", line: "Fast and correct. I will accept three milliseconds for correct." },
      widget: { id: "txn-lab", config: TXN_CHALLENGE },
      conditions: [
        { metric: "moneyLost", op: "<=", value: 0, label: "No crash point loses or creates money" },
        { metric: "ackedLost", op: "<=", value: 0, label: "No acknowledged transfer is lost" },
        { metric: "commitMs", op: "<=", value: 5, label: "Commit takes at most 5 ms" },
      ],
      stars: [{ metric: "commitMs", op: "<=", value: 3, label: "Commit in 3 ms" }],
      hints: [
        "Which failure leaves one update done and the other not?",
        "Which setting lets COMMIT return before the log reaches disk?",
        "A transaction and synchronous commit together cost a flush. Is that within 5 ms?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain atomicity and durability, and how the write-ahead log provides them.",
    rubric: [
      { id: "atomic", criterion: "A transaction applies all of its statements or none; a crash before commit is rolled back", keyIdea: "all or nothing" },
      { id: "wal", criterion: "Changes are written to a log and flushed before commit returns, and replayed after a crash", keyIdea: "write-ahead log" },
      { id: "async", criterion: "Asynchronous commit trades a small window of lost acknowledged commits for lower latency", keyIdea: "durability for latency" },
    ],
    exemplar:
      "Atomicity means a transaction's statements all take effect or none do, so a crash before COMMIT is rolled back and a debit is never seen without its credit. Durability comes from the write-ahead log: changes are written and flushed to the log before COMMIT returns, and after a crash the database replays the log. With asynchronous commit the log is flushed a moment later, which is faster but can lose recently acknowledged commits.",
  },
  reviews: [
    {
      id: "ta-est",
      format: "estimate",
      scenario: "A database with synchronous commit flushes the WAL on every commit, 3 ms each. If transactions committed one after another with no batching, about how many commits a second could one connection do?",
      unit: "commits/s",
      answer: 333,
      acceptFactor: 1.2,
      breakdown: ["1 second ÷ 3 ms", "≈ 333 commits per second"],
      explain: "This is why group commit matters: many concurrent transactions share one flush, so throughput is far higher than one flush per commit.",
    },
    {
      id: "ta-pick",
      format: "pick-fix",
      scenario: "An API handler runs INSERT order, then INSERT order_items in separate autocommit statements. A crash between them leaves orders with no items. What is the fix?",
      options: [
        { id: "a", label: "Wrap both inserts in one transaction" },
        { id: "b", label: "Retry the handler after a crash" },
        { id: "c", label: "Insert the items first, then the order, still autocommit" },
        { id: "d", label: "Add an index on order_id" },
      ],
      answer: "a",
      explain: "Reordering only changes which half is missing. A transaction makes the order and its items appear together or not at all.",
    },
    {
      id: "ta-order",
      format: "order",
      scenario: "Order these settings by commit latency, fastest first.",
      items: [
        { id: "async", label: "Transaction, synchronous_commit off" },
        { id: "sync", label: "Transaction, synchronous_commit on" },
        { id: "auto", label: "Two autocommit statements, each flushed" },
      ],
      answer: ["async", "sync", "auto"],
      explain: "Asynchronous commit skips the flush. Two autocommit statements pay for two flushes where a transaction pays for one.",
    },
    {
      id: "ta-flaw",
      format: "spot-flaw",
      scenario: "A payments service sets synchronous_commit = off 'for speed' and tells users 'payment confirmed' on COMMIT. After a power cut, three confirmed payments are missing. Tap the setting responsible.",
      diagram: {
        nodes: [
          { id: "api", label: "api · confirms to the user on COMMIT", kind: "server", col: 0, row: 1 },
          { id: "pg", label: "postgres · synchronous_commit = off", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "api", to: "pg" }],
      },
      answer: "pg",
      explain: "With asynchronous commit the database acknowledges before the log is on disk. Money movements that were told 'confirmed' need synchronous commit; asynchronous suits data you can afford to lose a moment of.",
    },
    {
      id: "ta-graph",
      format: "predict-graph",
      scenario: "Run more and more concurrent connections, each committing small transactions, with synchronous commit on. How does commit throughput scale?",
      xLabel: "concurrent connections →",
      yLabel: "commits per second",
      options: [
        { id: "flat", label: "Flat at one flush per commit", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "grows", label: "Grows as flushes are shared (group commit), then levels off", points: [1, 3, 5, 6.5, 7.3, 7.7, 7.9, 8] },
        { id: "linear", label: "Grows without limit", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "falls", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "grows",
      explain: "Concurrent commits wait for the same WAL flush, so one disk write makes many transactions durable. Throughput rises until the disk or CPU is saturated.",
    },
    {
      id: "ta-explain",
      format: "explain",
      scenario: "In two sentences: why does the WAL let a database be durable without writing every data page before commit?",
      rubric: [
        { id: "log", criterion: "The log is a small sequential record of changes, cheap to flush at commit" },
        { id: "replay", criterion: "After a crash the database replays the log to rebuild any data pages that were not written" },
      ],
      exemplar: "The WAL is a compact, sequential record of changes, so flushing it at commit is cheap compared with writing scattered data pages. After a crash the database replays the log to rebuild whatever was not written.",
      explain: "Log first, pages later: the log is the promise, the pages are an optimisation.",
    },
  ],
  codex: {
    oneLiner: "A transaction makes statements all-or-nothing. The WAL, flushed at commit, makes committed work survive a crash.",
    keyNumbers: [
      { label: "ACID", value: "atomicity, consistency, isolation, durability", sourceId: "pg-transactions" },
      { label: "Async commit loss window", value: "up to 3 × wal_writer_delay (default 200 ms)", sourceId: "pg-async-commit" },
      { label: "WAL flush at commit", value: "about 3 ms on a cloud SSD", sourceId: "pg-wal" },
    ],
    tradeoffs: [
      { choice: "Synchronous commit", gain: "Acknowledged means durable", cost: "A disk flush per commit group" },
      { choice: "Asynchronous commit", gain: "Much lower commit latency", cost: "A crash can lose recently acknowledged commits" },
      { choice: "Large transactions", gain: "Fewer flushes, atomic units of work", cost: "Longer locks and more vacuum pressure" },
    ],
    seenIn: ["BEGIN … COMMIT in every ORM transaction block.", "Postgres recovery messages after an unclean shutdown."],
    interviewAngle: "Name the unit of work first ('the transfer is one transaction') and say what acknowledged means: 'commit returns only after the WAL is flushed.'",
    aws: [{ concept: "Managed Postgres with WAL", service: "Amazon RDS / Aurora (storage-level durability)" }],
    replay: { id: "txn-lab", config: { start: { txn: false, crash: "mid", sync: true } }, scene: "atomic" },
  },
  interview: [
    "What does ACID mean, in your own words?",
    "How does a database survive a crash without losing committed data?",
    "When would you use asynchronous commit?",
  ],
  deeper: [
    {
      title: "Group commit",
      body: "Flushing the log for every transaction would cap throughput at one flush per few milliseconds. Instead, transactions that commit at about the same time wait for a single flush that covers all of them. That is why a busy database can do tens of thousands of durable commits a second on storage whose single flush takes milliseconds.",
      derived: true,
    },
  ],
  honestPhysics: [
    "A transfer is two UPDATEs, and the lab crashes at two points: after the debit and after COMMIT returns. Real crashes can happen anywhere.",
    "Commit latency is about 3 ms with synchronous commit and under 1 ms without it, round figures for a cloud SSD. Group commit lets throughput exceed one flush per commit.",
    "With asynchronous commit a crash loses up to three times the WAL writer delay, 600 ms by default, but cannot corrupt the database.",
  ],
  sources: [PG_TXN, PG_WAL, PG_ASYNC],
  verify: [
    { id: "no-txn", claim: "Without a transaction a mid-transfer crash loses 100", run: "lab", params: { model: "txn-lab", config: TXN_CHALLENGE, values: { txn: false, sync: true }, metric: "moneyLost" }, expect: { min: 100, max: 100 } },
    { id: "async", claim: "A transaction with asynchronous commit can lose an acknowledged transfer", run: "lab", params: { model: "txn-lab", config: TXN_CHALLENGE, values: { txn: true, sync: false }, metric: "ackedLost" }, expect: { min: 1 } },
    { id: "safe", claim: "A transaction with synchronous commit loses nothing", run: "lab", params: { model: "txn-lab", config: TXN_CHALLENGE, values: { txn: true, sync: true }, metric: "moneyLost" }, expect: { max: 0 } },
    { id: "safe-acked", claim: "…and loses no acknowledged transfer", run: "lab", params: { model: "txn-lab", config: TXN_CHALLENGE, values: { txn: true, sync: true }, metric: "ackedLost" }, expect: { max: 0 } },
    { id: "safe-ms", claim: "…in about 3 ms", run: "lab", params: { model: "txn-lab", config: TXN_CHALLENGE, values: { txn: true, sync: true }, metric: "commitMs" }, expect: { max: 3 } },
  ],
});
