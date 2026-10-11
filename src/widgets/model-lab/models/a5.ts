/**
 * Chapter A5 "The Database Wall" models: B-tree indexes, query plans, join or copy, transactions, isolation levels,
 * MVCC bloat, data-model match, LSM trees, "Postgres is enough", and the seat-rush boss. Page and I/O costs are
 * round, documented figures: an 8 KB page, 0.01 ms per sequentially read page, 0.1 ms per random page read.
 */
import { bool, num, str, sweep, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;

const SEQ_MS = 0.01;
const RAND_MS = 0.1;
const ROWS_PER_PAGE = 80;
const FANOUT = 300;
const depthFor = (rows: number) => Math.max(1, Math.ceil(Math.log(Math.max(2, rows)) / Math.log(FANOUT)));

// ------------------------------------------------------------------ B-tree indexes

const COLS = ["conv", "user", "created", "body"] as const;
type Col = (typeof COLS)[number];
const QUERIES: { id: string; label: string; col: Col; rows: number }[] = [
  { id: "conv", label: "A conversation's last 50 messages", col: "conv", rows: 50 },
  { id: "user", label: "One user's last 100 messages", col: "user", rows: 100 },
  { id: "created", label: "Messages from the last minute (about 100)", col: "created", rows: 100 },
];

export function indexQueryMs(rows: number, returned: number, indexed: boolean) {
  const seq = (rows / ROWS_PER_PAGE) * SEQ_MS;
  if (!indexed) return seq;
  const d = depthFor(rows);
  const index = d * RAND_MS + (returned / FANOUT) * RAND_MS + returned * RAND_MS;
  return Math.min(index, seq);
}

export const btreeLab: LabModel = {
  id: "btree-lab",
  metrics: ["worstMs", "writeMs", "indexGB", "pointMs", "depth"],
  observes: ["indexed", "seq-scan"],
  scenes: ["scan", "tree", "writes"],
  runLabel: "Run the migration",
  honest: [
    "Rows are 100 bytes, 80 to an 8 KB page; an index node holds about 300 entries. A sequential page read costs 0.01 ms and a random one 0.1 ms, round numbers for an SSD with a cold cache.",
    "Matching rows are fetched from the heap one random page each, as for an unclustered index. A real planner also uses bitmap scans and caches, which narrow the gap.",
    "Each index adds about half a millisecond to every insert (extra pages to update) and 5 GB per 500 million rows in this lab.",
  ],
  init: (c) => ({ rows: (c as { rows?: number }).rows ?? 500000000, conv: false, user: false, created: false, body: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockRows?: boolean }).lockRows) out.push({ kind: "slider", id: "rows", label: "Rows in the table", min: 1000, max: 1000000000, log: true, fmt: "num" });
    out.push({ kind: "toggle", id: "conv", label: "Index on conversation_id" }, { kind: "toggle", id: "user", label: "Index on user_id" }, { kind: "toggle", id: "created", label: "Index on created_at" }, { kind: "toggle", id: "body", label: "Index on body", detail: "A B-tree cannot help with LIKE '%word%'" });
    return out;
  },
  evaluate: (v) => {
    const rows = num(v, "rows");
    const n = COLS.filter((c) => bool(v, c)).length;
    const per = QUERIES.map((q) => ({ q, ms: indexQueryMs(rows, q.rows, bool(v, q.col)) }));
    const worst = Math.max(...per.map((p) => p.ms));
    const write = 1 + 0.5 * n;
    const gb = (n * 5 * rows) / 5e8;
    const ratio = (ms: number) => (ms < 20 ? ("ok" as Tone) : ms < 200 ? ("warn" as Tone) : ("alert" as Tone));
    return {
      metrics: { worstMs: worst, writeMs: write, indexGB: gb, pointMs: per[0]!.ms, depth: depthFor(rows) },
      readouts: [
        { label: "Slowest query", value: worst, fmt: "ms", tone: worst < 20 ? "ok" : worst < 200 ? "warn" : "alert" },
        { label: "Insert cost", value: write, fmt: "ms", sub: `${n} index${n === 1 ? "" : "es"}` },
        { label: "Index storage", value: gb, fmt: "num", sub: "GB" },
        { label: "B-tree depth", value: depthFor(rows), fmt: "int", sub: "pages from root to leaf" },
      ],
      view: { kind: "bars", fmt: "ms", bars: per.map((p) => ({ label: p.q.label, value: p.ms, tone: ratio(p.ms), sub: bool(v, p.q.col) ? "index scan" : "full scan" })), lines: [{ value: 20, label: "20 ms", tone: "ok" }] },
      notes: [n ? "Each index you add speeds one query and taxes every write." : "With no index, every query reads the whole table."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (COLS.some((c) => bool(v, c))) ev.push("indexed");
    if (!COLS.some((c) => bool(v, c)) && num(v, "rows") >= 1e7) ev.push("seq-scan");
    return ev;
  },
  scene: (n): SceneOut => (n === "scan" ? { set: { conv: false, user: false, created: false, body: false, rows: 500000000 }, focus: [] } : n === "tree" ? { set: { conv: true }, focus: ["conv"] } : n === "writes" ? { set: { conv: true, user: true, created: true, body: true }, focus: ["body"] } : undefined),
};

// ------------------------------------------------------------------ query plans

const PLAN_OPTS = [
  { id: "none", label: "No index" },
  { id: "conv", label: "Index on (conversation_id)" },
  { id: "sent", label: "Index on (sent_at)" },
  { id: "both", label: "Index on (conversation_id, sent_at DESC)" },
];

export function planFor(opt: string, include: boolean, limit: number) {
  const rows = 5e8;
  const perConv = 250;
  const d = depthFor(rows);
  if (opt === "none") return { node: "Seq Scan on messages", ms: (rows / ROWS_PER_PAGE) * SEQ_MS + 5, examined: rows, sort: true, extra: "Filter: conversation_id = $1, then Sort and Limit" };
  if (opt === "sent") return { node: "Index Scan Backward using messages_sent_at_idx", ms: Math.min((rows / ROWS_PER_PAGE) * SEQ_MS, ((limit * rows) / perConv) * RAND_MS * 0.01) + 5, examined: (limit * rows) / perConv, sort: false, extra: "Filter: conversation_id = $1 (walks newest to oldest until it finds enough matches)" };
  if (opt === "conv") return { node: "Index Scan using messages_conv_idx", ms: d * RAND_MS + perConv * RAND_MS + 0.1, examined: perConv, sort: true, extra: `Fetches all ${perConv} matches, then Sort and Limit ${limit}` };
  return include
    ? { node: "Index Only Scan Backward using messages_conv_sent_idx", ms: d * RAND_MS + (limit / FANOUT) * RAND_MS, examined: limit, sort: false, extra: "Heap Fetches: 0 (all needed columns are in the index)" }
    : { node: "Index Scan Backward using messages_conv_sent_idx", ms: d * RAND_MS + limit * RAND_MS, examined: limit, sort: false, extra: `Reads exactly ${limit} entries in order; no Sort node` };
}

export const planLab: LabModel = {
  id: "plan-lab",
  metrics: ["ms", "rowsExamined"],
  observes: ["seq-seen", "sorted-away"],
  scenes: ["seq", "composite", "covering"],
  runLabel: "Create the index",
  honest: [
    "The table has 500 million messages over 2 million conversations (about 250 each). Costs use the lab's page model: 0.1 ms per random page, 0.01 ms per sequential page.",
    "The planner here is a simple rule: it picks the cheapest of the plans these indexes allow. Real planners use statistics and can pick surprising plans.",
    "An index-only scan assumes the visibility map is current, which needs a recent vacuum.",
  ],
  init: () => ({ index: "none", covering: false, limit: 50 }),
  controls: () => [
    { kind: "choice", id: "index", label: "Index", options: PLAN_OPTS },
    { kind: "toggle", id: "covering", label: "Make it covering (INCLUDE the selected columns)", detail: "Lets the query be answered from the index alone" },
    { kind: "slider", id: "limit", label: "LIMIT", min: 10, max: 500, step: 10, fmt: "int" },
  ],
  evaluate: (v) => {
    const p = planFor(str(v, "index"), bool(v, "covering"), num(v, "limit"));
    return {
      metrics: { ms: p.ms, rowsExamined: p.examined },
      readouts: [
        { label: "Estimated time", value: p.ms, fmt: "ms", tone: p.ms < 10 ? "ok" : p.ms < 100 ? "warn" : "alert" },
        { label: "Rows examined", value: p.examined, fmt: "num" },
        { label: "Sort needed", value: p.sort ? "yes" : "no", tone: p.sort ? "warn" : "ok" },
      ],
      view: {
        kind: "steps",
        steps: [
          { label: "Limit", detail: `rows=${num(v, "limit")}`, tone: "muted" },
          ...(p.sort ? [{ label: "Sort  (sent_at DESC)", detail: "top-N heapsort of everything the scan returned", tone: "warn" as Tone }] : []),
          { label: p.node, detail: p.extra, value: `${p.ms < 10 ? p.ms.toFixed(1) : Math.round(p.ms).toLocaleString("en-US")}ms`, tone: p.ms < 10 ? "ok" : p.ms < 100 ? "warn" : "alert" },
        ],
      },
      notes: ["SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT " + num(v, "limit")],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "index") === "none") ev.push("seq-seen");
    if (str(v, "index") === "both") ev.push("sorted-away");
    return ev;
  },
  scene: (n): SceneOut => (n === "seq" ? { set: { index: "none" }, focus: ["index"] } : n === "composite" ? { set: { index: "both" }, focus: ["index"] } : n === "covering" ? { set: { index: "both", covering: true }, focus: ["covering"] } : undefined),
};

// ------------------------------------------------------------------ normalisation: join or copy

const ATTRS = [
  { id: "name", label: "author_name", changes: 0.05, copies: 400, note: "changes about 4,000 times a day system-wide" },
  { id: "avatar", label: "author_avatar_url", changes: 0.1, copies: 400, note: "changes about 9,000 times a day" },
  { id: "followers", label: "author_follower_count", changes: 200, copies: 400, note: "changes about 200 times a second" },
  { id: "verified", label: "author_is_verified", changes: 0.005, copies: 400, note: "changes about 400 times a day" },
];

export const joinLab: LabModel = {
  id: "join-lab",
  metrics: ["readMs", "writeRowsPerSec", "joins", "staleRisk"],
  observes: ["copied", "copied-hot"],
  scenes: ["join", "copy", "cache"],
  runLabel: "Ship the schema",
  honest: [
    "The feed shows 50 posts and each needs the author's columns. A join to users adds about 4 ms plus 0.4 ms per joined column group; a batched cache lookup adds about 0.5 ms.",
    "A copied value is rewritten on every post the author has written, about 400 rows each, whenever it changes. Rates are per second for the whole system.",
    "A cached value is read from a key-value store in one batch and can be a few seconds stale, which suits counters.",
  ],
  init: () => ({ name: "join", avatar: "join", followers: "join", verified: "join" }),
  controls: () => ATTRS.map<Control>((a) => ({ kind: "choice", id: a.id, label: `${a.label} (${a.note})`, options: [{ id: "join", label: "Read it with a join" }, { id: "copy", label: "Copy it into every post" }, { id: "cache", label: "Load it from a cache" }] })),
  evaluate: (v) => {
    const joined = ATTRS.filter((a) => str(v, a.id) === "join");
    const cached = ATTRS.filter((a) => str(v, a.id) === "cache");
    const readMs = 2 + (joined.length ? 4 + joined.length * 0.4 : 0) + (cached.length ? 0.5 : 0);
    const writeRows = ATTRS.reduce((s, a) => s + (str(v, a.id) === "copy" ? a.changes * a.copies : 0), 0);
    return {
      metrics: { readMs, writeRowsPerSec: writeRows, joins: joined.length ? 1 : 0, staleRisk: cached.length },
      readouts: [
        { label: "Feed query time", value: readMs, fmt: "ms", tone: readMs < 4 ? "ok" : readMs < 7 ? "warn" : "alert" },
        { label: "Rows rewritten per second", value: writeRows, fmt: "num", tone: writeRows > 5000 ? "alert" : writeRows > 500 ? "warn" : "ok" },
        { label: "Columns read with a join", value: joined.length, fmt: "int" },
        { label: "Columns possibly a few seconds stale", value: cached.length, fmt: "int" },
      ],
      view: { kind: "bars", fmt: "num", bars: ATTRS.map((a) => ({ label: `${a.label} · ${str(v, a.id)}`, value: str(v, a.id) === "copy" ? a.changes * a.copies : 0, tone: str(v, a.id) === "copy" ? (a.changes * a.copies > 5000 ? ("alert" as Tone) : ("ok" as Tone)) : ("muted" as Tone), sub: str(v, a.id) === "copy" ? "rows rewritten per second" : str(v, a.id) === "cache" ? "no write cost, may lag" : "no write cost, costs a join" })) },
      notes: [joined.length ? "A join stays in the feed query." : "No join: every column comes from the post row or a cache."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (ATTRS.some((a) => str(v, a.id) === "copy")) ev.push("copied");
    if (str(v, "followers") === "copy") ev.push("copied-hot");
    return ev;
  },
  scene: (n): SceneOut => (n === "join" ? { set: { name: "join", avatar: "join", followers: "join", verified: "join" }, focus: [] } : n === "copy" ? { set: { name: "copy", avatar: "copy", verified: "copy" }, focus: ["name", "avatar", "verified"] } : n === "cache" ? { set: { followers: "cache" }, focus: ["followers"] } : undefined),
};

// ------------------------------------------------------------------ transactions and ACID

export const txnLab: LabModel = {
  id: "txn-lab",
  metrics: ["moneyLost", "commitMs", "ackedLost", "inconsistent"],
  observes: ["torn", "durable"],
  scenes: ["atomic", "wal", "async"],
  runLabel: "Ship the transfer",
  honest: [
    "A transfer moves 100 between two accounts as two UPDATE statements. The lab crashes the server at the chosen point and shows what survives restart.",
    "Commit latency is dominated by the WAL flush to disk: about 3 ms on a cloud SSD with synchronous_commit on, under 1 ms with it off. Group commit amortises that cost across concurrent transactions.",
    "With synchronous_commit off, a crash can lose recently acknowledged commits, up to three times the WAL writer delay (600 ms by default), but cannot corrupt the database.",
  ],
  init: () => ({ txn: false, crash: "mid", sync: true }),
  controls: () => [
    { kind: "toggle", id: "txn", label: "Wrap both updates in BEGIN … COMMIT" },
    { kind: "choice", id: "crash", label: "Crash the server", options: [{ id: "none", label: "Never" }, { id: "mid", label: "After the debit, before the credit" }, { id: "post", label: "After COMMIT returns, before data pages are flushed" }] },
    { kind: "toggle", id: "sync", label: "synchronous_commit = on", detail: "COMMIT waits for the WAL to reach disk" },
  ],
  evaluate: (v) => {
    const txn = bool(v, "txn");
    const sync = bool(v, "sync");
    // What survives a crash at one point: balances A and B, whether money vanished, and whether an acknowledged transfer was lost.
    const outcome = (crash: string) => {
      let a = 500;
      let b = 100;
      let lost = 0;
      let acked = 0;
      if (crash === "mid") {
        if (!txn) {
          a = 400;
          lost = 100;
        }
      } else if (crash === "post") {
        a = 400;
        b = 200;
        if (txn && !sync) {
          a = 500;
          b = 100;
          acked = 1;
        }
      } else {
        a = 400;
        b = 200;
      }
      return { a, b, lost, acked };
    };
    const crash = str(v, "crash");
    const shown = outcome(crash);
    // The challenge cares about every crash point, not only the one on screen.
    const worstLost = Math.max(outcome("mid").lost, outcome("post").lost);
    const worstAcked = Math.max(outcome("mid").acked, outcome("post").acked);
    const steps: { label: string; detail?: string; value?: string; tone?: Tone }[] = [];
    steps.push({ label: txn ? "BEGIN" : "(autocommit: each statement is its own transaction)", tone: "muted" });
    steps.push({ label: "UPDATE accounts SET balance = balance − 100 WHERE id = A", value: txn ? "pending" : "committed", tone: "info" });
    if (crash === "mid") {
      steps.push({ label: "Server crashes", detail: txn ? "The transaction never committed; recovery rolls it back." : "The debit was already committed on its own; nothing undoes it.", tone: "alert" });
    } else {
      steps.push({ label: "UPDATE accounts SET balance = balance + 100 WHERE id = B", value: txn ? "pending" : "committed", tone: "info" });
      if (txn) steps.push({ label: "COMMIT", detail: sync ? "Waits for the WAL flush, then returns" : "Returns at once; the WAL is flushed shortly after", tone: "ok" });
      if (crash === "post") steps.push({ label: "Server crashes after COMMIT returned", detail: sync || !txn ? "The WAL reached disk first; recovery replays the transfer." : "The WAL for that commit may not have reached disk: an acknowledged transfer can vanish.", tone: "alert" });
    }
    const total = shown.a + shown.b;
    const commit = txn ? (sync ? 3 : 0.4) : 6;
    return {
      metrics: { moneyLost: worstLost, commitMs: commit, ackedLost: worstAcked, inconsistent: total !== 600 ? 1 : 0 },
      readouts: [
        { label: "Account A after restart", value: shown.a, fmt: "int" },
        { label: "Account B after restart", value: shown.b, fmt: "int" },
        { label: "Total (should be 600)", value: total, fmt: "int", tone: total !== 600 ? "alert" : "ok" },
        { label: "Commit latency", value: commit, fmt: "ms" },
        { label: "Acknowledged transfer lost", value: shown.acked ? "yes" : "no", tone: shown.acked ? "alert" : "ok" },
      ],
      view: { kind: "steps", steps },
      notes: [total !== 600 ? "Money disappeared: the debit survived and the credit never happened." : shown.acked ? "The database is consistent, but a transfer the user was told succeeded is gone." : "Both accounts agree and nothing acknowledged was lost."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.inconsistent === 1) ev.push("torn");
    if (bool(v, "txn") && bool(v, "sync") && str(v, "crash") !== "none") ev.push("durable");
    return ev;
  },
  scene: (n): SceneOut => (n === "atomic" ? { set: { txn: false, crash: "mid" }, focus: ["txn"] } : n === "wal" ? { set: { txn: true, crash: "post", sync: true }, focus: ["sync"] } : n === "async" ? { set: { txn: true, crash: "post", sync: false }, focus: ["sync"] } : undefined),
};

// ------------------------------------------------------------------ isolation levels

const ISO = {
  rc: { label: "Read Committed", lost: 1, nonrep: 1, phantom: 1, skew: 1, abort: 0.0, tput: 1 },
  rr: { label: "Repeatable Read (snapshot)", lost: 0, nonrep: 0, phantom: 0, skew: 1, abort: 0.04, tput: 0.95 },
  ser: { label: "Serializable", lost: 0, nonrep: 0, phantom: 0, skew: 0, abort: 0.12, tput: 0.85 },
} as const;

export const isoLab: LabModel = {
  id: "iso-lab",
  metrics: ["anomalies", "lostUpdate", "writeSkew", "abortRate", "throughput"],
  observes: ["skew-seen", "ser-chosen"],
  scenes: ["rc", "rr", "ser", "lock"],
  runLabel: "Set the isolation",
  honest: [
    "The table shows PostgreSQL's behaviour: Read Committed lets each statement see newly committed data, Repeatable Read gives a transaction one snapshot (and prevents phantoms), and Serializable adds conflict detection that aborts some transactions.",
    "Abort rates are illustrative for a workload where half the transactions touch the same hot rows. Real rates depend on the access pattern, and an aborted transaction must be retried by the application.",
    "SELECT … FOR UPDATE takes row locks on what you read. It prevents lost updates and covers write skew when it locks every row the decision depends on, at the cost of waiting rather than aborting.",
  ],
  init: () => ({ level: "rc", forUpdate: false }),
  controls: () => [
    { kind: "choice", id: "level", label: "Isolation level", options: [{ id: "rc", label: "Read Committed", detail: "PostgreSQL's default" }, { id: "rr", label: "Repeatable Read", detail: "One snapshot per transaction" }, { id: "ser", label: "Serializable", detail: "Detects conflicts; may abort" }] },
    { kind: "toggle", id: "forUpdate", label: "SELECT … FOR UPDATE on the rows you read", detail: "Locks them until commit" },
  ],
  evaluate: (v) => {
    const L = ISO[str(v, "level") as keyof typeof ISO];
    const fu = bool(v, "forUpdate");
    const lost = fu ? 0 : L.lost;
    const skew = fu ? 0 : L.skew;
    const abort = L.abort + (fu ? 0 : 0);
    const tput = L.tput * (fu ? 0.8 : 1);
    const cells = [
      { label: "Lost update", on: lost, detail: "Two read-modify-write transactions overwrite each other" },
      { label: "Non-repeatable read", on: L.nonrep, detail: "The same row reads differently twice in one transaction" },
      { label: "Phantom", on: L.phantom, detail: "A repeated query finds new rows" },
      { label: "Write skew", on: skew, detail: "Two transactions each read overlapping rows, then write different ones" },
    ];
    const n = cells.filter((c) => c.on).length;
    return {
      metrics: { anomalies: n, lostUpdate: lost, writeSkew: skew, abortRate: abort, throughput: tput },
      readouts: [
        { label: "Anomalies possible", value: n, fmt: "int", tone: n ? "alert" : "ok" },
        { label: "Transactions aborted", value: abort, fmt: "pct", sub: "must be retried", tone: abort > 0.1 ? "warn" : undefined },
        { label: "Relative throughput", value: tput, fmt: "pct" },
      ],
      view: { kind: "steps", steps: cells.map((c) => ({ label: c.label, detail: c.detail, value: c.on ? "can happen" : "prevented", tone: (c.on ? "alert" : "ok") as Tone })) },
      notes: [str(v, "level") === "rr" ? "Snapshot isolation is not serializable: write skew still gets through unless you lock or go Serializable." : str(v, "level") === "ser" ? "Nothing slips through, so some transactions fail and must be retried." : "Fast, and each statement sees the latest commits, so races are possible."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.writeSkew === 1 && str(v, "level") === "rr") ev.push("skew-seen");
    if (str(v, "level") === "ser") ev.push("ser-chosen");
    return ev;
  },
  scene: (n): SceneOut => (n === "rc" ? { set: { level: "rc", forUpdate: false }, focus: ["level"] } : n === "rr" ? { set: { level: "rr", forUpdate: false }, focus: ["level"] } : n === "ser" ? { set: { level: "ser", forUpdate: false }, focus: ["level"] } : n === "lock" ? { set: { level: "rc", forUpdate: true }, focus: ["forUpdate"] } : undefined),
};

// ------------------------------------------------------------------ MVCC and vacuum

export interface MvccRun {
  t: number[];
  dead: number[];
  bloat: number[];
  maxBloat: number;
  vacuums: number;
}

export function mvccRun(opts: { rows: number; updatesPerSec: number; scale: number; report: string }): MvccRun {
  const { rows, updatesPerSec, scale } = opts;
  const run: MvccRun = { t: [], dead: [], bloat: [], maxBloat: 0, vacuums: 0 };
  let dead = 0;
  const reportFrom = 2 * 3600;
  const reportTo = 8 * 3600;
  for (let t = 0; t <= 24 * 3600; t += 60) {
    dead += updatesPerSec * 60;
    const pinned = opts.report === "primary" && t >= reportFrom && t < reportTo;
    const threshold = 50 + scale * rows;
    if (dead > threshold && !pinned) {
      dead = 0;
      run.vacuums++;
    }
    const bloat = dead / rows;
    run.t.push(t / 3600);
    run.dead.push(dead);
    run.bloat.push(bloat);
    run.maxBloat = Math.max(run.maxBloat, bloat);
  }
  return run;
}

export const mvccLab: LabModel = {
  id: "mvcc-lab",
  metrics: ["maxBloat", "vacuums", "scanSlowdown"],
  observes: ["bloat-seen", "report-moved"],
  scenes: ["versions", "pinned", "vacuum"],
  runLabel: "Apply the settings",
  honest: [
    "An UPDATE writes a new row version and leaves the old one as a dead tuple until vacuum can remove it. The lab counts dead tuples against live rows, and treats vacuum as instant once it runs.",
    "Vacuum cannot remove a version that any open transaction might still see, so one long transaction on the primary holds back cleanup for everything, not just the rows it reads.",
    "Autovacuum triggers when dead tuples exceed 50 + scale factor × rows (the PostgreSQL default scale factor is 0.2). Real vacuum takes time and competes for I/O.",
  ],
  init: () => ({ scale: 0.2, report: "primary" }),
  controls: () => [
    { kind: "slider", id: "scale", label: "autovacuum_vacuum_scale_factor", min: 0.005, max: 0.5, log: true, fmt: "num", hint: "Vacuum when dead tuples exceed this share of the table" },
    { kind: "choice", id: "report", label: "The nightly report runs", options: [{ id: "primary", label: "On the primary, one 6-hour transaction" }, { id: "replica", label: "On a read replica" }, { id: "none", label: "Not at all" }] },
  ],
  evaluate: (v) => {
    const r = mvccRun({ rows: 10_000_000, updatesPerSec: 2000, scale: num(v, "scale"), report: str(v, "report") });
    const pts = (arr: number[]) => r.t.filter((_, i) => i % 6 === 0).map((t) => [t, arr[Math.round(t * 60)]!] as [number, number]);
    return {
      metrics: { maxBloat: r.maxBloat, vacuums: r.vacuums, scanSlowdown: 1 + r.maxBloat },
      readouts: [
        { label: "Worst bloat", value: r.maxBloat, fmt: "pct", sub: "dead tuples ÷ live rows", tone: r.maxBloat > 1 ? "alert" : r.maxBloat > 0.3 ? "warn" : "ok" },
        { label: "Vacuums in a day", value: r.vacuums, fmt: "int" },
        { label: "Sequential scans slower by", value: 1 + r.maxBloat, fmt: "x" },
      ],
      view: { kind: "curve", xLabel: "hours", yLabel: "dead tuples ÷ live rows", xFmt: "num", yFmt: "pct", series: [{ id: "bloat", label: "Bloat", tone: r.maxBloat > 0.3 ? "alert" : "ok", points: pts(r.bloat) }], hLines: [{ y: 0.3, label: "30%", tone: "info" }], vLines: str(v, "report") === "primary" ? [{ x: 2, label: "report starts", tone: "amber" }] : [] },
      notes: [str(v, "report") === "primary" ? "For six hours vacuum can remove nothing: the report's snapshot might still need every old version." : "Vacuum keeps pace; dead tuples stay a small share of the table."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.maxBloat! > 0.5) ev.push("bloat-seen");
    if (str(v, "report") !== "primary") ev.push("report-moved");
    return ev;
  },
  scene: (n): SceneOut => (n === "versions" ? { set: { report: "none", scale: 0.2 }, focus: [] } : n === "pinned" ? { set: { report: "primary" }, focus: ["report"] } : n === "vacuum" ? { set: { scale: 0.02 }, focus: ["scale"] } : undefined),
};

// ------------------------------------------------------------------ SQL vs NoSQL: data model match

const FAMILIES = [
  { id: "rel", label: "Relational (Postgres)" },
  { id: "doc", label: "Document (MongoDB, DynamoDB items)" },
  { id: "kv", label: "Key-value (Redis)" },
  { id: "wide", label: "Wide-column / time series (Cassandra)" },
  { id: "graph", label: "Graph (Neo4j)" },
];
const WORKLOADS: { id: string; label: string; need: string; fit: Record<string, number> }[] = [
  { id: "orders", label: "Orders and payments", need: "multi-row transactions, joins, constraints", fit: { rel: 2, doc: 0, kv: 0, wide: 0, graph: 0 } },
  { id: "carts", label: "Shopping carts and sessions", need: "get and put by key, 100,000 ops a second, expiry", fit: { rel: 1, doc: 1, kv: 2, wide: 1, graph: 0 } },
  { id: "catalog", label: "Product catalogue", need: "each product has different attributes; read one whole product by id", fit: { rel: 1, doc: 2, kv: 1, wide: 0, graph: 0 } },
  { id: "events", label: "Sensor events", need: "a million writes a second, queried by device and time range", fit: { rel: 0, doc: 0, kv: 0, wide: 2, graph: 0 } },
  { id: "friends", label: "Friend recommendations", need: "walk friends of friends three hops deep", fit: { rel: 1, doc: 0, kv: 0, wide: 0, graph: 2 } },
];

export const matchLab: LabModel = {
  id: "match-lab",
  metrics: ["score", "bestFit", "misfits"],
  observes: ["matched", "all-best"],
  scenes: ["rel", "kv"],
  runLabel: "Commit the architecture",
  honest: [
    "Each workload has one family that fits best and some that are acceptable. Real choices also depend on the team's skills, the operational story, and scale you may never reach.",
    "A fit of 1 means workable with effort, for example JSONB documents in Postgres or a key lookup in a relational table.",
    "'Postgres is enough' is a real position for most systems at this size; the next lesson tests it.",
  ],
  init: () => ({ orders: "rel", carts: "rel", catalog: "rel", events: "rel", friends: "rel" }),
  controls: () => WORKLOADS.map<Control>((w) => ({ kind: "choice", id: w.id, label: `${w.label}: ${w.need}`, options: FAMILIES.map((f) => ({ id: f.id, label: f.label })) })),
  evaluate: (v) => {
    const fits = WORKLOADS.map((w) => w.fit[str(v, w.id)] ?? 0);
    const score = fits.reduce((a, b) => a + b, 0);
    return {
      metrics: { score, bestFit: fits.filter((f) => f === 2).length, misfits: fits.filter((f) => f === 0).length },
      readouts: [
        { label: "Fit score", value: score, fmt: "int", sub: "of 10", tone: score >= 10 ? "ok" : score >= 7 ? "warn" : "alert" },
        { label: "Best-fit choices", value: fits.filter((f) => f === 2).length, fmt: "int", sub: "of 5" },
        { label: "Poor fits", value: fits.filter((f) => f === 0).length, fmt: "int", tone: fits.some((f) => f === 0) ? "alert" : "ok" },
      ],
      view: { kind: "steps", steps: WORKLOADS.map((w, i) => ({ label: `${w.label} → ${FAMILIES.find((f) => f.id === str(v, w.id))!.label}`, detail: w.need, value: fits[i] === 2 ? "best fit" : fits[i] === 1 ? "workable" : "poor fit", tone: (fits[i] === 2 ? "ok" : fits[i] === 1 ? "warn" : "alert") as Tone })) },
      notes: [],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.misfits === 0) ev.push("matched");
    if (out.metrics.bestFit === 5) ev.push("all-best");
    return ev;
  },
  scene: (n): SceneOut => (n === "rel" ? { set: { orders: "rel" }, focus: ["orders"] } : n === "kv" ? { set: { carts: "kv" }, focus: ["carts"] } : undefined),
};

// ------------------------------------------------------------------ LSM trees vs B-trees

export const lsmLab: LabModel = {
  id: "lsm-lab",
  metrics: ["diskWriteMBs", "readIos", "spaceFactor", "writeAmp"],
  observes: ["amp-seen", "bloom-on"],
  scenes: ["btree", "lsm", "compaction"],
  runLabel: "Choose the engine",
  honest: [
    "Amplification figures are textbook estimates: a B-tree rewrites an 8 KB page for each small update (80 times a 100-byte row), leveled compaction rewrites data about 10 times per level pair, and size-tiered about once per level. Real values depend on the workload, settings, and data.",
    "Bloom filters let a read skip files that do not hold the key, which brings point-read cost close to one I/O. Range scans do not benefit as much.",
    "Space amplification: a B-tree runs at about 70% page fill, leveled LSM is close to 1.1, and size-tiered compaction can hold 2 times the data while merging.",
  ],
  init: () => ({ engine: "btree", bloom: true, writes: 100000 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "engine", label: "Storage engine", options: [{ id: "btree", label: "B-tree (Postgres, InnoDB)" }, { id: "leveled", label: "LSM, leveled compaction (RocksDB default)" }, { id: "tiered", label: "LSM, size-tiered compaction (Cassandra default)" }] }, { kind: "toggle", id: "bloom", label: "Bloom filters on LSM files" }];
    if (!(c as { lockWrites?: boolean }).lockWrites) out.push({ kind: "slider", id: "writes", label: "Row writes per second", min: 1000, max: 1000000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v, c) => {
    const w = (c as { lockWrites?: boolean }).lockWrites ? Number((c as { writes?: number }).writes ?? 100000) : num(v, "writes");
    const e = str(v, "engine");
    const bloom = bool(v, "bloom");
    const amp = e === "btree" ? 80 : e === "leveled" ? 20 : 6;
    const readIos = e === "btree" ? 1.2 : e === "leveled" ? (bloom ? 1.1 : 6) : bloom ? 1.5 : 12;
    const space = e === "btree" ? 1.4 : e === "leveled" ? 1.1 : 2;
    const mbs = (w * 100 * amp) / 1e6;
    const rows = [
      { label: "B-tree", amp: 80 },
      { label: "LSM, leveled", amp: 20 },
      { label: "LSM, size-tiered", amp: 6 },
    ];
    return {
      metrics: { diskWriteMBs: mbs, readIos, spaceFactor: space, writeAmp: amp },
      readouts: [
        { label: "Disk writes", value: mbs, fmt: "num", sub: "MB per second", tone: mbs > 500 ? "alert" : mbs > 300 ? "warn" : "ok" },
        { label: "Write amplification", value: amp, fmt: "x" },
        { label: "Disk reads per point lookup", value: readIos, fmt: "num", tone: readIos > 3 ? "alert" : "ok" },
        { label: "Disk space per byte of data", value: space, fmt: "x" },
      ],
      view: { kind: "bars", fmt: "x", bars: rows.map((r) => ({ label: r.label + (r.label.startsWith(e === "btree" ? "B" : e === "leveled" ? "LSM, l" : "LSM, s") ? " (selected)" : ""), value: r.amp, tone: r.label.startsWith(e === "btree" ? "B" : e === "leveled" ? "LSM, l" : "LSM, s") ? ("amber" as Tone) : ("muted" as Tone) })) },
      notes: [e === "btree" ? "Each small write rewrites a whole page in place, in random locations." : "Writes go to memory and a log, then are merged into sorted files in the background, in large sequential writes."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (str(v, "engine") !== "btree") ev.push("amp-seen");
    if (str(v, "engine") !== "btree" && bool(v, "bloom")) ev.push("bloom-on");
    return ev;
  },
  scene: (n): SceneOut => (n === "btree" ? { set: { engine: "btree" }, focus: ["engine"] } : n === "lsm" ? { set: { engine: "leveled" }, focus: ["engine"] } : n === "compaction" ? { set: { engine: "tiered" }, focus: ["engine"] } : undefined),
};

// ------------------------------------------------------------------ Postgres is enough

const WORK = [
  { id: "oltp", label: "Core OLTP queries", units: 3000, offload: null as string | null },
  { id: "kv", label: "Cache-like key lookups (8,000 a second)", units: 2400, offload: "redis" },
  { id: "search", label: "Full-text search (300 a second)", units: 1500, offload: "search" },
  { id: "queue", label: "Job queue (500 jobs a second)", units: 1000, offload: "queue" },
  { id: "vector", label: "Vector similarity search (20 a second)", units: 400, offload: "vector" },
];
const SYSTEMS: Record<string, { label: string; cost: number }> = {
  redis: { label: "Add Redis for lookups", cost: 150 },
  search: { label: "Add OpenSearch for search", cost: 450 },
  queue: { label: "Add a managed queue for jobs", cost: 60 },
  vector: { label: "Add a vector database", cost: 300 },
};

export const pgLab: LabModel = {
  id: "pg-lab",
  metrics: ["pgUtil", "extraSystems", "costPerMonth", "pgUnits"],
  observes: ["offloaded", "bigger"],
  scenes: ["boring", "limits"],
  runLabel: "Sign off the architecture",
  honest: [
    "Work is counted in 'units' where one core query costs 1; a key lookup 0.3, a full-text search 5, a queued job 2, a vector search 20. They are rough ratios, not benchmarks.",
    "The instance can do about 10,000 units a second at comfortable load. A larger instance doubles that for about $700 more a month.",
    "Costs are round monthly figures. Each extra system also adds on-call, upgrades, and a failure mode, which the lab counts as one 'extra system' each.",
  ],
  init: () => ({ redis: false, search: false, queue: false, vector: false, big: false }),
  controls: () => [...Object.keys(SYSTEMS).map<Control>((k) => ({ kind: "toggle", id: k, label: SYSTEMS[k]!.label, detail: `$${SYSTEMS[k]!.cost} a month` })), { kind: "toggle", id: "big", label: "Move Postgres to a bigger instance", detail: "Doubles capacity for about $700 a month" }],
  evaluate: (v) => {
    const units = WORK.reduce((s, w) => s + (w.offload && bool(v, w.offload) ? 0 : w.units), 0);
    const cap = bool(v, "big") ? 20000 : 10000;
    const extra = Object.keys(SYSTEMS).filter((k) => bool(v, k)).length;
    const cost = 700 + Object.keys(SYSTEMS).reduce((s, k) => s + (bool(v, k) ? SYSTEMS[k]!.cost : 0), 0) + (bool(v, "big") ? 700 : 0);
    const util = units / cap;
    return {
      metrics: { pgUtil: util, extraSystems: extra, costPerMonth: cost, pgUnits: units },
      readouts: [
        { label: "Postgres busy", value: util, fmt: "pct", tone: util > 0.85 ? "alert" : util > 0.7 ? "warn" : "ok" },
        { label: "Extra systems to run", value: extra, fmt: "int", tone: extra > 1 ? "warn" : "ok" },
        { label: "Monthly cost", value: cost, fmt: "usd" },
      ],
      view: { kind: "bars", fmt: "num", max: 20000, bars: WORK.map((w) => ({ label: w.label + (w.offload && bool(v, w.offload) ? " · offloaded" : ""), value: w.offload && bool(v, w.offload) ? 0 : w.units, tone: w.offload && bool(v, w.offload) ? ("muted" as Tone) : ("info" as Tone) })), lines: [{ value: cap * 0.7, label: "70% of capacity", tone: "ok" }] },
      notes: [util > 0.85 ? "Postgres is past comfortable load." : "Postgres is carrying everything it was given."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (Object.keys(SYSTEMS).some((k) => bool(v, k))) ev.push("offloaded");
    if (bool(v, "big")) ev.push("bigger");
    return ev;
  },
  scene: (n): SceneOut => (n === "boring" ? { set: { redis: false, search: false, queue: false, vector: false, big: false }, focus: [] } : n === "limits" ? { set: { redis: true }, focus: ["redis"] } : undefined),
};

// ------------------------------------------------------------------ boss: seat rush

export const seatLab: LabModel = {
  id: "seat-lab",
  metrics: ["oversold", "p99", "abortRate", "bloat"],
  observes: [],
  scenes: [],
  runLabel: "Open the sale",
  honest: [
    "A sale of 20,000 seats opens to 200,000 people. Four models run together: indexed lookups, row locks and aborts, seat holds, and vacuum bloat from a reporting transaction.",
    "Holding a row lock through payment makes every other buyer for that seat wait the whole payment time. Short holds with a held_until timestamp release the lock at once.",
    "Aborts for serializable and unique-violation strategies are illustrative: they depend on how many buyers contend for the same seat.",
  ],
  init: () => ({ index: false, strategy: "none", hold: "payment", report: "primary" }),
  controls: () => [
    { kind: "toggle", id: "index", label: "Index on (event_id, status, seat)", detail: "For the 'find free seats' query" },
    { kind: "choice", id: "strategy", label: "Stopping two buyers taking one seat", options: [{ id: "none", label: "Check, then update (no lock)" }, { id: "lock", label: "SELECT … FOR UPDATE" }, { id: "ser", label: "Serializable transactions, retry on failure" }, { id: "unique", label: "INSERT into holds with UNIQUE (event, seat)" }] },
    { kind: "choice", id: "hold", label: "How long a seat is held while the buyer pays", options: [{ id: "payment", label: "Keep the transaction open through payment" }, { id: "short", label: "Mark held with held_until, commit at once" }] },
    { kind: "choice", id: "report", label: "The sales report runs", options: [{ id: "primary", label: "On the primary" }, { id: "replica", label: "On a read replica" }] },
  ],
  evaluate: (v) => {
    const s = str(v, "strategy");
    const oversold = s === "none" ? 1 : 0;
    const lockWait = s === "lock" || s === "unique" ? (str(v, "hold") === "payment" ? 8 : 0.02) : 0;
    const base = bool(v, "index") ? 0.015 : 4;
    const p99 = base + lockWait + (s === "ser" ? 0.05 : 0) + (str(v, "hold") === "payment" && s !== "lock" ? 0 : 0);
    const abort = s === "ser" ? 0.14 : s === "unique" ? 0.06 : 0;
    const bloat = str(v, "report") === "primary" ? 1.8 : 0.1;
    return {
      metrics: { oversold, p99, abortRate: abort, bloat },
      readouts: [
        { label: "Seats sold twice", value: oversold ? "yes" : "none", tone: oversold ? "alert" : "ok" },
        { label: "Page p99", value: p99, fmt: "s", tone: p99 > 0.2 ? "alert" : "ok" },
        { label: "Buyers who must retry", value: abort, fmt: "pct", tone: abort > 0.1 ? "alert" : abort > 0 ? "warn" : "ok" },
        { label: "Table bloat", value: bloat, fmt: "pct", tone: bloat > 0.3 ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "p99 (seconds)", value: p99, tone: p99 > 0.2 ? "alert" : "ok" }, { label: "Retry rate", value: abort, tone: abort > 0.1 ? "alert" : "ok" }, { label: "Bloat", value: bloat, tone: bloat > 0.3 ? "alert" : "ok" }] },
      notes: [oversold ? "Two buyers can both read the seat as free and both update it." : s === "lock" && str(v, "hold") === "payment" ? "Everyone who wants a seat waits for whoever holds its row lock to finish paying." : "Seats cannot be sold twice."],
    };
  },
};

export const A5_MODELS: LabModel[] = [btreeLab, planLab, joinLab, txnLab, isoLab, mvccLab, matchLab, lsmLab, pgLab, seatLab];
void sweep;
