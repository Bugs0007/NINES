import { defineField } from "../types";

export default defineField({
  id: "field-gh-actions",
  title: "Field: CI for Your Own App",
  estimatedMinutes: 45,
  xp: 200,
  brief: [
    { speaker: "kabir", line: "I only find out something is broken when I deploy it." },
    { speaker: "meera", line: "Then have a machine run your checks on every push. Make it fast enough that you do not skip it." },
  ],
  goal: "Add a GitHub Actions workflow to a repository of yours that lints, tests and builds on every push and pull request, with dependency caching, and show a green run.",
  needs: ["A GitHub repository with a test command and a build command", "Permission to add .github/workflows", "A text editor"],
  steps: [
    {
      id: "trigger",
      title: "Run on push and on pull request",
      detail: "Create .github/workflows/ci.yml. Trigger it on pushes to your main branch and on every pull request. Add a concurrency group so a newer push cancels an older run of the same branch.",
    },
    {
      id: "jobs",
      title: "Lint, test and build as separate steps",
      detail: "Check out the code, set up your language with its version pinned, install dependencies with the lockfile (npm ci, pip with a lock file), then run lint, test and build in that order, so the cheapest check fails first.",
      commands: ["- uses: actions/checkout@v4", "- uses: actions/setup-node@v4\n  with:\n    node-version: 22\n    cache: npm", "- run: npm ci && npm run lint && npm test && npm run build"],
    },
    {
      id: "cache",
      title: "Cache the dependencies",
      detail: "Use the setup action's built-in cache or actions/cache keyed on the lockfile hash. Run the workflow twice and compare the install step times.",
    },
    {
      id: "matrix",
      title: "Add a matrix",
      detail: "Run the tests on two language versions or two operating systems using strategy.matrix. Keep fail-fast on unless you want every combination reported.",
    },
    {
      id: "break",
      title: "Make it fail on purpose",
      detail: "Push a commit with a failing test on a branch, open a pull request, and see the check go red. Then fix it and see it go green.",
    },
  ],
  criteria: [
    { id: "trigger", criterion: "Workflow runs on push and pull_request, with concurrency cancelling stale runs" },
    { id: "steps", criterion: "Runs checkout, setup, a lockfile install, lint, test and build in order" },
    { id: "cache", criterion: "Dependencies are cached and a second run's install is faster" },
    { id: "green", criterion: "Shows a successful run, and ideally a red-then-green pair" },
  ],
  hints: [
    { text: "The workflow file lives at .github/workflows/<name>.yml. The on: key sets triggers, jobs: holds the work, and each job lists steps.", cost: 15 },
    { text: "npm ci installs exactly what the lockfile says and fails if it is out of date, which is what you want in CI.", cost: 15 },
    { text: "The cache key should include the lockfile hash, so it changes exactly when the dependencies do.", cost: 20 },
  ],
  proof: {
    prompt: "Paste your workflow file (or its main parts), and a line from the run page or the gh run list output showing it completed successfully, with the install time of two runs.",
    placeholder: "name: ci\non:\n  push:\n  pull_request:\nconcurrency: ...\njobs:\n  ...\ngh run list: completed success ...\ninstall: 41s then 6s",
    checks: [
      { id: "on", label: "Has triggers (on: push / pull_request)", pattern: "on:[\\s\\S]*(push|pull_request)" },
      { id: "checkout", label: "Uses actions/checkout", pattern: "actions/checkout" },
      { id: "cache", label: "Caches dependencies", pattern: "(cache:|actions/cache)" },
      { id: "steps", label: "Runs a test and a build", pattern: "test[\\s\\S]*build" },
      { id: "green", label: "Shows a successful run", pattern: "(success|completed|passed|green)" },
    ],
    sample:
      "name: ci\non:\n  push:\n    branches: [main]\n  pull_request:\nconcurrency:\n  group: ci-${{ github.ref }}\n  cancel-in-progress: true\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n          cache: npm\n      - run: npm ci\n      - run: npm run lint\n      - run: npm test\n      - run: npm run build\ngh run list: completed success ci main 1m12s\ninstall: 41s on the first run, 6s on the second (cache hit)",
  },
  debrief: [
    "CI is a promise that the main branch builds and passes on a clean machine. Pinning versions and installing from the lockfile is what makes the promise mean something.",
    "A check people wait for gets skipped. Caching, ordering the cheap steps first and cancelling stale runs are what keep it fast enough to trust.",
  ],
  honestPhysics: ["Run times depend on the runner and on how busy GitHub is. A cache hit is not guaranteed on every run; the key decides when it applies."],
  sources: [
    { id: "gha-syntax", title: "GitHub Docs: Workflow syntax for GitHub Actions", url: "https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions" },
    { id: "gha-cache", title: "GitHub Docs: Caching dependencies to speed up workflows", url: "https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows" },
  ],
});
