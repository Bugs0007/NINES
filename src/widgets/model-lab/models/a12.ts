/**
 * Chapter A12 "Locks" models: authentication versus authorization, sessions versus tokens, OAuth flows, the OWASP
 * risks, secrets, tenant isolation, and the breach boss. Rule tables and closed forms with labelled round numbers.
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");

// ------------------------------------------------------------------ authn vs authz

export const authzLab: LabModel = {
  id: "authz-lab",
  metrics: ["openToAnyone", "privilegeEscalation", "otherUsersData", "total"],
  observes: ["idor", "open"],
  scenes: ["authn", "roles", "objects"],
  runLabel: "Set the checks",
  honest: [
    "An API receives three kinds of abuse a day: 5,000 requests with no valid login, 800 from logged-in users calling admin-only endpoints, and 2,000 from logged-in users asking for another user's records by changing an id in the URL (insecure direct object reference).",
    "Authentication (who are you) stops the first kind. A role check (may this kind of user call this endpoint) stops the second. An ownership check (may this user see this record) stops the third. A check made only in the client's interface stops none of them, since an attacker calls the API directly. A check at the gateway sees the endpoint but not the record; checks in every service see both.",
    "Each missing check lets that whole kind through, in the lab.",
  ],
  init: () => ({ where: "client", authn: false, roles: false, owner: false }),
  controls: () => [
    { kind: "choice", id: "where", label: "Where checks run", options: [{ id: "client", label: "In the app's interface only" }, { id: "gateway", label: "At the gateway" }, { id: "service", label: "In every service" }] },
    { kind: "toggle", id: "authn", label: "Require a valid login" },
    { kind: "toggle", id: "roles", label: "Check the caller's role for each endpoint" },
    { kind: "toggle", id: "owner", label: "Check the caller owns each record" },
  ],
  evaluate: (v) => {
    const w = str(v, "where");
    const real = w !== "client";
    const authn = real && bool(v, "authn");
    const roles = real && bool(v, "roles");
    const owner = w === "service" && bool(v, "owner");
    const open = authn ? 0 : 5000;
    const priv = roles ? 0 : 800;
    const idor = owner ? 0 : 2000;
    return {
      metrics: { openToAnyone: open, privilegeEscalation: priv, otherUsersData: idor, total: open + priv + idor },
      readouts: [
        { label: "Requests served to anyone, a day", value: open, fmt: "int", tone: open ? "alert" : "ok" },
        { label: "Admin calls by ordinary users", value: priv, fmt: "int", tone: priv ? "alert" : "ok" },
        { label: "Other users' records handed out", value: idor, fmt: "int", tone: idor ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "No login", value: open, tone: open ? "alert" : "ok" }, { label: "Wrong role", value: priv, tone: priv ? "alert" : "ok" }, { label: "Wrong owner", value: idor, tone: idor ? "alert" : "ok" }] },
      notes: [!real ? "Checks in the interface are suggestions: anyone can call the API directly." : w === "gateway" ? "The gateway knows who is calling and which endpoint, not whose record is requested." : "Each service can check the record against the caller."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.otherUsersData! > 0) ev.push("idor");
    if (out.metrics.openToAnyone! > 0) ev.push("open");
    return ev;
  },
  scene: (n): SceneOut => (n === "authn" ? { set: { where: "gateway", authn: true }, focus: ["authn"] } : n === "roles" ? { set: { roles: true }, focus: ["roles"] } : n === "objects" ? { set: { where: "service", owner: true }, focus: ["owner", "where"] } : undefined),
};

// ------------------------------------------------------------------ sessions vs tokens

export const sessionTokenLab: LabModel = {
  id: "sessiontoken-lab",
  metrics: ["revokeS", "lookupsPerSec", "bytesPerRequest", "stolenWindowMin"],
  observes: ["cant-revoke", "store-hammered"],
  scenes: ["session", "jwt", "refresh"],
  runLabel: "Choose the session design",
  honest: [
    "A site with 200,000 signed-in users making 10,000 requests a second. A server-side session stores state in a shared store: every request does a lookup (10,000 a second), a 32-byte id travels with each request, and revoking is instant. A self-contained token (JWT) is checked by signature with no lookup, about 800 bytes a request, and cannot be revoked before it expires.",
    "A short-lived token with a refresh token expires in minutes; each user refreshes once per lifetime, so lookups are 200,000 ÷ lifetime in seconds. A token plus a small deny-list of revoked ids, which servers load in memory and refresh every 5 seconds, revokes in about 5 seconds with no per-request lookup.",
    "The stolen-token window is how long a stolen token keeps working after the user logs out or you notice.",
  ],
  init: () => ({ mech: "jwt", ttlMin: 60 * 24 }),
  controls: () => [
    { kind: "choice", id: "mech", label: "Design", options: [{ id: "session", label: "Server-side session in a shared store" }, { id: "jwt", label: "Long-lived self-contained token" }, { id: "refresh", label: "Short-lived token plus refresh token" }, { id: "deny", label: "Token plus a small in-memory deny-list" }] },
    { kind: "slider", id: "ttlMin", label: "Token lifetime", min: 1, max: 1440, log: true, fmt: "num", hint: "minutes" },
  ],
  evaluate: (v) => {
    const m = str(v, "mech");
    const ttlS = num(v, "ttlMin") * 60;
    const revoke = m === "session" ? 0 : m === "deny" ? 5 : ttlS;
    const lookups = m === "session" ? 10000 : m === "refresh" ? 200000 / ttlS : 0;
    const bytes = m === "session" ? 32 : 800;
    const stolen = revoke / 60;
    return {
      metrics: { revokeS: revoke, lookupsPerSec: lookups, bytesPerRequest: bytes, stolenWindowMin: stolen },
      readouts: [
        { label: "Time to cut off a stolen session", value: revoke, fmt: "s", tone: revoke > 60 ? "alert" : revoke > 10 ? "warn" : "ok" },
        { label: "Store lookups a second", value: lookups, fmt: "int", tone: lookups > 500 ? "warn" : "ok" },
        { label: "Bytes added to every request", value: bytes, fmt: "bytes" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Seconds to revoke", value: revoke, tone: revoke > 60 ? "alert" : "ok" }, { label: "Lookups a second", value: lookups, tone: lookups > 500 ? "warn" : "ok" }] },
      notes: [m === "jwt" ? "Stateless and fast, and a leaked token works until it expires." : m === "session" ? "Revoking is easy because the server remembers; every request pays a lookup." : m === "refresh" ? "A shorter lifetime means faster cut-off and more refresh traffic." : "No lookup on the hot path, and revocation arrives in seconds."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.revokeS! > 3600) ev.push("cant-revoke");
    if (out.metrics.lookupsPerSec! > 5000) ev.push("store-hammered");
    return ev;
  },
  scene: (n): SceneOut => (n === "session" ? { set: { mech: "session" }, focus: ["mech"] } : n === "jwt" ? { set: { mech: "jwt", ttlMin: 1440 }, focus: ["mech", "ttlMin"] } : n === "refresh" ? { set: { mech: "refresh", ttlMin: 5 }, focus: ["mech", "ttlMin"] } : undefined),
};

// ------------------------------------------------------------------ OAuth flows

export const oauthLab: LabModel = {
  id: "oauth-lab",
  metrics: ["interceptable", "secretOnClient", "passwordShared", "fits", "excessScopes"],
  observes: ["intercepted", "shared"],
  scenes: ["code", "pkce", "creds"],
  runLabel: "Choose the flow",
  honest: [
    "A single-page app or mobile app is a public client: it cannot keep a secret, since anyone can read the code. A server-side web app is confidential. A background job with no user is machine to machine.",
    "The implicit flow returns the token in the redirect URL, where it can be intercepted. The authorization code flow returns a short code that the client trades for a token, but a public client has no secret to prove it is the one who asked, so a stolen code can be redeemed; PKCE adds a one-time proof that closes that. The client-credentials flow has no user and suits machine to machine. The password flow gives the app the user's password, which defeats the point.",
    "The app needs 3 scopes (read profile, read email, post). Asking for more is over-permission; asking for fewer breaks features.",
  ],
  init: (c) => ({ client: (c as { client?: string }).client ?? "spa", flow: "implicit", scopes: 12 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "flow", label: "Flow", options: [{ id: "implicit", label: "Implicit: token in the redirect" }, { id: "code", label: "Authorization code" }, { id: "pkce", label: "Authorization code with PKCE" }, { id: "creds", label: "Client credentials" }, { id: "password", label: "Resource owner password" }] }, { kind: "slider", id: "scopes", label: "Scopes requested", min: 1, max: 12, step: 1, fmt: "int" }];
    if (!(c as { lockClient?: boolean }).lockClient) out.push({ kind: "choice", id: "client", label: "Client", options: [{ id: "spa", label: "Single-page app" }, { id: "mobile", label: "Mobile app" }, { id: "web", label: "Server-side web app" }, { id: "m2m", label: "Background service (no user)" }] });
    return out;
  },
  evaluate: (v) => {
    const f = str(v, "flow");
    const c = str(v, "client");
    const pub = c === "spa" || c === "mobile";
    const inter = f === "implicit" ? 1 : f === "code" && pub ? 1 : 0;
    const secret = f === "code" && pub ? 1 : 0;
    const pass = f === "password" ? 1 : 0;
    const fits = c === "m2m" ? (f === "creds" ? 1 : 0) : f === "creds" ? 0 : f === "pkce" ? 1 : f === "code" && !pub ? 1 : 0;
    const scopes = Math.round(num(v, "scopes"));
    const excess = Math.max(0, scopes - 3);
    const fitsAll = fits && scopes >= 3 ? 1 : 0;
    return {
      metrics: { interceptable: inter, secretOnClient: secret, passwordShared: pass, fits: fitsAll, excessScopes: excess },
      readouts: [
        { label: "Token or code can be intercepted", value: inter ? "yes" : "no", tone: inter ? "alert" : "ok" },
        { label: "Needs a secret the client cannot keep", value: secret ? "yes" : "no", tone: secret ? "alert" : "ok" },
        { label: "App sees the user's password", value: pass ? "yes" : "no", tone: pass ? "alert" : "ok" },
        { label: "Scopes beyond what is needed", value: excess, fmt: "int", tone: excess ? "warn" : "ok" },
        { label: "Right flow for this client", value: fitsAll ? "yes" : "no", tone: fitsAll ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Intercept risk", value: inter, tone: inter ? "alert" : "ok" }, { label: "Password exposed", value: pass, tone: pass ? "alert" : "ok" }, { label: "Excess scopes", value: excess, tone: excess ? "warn" : "ok" }] },
      notes: [f === "pkce" ? "A one-time proof ties the code to the app that asked for it." : f === "implicit" ? "Tokens in URLs end up in history, logs and referrers." : f === "password" ? "The user gives their password to every app that asks." : f === "creds" ? "No user is involved, so this is only for services." : pub ? "Without a client secret, a stolen code can be redeemed by anyone." : "A server can keep its secret, so the plain code flow is fine."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.interceptable! > 0) ev.push("intercepted");
    if (out.metrics.passwordShared! > 0) ev.push("shared");
    return ev;
  },
  scene: (n): SceneOut => (n === "code" ? { set: { flow: "code" }, focus: ["flow"] } : n === "pkce" ? { set: { flow: "pkce" }, focus: ["flow"] } : n === "creds" ? { set: { flow: "creds", client: "m2m" }, focus: ["flow"] } : undefined),
};

// ------------------------------------------------------------------ OWASP risks

const OWASP: Record<string, { label: string; risk: number; days: number }> = {
  inject: { label: "Parameterised queries", risk: 1.2, days: 2 },
  xss: { label: "Escape output and set a content security policy", risk: 0.9, days: 3 },
  auth: { label: "Rate limit and lock out login guessing", risk: 0.8, days: 2 },
  deps: { label: "Scan and update vulnerable dependencies", risk: 0.7, days: 1 },
  csrf: { label: "Anti-forgery tokens and SameSite cookies", risk: 0.5, days: 2 },
  headers: { label: "Secure configuration and headers", risk: 0.3, days: 1 },
  logs: { label: "Security logging and alerts", risk: 0.2, days: 3 },
};

export const owaspLab: LabModel = {
  id: "owasp-lab",
  metrics: ["breachesPerYear", "engineerDays", "open"],
  observes: ["sqli-open", "xss-open"],
  scenes: ["inject", "xss", "triage"],
  runLabel: "Harden the app",
  honest: [
    "An app with seven common weaknesses, each with a likely number of breaches a year if left open: injection 1.2, cross-site scripting 0.9, credential guessing 0.8, vulnerable dependencies 0.7, cross-site request forgery 0.5, misconfiguration 0.3 and missing detection 0.2. Fixing one removes its share. Each fix costs engineer days: 2, 3, 2, 1, 2, 1 and 3.",
    "These figures are invented for the exercise, but their order follows what incident reports show: injection and broken access control and weak authentication are the common ones.",
    "Expected breaches add up; they are not a forecast for any real app.",
  ],
  init: () => ({ inject: false, xss: false, auth: false, deps: false, csrf: false, headers: false, logs: false }),
  controls: () => Object.entries(OWASP).map(([id, t]) => ({ kind: "toggle" as const, id, label: t.label, detail: `${t.days} engineer-days` })),
  evaluate: (v) => {
    let risk = 0;
    let days = 0;
    let open = 0;
    for (const [id, t] of Object.entries(OWASP)) {
      if (bool(v, id)) days += t.days;
      else {
        risk += t.risk;
        open++;
      }
    }
    return {
      metrics: { breachesPerYear: risk, engineerDays: days, open },
      readouts: [
        { label: "Expected breaches a year", value: risk, fmt: "num", tone: tone(risk, 0.5, 2) },
        { label: "Engineer-days spent", value: days, fmt: "int" },
        { label: "Weaknesses still open", value: open, fmt: "int", tone: open > 2 ? "warn" : "ok" },
      ],
      view: { kind: "bars", fmt: "num", bars: Object.entries(OWASP).map(([id, t]) => ({ label: t.label.split(" ").slice(0, 3).join(" "), value: bool(v, id) ? 0 : t.risk, tone: bool(v, id) ? ("ok" as Tone) : ("alert" as Tone) })) },
      notes: [risk > 3 ? "Most of the common holes are open." : risk > 0.5 ? "The big ones are closed, and plenty of smaller risks remain." : "What is left is small, and the time went where the risk was."],
    };
  },
  events: (v) => {
    const ev: string[] = [];
    if (!bool(v, "inject")) ev.push("sqli-open");
    if (!bool(v, "xss")) ev.push("xss-open");
    return ev;
  },
  scene: (n): SceneOut => (n === "inject" ? { set: { inject: false }, focus: ["inject"] } : n === "xss" ? { set: { xss: false }, focus: ["xss"] } : n === "triage" ? { set: { inject: true, xss: true, auth: true, deps: true, csrf: true }, focus: ["inject"] } : undefined),
};

// ------------------------------------------------------------------ secrets

export const secretsLab: LabModel = {
  id: "secrets-lab",
  metrics: ["exposureHours", "damageUsd", "blast"],
  observes: ["costly-leak", "found-late"],
  scenes: ["scan", "rotate", "scope"],
  runLabel: "Plan for the leak",
  honest: [
    "A cloud key is committed to a public repository. Attackers find it within minutes and use it for $2,000 an hour at full scope. Exposure is how long the key keeps working: the time to notice the leak plus the time to cut it off, capped by how long the key is valid.",
    "Without scanning, a leak is noticed after about 90 days (2,160 hours), by the bill or a breach report; with commit scanning it takes 6 minutes. Cutting off by hand takes 4 hours; dynamic credentials issued for an hour by a secrets manager cut themselves off (hourly keys without a manager are really rotated monthly by hand). Keys never rotated stay valid forever; yearly, monthly and hourly keys are valid for 8,760, 720 and 1 hours.",
    "Scope sets what the key can reach: administrator 100% of resources, a service role 30%, least privilege 5%. Damage is exposure × $2,000 × scope.",
  ],
  init: () => ({ store: "code", rotation: "never", scope: "admin", scan: false }),
  controls: () => [
    { kind: "choice", id: "store", label: "Where the secret lives", options: [{ id: "code", label: "In the code or config file" }, { id: "env", label: "In an environment variable" }, { id: "vault", label: "In a secrets manager, fetched at runtime" }] },
    { kind: "choice", id: "rotation", label: "How long a key is valid", options: [{ id: "never", label: "Never rotated" }, { id: "yearly", label: "A year" }, { id: "monthly", label: "A month" }, { id: "hourly", label: "An hour, issued dynamically" }] },
    { kind: "choice", id: "scope", label: "What the key can do", options: [{ id: "admin", label: "Administrator" }, { id: "service", label: "The service's role" }, { id: "least", label: "Only what this job needs" }] },
    { kind: "toggle", id: "scan", label: "Scan every commit and alert on secrets" },
  ],
  evaluate: (v) => {
    const detect = bool(v, "scan") ? 0.1 : 2160;
    const dynamic = str(v, "rotation") === "hourly" && str(v, "store") === "vault";
    const valid = dynamic ? 1 : ({ never: Infinity, yearly: 8760, monthly: 720, hourly: 720 } as Record<string, number>)[str(v, "rotation")]!;
    const respond = dynamic ? 0 : 4;
    const exposure = Math.min(detect + respond, valid);
    const blast = ({ admin: 1, service: 0.3, least: 0.05 } as Record<string, number>)[str(v, "scope")]!;
    const dmg = exposure * 2000 * blast;
    return {
      metrics: { exposureHours: exposure, damageUsd: dmg, blast },
      readouts: [
        { label: "Hours the leaked key works", value: exposure, fmt: "num", tone: tone(exposure, 24, 500) },
        { label: "Share of resources it reaches", value: blast, fmt: "pct", tone: blast > 0.5 ? "alert" : "ok" },
        { label: "Damage from the leak", value: dmg, fmt: "usd", tone: tone(dmg, 5000, 100000) },
      ],
      view: { kind: "bars", fmt: "usd", bars: [{ label: "Damage", value: dmg, tone: tone(dmg, 5000, 100000) }] },
      notes: [str(v, "store") === "code" ? "A secret in code is in every clone, build log and backup of the repository." : bool(v, "scan") ? "The leak is caught in minutes, so the key barely gets used." : "Nobody knows the key is out until the bill or a stranger tells them."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.damageUsd! > 50000) ev.push("costly-leak");
    if (out.metrics.exposureHours! > 1000) ev.push("found-late");
    return ev;
  },
  scene: (n): SceneOut => (n === "scan" ? { set: { scan: true }, focus: ["scan"] } : n === "rotate" ? { set: { rotation: "hourly", store: "vault" }, focus: ["rotation"] } : n === "scope" ? { set: { scope: "least" }, focus: ["scope"] } : undefined),
};

// ------------------------------------------------------------------ multi-tenant isolation

const TENANT: Record<string, { label: string; leak: number; noisy: number; cost: number; max: number }> = {
  column: { label: "Shared tables, a tenant_id column checked by the app", leak: 8, noisy: 40, cost: 2, max: 1000000 },
  rls: { label: "Shared tables, row-level security in the database", leak: 0.3, noisy: 40, cost: 2, max: 1000000 },
  schema: { label: "A schema per tenant", leak: 0.2, noisy: 25, cost: 8, max: 5000 },
  database: { label: "A database per tenant", leak: 0.05, noisy: 3, cost: 60, max: 500 },
};

export const tenantLab: LabModel = {
  id: "tenant-lab",
  metrics: ["leaksPerYear", "noisyImpactPct", "costPerTenant", "supported"],
  observes: ["leak-seen", "unsupported"],
  scenes: ["column", "rls", "database"],
  runLabel: "Choose the isolation",
  honest: [
    "A SaaS product with many tenants. Leaks are cross-tenant exposures a year: with an app-enforced tenant_id column, one query in a few hundred forgets the filter, about 8 leaks a year; with database-enforced row-level security, 0.3; separate schemas, 0.2; separate databases, 0.05.",
    "Noisy neighbour is the percentage a single tenant's tenfold load slows the others: 40% on shared tables, 25% with schemas, 3% with separate databases. Per-tenant quotas cut it by 80%. Cost per tenant a month: $2, $2, $8 and $60. Operations limit schemas to about 5,000 tenants and databases to about 500.",
    "Round figures for comparison.",
  ],
  init: (c) => ({ model: "column", quota: false, tenants: (c as { tenants?: number }).tenants ?? 20000 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "model", label: "Isolation", options: Object.entries(TENANT).map(([id, t]) => ({ id, label: t.label })) }, { kind: "toggle", id: "quota", label: "Per-tenant quotas on requests and storage" }];
    if (!(c as { lockTenants?: boolean }).lockTenants) out.push({ kind: "slider", id: "tenants", label: "Tenants", min: 100, max: 1000000, log: true, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const t = TENANT[str(v, "model")]!;
    const n = Math.round(num(v, "tenants"));
    const noisy = t.noisy * (bool(v, "quota") ? 0.2 : 1);
    const ok = n <= t.max ? 1 : 0;
    return {
      metrics: { leaksPerYear: t.leak, noisyImpactPct: noisy / 100, costPerTenant: t.cost, supported: ok },
      readouts: [
        { label: "Cross-tenant leaks a year", value: t.leak, fmt: "num", tone: tone(t.leak, 0.5, 2) },
        { label: "Slowdown from one tenant's tenfold load", value: noisy / 100, fmt: "pct", tone: tone(noisy / 100, 0.1, 0.3) },
        { label: "Cost per tenant a month", value: t.cost, fmt: "usd" },
        { label: "Operable at this tenant count", value: ok ? "yes" : "no", tone: ok ? "ok" : "alert" },
      ],
      view: { kind: "bars", fmt: "num", bars: [{ label: "Leaks a year", value: t.leak, tone: tone(t.leak, 0.5, 2) }, { label: "Noisy neighbour, percent", value: noisy, tone: tone(noisy / 100, 0.1, 0.3) }] },
      notes: [!ok ? "Fine for fewer tenants; this many cannot be migrated, backed up and monitored one by one." : str(v, "model") === "column" ? "Every query has to remember the filter, and one day one will not." : str(v, "model") === "rls" ? "The database enforces the filter, so a forgotten WHERE clause leaks nothing." : "Strong walls, with a bill and an operations load that grow per tenant."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.leaksPerYear! > 2) ev.push("leak-seen");
    if (out.metrics.supported! < 1) ev.push("unsupported");
    return ev;
  },
  scene: (n): SceneOut => (n === "column" ? { set: { model: "column" }, focus: ["model"] } : n === "rls" ? { set: { model: "rls", quota: true }, focus: ["model", "quota"] } : n === "database" ? { set: { model: "database" }, focus: ["model"] } : undefined),
};

// ------------------------------------------------------------------ breach boss

export const breachLab: LabModel = {
  id: "breach-lab",
  metrics: ["exposureH", "recordsExposed", "usersNotified", "lockedOut", "persists"],
  observes: [],
  scenes: ["detect", "contain", "scope"],
  runLabel: "Respond to the breach",
  honest: [
    "A leaked cloud key is used to copy customer data at 40,000 records an hour. The company has 2 million users and 200,000 signed in. Five simplified models run together: detection, containment, blast radius, forensics and persistence.",
    "Detection: monitoring finds the use in 1 hour, otherwise 30. Containment: revoking at once takes 0.5 hours, watching the attacker first 8, waiting for a decision 24. Blast radius scales records by the tenant isolation: shared tables 100%, row-level security 30%, separate databases 5%.",
    "Forensics: with 90 days of logs you know exactly which records were read and notify only those users; with 7 days you cannot tell, and must notify all 2 million. The attacker persists if you rotate only the leaked key (another may have been copied) or leave sessions valid. Invalidating every session logs out all 200,000 signed-in users.",
  ],
  init: () => ({ monitor: false, contain: "wait", rotate: "one", sessions: "keep", logs: "7", iso: "column" }),
  controls: () => [
    { kind: "toggle", id: "monitor", label: "Alerts on unusual data access" },
    { kind: "choice", id: "contain", label: "On finding it", options: [{ id: "now", label: "Revoke the key at once" }, { id: "watch", label: "Watch the attacker for a while first" }, { id: "wait", label: "Wait for a decision" }] },
    { kind: "choice", id: "rotate", label: "Rotate", options: [{ id: "one", label: "Only the leaked key" }, { id: "all", label: "Every credential the key could reach" }] },
    { kind: "choice", id: "sessions", label: "Signed-in sessions", options: [{ id: "keep", label: "Leave them" }, { id: "kill", label: "Invalidate all" }] },
    { kind: "choice", id: "logs", label: "Access logs kept for", options: [{ id: "7", label: "7 days" }, { id: "90", label: "90 days" }] },
    { kind: "choice", id: "iso", label: "Tenant isolation", options: [{ id: "column", label: "Shared tables, app filter" }, { id: "rls", label: "Row-level security" }, { id: "database", label: "Database per tenant" }] },
  ],
  evaluate: (v) => {
    const detect = bool(v, "monitor") ? 1 : 30;
    const contain = ({ now: 0.5, watch: 8, wait: 24 } as Record<string, number>)[str(v, "contain")]!;
    const exposure = detect + contain;
    const blast = ({ column: 1, rls: 0.3, database: 0.05 } as Record<string, number>)[str(v, "iso")]!;
    const records = Math.min(2e6, exposure * 40000 * blast);
    const notified = str(v, "logs") === "90" ? records : 2e6;
    const locked = str(v, "sessions") === "kill" ? 200000 : 0;
    const persists = str(v, "rotate") === "one" || str(v, "sessions") === "keep" ? 1 : 0;
    return {
      metrics: { exposureH: exposure, recordsExposed: records, usersNotified: notified, lockedOut: locked, persists },
      readouts: [
        { label: "Hours the attacker had access", value: exposure, fmt: "num", tone: tone(exposure, 4, 12) },
        { label: "Records copied", value: records, fmt: "int", tone: tone(records, 50000, 500000) },
        { label: "Users who must be told", value: notified, fmt: "int", tone: tone(notified, 100000, 1000000) },
        { label: "Users signed out", value: locked, fmt: "int" },
        { label: "Attacker keeps a way in", value: persists ? "yes" : "no", tone: persists ? "alert" : "ok" },
      ],
      view: { kind: "bars", fmt: "int", bars: [{ label: "Records copied", value: records, tone: tone(records, 50000, 500000) }, { label: "Users notified", value: notified, tone: tone(notified, 100000, 1000000) }] },
      notes: [persists ? "Something the attacker already holds still works." : "Every door the leaked key could have opened is closed."],
    };
  },
  scene: (n): SceneOut => (n === "detect" ? { set: { monitor: true }, focus: ["monitor"] } : n === "contain" ? { set: { contain: "now", rotate: "all", sessions: "kill" }, focus: ["contain"] } : n === "scope" ? { set: { iso: "rls", logs: "90" }, focus: ["iso", "logs"] } : undefined),
};

export const A12_MODELS: LabModel[] = [authzLab, sessionTokenLab, oauthLab, owaspLab, secretsLab, tenantLab, breachLab];
