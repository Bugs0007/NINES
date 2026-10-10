import { defineBoss } from "../define";

export const SEAT = {};

const PG_LOCK = { id: "pg-explicit-locking", title: "PostgreSQL docs: Explicit Locking (row-level locks, SELECT FOR UPDATE)", url: "https://www.postgresql.org/docs/current/explicit-locking.html" };
const PG_ISO = { id: "pg-isolation", title: "PostgreSQL docs: Transaction Isolation", url: "https://www.postgresql.org/docs/current/transaction-iso.html" };
const PG_VACUUM = { id: "pg-vacuum", title: "PostgreSQL docs: Routine Vacuuming", url: "https://www.postgresql.org/docs/current/routine-vacuuming.html" };

export default defineBoss({
  id: "boss-seat-rush",
  title: "Boss: The Seat Rush",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "launch",
    alert: { severity: "page", title: "Ticket sale opens", detail: "20,000 seats, 200,000 people, one table" },
    lines: [{ speaker: "kabir", line: "Tickets for the cricket final go on sale at noon. Twenty thousand seats, two hundred thousand people, and one Postgres table named seats." }],
  },
  intro: [
    { speaker: "kabir", line: "Last time we sold the same seat to two people, and the stadium sorted it out with a shouting match." },
    { speaker: "meera", line: "Four things will fail together: finding free seats, two buyers racing, locks held through payment, and a report that blocks cleanup." },
    { speaker: "rao", line: "No seat sold twice, no five-second spinners, and nobody told to retry in a queue for an hour. I would also like a quiet weekend." },
  ],
  forecast: {
    metric: "p99",
    prompt: "Before the sale opens: what p99 will buyers see when they click a seat?",
    unit: "ms",
    scale: 1000,
    min: 5,
    max: 20000,
    tolerance: 2,
  },
  exercises: ["indexes-btree", "query-plans", "transactions-acid", "isolation-levels", "mvcc"],
  challenge: {
    id: "seat-rush",
    title: "Open the sale",
    brief: "Buyers find free seats, then claim one. Choose the index, how two buyers are kept from taking the same seat, how long a seat is held while the buyer pays, and where the sales report runs. No seat sold twice, p99 under 200 ms, under 10% of buyers asked to retry, and table bloat under 30%.",
    line: { speaker: "meera", line: "Think about what a buyer holds, and for how long, while the card form is open." },
    widget: { id: "seat-lab", config: SEAT },
    conditions: [
      { metric: "oversold", op: "<=", value: 0, label: "No seat sold twice" },
      { metric: "p99", op: "<", value: 0.2, label: "p99 under 200 ms" },
      { metric: "abortRate", op: "<", value: 0.1, label: "Under 10% of buyers must retry" },
      { metric: "bloat", op: "<", value: 0.3, label: "Table bloat under 30%" },
    ],
    stars: [{ metric: "abortRate", op: "<=", value: 0, label: "Nobody has to retry" }],
    hints: [
      "How does a buyer's query find free seats among the whole table, and what makes it fast?",
      "Which approaches stop two buyers taking one seat, and which of them make buyers wait or retry?",
      "A lock is held until the transaction ends. What happens if the transaction stays open while a person types a card number?",
    ],
  },
  debrief: [
    { id: "index", text: "The index first. Finding free seats for one event in a table of every seat ever sold is a scan without an index on the event and status. With it, the query reads a few pages and stops.", derived: true },
    { id: "race", text: "Then the race. Checking a seat and then updating it in two steps lets two buyers both pass the check. A row lock, a unique hold row, or Serializable each close it; they differ in whether the loser waits, fails fast, or retries.", sourceIds: ["pg-explicit-locking", "pg-isolation"] },
    { id: "hold", text: "Then the hold. A transaction that stays open while someone pays keeps every lock it took, so everyone else wanting that seat waits for the payment page. Mark the seat held with an expiry, commit, and release the lock in milliseconds.", derived: true },
    { id: "bloat", text: "And the report. A long transaction on the primary pins the cleanup horizon, and the seats table, updated on every hold, bloats until it ends. The report belongs on a replica.", sourceIds: ["pg-vacuum"] },
  ],
  outro: { speaker: "kabir", line: "Twenty thousand seats sold out in four minutes, each exactly once. The shouting match has been cancelled." },
  explainBack: {
    prompt: "Walk Kabir through the sale: what could have gone wrong at each step, and what you chose to prevent it.",
    rubric: [
      { id: "index", criterion: "Uses an index on event and status so finding free seats is fast", keyIdea: "index for the lookup" },
      { id: "race", criterion: "Prevents double sales with a lock, unique constraint, or Serializable transactions, and explains the tradeoff", keyIdea: "stop the race" },
      { id: "hold", criterion: "Avoids holding a transaction or lock open during payment, using a short hold with an expiry", keyIdea: "short holds" },
      { id: "bloat", criterion: "Runs long reports on a replica so vacuum is not blocked", keyIdea: "reports on a replica" },
    ],
    exemplar:
      "I added an index on event, status and seat so the free-seats query reads a few pages. To stop two buyers taking one seat I took a row lock when marking the seat held, which makes the second buyer wait for milliseconds instead of aborting, rather than relying on a check and an update. I committed straight after marking the seat held with an expiry, so nobody's lock lasted through payment. And I ran the sales report on a replica, so vacuum could keep the seats table from bloating.",
  },
  honestPhysics: [
    "Four simplified models run together: an indexed lookup, locks and aborts, seat holds, and vacuum bloat from a long report. Real sales also involve queues, payment providers, and seat maps.",
    "Aborts for serializable transactions and unique violations are illustrative: they depend on how many buyers contend for the same seat.",
    "Holding a row lock through payment makes everyone else for that seat wait the whole payment time, about eight seconds in the lab.",
  ],
  sources: [PG_LOCK, PG_ISO, PG_VACUUM],
  verify: [
    { id: "default", claim: "The default design sells seats twice and bloats the table", run: "lab", params: { model: "seat-lab", config: SEAT, values: {}, metric: "oversold" }, expect: { min: 1 } },
    { id: "payment-lock", claim: "A row lock held through payment makes p99 several seconds", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: true, strategy: "lock", hold: "payment", report: "replica" }, metric: "p99" }, expect: { min: 5 } },
    { id: "ser", claim: "Serializable asks too many buyers to retry", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: true, strategy: "ser", hold: "short", report: "replica" }, metric: "abortRate" }, expect: { min: 0.1 } },
    { id: "good-p99", claim: "A short hold with a row lock keeps p99 under 200 ms", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: true, strategy: "lock", hold: "short", report: "replica" }, metric: "p99" }, expect: { max: 0.2 } },
    { id: "good-abort", claim: "…with nobody asked to retry", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: true, strategy: "lock", hold: "short", report: "replica" }, metric: "abortRate" }, expect: { max: 0 } },
    { id: "good-bloat", claim: "…and bloat under 30% with the report on a replica", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: true, strategy: "lock", hold: "short", report: "replica" }, metric: "bloat" }, expect: { max: 0.3 } },
    { id: "no-index", claim: "Without the index p99 is seconds", run: "lab", params: { model: "seat-lab", config: SEAT, values: { index: false, strategy: "lock", hold: "short", report: "replica" }, metric: "p99" }, expect: { min: 1 } },
  ],
});
