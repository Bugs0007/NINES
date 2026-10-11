import { definePack } from "../define";

export const OAUTH = { lockClient: true, client: "spa", start: { flow: "pkce", scopes: 3 } };
export const OAUTH_CHALLENGE = { lockClient: true, client: "spa" };

const RFC6749 = { id: "rfc6749", title: "RFC 6749: The OAuth 2.0 Authorization Framework", url: "https://www.rfc-editor.org/rfc/rfc6749" };
const RFC7636 = { id: "rfc7636", title: "RFC 7636: Proof Key for Code Exchange by OAuth Public Clients (PKCE)", url: "https://www.rfc-editor.org/rfc/rfc7636" };
const RFC9700 = { id: "rfc9700", title: "RFC 9700: Best Current Practice for OAuth 2.0 Security", url: "https://www.rfc-editor.org/rfc/rfc9700" };
const OIDC = { id: "oidc-core", title: "OpenID Connect Core 1.0 (ID token, userinfo, standard scopes)", url: "https://openid.net/specs/openid-connect-core-1_0.html" };

export default definePack({
  id: "oauth-oidc",
  title: "OAuth2 & OIDC Flows",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "warn", title: "security review · access tokens found in browser history and proxy logs", detail: "the single-page app uses the implicit flow" },
    lines: [
      { speaker: "kabir", line: "Our app lets people sign in with their Google account. A review found their access tokens sitting in browser history, proxy logs and analytics URLs." },
      { speaker: "meera", line: "The redirect carried the token in the address. There is a flow designed so that the address only carries a one-time code, and a proof that only your app holds." },
    ],
  },
  predictions: [
    {
      id: "intercept",
      kind: "choice",
      prompt: "A single-page app uses the plain authorization code flow with no PKCE. It cannot hold a secret. Another app on the phone intercepts the code from the redirect. Can it redeem the code for a token?",
      options: [
        { id: "no", label: "No: the code is single-use" },
        { id: "yes", label: "Yes: nothing proves it is the app that asked" },
        { id: "sometimes", label: "Only if it guesses the state value" },
      ],
      answer: "yes",
      observe: "intercepted",
      reveal: {
        text: "A code is single-use, but whoever presents it first wins. A public client has no client secret to show, so the server cannot tell the real app from an impostor with the same code. PKCE fixes this with a random secret the app creates for each login and proves when it redeems the code.",
        derived: true,
        line: { speaker: "meera", line: "Redirects are public. Anything that rides in one can be copied." },
      },
    },
    {
      id: "password",
      kind: "choice",
      prompt: "A third-party app uses the resource-owner password flow: the user types their Google password into the app, which sends it for a token. What does the app now see?",
      options: [
        { id: "token", label: "Only a token" },
        { id: "both", label: "The user's actual password, as well as the token" },
        { id: "hash", label: "A hash of the password" },
      ],
      answer: "both",
      observe: "shared",
      reveal: {
        text: "The whole point of OAuth is to let an app act for a user without ever knowing their password. In the password flow the app handles the real password, so it can store it, leak it, and the user cannot revoke the app without changing it. The flow is removed from the current security guidance.",
        derived: true,
        line: { speaker: "rao", line: "If the app has your password, it is not delegated access. It is a copy of you." },
      },
    },
  ],
  widget: { id: "oauth-lab", config: OAUTH },
  mechanism: [
    {
      id: "delegate",
      text: "OAuth 2.0 lets a user grant an app limited access to their account on another service without sharing the password. The user signs in at the authorization server, approves specific scopes, and the app receives an access token to call the API. OpenID Connect adds an ID token that says who signed in.",
      sourceIds: ["rfc6749", "oidc-core"],
    },
    {
      id: "code",
      scene: "code",
      text: "The authorization code flow keeps tokens out of the browser address. The app redirects to the authorization server; the user approves; the server redirects back with a short single-use code; the app, from a back channel, trades the code and its client secret for tokens. It suits server-side apps, which can keep a secret.",
      sourceIds: ["rfc6749", "rfc9700"],
    },
    {
      id: "pkce",
      scene: "pkce",
      text: "Single-page and mobile apps cannot keep a secret, so PKCE replaces it. The app generates a random verifier, sends its hash with the first request, and sends the verifier when redeeming the code. An attacker who steals the code does not have the verifier. Current guidance uses PKCE for every client, public or not.",
      sourceIds: ["rfc7636", "rfc9700"],
    },
    {
      id: "rest",
      scene: "creds",
      text: "Client credentials is for services acting for themselves, with no user. The implicit flow, which returned tokens in the redirect, and the password flow are discouraged. Request only the scopes you need; an access token with more reach than the feature needs turns any leak into a bigger breach.",
      sourceIds: ["rfc9700", "rfc6749"],
    },
  ],
  challenges: [
    {
      id: "spa-flow",
      title: "Sign in from a single-page app",
      brief: "A browser app signs users in with an identity provider. It needs 3 scopes. Choose the flow and scopes so tokens cannot be intercepted from the redirect, no client secret sits in the browser, the user's password never reaches the app, the flow suits a public client, and no extra scopes are requested.",
      line: { speaker: "kabir", line: "Everything in a browser app is readable. Design as if the attacker has the source code." },
      widget: { id: "oauth-lab", config: OAUTH_CHALLENGE },
      conditions: [
        { metric: "interceptable", op: "<=", value: 0, label: "Nothing interceptable from the redirect" },
        { metric: "secretOnClient", op: "<=", value: 0, label: "No secret in the browser" },
        { metric: "passwordShared", op: "<=", value: 0, label: "App never sees the password" },
        { metric: "fits", op: ">=", value: 1, label: "The flow suits this client" },
        { metric: "excessScopes", op: "<=", value: 0, label: "No extra scopes" },
      ],
      stars: [],
      hints: [
        "Which flows put something secret in the redirect URL?",
        "What replaces the client secret for apps that cannot keep one?",
        "How many scopes does the app actually need?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain the authorization code flow with PKCE and why it replaced the implicit flow.",
    rubric: [
      { id: "code", criterion: "The redirect carries only a short single-use code, traded for tokens on a back channel, so tokens stay out of URLs", keyIdea: "code, not token, in the redirect" },
      { id: "pkce", criterion: "PKCE proves the app redeeming the code is the one that asked, using a per-login secret, since public clients have no client secret", keyIdea: "PKCE verifier" },
      { id: "scopes", criterion: "Request least-privilege scopes and avoid the password and implicit flows", keyIdea: "least scope, no password flow" },
    ],
    exemplar:
      "In the authorization code flow the redirect carries only a short single-use code, and the app trades it for tokens over a back channel, so tokens never appear in URLs the way they do in the implicit flow. A single-page app cannot keep a client secret, so PKCE has it generate a random verifier per login, send its hash up front and the verifier when redeeming the code, which an attacker who steals the code does not have. I would request only the scopes needed and never use the password flow.",
  },
  reviews: [
    {
      id: "oa-est",
      format: "estimate",
      scenario: "An app requests 12 scopes but its features need 3. If each extra scope widens what a leaked token can reach by one resource type, how many extra resource types are exposed?",
      unit: "types",
      answer: 9,
      acceptFactor: 1.01,
      breakdown: ["12 − 3 = 9"],
      explain: "Every unneeded scope is blast radius with no benefit. Request what the feature needs and ask again, with consent, if more is required later.",
    },
    {
      id: "oa-pick",
      format: "pick-fix",
      scenario: "A mobile app embeds its client secret in the binary so it can use the authorization code flow. Attackers extract it from the app store build. What is the right fix?",
      options: [
        { id: "a", label: "Remove the secret and use the authorization code flow with PKCE" },
        { id: "b", label: "Obfuscate the secret more heavily" },
        { id: "c", label: "Use the implicit flow instead" },
        { id: "d", label: "Rotate the secret weekly" },
      ],
      answer: "a",
      explain: "A secret in a distributed app is not secret. PKCE gives public clients a per-login proof with nothing to extract.",
    },
    {
      id: "oa-order",
      format: "order",
      scenario: "Order these flows for a single-page app from safest to least safe.",
      items: [
        { id: "pkce", label: "Authorization code with PKCE" },
        { id: "code", label: "Authorization code with an embedded secret" },
        { id: "implicit", label: "Implicit flow" },
        { id: "password", label: "Resource owner password" },
      ],
      answer: ["pkce", "code", "implicit", "password"],
      explain: "PKCE has a per-login proof. An embedded secret is extractable but the flow keeps tokens off the redirect. The implicit flow leaks tokens into URLs, and the password flow hands over the password itself.",
    },
    {
      id: "oa-graph",
      format: "predict-graph",
      scenario: "As the number of scopes an app requests rises from 1 to 12 while its needs stay at 3, how does the extent of what a stolen token can do change?",
      xLabel: "scopes requested →",
      yLabel: "what a stolen token can reach",
      options: [
        { id: "grow", label: "Grows with every scope requested, whether needed or not", points: [1, 2, 3, 4, 6, 8, 10, 12] },
        { id: "needs", label: "Stays at what the app needs", points: [3, 3, 3, 3, 3, 3, 3, 3] },
        { id: "fall", label: "Falls", points: [12, 10, 8, 6, 4, 3, 2, 1] },
      ],
      answer: "grow",
      explain: "A token is only as limited as its scopes. Extra scopes add reach the app never uses and an attacker will.",
    },
    {
      id: "oa-flaw",
      format: "spot-flaw",
      scenario: "A callback handler accepts any redirect and any 'state' value, and logs the full callback URL including the code. An attacker tricks a user into approving a login that ends up in the attacker's session. Tap the missing check.",
      diagram: {
        nodes: [
          { id: "start", label: "app starts login, sends state", kind: "client", col: 0, row: 1 },
          { id: "idp", label: "identity provider", kind: "external", col: 1, row: 1 },
          { id: "callback", label: "callback: does not compare state", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "start", to: "idp" },
          { from: "idp", to: "callback" },
        ],
      },
      answer: "idp->callback",
      explain: "The callback must check that the returned state matches the one the app sent for this browser session. Without that, an attacker can inject their own authorization into a victim's login (login CSRF).",
    },
    {
      id: "oa-explain",
      format: "explain",
      scenario: "In two sentences: what does OpenID Connect add to OAuth 2.0?",
      rubric: [
        { id: "authn", criterion: "OAuth grants access to resources, it does not say who the user is; OIDC adds authentication" },
        { id: "idtoken", criterion: "It issues an ID token, a signed statement of who signed in, plus standard scopes and a userinfo endpoint" },
      ],
      exemplar: "OAuth 2.0 is about delegating access to an API, and by itself it does not tell the app who signed in. OpenID Connect adds an ID token, a signed statement of the user's identity, along with standard scopes and a userinfo endpoint.",
      explain: "OAuth is about access; OIDC is about identity.",
    },
  ],
  codex: {
    oneLiner: "Use the authorization code flow with PKCE for every client with a user, client credentials for services, request least scopes, and add OIDC for identity.",
    keyNumbers: [
      { label: "PKCE", value: "required for public clients, recommended for all", sourceId: "rfc9700" },
      { label: "Flows to avoid", value: "implicit and resource owner password", sourceId: "rfc9700" },
    ],
    tradeoffs: [
      { choice: "Authorization code + PKCE", gain: "Safe for public and confidential clients", cost: "More round trips; a verifier to manage" },
      { choice: "Client credentials", gain: "Simple for services", cost: "No user context; guard the secret" },
      { choice: "Broad scopes", gain: "Fewer consent prompts", cost: "A leak reaches much more" },
    ],
    seenIn: ["Sign in with Google, GitHub or Apple.", "Cognito, Auth0 and Keycloak hosted login pages."],
    interviewAngle: "Say: 'authorization code with PKCE for apps with users, client credentials for services, minimum scopes, and OIDC for who signed in'.",
    aws: [{ concept: "Hosted UI with authorization code and PKCE", service: "Amazon Cognito" }],
    replay: { id: "oauth-lab", config: OAUTH, scene: "pkce" },
  },
  interview: [
    "Explain the OAuth 2.0 authorization code flow.",
    "Why do single-page apps need PKCE?",
    "What is the difference between OAuth 2.0 and OpenID Connect?",
  ],
  deeper: [
    {
      title: "Tokens in the browser",
      body: "Even with a correct flow, a single-page app has to keep its tokens somewhere in the browser, where an XSS bug can reach them. Many teams now use a backend-for-frontend: a small server completes the flow and keeps the tokens, giving the browser only a session cookie. It shrinks what a script injection can steal.",
      sourceIds: ["rfc9700"],
    },
  ],
  honestPhysics: [
    "A single-page or mobile app is a public client: anyone can read its code, so it cannot hold a secret. A server-side web app is confidential. A background job is machine to machine.",
    "Implicit returns tokens in the redirect. The code flow without PKCE lets a public client's stolen code be redeemed. PKCE adds a per-login proof. Client credentials suits services only. The password flow gives the app the password.",
    "The app needs 3 scopes; asking for more is over-permission, fewer breaks features.",
  ],
  sources: [RFC6749, RFC7636, RFC9700, OIDC],
  verify: [
    { id: "implicit", claim: "The implicit flow can be intercepted", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "implicit", scopes: 3 }, metric: "interceptable" }, expect: { min: 1 } },
    { id: "code-spa", claim: "The plain code flow on a single-page app can be intercepted", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "code", scopes: 3 }, metric: "interceptable" }, expect: { min: 1 } },
    { id: "pkce", claim: "PKCE cannot", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "pkce", scopes: 3 }, metric: "interceptable" }, expect: { max: 0 } },
    { id: "password", claim: "The password flow exposes the password", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "password", scopes: 3 }, metric: "passwordShared" }, expect: { min: 1 } },
    { id: "excess", claim: "Twelve scopes are nine too many", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "pkce", scopes: 12 }, metric: "excessScopes" }, expect: { min: 9, max: 9 } },
    { id: "fits", claim: "PKCE with 3 scopes fits a single-page app", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "pkce", scopes: 3 }, metric: "fits" }, expect: { min: 1 } },
    { id: "too-few", claim: "Two scopes break a feature", run: "lab", params: { model: "oauth-lab", config: OAUTH_CHALLENGE, values: { flow: "pkce", scopes: 2 }, metric: "fits" }, expect: { max: 0 } },
  ],
});
