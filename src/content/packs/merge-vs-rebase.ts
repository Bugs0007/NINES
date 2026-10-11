import { definePack } from "../define";

export const MRV = { start: { strategy: "merge" } };
export const MRV_CHALLENGE = { lockShared: true, lockConflicts: true, shared: false, conflicts: 2, start: { strategy: "merge" } };

const ATLASSIAN = { id: "atlassian-merge-rebase", title: "Atlassian Git tutorial: Merging vs. Rebasing", url: "https://www.atlassian.com/git/tutorials/merging-vs-rebasing" };
const GIT_REBASE = { id: "git-rebase", title: "git-rebase documentation (the golden rule: do not rebase commits others have)", url: "https://git-scm.com/docs/git-rebase" };
const GIT_BISECT = { id: "git-bisect", title: "git-bisect documentation (finding the commit that introduced a bug)", url: "https://git-scm.com/docs/git-bisect" };

export default definePack({
  id: "merge-vs-rebase",
  title: "Merge vs Rebase",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "PR #418 · 'Merge branch main into feature' ×9", detail: "history graph is a ladder" },
    lines: [
      { speaker: "kabir", line: "Our history is nine merge commits deep and nobody can read it. Someone suggested rebase and someone else said it destroyed their branch last year." },
      { speaker: "meera", line: "Both are right. Merge keeps what happened and rebase tells a tidier story, and one of them rewrites commits other people may be standing on." },
    ],
  },
  predictions: [
    {
      id: "force",
      kind: "choice",
      prompt: "A teammate has branched off your feature branch. You rebase the feature branch onto main and force-push. What happens to their work?",
      options: [
        { id: "fine", label: "Nothing, Git reconciles it" },
        { id: "broken", label: "Their branch now sits on commits that no longer exist in yours, and they must repair it" },
        { id: "deleted", label: "Their commits are deleted" },
      ],
      answer: "broken",
      observe: "force-push",
      reveal: {
        text: "Rebase makes new commits (E', F', G') with new hashes and abandons E, F and G. Their branch still has the old ones as its base. When they pull, Git sees two histories, with the same changes twice, and gives them a confusing merge. Rewrite only commits no one else has based work on.",
        derived: true,
        line: { speaker: "rao", line: "Never rewrite what others are standing on." },
      },
    },
    {
      id: "squash",
      kind: "choice",
      prompt: "You squash-merge a three-commit feature, then a bug appears that came from it. How many commits can git bisect separate for you?",
      options: [
        { id: "3", label: "All three, the history is kept" },
        { id: "1", label: "One: the squash is a single commit" },
        { id: "0", label: "None" },
      ],
      answer: "1",
      observe: "squash-loss",
      reveal: {
        text: "A squash replaces E, F and G with one commit S on main, so the three steps no longer exist there. Bisect can say the bug arrived in S and no more. The original commits survive on the deleted branch only until they expire. Squash buys a readable history and sells the ability to pinpoint within a change.",
        derived: true,
        line: { speaker: "meera", line: "Tidy history is a feature. So is the granularity you throw away." },
      },
    },
  ],
  widget: { id: "merge-lab", config: MRV },
  mechanism: [
    {
      id: "merge",
      scene: "merge",
      text: "A merge joins two lines of history with a new commit that has two parents. Nothing is rewritten: the feature's commits keep their hashes and their dates, and the graph shows the branch and the join. It is safe on shared branches. The cost is a busier graph, especially with many merges of main into a feature branch.",
      sourceIds: ["atlassian-merge-rebase"],
    },
    {
      id: "rebase",
      scene: "rebase",
      text: "A rebase takes your commits and replays them one at a time on top of the target branch, creating new commits with new hashes. The result is a straight line. Each replayed commit that conflicts needs its own resolution, and the old commits become unreachable. Because it rewrites history, it is for commits only you have.",
      sourceIds: ["git-rebase", "atlassian-merge-rebase"],
    },
    {
      id: "squash",
      scene: "squash",
      text: "A squash merge collapses the whole branch into one commit on the target. The history is linear and each commit on main is a whole feature, easy to read and to revert. You lose the individual steps, so git bisect can only point at the whole feature. It works well for small, tidy features and less well for large ones.",
      sourceIds: ["atlassian-merge-rebase", "git-bisect"],
    },
    {
      id: "policy",
      text: "Pick a policy and write it down. Common ones: rebase your private branch onto main before opening a review, then merge or squash into main; never rewrite a branch others use; protect main from force-pushes. The choice matters less than everyone following the same one, and that the graph can still tell you when and why a change arrived.",
      sourceIds: ["atlassian-merge-rebase"],
    },
  ],
  challenges: [
    {
      id: "integrate-branch",
      title: "Integrate the branch",
      brief: "Your private feature branch has two conflicting commits. End with a linear history, keep all three commits individually bisectable, and resolve conflicts no more than twice.",
      line: { speaker: "rao", line: "A straight line I can bisect." },
      widget: { id: "merge-lab", config: MRV_CHALLENGE },
      conditions: [
        { metric: "linearHistory", op: ">=", value: 1, label: "History is linear" },
        { metric: "bisectableCommits", op: ">=", value: 3, label: "Three commits bisectable" },
        { metric: "conflictRounds", op: "<=", value: 2, label: "At most 2 conflict resolutions" },
        { metric: "teammateBreakage", op: "<=", value: 0, label: "No broken teammates" },
      ],
      stars: [],
      hints: ["Which strategy leaves a merge commit?", "Which collapses the commits?", "Which replays each commit?"],
    },
  ],
  explainBack: {
    prompt: "Compare merge, rebase and squash.",
    rubric: [
      { id: "merge", criterion: "Merge joins histories with a merge commit, rewrites nothing, is safe for shared branches and leaves a busier graph", keyIdea: "merge preserves" },
      { id: "rebase", criterion: "Rebase replays commits as new ones for a linear history, with per-commit conflicts, and must not be used on commits others have", keyIdea: "rebase rewrites" },
      { id: "squash", criterion: "Squash makes one commit per feature: clean and revertable, with coarse bisect", keyIdea: "squash flattens" },
    ],
    exemplar:
      "A merge joins the histories with a merge commit, rewrites nothing and is safe on shared branches, at the cost of a busier graph. A rebase replays my commits as new ones for a linear history, with conflicts resolved commit by commit, and it must not be used on commits that others have based work on. A squash makes one commit per feature, which is clean and easy to revert but makes bisect coarse.",
  },
  reviews: [
    {
      id: "mr-est",
      format: "estimate",
      scenario: "A feature branch has three commits, and two of them conflict with changes on main. How many conflict resolutions does a rebase need, and how many does a merge need?",
      unit: "resolutions (rebase)",
      answer: 2,
      acceptFactor: 1,
      breakdown: ["Rebase replays each commit, and each conflicting commit stops for a resolution: 2", "A merge resolves everything once: 1"],
      explain: "Rebase can ask you the same question several times, one per commit that touches the same lines.",
    },
    {
      id: "mr-pick",
      format: "pick-fix",
      scenario: "A long-lived release branch used by five people needs the latest main. Which is the safest way to bring it in?",
      options: [
        { id: "a", label: "Merge main into the release branch" },
        { id: "b", label: "Rebase the release branch onto main and force-push" },
        { id: "c", label: "Squash the release branch" },
        { id: "d", label: "Delete and recreate the branch" },
      ],
      answer: "a",
      explain: "Merging rewrites nothing, so the other four people's copies stay valid.",
    },
    {
      id: "mr-order",
      format: "order",
      scenario: "Order these by the number of times you resolve conflicts, most first.",
      items: [
        { id: "r3", label: "Rebase, 3 conflicting commits" },
        { id: "r2", label: "Rebase, 2 conflicting commits" },
        { id: "merge", label: "Merge, any number of conflicts" },
        { id: "r0", label: "Rebase, no conflicts" },
      ],
      answer: ["r3", "r2", "merge", "r0"],
      explain: "3, 2, 1 and 0. A merge resolves everything once, however many commits conflicted.",
    },
    {
      id: "mr-graph",
      format: "predict-graph",
      scenario: "As the number of feature commits that conflict with main rises from 0 to 3, how do the conflict resolutions needed change for rebase?",
      xLabel: "conflicting commits →",
      yLabel: "resolutions",
      options: [
        { id: "linear", label: "Rises one for one", points: [0, 1, 2, 3, 3, 3, 3, 3] },
        { id: "flat", label: "Stays at one", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "zero", label: "Stays at zero", points: [0, 0, 0, 0, 0, 0, 0, 0] },
      ],
      answer: "linear",
      explain: "Each conflicting commit stops the rebase for a resolution. A merge needs one however many conflict.",
    },
    {
      id: "mr-flaw",
      format: "spot-flaw",
      scenario: "A team lets everyone rebase and force-push any branch, including a shared 'develop' branch, to keep it tidy. Tap the practice that causes problems.",
      diagram: {
        nodes: [
          { id: "dev1", label: "developer 1 rebases and force-pushes develop", kind: "client", col: 0, row: 1 },
          { id: "remote", label: "shared develop branch", kind: "store", col: 1, row: 1 },
          { id: "dev2", label: "developers 2 to 5, with old copies", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "dev1", to: "remote" },
          { from: "remote", to: "dev2" },
        ],
      },
      answer: "dev1->remote",
      explain: "Force-pushing a shared branch rewrites history under everyone else. Protect shared branches from force-pushes and rebase only private work.",
    },
    {
      id: "mr-explain",
      format: "explain",
      scenario: "In two sentences: why is rebasing a branch that others use dangerous?",
      rubric: [
        { id: "new", criterion: "Rebase creates new commits with new hashes and abandons the old ones, so histories diverge" },
        { id: "others", criterion: "Others' copies still contain the old commits, so their next pull produces duplicated changes and confusing conflicts" },
      ],
      exemplar: "Rebase creates new commits with new hashes and abandons the old ones, so the histories diverge. Everyone else's copy still contains the old commits, so their next pull produces duplicated changes and confusing conflicts.",
      explain: "Rewriting is safe only for history nobody else has.",
    },
  ],
  codex: {
    oneLiner: "Merge preserves history, rebase replays it as a straight line, squash flattens a branch to one commit. Never rewrite commits others have.",
    keyNumbers: [
      { label: "Commits bisect can separate after a squash of three", value: "1", sourceId: "git-bisect" },
      { label: "Rebase conflict stops for three conflicting commits", value: "up to 3", sourceId: "git-rebase" },
    ],
    tradeoffs: [
      { choice: "Merge", gain: "Safe, preserves context", cost: "Busier graph" },
      { choice: "Rebase", gain: "Linear, readable log", cost: "Rewrites history; repeated conflicts" },
      { choice: "Squash", gain: "One commit per feature, easy revert", cost: "Coarse bisect; loses steps" },
    ],
    seenIn: ["Pull request merge buttons: merge, squash, rebase.", "Team contributing guides."],
    interviewAngle: "Say: 'merge keeps, rebase rewrites for a line, squash flattens; rebase only private history; pick one policy and protect shared branches'.",
    aws: [{ concept: "Branch protection", service: "GitHub or GitLab protected branches and merge methods" }],
    replay: { id: "merge-lab", config: MRV, scene: "rebase" },
  },
  interview: [
    "What is the difference between merge and rebase?",
    "When is it safe to rebase?",
    "Why might a team prefer squash merges?",
  ],
  deeper: [
    {
      title: "Keeping your branch current",
      body: "While a feature branch is open, main moves. You can merge main into the branch or rebase the branch on main. Merging main in repeatedly produces the ladder of merge commits in the hook. Rebasing a private branch before review keeps it clean. Either way, update early and often, because small conflicts are easier than one large one at the end.",
      sourceIds: ["atlassian-merge-rebase"],
    },
  ],
  honestPhysics: [
    "A feature branch of three commits (E, F, G) made while main moved by two. A merge adds a merge commit (history not linear, nothing rewritten, conflicts resolved once). A rebase replays the commits as E', F', G' (linear, each conflicting commit resolved separately). A squash makes one commit (linear, one resolution).",
    "Bisect granularity is the number of commits that can be tested individually: 3 for merge and rebase, 1 for squash. Rebasing a branch that others use breaks their copies. Round figures.",
  ],
  sources: [ATLASSIAN, GIT_REBASE, GIT_BISECT],
  verify: [
    { id: "merge", claim: "A merge is not linear", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "merge" }, metric: "linearHistory" }, expect: { max: 0 } },
    { id: "squash-bisect", claim: "A squash leaves bisect one commit", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "squash" }, metric: "bisectableCommits" }, expect: { min: 1, max: 1 } },
    { id: "rebase-linear", claim: "A rebase is linear with three bisectable commits", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "rebase" }, metric: "bisectableCommits" }, expect: { min: 3, max: 3 } },
    { id: "rebase-rounds", claim: "…and two conflict resolutions", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "rebase" }, metric: "conflictRounds" }, expect: { min: 2, max: 2 } },
    { id: "shared", claim: "Rebasing a shared branch breaks teammates", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "rebase", shared: true }, metric: "teammateBreakage" }, expect: { min: 1, max: 1 } },
    { id: "rewritten", claim: "A rebase rewrites three commits", run: "lab", params: { model: "merge-lab", config: MRV_CHALLENGE, values: { strategy: "rebase" }, metric: "rewrittenCommits" }, expect: { min: 3, max: 3 } },
  ],
});
