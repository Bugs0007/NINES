/**
 * Chapter B10 "Security for LLM apps" models: direct prompt injection, indirect injection through retrieved content,
 * exfiltration through tools, and least-privilege tool design. Closed forms with labelled round constants.
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ direct prompt injection

const ATTACK = { naive: 0.45, crafted: 0.7, adaptive: 0.9 } as const;
const DEFENCE = {
  harden: { naive: 0.35, crafted: 0.75, adaptive: 0.9, fr: 0.008 },
  delimit: { naive: 0.5, crafted: 0.7, adaptive: 0.85, fr: 0.002 },
  classify: { naive: 0.15, crafted: 0.45, adaptive: 0.7, fr: 0.015 },
  output: { naive: 0.3, crafted: 0.35, adaptive: 0.45, fr: 0.01 },
} as const;

export function injectRun(attacker: keyof typeof ATTACK, d: Record<keyof typeof DEFENCE, boolean>, secrets: boolean) {
  let asr = ATTACK[attacker];
  let fr = 0;
  for (const k of Object.keys(DEFENCE) as (keyof typeof DEFENCE)[]) {
    if (d[k]) {
      asr *= DEFENCE[k][attacker];
      fr += DEFENCE[k].fr;
    }
  }
  const impact = secrets ? 10 : 1;
  return { asr, fr, loss: asr * impact, lat: (d.classify ? 150 : 0) + (d.output ? 100 : 0) };
}

export const injectLab: LabModel = {
  id: "inject-lab",
  metrics: ["attackSuccess", "falseRefusal", "expectedLoss", "addedMs"],
  observes: ["adaptive-wins", "secret-leak"],
  scenes: ["layers", "secrets", "adaptive"],
  runLabel: "Defend the prompt",
  honest: [
    "A support bot whose user input is untrusted. Three attackers try to override its instructions: a naive one pasting 'ignore previous instructions' (succeeds 45% of the time against an undefended bot), a crafted one using role-play and encoding tricks (70%), and an adaptive one that tests variants against your defences (90%).",
    "Four defences, each multiplying the attack's success by a factor that depends on the attacker: hardening the system prompt (0.35, 0.75, 0.9), marking user text as data with delimiters (0.5, 0.7, 0.85), an input classifier (0.15, 0.45, 0.7), and an output check for leaked instructions or secrets (0.3, 0.35, 0.45). Each also refuses some legitimate requests (0.8%, 0.2%, 1.5% and 1%). Layers are treated as independent.",
    "Expected loss is success rate times impact: 1 if the prompt holds nothing sensitive, 10 if it holds secrets, keys or private data. Round figures.",
  ],
  init: () => ({ attacker: "naive", harden: false, delimit: false, classify: false, output: false, secrets: true }),
  controls: () => [
    { kind: "choice", id: "attacker", label: "Attacker", options: [{ id: "naive", label: "Naive: 'ignore previous instructions'" }, { id: "crafted", label: "Crafted: role-play and encoding tricks" }, { id: "adaptive", label: "Adaptive: probes your defences" }] },
    { kind: "toggle", id: "harden", label: "Harden the system prompt" },
    { kind: "toggle", id: "delimit", label: "Mark user text as data (delimiters)" },
    { kind: "toggle", id: "classify", label: "Classify the input before the model sees it" },
    { kind: "toggle", id: "output", label: "Check the output for leaked secrets" },
    { kind: "toggle", id: "secrets", label: "Secrets and private data sit in the prompt" },
  ],
  evaluate: (v) => {
    const r = injectRun(str(v, "attacker") as keyof typeof ATTACK, { harden: bool(v, "harden"), delimit: bool(v, "delimit"), classify: bool(v, "classify"), output: bool(v, "output") }, bool(v, "secrets"));
    return {
      metrics: { attackSuccess: r.asr, falseRefusal: r.fr, expectedLoss: r.loss, addedMs: r.lat },
      readouts: [
        { label: "Attacks that succeed", value: r.asr, fmt: "pct", tone: tone(r.asr, 0.1, 0.3) },
        { label: "Legitimate requests refused", value: r.fr, fmt: "pct", tone: tone(r.fr, 0.02, 0.04) },
        { label: "Expected loss", value: r.loss, fmt: "num", sub: "success × impact", tone: tone(r.loss, 0.3, 1) },
        { label: "Added latency", value: r.lat, fmt: "ms" },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Attack succeeds", value: r.asr, tone: tone(r.asr, 0.1, 0.3) }, { label: "Legitimate refused", value: r.fr, tone: tone(r.fr, 0.02, 0.04) }] },
      notes: [r.asr > 0.5 ? "Most attempts work." : str(v, "attacker") === "adaptive" && r.asr > 0.2 ? "An adaptive attacker finds the gaps in a stack of filters." : "The stack holds against this attacker."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "attacker") === "adaptive" && out.metrics.attackSuccess! > 0.2 && (bool(v, "harden") || bool(v, "delimit") || bool(v, "classify") || bool(v, "output"))) ev.push("adaptive-wins");
    if (bool(v, "secrets") && out.metrics.attackSuccess! > 0.3) ev.push("secret-leak");
    return ev;
  },
  scene: (n): SceneOut => (n === "layers" ? { set: { harden: true, delimit: true, classify: true, output: true }, focus: ["classify", "output"] } : n === "secrets" ? { set: { secrets: false }, focus: ["secrets"] } : n === "adaptive" ? { set: { attacker: "adaptive" }, focus: ["attacker"] } : undefined),
};

// ------------------------------------------------------------------ indirect injection

const SRC = { internal: 0.0001, uploads: 0.002, web: 0.01 } as const;

export function indirectRun(source: keyof typeof SRC, k: number, spot: boolean, filter: boolean, taint: boolean, dual: boolean) {
  const poisoned = 1 - (1 - SRC[source]) ** k;
  let follow = 0.5;
  if (spot) follow *= 0.6;
  if (filter) follow *= 0.5;
  if (dual) follow *= 0.1;
  const hijack = poisoned * follow;
  const harm = hijack * (taint ? 0.1 : 1);
  const recall = Math.min(1, 0.8 + 0.03 * k);
  const utility = recall * (taint ? 0.93 : 1) * (dual ? 0.85 : 1) * (filter ? 0.98 : 1);
  return { poisoned, hijack, harm, utility };
}

export const indirectLab: LabModel = {
  id: "indirect-lab",
  metrics: ["poisonedRetrieval", "hijackRate", "harmRate", "utility"],
  observes: ["poisoned", "contained"],
  scenes: ["web", "spotlight", "taint"],
  runLabel: "Defend the pipeline",
  honest: [
    "An assistant that retrieves k documents and answers from them, with tools that can act (send mail, write records). A document written by an attacker can contain instructions the model may follow: indirect prompt injection. The chance a retrieved document is poisoned depends on where it came from: 0.01% of internal documents, 0.2% of user uploads, 1% of public web pages. With k documents, the chance at least one is poisoned is 1 − (1 − p)^k.",
    "If a poisoned document is in the context, the model follows it 50% of the time. Marking retrieved text as untrusted data cuts that by 40%; a sanitiser that strips instruction-like text halves it (and drops 2% of useful content); a dual-model design, where a privileged model never sees untrusted text, cuts it by 90% but costs 15% of capability. Tainting, which disables write tools once untrusted text is in context, cuts the harm of a hijack by 90% at a cost of 7% of tasks.",
    "Fewer documents are less exposure and less recall: retrieval recall is 80% plus 3 points per document, up to 100%. Round figures.",
  ],
  init: () => ({ source: "internal", k: 8, spot: false, filter: false, taint: false, dual: false }),
  controls: () => [
    { kind: "choice", id: "source", label: "Where documents come from", options: [{ id: "internal", label: "Internal documents only" }, { id: "uploads", label: "User uploads" }, { id: "web", label: "The public web" }] },
    { kind: "slider", id: "k", label: "Documents retrieved per question", min: 1, max: 20, step: 1, fmt: "int" },
    { kind: "toggle", id: "spot", label: "Mark retrieved text as untrusted data" },
    { kind: "toggle", id: "filter", label: "Strip instruction-like text from documents" },
    { kind: "toggle", id: "taint", label: "Disable write tools once untrusted text is in context" },
    { kind: "toggle", id: "dual", label: "Quarantine: a privileged model never sees untrusted text" },
  ],
  evaluate: (v) => {
    const r = indirectRun(str(v, "source") as keyof typeof SRC, Math.round(num(v, "k")), bool(v, "spot"), bool(v, "filter"), bool(v, "taint"), bool(v, "dual"));
    return {
      metrics: { poisonedRetrieval: r.poisoned, hijackRate: r.hijack, harmRate: r.harm, utility: r.utility },
      readouts: [
        { label: "Questions retrieving a poisoned document", value: r.poisoned, fmt: "pct", tone: tone(r.poisoned, 0.01, 0.05) },
        { label: "Questions where the model is hijacked", value: r.hijack, fmt: "pct", tone: tone(r.hijack, 0.003, 0.02) },
        { label: "Questions that end in a harmful action", value: r.harm, fmt: "pct", tone: tone(r.harm, 0.001, 0.005) },
        { label: "Useful answers", value: r.utility, fmt: "pct", tone: toneLow(r.utility, 0.9, 0.8) },
      ],
      view: { kind: "bars", fmt: "pct", max: 0.15, bars: [{ label: "Poisoned document retrieved", value: r.poisoned, tone: tone(r.poisoned, 0.01, 0.05) }, { label: "Hijacked", value: r.hijack, tone: tone(r.hijack, 0.003, 0.02) }, { label: "Harmful action", value: r.harm, tone: tone(r.harm, 0.001, 0.005) }] },
      notes: [r.harm > 0.005 ? "Reading the open web with write tools attached is a standing invitation." : "The attack is contained, and some capability paid for it."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (str(v, "source") === "web" && out.metrics.poisonedRetrieval! > 0.05) ev.push("poisoned");
    if (out.metrics.harmRate! < 0.001 && str(v, "source") === "web") ev.push("contained");
    return ev;
  },
  scene: (n): SceneOut => (n === "web" ? { set: { source: "web", k: 10 }, focus: ["source", "k"] } : n === "spotlight" ? { set: { spot: true, filter: true }, focus: ["spot", "filter"] } : n === "taint" ? { set: { taint: true }, focus: ["taint"] } : undefined),
};

// ------------------------------------------------------------------ exfiltration

const CH = { img: 0.9, fetch: 0.85, mail: 0.8, link: 0.1 };

export function exfilRun(f: { img: boolean; fetch: boolean; mail: boolean }, d: { csp: boolean; allow: boolean; approve: boolean; strip: boolean; dlp: boolean }) {
  const open = {
    img: f.img && !d.csp && !d.strip,
    fetch: f.fetch && !d.allow,
    mail: f.mail && !d.approve,
    link: !d.strip,
  };
  let safe = 1;
  const chans: string[] = [];
  for (const k of Object.keys(CH) as (keyof typeof CH)[]) {
    if (open[k]) {
      safe *= 1 - CH[k] * (d.dlp ? 0.4 : 1);
      chans.push(k);
    }
  }
  const leak = 1 - safe;
  const approvals = (d.approve && f.mail ? 6 : 0) + (d.approve && f.fetch && !d.allow ? 9 : 0);
  const utility = (d.strip ? 0.97 : 1) * (d.allow && f.fetch ? 0.98 : 1) * (d.csp && f.img ? 0.98 : 1) * (d.approve && f.mail ? 0.97 : 1);
  return { leak, open: chans.length, approvals, utility };
}

export const exfilLab: LabModel = {
  id: "exfil-lab",
  metrics: ["leakProb", "openChannels", "approvalsPer100", "utility"],
  observes: ["image-leak", "sealed"],
  scenes: ["image", "allowlist", "approval"],
  runLabel: "Seal the channels",
  honest: [
    "A hijacked assistant that holds a secret (a customer record) can only hurt you if it can get the data out. Channels: a markdown image whose URL carries the data (the browser fetches it automatically, 90% likely to work), an HTTP fetch tool that can call any URL (85%), a mail tool (80%) and a link the user might click (10%). Each channel works only if the product has the feature and no control closes it.",
    "Controls: a content security policy that only allows images from your own domain closes the image channel; an allowlist of outbound domains closes the fetch tool; approval by a person for outbound mail closes the mail channel (about 6 approvals per 100 sessions); stripping URLs and images from model output closes images and links at a 3% cost in useful output. A data-loss scan on whatever remains cuts each channel's success by 60%.",
    "Round figures. The aim is to show that exfiltration needs a channel, and that removing channels beats guessing intent.",
  ],
  init: () => ({ img: true, fetch: true, mail: true, csp: false, allow: false, approve: false, strip: false, dlp: false }),
  controls: () => [
    { kind: "toggle", id: "img", label: "Product renders markdown images from model output" },
    { kind: "toggle", id: "fetch", label: "Agent has a tool that fetches any URL" },
    { kind: "toggle", id: "mail", label: "Agent can send email" },
    { kind: "toggle", id: "csp", label: "Only load images from our own domain" },
    { kind: "toggle", id: "allow", label: "Allowlist outbound domains for the fetch tool" },
    { kind: "toggle", id: "approve", label: "A person approves outbound email" },
    { kind: "toggle", id: "strip", label: "Strip URLs and images from model output" },
    { kind: "toggle", id: "dlp", label: "Scan outbound data for sensitive content" },
  ],
  evaluate: (v) => {
    const r = exfilRun({ img: bool(v, "img"), fetch: bool(v, "fetch"), mail: bool(v, "mail") }, { csp: bool(v, "csp"), allow: bool(v, "allow"), approve: bool(v, "approve"), strip: bool(v, "strip"), dlp: bool(v, "dlp") });
    return {
      metrics: { leakProb: r.leak, openChannels: r.open, approvalsPer100: r.approvals, utility: r.utility },
      readouts: [
        { label: "Chance a hijacked agent gets data out", value: r.leak, fmt: "pct", tone: tone(r.leak, 0.05, 0.3) },
        { label: "Open channels", value: r.open, fmt: "int", tone: tone(r.open, 0, 1) },
        { label: "Approvals per 100 sessions", value: r.approvals, fmt: "int", tone: tone(r.approvals, 10, 20) },
        { label: "Useful output kept", value: r.utility, fmt: "pct", tone: toneLow(r.utility, 0.95, 0.9) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Data gets out", value: r.leak, tone: tone(r.leak, 0.05, 0.3) }] },
      notes: [r.open > 2 ? "Three ways out, and the data only needs one." : r.open === 0 ? "No channel left to carry the data." : "A channel remains."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (bool(v, "img") && !bool(v, "csp") && !bool(v, "strip") && !bool(v, "allow") && !bool(v, "approve")) ev.push("image-leak");
    if (out.metrics.leakProb! < 0.05 && bool(v, "img") && bool(v, "fetch") && bool(v, "mail")) ev.push("sealed");
    return ev;
  },
  scene: (n): SceneOut => (n === "image" ? { set: { img: true, csp: false, strip: false }, focus: ["img", "csp"] } : n === "allowlist" ? { set: { allow: true }, focus: ["allow"] } : n === "approval" ? { set: { approve: true }, focus: ["approve"] } : undefined),
};

// ------------------------------------------------------------------ least privilege

const SCOPES = {
  db: { weight: 0.3, opts: { admin: { risk: 100000, cap: 1 }, own: { risk: 20000, cap: 0.95 }, view: { risk: 3000, cap: 0.8 } } },
  mail: { weight: 0.2, opts: { any: { risk: 40000, cap: 1 }, internal: { risk: 6000, cap: 0.9 }, draft: { risk: 500, cap: 0.7 } } },
  files: { weight: 0.2, opts: { drive: { risk: 50000, cap: 1 }, folder: { risk: 4000, cap: 0.92 }, none: { risk: 0, cap: 0.3 } } },
  pay: { weight: 0.1, opts: { any: { risk: 200000, cap: 1 }, limit: { risk: 2500, cap: 0.9 }, none: { risk: 0, cap: 0.4 } } },
} as const;

export function scopeRun(choice: { db: string; mail: string; files: string; pay: string }, creds: string) {
  let risk = 0;
  let cap = 0.2;
  for (const k of Object.keys(SCOPES) as (keyof typeof SCOPES)[]) {
    const o = (SCOPES[k].opts as Record<string, { risk: number; cap: number }>)[choice[k]]!;
    risk += o.risk;
    cap += SCOPES[k].weight * o.cap;
  }
  const mult = creds === "shared" ? 1 : creds === "user" ? 0.35 : 0.1;
  const capMult = creds === "shared" ? 1 : creds === "user" ? 0.99 : 0.97;
  return { risk: risk * mult, capability: Math.min(1, cap) * capMult };
}

export const scopeLab: LabModel = {
  id: "scope-lab",
  metrics: ["maxLoss", "capability"],
  observes: ["admin-everything", "least-priv"],
  scenes: ["narrow", "creds", "wide"],
  runLabel: "Scope the tools",
  honest: [
    "An agent with four tool families: a database, email, files and payments. For each you choose how much access it gets, and the worst a hijacked agent could do is the sum of what those scopes can reach: for example administrator database access exposes $100,000, tables the user owns $20,000, a read-only view $3,000; sending to anyone $40,000, to internal addresses $6,000, drafts only $500; the whole drive $50,000, one project folder $4,000; payments of any size $200,000, a $50 limit with approval $2,500.",
    "Narrower scopes cut capability a little: the share of tasks the agent can still complete is a weighted sum (database 30%, email 20%, files 20%, payments 10%, and 20% needing no tools). Credentials multiply the exposure: one shared service token keeps all of it, a token per user limits the agent to what that user could do (0.35 of the exposure), and short-lived, per-action tokens limit it to one action (0.1).",
    "Round figures to show the trade: most of the risk can go for a small part of the capability.",
  ],
  init: () => ({ db: "admin", mail: "any", files: "drive", pay: "any", creds: "shared" }),
  controls: () => [
    { kind: "choice", id: "db", label: "Database", options: [{ id: "admin", label: "Administrator" }, { id: "own", label: "Tables the user owns" }, { id: "view", label: "Read-only view" }] },
    { kind: "choice", id: "mail", label: "Email", options: [{ id: "any", label: "Send to anyone" }, { id: "internal", label: "Send to internal addresses" }, { id: "draft", label: "Drafts only, a person sends" }] },
    { kind: "choice", id: "files", label: "Files", options: [{ id: "drive", label: "Whole drive" }, { id: "folder", label: "One project folder" }, { id: "none", label: "No file access" }] },
    { kind: "choice", id: "pay", label: "Payments", options: [{ id: "any", label: "Any amount" }, { id: "limit", label: "Up to $50 with approval" }, { id: "none", label: "None" }] },
    { kind: "choice", id: "creds", label: "Credentials", options: [{ id: "shared", label: "One shared service token" }, { id: "user", label: "The user's own token" }, { id: "short", label: "Short-lived token per action" }] },
  ],
  evaluate: (v) => {
    const r = scopeRun({ db: str(v, "db"), mail: str(v, "mail"), files: str(v, "files"), pay: str(v, "pay") }, str(v, "creds"));
    return {
      metrics: { maxLoss: r.risk, capability: r.capability },
      readouts: [
        { label: "Worst case if the agent is hijacked", value: r.risk, fmt: "usd", tone: tone(r.risk, 10000, 50000) },
        { label: "Tasks the agent can still do", value: r.capability, fmt: "pct", tone: toneLow(r.capability, 0.85, 0.7) },
      ],
      view: { kind: "bars", fmt: "usd", max: 400000, bars: [{ label: "Worst case", value: r.risk, tone: tone(r.risk, 10000, 50000) }] },
      notes: [r.risk > 100000 ? "One hijacked prompt is a company-level incident." : r.capability < 0.7 ? "So tightly scoped that it cannot do the job." : "Enough access to be useful and little enough to survive a mistake."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.maxLoss! > 200000) ev.push("admin-everything");
    if (out.metrics.maxLoss! < 10000 && out.metrics.capability! > 0.85) ev.push("least-priv");
    return ev;
  },
  scene: (n): SceneOut => (n === "narrow" ? { set: { db: "view", mail: "internal", files: "folder", pay: "limit" }, focus: ["db", "mail", "files", "pay"] } : n === "creds" ? { set: { creds: "short" }, focus: ["creds"] } : n === "wide" ? { set: { db: "admin", mail: "any", files: "drive", pay: "any", creds: "shared" }, focus: ["db"] } : undefined),
};

export const B10_MODELS: LabModel[] = [injectLab, indirectLab, exfilLab, scopeLab];
