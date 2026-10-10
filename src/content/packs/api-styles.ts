import { definePack } from "../define";

export const API = { lockClient: true, client: "mobile", start: { style: "graphql", loader: true } };
export const API_CHALLENGE = { lockClient: true, client: "mobile" };

const FIELDING = { id: "fielding-rest", title: "R. Fielding (2000), Architectural Styles and the Design of Network-based Software Architectures, ch. 5: REST", url: "https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm" };
const GRPC = { id: "grpc-intro", title: "gRPC docs: Introduction to gRPC (protocol buffers, HTTP/2)", url: "https://grpc.io/docs/what-is-grpc/introduction/" };
const GRAPHQL = { id: "graphql-learn", title: "GraphQL docs: Introduction to GraphQL and Queries", url: "https://graphql.org/learn/" };
const DATALOADER = { id: "dataloader", title: "GraphQL DataLoader: batching and caching to avoid the N+1 problem", url: "https://github.com/graphql/dataloader" };

export default definePack({
  id: "api-styles",
  title: "REST vs gRPC vs GraphQL",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Mobile app · home screen takes 3 seconds on 4G", detail: "two sequential requests, 120 KB downloaded, 15% of it shown" },
    lines: [
      { speaker: "kabir", line: "The home screen makes three requests in two steps and downloads whole objects to show a few fields. On a phone it feels slow, though no endpoint is at fault." },
      { speaker: "meera", line: "Each style moves the cost somewhere else. Pick by who is calling, over what network, and who pays when the shape changes." },
    ],
  },
  predictions: [
    {
      id: "chatty",
      kind: "choice",
      prompt: "A phone on 4G (100 ms round trip, 187 KB/s) loads a screen with REST: two sequential rounds, 120 KB of JSON, 30 ms of server work. How long does the screen take to load?",
      options: [
        { id: "fast", label: "About 200 ms" },
        { id: "mid", label: "About 450 ms" },
        { id: "slow", label: "About 870 ms" },
        { id: "very", label: "About 3 seconds" },
      ],
      answer: "slow",
      observe: "chatty",
      reveal: {
        text: "Two rounds are 200 ms of round trips, 120 KB at 187 KB a second is 640 ms of transfer, and the server adds 30: 870 ms. Most of it is carrying fields the screen never shows. The same data over a data centre link would take 30 ms.",
        derived: true,
        line: { speaker: "meera", line: "The server is quick. The phone's network is the slow part, so shape the response for the phone." },
      },
    },
    {
      id: "n1",
      kind: "choice",
      prompt: "With GraphQL the client asks for exactly the 18 KB it shows, in one round. But the resolver for each of 20 recommendations runs its own query, unbatched. How many database queries does one screen cause?",
      options: [
        { id: "few", label: "About 4" },
        { id: "ten", label: "About 10" },
        { id: "twenty-three", label: "About 23" },
        { id: "hundred", label: "About 100" },
      ],
      answer: "twenty-three",
      observe: "n-plus-one",
      reveal: {
        text: "The list query is 1 and the profile and orders add 2, and each of the 20 recommendations triggers its own lookup: 23 queries for one screen. That is the N+1 problem. A batching loader collects the 20 ids in a tick and fetches them with one query, back to 4.",
        derived: true,
        line: { speaker: "rao", line: "GraphQL moves the work to the server. Make sure the server can afford it." },
      },
    },
  ],
  widget: { id: "apistyle-lab", config: API },
  mechanism: [
    {
      id: "rest",
      scene: "rest",
      text: "REST models an API as resources with URLs and standard HTTP verbs. It is simple, cacheable by any proxy, and understood everywhere. Its weakness is the fixed shape: a screen needing several resources makes several requests and downloads whole objects, which hurts most on slow, high-latency networks.",
      sourceIds: ["fielding-rest"],
    },
    {
      id: "graphql",
      scene: "graphql",
      text: "GraphQL lets the client send a query naming exactly the fields it needs across related objects, in one request. It suits varied clients, like several apps on slow networks. Costs: caching is harder, query cost must be limited, and naive resolvers cause N+1 queries unless batched with a loader.",
      sourceIds: ["graphql-learn", "dataloader"],
    },
    {
      id: "grpc",
      scene: "grpc",
      text: "gRPC defines calls and messages in a typed contract and sends compact binary protocol buffers over HTTP/2, with multiplexing and streaming. It is quick and strict, so it suits service-to-service traffic. Browsers cannot use it directly and need a translating proxy, and the binary format is harder to inspect.",
      sourceIds: ["grpc-intro"],
    },
    {
      id: "pick",
      text: "Match the style to the caller. Public and third-party APIs usually want REST for its simplicity and tooling. Varied front ends over slow networks gain from GraphQL, or a backend for each front end. Internal services chatting at high volume gain from gRPC. Many systems use all three at different edges.",
      sourceIds: ["fielding-rest", "graphql-learn", "grpc-intro"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "home-screen",
      title: "Make the home screen fast",
      brief: "A mobile app on 4G (100 ms, 187 KB/s). Choose the API style and settings so the screen loads in at most 300 ms, causes at most 5 database queries, and needs no translating proxy.",
      line: { speaker: "kabir", line: "On a phone every extra round trip is felt, and so is every byte nobody shows." },
      widget: { id: "apistyle-lab", config: API_CHALLENGE },
      conditions: [
        { metric: "loadMs", op: "<=", value: 300, label: "Screen loads in 300 ms or less" },
        { metric: "dbQueries", op: "<=", value: 5, label: "At most 5 database queries" },
        { metric: "needsProxy", op: "<=", value: 0, label: "No translating proxy" },
      ],
      stars: [{ metric: "loadMs", op: "<=", value: 250, label: "Loads in 250 ms or less" }],
      hints: [
        "How much of the 870 ms is round trips, and how much is bytes?",
        "Which style asks for exactly the fields the screen shows, in one round?",
        "What does that style do to the database unless something batches the lookups?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare REST, GraphQL and gRPC and say where you would use each.",
    rubric: [
      { id: "rest", criterion: "REST uses resources and verbs: simple and cacheable, but fixed shapes cause round trips and over-fetching", keyIdea: "REST: simple, fixed shape" },
      { id: "graphql", criterion: "GraphQL lets clients ask for exact fields in one request, but needs care for caching, cost limits and N+1 queries", keyIdea: "GraphQL: client-shaped, N+1 risk" },
      { id: "grpc", criterion: "gRPC uses typed binary calls over HTTP/2, ideal between services, but browsers need a proxy", keyIdea: "gRPC: fast service-to-service" },
    ],
    exemplar:
      "REST is simple, cacheable and universally understood, but its fixed shapes make a screen needing several resources send several requests and download whole objects. GraphQL lets the client ask for exactly the fields it needs in one request, which suits mobile on slow networks, at the cost of harder caching, query cost limits and the risk of N+1 queries unless resolvers are batched. gRPC sends typed binary messages over HTTP/2 and is excellent between services, but browsers need a translating proxy.",
  },
  reviews: [
    {
      id: "as-est",
      format: "estimate",
      scenario: "A phone has a 100 ms round trip and 187 KB/s. A GraphQL query returns 18 KB in one round, with 40 ms of server work. About how long does the screen take to load?",
      unit: "ms",
      answer: 236,
      acceptFactor: 1.1,
      breakdown: ["1 round × 100 ms", "18 KB ÷ 187 KB/s ≈ 96 ms", "+ 40 ms server = 236 ms"],
      explain: "Round trips and bytes both count on a slow network, and GraphQL cuts both.",
    },
    {
      id: "as-pick",
      format: "pick-fix",
      scenario: "A GraphQL endpoint is fast for single objects but a list of 100 items with their authors causes 101 database queries and times out. What is the standard fix?",
      options: [
        { id: "a", label: "Batch the author lookups with a loader so the 100 ids are fetched in one query" },
        { id: "b", label: "Switch to REST" },
        { id: "c", label: "Add a cache in front of the database" },
        { id: "d", label: "Limit the list to 10 items for everyone" },
      ],
      answer: "a",
      explain: "The N+1 comes from resolvers that each query separately. Batching turns N queries into one without changing the API.",
    },
    {
      id: "as-order",
      format: "order",
      scenario: "Order these by bytes sent for a screen that needs 18 KB of fields from objects totalling 120 KB, largest first.",
      items: [
        { id: "rest", label: "REST, whole JSON objects" },
        { id: "grpc", label: "gRPC, whole binary messages" },
        { id: "gql", label: "GraphQL asking for only those fields" },
      ],
      answer: ["rest", "grpc", "gql"],
      explain: "REST returns 120 KB. Protocol buffers shrink the same objects to about 48 KB. GraphQL sends only the 18 KB requested.",
    },
    {
      id: "as-graph",
      format: "predict-graph",
      scenario: "A screen needs 18 KB of data. As the connection slows from 10 Mbps to 0.5 Mbps, how does the gap in load time between REST (120 KB, two rounds) and GraphQL (18 KB, one round) change?",
      xLabel: "connection speed gets slower →",
      yLabel: "extra time REST takes",
      options: [
        { id: "widen", label: "Widens as the network slows", points: [60, 90, 160, 280, 450, 700, 1000, 1700] },
        { id: "flat", label: "Stays the same", points: [400, 400, 400, 400, 400, 400, 400, 400] },
        { id: "narrow", label: "Narrows", points: [1700, 1000, 700, 450, 280, 160, 90, 60] },
      ],
      answer: "widen",
      explain: "REST's extra 100 KB costs more time the slower the link. The extra round trip stays constant, but the bytes dominate on slow networks.",
    },
    {
      id: "as-flaw",
      format: "spot-flaw",
      scenario: "A team exposes gRPC directly to its web app 'because it is faster'. Browsers cannot make the calls. Tap the part that fails.",
      diagram: {
        nodes: [
          { id: "browser", label: "browser", kind: "client", col: 0, row: 1 },
          { id: "grpc", label: "gRPC over HTTP/2 (trailers)", kind: "lb", col: 1, row: 1 },
          { id: "svc", label: "service", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "browser", to: "grpc" },
          { from: "grpc", to: "svc" },
        ],
      },
      answer: "browser->grpc",
      explain: "Browsers do not expose the HTTP/2 features gRPC needs. A gRPC-web proxy translates, or the edge uses REST or GraphQL.",
    },
    {
      id: "as-explain",
      format: "explain",
      scenario: "In two sentences: why can GraphQL put more load on the database than REST even though it returns less data?",
      rubric: [
        { id: "n1", criterion: "A nested query can trigger a separate database query per item (N+1) if resolvers run independently" },
        { id: "freedom", criterion: "Clients can ask for expensive shapes, so the server needs query cost limits and batching" },
      ],
      exemplar: "A nested query can make each item run its own database query, the N+1 problem, unless lookups are batched. Because clients choose the shape, the server also needs limits on query cost.",
      explain: "Less data on the wire can mean more work behind it.",
    },
  ],
  codex: {
    oneLiner: "REST: simple, cacheable, fixed shapes. GraphQL: client-chosen fields, N+1 risk. gRPC: compact, typed, for services. Match style to caller and network.",
    keyNumbers: [
      { label: "Phone load, REST 120 KB over two rounds", value: "870 ms in the lab", sourceId: "fielding-rest" },
      { label: "Protocol buffers versus JSON size", value: "roughly 0.4 in the lab", sourceId: "grpc-intro" },
    ],
    tradeoffs: [
      { choice: "REST", gain: "Simple, cacheable, universal", cost: "Round trips and over-fetching" },
      { choice: "GraphQL", gain: "Exact fields in one round", cost: "N+1, harder caching, cost limits" },
      { choice: "gRPC", gain: "Compact, fast, typed contract", cost: "Browsers need a proxy; harder to inspect" },
    ],
    seenIn: ["Public APIs from Stripe and GitHub (REST, with GitHub also offering GraphQL).", "Internal service meshes using gRPC."],
    interviewAngle: "Say: 'REST for public APIs, GraphQL where varied clients need different shapes, gRPC between services; batch resolvers to avoid N+1'.",
    aws: [{ concept: "Managed GraphQL and API gateways", service: "AWS AppSync, API Gateway" }],
    replay: { id: "apistyle-lab", config: API, scene: "graphql" },
  },
  interview: [
    "When would you choose GraphQL over REST?",
    "What is the N+1 problem?",
    "Why is gRPC popular between services but rare to browsers?",
  ],
  deeper: [
    {
      title: "Backends for frontends",
      body: "Many teams get GraphQL's benefit without GraphQL by adding a thin backend for each client type, which calls the services and returns exactly the shape that client needs. It keeps individual services simple and moves aggregation to a layer owned by the team that owns the screen.",
      sourceIds: ["graphql-learn"],
    },
  ],
  honestPhysics: [
    "A home screen needs a profile, recent orders and recommendations for those orders, where the recommendations depend on the order ids. Full objects total 120 KB of JSON, and the screen uses 18 KB.",
    "REST and gRPC take two sequential rounds. gRPC's binary encoding is 0.4 of JSON. GraphQL takes one round and 18 KB. Unbatched GraphQL runs 23 queries and adds 40 ms of resolver time; batched, 4 queries.",
    "Mobile: 100 ms round trip, 187 KB/s. Browser: 40 ms, 1,250 KB/s. Server time: 30 ms REST, 25 gRPC, 40 GraphQL.",
  ],
  sources: [FIELDING, GRPC, GRAPHQL, DATALOADER],
  verify: [
    { id: "rest", claim: "REST loads the screen in 870 ms on 4G", run: "lab", params: { model: "apistyle-lab", config: API_CHALLENGE, values: { style: "rest" }, metric: "loadMs" }, expect: { min: 860, max: 880 } },
    { id: "n1", claim: "Unbatched GraphQL runs 23 queries", run: "lab", params: { model: "apistyle-lab", config: API_CHALLENGE, values: { style: "graphql", loader: false }, metric: "dbQueries" }, expect: { min: 23, max: 23 } },
    { id: "loader", claim: "A loader brings it to 4", run: "lab", params: { model: "apistyle-lab", config: API_CHALLENGE, values: { style: "graphql", loader: true }, metric: "dbQueries" }, expect: { max: 5 } },
    { id: "gql-ms", claim: "…and the screen loads in 236 ms", run: "lab", params: { model: "apistyle-lab", config: API_CHALLENGE, values: { style: "graphql", loader: true }, metric: "loadMs" }, expect: { max: 250 } },
    { id: "grpc-ms", claim: "gRPC on a phone takes about 480 ms", run: "lab", params: { model: "apistyle-lab", config: API_CHALLENGE, values: { style: "grpc" }, metric: "loadMs" }, expect: { min: 400 } },
    { id: "proxy", claim: "A browser calling gRPC needs a proxy", run: "lab", params: { model: "apistyle-lab", config: { lockClient: false }, values: { style: "grpc", client: "browser" }, metric: "needsProxy" }, expect: { min: 1 } },
    { id: "service", claim: "Between services REST takes about 32 ms", run: "lab", params: { model: "apistyle-lab", config: { lockClient: false }, values: { style: "rest", client: "service" }, metric: "loadMs" }, expect: { max: 40 } },
  ],
});
