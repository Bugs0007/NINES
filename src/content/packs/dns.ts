import { definePack } from "../define";

export const DNS = { start: { view: "chain", cache: "cold" } };
export const DNS_TTL = { lockView: "ttl", start: { view: "ttl", ttl: 60, rate: 0.02, cache: "tld" }, hide: ["cache", "view", "rate"] };

const RFC1035 = { id: "rfc1035", title: "RFC 1035: Domain Names, Implementation and Specification (resource records and TTL)", url: "https://www.rfc-editor.org/rfc/rfc1035" };
const R53_TTL = { id: "route53-ttl", title: "AWS docs: Amazon Route 53 record TTL (the time resolvers cache a record)", url: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-basic.html#rrsets-values-basic-ttl" };
const CF_DNS = { id: "cf-dns", title: "Cloudflare Learning Center: What is DNS? (recursive resolver, root, TLD, authoritative)", url: "https://www.cloudflare.com/learning/dns/what-is-dns/" };

export default definePack({
  id: "dns",
  title: "DNS",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Support · 'new server' sightings", detail: "half the office sees the new API, half sees the old one" },
    lines: [
      { speaker: "kabir", line: "I moved the API to a new address an hour ago. Half the office reaches it and half is still on the old box." },
      { speaker: "meera", line: "Every resolver between you and them kept the old answer, for exactly as long as you told it to." },
    ],
  },
  predictions: [
    {
      id: "ttl-wait",
      kind: "choice",
      prompt: "A DNS record has a TTL of one hour. You change its address. When do all users see the new address?",
      options: [
        { id: "now", label: "Immediately, DNS updates are instant" },
        { id: "minute", label: "Within a minute" },
        { id: "hour", label: "Up to an hour later, depending on when each resolver last asked" },
        { id: "day", label: "Not until the next day" },
      ],
      answer: "hour",
      observe: "ttl-moved",
      reveal: {
        text: "Each resolver keeps an answer until its TTL runs out, and nobody can recall a cached copy. A resolver that asked a minute before your change keeps the old address for almost the full hour.",
        sourceIds: ["rfc1035"],
        line: { speaker: "meera", line: "The TTL is a promise you made to every cache on earth." },
      },
    },
  ],
  widget: { id: "dns-lab", config: DNS },
  mechanism: [
    {
      id: "relay",
      scene: "relay",
      text: "A cold lookup walks a chain. Your device asks a recursive resolver. The resolver asks a root server which servers handle .com, asks those which name servers handle your domain, and finally asks your name servers for the address.",
      sourceIds: ["cf-dns"],
    },
    {
      id: "cache",
      scene: "cache",
      text: "Almost every step is cached. Resolvers remember the root and .com answers for a long time, so a typical lookup is one hop to the resolver plus at most one to your name servers. A popular name is answered straight from the resolver's cache.",
      sourceIds: ["cf-dns"],
    },
    {
      id: "ttl",
      scene: "ttl",
      text: "The TTL is how long an answer may be reused. Longer means more cache hits and faster lookups; shorter means changes spread sooner. If a resolver sees one lookup every 50 seconds, a 5-minute TTL gives about 86% hits and a 1-minute TTL about 55%.",
      sourceIds: ["route53-ttl"],
      derived: true,
    },
    {
      id: "failover",
      text: "DNS is a poor failover tool: resolvers and clients cache answers, and some stretch short TTLs. Where you can, point the name at an address that never changes, such as a load balancer or an anycast IP, and handle failure behind it.",
    },
  ],
  challenges: [
    {
      id: "ttl-choice",
      title: "Pick the TTL",
      brief: "api.pigeon.chat is looked up about once every 50 seconds at each resolver. You want lookups to average under 20 ms, and a change to reach users within 5 minutes. Choose a TTL, and decide whether the address is a fixed load balancer address.",
      line: { speaker: "rao", line: "Short TTLs are expensive, long TTLs are risky, and nobody wants to be on the phone about either." },
      widget: { id: "dns-lab", config: DNS_TTL },
      conditions: [
        { metric: "avgMs", op: "<", value: 20, label: "Average lookup under 20 ms" },
        { metric: "staleSec", op: "<=", value: 300, label: "Changes reach users within 5 minutes" },
      ],
      stars: [{ metric: "avgMs", op: "<", value: 16, label: "Average lookup under 16 ms" }],
      hints: [
        "Try the shortest TTL that gives a hit ratio high enough for 20 ms. What does it do to how long a change takes to reach users?",
        "With a plain address the two goals pull against each other. Is there a way to stop depending on DNS for change?",
        "If the address behind the name never changes, how long can the TTL be?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain what happens when a user's device looks up a name, and what the TTL controls.",
    rubric: [
      { id: "chain", criterion: "Describes the chain: resolver, then root, TLD, and authoritative servers, with most steps cached", keyIdea: "recursive resolution with caching" },
      { id: "ttl", criterion: "Says the TTL is how long an answer may be cached, trading faster change for more cache hits", keyIdea: "TTL tradeoff" },
      { id: "change", criterion: "Notes that changes cannot be recalled from caches, so plan migrations by lowering TTL in advance or using a stable address", keyIdea: "plan for caches" },
    ],
    exemplar:
      "The device asks a recursive resolver, which, if it has nothing cached, asks a root server, then the .com servers, then the domain's own name servers, and caches each answer. The TTL says how long the final answer may be reused, so a short TTL spreads changes fast but costs more lookups and a long one is fast but slow to change. Because nothing can recall a cached answer, I lower the TTL ahead of a migration or put a stable address in front.",
  },
  reviews: [
    {
      id: "dns-est-hit",
      format: "estimate",
      scenario: "A resolver sees one lookup every 20 seconds for your name. The TTL is 60 seconds. Roughly what percentage of lookups are answered from its cache?",
      unit: "%",
      answer: 75,
      acceptFactor: 1.2,
      breakdown: ["Lookups per TTL window = 60 ÷ 20 = 3", "One miss per window, then hits: 3 ÷ (1 + 3)", "= 75%"],
      explain: "Each window starts with one miss, then every lookup inside it hits. Hit ratio is rT ÷ (1 + rT) for r lookups a second and TTL T.",
    },
    {
      id: "dns-pick",
      format: "pick-fix",
      scenario: "You will move the API to a new IP address on Saturday morning. The record's TTL is 24 hours. What do you do on Thursday?",
      options: [
        { id: "a", label: "Nothing; change the record on Saturday and wait" },
        { id: "b", label: "Lower the TTL to a few minutes, wait out the old TTL, move on Saturday, then raise it again" },
        { id: "c", label: "Delete the record and re-create it on Saturday" },
        { id: "d", label: "Ask users to flush their DNS cache" },
      ],
      answer: "b",
      explain: "Caches hold the old answer for the old TTL, so the short TTL has to be in place for one full old TTL before the move. After the move you can raise it again.",
      why: {
        prompt: "Why wait a full day after lowering the TTL?",
        options: [
          { id: "a", label: "Resolvers that cached the long-TTL answer keep it until that TTL expires" },
          { id: "b", label: "The registry needs a day to publish" },
          { id: "c", label: "Browsers ignore short TTLs" },
        ],
        answer: "a",
      },
    },
    {
      id: "dns-order",
      format: "order",
      scenario: "Order these DNS lookups by time taken, fastest first.",
      items: [
        { id: "device", label: "Answer already cached on the device" },
        { id: "resolver", label: "Answer cached at the resolver" },
        { id: "auth", label: "Resolver cached the .com servers but must ask your name servers" },
        { id: "cold", label: "Resolver knows nothing and walks the whole chain" },
      ],
      answer: ["device", "resolver", "auth", "cold"],
      explain: "No network, one short hop, one extra round trip to your name servers, then the full chain. Each cache level skips more of the walk.",
    },
    {
      id: "dns-graph",
      format: "predict-graph",
      scenario: "A resolver sees steady lookups for your name. As the TTL grows from 1 second to 1 day, what happens to the average lookup time?",
      xLabel: "TTL →",
      yLabel: "average lookup",
      options: [
        { id: "linear", label: "Falls in a straight line", points: [8, 7, 6, 5, 4, 3, 2, 1] },
        { id: "decay", label: "Falls quickly, then flattens", points: [8, 5, 3.2, 2.2, 1.7, 1.4, 1.2, 1.1] },
        { id: "flat", label: "Stays flat", points: [4, 4, 4, 4, 4, 4, 4, 4] },
        { id: "up", label: "Rises", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "decay",
      explain: "The first few extra seconds of TTL add a lot of hits; once nearly every lookup hits, more TTL buys almost nothing.",
    },
    {
      id: "dns-flaw",
      format: "spot-flaw",
      scenario: "The runbook says: 'If the Mumbai region fails, change the DNS record to Singapore.' Tap the part of the design that makes this plan slow.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "dns", label: "DNS record · TTL 24 hours · points at Mumbai", kind: "external", col: 1, row: 1 },
          { id: "mumbai", label: "Mumbai region", kind: "server", col: 2, row: 0 },
          { id: "sg", label: "Singapore region (standby)", kind: "server", col: 2, row: 2 },
        ],
        edges: [
          { from: "users", to: "dns" },
          { from: "dns", to: "mumbai" },
          { from: "dns", to: "sg" },
        ],
      },
      answer: "dns",
      explain: "A 24-hour TTL means the change reaches users over the next day. Failover through DNS needs a short TTL, or better, a stable address with the switching done behind it.",
    },
    {
      id: "dns-explain",
      format: "explain",
      scenario: "In two sentences: why does a DNS change not take effect everywhere at once?",
      rubric: [
        { id: "cache", criterion: "Resolvers and devices cache answers" },
        { id: "ttl", criterion: "A cached answer is kept until its TTL expires, and there is no way to recall it" },
      ],
      exemplar: "Resolvers and devices cache each answer and keep it until its TTL runs out. Nothing can recall a cached copy, so a change spreads as each cache expires.",
      explain: "DNS is a cache hierarchy, and the TTL is its only invalidation.",
    },
  ],
  codex: {
    oneLiner: "DNS turns names into addresses through a cache hierarchy. The TTL trades lookup speed against how fast a change spreads.",
    keyNumbers: [
      { label: "Cache hit ratio at one resolver", value: "rT ÷ (1 + rT) for r lookups/s and TTL T", sourceId: "route53-ttl" },
      { label: "Record fields", value: "name, type, class, TTL, data", sourceId: "rfc1035" },
    ],
    tradeoffs: [
      { choice: "Short TTL", gain: "Changes and failover spread quickly", cost: "More lookups, more load on name servers, slower average lookup" },
      { choice: "Long TTL", gain: "Fast lookups and low name-server load", cost: "Changes take as long as the TTL to land" },
      { choice: "Stable address plus a load balancer", gain: "Failover without DNS changes", cost: "The balancer or anycast layer becomes critical infrastructure" },
    ],
    seenIn: ["A migration that 'worked' for some users and not others.", "Route 53 health-check failover and weighted records."],
    interviewAngle: "When asked about failover or migration, mention TTLs and caching in one sentence: 'I'd lower the TTL ahead of time, or front it with a stable address so DNS doesn't have to change.'",
    aws: [{ concept: "Authoritative DNS", service: "Amazon Route 53", note: "Alias records to load balancers and CloudFront" }],
    otherClouds: "GCP: Cloud DNS · Azure: Azure DNS",
    replay: { id: "dns-lab", config: DNS, scene: "relay" },
  },
  interview: [
    "You are migrating a service to a new IP. How do you do it without downtime?",
    "Why do some users still hit the old server after a DNS change?",
    "What is the difference between a recursive resolver and an authoritative server?",
  ],
  deeper: [
    {
      title: "Negative answers and stretched TTLs",
      body: "Resolvers also cache 'this name does not exist' answers, with their own TTL, which is why a record you create right after a mistaken lookup can seem to not exist for a while. And some resolvers and clients raise very short TTLs to a floor or keep expired answers while they refresh, so a TTL of a few seconds is a hope, not a guarantee.",
      sourceIds: ["rfc1035"],
    },
  ],
  honestPhysics: [
    "Hop times are round numbers for resolvers a few tens of milliseconds from the root, TLD, and authoritative servers.",
    "Hit ratio assumes a fixed TTL and Poisson lookups at one resolver. Real resolvers prefetch popular names and may cap TTLs.",
  ],
  sources: [RFC1035, R53_TTL, CF_DNS],
  verify: [
    { id: "hit-60", claim: "At one lookup per 50 s a 60 s TTL gives about 55% hits", run: "lab", params: { model: "dns-lab", config: DNS_TTL, values: { ttl: 60 }, metric: "hitRatio" }, expect: { min: 0.53, max: 0.57 } },
    { id: "hit-300", claim: "…and a 300 s TTL about 86%", run: "lab", params: { model: "dns-lab", config: DNS_TTL, values: { ttl: 300 }, metric: "hitRatio" }, expect: { min: 0.84, max: 0.88 } },
    { id: "plain-fails", claim: "Without a stable address no TTL meets both goals", run: "lab", params: { model: "dns-lab", config: DNS_TTL, values: { ttl: 300, lb: false }, metric: "avgMs" }, expect: { min: 20 } },
    { id: "lb-wins", claim: "A stable address with a one-hour TTL averages under 16 ms", run: "lab", params: { model: "dns-lab", config: DNS_TTL, values: { ttl: 3600, lb: true }, metric: "avgMs" }, expect: { max: 16 } },
  ],
});
