/**
 * Chapters C3 and C4 "Git, CI/CD and infrastructure as code" models: the commit DAG and reachability, merge versus
 * rebase, reset modes, reflog rescues, pipeline design and Terraform-style plan and apply. Small deterministic rules
 * with labelled round constants (see each model's `honest` text).
 */
import { bool, num, str, type Control, type LabModel, type Tone } from "../types";

type SceneOut = { set?: Record<string, number | string | boolean>; focus?: string[] } | undefined;
const tone = (x: number, warn: number, alert: number): Tone => (x > alert ? "alert" : x > warn ? "warn" : "ok");
const toneLow = (x: number, warn: number, alert: number): Tone => (x < alert ? "alert" : x < warn ? "warn" : "ok");

// ------------------------------------------------------------------ the commit DAG

export function dagRun(branch: boolean, tag: boolean, remote: boolean, days: number, gc: boolean) {
  const refd = branch || tag || remote;
  const viaReflog = !gc && days <= 30;
  const recoverable = refd || viaReflog;
  const lost = recoverable ? 0 : 3;
  const noise = (tag ? 0.5 : 0) + (remote ? 1 : 0);
  return { reachable: refd ? 3 : 0, recoverable: recoverable ? 3 : 0, lost, noise };
}

export const dagLab: LabModel = {
  id: "dag-lab",
  metrics: ["reachableCommits", "recoverableCommits", "lostCommits", "sharedNoise"],
  observes: ["orphaned", "gone"],
  scenes: ["branch", "tag", "gc"],
  runLabel: "Keep the commits",
  honest: [
    "Git stores history as a graph of commits, each pointing to its parent. A branch, a tag and a remote-tracking branch are only names pointing at a commit: 41 bytes each. A commit is reachable if some name can reach it by following parents; the garbage collector deletes unreachable commits after a grace period.",
    "You made three commits (E, F, G) on a detached HEAD and then switched back to main. No name points at G. The reflog, a local diary of where HEAD has been, still lists it for 30 days, so it can be recovered until then unless gc has been run with an immediate prune. A branch or tag keeps it reachable for good. A tag clutters the tag list (noise 0.5) and a pushed branch is visible to the whole team (noise 1).",
    "Round figures for the shape of the rule.",
  ],
  init: () => ({ branch: false, tag: false, remote: false, days: 5, gc: false }),
  controls: (c) => {
    const out: Control[] = [
      { kind: "toggle", id: "branch", label: "Create a local branch at G" },
      { kind: "toggle", id: "tag", label: "Tag G" },
      { kind: "toggle", id: "remote", label: "Push G to the shared remote" },
    ];
    if (!(c as { lockTime?: boolean }).lockTime) out.push({ kind: "slider", id: "days", label: "Days later", min: 0, max: 120, step: 1, fmt: "int" }, { kind: "toggle", id: "gc", label: "gc has pruned unreachable commits" });
    return out;
  },
  evaluate: (v) => {
    const r = dagRun(bool(v, "branch"), bool(v, "tag"), bool(v, "remote"), num(v, "days"), bool(v, "gc"));
    return {
      metrics: { reachableCommits: r.reachable, recoverableCommits: r.recoverable, lostCommits: r.lost, sharedNoise: r.noise },
      readouts: [
        { label: "Commits reachable from a name", value: r.reachable, fmt: "int", tone: r.reachable ? "ok" : "warn" },
        { label: "Commits you can still get back", value: r.recoverable, fmt: "int", tone: r.recoverable ? "ok" : "alert" },
        { label: "Commits lost for good", value: r.lost, fmt: "int", tone: r.lost ? "alert" : "ok" },
        { label: "Noise added for the team", value: r.noise, fmt: "num", tone: tone(r.noise, 0.5, 0.9) },
      ],
      view: { kind: "steps", steps: [{ label: "main", value: "A – B – C – D", tone: "info" }, { label: "detached HEAD", value: r.reachable ? "E – F – G (named)" : "E – F – G (no name)", tone: r.reachable ? "ok" : "warn" }, { label: "After gc", value: r.lost ? "E, F, G are deleted" : "E, F, G are kept", tone: r.lost ? "alert" : "ok" }] },
      notes: [r.lost ? "Nothing points at the work and the reflog window has closed." : r.reachable ? "A name holds the commits." : "Only the reflog remembers them, and only for a while."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.reachableCommits === 0) ev.push("orphaned");
    if (out.metrics.lostCommits! > 0) ev.push("gone");
    return ev;
  },
  scene: (n): SceneOut => (n === "branch" ? { set: { branch: true }, focus: ["branch"] } : n === "tag" ? { set: { tag: true }, focus: ["tag"] } : n === "gc" ? { set: { gc: true, days: 40 }, focus: ["gc", "days"] } : undefined),
};

// ------------------------------------------------------------------ merge versus rebase

export function mergeRun(strategy: string, shared: boolean, conflicts: number) {
  const linear = strategy === "merge" ? 0 : 1;
  const rewritten = strategy === "rebase" ? 3 : 0;
  const rounds = strategy === "rebase" ? conflicts : conflicts > 0 ? 1 : 0;
  const bisect = strategy === "squash" ? 1 : 3;
  const breaks = strategy === "rebase" && shared ? 1 : 0;
  return { linear, rewritten, rounds, bisect, breaks };
}

export const mergeLab: LabModel = {
  id: "merge-lab",
  metrics: ["linearHistory", "rewrittenCommits", "conflictRounds", "bisectableCommits", "teammateBreakage"],
  observes: ["force-push", "squash-loss"],
  scenes: ["merge", "rebase", "squash"],
  runLabel: "Integrate the branch",
  honest: [
    "A feature branch has three commits (E, F, G) made while main moved on by two. There are three ways to integrate. A merge adds a merge commit with two parents: history stays as it happened, it is not linear, nothing is rewritten, and every conflict is resolved once, in the merge. A rebase replays E, F and G on top of main as new commits (E', F', G'): history is linear, and each replayed commit that conflicts needs its own resolution. A squash merge turns the three into one commit on main: linear and simple, and git bisect can no longer separate them.",
    "Rebase rewrites commits, so if others have based work on this branch, they must reset to the rewritten history and you must force-push: 1 unit of breakage. Bisect granularity is the number of commits you can test individually: 3 for merge and rebase, 1 for squash.",
    "The branch has the number of conflicting commits you set; round figures to compare the strategies.",
  ],
  init: (c) => ({ strategy: "merge", shared: (c as { shared?: boolean }).shared ?? false, conflicts: (c as { conflicts?: number }).conflicts ?? 2 }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "strategy", label: "Integrate with", options: [{ id: "merge", label: "Merge commit" }, { id: "rebase", label: "Rebase, then fast-forward" }, { id: "squash", label: "Squash merge" }] }];
    if (!(c as { lockShared?: boolean }).lockShared) out.push({ kind: "toggle", id: "shared", label: "Others have based work on this branch" });
    if (!(c as { lockConflicts?: boolean }).lockConflicts) out.push({ kind: "slider", id: "conflicts", label: "Feature commits that conflict with main", min: 0, max: 3, step: 1, fmt: "int" });
    return out;
  },
  evaluate: (v) => {
    const r = mergeRun(str(v, "strategy"), bool(v, "shared"), Math.round(num(v, "conflicts")));
    return {
      metrics: { linearHistory: r.linear, rewrittenCommits: r.rewritten, conflictRounds: r.rounds, bisectableCommits: r.bisect, teammateBreakage: r.breaks },
      readouts: [
        { label: "History is linear", value: r.linear ? "yes" : "no, has a merge commit", tone: r.linear ? "ok" : "info" },
        { label: "Commits rewritten", value: r.rewritten, fmt: "int", tone: r.rewritten ? "warn" : "ok" },
        { label: "Times you resolve conflicts", value: r.rounds, fmt: "int", tone: tone(r.rounds, 1, 2) },
        { label: "Commits bisect can test one by one", value: r.bisect, fmt: "int", tone: toneLow(r.bisect, 3, 2) },
        { label: "Teammates left with broken history", value: r.breaks ? "yes" : "no", tone: r.breaks ? "alert" : "ok" },
      ],
      view: { kind: "steps", steps: [{ label: "Result on main", value: str(v, "strategy") === "merge" ? "A B C D + E F G + M" : str(v, "strategy") === "rebase" ? "A B C D E' F' G'" : "A B C D S", tone: "info" }, { label: "Conflict resolutions", value: String(r.rounds), tone: tone(r.rounds, 1, 2) }, { label: "Bisect steps possible", value: String(r.bisect), tone: toneLow(r.bisect, 3, 2) }] },
      notes: [r.breaks ? "Rewriting a branch that others use breaks their copies." : str(v, "strategy") === "squash" ? "Clean history and a blunt bisect." : "History as you chose to keep it."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.teammateBreakage === 1) ev.push("force-push");
    if (str(v, "strategy") === "squash" && out.metrics.bisectableCommits! < 2) ev.push("squash-loss");
    return ev;
  },
  scene: (n): SceneOut => (n === "merge" ? { set: { strategy: "merge" }, focus: ["strategy"] } : n === "rebase" ? { set: { strategy: "rebase" }, focus: ["strategy"] } : n === "squash" ? { set: { strategy: "squash" }, focus: ["strategy"] } : undefined),
};

// ------------------------------------------------------------------ reset modes

export function resetRun(mode: string, back: number, uncommitted: boolean, staged: boolean) {
  const filesPerCommit = 2;
  const undone = back * filesPerCommit;
  const wipFiles = (uncommitted ? 3 : 0) + (staged ? 1 : 0);
  const lost = mode === "hard" ? wipFiles : 0;
  const stagedAfter = mode === "soft" ? undone + (staged ? 1 : 0) : mode === "mixed" ? 0 : 0;
  const keptAsEdits = mode === "hard" ? 0 : undone;
  return { commitsUndone: back, lost, stagedAfter, kept: keptAsEdits, undoneFiles: undone };
}

export const resetLab: LabModel = {
  id: "reset-lab",
  metrics: ["commitsUndone", "lostWorkFiles", "stagedAfter", "changesKept"],
  observes: ["wiped", "staged"],
  scenes: ["soft", "mixed", "hard"],
  runLabel: "Reset the branch",
  honest: [
    "git reset moves the current branch back to an earlier commit, and its mode decides what happens to the other two areas Git keeps, the index (what is staged) and the working tree (the files on disk). --soft moves only the branch: the undone commits' changes stay staged. --mixed (the default) also resets the index: the changes stay on disk, unstaged. --hard resets everything, so the undone commits' changes and any uncommitted edits are discarded.",
    "Each commit here touched 2 files. Committed work removed by a reset can be recovered from the reflog; uncommitted edits discarded by --hard were never recorded anywhere and cannot. Working-tree files you have edited but not committed: 3. One file may be staged.",
    "Round figures to show what each mode keeps.",
  ],
  init: (c) => ({ mode: "mixed", back: (c as { back?: number }).back ?? 2, uncommitted: true, staged: false }),
  controls: (c) => {
    const out: Control[] = [{ kind: "choice", id: "mode", label: "git reset", options: [{ id: "soft", label: "--soft" }, { id: "mixed", label: "--mixed (default)" }, { id: "hard", label: "--hard" }] }];
    if (!(c as { lockBack?: boolean }).lockBack) out.push({ kind: "slider", id: "back", label: "Commits to undo (HEAD~n)", min: 1, max: 5, step: 1, fmt: "int" });
    out.push({ kind: "toggle", id: "uncommitted", label: "3 files edited but not committed" }, { kind: "toggle", id: "staged", label: "1 file staged" });
    return out;
  },
  evaluate: (v) => {
    const r = resetRun(str(v, "mode"), Math.round(num(v, "back")), bool(v, "uncommitted"), bool(v, "staged"));
    return {
      metrics: { commitsUndone: r.commitsUndone, lostWorkFiles: r.lost, stagedAfter: r.stagedAfter, changesKept: r.kept },
      readouts: [
        { label: "Commits removed from the branch", value: r.commitsUndone, fmt: "int" },
        { label: "Uncommitted files destroyed", value: r.lost, fmt: "int", tone: r.lost ? "alert" : "ok" },
        { label: "Files staged afterwards", value: r.stagedAfter, fmt: "int", tone: r.stagedAfter ? "info" : "ok" },
        { label: "Changes from the undone commits kept as edits", value: r.kept, fmt: "int", sub: "files", tone: r.kept ? "ok" : "warn" },
      ],
      view: { kind: "steps", steps: [{ label: "Branch pointer", value: `back ${r.commitsUndone}`, tone: "info" }, { label: "Index", value: str(v, "mode") === "soft" ? "unchanged (staged)" : "reset", tone: "info" }, { label: "Working tree", value: str(v, "mode") === "hard" ? "overwritten" : "kept", tone: str(v, "mode") === "hard" ? "alert" : "ok" }] },
      notes: [r.lost ? "--hard threw away work that was never committed." : "Nothing on disk was destroyed."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.lostWorkFiles! > 0) ev.push("wiped");
    if (out.metrics.stagedAfter! > 0) ev.push("staged");
    return ev;
  },
  scene: (n): SceneOut => (n === "soft" ? { set: { mode: "soft" }, focus: ["mode"] } : n === "mixed" ? { set: { mode: "mixed" }, focus: ["mode"] } : n === "hard" ? { set: { mode: "hard", uncommitted: true }, focus: ["mode"] } : undefined),
};

// ------------------------------------------------------------------ reflog rescues

export function rescueRun(situation: string, method: string, days: number, gc: boolean, remote: boolean) {
  const committed = situation === "reset" || situation === "branch" || situation === "rebase";
  let works = false;
  let steps = 0;
  if (method === "reflog") {
    works = committed && !gc && days <= 30;
    steps = 2;
  } else if (method === "fsck") {
    works = (committed && !gc && days <= 44) || (situation === "stash" && !gc && days <= 14);
    steps = 4;
  } else if (method === "fetch") {
    works = remote && committed;
    steps = 1;
  } else {
    works = false;
    steps = 1;
  }
  const never = situation === "edits";
  return { recovered: works && !never ? 1 : 0, steps, never: never ? 1 : 0 };
}

export const rescueLab: LabModel = {
  id: "rescue-lab",
  metrics: ["recovered", "steps", "neverRecorded"],
  observes: ["rescued", "unrecoverable"],
  scenes: ["reflog", "fsck", "fetch"],
  runLabel: "Rescue the work",
  honest: [
    "Git almost never deletes what you committed straight away. A lost commit is just unreachable: no branch points at it. The reflog records where HEAD and each branch have been, and keeps entries for unreachable commits for 30 days, so 'git reflog' then 'git branch rescue <hash>' recovers it (2 steps). Past that, objects with no reflog entry are still on disk until gc prunes them, about 2 weeks later (44 days in all); 'git fsck --lost-found' lists them and takes about 4 steps. A dropped stash is only findable that way, for 2 weeks.",
    "'git gc --prune=now' (or an expired reflog) deletes unreachable objects at once. If the commits were pushed, the remote still has them: fetch (1 step). Edits that were never committed or stashed are not in Git at all, whatever you try.",
    "Round figures for the shape of the rules: reflog 30 days, fsck 44, stash 14.",
  ],
  init: (c) => ({ situation: (c as { situation?: string }).situation ?? "reset", method: "reflog", days: (c as { days?: number }).days ?? 5, gc: false, remote: false }),
  controls: (c) => {
    const out: Control[] = [];
    if (!(c as { lockSituation?: boolean }).lockSituation) out.push({ kind: "choice", id: "situation", label: "What went wrong", options: [{ id: "reset", label: "git reset --hard dropped three commits" }, { id: "branch", label: "A branch was deleted before merging" }, { id: "rebase", label: "A rebase went wrong" }, { id: "stash", label: "git stash drop of something you needed" }, { id: "edits", label: "Uncommitted edits were overwritten" }] });
    out.push({ kind: "choice", id: "method", label: "Try", options: [{ id: "log", label: "git log" }, { id: "reflog", label: "git reflog, then branch the hash" }, { id: "fsck", label: "git fsck --lost-found" }, { id: "fetch", label: "git fetch from the remote" }] });
    if (!(c as { lockDays?: boolean }).lockDays) out.push({ kind: "slider", id: "days", label: "Days since it happened", min: 0, max: 120, step: 1, fmt: "int" });
    if (!(c as { lockGc?: boolean }).lockGc) out.push({ kind: "toggle", id: "gc", label: "gc --prune=now has run since" });
    if (!(c as { lockRemote?: boolean }).lockRemote) out.push({ kind: "toggle", id: "remote", label: "The commits were pushed" });
    return out;
  },
  evaluate: (v) => {
    const r = rescueRun(str(v, "situation"), str(v, "method"), num(v, "days"), bool(v, "gc"), bool(v, "remote"));
    return {
      metrics: { recovered: r.recovered, steps: r.steps, neverRecorded: r.never },
      readouts: [
        { label: "Work recovered", value: r.recovered ? "yes" : "no", tone: r.recovered ? "ok" : "alert" },
        { label: "Commands needed", value: r.steps, fmt: "int" },
        { label: "Was it ever recorded in Git", value: r.never ? "no" : "yes", tone: r.never ? "alert" : "ok" },
      ],
      view: { kind: "steps", steps: [{ label: "Method", value: str(v, "method"), tone: "info" }, { label: "Result", value: r.recovered ? "the commits are back" : "nothing found", tone: r.recovered ? "ok" : "alert" }] },
      notes: [r.never ? "Git never saw these edits." : r.recovered ? "Found, because the objects were still on disk." : "Wrong tool, or too late."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.recovered === 1) ev.push("rescued");
    if (out.metrics.neverRecorded === 1) ev.push("unrecoverable");
    return ev;
  },
  scene: (n): SceneOut => (n === "reflog" ? { set: { method: "reflog", days: 10 }, focus: ["method"] } : n === "fsck" ? { set: { method: "fsck", days: 38 }, focus: ["method", "days"] } : n === "fetch" ? { set: { method: "fetch", remote: true, gc: true }, focus: ["method", "remote"] } : undefined),
};

// ------------------------------------------------------------------ CI pipelines

const CATCH: Record<string, number> = { lint: 0.15, unit: 0.55, integ: 0.2, e2e: 0.07 };

export function pipelineRun(f: { lint: boolean; unit: boolean; integ: boolean; e2e: boolean }, parallel: boolean, cache: boolean, failFast: boolean, retries: boolean) {
  const t: Record<string, number> = { lint: 1, unit: cache ? 4 : 6, integ: 12, e2e: 15 };
  const build = cache ? 2 : 4;
  const order = failFast ? ["lint", "unit", "integ", "e2e"] : ["e2e", "integ", "unit", "lint"];
  const stages = order.filter((s) => f[s as keyof typeof f]);
  const fastStages = stages.filter((s) => s === "lint" || s === "unit");
  let total: number;
  if (parallel) {
    total = build + Math.max(0, ...stages.map((s) => t[s]!));
  } else {
    total = build + stages.reduce((a, s) => a + t[s]!, 0);
  }
  void fastStages;
  let cum = build;
  let caught = 0;
  let sum = 0;
  for (const s of stages) {
    cum = parallel ? build + t[s]! : cum + t[s]!;
    caught += CATCH[s]!;
    sum += CATCH[s]! * cum;
  }
  const feedback = caught > 0 ? sum / caught : total;
  const escape = 1 - caught;
  const flake = f.e2e ? (retries ? 0.005 : 0.08) : 0;
  if (retries && f.e2e) total += 3;
  return { total, feedback, escape: Math.max(0, escape), flake };
}

export const pipelineLab: LabModel = {
  id: "pipeline-lab",
  metrics: ["totalMin", "feedbackMin", "escapeRate", "flakeRate"],
  observes: ["slow-red", "leaky"],
  scenes: ["fast-first", "parallel", "cache"],
  runLabel: "Build the pipeline",
  honest: [
    "A pipeline runs checks on every change. Lint takes 1 minute and catches 15% of defects, unit tests take 6 and catch 55%, integration tests take 12 and catch 20%, end-to-end tests take 15 and catch 7%. The remaining 3% reach production. A build step takes 4 minutes before the tests start.",
    "Run in a fail-fast order (cheap and strong checks first) so a bad change fails in minutes. Run independent stages in parallel and the pipeline takes as long as its slowest stage plus the build. Caching dependencies saves 2 minutes on the build and unit stages. End-to-end tests are flaky: 8% of runs fail for no reason, which trains people to ignore red; retrying a failed run lowers that to 0.5% and adds 3 minutes.",
    "Feedback time is the average time until the pipeline turns red for a change with a defect. Round figures.",
  ],
  init: () => ({ lint: true, unit: true, integ: true, e2e: true, parallel: false, cache: false, failFast: false, retries: false }),
  controls: () => [
    { kind: "toggle", id: "lint", label: "Lint" },
    { kind: "toggle", id: "unit", label: "Unit tests" },
    { kind: "toggle", id: "integ", label: "Integration tests" },
    { kind: "toggle", id: "e2e", label: "End-to-end tests" },
    { kind: "toggle", id: "failFast", label: "Cheap, strong checks first" },
    { kind: "toggle", id: "parallel", label: "Run stages in parallel" },
    { kind: "toggle", id: "cache", label: "Cache dependencies" },
    { kind: "toggle", id: "retries", label: "Retry flaky end-to-end failures once" },
  ],
  evaluate: (v) => {
    const r = pipelineRun({ lint: bool(v, "lint"), unit: bool(v, "unit"), integ: bool(v, "integ"), e2e: bool(v, "e2e") }, bool(v, "parallel"), bool(v, "cache"), bool(v, "failFast"), bool(v, "retries"));
    return {
      metrics: { totalMin: r.total, feedbackMin: r.feedback, escapeRate: r.escape, flakeRate: r.flake },
      readouts: [
        { label: "Pipeline time when green", value: r.total, fmt: "num", sub: "minutes", tone: tone(r.total, 15, 30) },
        { label: "Time until a bad change turns red", value: r.feedback, fmt: "num", sub: "minutes", tone: tone(r.feedback, 5, 12) },
        { label: "Defects that reach production", value: r.escape, fmt: "pct", tone: tone(r.escape, 0.06, 0.15) },
        { label: "Runs that fail for no reason", value: r.flake, fmt: "pct", tone: tone(r.flake, 0.02, 0.05) },
      ],
      view: { kind: "bars", fmt: "num", max: 45, bars: [{ label: "Green pipeline (min)", value: r.total, tone: tone(r.total, 15, 30) }, { label: "Time to red (min)", value: r.feedback, tone: tone(r.feedback, 5, 12) }] },
      notes: [r.escape > 0.15 ? "Dropped checks let defects through." : r.total > 30 ? "Everything in a line makes a long wait." : "Fast signals first, with the checks that matter."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.feedbackMin! > 12) ev.push("slow-red");
    if (out.metrics.escapeRate! > 0.15) ev.push("leaky");
    return ev;
  },
  scene: (n): SceneOut => (n === "fast-first" ? { set: { failFast: true }, focus: ["failFast"] } : n === "parallel" ? { set: { parallel: true }, focus: ["parallel"] } : n === "cache" ? { set: { cache: true }, focus: ["cache"] } : undefined),
};

// ------------------------------------------------------------------ infrastructure as code

export function iacRun(manual: boolean, remote: boolean, prPlan: boolean, drift: boolean, ciOnly: boolean) {
  const driftPerMonth = manual ? 6 : 0.5;
  const detectedIn = drift ? 1 : 30;
  const openDrift = driftPerMonth * (detectedIn / 30);
  const conflicts = remote ? 0 : 1.5;
  const unreviewed = prPlan ? (ciOnly ? 0.02 : 0.08) : 0.6;
  const rebuild = 25 + (manual ? 120 : 0);
  return { openDrift, conflicts, unreviewed, rebuild };
}

export const iacLab: LabModel = {
  id: "iac-lab",
  metrics: ["undetectedDrift", "stateConflicts", "unreviewedChanges", "rebuildMin"],
  observes: ["drift", "collision"],
  scenes: ["state", "plan", "drift"],
  runLabel: "Set up the workflow",
  honest: [
    "Infrastructure as code describes servers, networks and databases in files. 'plan' compares those files with the recorded state and with reality and shows what would change; 'apply' makes the changes and updates the state. Four engineers change the infrastructure. Changes made by hand in the console (6 a month, against 0.5 emergency fixes if disallowed) make reality drift from the code, so the next apply may undo them or fail.",
    "State holds what the tool believes exists. A state file on one laptop cannot be shared, and two applies at once without a lock corrupt it (1.5 collisions a month). Remote state with locking prevents it. A plan posted on each pull request means changes are reviewed before they run (60% of changes are unreviewed without it, 8% with it, 2% if only CI may apply). A scheduled plan finds drift within a day; without one, drift is found at the next unrelated change, about 30 days.",
    "Rebuilding an environment from code takes about 25 minutes. With hand-made changes there is also 2 hours of finding what was done. Round figures.",
  ],
  init: () => ({ manual: true, remote: false, prPlan: false, drift: false, ciOnly: false }),
  controls: () => [
    { kind: "toggle", id: "manual", label: "Engineers may change things in the console" },
    { kind: "toggle", id: "remote", label: "Remote state with locking" },
    { kind: "toggle", id: "prPlan", label: "Plan runs and is reviewed on every pull request" },
    { kind: "toggle", id: "ciOnly", label: "Only CI may apply" },
    { kind: "toggle", id: "drift", label: "A scheduled plan reports drift daily" },
  ],
  evaluate: (v) => {
    const r = iacRun(bool(v, "manual"), bool(v, "remote"), bool(v, "prPlan"), bool(v, "drift"), bool(v, "ciOnly"));
    return {
      metrics: { undetectedDrift: r.openDrift, stateConflicts: r.conflicts, unreviewedChanges: r.unreviewed, rebuildMin: r.rebuild },
      readouts: [
        { label: "Hand-made changes sitting undetected", value: r.openDrift, fmt: "num", tone: tone(r.openDrift, 0.5, 2) },
        { label: "State collisions a month", value: r.conflicts, fmt: "num", tone: tone(r.conflicts, 0, 0.5) },
        { label: "Changes applied without review", value: r.unreviewed, fmt: "pct", tone: tone(r.unreviewed, 0.1, 0.3) },
        { label: "Time to rebuild an environment", value: r.rebuild, fmt: "num", sub: "minutes", tone: tone(r.rebuild, 30, 60) },
      ],
      view: { kind: "bars", fmt: "pct", max: 1, bars: [{ label: "Unreviewed changes", value: r.unreviewed, tone: tone(r.unreviewed, 0.1, 0.3) }] },
      notes: [r.conflicts > 0 ? "Two applies at once can corrupt the shared state." : r.openDrift > 1 ? "The real world has moved away from the code." : "The code is the source of truth."],
    };
  },
  events: (v, out) => {
    const ev: string[] = [];
    if (out.metrics.undetectedDrift! > 3) ev.push("drift");
    if (out.metrics.stateConflicts! > 0) ev.push("collision");
    return ev;
  },
  scene: (n): SceneOut => (n === "state" ? { set: { remote: true }, focus: ["remote"] } : n === "plan" ? { set: { prPlan: true, ciOnly: true }, focus: ["prPlan", "ciOnly"] } : n === "drift" ? { set: { drift: true, manual: false }, focus: ["drift", "manual"] } : undefined),
};

export const C3_MODELS: LabModel[] = [dagLab, mergeLab, resetLab, rescueLab, pipelineLab, iacLab];
