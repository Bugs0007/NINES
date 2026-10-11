import { definePack } from "../define";

export const ANYCAST = { start: { method: "dns", sites: 2, ttl: 300, down: false } };
export const ANYCAST_CHALLENGE = { start: { method: "dns", sites: 2, ttl: 300, down: true }, readonly: ["down"] };

const RFC4786 = { id: "rfc4786", title: "RFC 4786: Operation of Anycast Services", url: "https://www.rfc-editor.org/rfc/rfc4786" };
const CF_ANYCAST = { id: "cf-anycast", title: "Cloudflare Learning Center: What is Anycast?", url: "https://www.cloudflare.com/learning/cdn/glossary/anycast-network/" };
const AWS_GA = { id: "aws-global-accelerator", title: "AWS Global Accelerator: static anycast IP addresses and health-based routing", url: "https://aws.amazon.com/global-accelerator/" };

export default definePack({
  id: "anycast",
  title: "Anycast",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "Frankfurt site down", detail: "DNS still sending Europe to it" },
    lines: [
      { speaker: "pager", line: "Frankfurt is down. We changed DNS to Singapore four minutes ago and European users are still getting errors." },
      { speaker: "meera", line: "Their resolvers kept the old answer for the TTL. One address that every site announces would have rerouted them in seconds." },
    ],
  },
  predictions: [
    {
      id: "failover",
      kind: "choice",
      prompt: "Your nearest site fails. Which routes users away from it faster: DNS geo-routing with a 5-minute TTL, or anycast, where every site announces the same address?",
      options: [
        { id: "dns", label: "DNS, because you can edit the record at once" },
        { id: "anycast", label: "Anycast, because withdrawing the route moves traffic without waiting for caches" },
        { id: "same", label: "They take about the same" },
        { id: "neither", label: "Neither; users must retry manually" },
      ],
      answer: "anycast",
      observe: "site-down",
      reveal: {
        text: "DNS answers are cached for up to the TTL, so some users keep the dead address for minutes. With anycast, the failed site's route is withdrawn and the network sends the next packets to the next closest site, in seconds rather than minutes.",
        sourceIds: ["rfc4786"],
        line: { speaker: "meera", line: "DNS asks the user to move. Anycast moves the road." },
      },
    },
  ],
  widget: { id: "anycast-lab", config: ANYCAST },
  mechanism: [
    {
      id: "nearest",
      scene: "nearest",
      text: "With anycast, many sites announce the same IP address into the internet's routing system. Routers forward each packet toward the closest announcement by network path, so users reach a nearby site with no per-user logic in DNS.",
      sourceIds: ["cf-anycast", "rfc4786"],
    },
    {
      id: "failover",
      scene: "failover",
      text: "If a site stops announcing the address, because it failed or was drained, routing converges and traffic flows to the next closest site. Convergence takes seconds to tens of seconds, not the DNS TTL, and no client has to learn anything.",
      sourceIds: ["rfc4786"],
    },
    {
      id: "dns",
      text: "DNS geo-routing guesses the user's location from their resolver, which may be far away, then hands out a site's address that clients cache. It is flexible, since you can steer by load or cost, but it is slower to correct and less precise about location.",
    },
    {
      id: "limits",
      text: "Anycast routes by network path, not by distance or load, and a routing change can shift users between sites in the middle of a connection. It suits short, stateless exchanges, DNS, CDN edges, and DDoS absorption; services that hold long connections need care, or a provider that handles it.",
      sourceIds: ["aws-global-accelerator"],
    },
  ],
  challenges: [
    {
      id: "fast-failover",
      title: "Fail over in seconds",
      brief: "Pigeon runs sites in ap-south-2 and a few other regions. When the nearest site dies, users must leave it within 25 seconds, and the average user's distance cost must stay under 90 ms. The nearest site fails in this run. Choose how users find a site, and how many sites to run.",
      line: { speaker: "kabir", line: "I can turn the TTL down as far as I like. I am told that has a cost." },
      widget: { id: "anycast-lab", config: ANYCAST_CHALLENGE },
      conditions: [
        { metric: "failoverS", op: "<=", value: 25, label: "Users leave a dead site within 25 s" },
        { metric: "avgMs", op: "<", value: 90, label: "Average distance cost under 90 ms" },
      ],
      stars: [{ metric: "sites", op: "<=", value: 3, label: "Three sites or fewer" }],
      hints: [
        "Even with the shortest TTL, how long does a cached DNS answer outlive the failure?",
        "Which routing method does not depend on caches at all?",
        "How many sites does the average distance need? Add sites until it drops under 90 ms.",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare anycast with DNS-based routing for sending users to a nearby site, including what happens when a site fails.",
    rubric: [
      { id: "anycast", criterion: "Anycast announces one address from many sites and the network routes to the closest", keyIdea: "same address, many sites" },
      { id: "failover", criterion: "On failure the route is withdrawn and traffic shifts in seconds, with no client cache to wait out", keyIdea: "failover without caches" },
      { id: "dns", criterion: "DNS routing is flexible but limited by resolver location and TTL caching", keyIdea: "DNS TTL delay" },
    ],
    exemplar:
      "Anycast announces the same IP address from every site, and routing sends each user's packets to the closest announcement. When a site fails its route is withdrawn and traffic moves to the next closest in seconds, with no cached answer to wait for. DNS geo-routing can steer more flexibly but depends on the resolver's location and on caches honouring the TTL, so failover is slower.",
  },
  reviews: [
    {
      id: "ac-pick",
      format: "pick-fix",
      scenario: "A global service needs users to hit a nearby site and to survive losing a site within seconds. Which design fits best?",
      options: [
        { id: "a", label: "One origin plus a long-TTL DNS record" },
        { id: "b", label: "Anycast IPs announced from several sites, with health-based withdrawal" },
        { id: "c", label: "A client-side list of site addresses that users edit" },
        { id: "d", label: "A single big site with more servers" },
      ],
      answer: "b",
      explain: "Anycast gives nearby routing and fast failover without waiting for caches. A single site cannot be near everyone or survive its own failure.",
    },
    {
      id: "ac-est-ttl",
      format: "estimate",
      scenario: "A site fails and DNS routing has a 300-second TTL. What is the worst-case time, in seconds, before every resolver that cached the dead address has expired it?",
      unit: "s",
      answer: 300,
      acceptFactor: 1.1,
      breakdown: ["A resolver that cached the answer a moment before the failure keeps it for the whole TTL", "= 300 s"],
      explain: "On average users wait half the TTL, but the worst case is the whole thing, and that is who files the tickets.",
    },
    {
      id: "ac-order",
      format: "order",
      scenario: "Order these by how quickly users leave a failed site, fastest first.",
      items: [
        { id: "any", label: "Anycast route withdrawn" },
        { id: "ttl30", label: "DNS record with a 30-second TTL" },
        { id: "ttl300", label: "DNS record with a 5-minute TTL" },
        { id: "ttl86400", label: "DNS record with a 24-hour TTL" },
      ],
      answer: ["any", "ttl30", "ttl300", "ttl86400"],
      explain: "Route withdrawal is the fastest, and DNS follows its TTL, with real-world caches often adding to it.",
    },
    {
      id: "ac-flaw",
      format: "spot-flaw",
      scenario: "A team puts a long-lived WebSocket service behind anycast with sites in three regions. During a routing change users' connections reset and clients reconnect to a different site that has none of their session. Tap the part that was not designed for this.",
      diagram: {
        nodes: [
          { id: "client", label: "client", kind: "client", col: 0, row: 1 },
          { id: "anycast", label: "anycast address, 3 sites", kind: "external", col: 1, row: 1 },
          { id: "site", label: "site-local session state", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "anycast" },
          { from: "anycast", to: "site" },
        ],
      },
      answer: "site",
      explain: "Routing can move a user to a different site mid-session. Session state kept only in one site is lost, so state must be shareable across sites or easy to rebuild.",
    },
    {
      id: "ac-graph",
      format: "predict-graph",
      scenario: "Add anycast sites one at a time across the world. How does the average user's distance cost change as sites go from 1 to 5?",
      xLabel: "sites →",
      yLabel: "average distance cost",
      options: [
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "diminish", label: "Falls steeply at first, then flattens", points: [8, 4.5, 2.5, 1.6, 1.2, 1.1, 1.05, 1] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "diminish",
      explain: "The first sites cut the longest distances. Once every region has one nearby, further sites only trim the last bit.",
    },
    {
      id: "ac-explain",
      format: "explain",
      scenario: "In two sentences: why does anycast fail over faster than DNS?",
      rubric: [
        { id: "route", criterion: "Anycast failover is a routing change, so traffic shifts to the next closest site" },
        { id: "cache", criterion: "DNS failover waits for cached answers to expire, which can take up to the TTL or longer" },
      ],
      exemplar: "With anycast the failed site withdraws its route and the network moves traffic to the next closest site. DNS has to wait for every cache to expire the old answer, which takes up to the TTL.",
      explain: "Anycast changes the path under the address; DNS changes the address under the user.",
    },
  ],
  codex: {
    oneLiner: "Anycast announces one address from many sites, so routing finds the nearest and failover withdraws a route instead of waiting for DNS caches.",
    keyNumbers: [
      { label: "DNS failover", value: "up to the record's TTL", sourceId: "rfc4786" },
      { label: "Anycast failover", value: "route convergence, seconds to tens of seconds", sourceId: "rfc4786" },
    ],
    tradeoffs: [
      { choice: "Anycast", gain: "Nearest-site routing and fast failover with one address", cost: "Routes by network path not load; mid-connection shifts need design" },
      { choice: "DNS geo / latency routing", gain: "Fine-grained steering by load, cost, or health", cost: "Resolver location and TTL caching limit precision and speed" },
    ],
    seenIn: ["Root and public DNS resolvers, CDN edges, DDoS protection.", "AWS Global Accelerator and Cloudflare."],
    interviewAngle: "For multi-region failover say 'anycast or a managed accelerator for fast routing, DNS for coarse steering', and note that session state must survive a site change.",
    aws: [{ concept: "Static anycast IPs", service: "AWS Global Accelerator", note: "Two anycast addresses fronting endpoints in several regions" }],
    otherClouds: "Cloudflare and Google Cloud global load balancing offer anycast fronts",
    replay: { id: "anycast-lab", config: ANYCAST, scene: "nearest" },
  },
  interview: [
    "How would you route users to the nearest region and survive a region failure?",
    "What are the problems of using DNS for failover?",
    "What kinds of services are a poor fit for anycast?",
  ],
  deeper: [
    {
      title: "Why anycast fits DNS and CDNs",
      body: "Short, stateless exchanges tolerate a route change: the next packet simply goes elsewhere. DNS queries and CDN fetches are exactly that, which is why both run on anycast. Long-lived stateful connections are harder, because a route change can strand the connection, so providers pair anycast with connection-aware proxies at the edge.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Anycast routing sends users to the closest announcement by path, not distance. The lab adds a 20% penalty on distance to reflect that.",
    "DNS geo-routing uses the resolver's location, so the lab adds a 1,500 km error to each user's apparent distance.",
    "Anycast failover is shown as 20 seconds. Real BGP convergence varies with the network and the provider.",
  ],
  sources: [RFC4786, CF_ANYCAST, AWS_GA],
  verify: [
    { id: "dns-slow", claim: "Even a 30 s DNS TTL cannot meet a 25 s failover", run: "lab", params: { model: "anycast-lab", config: ANYCAST_CHALLENGE, values: { method: "dns", ttl: 30, sites: 4 }, metric: "failoverS" }, expect: { min: 26 } },
    { id: "any-fast", claim: "Anycast fails over inside 25 seconds", run: "lab", params: { model: "anycast-lab", config: ANYCAST_CHALLENGE, values: { method: "anycast", sites: 3 }, metric: "failoverS" }, expect: { max: 25 } },
    { id: "any-3", claim: "Three anycast sites average under 90 ms", run: "lab", params: { model: "anycast-lab", config: ANYCAST_CHALLENGE, values: { method: "anycast", sites: 3 }, metric: "avgMs" }, expect: { max: 90 } },
    { id: "any-2", claim: "Two sites are not enough", run: "lab", params: { model: "anycast-lab", config: ANYCAST_CHALLENGE, values: { method: "anycast", sites: 2 }, metric: "avgMs" }, expect: { min: 90 } },
  ],
});
