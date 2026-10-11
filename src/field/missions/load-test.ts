import { defineField } from "../types";

export default defineField({
  id: "field-load-test",
  title: "Field: Load-test Your Own API",
  estimatedMinutes: 40,
  xp: 150,
  brief: [
    { speaker: "meera", line: "Everything in this chapter was a simulation. Now point a load generator at something you wrote and find where it bends." },
    { speaker: "rao", line: "Bring me the knee of the curve and a prediction you made before you measured it." },
  ],
  goal: "Find the concurrency at which your own API's latency stops being flat, and check it against Little's Law.",
  needs: ["Any HTTP API you can run locally (a todo app is fine)", "Node 18 or later for autocannon, or Go for hey, or k6", "A text editor for your notes"],
  steps: [
    {
      id: "pick",
      title: "Pick one endpoint and make it do real work",
      detail: "Choose a GET that touches your database or does some computation, not a static hello-world. Note how long one request takes when nothing else is running.",
      commands: ["curl -s -o /dev/null -w '%{time_total}\\n' http://localhost:3000/api/items"],
    },
    {
      id: "predict",
      title: "Write down a prediction",
      detail: "With one request taking W seconds and your server using N workers, Little's Law says it can hold about N requests at once and serve N ÷ W requests a second. Write both numbers down before you run anything.",
    },
    {
      id: "ramp",
      title: "Ramp the concurrency",
      detail: "Run the same 20-second test at 1, 4, 16, 64 and 256 connections. Keep the output of each run.",
      commands: ["npx autocannon -c 1 -d 20 http://localhost:3000/api/items", "npx autocannon -c 16 -d 20 http://localhost:3000/api/items", "npx autocannon -c 64 -d 20 http://localhost:3000/api/items"],
    },
    {
      id: "knee",
      title: "Find the knee",
      detail: "Plot or tabulate requests a second and p99 latency against connections. The knee is where throughput stops rising and latency starts to climb. Compare it with your prediction.",
    },
    {
      id: "fix",
      title: "Move the knee once",
      detail: "Change one thing: add workers, add an index, cache a result, or cut work per request. Run the knee test again and note how far it moved.",
    },
  ],
  criteria: [
    { id: "runs", criterion: "Shows load-generator output from at least two different concurrency levels, with requests per second and a tail latency percentile" },
    { id: "knee", criterion: "Identifies the concurrency at which throughput flattens and latency climbs" },
    { id: "predict", criterion: "States a prediction from Little's Law (workers and time per request) and compares it with the measured knee" },
    { id: "change", criterion: "Reports one change and how it moved the knee" },
  ],
  hints: [
    { text: "Throughput is requests a second; concurrency is how many are in flight. Latency is the third quantity, and Little's Law ties all three: in flight = rate × latency.", cost: 15 },
    { text: "If latency barely changes between 1 and 16 connections, you are below the knee. Keep doubling until p99 doubles.", cost: 20 },
    { text: "If throughput never flattens, your test machine is the bottleneck. Check the CPU of the load generator, or lower the connection count and use two generators.", cost: 25 },
  ],
  proof: {
    prompt: "Paste the load-generator output from two or more concurrency levels, then three lines: your prediction, the measured knee, and the one change you made and its effect.",
    placeholder: "autocannon -c 16 ... Req/Sec ... Latency 99% ...\nautocannon -c 64 ...\nPrediction: ...\nMeasured knee: ...\nChange: ...",
    checks: [
      { id: "rate", label: "Shows requests per second", pattern: "(req(uests)?\\s*/\\s*(s|sec)|http_reqs|requests/sec)" },
      { id: "tail", label: "Shows a tail latency (p99 or 99%)", pattern: "(p\\(?99\\)?|99(\\.\\d+)?\\s*%|99th)" },
      { id: "conc", label: "Shows concurrency (connections, VUs or -c)", pattern: "(connections|\\bvus\\b|-c\\s*\\d+|--connections|concurrency)" },
      { id: "predict", label: "Includes a prediction", pattern: "predict" },
      { id: "knee", label: "Names the knee", pattern: "knee" },
    ],
    sample:
      "autocannon -c 16 -d 20\n| Latency | 50% 41 ms | 99% 96 ms |\n| Req/Sec | 372 | 391 |\nautocannon -c 64 -d 20\n| Latency | 50% 168 ms | 99% 410 ms |\n| Req/Sec | 380 | 392 |\nPrediction: 8 workers at 20 ms is 400 requests a second at 8 in flight.\nMeasured knee: about 16 connections; throughput stayed near 390 beyond it.\nChange: added an index; the knee moved to 40 connections.",
  },
  debrief: [
    "Past the knee, adding connections does not add throughput; it only lengthens the queue, which is latency. That is the same curve the queueing lab drew.",
    "The knee is set by workers and time per request. To move it you either add workers or shorten each request, and the second is usually cheaper.",
  ],
  honestPhysics: ["Your laptop runs the server and the load generator together, so they compete for the same cores. The shape of the curve is real; the absolute numbers belong to your machine."],
  sources: [
    { id: "autocannon", title: "autocannon: a fast HTTP/1.1 benchmarking tool written in Node.js", url: "https://github.com/mcollina/autocannon" },
    { id: "k6-docs", title: "Grafana k6 documentation: Running k6", url: "https://grafana.com/docs/k6/latest/get-started/running-k6/" },
    { id: "littles-law", title: "Little (1961), A proof for the queuing formula L = λW", url: "https://pubsonline.informs.org/doi/10.1287/opre.9.3.383" },
  ],
});
