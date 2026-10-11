import { definePack } from "../define";

export const RR = { start: { situation: "reset", method: "log", days: 5 } };
export const RR_CHALLENGE = { lockSituation: true, lockDays: true, lockGc: true, lockRemote: true, situation: "branch", days: 40, start: { method: "log" } };

const GIT_REFLOG = { id: "git-reflog", title: "git-reflog documentation (expiry of reflog entries)", url: "https://git-scm.com/docs/git-reflog" };
const GIT_FSCK = { id: "git-fsck", title: "git-fsck documentation (--lost-found and unreachable objects)", url: "https://git-scm.com/docs/git-fsck" };
const PROGIT_RECOVERY = { id: "progit-recovery", title: "Pro Git: Maintenance and Data Recovery", url: "https://git-scm.com/book/en/v2/Git-Internals-Maintenance-and-Data-Recovery" };

export default definePack({
  id: "reflog-rescue",
  title: "Reflog Rescues",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "page", title: "terminal · git branch -D payments-v2", detail: "Deleted branch payments-v2 (was a91cc03); not pushed" },
    lines: [
      { speaker: "kabir", line: "I deleted the branch to tidy up and realised a minute later that it held three weeks of work and was never pushed. I assumed it was gone." },
      { speaker: "meera", line: "Git prints the hash when you delete it for a reason. The work is still on disk, and Git keeps a diary of where you have been." },
    ],
  },
  predictions: [
    {
      id: "rescued",
      kind: "choice",
      prompt: "A git reset --hard dropped three commits 10 days ago. Will git reflog followed by creating a branch at the old hash bring them back?",
      options: [
        { id: "yes", label: "Yes, in about two commands" },
        { id: "no", label: "No, reset --hard deletes commits" },
        { id: "partial", label: "Only the newest commit" },
      ],
      answer: "yes",
      observe: "rescued",
      reveal: {
        text: "Reset moved the branch label, and the commits remained as unreachable objects. The reflog recorded the branch's previous position, so git reflog shows it and git branch rescue <hash> names it again: 2 steps. This works for 30 days after the commits became unreachable, as long as nothing pruned them.",
        derived: true,
        line: { speaker: "rao", line: "Find the hash, then give it a name. That is the whole technique." },
      },
    },
    {
      id: "unrecoverable",
      kind: "choice",
      prompt: "You overwrite uncommitted edits with git checkout -f, and had never committed or stashed them. Can any Git command bring them back?",
      options: [
        { id: "reflog", label: "Yes, the reflog tracks file edits" },
        { id: "fsck", label: "Yes, git fsck finds them" },
        { id: "no", label: "No: Git never recorded them" },
      ],
      answer: "no",
      observe: "unrecoverable",
      reveal: {
        text: "Git records what is committed or stashed, and files that were only ever on disk have no object. The reflog tracks refs, and fsck finds objects, so neither has anything to find. Only an editor's local history, a backup or a file-system snapshot might. The rule is to commit early, even if you rewrite it later.",
        derived: true,
        line: { speaker: "meera", line: "Git is a safety net for what you hand it." },
      },
    },
  ],
  widget: { id: "rescue-lab", config: RR },
  mechanism: [
    {
      id: "reflog",
      scene: "reflog",
      text: "The reflog is a local diary of where HEAD and each branch have pointed, with timestamps. After a bad reset, rebase or branch deletion, git reflog shows the hash from before. Create a branch at it, or reset to it, and the work is back. Entries are kept 90 days, and 30 days if the commit became unreachable.",
      sourceIds: ["git-reflog", "progit-recovery"],
    },
    {
      id: "fsck",
      scene: "fsck",
      text: "When the reflog entry has expired, the objects may still be on disk, as unreachable ones, until garbage collection prunes them (two weeks by default). git fsck --lost-found lists dangling commits, and you inspect each with git show. This is slower and more manual, and it is also the only way to find a dropped stash.",
      sourceIds: ["git-fsck"],
    },
    {
      id: "remote",
      scene: "fetch",
      text: "The best recovery is a copy somewhere else. If you pushed, the remote has the commits, and a fetch brings them back in one step, even after local pruning. This is why pushing branches early, even unfinished, is a safety habit as well as a collaboration one. Your laptop is one copy, and a remote is a second.",
      sourceIds: ["progit-recovery"],
    },
    {
      id: "limits",
      text: "Know the limits. A prune with immediate effect, or time, removes what the reflog and fsck would find. Anything never committed or stashed is outside Git. When something goes wrong, stop and avoid running gc or more resets, which makes recovery harder. Find the hash first, then act.",
      sourceIds: ["git-reflog", "git-fsck"],
    },
  ],
  challenges: [
    {
      id: "rescue-branch",
      title: "Rescue the work",
      brief: "A branch was deleted 40 days ago and never pushed, and no prune has been run. Recover it with at most 5 commands.",
      line: { speaker: "rao", line: "Three weeks of work. Get it back." },
      widget: { id: "rescue-lab", config: RR_CHALLENGE },
      conditions: [
        { metric: "recovered", op: ">=", value: 1, label: "The work is recovered" },
        { metric: "steps", op: "<=", value: 5, label: "At most 5 commands" },
      ],
      stars: [],
      hints: ["How long does the reflog keep unreachable commits?", "What can find objects the reflog has forgotten?", "Does the remote have a copy?"],
    },
  ],
  explainBack: {
    prompt: "Explain how to recover work you thought you had lost in Git.",
    rubric: [
      { id: "reflog", criterion: "The reflog records previous positions of HEAD and branches; find the old hash and branch from it, within the expiry window", keyIdea: "reflog then branch" },
      { id: "fsck", criterion: "After the reflog entry expires, unreachable objects remain until gc prunes them and git fsck --lost-found can find them", keyIdea: "fsck for the rest" },
      { id: "limit", criterion: "Never-committed work is outside Git; a pushed remote copy is the best safety net; avoid gc while recovering", keyIdea: "commit and push early" },
    ],
    exemplar:
      "The reflog records previous positions of HEAD and branches, so I find the old hash with git reflog and make a branch from it, within the expiry window. After that, unreachable objects remain on disk until gc prunes them, and git fsck --lost-found can find them. Work that was never committed is outside Git, a pushed remote copy is the best safety net, and I would avoid running gc while recovering.",
  },
  reviews: [
    {
      id: "rl-est",
      format: "estimate",
      scenario: "Reflog entries for unreachable commits expire at 30 days and gc prunes unreachable objects 14 days after that. For how many days after the loss can fsck still find a lost commit?",
      unit: "days",
      answer: 44,
      acceptFactor: 1,
      breakdown: ["30 days of reflog + 14 days before pruning = 44"],
      explain: "The fsck window is the reflog window plus the prune grace period.",
    },
    {
      id: "rl-pick",
      format: "pick-fix",
      scenario: "You ran git reset --hard and lost three commits an hour ago. What is the first command to run?",
      options: [
        { id: "a", label: "git reflog, to find the hash from before the reset" },
        { id: "b", label: "git gc, to clean up" },
        { id: "c", label: "git reset --hard again" },
        { id: "d", label: "git clean -fdx" },
      ],
      answer: "a",
      explain: "Find the hash first. gc could delete what you are about to recover, and another reset moves the label again.",
    },
    {
      id: "rl-order",
      format: "order",
      scenario: "Order these recovery methods by number of commands, fewest first.",
      items: [
        { id: "fetch", label: "Fetch from the remote" },
        { id: "reflog", label: "Reflog, then branch the hash" },
        { id: "fsck", label: "fsck --lost-found, inspect, branch" },
      ],
      answer: ["fetch", "reflog", "fsck"],
      explain: "1, 2 and 4.",
    },
    {
      id: "rl-graph",
      format: "predict-graph",
      scenario: "For a deleted branch with no remote copy, how does the chance of recovery change as days pass (0 to 120)?",
      xLabel: "days →",
      yLabel: "recoverable",
      options: [
        { id: "steps", label: "Easy to day 30, harder to day 44, then gone", points: [100, 100, 100, 100, 60, 0, 0, 0] },
        { id: "linear", label: "Falls steadily to zero", points: [100, 85, 70, 55, 40, 25, 10, 0] },
        { id: "flat", label: "Always recoverable", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "steps",
      explain: "Reflog works to 30 days, fsck to about 44, and after that the objects are pruned.",
    },
    {
      id: "rl-flaw",
      format: "spot-flaw",
      scenario: "After a bad rebase, a developer runs git gc --prune=now 'to clean up the mess' before looking at the reflog. Tap the damaging step.",
      diagram: {
        nodes: [
          { id: "bad", label: "bad rebase: old commits unreachable", kind: "worker", col: 0, row: 1 },
          { id: "gc", label: "git gc --prune=now", kind: "server", col: 1, row: 1 },
          { id: "old", label: "the old commits", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "bad", to: "gc" },
          { from: "gc", to: "old" },
        ],
      },
      answer: "gc->old",
      explain: "An immediate prune deletes exactly the unreachable objects the reflog points at. Find and branch the old tip first.",
    },
    {
      id: "rl-explain",
      format: "explain",
      scenario: "In two sentences: why is pushing an unfinished branch a good safety habit?",
      rubric: [
        { id: "copy", criterion: "The remote holds a second copy that survives local resets, deletions and a lost laptop" },
        { id: "cheap", criterion: "It costs almost nothing and does not require the work to be ready to merge" },
      ],
      exemplar: "The remote holds a second copy that survives local resets, deletions and a lost laptop. It costs almost nothing, and the work does not need to be ready to merge.",
      explain: "A copy elsewhere beats any recovery technique.",
    },
  ],
  codex: {
    oneLiner: "Lost commits are usually unreachable, not deleted. The reflog finds the hash for 30 days, fsck for about 44, a remote copy always.",
    keyNumbers: [
      { label: "Reflog window for unreachable commits", value: "30 days", sourceId: "git-reflog" },
      { label: "fsck window (reflog plus prune grace)", value: "about 44 days", sourceId: "git-fsck" },
    ],
    tradeoffs: [
      { choice: "Reflog recovery", gain: "Two commands", cost: "Local only; expires" },
      { choice: "fsck recovery", gain: "Finds dropped stashes and older commits", cost: "Manual and slow" },
      { choice: "Pushing early", gain: "A copy that survives anything local", cost: "A visible unfinished branch" },
    ],
    seenIn: ["Stack Overflow answers starting with 'run git reflog'.", "Git hosting UIs that show deleted branches' last commit."],
    interviewAngle: "Say: 'reflog to find the hash, branch from it; fsck for older or stashes; a remote copy beats both; and commit early'.",
    aws: [{ concept: "Off-machine copies", service: "Any Git remote; CI caches of branches" }],
    replay: { id: "rescue-lab", config: RR, scene: "fsck" },
  },
  interview: [
    "How would you recover a deleted branch?",
    "What is the reflog?",
    "Can you recover uncommitted changes after git reset --hard?",
  ],
  deeper: [
    {
      title: "Habits that make rescues unnecessary",
      body: "Commit often, even rough commits you plan to squash. Push unfinished branches. Use git stash with a message for a quick save, and prefer git restore and git switch over commands that overwrite. When you plan a risky operation, make a backup branch first with git branch backup: a name that costs nothing and removes the need for any of the techniques above.",
      sourceIds: ["progit-recovery"],
    },
  ],
  honestPhysics: [
    "A lost commit is unreachable. The reflog keeps entries for unreachable commits for 30 days, and 'git reflog' then 'git branch rescue <hash>' recovers it in 2 commands. Past that, objects without a reflog entry stay on disk until gc prunes them, about 2 weeks later (44 days in all): 'git fsck --lost-found' lists them, about 4 commands. A dropped stash is only findable that way, for 2 weeks.",
    "'git gc --prune=now' deletes unreachable objects at once. If the commits were pushed, the remote has them and a fetch brings them back (1 command). Edits never committed or stashed are not in Git at all. Round figures.",
  ],
  sources: [GIT_REFLOG, GIT_FSCK, PROGIT_RECOVERY],
  verify: [
    { id: "reflog5", claim: "At 5 days reflog recovers a deleted branch in 2 steps", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "reflog", days: 5 }, metric: "recovered" }, expect: { min: 1 } },
    { id: "reflog40", claim: "At 40 days reflog no longer works", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "reflog" }, metric: "recovered" }, expect: { max: 0 } },
    { id: "fsck40", claim: "…but fsck does, in 4 steps", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "fsck" }, metric: "recovered" }, expect: { min: 1 } },
    { id: "fsck-steps", claim: "…taking 4 steps", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "fsck" }, metric: "steps" }, expect: { min: 4, max: 4 } },
    { id: "gc", claim: "After an immediate prune neither works", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "fsck", gc: true }, metric: "recovered" }, expect: { max: 0 } },
    { id: "fetch", claim: "A fetch works after a prune if the commits were pushed", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { method: "fetch", gc: true, remote: true }, metric: "recovered" }, expect: { min: 1 } },
    { id: "edits", claim: "Never-committed edits cannot be recovered", run: "lab", params: { model: "rescue-lab", config: RR_CHALLENGE, values: { situation: "edits", method: "fsck", days: 1 }, metric: "recovered" }, expect: { max: 0 } },
  ],
});
