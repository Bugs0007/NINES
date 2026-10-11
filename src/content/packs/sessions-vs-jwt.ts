import { definePack } from "../define";

export const SESS = { start: { mech: "deny", ttlMin: 15 } };
export const SESS_CHALLENGE = {};

const OWASP_SESSION = { id: "owasp-session", title: "OWASP Cheat Sheet Series: Session Management", url: "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html" };
const RFC7519 = { id: "rfc7519", title: "RFC 7519: JSON Web Token (JWT)", url: "https://www.rfc-editor.org/rfc/rfc7519" };
const RFC8725 = { id: "rfc8725", title: "RFC 8725: JSON Web Token Best Current Practices", url: "https://www.rfc-editor.org/rfc/rfc8725" };

export default definePack({
  id: "sessions-vs-jwt",
  title: "Sessions vs JWT",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "security · stolen laptop, token still valid for 23 hours", detail: "user logged out everywhere, access continues" },
    lines: [
      { speaker: "kabir", line: "An employee's laptop was stolen. We disabled the account at once, and the thief's token kept working for another twenty-three hours, because it is valid until it expires." },
      { speaker: "meera", line: "A token you can verify without asking anyone is fast, and also impossible to take back. A session you look up every time is the opposite trade." },
    ],
  },
  predictions: [
    {
      id: "revoke",
      kind: "choice",
      prompt: "You issue self-contained tokens valid for 24 hours and verify them by signature only. A token is stolen and you disable the account. How long can the thief keep using it?",
      options: [
        { id: "now", label: "Not at all: the account is disabled" },
        { id: "min", label: "A few minutes" },
        { id: "day", label: "Up to the full 24 hours" },
      ],
      answer: "day",
      observe: "cant-revoke",
      reveal: {
        text: "A signature-checked token carries its own proof, so servers never ask whether the account is still active. Disabling the account changes a database row nobody reads on each request. The token works until its expiry time, up to 86,400 seconds, unless you add a check.",
        derived: true,
        line: { speaker: "meera", line: "Stateless means nobody remembers, which includes remembering to say no." },
      },
    },
    {
      id: "store",
      kind: "choice",
      prompt: "You switch to server-side sessions, stored in a shared cache. With 10,000 requests a second, how many cache lookups does authentication cost?",
      options: [
        { id: "none", label: "None" },
        { id: "few", label: "About 100 a second" },
        { id: "ten-k", label: "About 10,000 a second, one per request" },
      ],
      answer: "ten-k",
      observe: "store-hammered",
      reveal: {
        text: "Every request carries a session id and the server must look it up to learn who it is: one read per request. Revocation becomes instant, since you delete the record, but the session store is now on the hot path of everything and must be as available as the service.",
        derived: true,
        line: { speaker: "rao", line: "Instant revocation is paid for with a lookup on every single request." },
      },
    },
  ],
  widget: { id: "sessiontoken-lab", config: SESS },
  mechanism: [
    {
      id: "session",
      scene: "session",
      text: "A server-side session keeps state on the server: a random id in a cookie points to a record saying who you are. Revoking is deleting the record. The id is small, and the cost is a lookup on every request and a shared store that every server depends on.",
      sourceIds: ["owasp-session"],
    },
    {
      id: "jwt",
      scene: "jwt",
      text: "A JSON Web Token carries its claims and a signature, so any server with the key can verify it without a lookup. It scales easily and works across services. But it is large, around 800 bytes sent on every request, and cannot be revoked before it expires.",
      sourceIds: ["rfc7519", "rfc8725"],
    },
    {
      id: "refresh",
      scene: "refresh",
      text: "Short-lived tokens limit the damage: an access token valid for minutes, with a longer-lived refresh token held by the client, exchanged at the identity server for a new one. Cut-off now takes as long as the access token lives, and refreshes add lookups in proportion to users divided by lifetime.",
      sourceIds: ["rfc8725"],
    },
    {
      id: "deny",
      text: "A deny-list closes the gap: revoked token ids are published to servers, which keep them in memory and refresh every few seconds. Verification stays local, and a revoked token is rejected within seconds. It reintroduces a little state, but a small, fast and tolerant one.",
      sourceIds: ["owasp-session", "rfc8725"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "session-design",
      title: "Pick the session design",
      brief: "200,000 users and 10,000 requests a second. A stolen session must be cut off within 60 seconds, authentication must cost at most 500 store lookups a second, and the credential sent with each request must stay under 1,000 bytes.",
      line: { speaker: "kabir", line: "I want to be able to throw a thief out, and I do not want to double our cache bill to do it." },
      widget: { id: "sessiontoken-lab", config: SESS_CHALLENGE },
      conditions: [
        { metric: "revokeS", op: "<=", value: 60, label: "Cut off within 60 seconds" },
        { metric: "lookupsPerSec", op: "<=", value: 500, label: "At most 500 lookups a second" },
        { metric: "bytesPerRequest", op: "<=", value: 1000, label: "Under 1,000 bytes per request" },
      ],
      stars: [],
      hints: [
        "Which designs allow cut-off within a minute?",
        "What does a one-minute token lifetime cost in refresh traffic?",
        "Which design avoids per-request lookups and still revokes?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare server-side sessions and JWTs, and explain how to revoke access with tokens.",
    rubric: [
      { id: "session", criterion: "Sessions store state on the server: revocation is instant but every request needs a lookup", keyIdea: "sessions: lookup, instant revoke" },
      { id: "jwt", criterion: "JWTs are verified by signature with no lookup, but cannot be revoked before they expire", keyIdea: "JWT: stateless, no revoke" },
      { id: "fix", criterion: "Use short-lived tokens with refresh, or a small in-memory deny-list, to get fast revocation without per-request lookups", keyIdea: "short lifetime or deny-list" },
    ],
    exemplar:
      "A server-side session stores who you are on the server, so revoking it is deleting a record, but every request pays for a lookup in a store that has to stay up. A JWT is verified by its signature with no lookup, which scales well, but it cannot be revoked before it expires. To get both, I would use short-lived access tokens with refresh tokens, or keep a small deny-list of revoked token ids in memory on each server and refresh it every few seconds.",
  },
  reviews: [
    {
      id: "sj-est",
      format: "estimate",
      scenario: "200,000 users hold tokens valid for 10 minutes and each refreshes once per lifetime. About how many refresh requests a second reach the identity server?",
      unit: "req/s",
      answer: 333,
      acceptFactor: 1.05,
      breakdown: ["200,000 refreshes per 600 seconds", "= 333 per second"],
      explain: "Refresh load is users divided by lifetime, so halving the lifetime doubles it.",
    },
    {
      id: "sj-pick",
      format: "pick-fix",
      scenario: "A team stores JWTs in localStorage, and an XSS bug lets a script read them. Which change reduces the harm of a stolen token most?",
      options: [
        { id: "a", label: "Short-lived access tokens, with the refresh token in an HttpOnly cookie" },
        { id: "b", label: "Make the token longer" },
        { id: "c", label: "Encode the token in base64 twice" },
        { id: "d", label: "Store it in sessionStorage instead" },
      ],
      answer: "a",
      explain: "A short life limits how long a stolen token works, and HttpOnly keeps the longer-lived credential out of reach of scripts.",
    },
    {
      id: "sj-order",
      format: "order",
      scenario: "Order these designs by how long a stolen credential keeps working after you revoke it, longest first.",
      items: [
        { id: "jwt", label: "24-hour JWT, signature only" },
        { id: "refresh", label: "15-minute access token with refresh" },
        { id: "session", label: "Server-side session, deleted" },
      ],
      answer: ["jwt", "refresh", "session"],
      explain: "The cut-off time is the token lifetime for tokens, and zero when the server holds the state.",
    },
    {
      id: "sj-graph",
      format: "predict-graph",
      scenario: "With short-lived tokens and refresh, as you lengthen the token lifetime from 1 to 60 minutes, how do the identity server's refresh requests per second and the time a stolen token works change?",
      xLabel: "token lifetime →",
      yLabel: "refresh requests a second (falling), cut-off time (rising)",
      options: [
        { id: "trade", label: "Refresh load falls as 1 ÷ lifetime while cut-off time rises with it", points: [3333, 1667, 667, 333, 222, 111, 56, 56] },
        { id: "both-fall", label: "Both fall", points: [3333, 2000, 1000, 500, 250, 100, 50, 25] },
        { id: "flat", label: "Neither changes", points: [500, 500, 500, 500, 500, 500, 500, 500] },
      ],
      answer: "trade",
      explain: "Lifetime trades refresh cost against exposure: you cannot lower both with one number.",
    },
    {
      id: "sj-flaw",
      format: "spot-flaw",
      scenario: "A service accepts any JWT whose payload says 'role: admin' and trusts it without verifying the signature, because 'the token comes from our login service'. An attacker edits a token. Tap the step that is unsafe.",
      diagram: {
        nodes: [
          { id: "login", label: "login service issues token", kind: "server", col: 0, row: 1 },
          { id: "client", label: "client edits payload", kind: "client", col: 1, row: 1 },
          { id: "api", label: "api trusts the payload", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "login", to: "client" },
          { from: "client", to: "api" },
        ],
      },
      answer: "client->api",
      explain: "The client holds the token and can change it. The API must verify the signature, and the algorithm, before it believes any claim.",
    },
    {
      id: "sj-explain",
      format: "explain",
      scenario: "In two sentences: when is a plain server-side session the better choice over JWTs?",
      rubric: [
        { id: "revoke", criterion: "When you need immediate revocation, such as a single web app with a shared store" },
        { id: "simple", criterion: "When a single application owns authentication, so there is no cross-service verification to scale" },
      ],
      exemplar: "When you need to cut a user off immediately, because deleting the server-side record does it. It also fits when one application owns authentication, so there is no cross-service verification problem to solve with tokens.",
      explain: "Pick tokens for distribution, sessions for control.",
    },
  ],
  codex: {
    oneLiner: "Sessions: a lookup per request, instant revoke. JWTs: no lookup, no revoke until expiry. Short lifetimes or a deny-list give most of both.",
    keyNumbers: [
      { label: "Session id size versus JWT, per request", value: "about 32 bytes versus 800", sourceId: "rfc7519" },
      { label: "Refresh load", value: "active users ÷ token lifetime", sourceId: "rfc8725" },
    ],
    tradeoffs: [
      { choice: "Server-side session", gain: "Instant revoke; small cookie", cost: "A lookup on every request; shared store" },
      { choice: "Long-lived JWT", gain: "No lookup; works across services", cost: "Cannot be revoked; large" },
      { choice: "Short JWT plus refresh", gain: "Bounded exposure", cost: "Refresh traffic; more client logic" },
      { choice: "JWT plus deny-list", gain: "Fast revoke, no hot-path lookup", cost: "Some state to distribute" },
    ],
    seenIn: ["Framework session middleware with Redis stores.", "OAuth access tokens as JWTs, with refresh tokens."],
    interviewAngle: "Say: 'sessions for revocation and simplicity, short-lived JWTs with refresh for distribution, and a deny-list when you need both'.",
    aws: [{ concept: "Token lifetimes and refresh tokens", service: "Amazon Cognito" }],
    replay: { id: "sessiontoken-lab", config: SESS, scene: "refresh" },
  },
  interview: [
    "What are the trade-offs between sessions and JWTs?",
    "How do you revoke a JWT?",
    "Where should a browser store a token?",
  ],
  deeper: [
    {
      title: "Common JWT mistakes",
      body: "Accepting the 'none' algorithm, trusting the algorithm named in the token's own header, using a weak shared secret, and skipping checks of the issuer, audience and expiry have all led to real breaches. The best-practice RFC lists them. Use a well-maintained library, pin the algorithm on the server, and validate every standard claim.",
      sourceIds: ["rfc8725"],
    },
  ],
  honestPhysics: [
    "A site with 200,000 signed-in users and 10,000 requests a second. A server-side session needs a lookup per request, sends 32 bytes and revokes at once. A self-contained token needs no lookup, sends about 800 bytes, and cannot be revoked before expiry.",
    "A short token with refresh does 200,000 ÷ lifetime-in-seconds lookups a second and cuts off after its lifetime. A token with an in-memory deny-list refreshed every 5 seconds cuts off in about 5 seconds with no per-request lookup.",
    "Sizes are round figures.",
  ],
  sources: [OWASP_SESSION, RFC7519, RFC8725],
  verify: [
    { id: "jwt", claim: "A 24-hour JWT cannot be revoked for a day", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "jwt", ttlMin: 1440 }, metric: "revokeS" }, expect: { min: 86400, max: 86400 } },
    { id: "session", claim: "A session needs 10,000 lookups a second", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "session" }, metric: "lookupsPerSec" }, expect: { min: 10000, max: 10000 } },
    { id: "session-revoke", claim: "…and revokes at once", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "session" }, metric: "revokeS" }, expect: { max: 0 } },
    { id: "refresh1", claim: "A one-minute token cuts off in 60 seconds but needs 3,333 refreshes a second", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "refresh", ttlMin: 1 }, metric: "lookupsPerSec" }, expect: { min: 3000 } },
    { id: "refresh5", claim: "A five-minute token takes 300 seconds to cut off", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "refresh", ttlMin: 5 }, metric: "revokeS" }, expect: { min: 300 } },
    { id: "deny", claim: "A deny-list revokes in 5 seconds with no lookups", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "deny" }, metric: "revokeS" }, expect: { max: 60 } },
    { id: "deny-lookups", claim: "…and no per-request lookups", run: "lab", params: { model: "sessiontoken-lab", config: SESS_CHALLENGE, values: { mech: "deny" }, metric: "lookupsPerSec" }, expect: { max: 0 } },
  ],
});
