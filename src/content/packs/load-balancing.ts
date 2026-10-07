import { definePack, SRC } from "../define";

const CPU = { kind: "lognormal", median: 0.016, p99: 0.06 };
const LAB = { variant: "lab", cpu: CPU, instance: "m7i.large", count: 4, rps: 200, seed: "lb-lab" };
export const NOISY = { variant: "noisy", cpu: CPU, instance: "m7i.large", count: 4, rps: 200, slowFactor: 6, slowAt: 30, crashAt: 70, durationS: 130, fromS: 10, sloP99: 0.4, seed: "lb" };

const NGINX_UPSTREAM = { id: "nginx-upstream", title: "nginx docs: upstream module (max_fails, fail_timeout, least_conn, hash)", url: "https://nginx.org/en/docs/http/ngx_http_upstream_module.html" };
const ENVOY_OUTLIER = { id: "envoy-outlier", title: "Envoy docs: Outlier detection (passive health checking)", url: "https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/outlier" };
const ENVOY_LB = { id: "envoy-lb", title: "Envoy docs: Supported load balancers (least request picks the best of 2 random hosts by default)", url: "https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/load_balancing/load_balancers" };
const AWS_ELB_TYPES = { id: "aws-elb-types", title: "AWS docs: Elastic Load Balancing product comparison (ALB at layer 7, NLB at layer 4)", url: "https://aws.amazon.com/elasticloadbalancing/features/" };

export default definePack({
  id: "load-balancing",
  title: "Load Balancers",
  kind: "concept",
  estimatedMinutes: 16,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "checkout · p99 4.1s (SLO 400ms)", detail: "p50 is fine. Three of four app servers look bored. The ALB says every target is healthy." },
    lines: [
      { speaker: "meera", line: "Everything is healthy and a quarter of our requests are waiting four seconds. Both can't be true for long." },
    ],
  },
  predictions: [
    {
      id: "rr-share",
      kind: "choice",
      prompt: "Four servers behind round-robin. One of them becomes 5× slower (a noisy neighbour on the same host). What share of requests feel it?",
      options: [
        { id: "none", label: "Almost none: the load balancer routes around it" },
        { id: "quarter", label: "About a quarter" },
        { id: "half", label: "About half" },
        { id: "all", label: "All of them" },
      ],
      answer: "quarter",
      observe: "slow-rr",
      reveal: {
        text: "Round-robin gives the sick box its full quarter of requests regardless of how it's doing. Those requests queue on a box running at a fifth of its speed. A quarter of requests is 25 times the 1% your p99 is allowed to hide, and a user who makes ten requests hits the slow box 94% of the time.",
        derived: true,
        line: { speaker: "meera", line: "Fair isn't the same as smart." },
      },
    },
    {
      id: "lor",
      kind: "choice",
      prompt: "Keep the slow box, but switch the balancer to least outstanding requests. What happens to p99?",
      options: [
        { id: "worse", label: "Gets worse: the slow box gets overloaded" },
        { id: "same", label: "Barely moves" },
        { id: "better", label: "Drops back near normal" },
      ],
      answer: "better",
      observe: "lor-recovers",
      reveal: {
        text: "A slow box holds its requests longer, so it always has more in flight, so it gets picked less. The balancer never measures latency; it just counts, and the counting routes around the problem on its own.",
        sourceIds: ["alb-routing"],
      },
    },
  ],
  widget: { id: "lb-lab", config: LAB },
  mechanism: [
    {
      id: "rr",
      scene: "rr",
      text: "Round-robin and random spread requests evenly by count. That's perfect when every box is identical and fails badly when one isn't: the slow box keeps getting its share and quietly ruins your tail.",
    },
    {
      id: "lor",
      scene: "lor",
      text: "Least outstanding requests sends each request to the target with the fewest in flight. Power of two choices gets most of that benefit cheaply: pick two at random and use the less busy one. Both adapt to slow boxes without measuring latency.",
      sourceIds: ["alb-routing", "mitzenmacher-2001"],
    },
    {
      id: "blackhole",
      scene: "blackhole",
      text: "The trap: a dead box that refuses connections instantly always has zero in flight. Least-outstanding then pours traffic into it. Active health checks take tens of seconds to notice (ALB's default is two failures 30 s apart); passive checks, which eject a target after a few straight errors, catch it in milliseconds.",
      sourceIds: ["nginx-upstream", "envoy-outlier", "alb-health"],
    },
    {
      id: "layers",
      text: "Layer 4 balancers (AWS NLB) forward TCP or UDP connections without reading the HTTP inside; they can terminate TLS but can't route by path. Layer 7 balancers (AWS ALB) read HTTP, so they can route by path or header and balance per request instead of per connection.",
      sourceIds: ["aws-elb-types"],
    },
  ],
  challenges: [
    {
      id: "noisy-night",
      title: "The noisy night",
      brief: "Four boxes, 200 req/s. At t+30s one gets a noisy neighbour and runs 6× slower. At t+70s another one's gunicorn crashes, and nginx answers every request with an instant 502. Configure the balancer so p99 stays under 400ms and errors under 0.5%.",
      line: { speaker: "meera", line: "I'm going to sleep. The load balancer is on call tonight." },
      widget: { id: "lb-lab", config: NOISY },
      conditions: [
        { metric: "p99", op: "<", value: 0.4, label: "p99 under 400 ms" },
        { metric: "errorRate", op: "<", value: 0.005, label: "Errors under 0.5%" },
      ],
      stars: [{ metric: "p99", op: "<", value: 0.35, label: "p99 under 350 ms" }],
      hints: [
        "Two different failures are coming. Which algorithm handles a box that is slow, and does that same algorithm like a box that is dead?",
        "Watch where traffic goes right after the crash. What does a dead box look like to a balancer that counts requests in flight?",
        "Active checks run on a timer: every 10 s here, every 30 s by default on ALB. What notices failures on the very next requests instead?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why round-robin struggles with a slow server, what least-outstanding does differently, and the one failure that least-outstanding makes worse.",
    rubric: [
      { id: "rr", criterion: "Round-robin sends a fixed share to every target regardless of its health or speed", keyIdea: "blind to load" },
      { id: "lor", criterion: "Least-outstanding routes to the target with the fewest in-flight requests, so slow targets naturally get less", keyIdea: "in-flight count adapts" },
      { id: "hole", criterion: "A dead target that fails fast has zero in flight and attracts traffic; health checks (ideally passive) must eject it", keyIdea: "black hole" },
    ],
    exemplar:
      "Round-robin gives every target the same share, so a slow box keeps getting a quarter of the traffic and a quarter of requests see its latency. Least-outstanding sends each request to the target with the fewest requests in flight, and a slow box holds requests longer, so it gets fewer. But a dead box that refuses connections instantly always looks idle and becomes a black hole, so you need health checks, ideally passive ones that eject after a few errors.",
  },
  reviews: [
    {
      id: "lb-pick-slow",
      format: "pick-fix",
      scenario: "One of six app servers sits on a degraded host and is 4× slower. p99 is terrible; p50 is fine. The ALB uses round-robin. Fastest mitigation?",
      options: [
        { id: "a", label: "Switch the target group to least outstanding requests" },
        { id: "b", label: "Add two more servers" },
        { id: "c", label: "Raise the ALB idle timeout" },
        { id: "d", label: "Turn off health checks" },
      ],
      answer: "a",
      explain: "Least outstanding requests routes away from the slow box immediately. Adding servers still sends the sick box one-sixth, now one-eighth, of traffic. Then replace the bad instance.",
      why: {
        prompt: "Why does least-outstanding help here?",
        options: [
          { id: "a", label: "The slow box holds requests longer, so it has more in flight and gets picked less" },
          { id: "b", label: "It measures each target's p99" },
          { id: "c", label: "It removes the slow box from the pool" },
        ],
        answer: "a",
      },
    },
    {
      id: "lb-flaw-shallow",
      format: "spot-flaw",
      scenario: "A new box came up with a broken config: it accepts connections but every request times out. Tap the piece that let it stay in rotation.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "ALB", kind: "lb", col: 1, row: 1 },
          { id: "hc", label: "health check: GET /ping → 200 from nginx", kind: "external", col: 1, row: 2 },
          { id: "app", label: "app-4 (broken)", kind: "server", col: 2, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 3, row: 1 },
        ],
        edges: [
          { from: "users", to: "lb" },
          { from: "lb", to: "app" },
          { from: "app", to: "db" },
          { from: "hc", to: "lb" },
        ],
      },
      answer: "hc",
      explain: "A health check answered by nginx proves nginx is up, not that the app works. Check something that exercises the app process (cheaply), or add passive checks on real traffic.",
    },
    {
      id: "lb-est-blackhole",
      format: "estimate",
      scenario: "Four targets, round-robin, 400 req/s. One target dies and refuses connections. Health checks run every 10s and eject after 2 failures. Roughly how many requests fail before it's ejected?",
      unit: "requests",
      answer: 2000,
      acceptFactor: 2,
      breakdown: ["Detection takes ~2 checks × 10s ≈ 20s", "Round-robin sends it 1/4 of 400 req/s = 100 req/s", "≈ 100 × 20 = 2,000 failed requests"],
      explain: "Active checks are slow by design. Least-outstanding would make it worse (the dead box attracts more). Passive checks or client retries shrink the damage.",
    },
    {
      id: "lb-order-algo",
      format: "order",
      scenario: "One of four boxes turns slow. Order these algorithms by how much traffic they send to it, most first.",
      items: [
        { id: "rr", label: "Round robin" },
        { id: "lor", label: "Least outstanding requests" },
        { id: "p2c", label: "Power of two choices" },
      ],
      answer: ["rr", "p2c", "lor"],
      explain: "Round-robin: a full quarter. P2C avoids the slow box whenever it's compared against a less busy one. Least-outstanding compares against everyone.",
    },
    {
      id: "lb-pick-l4l7",
      format: "pick-fix",
      scenario: "You need to route /api/* to the API fleet and /ws/* to a WebSocket fleet, with TLS terminated at the balancer. Which AWS load balancer?",
      options: [
        { id: "alb", label: "Application Load Balancer (layer 7)" },
        { id: "nlb", label: "Network Load Balancer (layer 4)" },
        { id: "dns", label: "Route 53 weighted DNS" },
      ],
      answer: "alb",
      explain: "Path-based routing needs a balancer that reads HTTP: that's layer 7. NLB can terminate TLS too, but it forwards TCP without reading the HTTP inside (great for raw throughput and static IPs).",
    },
    {
      id: "lb-explain-hc",
      format: "explain",
      scenario: "In two sentences: what's the difference between a shallow and a deep health check, and what's the risk of each?",
      rubric: [
        { id: "shallow", criterion: "Shallow checks only prove the process answers; they miss boxes that are up but broken" },
        { id: "deep", criterion: "Deep checks exercise dependencies; if a shared dependency blips, every target fails together. ALB then fails open, so the check stops protecting you, while an ASG using ELB health checks or Kubernetes readiness can pull or replace the whole fleet" },
      ],
      exemplar: "A shallow check only proves the process answers, so a box that's up but can't serve real requests stays in rotation. A deep check exercises dependencies like the database, which catches that, but if the shared database blips every target fails its check at once: ALB fails open, while an Auto Scaling group or Kubernetes acting on those checks can replace or pull the whole fleet.",
      explain: "Common middle ground: check the app process itself, keep dependencies out of the check, and add passive outlier detection on real traffic. (ALB fails open if every target is unhealthy.)",
    },
  ],
  codex: {
    oneLiner: "A load balancer spreads requests and decides who's healthy. The algorithm and the health checks decide how bad a bad box gets.",
    keyNumbers: [
      { label: "ALB routing algorithms", value: "round robin · least outstanding · weighted random", sourceId: "alb-routing" },
      { label: "ALB health check interval", value: "5–300 s (default 30 s)", sourceId: "alb-health" },
      { label: "ALB all-unhealthy behaviour", value: "fails open to all targets", sourceId: "alb-health" },
      { label: "nginx passive checks", value: "max_fails / fail_timeout", sourceId: "nginx-upstream" },
      { label: "Power of two choices", value: "near-best balance from 2 random probes", sourceId: "mitzenmacher-2001" },
    ],
    tradeoffs: [
      { choice: "Round robin", gain: "Simple, predictable, great for identical targets", cost: "Keeps feeding slow or sick boxes their full share" },
      { choice: "Least outstanding / P2C", gain: "Routes around slow targets automatically", cost: "Fast-failing dead targets attract traffic (black holes); on ALB it can't be combined with slow start, so a cold new target takes a burst" },
      { choice: "Deep health checks", gain: "Catch boxes that are up but broken", cost: "A shared dependency blip fails every target together; ALB fails open, other systems pull the fleet" },
    ],
    seenIn: [
      "A Django app behind nginx on one box: nginx is a layer 7 reverse proxy, the same idea as an ALB, one server block at a time.",
      "Most '502 Bad Gateway' pages from nginx mean the upstream refused the connection, died mid-request, or sent something nginx couldn't parse; a slow upstream gets you a 504 instead.",
    ],
    interviewAngle: "Name the algorithm and the health-check strategy when you draw a load balancer: 'ALB, least outstanding requests, health checks that go through the app process'. ALB has no passive ejection with that algorithm (its anomaly mitigation needs weighted random), so if you need outlier ejection, add Envoy or a service mesh behind it. Mention layer 4 vs 7 only when it changes the design.",
    aws: [
      { concept: "Layer 7 balancer", service: "Application Load Balancer" },
      { concept: "Layer 4 balancer", service: "Network Load Balancer" },
      { concept: "Health checks", service: "Target group health checks" },
    ],
    otherClouds: "GCP: Application Load Balancer / Network Load Balancer (proxy or passthrough) · Azure: Application Gateway / Load Balancer",
    replay: { id: "lb-lab", config: LAB },
  },
  interview: [
    "Walk me through what happens when one of your app servers dies behind an ALB.",
    "When would you choose an NLB over an ALB?",
    "Why is least-connections sometimes dangerous?",
  ],
  deeper: [
    {
      title: "Why counting in-flight requests works",
      body: "By Little's Law, a target's in-flight count is its arrival rate times its latency. If one target is slower, it accumulates more in flight at the same arrival rate, so a balancer that picks the fewest-in-flight target automatically sends it less until its in-flight count matches the others. No latency measurement needed.",
      sourceIds: ["little-1961"],
    },
    {
      title: "Power of two choices",
      body: "Checking every target's load on every request is expensive and, in distributed balancers, stale. Picking two targets at random and choosing the less loaded one reduces the maximum load exponentially compared to picking one at random (Mitzenmacher, 2001). Envoy's least-request balancer works this way (two random choices by default), and Linkerd applies it to latency estimates. Envoy's default policy is still round robin.",
      sourceIds: ["mitzenmacher-2001", "envoy-lb"],
    },
    {
      title: "Active vs passive health checks",
      body: "Active checks are synthetic probes on a timer: slow to notice, but independent of traffic. Passive checks (nginx max_fails, Envoy outlier detection) watch real responses and eject a target after consecutive errors: fast, but only when there's traffic to observe. Production setups use both.",
      sourceIds: ["nginx-upstream", "envoy-outlier"],
    },
  ],
  honestPhysics: [
    "The simulated ALB balances each request independently. A real ALB balances per request too, but NLB and connection-pooling clients balance per connection.",
    "A noisy neighbour is modelled as every request on that box taking 6× longer.",
    "The lab's balancer is labelled ALB but also offers power of two choices and passive ejection. A real ALB has round robin, least outstanding requests and weighted random; its only passive mechanism (Automatic Target Weights) needs weighted random and shifts weight instead of ejecting. Passive ejection here is Envoy- or nginx-style.",
    "A crashed box fails instantly here, like an app crash behind nginx. A kernel-panicked host sends nothing back, so requests hang until the connect timeout and least-outstanding steers away from it.",
    "Health checks run every 10 s here. ALB's default is 30 s with two failures, so real detection takes 30 to 60 seconds.",
    "A real ALB is many nodes, each counting only its own outstanding requests.",
  ],
  sources: [SRC.albRouting, SRC.albHealth, SRC.mitzenmacher, NGINX_UPSTREAM, ENVOY_OUTLIER, ENVOY_LB, AWS_ELB_TYPES, SRC.little1961],
  verify: [
    { id: "rr-fails", claim: "Round-robin with shallow checks fails the noisy night", run: "lb-noisy", params: { config: NOISY, choice: { algorithm: "round-robin", hc: "shallow", outlier: false }, metric: "errorRate" }, expect: { min: 0.05 } },
    { id: "lor-blackhole", claim: "Least-outstanding without passive ejection black-holes the crash", run: "lb-noisy", params: { config: NOISY, choice: { algorithm: "least-outstanding", hc: "shallow", outlier: false }, metric: "errorRate" }, expect: { min: 0.02 } },
    { id: "lor-outlier-err", claim: "Least-outstanding + passive ejection keeps errors under 0.5%", run: "lb-noisy", params: { config: NOISY, choice: { algorithm: "least-outstanding", hc: "shallow", outlier: true }, metric: "errorRate" }, expect: { max: 0.005 } },
    { id: "lor-outlier-p99", claim: "…and p99 under 400ms", run: "lb-noisy", params: { config: NOISY, choice: { algorithm: "least-outstanding", hc: "shallow", outlier: true }, metric: "p99" }, expect: { max: 0.4 } },
  ],
});
