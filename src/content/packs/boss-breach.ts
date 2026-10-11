import { defineBoss } from "../define";

export const BREACH = {};

const NIST = { id: "nist-800-61", title: "NIST SP 800-61 Rev. 2: Computer Security Incident Handling Guide", url: "https://csrc.nist.gov/pubs/sp/800/61/r2/final" };
const GDPR33 = { id: "gdpr-33", title: "GDPR Article 33: Notification of a personal data breach to the supervisory authority (72 hours)", url: "https://gdpr-info.eu/art-33-gdpr/" };
const OWASP_SECRETS = { id: "owasp-secrets", title: "OWASP Cheat Sheet Series: Secrets Management", url: "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html" };

export default defineBoss({
  id: "boss-breach",
  title: "Boss: The Breach",
  kind: "boss",
  estimatedMinutes: 20,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "security · unusual bulk reads using the reporting key", detail: "40,000 customer records an hour, from an address nobody recognises" },
    lines: [{ speaker: "pager", line: "A cloud key from the reporting job is copying customer data right now. Two million customers, two hundred thousand signed in." }],
  },
  intro: [
    { speaker: "kabir", line: "Stop the copying fast, keep the number of affected customers small, and do not lock out the whole customer base unless we have to." },
    { speaker: "meera", line: "Detection, containment, how far the key could reach, what the logs can prove, and whether the attacker still has a way in are five separate questions." },
    { speaker: "rao", line: "Every customer we have to notify costs money and trust. Know exactly who was affected, or notify everyone." },
  ],
  forecast: {
    metric: "usersNotified",
    prompt: "Before you act: how many customers will you have to notify if the response stays as it is today?",
    unit: "customers",
    scale: 1,
    min: 1000,
    max: 3000000,
    tolerance: 1.5,
  },
  exercises: ["secrets-management", "multi-tenant-isolation", "sessions-vs-jwt", "oauth-oidc"],
  challenge: {
    id: "contain-breach",
    title: "Contain the breach",
    brief: "A leaked key is copying 40,000 records an hour. Choose detection, containment, rotation scope, sessions, log retention and tenant isolation so the attacker has access for at most 4 hours, at most 50,000 records are copied, at most 100,000 customers must be notified, at most 250,000 sessions are cut, and the attacker keeps no way in.",
    line: { speaker: "meera", line: "Each step you took before today decides what you can do now." },
    widget: { id: "breach-lab", config: BREACH },
    conditions: [
      { metric: "exposureH", op: "<=", value: 4, label: "Attacker access for at most 4 hours" },
      { metric: "recordsExposed", op: "<=", value: 50000, label: "At most 50,000 records copied" },
      { metric: "usersNotified", op: "<=", value: 100000, label: "At most 100,000 customers to notify" },
      { metric: "lockedOut", op: "<=", value: 250000, label: "At most 250,000 sessions cut" },
      { metric: "persists", op: "<=", value: 0, label: "The attacker keeps no way in" },
    ],
    stars: [{ metric: "recordsExposed", op: "<=", value: 20000, label: "At most 20,000 records copied" }],
    hints: [
      "How long does the attacker have before you even know?",
      "What are you giving up by watching the attacker before you cut them off?",
      "What else might the attacker already hold besides the one key?",
    ],
  },
  debrief: [
    { id: "time", text: "Time was the first lever. An alert on unusual reads found the use in an hour instead of thirty, and revoking at once, instead of watching or waiting, cut the rest. Together they took the attacker's access from over two days to an hour and a half.", derived: true },
    { id: "reach", text: "Isolation set how much each hour was worth. With shared tables the key reached every customer's rows; with row-level security each hour copied less than a third as many records.", sourceIds: ["owasp-secrets"] },
    { id: "proof", text: "Ninety days of access logs let the team name the exact records read and notify only those customers. With seven days of logs they could not prove what was untouched and would have had to notify everyone.", sourceIds: ["nist-800-61", "gdpr-33"] },
    { id: "door", text: "Rotating every credential the key could reach and invalidating sessions closed the other doors. Rotating one key leaves a copied one working, and logging everyone out is a cost the team chose to pay once.", derived: true },
  ],
  outro: { speaker: "kabir", line: "We told eighteen thousand customers, not two million, and the attacker was out in ninety minutes. I would like to make the next one a drill." },
  explainBack: {
    prompt: "Walk Kabir through the response: what you changed, why, and what each choice cost.",
    rubric: [
      { id: "fast", criterion: "Alert on unusual access so detection takes about an hour, and revoke at once rather than watching or waiting", keyIdea: "detect and contain fast" },
      { id: "radius", criterion: "Tenant isolation and least privilege limit how many records each hour of access can copy", keyIdea: "limit the blast radius" },
      { id: "proof", criterion: "Long access-log retention lets you identify exactly who was affected and notify only them", keyIdea: "logs to prove scope" },
      { id: "doors", criterion: "Rotate every credential the key could reach and invalidate sessions so the attacker keeps no other way in", keyIdea: "close every door" },
    ],
    exemplar:
      "Alerts on unusual bulk reads found the use in an hour, and I revoked the key at once instead of watching the attacker, so access lasted about ninety minutes. Row-level security meant each hour copied under a third as many records as shared tables would have. Ninety days of access logs let us name the exact records read and notify only those customers. I rotated every credential the key could reach and invalidated all sessions, accepting that two hundred thousand people would sign in again, so the attacker kept no other way in.",
  },
  honestPhysics: [
    "A leaked cloud key copies customer data at 40,000 records an hour. The company has 2 million users and 200,000 signed in. Five simplified models run together: detection, containment, blast radius, forensics and persistence.",
    "Monitoring finds the use in 1 hour, otherwise 30. Revoking at once takes 0.5 hours, watching the attacker first 8, waiting for a decision 24. Records copied scale by tenant isolation: shared tables 100%, row-level security 30%, separate databases 5%.",
    "With 90 days of logs you notify only affected users; with 7 days you cannot tell, and notify everyone. Rotating only the leaked key, or leaving sessions valid, lets the attacker persist.",
  ],
  sources: [NIST, GDPR33, OWASP_SECRETS],
  verify: [
    { id: "default", claim: "Today's setup exposes everything and notifies 2 million customers", run: "lab", params: { model: "breach-lab", config: BREACH, values: {}, metric: "usersNotified" }, expect: { min: 2000000, max: 2000000 } },
    { id: "default-time", claim: "…with the attacker inside for 54 hours", run: "lab", params: { model: "breach-lab", config: BREACH, values: {}, metric: "exposureH" }, expect: { min: 54, max: 54 } },
    { id: "good-time", claim: "Alerts and an immediate revoke cut access to 1.5 hours", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "now" }, metric: "exposureH" }, expect: { max: 4 } },
    { id: "good-records", claim: "With row-level security, 18,000 records are copied", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "now", iso: "rls", logs: "90", rotate: "all", sessions: "kill" }, metric: "recordsExposed" }, expect: { max: 20000 } },
    { id: "shared-records", claim: "With shared tables it would be 60,000", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "now", iso: "column", logs: "90", rotate: "all", sessions: "kill" }, metric: "recordsExposed" }, expect: { min: 50000 } },
    { id: "short-logs", claim: "With 7 days of logs everyone must be notified", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "now", iso: "rls", logs: "7", rotate: "all", sessions: "kill" }, metric: "usersNotified" }, expect: { min: 2000000 } },
    { id: "persist", claim: "Rotating one key leaves the attacker a way in", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "now", iso: "rls", logs: "90", rotate: "one", sessions: "kill" }, metric: "persists" }, expect: { min: 1 } },
    { id: "watch", claim: "Watching the attacker for 8 hours copies over 100,000 records", run: "lab", params: { model: "breach-lab", config: BREACH, values: { monitor: true, contain: "watch", iso: "rls", logs: "90", rotate: "all", sessions: "kill" }, metric: "recordsExposed" }, expect: { min: 100000 } },
  ],
});
