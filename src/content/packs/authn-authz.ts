import { definePack } from "../define";

export const AUTHZ = { start: { where: "service", authn: true, roles: true, owner: true } };
export const AUTHZ_CHALLENGE = {};

const BOLA = { id: "owasp-api1", title: "OWASP API Security Top 10 (2023), API1: Broken Object Level Authorization", url: "https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/" };
const OWASP_AUTHZ = { id: "owasp-authz-cheatsheet", title: "OWASP Cheat Sheet Series: Authorization (deny by default, enforce on every request)", url: "https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html" };
const OWASP_TOP10 = { id: "owasp-top10-2021", title: "OWASP Top 10 (2021), A01: Broken Access Control", url: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/" };

export default definePack({
  id: "authn-authz",
  title: "AuthN vs AuthZ",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "page", title: "security report · invoices of other customers readable", detail: "change the number in /invoices/1042" },
    lines: [
      { speaker: "kabir", line: "A researcher logged in as an ordinary customer, changed one number in a URL, and downloaded another company's invoice. Login worked exactly as designed." },
      { speaker: "meera", line: "Login answers who you are, not what you may touch. They are separate checks, and the second is the one people forget." },
    ],
  },
  predictions: [
    {
      id: "ui-only",
      kind: "choice",
      prompt: "The app hides admin buttons from ordinary users and the checks live only in the interface. An attacker calls the API directly. How many of the 5,000 unauthenticated requests a day succeed?",
      options: [
        { id: "none", label: "None: the buttons are hidden" },
        { id: "some", label: "Some of them" },
        { id: "all", label: "All of them" },
      ],
      answer: "all",
      observe: "open",
      reveal: {
        text: "The interface is code running on the attacker's machine, so anything it checks can be skipped by sending the request by hand. Checks have to run where the attacker cannot reach, on the server, on every request. A hidden button is a courtesy, not a control.",
        derived: true,
        line: { speaker: "meera", line: "Never trust the caller to enforce the rule for you." },
      },
    },
    {
      id: "idor",
      kind: "choice",
      prompt: "The gateway checks the login and the caller's role. A logged-in user changes an id in the URL to another user's record. Of 2,000 such requests a day, how many does the gateway stop?",
      options: [
        { id: "all", label: "All of them" },
        { id: "half", label: "About half" },
        { id: "none", label: "None: the gateway cannot see whose record it is" },
      ],
      answer: "none",
      observe: "idor",
      reveal: {
        text: "The gateway knows the caller is a valid customer and that customers may call /invoices. It does not know that invoice 1042 belongs to someone else. That fact lives in the data, so the service that loads the record must check ownership. This is broken object-level authorization, the top API risk.",
        derived: true,
        line: { speaker: "rao", line: "Role says what you may do. Ownership says to which things." },
      },
    },
  ],
  widget: { id: "authz-lab", config: AUTHZ },
  mechanism: [
    {
      id: "authn",
      scene: "authn",
      text: "Authentication establishes who is calling: a password, a token, a certificate. Without it, every request is anonymous. It is necessary and not sufficient: proving an identity says nothing about what that identity may do. Verify the credential on every request, on the server.",
      sourceIds: ["owasp-authz-cheatsheet"],
    },
    {
      id: "roles",
      scene: "roles",
      text: "Authorization decides what an identity may do. The first layer is function-level: only administrators may call admin endpoints. Roles or scopes attach to the identity and each endpoint states what it requires. Deny by default, so a new endpoint is closed until someone opens it.",
      sourceIds: ["owasp-authz-cheatsheet", "owasp-top10-2021"],
    },
    {
      id: "objects",
      scene: "objects",
      text: "The second layer is object-level: may this user see this record. Whenever a request names an object by id, the code that loads it must check the caller's right to it, such as invoice.owner equals user. Skipping this check is the most common serious flaw in APIs, and unguessable ids do not fix it.",
      sourceIds: ["owasp-api1", "owasp-authz-cheatsheet"],
    },
    {
      id: "where",
      text: "Where the checks run matters. A gateway is good for authentication and coarse rules, since it sees every call once. Fine-grained rules need the data, so they live in the services. Never rely on the client, and never rely on one layer: each service should still check, in case a call arrives from somewhere else.",
      sourceIds: ["owasp-authz-cheatsheet"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "checks",
      title: "Stop all three kinds of abuse",
      brief: "Each day 5,000 requests come with no valid login, 800 ordinary users call admin endpoints, and 2,000 logged-in users ask for other users' records. Set where the checks run and which checks exist so none of them succeeds.",
      line: { speaker: "kabir", line: "A hidden button was our whole access control. Let us put a real one in." },
      widget: { id: "authz-lab", config: AUTHZ_CHALLENGE },
      conditions: [
        { metric: "openToAnyone", op: "<=", value: 0, label: "No unauthenticated access" },
        { metric: "privilegeEscalation", op: "<=", value: 0, label: "No role bypass" },
        { metric: "otherUsersData", op: "<=", value: 0, label: "No access to other users' records" },
      ],
      stars: [],
      hints: [
        "What can an attacker skip if the checks are only in the interface?",
        "Which checks can a gateway make?",
        "Which check needs the record itself?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain authentication versus authorization and where each check belongs.",
    rubric: [
      { id: "authn", criterion: "Authentication establishes who the caller is; authorization decides what they may do", keyIdea: "who versus what" },
      { id: "layers", criterion: "Authorize at function level (roles) and at object level (ownership of the record), deny by default", keyIdea: "role and ownership" },
      { id: "server", criterion: "Enforce on the server on every request; the client and the gateway alone are not enough", keyIdea: "enforce server-side" },
    ],
    exemplar:
      "Authentication establishes who is calling and authorization decides what they may do. I would check the role for each endpoint and, in the service that loads the record, check that the caller owns it, denying by default. All checks run on the server for every request, because anything enforced only in the interface can be skipped by calling the API directly, and a gateway cannot see whose record is requested.",
  },
  reviews: [
    {
      id: "aa-est",
      format: "estimate",
      scenario: "An API serves 1,000 invoices per customer. A script that changes the id in a URL tries every id from 1 to 100,000 with no ownership check. About what share of all invoices does a single logged-in attacker retrieve?",
      unit: "%",
      answer: 100,
      acceptFactor: 1.05,
      breakdown: ["Every id from 1 to 100,000 returns a record", "no check ties the record to the caller", "so everything in that range"],
      explain: "Without an ownership check the login is the only barrier, and any customer account is enough to read the whole table.",
    },
    {
      id: "aa-pick",
      format: "pick-fix",
      scenario: "Invoice ids are random UUIDs, so the team says guessing another customer's id is impossible and skips the ownership check. Which statement is right?",
      options: [
        { id: "a", label: "Random ids make guessing hard, but ids leak in links, logs and emails; the ownership check is still required" },
        { id: "b", label: "Random ids replace the ownership check" },
        { id: "c", label: "The ownership check is only needed for sequential ids" },
        { id: "d", label: "Encrypt the id in the URL instead" },
      ],
      answer: "a",
      explain: "An id is an address, not a permission. Anyone who sees one, in a shared link or a log, can use it unless the server checks the right to the record.",
    },
    {
      id: "aa-order",
      format: "order",
      scenario: "Order these checks in the sequence a request should meet them.",
      items: [
        { id: "authn", label: "Is there a valid login?" },
        { id: "role", label: "May this role call this endpoint?" },
        { id: "owner", label: "Does this user own this record?" },
      ],
      answer: ["authn", "role", "owner"],
      explain: "Each check narrows what the previous one allows, and the later ones need the identity established by the first.",
    },
    {
      id: "aa-graph",
      format: "predict-graph",
      scenario: "An API checks the login and the role but not ownership. As the number of customers grows from 10 to 100,000, how does the number of other customers' records one attacker can read change?",
      xLabel: "customers →",
      yLabel: "records reachable by one attacker",
      options: [
        { id: "all", label: "Grows with the whole table: every customer's data", points: [10, 100, 1000, 10000, 30000, 60000, 90000, 100000] },
        { id: "own", label: "Stays at their own", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "few", label: "Grows slowly", points: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
      answer: "all",
      explain: "One missing check exposes the entire table to anyone with an account, so the harm grows with your success.",
    },
    {
      id: "aa-flaw",
      format: "spot-flaw",
      scenario: "A mobile app checks 'is_admin' before showing the Delete User screen. The delete endpoint itself only checks that the caller is logged in. Tap the part that is missing the check.",
      diagram: {
        nodes: [
          { id: "app", label: "app: hides screen unless is_admin", kind: "client", col: 0, row: 1 },
          { id: "api", label: "DELETE /users/{id}: checks login only", kind: "server", col: 1, row: 1 },
          { id: "db", label: "user table", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "app", to: "api" },
          { from: "api", to: "db" },
        ],
      },
      answer: "app->api",
      explain: "The endpoint trusts that only admins reach it. Any logged-in user can send the request directly, so the endpoint must check the role.",
    },
    {
      id: "aa-explain",
      format: "explain",
      scenario: "In two sentences: why is deny by default the right starting point for authorization?",
      rubric: [
        { id: "new", criterion: "A new endpoint or resource is then closed until someone grants access, rather than open until someone remembers to lock it" },
        { id: "fail", criterion: "Forgetting a rule fails safe, as an error, instead of silently exposing data" },
      ],
      exemplar: "With deny by default, a new endpoint is closed until someone deliberately opens it, instead of being open until someone remembers to lock it. A forgotten rule then fails safely as an error, not as a silent data leak.",
      explain: "Mistakes should lock doors, not open them.",
    },
  ],
  codex: {
    oneLiner: "Authentication is who you are. Authorization is what you may do: check role per endpoint and ownership per record, server-side, deny by default.",
    keyNumbers: [
      { label: "Top API risk (OWASP API Security 2023)", value: "Broken object-level authorization", sourceId: "owasp-api1" },
      { label: "Top web risk (OWASP Top 10 2021)", value: "Broken access control", sourceId: "owasp-top10-2021" },
    ],
    tradeoffs: [
      { choice: "Checks in the gateway", gain: "One place, easy to audit for login and role", cost: "Cannot see whose record" },
      { choice: "Checks in every service", gain: "Can enforce ownership with the data", cost: "Repeated and easy to forget" },
      { choice: "Central policy engine", gain: "One rule set across services", cost: "A dependency on every request path" },
    ],
    seenIn: ["Role-based access control in frameworks.", "Policy engines such as Open Policy Agent and AWS Cedar."],
    interviewAngle: "Say: 'authenticate at the edge, authorize by role per endpoint, and check ownership in the service that loads the record; deny by default'.",
    aws: [{ concept: "Authorizers and IAM policies", service: "API Gateway, Cognito, Verified Permissions" }],
    replay: { id: "authz-lab", config: AUTHZ, scene: "objects" },
  },
  interview: [
    "What is the difference between authentication and authorization?",
    "What is an insecure direct object reference?",
    "Where should authorization checks live in a microservice system?",
  ],
  deeper: [
    {
      title: "Policy as data",
      body: "As rules grow, scattering if-statements through services becomes unmanageable. Many organisations move rules into a policy engine, which takes the caller, the action and the resource and returns allow or deny, with the policies written separately and tested on their own. It makes a rule change a policy change, and lets security teams review rules without reading application code.",
      sourceIds: ["owasp-authz-cheatsheet"],
    },
  ],
  honestPhysics: [
    "An API receives three kinds of abuse a day: 5,000 requests with no valid login, 800 admin-endpoint calls from ordinary users, and 2,000 requests for other users' records by changing an id.",
    "A login check stops the first, a role check the second, and an ownership check the third. Checks only in the interface stop none. A gateway can enforce login and role but not ownership; checks in every service can enforce all three.",
    "Each missing check lets its whole kind through, in the lab.",
  ],
  sources: [BOLA, OWASP_AUTHZ, OWASP_TOP10],
  verify: [
    { id: "ui", claim: "Checks in the interface alone let all 5,000 anonymous requests through", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "client", authn: true, roles: true, owner: true }, metric: "openToAnyone" }, expect: { min: 5000, max: 5000 } },
    { id: "gateway-owner", claim: "A gateway with login and role checks still hands out 2,000 records", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "gateway", authn: true, roles: true, owner: true }, metric: "otherUsersData" }, expect: { min: 2000, max: 2000 } },
    { id: "gateway-ok", claim: "…but stops anonymous and role abuse", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "gateway", authn: true, roles: true }, metric: "privilegeEscalation" }, expect: { max: 0 } },
    { id: "service", claim: "Checks in every service stop all three", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "service", authn: true, roles: true, owner: true }, metric: "otherUsersData" }, expect: { max: 0 } },
    { id: "no-role", claim: "Skipping the role check lets 800 admin calls through", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "service", authn: true, roles: false, owner: true }, metric: "privilegeEscalation" }, expect: { min: 800 } },
    { id: "no-authn", claim: "Skipping the login check lets 5,000 anonymous requests through", run: "lab", params: { model: "authz-lab", config: AUTHZ_CHALLENGE, values: { where: "service", authn: false, roles: true, owner: true }, metric: "openToAnyone" }, expect: { min: 5000 } },
  ],
});
