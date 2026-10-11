import { definePack } from "../define";

export const WK = { start: { model: "asyncpool", workers: 6, conns: 20000, heavy: true } };
export const WK_CHALLENGE = { lockConns: true, conns: 20000, start: { model: "thread", workers: 4, heavy: true } };

const C10K = { id: "c10k", title: "Dan Kegel: The C10K problem (handling ten thousand connections)", url: "http://www.kegel.com/c10k.html" };
const ASYNCIO = { id: "asyncio-docs", title: "Python docs: asyncio, asynchronous I/O (event loop, tasks, run_in_executor)", url: "https://docs.python.org/3/library/asyncio-eventloop.html" };
const NODE_LOOP = { id: "node-event-loop", title: "Node.js docs: The Node.js event loop (do not block it)", url: "https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop" };

export default definePack({
  id: "threads-processes-async",
  title: "Threads vs Processes vs Async",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "chat-gw · OOM-killed at 11,400 connections", detail: "thread-per-connection server, 2 MB stacks" },
    lines: [
      { speaker: "kabir", line: "The websocket gateway falls over at eleven thousand users. Each connection gets its own thread and nearly all of them are idle." },
      { speaker: "meera", line: "Waiting is free for a CPU and expensive for a stack. Pick the model by how much of your time is spent waiting and how many things wait at once." },
    ],
  },
  predictions: [
    {
      id: "threads",
      kind: "choice",
      prompt: "A server gives each of 20,000 mostly idle connections its own thread, at about 1 MB each. How much memory do the threads take?",
      options: [
        { id: "400", label: "About 400 MB" },
        { id: "2", label: "About 2 GB" },
        { id: "20", label: "About 20 GB" },
      ],
      answer: "20",
      observe: "oom-threads",
      reveal: {
        text: "20,000 × 1 MB is 20 GB, before the application's own use, for threads that mostly sleep. The scheduler's bookkeeping grows with the count as well, cutting useful capacity to about a sixth in the lab. An event loop holds the same connections in about 20 KB each: 400 MB.",
        derived: true,
        line: { speaker: "rao", line: "A blocked thread costs a stack. A waiting callback costs a few kilobytes." },
      },
    },
    {
      id: "blocked",
      kind: "choice",
      prompt: "You move to async event loops, 6 of them. 5% of requests do 80 ms of CPU work inline, on the loop. What happens to the slowest 1% of requests?",
      options: [
        { id: "same", label: "They stay near 195 ms, async is fast" },
        { id: "665", label: "They climb to about 665 ms: the loop is blocked while it computes" },
        { id: "fail", label: "They fail" },
      ],
      answer: "665",
      observe: "blocked-loop",
      reveal: {
        text: "One loop runs one thing at a time, so an 80 ms computation stops every other connection on that loop for 80 ms. The extra CPU work also pushes the loops to 90% busy, and queueing adds the rest: about 665 ms. Moving CPU-heavy work to a thread pool or another process keeps the loops free for waiting.",
        derived: true,
        line: { speaker: "meera", line: "On an event loop, never do anything slow in the loop's own thread." },
      },
    },
  ],
  widget: { id: "worker-lab", config: WK },
  mechanism: [
    {
      id: "waiting",
      text: "Most servers spend most of a request waiting: for a database, another service, a disk. While waiting, a CPU core can do something else. The question for a concurrency model is how to hold many waiting requests cheaply, and how to use all the cores for the CPU parts. The models answer these two questions differently.",
      sourceIds: ["c10k"],
    },
    {
      id: "threads",
      scene: "thread",
      text: "Threads give each request its own flow of control, which is easy to write and reason about. The operating system schedules them across cores. Each costs a stack, around a megabyte, and a context switch to run, so tens of thousands strain memory and the scheduler. A bounded thread pool limits that, and then waiting requests queue.",
      sourceIds: ["c10k"],
    },
    {
      id: "process",
      scene: "process",
      text: "Processes are heavier still: each has its own memory, around tens of megabytes, which is expensive and gives strong isolation, and a crash in one does not take the others. They use every core in languages with a global lock, and in prefork servers each handles one connection at a time, so the pool size caps concurrency.",
      sourceIds: ["c10k"],
    },
    {
      id: "async",
      scene: "async",
      text: "Async uses an event loop: one thread runs callbacks or coroutines, and anything that waits yields so another can run. A waiting connection costs a few kilobytes, so tens of thousands fit. Run one loop per core. A long computation on the loop blocks everything on it, so send CPU-heavy work to a thread or process pool.",
      sourceIds: ["asyncio-docs", "node-event-loop"],
    },
  ],
  challenges: [
    {
      id: "choose-workers",
      title: "Choose the worker model",
      brief: "Serve 600 requests a second and 20,000 connections in 8 GB of memory with the slowest 1% under 250 ms. Some requests do 80 ms of CPU work.",
      line: { speaker: "rao", line: "Hold every connection and don't let one slow request hold up the rest." },
      widget: { id: "worker-lab", config: WK_CHALLENGE },
      conditions: [
        { metric: "servesLoad", op: ">=", value: 1, label: "Holds all connections and 600 requests a second" },
        { metric: "memoryGB", op: "<=", value: 8, label: "At most 8 GB" },
        { metric: "p99ms", op: "<=", value: 250, label: "Slowest 1% under 250 ms" },
      ],
      stars: [{ metric: "memoryGB", op: "<=", value: 1.2, label: "At most 1.2 GB" }],
      hints: ["What does each model cost per idle connection?", "What happens to the loop when a handler computes?", "How many loops does 600 a second need?"],
    },
  ],
  explainBack: {
    prompt: "Compare threads, processes and async for a server, and say when to use each.",
    rubric: [
      { id: "cost", criterion: "Threads cost a stack each, processes a whole memory image, and async a few kilobytes per connection", keyIdea: "cost per waiting connection" },
      { id: "cpu", criterion: "CPU-bound work needs parallelism across cores: threads or processes; an event loop runs on one core and is blocked by long computations", keyIdea: "CPU work needs cores" },
      { id: "mix", criterion: "A common design is async loops, one per core, with CPU-heavy work offloaded to a thread or process pool", keyIdea: "async plus an offload pool" },
    ],
    exemplar:
      "Threads cost a stack each, processes a whole memory image, and async a few kilobytes per connection, so async is the cheapest way to hold many idle connections. CPU-bound work needs real parallelism across cores, with threads or processes, and an event loop runs on one core and is blocked by any long computation. A common design is async loops, one per core, with CPU-heavy work offloaded to a thread or process pool.",
  },
  reviews: [
    {
      id: "tpa-est",
      format: "estimate",
      scenario: "Requests arrive at 600 a second and each spends 195 ms in the system. How many requests are in flight on average (Little's law)?",
      unit: "requests",
      answer: 117,
      acceptFactor: 1.03,
      breakdown: ["L = λ × W = 600 × 0.195 = 117"],
      explain: "That is how many threads would be busy at once, with one thread per request.",
    },
    {
      id: "tpa-pick",
      format: "pick-fix",
      scenario: "An async web server's response times spike whenever a user exports a large report, which is computed in the request handler. What is the best fix?",
      options: [
        { id: "a", label: "Run the report in a worker pool (thread, process or job queue) and keep the loop free" },
        { id: "b", label: "Add more event loops and hope" },
        { id: "c", label: "Increase the timeout" },
        { id: "d", label: "Switch the report to a different font" },
      ],
      answer: "a",
      explain: "The computation blocks the loop. Moving it off the loop returns the loop to waiting on I/O.",
    },
    {
      id: "tpa-order",
      format: "order",
      scenario: "Order these by memory for 20,000 connections, most first.",
      items: [
        { id: "thread", label: "A thread per connection" },
        { id: "pool", label: "A pool of 64 processes (it holds 64 connections)" },
        { id: "async", label: "Async loops, 6 of them" },
      ],
      answer: ["thread", "pool", "async"],
      explain: "20.5 GB, 4 GB and 1 GB. The process pool is not serving 20,000 connections at all.",
    },
    {
      id: "tpa-graph",
      format: "predict-graph",
      scenario: "With a thread per connection, as connections rise from 100 to 100,000, how does memory change?",
      xLabel: "connections →",
      yLabel: "memory",
      options: [
        { id: "linear", label: "Rises in proportion", points: [0.6, 0.7, 1.5, 4.5, 10, 20, 50, 100] },
        { id: "flat", label: "Stays the same", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "log", label: "Rises slowly", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "linear",
      explain: "Each connection brings a thread with a stack, so memory is proportional to the count.",
    },
    {
      id: "tpa-flaw",
      format: "spot-flaw",
      scenario: "A Node.js API computes a bcrypt hash and a large JSON transformation directly in the request handler, on a single process. Tap the problem.",
      diagram: {
        nodes: [
          { id: "req", label: "many concurrent requests", kind: "client", col: 0, row: 1 },
          { id: "loop", label: "single event loop thread", kind: "server", col: 1, row: 1 },
          { id: "cpu", label: "hash and transform in the handler", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "loop" },
          { from: "loop", to: "cpu" },
        ],
      },
      answer: "loop->cpu",
      explain: "While the loop runs the CPU work, no other request advances. Offload to worker threads or another service, and run one process per core.",
    },
    {
      id: "tpa-explain",
      format: "explain",
      scenario: "In two sentences: why is async well suited to I/O-bound servers and poorly suited to CPU-bound ones?",
      rubric: [
        { id: "io", criterion: "Waiting yields to other tasks at almost no cost, so thousands of waiting connections share one thread" },
        { id: "cpu", criterion: "A computation holds the single thread, so it blocks everything else and uses only one core" },
      ],
      exemplar: "Waiting yields to other tasks at almost no cost, so thousands of waiting connections can share one thread. A computation holds that single thread, so it blocks everything else and uses only one core.",
      explain: "Async hides waiting. It does not create CPU.",
    },
  ],
  codex: {
    oneLiner: "Threads cost a stack, processes a memory image, async a few kilobytes. Async holds many idle connections; CPU work needs cores and an offload pool.",
    keyNumbers: [
      { label: "Thread per connection, 20,000 connections (lab)", value: "20.5 GB", sourceId: "c10k" },
      { label: "Async loops, 20,000 connections (lab)", value: "about 1 GB", sourceId: "asyncio-docs" },
    ],
    tradeoffs: [
      { choice: "Threads", gain: "Simple blocking code", cost: "Memory and switching at high counts" },
      { choice: "Processes", gain: "Isolation and cores", cost: "Heavy; low concurrency per process" },
      { choice: "Async", gain: "Cheap waiting", cost: "Blocked loops; colourful code" },
    ],
    seenIn: ["nginx, Node.js, asyncio and Go's runtime scheduler.", "Gunicorn worker types: sync, gthread, uvicorn."],
    interviewAngle: "Say: 'I/O-bound and many connections: async loops, one per core; CPU-bound: processes or a pool; never block the loop'.",
    aws: [{ concept: "Worker sizing", service: "ECS task CPU and memory; Lambda concurrency" }],
    replay: { id: "worker-lab", config: WK, scene: "async" },
  },
  interview: [
    "When would you choose threads, processes or async?",
    "What does it mean to block the event loop?",
    "How much memory does a thread cost?",
  ],
  deeper: [
    {
      title: "Go and virtual threads",
      body: "Some runtimes give you cheap concurrency with blocking-style code. Go schedules goroutines, a few kilobytes each, over a small set of OS threads. Java's virtual threads do the same. They keep the simple code of threads and the economy of an event loop, but CPU-heavy work still needs cores, and shared state still needs care.",
      sourceIds: ["c10k"],
    },
  ],
  honestPhysics: [
    "A server with 8 cores handles 600 requests a second plus a crowd of mostly idle connections. A request needs 5 ms of CPU and waits 190 ms; 5% also do 80 ms of CPU. A thread costs about 1 MB, a process 60 MB, an async connection 20 KB, and a loop 100 MB.",
    "One loop runs one core's worth of work at a time; heavy work inline adds 80 ms to the slowest requests, and moving it to a pool avoids that. Latency grows past 70% utilisation. Round figures.",
  ],
  sources: [C10K, ASYNCIO, NODE_LOOP],
  verify: [
    { id: "threads-mem", claim: "20,000 threads take about 20.5 GB", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: {}, metric: "memoryGB" }, expect: { min: 20, max: 21 } },
    { id: "blocked", claim: "Six loops with inline CPU work push the slowest 1% to about 665 ms", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "async", workers: 6 }, metric: "p99ms" }, expect: { min: 600, max: 700 } },
    { id: "good", claim: "Four async loops with a CPU pool serve the load", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "asyncpool", workers: 4 }, metric: "servesLoad" }, expect: { min: 1 } },
    { id: "good-p99", claim: "…with the slowest 1% at 236 ms", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "asyncpool", workers: 4 }, metric: "p99ms" }, expect: { min: 230, max: 245 } },
    { id: "process", claim: "A pool of 64 processes cannot hold 20,000 connections", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "process", workers: 64 }, metric: "servesLoad" }, expect: { max: 0 } },
    { id: "two", claim: "Two loops cannot carry the 600 requests a second", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "asyncpool", workers: 2 }, metric: "servesLoad" }, expect: { max: 0 } },
    { id: "mem", claim: "The good design uses about 1 GB", run: "lab", params: { model: "worker-lab", config: WK_CHALLENGE, values: { model: "asyncpool", workers: 4 }, metric: "memoryGB" }, expect: { min: 0.8, max: 1.1 } },
  ],
});
