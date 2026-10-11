import { definePack } from "../define";

export const CPR = { start: { mode: "mixed", back: 2, uncommitted: true, staged: false } };
export const CPR_CHALLENGE = { lockBack: true, back: 2, start: { mode: "hard", uncommitted: true, staged: false } };

const GIT_RESET = { id: "git-reset", title: "git-reset documentation (soft, mixed and hard)", url: "https://git-scm.com/docs/git-reset" };
const RESET_DEMYSTIFIED = { id: "progit-reset", title: "Pro Git: Reset Demystified (HEAD, index and working tree)", url: "https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified" };
const CHERRY = { id: "git-cherry-pick", title: "git-cherry-pick documentation (applying the change from existing commits)", url: "https://git-scm.com/docs/git-cherry-pick" };

export default definePack({
  id: "cherry-pick-reset",
  title: "Cherry-pick & Reset",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "terminal · git reset --hard HEAD~2", detail: "HEAD is now at 9e2c4ab; 3 modified files reverted" },
    lines: [
      { speaker: "kabir", line: "I wanted to undo my last two commits and redo them differently. I typed the command from a forum answer and my three unsaved files went with them." },
      { speaker: "meera", line: "Reset has three modes, and they differ in how much of your day they erase. The right one keeps the work and moves the label." },
    ],
  },
  predictions: [
    {
      id: "wiped",
      kind: "choice",
      prompt: "You have 3 files edited but not committed, and run git reset --hard HEAD~2. How many of those uncommitted files survive?",
      options: [
        { id: "3", label: "All three, Git keeps a backup" },
        { id: "0", label: "None: --hard overwrites the working tree" },
        { id: "1", label: "Only the staged one" },
      ],
      answer: "0",
      observe: "wiped",
      reveal: {
        text: "--hard makes the working tree match the target commit exactly. Edits that were never committed or stashed have no copy in Git, so nothing can restore them: 3 files lost. The two undone commits can be recovered from the reflog, and the uncommitted work cannot.",
        derived: true,
        line: { speaker: "rao", line: "Committed work is hard to lose. Uncommitted work is easy." },
      },
    },
    {
      id: "soft",
      kind: "choice",
      prompt: "Each commit changed 2 files. You run git reset --soft HEAD~2. How many files are staged afterwards?",
      options: [
        { id: "0", label: "None, the changes are in the working tree only" },
        { id: "4", label: "All 4: --soft leaves the index as it was" },
        { id: "2", label: "Just 2" },
      ],
      answer: "4",
      observe: "staged",
      reveal: {
        text: "--soft moves only the branch pointer, so the index still holds the state of the commits you undid: all 4 files staged, ready to commit again as one. --mixed also resets the index, so the same 4 files are changed on disk and unstaged. Pick soft to recommit as-is and mixed to choose what goes in.",
        derived: true,
        line: { speaker: "meera", line: "Soft keeps it staged. Mixed hands it back to you." },
      },
    },
  ],
  widget: { id: "reset-lab", config: CPR },
  mechanism: [
    {
      id: "areas",
      text: "Git tracks three areas. HEAD is the last commit on your branch. The index, or staging area, is what the next commit will contain. The working tree is the files on disk. Add copies the working tree into the index, commit turns the index into a commit, and reset moves the branch and optionally resets the other two to match.",
      sourceIds: ["progit-reset"],
    },
    {
      id: "modes",
      scene: "mixed",
      text: "Reset has three modes. --soft moves only the branch pointer, leaving the index and the files as they are. --mixed, the default, moves the pointer and resets the index, so the changes remain on disk but unstaged. --hard resets all three, discarding every change since the target, committed or not. Soft and mixed keep your work.",
      sourceIds: ["git-reset", "progit-reset"],
    },
    {
      id: "hard",
      scene: "hard",
      text: "Use --hard when you really mean to throw things away. Look at git status first, and stash or commit anything you want to keep. Commits removed by a hard reset are recoverable from the reflog for a while, and uncommitted changes are not. On a branch you have pushed, resetting and force-pushing rewrites shared history, so revert instead.",
      sourceIds: ["git-reset"],
    },
    {
      id: "cherry",
      scene: "soft",
      text: "Cherry-pick takes the change from a commit elsewhere and applies it as a new commit on your branch, with a new hash. It is how you move a bugfix onto a release branch without merging everything else. The same change then exists in two commits, so a later merge can conflict or duplicate; note what you picked and why.",
      sourceIds: ["git-cherry-pick"],
    },
  ],
  challenges: [
    {
      id: "undo-two",
      title: "Reset the branch",
      brief: "Undo the last two commits so their four files can be recommitted differently as unstaged edits, without destroying the three uncommitted files.",
      line: { speaker: "rao", line: "Move the label. Keep every file." },
      widget: { id: "reset-lab", config: CPR_CHALLENGE },
      conditions: [
        { metric: "commitsUndone", op: ">=", value: 2, label: "Two commits undone" },
        { metric: "lostWorkFiles", op: "<=", value: 0, label: "No uncommitted work destroyed" },
        { metric: "changesKept", op: ">=", value: 4, label: "The undone changes are kept as edits" },
        { metric: "stagedAfter", op: "<=", value: 0, label: "Nothing left staged" },
      ],
      stars: [],
      hints: ["Which modes keep the working tree?", "Which one leaves things staged?", "What does the default do?"],
    },
  ],
  explainBack: {
    prompt: "Explain git reset's three modes and cherry-pick.",
    rubric: [
      { id: "areas", criterion: "Git has HEAD, the index and the working tree; reset moves the branch and optionally resets the other two", keyIdea: "three areas" },
      { id: "modes", criterion: "--soft keeps index and files, --mixed resets the index and keeps files, --hard resets all and destroys uncommitted work", keyIdea: "soft, mixed, hard" },
      { id: "cherry", criterion: "Cherry-pick applies one commit's change as a new commit elsewhere, such as a fix to a release branch", keyIdea: "copy a change" },
    ],
    exemplar:
      "Git keeps three areas: HEAD, the index and the working tree, and reset moves the branch pointer and optionally resets the other two. --soft keeps the index and files, --mixed resets the index and keeps the files, and --hard resets all three and destroys uncommitted work. Cherry-pick applies one commit's change as a new commit on another branch, which is how a bugfix reaches a release branch.",
  },
  reviews: [
    {
      id: "cr-est",
      format: "estimate",
      scenario: "Each commit touched 2 files and you undo 3 commits with --soft. How many files are staged afterwards?",
      unit: "files",
      answer: 6,
      acceptFactor: 1,
      breakdown: ["3 commits × 2 files = 6", "--soft leaves them all staged"],
      explain: "Soft changes only the pointer, so the staged state is whatever the commits had.",
    },
    {
      id: "cr-pick",
      format: "pick-fix",
      scenario: "You committed to the wrong branch and want the commit on a new branch instead, with the old branch back where it was. Which approach is safest?",
      options: [
        { id: "a", label: "Create the new branch at HEAD, then git reset --hard the old branch back one commit" },
        { id: "b", label: "Delete the repository and clone again" },
        { id: "c", label: "Run git clean -fd" },
        { id: "d", label: "Rebase onto the wrong branch" },
      ],
      answer: "a",
      explain: "Naming the commit first keeps it. Then moving the old branch back is safe, as long as nothing else was uncommitted.",
    },
    {
      id: "cr-order",
      format: "order",
      scenario: "Order the reset modes by how much of your work they discard, least first.",
      items: [
        { id: "soft", label: "--soft" },
        { id: "mixed", label: "--mixed" },
        { id: "hard", label: "--hard" },
      ],
      answer: ["soft", "mixed", "hard"],
      explain: "Soft discards nothing, mixed discards the staging, hard discards the working tree too.",
    },
    {
      id: "cr-graph",
      format: "predict-graph",
      scenario: "With 3 uncommitted files, how do files destroyed by a reset change as the mode moves from soft to mixed to hard?",
      xLabel: "mode →",
      yLabel: "files destroyed",
      options: [
        { id: "late", label: "Zero, zero, then all three", points: [0, 0, 0, 0, 3, 3, 3, 3] },
        { id: "linear", label: "Rises evenly", points: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3] },
        { id: "flat", label: "Always zero", points: [0, 0, 0, 0, 0, 0, 0, 0] },
      ],
      answer: "late",
      explain: "Only --hard touches the working tree. The other two can never destroy uncommitted files.",
    },
    {
      id: "cr-flaw",
      format: "spot-flaw",
      scenario: "A bugfix commit on main must go onto release-1.4, which differs a lot from main. A developer merges main into release-1.4. Tap the problem.",
      diagram: {
        nodes: [
          { id: "fix", label: "one bugfix commit on main", kind: "store", col: 0, row: 1 },
          { id: "merge", label: "merge main into release-1.4", kind: "server", col: 1, row: 1 },
          { id: "rel", label: "release branch gains every main change", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "fix", to: "merge" },
          { from: "merge", to: "rel" },
        ],
      },
      answer: "merge->rel",
      explain: "A merge brings in everything on main, including unfinished features. Cherry-pick the one commit instead.",
    },
    {
      id: "cr-explain",
      format: "explain",
      scenario: "In two sentences: why can a hard reset lose uncommitted work when it cannot lose committed work?",
      rubric: [
        { id: "recorded", criterion: "Committed work is stored as objects, and the reflog remembers where the branch was, so a reset only moves a label" },
        { id: "uncommitted", criterion: "Uncommitted edits exist only in the working tree, and --hard overwrites it, with no object recording them" },
      ],
      exemplar: "Committed work is stored as objects and the reflog remembers where the branch was, so a reset only moves a label. Uncommitted edits exist only in the working tree, and --hard overwrites it with no object recording them.",
      explain: "Commit or stash before any hard operation.",
    },
  ],
  codex: {
    oneLiner: "Reset moves the branch and optionally the index and files: soft keeps both, mixed keeps files, hard keeps nothing. Cherry-pick copies one commit's change elsewhere.",
    keyNumbers: [
      { label: "Files staged after --soft HEAD~2, two files per commit", value: "4", sourceId: "git-reset" },
      { label: "Uncommitted files surviving --hard", value: "0", sourceId: "progit-reset" },
    ],
    tradeoffs: [
      { choice: "--soft", gain: "Recommit as one", cost: "Leaves everything staged" },
      { choice: "--mixed", gain: "Keeps edits, lets you re-stage", cost: "Must re-add" },
      { choice: "--hard", gain: "A clean slate", cost: "Destroys uncommitted work" },
    ],
    seenIn: ["Fixing a commit message or a commit split.", "Backporting a hotfix by cherry-pick."],
    interviewAngle: "Say: 'HEAD, index, working tree; soft, mixed, hard; commit or stash before hard; cherry-pick to backport a single fix'.",
    aws: [{ concept: "Release branches", service: "Any Git host with protected release branches" }],
    replay: { id: "reset-lab", config: CPR, scene: "soft" },
  },
  interview: [
    "What is the difference between reset --soft, --mixed and --hard?",
    "When would you cherry-pick?",
    "How would you undo a commit that has already been pushed?",
  ],
  deeper: [
    {
      title: "Undo on a shared branch",
      body: "Reset rewrites the branch, which is wrong for a branch others have pulled. To undo a pushed commit, use git revert: it adds a new commit that applies the opposite change, leaving history intact and safe to push. Reset is for local work. Revert is for shared history.",
      sourceIds: ["git-reset"],
    },
  ],
  honestPhysics: [
    "Each commit touched 2 files. --soft moves only the branch pointer and leaves the index as it was (the undone commits' files staged). --mixed also resets the index (files changed, unstaged). --hard resets the working tree too and destroys uncommitted edits.",
    "Three files are edited but not committed, and one may be staged. Commits removed by a reset can be recovered from the reflog; uncommitted edits discarded by --hard cannot. Round figures.",
  ],
  sources: [GIT_RESET, RESET_DEMYSTIFIED, CHERRY],
  verify: [
    { id: "hard", claim: "--hard destroys 3 uncommitted files", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "hard" }, metric: "lostWorkFiles" }, expect: { min: 3, max: 3 } },
    { id: "soft", claim: "--soft HEAD~2 leaves 4 files staged", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "soft" }, metric: "stagedAfter" }, expect: { min: 4, max: 4 } },
    { id: "mixed", claim: "--mixed leaves nothing staged and keeps the changes", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "mixed" }, metric: "stagedAfter" }, expect: { max: 0 } },
    { id: "kept", claim: "…keeping 4 files of changes", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "mixed" }, metric: "changesKept" }, expect: { min: 4, max: 4 } },
    { id: "lost0", claim: "…and destroying nothing", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "mixed" }, metric: "lostWorkFiles" }, expect: { max: 0 } },
    { id: "hard-kept", claim: "--hard keeps none of the undone changes", run: "lab", params: { model: "reset-lab", config: CPR_CHALLENGE, values: { mode: "hard" }, metric: "changesKept" }, expect: { max: 0 } },
  ],
});
