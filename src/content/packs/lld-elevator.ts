import { definePack } from "../define";

export const EL = { start: { algo: "sstf", cars: 1, rate: 8 } };
export const EL_CHALLENGE = { lockCars: true, cars: 2, lockRate: true, rate: 8, start: { algo: "fcfs" } };

const SCAN_DISK = { id: "disk-scheduling", title: "Operating Systems: Three Easy Pieces, hard disk scheduling (SSTF, SCAN and starvation)", url: "https://pages.cs.wisc.edu/~remzi/OSTEP/file-disks.pdf" };
const ELEVATOR_DESIGN = { id: "elevator-design", title: "Object-oriented design of an elevator system (cars, requests and dispatch)", url: "https://www.geeksforgeeks.org/design-elevator-system/" };
const STATE_PATTERN = { id: "state-pattern", title: "Refactoring.Guru: State pattern (behaviour that changes with the object's state)", url: "https://refactoring.guru/design-patterns/state" };

export default definePack({
  id: "lld-elevator",
  title: "LLD: Elevator",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "tenant survey · 'I waited six minutes for the lift'", detail: "floor 19, morning peak, one car zig-zagging" },
    lines: [
      { speaker: "kabir", line: "Our elevator answers whoever pressed first, running up to 18, down to 2, up to 17. The person on 19 waited six minutes." },
      { speaker: "meera", line: "The scheduler decides who waits. First come first served is fair and slow, nearest-first is quick and can strand someone, and sweeping gets both." },
    ],
  },
  predictions: [
    {
      id: "starved",
      kind: "choice",
      prompt: "A single elevator serves a 20-floor building with 8 requests a minute, strictly first come, first served. The average wait is about 163 seconds. How long does the unluckiest passenger wait?",
      options: [
        { id: "200", label: "About 200 seconds" },
        { id: "368", label: "About 368 seconds, over six minutes" },
        { id: "800", label: "About 800 seconds" },
      ],
      answer: "368",
      observe: "starved",
      reveal: {
        text: "FCFS never reorders. A request just behind a long trip must wait for the car to finish that trip, and the next, so waits queue up: 368 s at the worst in this simulation, and the average is 163. Fairness by arrival order is not fairness in waiting time, because the car moves a long way between consecutive requests.",
        derived: true,
        line: { speaker: "rao", line: "In-order service wastes travel. Travel is the scarce resource." },
      },
    },
    {
      id: "efficient",
      kind: "choice",
      prompt: "Two elevators, 8 requests a minute, and each car sweeps one direction serving every stop on the way, then reverses (LOOK). About what is the average wait?",
      options: [
        { id: "20", label: "About 20 seconds" },
        { id: "46", label: "About 46 seconds" },
        { id: "120", label: "About 2 minutes" },
      ],
      answer: "46",
      observe: "efficient",
      reveal: {
        text: "Sweeping serves nearby requests on the way, so most passengers are collected within one pass: 46 s on average and 172 s at the worst, against 159 and 383 for FCFS with the same two cars. Nearest-first gets a 42 s average and a 211 s worst case, because it can keep serving nearby floors while a far one waits.",
        derived: true,
        line: { speaker: "meera", line: "Sweeping is a bounded wait. Nearest-first is a lottery for the far floors." },
      },
    },
  ],
  widget: { id: "elevator-lab", config: EL },
  mechanism: [
    {
      id: "model",
      text: "Model the parts. An Elevator has a floor, a direction and a set of stops. A Request is a hall call (floor and direction) or a cabin button (destination). A Dispatcher assigns hall calls to cars, and each car's Scheduler picks its next stop. The state pattern captures idle, moving up, moving down and doors open.",
      sourceIds: ["elevator-design", "state-pattern"],
    },
    {
      id: "fcfs",
      scene: "fcfs",
      text: "First come, first served is simple and obviously fair by arrival order. It ignores geography: the car crosses the building to answer a call just behind one it passed, so average waits are long and the worst waits longest. It is the right baseline to beat, and rarely the right production answer for a busy building.",
      sourceIds: ["disk-scheduling"],
    },
    {
      id: "sstf",
      scene: "sstf",
      text: "Nearest stop first reduces travel and the average wait. The risk is starvation: while new requests keep arriving near the car's position, a call at the far end can wait indefinitely. The same pattern appears in disk scheduling. It scores well on the mean and badly on the worst case, which is what tenants complain about.",
      sourceIds: ["disk-scheduling"],
    },
    {
      id: "look",
      scene: "look",
      text: "LOOK, the elevator algorithm, keeps moving in one direction, stopping for every request on the way, and reverses only when nothing lies ahead. Every request is reached within one sweep in each direction, so the worst wait is bounded and the average stays low. Add elevators and a dispatcher that sends the nearest idle or same-direction car.",
      sourceIds: ["disk-scheduling", "elevator-design"],
    },
  ],
  challenges: [
    {
      id: "pick-scheduler",
      title: "Choose the scheduler",
      brief: "Two cars, 8 requests a minute: an average wait of 50 seconds or less, a 95th percentile of 130 or less, and nobody waiting more than 200 seconds.",
      line: { speaker: "rao", line: "Short on average, and no one forgotten on the 19th floor." },
      widget: { id: "elevator-lab", config: EL_CHALLENGE },
      conditions: [
        { metric: "meanWaitSec", op: "<=", value: 50, label: "Average wait at most 50 s" },
        { metric: "p95WaitSec", op: "<=", value: 130, label: "95th percentile at most 130 s" },
        { metric: "maxWaitSec", op: "<=", value: 200, label: "Longest wait at most 200 s" },
      ],
      stars: [],
      hints: ["Which scheduler has the best average?", "Which one has the best worst case?", "Which meets all three?"],
    },
  ],
  explainBack: {
    prompt: "Explain how you would design an elevator system and its scheduling.",
    rubric: [
      { id: "model", criterion: "Elevators with floor, direction and stops; hall and cabin requests; a dispatcher assigning calls; states such as idle, moving and doors open", keyIdea: "objects and states" },
      { id: "algo", criterion: "FCFS is simple and slow; nearest-first has a good average and can starve far floors; LOOK sweeps and bounds the wait", keyIdea: "FCFS, nearest, LOOK" },
      { id: "tradeoff", criterion: "Judge by average and worst-case wait, and add cars with a dispatcher assigning the closest suitable car", keyIdea: "mean and worst case" },
    ],
    exemplar:
      "I would model elevators with a floor, direction and stops, hall and cabin requests, a dispatcher assigning calls, and states such as idle, moving and doors open. First come first served is simple and slow, nearest-first has a good average and can starve far floors, and LOOK sweeps in one direction and bounds the wait. I would judge them by both the average and the worst-case wait, and add cars with a dispatcher that assigns the closest suitable one.",
  },
  reviews: [
    {
      id: "el-est",
      format: "estimate",
      scenario: "A car takes 2 s per floor. To go from floor 2 to floor 18 and back to floor 3, how many seconds of travel is that, without stops?",
      unit: "seconds",
      answer: 66,
      acceptFactor: 1.03,
      breakdown: ["16 floors up = 32 s", "15 floors down = 30 s; about 62 to 66 s"],
      explain: "A long zig-zag costs over a minute, and a request just behind it waits that out.",
    },
    {
      id: "el-pick",
      format: "pick-fix",
      scenario: "A far-floor passenger waits ten minutes because the car keeps serving new nearby requests. Which scheduler fixes the starvation while keeping a good average?",
      options: [
        { id: "a", label: "LOOK: sweep one direction, serve every stop on the way, then reverse" },
        { id: "b", label: "Nearest stop first, with more cars" },
        { id: "c", label: "Random order" },
        { id: "d", label: "Serve only the top floor" },
      ],
      answer: "a",
      explain: "A sweep reaches every floor within a bounded time, so nobody waits indefinitely.",
    },
    {
      id: "el-order",
      format: "order",
      scenario: "Order these by the longest wait at 8 requests a minute with one car, longest first.",
      items: [
        { id: "fcfs", label: "First come, first served" },
        { id: "sstf", label: "Nearest stop first" },
        { id: "look", label: "LOOK" },
      ],
      answer: ["fcfs", "sstf", "look"],
      explain: "368, 279 and 216 seconds.",
    },
    {
      id: "el-graph",
      format: "predict-graph",
      scenario: "As the request rate rises from 4 to 12 a minute with one car and first come, first served, how does the average wait change?",
      xLabel: "requests a minute →",
      yLabel: "average wait",
      options: [
        { id: "rise", label: "Rises, then levels as the queue saturates the car", points: [131, 145, 157, 160, 163, 166, 166, 166] },
        { id: "fall", label: "Falls", points: [166, 160, 150, 140, 130, 120, 110, 100] },
        { id: "flat", label: "Stays near 20 seconds", points: [20, 20, 20, 20, 20, 20, 20, 20] },
      ],
      answer: "rise",
      explain: "The car cannot keep up beyond a point, and then waits are limited by how fast it can travel, not by the arrival rate.",
    },
    {
      id: "el-flaw",
      format: "spot-flaw",
      scenario: "The elevator class has a method move() with a long chain of if statements on a mode variable: idle, up, down, doorsOpen, maintenance. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "req", label: "requests arrive", kind: "client", col: 0, row: 1 },
          { id: "move", label: "move(): if mode == idle ... else if mode == up ...", kind: "server", col: 1, row: 1 },
          { id: "car", label: "elevator state", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "move" },
          { from: "move", to: "car" },
        ],
      },
      answer: "req->move",
      explain: "Every new state or event edits the same long method. A state object per mode, each knowing its own behaviour, keeps the transitions explicit and testable.",
    },
    {
      id: "el-explain",
      format: "explain",
      scenario: "In two sentences: why can the best average wait still be a bad design?",
      rubric: [
        { id: "tail", criterion: "A scheduler can lower the mean by favouring easy requests and leave a few passengers waiting very long, which they notice most" },
        { id: "measure", criterion: "Judge a scheduler by percentiles and the worst case, not only the mean" },
      ],
      exemplar: "A scheduler can lower the mean by favouring easy requests and leave a few passengers waiting very long, and those are the ones who notice. So judge it by percentiles and the worst case, not only the mean.",
      explain: "People remember the worst wait.",
    },
  ],
  codex: {
    oneLiner: "Elevators with floor, direction, stops and states. FCFS is fair and slow, nearest-first is quick and can starve, LOOK sweeps and bounds the wait.",
    keyNumbers: [
      { label: "One car, 8 a minute, FCFS (lab)", value: "163 s average, 368 s worst", sourceId: "disk-scheduling" },
      { label: "Two cars, 8 a minute, LOOK (lab)", value: "46 s average, 172 s worst", sourceId: "disk-scheduling" },
    ],
    tradeoffs: [
      { choice: "FCFS", gain: "Simplest, in order", cost: "Long travel, long waits" },
      { choice: "Nearest first", gain: "Best average", cost: "Starvation of far floors" },
      { choice: "LOOK", gain: "Bounded wait, good average", cost: "Slightly more state" },
    ],
    seenIn: ["Disk schedulers (elevator algorithm).", "A classic low-level design round."],
    interviewAngle: "Say: 'objects and a state pattern for the car, a dispatcher for hall calls, and LOOK for the schedule because it bounds the wait'.",
    aws: [{ concept: "Scheduling as a queue", service: "SQS with priority or FIFO queues" }],
    replay: { id: "elevator-lab", config: EL, scene: "look" },
  },
  interview: [
    "Design an elevator system.",
    "How would you schedule requests, and what are the trade-offs?",
    "How would you handle two or more elevators?",
  ],
  deeper: [
    {
      title: "Destination dispatch",
      body: "Modern systems ask for the destination floor at the hall, not up or down, and assign passengers to cars so people going to nearby floors ride together. That adds information to the scheduler and cuts the number of stops. The design change is small, and the performance gain is large in tall buildings.",
      sourceIds: ["elevator-design"],
    },
  ],
  honestPhysics: [
    "A seeded simulation of a 20-floor building over half an hour of random requests, each from one floor to another. Cars move a floor in 2 s and stop 5 s to load and unload. A new request goes to the car with the least cost (distance plus 6 s per passenger it already has).",
    "First come first served always goes to the oldest outstanding stop and only stops there. Nearest-stop-first goes to the closest stop. LOOK keeps its direction and serves stops on the way. Waits count until pickup; a request still waiting at the end counts its wait so far.",
  ],
  sources: [SCAN_DISK, ELEVATOR_DESIGN, STATE_PATTERN],
  verify: [
    { id: "fcfs", claim: "One car, FCFS, 8 a minute: longest wait over 350 s", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "fcfs", cars: 1 }, metric: "maxWaitSec" }, expect: { min: 350 } },
    { id: "fcfs-mean", claim: "…with an average of about 163 s", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "fcfs", cars: 1 }, metric: "meanWaitSec" }, expect: { min: 150, max: 175 } },
    { id: "look-mean", claim: "Two cars, LOOK: average about 46 s", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "look" }, metric: "meanWaitSec" }, expect: { min: 40, max: 50 } },
    { id: "look-max", claim: "…and the longest wait under 200 s", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "look" }, metric: "maxWaitSec" }, expect: { max: 200 } },
    { id: "look-p95", claim: "…and the 95th percentile within 130 s", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "look" }, metric: "p95WaitSec" }, expect: { max: 130 } },
    { id: "sstf-max", claim: "Nearest-first misses the worst-case target with two cars", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "sstf" }, metric: "maxWaitSec" }, expect: { min: 200 } },
    { id: "fcfs-two", claim: "FCFS with two cars misses the average target", run: "lab", params: { model: "elevator-lab", config: EL_CHALLENGE, values: { algo: "fcfs" }, metric: "meanWaitSec" }, expect: { min: 50 } },
  ],
});
