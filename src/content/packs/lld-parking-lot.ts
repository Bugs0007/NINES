import { definePack } from "../define";

export const PK = { start: { index: "freelists", vehicles: "poly", pricing: "strategy", locking: "perspot" } };
export const PK_CHALLENGE = { start: { index: "scan", vehicles: "enum", pricing: "hard", locking: "none" } };

const GFG_PARKING = { id: "parking-design", title: "Object-oriented design of a parking lot (classes, strategies and spot allocation)", url: "https://www.geeksforgeeks.org/design-parking-lot-object-oriented-design/" };
const JAVA_CONC = { id: "java-lock", title: "Java docs: Lock objects (java.util.concurrent.locks)", url: "https://docs.oracle.com/javase/tutorial/essential/concurrency/newlocks.html" };
const STRATEGY = { id: "strategy-pattern", title: "Refactoring.Guru: Strategy pattern", url: "https://refactoring.guru/design-patterns/strategy" };

export default definePack({
  id: "lld-parking-lot",
  title: "LLD: Parking Lot",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "ops · two cars given spot B-114 at 08:02", detail: "entry gate 3 and gate 5 raced on the same free spot" },
    lines: [
      { speaker: "kabir", line: "Two cars were sent to the same spot, and adding electric vehicles meant editing five switch statements. The scan for a free spot is also getting slower." },
      { speaker: "meera", line: "A parking lot has four real questions: finding a spot, modelling vehicles, pricing, and stopping two gates taking the same spot." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "A lot has 10,000 spots. Finding a spot by scanning every spot for the first free one takes about how many steps on average?",
      options: [
        { id: "3", label: "About 3" },
        { id: "13", label: "About 13" },
        { id: "5000", label: "About 5,000" },
      ],
      answer: "5000",
      observe: "slow-find",
      reveal: {
        text: "On average the scan walks half the spots: 5,000 steps per arriving car, and it takes the first free spot wherever it is, a 90 m walk. A free list per spot size makes the lookup 3 steps. A min-heap of free spots by distance to the entrance takes about 13 steps and gives the nearest, 25 m.",
        derived: true,
        line: { speaker: "rao", line: "Don't search for free spots. Keep a list of them." },
      },
    },
    {
      id: "double",
      kind: "choice",
      prompt: "50 cars arrive at once at several gates and the spot allocation has no locking. About how many times a day are two cars given the same spot?",
      options: [
        { id: "0", label: "Never, spots are unique" },
        { id: "4", label: "About 4 times a day" },
        { id: "50", label: "About 50 times a day" },
      ],
      answer: "4",
      observe: "double-booked",
      reveal: {
        text: "Finding a free spot and marking it taken are two steps, and another gate can find the same spot between them: about 4.2 double bookings a day in the lab. A lock per spot makes find-and-take indivisible at a 10% throughput cost; one global lock does it and leaves a tenth.",
        derived: true,
        line: { speaker: "meera", line: "Lock the thing you are claiming, not the whole lot." },
      },
    },
  ],
  widget: { id: "parking-lab", config: PK },
  mechanism: [
    {
      id: "model",
      text: "Start with the nouns. A ParkingLot has Levels, each with Spots of different sizes. A Vehicle has a type, and a Ticket records the entry time and the spot. Behaviour belongs with the data: a Spot knows if it fits a vehicle. Separate what changes, such as spot choice and fee rules, from what does not.",
      sourceIds: ["parking-design"],
    },
    {
      id: "find",
      scene: "freelists",
      text: "Allocation is the performance question. Scanning all spots is linear in the lot. Keeping a free list per spot size makes the lookup constant. Keeping the free spots in a min-heap ordered by distance to the entrance returns the nearest in logarithmic time and shortens the walk. Update the structure on every entry and exit, and keep it consistent.",
      sourceIds: ["parking-design"],
    },
    {
      id: "extend",
      scene: "strategy",
      text: "Make change cheap. Give each vehicle type its own class behind a common interface, with the spot size it needs, so a new type is one new class and not an edit to every switch. Put pricing behind a strategy interface, hourly, flat or event-based, so the exit logic does not change when the rates do.",
      sourceIds: ["strategy-pattern", "parking-design"],
    },
    {
      id: "lock",
      scene: "heap",
      text: "Concurrency is the correctness question. Two gates can find the same free spot before either claims it. Make find-and-claim atomic: remove the spot from the free structure under a lock, or with a compare-and-swap on the spot's state. A lock per spot keeps different spots independent; one global lock is simple and serialises every arrival.",
      sourceIds: ["java-lock"],
    },
  ],
  challenges: [
    {
      id: "design-lot",
      title: "Design the lot",
      brief: "Find a spot in 20 steps or fewer with an average walk of 40 m or less, add a vehicle type or change pricing in one file each, never double-book, and keep at least half the throughput.",
      line: { speaker: "rao", line: "Quick, extensible, and one car per spot." },
      widget: { id: "parking-lab", config: PK_CHALLENGE },
      conditions: [
        { metric: "findSpotOps", op: "<=", value: 20, label: "At most 20 steps to find a spot" },
        { metric: "walkMetres", op: "<=", value: 40, label: "Average walk at most 40 m" },
        { metric: "filesNewVehicle", op: "<=", value: 1, label: "One file for a new vehicle type" },
        { metric: "filesPricingChange", op: "<=", value: 1, label: "One file for a pricing change" },
        { metric: "doubleBookingsDay", op: "<=", value: 0, label: "No double bookings" },
        { metric: "throughput", op: ">=", value: 0.5, label: "At least half the throughput" },
      ],
      stars: [],
      hints: ["Which structure returns the nearest free spot?", "Which choices make each change one file?", "Where should the lock sit?"],
    },
  ],
  explainBack: {
    prompt: "Walk through how you would design a parking lot system.",
    rubric: [
      { id: "model", criterion: "Identify lot, levels, spots, vehicles and tickets, with behaviour on the objects and variation behind interfaces", keyIdea: "model and interfaces" },
      { id: "alloc", criterion: "Allocate from a free structure, a list per size or a heap by distance, not by scanning every spot", keyIdea: "efficient allocation" },
      { id: "concurrency", criterion: "Make find-and-claim atomic with a per-spot lock or CAS, and use a pricing strategy so rate changes are one file", keyIdea: "atomic claim, pluggable pricing" },
    ],
    exemplar:
      "I would model the lot, levels, spots, vehicles and tickets, put behaviour on the objects, and hide what varies behind interfaces, a class per vehicle type and a pricing strategy. For allocation I would keep a free structure, a list per size or a min-heap by distance to the entrance, instead of scanning every spot. And I would make find-and-claim atomic with a per-spot lock or compare-and-swap, so concurrent gates never take the same spot.",
  },
  reviews: [
    {
      id: "pl-est",
      format: "estimate",
      scenario: "A min-heap holds 10,000 free spots. About how many steps does it take to remove the nearest?",
      unit: "steps",
      answer: 13,
      acceptFactor: 1.1,
      breakdown: ["log₂ 10,000 = 13.3"],
      explain: "A heap makes the nearest free spot cheap to find and to update.",
    },
    {
      id: "pl-pick",
      format: "pick-fix",
      scenario: "Introducing electric-vehicle spots needs edits to five switch statements across the code. Which refactor makes the next vehicle type a one-file change?",
      options: [
        { id: "a", label: "A Vehicle interface with a class per type that declares the spot it needs" },
        { id: "b", label: "More enum values and one more switch" },
        { id: "c", label: "A global constant" },
        { id: "d", label: "A comment listing the places to edit" },
      ],
      answer: "a",
      explain: "Polymorphism moves the type-specific decision into the type, so the callers stop switching.",
    },
    {
      id: "pl-order",
      format: "order",
      scenario: "Order these by throughput under 50 simultaneous arrivals, highest first.",
      items: [
        { id: "none", label: "No lock (and double bookings)" },
        { id: "perspot", label: "A lock per spot" },
        { id: "global", label: "One global lock" },
      ],
      answer: ["none", "perspot", "global"],
      explain: "100%, 90% and 10%. The first is fastest and wrong.",
    },
    {
      id: "pl-graph",
      format: "predict-graph",
      scenario: "As the lot grows from 1,000 to 100,000 spots, how does the average steps to find a spot change for a scan versus a heap?",
      xLabel: "spots →",
      yLabel: "steps to find a spot",
      options: [
        { id: "scan-linear", label: "The scan grows in proportion; the heap barely moves", points: [500, 1000, 2500, 5000, 10000, 20000, 35000, 50000] },
        { id: "both", label: "Both grow in proportion", points: [500, 1000, 2500, 5000, 10000, 20000, 35000, 50000] },
        { id: "flat", label: "Both stay flat", points: [10, 10, 10, 10, 10, 10, 10, 10] },
      ],
      answer: "scan-linear",
      explain: "The scan costs N ÷ 2 and the heap log₂ N, so at 100,000 spots the heap needs 17 steps and the scan 50,000.",
    },
    {
      id: "pl-flaw",
      format: "spot-flaw",
      scenario: "The entry code does: spot = findFree(); if (spot != null) { spot.occupied = true; issueTicket(spot); } on several threads. Tap the gap.",
      diagram: {
        nodes: [
          { id: "find", label: "findFree()", kind: "server", col: 0, row: 1 },
          { id: "gap", label: "(another gate runs here)", kind: "queue", col: 1, row: 1 },
          { id: "claim", label: "spot.occupied = true", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "find", to: "gap" },
          { from: "gap", to: "claim" },
        ],
      },
      answer: "find->gap",
      explain: "Between finding and claiming another thread can find the same spot. Make the pair atomic: remove the spot from the free structure under a lock.",
    },
    {
      id: "pl-explain",
      format: "explain",
      scenario: "In two sentences: why put pricing behind an interface rather than in the exit code?",
      rubric: [
        { id: "change", criterion: "Rates and rules change often, and an interface lets each be a new class without editing the exit logic" },
        { id: "test", criterion: "Each pricing rule can be tested alone, and several can coexist, for example by day type or by customer" },
      ],
      exemplar: "Rates and rules change often, and an interface lets each be a new class without editing the exit logic. Each rule can also be tested on its own, and several can coexist, for example by day type or by customer.",
      explain: "Isolate what varies.",
    },
  ],
  codex: {
    oneLiner: "Model lot, spots, vehicles and tickets. Allocate from a free structure, not a scan; hide vehicle types and pricing behind interfaces; claim spots atomically.",
    keyNumbers: [
      { label: "Scan vs free lists vs heap, steps (lab)", value: "5,000 vs 3 vs 13", sourceId: "parking-design" },
      { label: "No lock, 50 simultaneous arrivals (lab)", value: "4.2 double bookings a day", sourceId: "java-lock" },
    ],
    tradeoffs: [
      { choice: "Min-heap by distance", gain: "Nearest spot, short walk", cost: "More structure to maintain" },
      { choice: "Per-spot lock", gain: "Safe and parallel", cost: "A lock object per spot" },
      { choice: "Pricing strategy", gain: "Rates change in one place", cost: "An extra interface" },
    ],
    seenIn: ["A classic low-level design interview.", "Booking systems for seats, rooms and slots."],
    interviewAngle: "Say: 'nouns first, vehicle polymorphism, pricing strategy, a heap or free lists for allocation, and an atomic claim with a per-spot lock'.",
    aws: [{ concept: "Atomic claims at scale", service: "DynamoDB conditional writes; Redis SET NX" }],
    replay: { id: "parking-lab", config: PK, scene: "heap" },
  },
  interview: [
    "Design a parking lot system.",
    "How would you add electric-vehicle charging spots?",
    "How do you prevent two cars getting the same spot?",
  ],
  deeper: [
    {
      title: "From one process to many",
      body: "An in-memory lock stops two threads in one process. With several gate servers, the claim has to be atomic in a shared store: a conditional update that sets occupied only if it is currently free, or a lock service. The same design question moves to the database: find free spots with an index and claim one with a single compare-and-set statement.",
      sourceIds: ["java-lock"],
    },
  ],
  honestPhysics: [
    "A lot with 10,000 spots, four vehicle types and 50 cars arriving at once. Scanning takes 5,000 steps and takes the first free spot (a 90 m walk on average); free lists per size take 3 steps (60 m); a min-heap by distance takes log₂ 10,000, about 13 steps (25 m).",
    "An enum and switches touch 5 places for a new vehicle type; classes touch 1. Pricing in the exit code touches 4 places; a strategy 1. With no lock about 4.2 double bookings a day; a lock per spot costs 10% throughput; one global lock leaves a tenth. Round figures.",
  ],
  sources: [GFG_PARKING, JAVA_CONC, STRATEGY],
  verify: [
    { id: "scan", claim: "A scan takes 5,000 steps", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: {}, metric: "findSpotOps" }, expect: { min: 5000, max: 5000 } },
    { id: "heap", claim: "A heap takes about 13 steps and a 25 m walk", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: { index: "heap" }, metric: "walkMetres" }, expect: { min: 25, max: 25 } },
    { id: "heap-ops", claim: "…in 13.3 steps", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: { index: "heap" }, metric: "findSpotOps" }, expect: { min: 13, max: 14 } },
    { id: "double", claim: "No lock gives 4.2 double bookings a day", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: {}, metric: "doubleBookingsDay" }, expect: { min: 4.2, max: 4.2 } },
    { id: "perspot", claim: "A per-spot lock stops them at 90% throughput", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: { locking: "perspot" }, metric: "throughput" }, expect: { min: 0.9, max: 0.9 } },
    { id: "global", claim: "A global lock leaves a tenth", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: { locking: "global" }, metric: "throughput" }, expect: { min: 0.1, max: 0.1 } },
    { id: "files", claim: "Polymorphic vehicles and a pricing strategy are one file each", run: "lab", params: { model: "parking-lab", config: PK_CHALLENGE, values: { vehicles: "poly", pricing: "strategy" }, metric: "filesNewVehicle" }, expect: { min: 1, max: 1 } },
  ],
});
