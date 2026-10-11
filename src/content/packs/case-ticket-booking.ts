import { defineBoss } from "../define";

export const TKC = {};

const REDLOCK = { id: "redis-locks", title: "Redis docs: Distributed locks with Redis (and their limits)", url: "https://redis.io/docs/latest/develop/use/patterns/distributed-locks/" };
const KLEPPMANN = { id: "kleppmann-locks", title: "Martin Kleppmann: How to do distributed locking (fencing tokens)", url: "https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html" };
const PG_LOCKS = { id: "pg-locks", title: "PostgreSQL docs: Explicit locking (row-level locks and SELECT FOR UPDATE)", url: "https://www.postgresql.org/docs/current/explicit-locking.html" };

export default defineBoss({
  id: "case-ticket-booking",
  title: "Case: Ticket Booking (Seat Contention)",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "on-sale · 50,000 buyers for 10,000 seats, 380 seats sold twice", detail: "checkout p99 18 s; the database CPU is at 100%" },
    lines: [{ speaker: "kabir", line: "The concert went on sale at noon. Fifty thousand people hit the same ten thousand seats in a minute, we sold 380 of them twice, and checkout took eighteen seconds." }],
  },
  intro: [
    { speaker: "meera", line: "This is contention on a small number of rows. The design question is who gets a seat, how fast, and what happens to the seat while they decide." },
    { speaker: "rao", line: "People who abandon a hold are a cost. So is a database asked to do fifty thousand things at once." },
  ],
  forecast: {
    metric: "doubleBookings",
    prompt: "If the service checks that a seat is free and then writes the booking, with no locking, how many of the 10,000 seats are sold twice in the rush?",
    unit: "seats",
    scale: 1,
    min: 1,
    max: 5000,
    tolerance: 1.5,
  },
  exercises: ["distributed-locks", "isolation-levels", "cache-aside"],
  challenge: {
    id: "design-onsale",
    title: "Run the on-sale",
    brief: "Never sell a seat twice, keep checkout p99 at or under 500 ms, sell out in 12 minutes or less, and keep the database at 10,000 requests a second or less.",
    line: { speaker: "meera", line: "A correct lock, a short hold, and a way to meter the crowd." },
    widget: { id: "ticketing-lab", config: TKC },
    conditions: [
      { metric: "doubleBookings", op: "<=", value: 0, label: "No seat sold twice" },
      { metric: "checkoutP99Ms", op: "<=", value: 500, label: "Checkout p99 at most 500 ms" },
      { metric: "sellOutMin", op: "<=", value: 12, label: "Sell out in 12 minutes or less" },
      { metric: "dbLoadRps", op: "<=", value: 10000, label: "Database at most 10,000 requests a second" },
    ],
    stars: [{ metric: "checkoutP99Ms", op: "<=", value: 100, label: "Checkout p99 at most 100 ms" }],
    hints: ["Which locking approaches guarantee no double booking?", "How long should an unpaid seat stay held?", "How do you keep the database from seeing all 50,000 at once?"],
  },
  debrief: [
    { id: "lock", text: "Checking and then writing leaves a gap another buyer can use: 380 seats sold twice. An optimistic version check or a row lock closes the gap. A Redis hold with an expiry is the fastest and has a rare race when a hold expires mid-payment, so a fencing token or a final database check is still needed.", sourceIds: ["pg-locks", "redis-locks", "kleppmann-locks"] },
    { id: "hold", text: "A hold is a loan of the seat, and 35% of holds are never paid for. Each minute of hold idles a third of a minute of inventory, so a 10-minute hold sells out in 10.9 minutes where a 2-minute hold takes 7. Short holds with an extension on activity serve both.", derived: true },
    { id: "queue", text: "A waiting room admits buyers at a pace the system can serve: database load fell from 50,000 requests a second to 5,000 and checkout p99 from seconds to under 100 ms. Caching the seat map helps further, since most requests only look.", derived: true },
  ],
  outro: { speaker: "kabir", line: "A waiting room, optimistic versioning and a two-minute hold. Sold out in seven minutes with nobody holding someone else's seat." },
  explainBack: {
    prompt: "Explain how your design prevents double booking and survives the rush.",
    rubric: [
      { id: "lock", criterion: "Make check-and-take atomic: an optimistic version check, a row lock or a hold with an expiry and a fencing check", keyIdea: "atomic claim" },
      { id: "hold", criterion: "Holds expire, and a short hold cuts the inventory idled by abandoned carts", keyIdea: "short expiring holds" },
      { id: "queue", criterion: "A waiting room meters demand so the database sees thousands, not tens of thousands, of requests a second", keyIdea: "meter the crowd" },
      { id: "cache", criterion: "Cache read-heavy data such as the seat map, and keep writes on the strongly consistent path", keyIdea: "separate reads from writes" },
    ],
    exemplar:
      "The claim on a seat is atomic: an optimistic version check means two buyers cannot both win, with the loser retrying a different seat. Holds expire after two minutes so abandoned carts return the seat quickly. A waiting room admits buyers at a pace the system can serve, which dropped database load from fifty thousand to five thousand requests a second, and the seat map is cached because most requests only look. Writes stay on the consistent path.",
  },
  honestPhysics: [
    "10,000 seats, 50,000 buyers in the first minute. With no locking about 380 seats are sold twice. Optimistic checks give a p99 of 400 ms at full load, row locks 1,800 ms, a Redis hold 90 ms with a rare expiry race (2 seats).",
    "35% of holds are abandoned; the sell-out takes 6 minutes plus 1.4 × (hold × 0.35). A waiting room cuts database load to a tenth and a cached seat map by 40%; latency falls with load. Round figures.",
  ],
  sources: [REDLOCK, KLEPPMANN, PG_LOCKS],
  verify: [
    { id: "forecast", claim: "No locking sells 380 seats twice", run: "lab", params: { model: "ticketing-lab", config: TKC, values: {}, metric: "doubleBookings" }, expect: { min: 380, max: 380 } },
    { id: "optimistic", claim: "An optimistic check sells none twice", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { lock: "optimistic" }, metric: "doubleBookings" }, expect: { max: 0 } },
    { id: "redis", claim: "A Redis hold has a rare race: 2 seats", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { lock: "redis" }, metric: "doubleBookings" }, expect: { min: 2, max: 2 } },
    { id: "pessimistic", claim: "A row lock needs a queue to stay under 500 ms", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { lock: "pessimistic", queue: false, mapCache: false }, metric: "checkoutP99Ms" }, expect: { min: 1500 } },
    { id: "good", claim: "Optimistic locking, a waiting room and a 2-minute hold give a 94 ms p99", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { lock: "optimistic", holdMin: 2, queue: true, mapCache: false }, metric: "checkoutP99Ms" }, expect: { min: 90, max: 98 } },
    { id: "sellout", claim: "…selling out in 7 minutes", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { lock: "optimistic", holdMin: 2, queue: true }, metric: "sellOutMin" }, expect: { min: 6.9, max: 7.1 } },
    { id: "long-hold", claim: "A 30-minute hold takes over 20 minutes to sell out", run: "lab", params: { model: "ticketing-lab", config: TKC, values: { holdMin: 30 }, metric: "sellOutMin" }, expect: { min: 20 } },
  ],
});
