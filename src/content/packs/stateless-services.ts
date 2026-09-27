import { definePack, SRC } from "../define";

const CPU = { kind: "lognormal", median: 0.016, p99: 0.06 };
const LAB = { variant: "lab", cpu: CPU, instance: "m7i.large", rps: 150, users: 3000, seed: "sessions-lab" };
export const DEPLOY = { variant: "deploy", cpu: CPU, instance: "m7i.large", rps: 150, users: 3000, durationS: 120, fromS: 10, seed: "sessions" };

const KARGER = { id: "karger-1997", title: "D. Karger et al. (1997), Consistent Hashing and Random Trees, STOC '97", url: "https://doi.org/10.1145/258533.258660" };
const RFC6265 = { id: "rfc6265", title: "RFC 6265: HTTP State Management (user agents should support cookies of at least 4096 bytes)", url: "https://www.rfc-editor.org/rfc/rfc6265#section-6.1" };
const DJANGO_SIGNED = { id: "django-signed-cookies", title: "Django docs: Using cookie-based sessions (signed_cookies backend, and its caveats)", url: "https://docs.djangoproject.com/en/stable/topics/http/sessions/#using-cookie-based-sessions" };

export default definePack({
  id: "stateless-services",
  title: "Stateless Services",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "Support", detail: "It logged me out AGAIN. Third time in one minute.|My draft message vanished when I tapped send.|Is Pigeon being hacked? It keeps asking me to log in." },
    lines: [
      { speaker: "kabir", line: "We added a second server yesterday and today everyone gets logged out. Did you break login?" },
      { speaker: "meera", line: "Login is fine: a server remembers who you are. The question is which server." },
    ],
  },
  predictions: [
    {
      id: "loss",
      kind: "choice",
      prompt: "Two servers behind round-robin. Django keeps each session in the memory of the box where you logged in. What share of logged-in requests get kicked back to the login screen?",
      options: [
        { id: "0", label: "None: login state is in the cookie" },
        { id: "10", label: "About 10%" },
        { id: "50", label: "About half" },
        { id: "100", label: "All of them" },
      ],
      answer: "50",
      observe: "session-loss",
      reveal: {
        text: "Each request lands on either box. Half the time it's the box that doesn't have your session, so you're 'logged out'. You log in again there, and now the other box doesn't know you. With N boxes it's (N−1)/N.",
        derived: true,
        line: { speaker: "meera", line: "The cookie holds a key, and the session it opens lives on one box. That's the bug." },
      },
    },
    {
      id: "reshuffle",
      kind: "choice",
      prompt: "You switch to sticky routing: the balancer hashes each user to one box. Everything's calm. Then you add a third box. What share of users get logged out?",
      options: [
        { id: "none", label: "None: existing users stay put" },
        { id: "third", label: "About a third" },
        { id: "twothirds", label: "About two-thirds" },
        { id: "all", label: "All of them" },
      ],
      answer: "twothirds",
      observe: "sticky-reshuffle",
      reveal: {
        text: "Hashing user mod 2 then mod 3 keeps a user on the same box only when both give the same answer: one user in three. The other two-thirds move to a box that has never seen them. Consistent hashing, later in the campaign, exists to fix exactly this.",
        derived: true,
      },
    },
  ],
  widget: { id: "session-lab", config: LAB },
  mechanism: [
    {
      id: "state",
      scene: "state",
      text: "The server kept state: the session lived in one process's memory. The moment requests can land on any box, that box is a stranger to the user. Uploads saved to local disk, in-memory caches, and background jobs held in RAM break the same way.",
    },
    {
      id: "sticky",
      text: "Sticky routing hides the problem instead of fixing it. Hash-based stickiness reshuffles users whenever the pool changes. Cookie-based stickiness (like ALB's) holds until a box dies or restarts, and deploys restart every box.",
      sourceIds: ["alb-sticky"],
    },
    {
      id: "move",
      scene: "store",
      text: "Stateless means any box can serve any request because nothing a request needs lives only on one box. Move sessions to a shared store (Redis, the database) or into a signed cookie the client carries.",
      sourceIds: ["twelve-factor", "django-sessions"],
    },
    {
      id: "cattle",
      text: "That's what makes everything else possible: the load balancer can send anywhere, autoscaling can add and kill boxes freely, and deploys can restart them one by one. Stateless app servers are cattle; the state lives in a few carefully run places.",
    },
  ],
  challenges: [
    {
      id: "rolling-deploy",
      title: "Deploy without logging anyone out",
      brief: "Three boxes, 150 req/s, 3,000 logged-in users. Deploy v42 restarts the boxes one at a time, draining each from the balancer first. Pick where sessions live so nobody gets logged out.",
      line: { speaker: "kabir", line: "Can we deploy during the day now? Users keep asking for the new stickers." },
      widget: { id: "session-lab", config: DEPLOY },
      conditions: [
        { metric: "sessionLoss", op: "<", value: 0.005, label: "Under 0.5% of requests logged out" },
        { metric: "errorRate", op: "<", value: 0.01, label: "Errors under 1%" },
        { metric: "p99", op: "<", value: 0.3, label: "p99 under 300 ms" },
      ],
      stars: [
        { metric: "costPerMonth", op: "<=", value: 250, label: "No new infrastructure" },
        { metric: "revocable", op: ">=", value: 1, label: "Can log a user out everywhere, server-side" },
      ],
      hints: [
        "During the deploy, which boxes forget things, and what exactly do they forget?",
        "Sticky routing depends on the pool staying the same. What does a rolling deploy do to the pool?",
        "There are two ways to make every box able to verify a session. They fail differently when you need to revoke one.",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain why in-memory sessions broke when Pigeon added a second server, why sticky sessions aren't a real fix, and what 'stateless' means.",
    rubric: [
      { id: "where", criterion: "Sessions lived in one box's memory, so requests routed to another box didn't recognise the user", keyIdea: "state on one box" },
      { id: "sticky", criterion: "Sticky routing breaks when the pool changes (restarts, deploys, scaling) and unbalances load", keyIdea: "stickiness is fragile" },
      { id: "stateless", criterion: "Stateless = any box can serve any request; state moves to a shared store or a signed client-side token", keyIdea: "shared store or signed cookie" },
    ],
    exemplar:
      "Each session lived in the memory of the box where the user logged in, so when the balancer sent a request to the other box it had never heard of them. Sticky routing just pins users to a box, which falls apart whenever that box restarts or the pool changes, like every deploy. Stateless means nothing a request needs lives only on one box: keep sessions in Redis or the database, or in a signed cookie, so any box can serve anyone.",
  },
  reviews: [
    {
      id: "st-pick-uploads",
      format: "pick-fix",
      scenario: "Users upload profile photos. The Django view saves them to MEDIA_ROOT on the app server's disk. After scaling to three boxes, two-thirds of photos 404. Fix?",
      options: [
        { id: "a", label: "Enable sticky sessions on the ALB" },
        { id: "b", label: "Store uploads in S3 and serve them from there" },
        { id: "c", label: "rsync the media folder between boxes every minute" },
        { id: "d", label: "Go back to one box" },
      ],
      answer: "b",
      explain: "The file lives on whichever box handled the upload. Put shared files in shared storage (S3), and every box, plus a CDN, can serve them.",
      why: {
        prompt: "Why not sticky sessions?",
        options: [
          { id: "a", label: "Other users viewing the photo land on other boxes, and restarts or new boxes lose it anyway" },
          { id: "b", label: "ALB doesn't support stickiness" },
          { id: "c", label: "Sticky sessions slow down uploads" },
        ],
        answer: "a",
      },
    },
    {
      id: "st-est-mod",
      format: "estimate",
      scenario: "Sticky routing by hash(user) mod N. You scale from 4 boxes to 5. Roughly what percentage of users land on a different box?",
      unit: "%",
      answer: 80,
      acceptFactor: 1.2,
      breakdown: ["A user stays only if hash mod 4 = hash mod 5", "That happens for 4 of every 20 residues", "So ~80% move"],
      explain: "Mod-N hashing reshuffles almost everyone on any pool change. Consistent hashing moves only about 1/N of keys.",
    },
    {
      id: "st-flaw",
      format: "spot-flaw",
      scenario: "Tap the thing that stops this service from scaling out.",
      diagram: {
        nodes: [
          { id: "users", label: "users", kind: "client", col: 0, row: 1 },
          { id: "lb", label: "ALB", kind: "lb", col: 1, row: 1 },
          { id: "app", label: "app (rate-limit counters in a Python dict)", kind: "server", col: 2, row: 1 },
          { id: "db", label: "postgres", kind: "db", col: 3, row: 0 },
          { id: "s3", label: "S3 uploads", kind: "store", col: 3, row: 2 },
        ],
        edges: [
          { from: "users", to: "lb" },
          { from: "lb", to: "app" },
          { from: "app", to: "db" },
          { from: "app", to: "s3" },
        ],
      },
      answer: "app",
      explain: "Counters in process memory mean each box counts separately: with N boxes a user gets N times the limit. Shared state (Redis) keeps the count honest.",
    },
    {
      id: "st-order",
      format: "order",
      scenario: "Order these session strategies by how many users a rolling deploy logs out, fewest first.",
      items: [
        { id: "local", label: "In-memory, round-robin" },
        { id: "sticky", label: "In-memory, hash-sticky" },
        { id: "redis", label: "Shared Redis" },
      ],
      answer: ["redis", "sticky", "local"],
      explain: "Redis: none (any box reads it). Sticky: users of each restarted box, plus reshuffles. Round-robin in memory: most users, constantly.",
    },
    {
      id: "st-pick-cookie",
      format: "pick-fix",
      scenario: "Security asks for a 'log out of all devices' button. Sessions are currently signed cookies (no server-side store). Cheapest correct change?",
      options: [
        { id: "a", label: "Rotate SECRET_KEY" },
        { id: "b", label: "Move sessions to a server-side store (DB or Redis) so they can be deleted" },
        { id: "c", label: "Shorten the cookie lifetime to 5 minutes" },
      ],
      answer: "b",
      explain: "A signed cookie is valid until it expires; the server can't reach into a client and delete it. Rotating the key logs out every user of the app, not one user.",
    },
    {
      id: "st-explain",
      format: "explain",
      scenario: "In two sentences: what does it mean for an app server to be stateless, and why does it matter for deploys?",
      rubric: [
        { id: "def", criterion: "Nothing a request needs lives only on one box (sessions, files, counters are in shared stores)" },
        { id: "deploy", criterion: "So boxes can be restarted, replaced, or added at any time without users noticing" },
      ],
      exemplar: "A stateless app server keeps nothing that a later request depends on: sessions, uploads, and counters live in shared stores. That lets you restart boxes one by one during a deploy, or add and remove them, without anyone losing their session or data.",
      explain: "Stateless doesn't mean the system has no state; it means the state lives in a few places built to hold it.",
    },
  ],
  codex: {
    oneLiner: "A stateless server keeps nothing a later request needs, so any box can serve anyone and boxes can come and go freely.",
    keyNumbers: [
      { label: "Users reshuffled by mod-N hashing, N → N+1", value: "≈ N ÷ (N+1)", sourceId: "karger-1997" },
      { label: "Cookie size browsers must support", value: "≥ 4,096 bytes", sourceId: "rfc6265" },
      { label: "ALB stickiness", value: "cookie-based, duration or app cookie", sourceId: "alb-sticky" },
      { label: "Django session backends", value: "db · cache · cached_db · file · signed_cookies", sourceId: "django-sessions" },
    ],
    tradeoffs: [
      { choice: "Shared session store (Redis / DB)", gain: "Any box, instant revocation, big sessions", cost: "A network hop per request and a store to run" },
      { choice: "Signed cookies", gain: "No server state at all, zero infrastructure", cost: "Can't revoke before expiry, size-limited, visible to the client" },
      { choice: "Sticky sessions", gain: "No code change", cost: "Breaks on restarts and pool changes, unbalances load" },
    ],
    seenIn: [
      "Case Intel keeps Django sessions in Postgres (the default db backend), which is why it could scale out without this bug.",
      "Any file your app writes to local disk (uploads, generated PDFs) is state that won't survive a second box.",
    ],
    interviewAngle: "State 'the app tier is stateless; sessions in Redis, blobs in S3' early in any design. It's what justifies the load balancer and autoscaling you draw next.",
    aws: [
      { concept: "Session store", service: "ElastiCache (Redis/Valkey) or DynamoDB" },
      { concept: "Shared files", service: "S3 (+ CloudFront)" },
      { concept: "Sticky routing", service: "ALB target group stickiness" },
    ],
    otherClouds: "GCP: Memorystore, Cloud Storage · Azure: Cache for Redis, Blob Storage",
    replay: { id: "session-lab", config: LAB },
  },
  interview: [
    "What does 'stateless service' mean? Where does the state go?",
    "Sticky sessions or a session store: which would you pick, and when?",
    "How do you handle file uploads in a horizontally scaled app?",
  ],
  deeper: [
    {
      title: "Why mod-N reshuffles almost everyone",
      body: "With hash(user) mod N, a user stays put after the pool grows to N+1 only if hash mod N equals hash mod (N+1). Over N(N+1) consecutive hash values that happens for N of them, so only 1/(N+1) of users stay: going from 2 to 3 boxes moves two-thirds of them. Consistent hashing (chapter A7) places boxes and keys on a ring so adding a box moves only about 1/(N+1) of keys.",
      derived: true,
    },
    {
      title: "Signed cookies in Django",
      body: "The signed_cookies backend stores the whole session in the cookie, signed with SECRET_KEY so the client can't tamper with it (it can still read it). It needs no store and scales perfectly, but a session can't be invalidated server-side before it expires, and cookies are size-limited. JWTs have the same tradeoff; chapter A12 goes deeper.",
      sourceIds: ["django-signed-cookies"],
    },
    {
      title: "The Twelve-Factor view",
      body: "Twelve-Factor apps run as stateless, share-nothing processes; anything that must persist lives in a backing service. It's a design rule, not a law, but it's the assumption every load balancer, autoscaler, and container orchestrator makes about your app.",
      sourceIds: ["twelve-factor"],
    },
  ],
  honestPhysics: [
    "Users are simulated as independent request streams; a 'logged out' request fails and the user logs in again on the box that served it.",
    "Redis is always up in this lab. A real shared store is now a dependency to run, monitor, and make highly available.",
  ],
  sources: [SRC.twelveFactor, SRC.djangoSessions, SRC.albSticky, DJANGO_SIGNED, KARGER, RFC6265],
  verify: [
    { id: "local-loses", claim: "In-memory sessions lose many sessions during the deploy", run: "session-deploy", params: { config: DEPLOY, mode: "local", metric: "sessionLoss" }, expect: { min: 0.2 } },
    { id: "sticky-loses", claim: "Sticky routing still loses sessions during the deploy", run: "session-deploy", params: { config: DEPLOY, mode: "sticky", metric: "sessionLoss" }, expect: { min: 0.05 } },
    { id: "redis-holds", claim: "Redis sessions survive the deploy", run: "session-deploy", params: { config: DEPLOY, mode: "redis", metric: "sessionLoss" }, expect: { max: 0.005 } },
    { id: "cookie-holds", claim: "Signed cookies survive the deploy", run: "session-deploy", params: { config: DEPLOY, mode: "cookie", metric: "sessionLoss" }, expect: { max: 0.005 } },
    { id: "redis-errors", claim: "The Redis deploy keeps errors under 1%", run: "session-deploy", params: { config: DEPLOY, mode: "redis", metric: "errorRate" }, expect: { max: 0.01 } },
  ],
});
