import { definePack } from "../define";

export const GL = { start: { approach: "processes", n: 8, cpuShare: 0.9 } };
export const GL_CHALLENGE = { lockCpu: true, cpuShare: 0.9, start: { approach: "threads", n: 4 } };

const GIL_GLOSSARY = { id: "py-gil", title: "Python docs glossary: global interpreter lock", url: "https://docs.python.org/3/glossary.html#term-global-interpreter-lock" };
const PEP703 = { id: "pep703", title: "PEP 703: Making the Global Interpreter Lock optional in CPython", url: "https://peps.python.org/pep-0703/" };
const MULTIPROC = { id: "py-multiprocessing", title: "Python docs: multiprocessing (process-based parallelism)", url: "https://docs.python.org/3/library/multiprocessing.html" };

export default definePack({
  id: "python-gil",
  title: "Python's GIL",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "batch job · 8 threads, 1 core busy", detail: "runtime 7 min 50 s; single-threaded version took 7 min 20 s" },
    lines: [
      { speaker: "kabir", line: "I split the image processing across eight threads on an eight-core machine. It got a little slower, and seven cores sat idle." },
      { speaker: "meera", line: "CPython lets one thread run Python code at a time. Threads help when you wait, and do almost nothing when you compute." },
    ],
  },
  predictions: [
    {
      id: "cpu",
      kind: "choice",
      prompt: "A task spends 90% of its time computing in pure Python and 10% waiting on I/O. You use 8 threads on an 8-core machine. How much faster than one worker is it?",
      options: [
        { id: "8", label: "About 8× faster" },
        { id: "4", label: "About 4× faster" },
        { id: "1", label: "About the same, 1.06×" },
      ],
      answer: "1",
      observe: "no-speedup",
      reveal: {
        text: "The lock lets only one thread execute Python bytecode at a time, so the 90% that is computation takes turns on a single core. The waiting 10% overlaps, giving at most 1 ÷ 0.9 = 1.11×, and contention takes 5% of that: 1.06×. Eight threads add memory and switching and little else for CPU-bound code.",
        derived: true,
        line: { speaker: "rao", line: "Threads parallelise waiting. Only processes parallelise Python computing." },
      },
    },
    {
      id: "io",
      kind: "choice",
      prompt: "Now a task spends 10% of its time computing and 90% waiting on network calls. You use 8 threads. How much faster than one worker?",
      options: [
        { id: "1", label: "About the same, the GIL blocks threads" },
        { id: "76", label: "About 7.6×: the waiting overlaps" },
        { id: "20", label: "About 20×" },
      ],
      answer: "76",
      observe: "io-speedup",
      reveal: {
        text: "A thread releases the lock when it waits for I/O, so another can compute. With 10% CPU the single lock can keep up to 10 threads busy, so eight threads reach 8× and the 5% contention penalty leaves 7.6×, at 1.35× the memory. The same job with 8 processes is 8× but costs 8× the memory.",
        derived: true,
        line: { speaker: "meera", line: "The lock matters when you compute. When you wait, threads are just fine." },
      },
    },
  ],
  widget: { id: "gil-lab", config: GL },
  mechanism: [
    {
      id: "lock",
      text: "CPython, the standard Python, has a global interpreter lock: a mutex that only one thread can hold while running Python bytecode. It makes memory management simple and fast for a single thread, and keeps extension code safe. The cost is that a program with many threads cannot run Python code on more than one core at a time.",
      sourceIds: ["py-gil", "pep703"],
    },
    {
      id: "threads",
      scene: "threads",
      text: "Threads still help when they wait. A thread releases the lock while blocked on a network call, a disk read or a sleep, so others run. An I/O-bound program, such as a scraper or an API client, gets close to linear speedup from threads. A CPU-bound one is limited to what a single core does.",
      sourceIds: ["py-gil"],
    },
    {
      id: "processes",
      scene: "processes",
      text: "For CPU-bound work, use processes. Each process has its own interpreter and lock, so they run on separate cores, up to the core count. They do not share memory, so data goes over pipes or shared memory, and each process holds its own copy of the program, which costs memory. multiprocessing and process pools wrap this.",
      sourceIds: ["py-multiprocessing"],
    },
    {
      id: "other",
      scene: "asyncio",
      text: "There are other routes. asyncio overlaps waiting on a single thread with almost no memory cost, but cannot compute in parallel. Libraries such as NumPy release the lock inside their native loops, so threads can scale there. Newer free-threaded builds make the lock optional. Choose by where the time goes, which you can measure with a profiler.",
      sourceIds: ["pep703", "py-gil"],
    },
  ],
  challenges: [
    {
      id: "pick-concurrency",
      title: "Pick the concurrency",
      brief: "A CPU-heavy job (90% computing) on an 8-core machine must run at least 6× faster than one worker, using no more than 8.5 times the memory.",
      line: { speaker: "rao", line: "Use the cores, and don't use more memory than the speedup is worth." },
      widget: { id: "gil-lab", config: GL_CHALLENGE },
      conditions: [
        { metric: "speedup", op: ">=", value: 6, label: "At least 6× faster" },
        { metric: "memoryX", op: "<=", value: 8.5, label: "At most 8.5× the memory" },
      ],
      stars: [],
      hints: ["What does the lock allow threads to do for computation?", "What does each process cost in memory?", "How many cores are there?"],
    },
  ],
  explainBack: {
    prompt: "Explain Python's GIL and how to work around it.",
    rubric: [
      { id: "what", criterion: "Only one thread runs Python bytecode at a time, so threads do not speed up CPU-bound pure Python code", keyIdea: "one thread computes at a time" },
      { id: "io", criterion: "Threads release the lock while waiting on I/O, so I/O-bound programs benefit from threads or asyncio", keyIdea: "waiting overlaps" },
      { id: "fix", criterion: "For CPU-bound work use processes (or native code that releases the lock), accepting the memory and communication cost", keyIdea: "processes for CPU" },
    ],
    exemplar:
      "The GIL lets only one thread run Python bytecode at a time, so threads do not speed up CPU-bound pure Python code. Threads release the lock while waiting on I/O, so I/O-bound programs still benefit from threads or asyncio. For CPU-bound work I would use processes, or native code that releases the lock, and accept the memory and communication cost.",
  },
  reviews: [
    {
      id: "gil-est",
      format: "estimate",
      scenario: "A task is 10% CPU and 90% waiting. What is the most threads can speed it up before the lock becomes the limit?",
      unit: "× speedup",
      answer: 10,
      acceptFactor: 1.05,
      breakdown: ["The CPU part serialises on the lock", "limit = 1 ÷ 0.10 = 10×"],
      explain: "The ceiling is one over the CPU share. With 90% CPU it is 1.11×.",
    },
    {
      id: "gil-pick",
      format: "pick-fix",
      scenario: "A data-processing script uses a thread pool for CPU-heavy parsing, and its runtime does not improve with more threads. What should change?",
      options: [
        { id: "a", label: "Use a process pool (or native code that releases the lock) for the parsing" },
        { id: "b", label: "Add more threads" },
        { id: "c", label: "Reduce the thread count to one and hope" },
        { id: "d", label: "Turn on asyncio for the parsing" },
      ],
      answer: "a",
      explain: "Parsing in Python holds the lock. Separate processes get separate locks and cores.",
    },
    {
      id: "gil-order",
      format: "order",
      scenario: "Order these approaches for a 90% CPU task by speedup, most first (8 workers, 8 cores).",
      items: [
        { id: "proc", label: "8 processes" },
        { id: "async", label: "asyncio" },
        { id: "threads", label: "8 threads" },
      ],
      answer: ["proc", "async", "threads"],
      explain: "8×, 1.11× and 1.06×.",
    },
    {
      id: "gil-graph",
      format: "predict-graph",
      scenario: "For a 90% CPU task, as the number of threads rises from 1 to 16, how does throughput change?",
      xLabel: "threads →",
      yLabel: "speedup",
      options: [
        { id: "flat", label: "Barely changes", points: [1, 1.05, 1.06, 1.06, 1.06, 1.06, 1.06, 1.06] },
        { id: "linear", label: "Rises with each thread", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "peak", label: "Rises, then falls", points: [1, 2, 3, 4, 3, 2, 1, 0.5] },
      ],
      answer: "flat",
      explain: "The lock serialises the CPU part. Extra threads only add switching.",
    },
    {
      id: "gil-flaw",
      format: "spot-flaw",
      scenario: "A service uses 16 processes, each loading a 3 GB model, to serve CPU-bound requests on a 4 GB machine. Tap the problem.",
      diagram: {
        nodes: [
          { id: "req", label: "requests", kind: "client", col: 0, row: 1 },
          { id: "pool", label: "16 processes", kind: "worker", col: 1, row: 1 },
          { id: "mem", label: "16 copies of a 3 GB model", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "req", to: "pool" },
          { from: "pool", to: "mem" },
        ],
      },
      answer: "pool->mem",
      explain: "Processes do not share Python memory by default, so each loads its own copy: 48 GB. Use fewer processes, shared memory, or a model server.",
    },
    {
      id: "gil-explain",
      format: "explain",
      scenario: "In two sentences: why do threads help an I/O-bound Python program despite the GIL?",
      rubric: [
        { id: "release", criterion: "A thread releases the lock while it waits for I/O, so another thread can run Python code in the meantime" },
        { id: "overlap", criterion: "Most of the time is spent waiting, so overlapping the waits gives a large speedup even though computation is serialised" },
      ],
      exemplar: "A thread releases the lock while it waits for I/O, so another thread can run Python code in the meantime. Most of the time is spent waiting, so overlapping the waits gives a large speedup even though computation is serialised.",
      explain: "The lock only serialises computation.",
    },
  ],
  codex: {
    oneLiner: "One thread runs Python at a time. Threads and asyncio overlap waiting; processes parallelise computing, at a memory cost per process.",
    keyNumbers: [
      { label: "8 threads, 90% CPU (lab)", value: "1.06× faster", sourceId: "py-gil" },
      { label: "8 processes, 90% CPU (lab)", value: "8× faster, 8× memory", sourceId: "py-multiprocessing" },
    ],
    tradeoffs: [
      { choice: "Threads", gain: "Cheap, shared memory, good for I/O", cost: "No CPU parallelism in pure Python" },
      { choice: "Processes", gain: "Real parallelism", cost: "Memory per process; data copying" },
      { choice: "asyncio", gain: "Cheap waiting", cost: "One thread; blocks on computation" },
    ],
    seenIn: ["multiprocessing pools, gunicorn workers and Celery prefork.", "PEP 703 free-threaded builds."],
    interviewAngle: "Say: 'the GIL serialises Python bytecode; threads for waiting, processes for computing; measure where the time goes'.",
    aws: [{ concept: "Worker processes", service: "Gunicorn on ECS; Lambda concurrency model" }],
    replay: { id: "gil-lab", config: GL, scene: "processes" },
  },
  interview: [
    "What is the GIL and why does it exist?",
    "When do Python threads help?",
    "How would you speed up a CPU-bound Python program?",
  ],
  deeper: [
    {
      title: "Free-threaded Python",
      body: "Recent CPython versions have an optional build without the global lock, which lets threads compute in parallel. It changes the trade-off: threads become attractive for CPU work, at the cost of some single-thread speed and extensions that must be made thread-safe. Check your libraries before relying on it, and keep the same advice: measure first.",
      sourceIds: ["pep703"],
    },
  ],
  honestPhysics: [
    "A task takes one unit of time, a share c of it CPU and the rest waiting on I/O, on an 8-core machine. N threads: throughput grows with N up to 1 ÷ c times a single worker, minus 5% contention. N processes: up to 8 ÷ c, with memory growing N-fold. asyncio: up to 1 ÷ c on one thread.",
    "Round figures: native extensions that release the lock, and free-threaded builds, change the picture.",
  ],
  sources: [GIL_GLOSSARY, PEP703, MULTIPROC],
  verify: [
    { id: "cpu-threads", claim: "8 threads on a 90% CPU task give 1.06×", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "threads", n: 8 }, metric: "speedup" }, expect: { min: 1.05, max: 1.07 } },
    { id: "io-threads", claim: "8 threads on a 10% CPU task give 7.6×", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "threads", n: 8, cpuShare: 0.1 }, metric: "speedup" }, expect: { min: 7.5, max: 7.7 } },
    { id: "procs", claim: "8 processes on a 90% CPU task give 8×", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "processes", n: 8 }, metric: "speedup" }, expect: { min: 7.99, max: 8.01 } },
    { id: "mem", claim: "…at 8× the memory", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "processes", n: 8 }, metric: "memoryX" }, expect: { min: 8, max: 8 } },
    { id: "nine", claim: "9 processes cost more memory than they are worth: 8.9× for 9×", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "processes", n: 9 }, metric: "memoryX" }, expect: { min: 9, max: 9 } },
    { id: "async", claim: "asyncio on a CPU-bound task gives 1.11×", run: "lab", params: { model: "gil-lab", config: GL_CHALLENGE, values: { approach: "asyncio", n: 1 }, metric: "speedup" }, expect: { min: 1.1, max: 1.12 } },
  ],
});
