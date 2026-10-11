import { definePack } from "../define";

export const GDG = { start: { branch: true, tag: false, remote: false, days: 5, gc: false } };
export const GDG_CHALLENGE = { lockTime: true, start: { branch: false, tag: false, remote: false, days: 60, gc: true } };

const PROGIT_REFS = { id: "progit-refs", title: "Pro Git: Git Internals, Git References (branches as pointers to commits)", url: "https://git-scm.com/book/en/v2/Git-Internals-Git-References" };
const GIT_GC = { id: "git-gc", title: "git-gc documentation (pruning unreachable objects, gc.pruneExpire)", url: "https://git-scm.com/docs/git-gc" };
const GIT_REFLOG = { id: "git-reflog", title: "git-reflog documentation (reflog expiry: gc.reflogExpire and gc.reflogExpireUnreachable)", url: "https://git-scm.com/docs/git-reflog" };

export default definePack({
  id: "git-dag",
  title: "The Commit DAG",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "terminal",
    alert: { severity: "info", title: "HEAD detached at 4f2a9c1", detail: "3 commits made here; you are now on main" },
    lines: [
      { speaker: "kabir", line: "I committed three times in a detached HEAD, switched back to main to check something, and my work disappeared from every list." },
      { speaker: "meera", line: "Git did not lose it, it just stopped having a name. A branch is only a label on one commit in a graph." },
    ],
  },
  predictions: [
    {
      id: "orphaned",
      kind: "choice",
      prompt: "You make three commits on a detached HEAD, then run git switch main. How many of the three are reachable from a branch, a tag or a remote?",
      options: [
        { id: "3", label: "All three, they are in the history" },
        { id: "0", label: "None: no name points at them" },
        { id: "1", label: "Only the first" },
      ],
      answer: "0",
      observe: "orphaned",
      reveal: {
        text: "A commit is reachable if some name leads to it by following parent links. Moving HEAD away left E, F and G with nothing pointing at the newest one. They still exist as objects, and git log on main does not show them. Only the reflog remembers where HEAD was, for a limited time.",
        derived: true,
        line: { speaker: "rao", line: "Reachable is the only status that protects a commit." },
      },
    },
    {
      id: "gone",
      kind: "choice",
      prompt: "Those three commits stay unnamed for 40 days and gc runs with an immediate prune. How many can you still get back?",
      options: [
        { id: "3", label: "All three, the reflog keeps everything" },
        { id: "1", label: "One" },
        { id: "0", label: "None: they are deleted" },
      ],
      answer: "0",
      observe: "gone",
      reveal: {
        text: "The reflog keeps entries for commits that are no longer reachable for 30 days, and a prune removes the objects themselves. At day 40 with a prune, nothing remains. A branch or a tag made on day 0 would have kept them forever, for the cost of 41 bytes and a name.",
        derived: true,
        line: { speaker: "meera", line: "A name is the cheapest insurance in Git." },
      },
    },
  ],
  widget: { id: "dag-lab", config: GDG },
  mechanism: [
    {
      id: "graph",
      text: "A Git repository is a directed acyclic graph of commits. Each commit records a snapshot of the files, a message and the hash of its parent, or two parents for a merge. Hashes derive from content, so a commit never changes: a different change is a new commit. History is what you can reach by following parents.",
      sourceIds: ["progit-refs"],
    },
    {
      id: "refs",
      scene: "branch",
      text: "A branch is a file holding one commit hash. Creating one costs a few dozen bytes and no copying. When you commit, the current branch's pointer advances to the new commit. HEAD says which branch you are on, or, when detached, which commit directly. Tags are fixed labels, and remote-tracking branches record where the remote was last seen.",
      sourceIds: ["progit-refs"],
    },
    {
      id: "reach",
      scene: "tag",
      text: "Reachability decides what Git keeps. Any commit reachable from any ref is safe. An unreachable commit is not deleted at once: it sits as a loose object, and the reflog notes it for 30 days. Name work you want to keep, by making a branch before switching away from a detached HEAD, even a throwaway one.",
      sourceIds: ["git-reflog"],
    },
    {
      id: "gc",
      scene: "gc",
      text: "Garbage collection runs now and then, packing objects and removing unreachable ones older than a grace period, two weeks by default. Running it with an immediate prune, or after the reflog entries expire, removes them for good. Most people never run it by hand, and it still triggers automatically, so unnamed work has a shelf life.",
      sourceIds: ["git-gc"],
    },
  ],
  challenges: [
    {
      id: "keep-commits",
      title: "Keep the commits",
      brief: "Sixty days later, after gc has pruned unreachable commits, all three commits must still exist. Add no noise for the team: no pushing, and the cheapest name.",
      line: { speaker: "rao", line: "Keep the work and keep it private." },
      widget: { id: "dag-lab", config: GDG_CHALLENGE },
      conditions: [
        { metric: "lostCommits", op: "<=", value: 0, label: "No commits lost" },
        { metric: "sharedNoise", op: "<=", value: 0, label: "No noise for the team" },
      ],
      stars: [],
      hints: ["What makes a commit reachable?", "Which names are shared with the team?", "Which name needs nothing else?"],
    },
  ],
  explainBack: {
    prompt: "Explain what a branch is and why commits can seem to vanish.",
    rubric: [
      { id: "graph", criterion: "Commits form a graph linked by parent hashes, and a commit never changes", keyIdea: "a graph of immutable commits" },
      { id: "branch", criterion: "A branch is a movable name pointing to a commit; creating one is nearly free", keyIdea: "a branch is a pointer" },
      { id: "reach", criterion: "Commits unreachable from any name are only kept for a grace period, so name work you want to keep", keyIdea: "reachable means safe" },
    ],
    exemplar:
      "Commits form a graph linked by parent hashes, and a commit never changes. A branch is just a movable name pointing at one commit, so creating it is nearly free. Commits that no name can reach are kept only for a grace period before garbage collection removes them, so I name any work I want to keep, even with a throwaway branch.",
  },
  reviews: [
    {
      id: "gd-est",
      format: "estimate",
      scenario: "Each branch is a file with a 40-character hash and a newline. About how many bytes is a branch pointer?",
      unit: "bytes",
      answer: 41,
      acceptFactor: 1.05,
      breakdown: ["40 characters of hash + 1 newline = 41 bytes", "no files are copied"],
      explain: "A branch is a label, so branching costs nothing however big the repository is.",
    },
    {
      id: "gd-pick",
      format: "pick-fix",
      scenario: "You are on a detached HEAD, three commits in, and realise the work is worth keeping. What should you do before switching away?",
      options: [
        { id: "a", label: "Create a branch at the current commit, with git switch -c" },
        { id: "b", label: "Run git gc" },
        { id: "c", label: "Delete main" },
        { id: "d", label: "Run git clean" },
      ],
      answer: "a",
      explain: "A branch gives the tip a name, which makes the whole chain reachable and safe.",
    },
    {
      id: "gd-order",
      format: "order",
      scenario: "Order these by how long the three commits survive if unnamed, shortest first.",
      items: [
        { id: "prune", label: "gc --prune=now was run" },
        { id: "reflog", label: "Reflog entries expired at 30 days, then default gc" },
        { id: "named", label: "A branch points at the tip" },
      ],
      answer: ["prune", "reflog", "named"],
      explain: "Immediately, then about 44 days, then forever.",
    },
    {
      id: "gd-graph",
      format: "predict-graph",
      scenario: "With no names pointing at unreachable work and no gc run, how does the chance you can recover it change over 120 days?",
      xLabel: "days →",
      yLabel: "recoverable",
      options: [
        { id: "step", label: "Yes for about 30 days, then no", points: [100, 100, 100, 100, 0, 0, 0, 0] },
        { id: "decay", label: "Falls steadily from day zero", points: [100, 85, 70, 55, 40, 25, 10, 0] },
        { id: "flat", label: "Always recoverable", points: [100, 100, 100, 100, 100, 100, 100, 100] },
      ],
      answer: "step",
      explain: "The reflog entry lasts a fixed window. After it, a later gc is free to delete the commits.",
    },
    {
      id: "gd-flaw",
      format: "spot-flaw",
      scenario: "A developer deletes a local feature branch with git branch -D to clean up. The work was never pushed or merged. Tap the step that makes it hard to recover.",
      diagram: {
        nodes: [
          { id: "work", label: "feature work: 3 commits", kind: "store", col: 0, row: 1 },
          { id: "branch", label: "branch name (the only ref)", kind: "cache", col: 1, row: 1 },
          { id: "gc", label: "gc in 30+ days", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "work", to: "branch" },
          { from: "branch", to: "gc" },
        ],
      },
      answer: "work->branch",
      explain: "Deleting the only name makes the commits unreachable. Push the branch first, or merge it, before you delete it.",
    },
    {
      id: "gd-explain",
      format: "explain",
      scenario: "In two sentences: why does branching in Git cost almost nothing?",
      rubric: [
        { id: "pointer", criterion: "A branch is only a pointer to a commit; no files are copied" },
        { id: "immutable", criterion: "Commits are immutable snapshots shared by every branch that can reach them" },
      ],
      exemplar: "A branch is only a pointer to a commit, so no files are copied. Commits are immutable snapshots that every branch able to reach them shares.",
      explain: "Cheap branches are what make the Git workflow work.",
    },
  ],
  codex: {
    oneLiner: "History is a graph of immutable commits; a branch is a movable name. Reachable commits are safe, and unnamed ones expire.",
    keyNumbers: [
      { label: "Branch pointer size", value: "41 bytes", sourceId: "progit-refs" },
      { label: "Reflog window for unreachable commits", value: "30 days", sourceId: "git-reflog" },
    ],
    tradeoffs: [
      { choice: "Branch for everything", gain: "Work is never orphaned", cost: "Stale branches to tidy" },
      { choice: "Tags", gain: "Fixed, shareable labels", cost: "They clutter if overused" },
      { choice: "Rely on the reflog", gain: "No ceremony", cost: "A deadline you may miss" },
    ],
    seenIn: ["Every 'I lost my commits' question.", "Detached HEAD warnings after checking out a tag or hash."],
    interviewAngle: "Say: 'a graph of immutable commits; a branch is a pointer; reachability decides what survives gc'.",
    aws: [{ concept: "Hosted Git", service: "AWS CodeCommit alternatives and any Git remote" }],
    replay: { id: "dag-lab", config: GDG, scene: "gc" },
  },
  interview: [
    "What is a Git branch?",
    "What is a detached HEAD, and how can you lose work in one?",
    "What does garbage collection remove?",
  ],
  deeper: [
    {
      title: "Why hashes matter",
      body: "A commit's hash depends on its content and its parent's hash, so changing an old commit changes every hash after it. That is why history is tamper-evident, and why rewriting history (rebase, amend) creates new commits rather than editing old ones. The old commits are still there, unreachable, until they expire.",
      sourceIds: ["progit-refs"],
    },
  ],
  honestPhysics: [
    "A repository with four commits on main (A to D) and three more (E, F, G) made on a detached HEAD, and then HEAD moved back to main. A branch, a tag or a remote-tracking branch points at a commit and makes it reachable.",
    "The reflog keeps entries for unreachable commits for 30 days; the garbage collector deletes unreachable objects, and an immediate prune does it at once. A tag adds 0.5 of noise to the team's tag list and a pushed branch adds 1. Round figures.",
  ],
  sources: [PROGIT_REFS, GIT_GC, GIT_REFLOG],
  verify: [
    { id: "gone", claim: "Unnamed commits after gc at day 60 are lost", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: {}, metric: "lostCommits" }, expect: { min: 3, max: 3 } },
    { id: "branch", claim: "A branch keeps them", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: { branch: true }, metric: "lostCommits" }, expect: { max: 0 } },
    { id: "quiet", claim: "…without noise for the team", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: { branch: true }, metric: "sharedNoise" }, expect: { max: 0 } },
    { id: "tag", claim: "A tag also keeps them but adds noise", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: { tag: true }, metric: "sharedNoise" }, expect: { min: 0.4, max: 0.6 } },
    { id: "push", claim: "A pushed branch is visible to everyone", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: { remote: true }, metric: "sharedNoise" }, expect: { min: 1, max: 1 } },
    { id: "reflog", claim: "At day 10 with no gc, the reflog still has them", run: "lab", params: { model: "dag-lab", config: GDG_CHALLENGE, values: { days: 10, gc: false }, metric: "recoverableCommits" }, expect: { min: 3, max: 3 } },
  ],
});
