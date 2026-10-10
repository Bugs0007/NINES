import { definePack } from "../define";

export const PROXY = { start: { buffering: false, slowShare: 0, workers: 16, rps: 150 } };
export const PROXY_CHALLENGE = { rps: 150, start: { buffering: false, slowShare: 0.15, workers: 16 } };

const NGINX_PROXY = { id: "nginx-proxy-module", title: "nginx docs: ngx_http_proxy_module (proxy_buffering, proxy_pass)", url: "https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering" };
const GUNICORN_DESIGN = { id: "gunicorn-design", title: "Gunicorn docs: Design (sync workers and slow clients; run behind a buffering proxy)", url: "https://gunicorn.org/design/" };
const NGINX_ADMIN = { id: "nginx-reverse-proxy", title: "NGINX docs: Reverse Proxy (what a reverse proxy does)", url: "https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/" };

export default definePack({
  id: "reverse-proxy",
  title: "Reverse Proxies (Nginx)",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "api · 502 Bad Gateway", detail: "all 16 workers busy, CPU 12%" },
    lines: [
      { speaker: "pager", line: "502s on the API: every worker is busy, CPU is at 12%, and nothing in the logs is slow." },
      { speaker: "meera", line: "Look at who the workers are busy with. A worker serving a slow phone is a worker doing nothing." },
    ],
  },
  predictions: [
    {
      id: "slow-clients",
      kind: "choice",
      prompt: "A gunicorn worker finishes a request in 50 ms but then has to push the response to a slow mobile client that takes 2 seconds to receive it. If 20% of clients are that slow, what happens to the box's capacity?",
      options: [
        { id: "same", label: "It stays about the same" },
        { id: "ten", label: "It drops by about 10%" },
        { id: "third", label: "It drops by about a third" },
        { id: "collapse", label: "It drops to roughly a ninth" },
      ],
      answer: "collapse",
      observe: "slow-clients",
      reveal: {
        text: "The average time a worker is held becomes 50 ms plus 20% of 2 seconds, 0.45 seconds instead of 0.05. Capacity is workers divided by hold time, so it falls to one ninth. The CPU is idle because the workers are waiting on the clients.",
        derived: true,
        line: { speaker: "rao", line: "Sixteen workers, and fifteen of them are waiting for somebody's train to leave the tunnel." },
      },
    },
  ],
  widget: { id: "proxy-lab", config: PROXY },
  mechanism: [
    {
      id: "hold",
      scene: "direct",
      text: "A sync worker is tied up until the last byte reaches the client. When clients are slow, workers are held for seconds each, and capacity is workers divided by hold time. CPU stays idle while every worker waits.",
      derived: true,
    },
    {
      id: "buffer",
      scene: "buffer",
      text: "A reverse proxy such as nginx sits in front. It receives the app's whole response quickly over the local connection, frees the worker, and then feeds the slow client from its own buffers. The worker is held only for the app's 50 ms.",
      sourceIds: ["nginx-proxy-module", "gunicorn-design"],
    },
    {
      id: "jobs",
      text: "The same position gives a proxy other jobs: terminating TLS, routing by host name and path, serving static files, compressing responses, reusing upstream connections, and rate limiting. It is the front door that keeps application servers doing only application work.",
      sourceIds: ["nginx-reverse-proxy"],
    },
    {
      id: "cost",
      text: "The proxy is one more hop and one more thing to configure, monitor, and keep available. Buffering also means big responses use proxy memory or disk, and streaming responses need buffering switched off for that route.",
    },
  ],
  challenges: [
    {
      id: "starved-workers",
      title: "Free the workers",
      brief: "150 requests a second reach 16 workers. 15% of clients are slow and take about 2 seconds to receive a response. The app takes 50 ms. Get errors under 1% and p99 under 500 ms.",
      line: { speaker: "kabir", line: "More workers or a proxy? I will do whichever the numbers pick." },
      widget: { id: "proxy-lab", config: PROXY_CHALLENGE },
      conditions: [
        { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
        { metric: "p99", op: "<", value: 0.5, label: "p99 under 500 ms" },
      ],
      stars: [{ metric: "workers", op: "<=", value: 12, label: "Twelve workers or fewer" }],
      hints: [
        "How long is a worker held per request, on average, with 15% slow clients?",
        "Capacity is workers divided by hold time. Would more workers be enough, and what would they cost in memory?",
        "What if the worker handed its response to something else and moved on?",
      ],
    },
  ],
  explainBack: {
    prompt: "Why put nginx in front of an application server, even if you have only one app server?",
    rubric: [
      { id: "slow", criterion: "Buffers responses so slow clients do not hold application workers", keyIdea: "buffering frees workers" },
      { id: "jobs", criterion: "Names other jobs: TLS termination, routing, static files, compression, rate limiting", keyIdea: "front-door jobs" },
      { id: "cost", criterion: "Acknowledges the cost: another hop and component, and unbuffered streaming needs care", keyIdea: "extra hop" },
    ],
    exemplar:
      "The proxy takes the whole response from the app quickly and serves the slow client from its own buffer, so the worker is freed in tens of milliseconds instead of seconds and capacity stops depending on client speed. It can also terminate TLS, route by path, serve static files and compress. The cost is an extra hop to run and monitor, and streaming responses need buffering turned off.",
  },
  reviews: [
    {
      id: "rp-est-hold",
      format: "estimate",
      scenario: "A worker's app time is 50 ms. 10% of clients take 2 seconds to receive the response, the rest are instant. What is the average time a worker is held per request?",
      unit: "ms",
      answer: 250,
      acceptFactor: 1.2,
      breakdown: ["50 ms + 10% × 2,000 ms", "= 50 + 200", "= 250 ms"],
      explain: "The slow tenth contributes four times as much hold time as the app does.",
    },
    {
      id: "rp-est-cap",
      format: "estimate",
      scenario: "16 workers, each held 250 ms per request on average. About how many requests per second can the box serve?",
      unit: "req/s",
      answer: 64,
      acceptFactor: 1.2,
      breakdown: ["Capacity = workers ÷ hold time", "16 ÷ 0.25 s", "= 64 req/s"],
      explain: "Little's Law, rearranged: with proxy buffering the hold time drops to 50 ms and the same 16 workers handle 320 requests a second.",
    },
    {
      id: "rp-pick",
      format: "pick-fix",
      scenario: "A route streams a large report as it is generated, and users see nothing until it finishes. The route sits behind nginx with default settings. What do you change?",
      options: [
        { id: "a", label: "Set proxy_buffering off for that location" },
        { id: "b", label: "Increase worker_processes" },
        { id: "c", label: "Move the report to a bigger instance" },
        { id: "d", label: "Add a second nginx" },
      ],
      answer: "a",
      explain: "With buffering on, nginx waits to collect the response before sending it. For streaming or server-sent events, turn buffering off on that route only.",
    },
    {
      id: "rp-order",
      format: "order",
      scenario: "Order these setups by how many requests per second 16 sync workers can serve when 20% of clients are slow, highest first.",
      items: [
        { id: "buf", label: "nginx buffering in front" },
        { id: "w32", label: "No proxy, 32 workers" },
        { id: "w16", label: "No proxy, 16 workers" },
        { id: "w8", label: "No proxy, 8 workers" },
      ],
      answer: ["buf", "w32", "w16", "w8"],
      explain: "Buffering removes the slow clients from the equation. Without it, capacity grows only as workers are added, which costs memory.",
    },
    {
      id: "rp-flaw",
      format: "spot-flaw",
      scenario: "Gunicorn sync workers face the internet directly, and a few slow clients keep making the whole API time out. Tap the part of the design that is missing.",
      diagram: {
        nodes: [
          { id: "internet", label: "internet clients", kind: "client", col: 0, row: 1 },
          { id: "gunicorn", label: "gunicorn · 16 sync workers, exposed directly", kind: "server", col: 1, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "internet", to: "gunicorn" },
          { from: "gunicorn", to: "db" },
        ],
      },
      answer: "internet->gunicorn",
      explain: "Nothing sits between slow clients and the workers. A buffering reverse proxy takes the clients' slowness instead of the application's workers.",
    },
    {
      id: "rp-explain",
      format: "explain",
      scenario: "In two sentences: why can 100% busy workers coexist with 12% CPU?",
      rubric: [
        { id: "wait", criterion: "Workers are held waiting on slow clients or I/O rather than computing" },
        { id: "capacity", criterion: "Capacity is limited by workers divided by hold time, not by CPU" },
      ],
      exemplar: "The workers are waiting, for slow clients or I/O, not computing, so they are all occupied while the CPU idles. Capacity is workers divided by how long each is held, which a slow client stretches.",
      explain: "A worker is a seat, and slow clients keep the seat warm without doing anything.",
    },
  ],
  codex: {
    oneLiner: "A reverse proxy fronts your app: it buffers responses so slow clients do not hold workers, and terminates TLS, routes, caches and rate limits.",
    keyNumbers: [
      { label: "Worker capacity", value: "workers ÷ seconds held per request", sourceId: "gunicorn-design" },
      { label: "nginx default", value: "proxy_buffering on", sourceId: "nginx-proxy-module" },
    ],
    tradeoffs: [
      { choice: "Buffering proxy in front", gain: "Workers freed fast; capacity independent of client speed", cost: "One more hop and component; streaming routes need buffering off" },
      { choice: "More workers instead", gain: "No new component", cost: "Memory per worker, and capacity still tied to the slowest clients" },
    ],
    seenIn: ["nginx in front of gunicorn or uWSGI in nearly every Python deployment.", "ALB or CloudFront doing the same job in managed form."],
    interviewAngle: "Say the front door's jobs in a list: TLS termination, routing, buffering, caching, rate limiting. Then explain buffering with workers divided by hold time.",
    aws: [{ concept: "Managed reverse proxy", service: "Application Load Balancer", note: "Terminates TLS, routes by host and path" }],
    replay: { id: "proxy-lab", config: { ...PROXY, start: { buffering: false, slowShare: 0.2, workers: 16 } }, scene: "direct" },
  },
  interview: [
    "Why do we put nginx in front of gunicorn?",
    "What does a worker's capacity depend on if clients are slow?",
    "When would you turn proxy buffering off?",
  ],
  deeper: [
    {
      title: "Slow clients as an attack",
      body: "A deliberately slow client, sending or receiving a few bytes at a time, holds a worker just as a slow phone does. This is the idea behind slowloris attacks. A buffering proxy with sensible client timeouts takes that load, which is why exposing a sync application server directly is risky.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Slow clients are a fixed share who take two seconds. Real client speeds range widely.",
    "The proxy is assumed never to be a bottleneck itself, and its buffers to hold whole responses.",
    "Queueing is approximated with an M/M/c formula and a 3x tail factor.",
  ],
  sources: [NGINX_PROXY, GUNICORN_DESIGN, NGINX_ADMIN],
  verify: [
    { id: "unbuffered", claim: "With 15% slow clients and no buffering, 16 workers cannot carry 150 req/s", run: "lab", params: { model: "proxy-lab", config: PROXY_CHALLENGE, values: { buffering: false }, metric: "errorRate" }, expect: { min: 0.3 } },
    { id: "more-workers", claim: "Doubling workers without buffering still fails the tail", run: "lab", params: { model: "proxy-lab", config: PROXY_CHALLENGE, values: { buffering: false, workers: 32 }, metric: "p99" }, expect: { min: 0.5 } },
    { id: "buffered", claim: "Buffering carries it with room to spare", run: "lab", params: { model: "proxy-lab", config: PROXY_CHALLENGE, values: { buffering: true }, metric: "p99" }, expect: { max: 0.5 } },
    { id: "lean", claim: "Buffering with 12 workers still passes", run: "lab", params: { model: "proxy-lab", config: PROXY_CHALLENGE, values: { buffering: true, workers: 12 }, metric: "p99" }, expect: { max: 0.5 } },
  ],
});
