import { definePack } from "../define";

export const DC = { start: { depsFirst: true, ciCache: true, mount: false, pin: true } };
export const DC_CHALLENGE = { start: { depsFirst: false, ciCache: false, mount: false, pin: false } };

const BUILD_CACHE = { id: "docker-build-cache", title: "Docker docs: Build cache (how invalidation works)", url: "https://docs.docker.com/build/cache/" };
const CACHE_OPT = { id: "docker-cache-opt", title: "Docker docs: Optimize cache usage in builds (layer order, cache mounts, external backends)", url: "https://docs.docker.com/build/cache/optimize/" };
const CACHE_BACKENDS = { id: "docker-cache-backends", title: "Docker docs: Cache storage backends (registry, local, GitHub Actions)", url: "https://docs.docker.com/build/cache/backends/" };

export default definePack({
  id: "dockerfile-cache",
  title: "Dockerfile Build Cache",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "CI · median build 2m 02s for a one-line change", detail: "step 5/8: pip install (cache miss)" },
    lines: [
      { speaker: "kabir", line: "I changed one line of code and CI spent two minutes reinstalling every dependency. Every build does this, and the team has stopped waiting for them." },
      { speaker: "meera", line: "Docker caches each step and throws away everything after the first step that changed. Put what changes rarely first." },
    ],
  },
  predictions: [
    {
      id: "busted",
      kind: "choice",
      prompt: "The Dockerfile copies the whole project before installing dependencies, and CI keeps the cache. You change one line of code. Steps take 20 s (base), 60 s (system packages), 90 s (dependencies) and 32 s (copy and build). How long is the build?",
      options: [
        { id: "32", label: "About 32 seconds" },
        { id: "122", label: "About 122 seconds" },
        { id: "202", label: "About 202 seconds, a full rebuild" },
      ],
      answer: "122",
      observe: "busted",
      reveal: {
        text: "The copy step's input changed, so it and everything after it rebuild, including the 90-second dependency install: 122 seconds. Copying only the dependency manifest first, installing, and then copying the source leaves the install cached and the same change takes 32 seconds.",
        derived: true,
        line: { speaker: "rao", line: "The cache breaks at the first changed input, and everything below pays." },
      },
    },
    {
      id: "cold",
      kind: "choice",
      prompt: "The Dockerfile is well ordered, but CI runners start from an empty disk each run and nothing is shared. How long does a one-line change take?",
      options: [
        { id: "32", label: "About 32 seconds, the ordering handles it" },
        { id: "122", label: "About 122 seconds" },
        { id: "202", label: "About 202 seconds, every layer rebuilds" },
      ],
      answer: "202",
      observe: "cold-ci",
      reveal: {
        text: "A cache that is not there cannot hit. Ephemeral runners rebuild all layers each time: 20 + 60 + 90 + 32 is 202 seconds. Exporting the cache to a registry or the CI provider's cache and importing it at the start brings back the 32-second case.",
        derived: true,
        line: { speaker: "meera", line: "Order is half of the answer. Where the cache lives is the other half." },
      },
    },
  ],
  widget: { id: "cache-build-lab", config: DC },
  mechanism: [
    {
      id: "how",
      text: "Docker builds a Dockerfile step by step. For each step it checks whether it has already run the same instruction on the same inputs, and if so reuses the stored layer. The first step whose instruction or files differ rebuilds, and because later layers sit on top of it, every step after it rebuilds too.",
      sourceIds: ["docker-build-cache"],
    },
    {
      id: "order",
      scene: "order",
      text: "So order steps from least to most likely to change: base image, system packages, dependency manifest, dependency install, then the source and the build. Copy only the files an install step needs before running it, such as the lockfile. The common change, to application code, then reuses all the expensive layers.",
      sourceIds: ["docker-cache-opt"],
    },
    {
      id: "ci",
      scene: "ci",
      text: "Build caches are local to the machine that made them. Hosted CI runners are often fresh, so a perfect Dockerfile still builds cold. Export the cache to a registry, a persistent volume or the CI provider's store, and import it at the start of each run. Pin the base image so it does not change under you.",
      sourceIds: ["docker-cache-backends"],
    },
    {
      id: "mount",
      scene: "mount",
      text: "Some invalidation cannot be avoided: a new dependency changes the manifest and reinstalls everything. A cache mount keeps the package manager's download cache between builds, so only the new package is fetched and the install takes a fraction of the time. The mount is a build-time convenience and does not end up in the image.",
      sourceIds: ["docker-cache-opt"],
    },
  ],
  challenges: [
    {
      id: "order-dockerfile",
      title: "Order the Dockerfile",
      brief: "Get a code-only change under 40 seconds, a dependency change under 60 seconds, and the average build under 38 seconds.",
      line: { speaker: "rao", line: "Most commits change code. Make them fast." },
      widget: { id: "cache-build-lab", config: DC_CHALLENGE },
      conditions: [
        { metric: "srcBuildSec", op: "<=", value: 40, label: "Code change under 40 s" },
        { metric: "depBuildSec", op: "<=", value: 60, label: "Dependency change under 60 s" },
        { metric: "expectedBuildSec", op: "<=", value: 38, label: "Average build under 38 s" },
      ],
      stars: [{ metric: "expectedBuildSec", op: "<=", value: 36.5, label: "Average build under 36.5 s" }],
      hints: ["What is rebuilt on a code change today?", "Is the cache there when CI starts?", "How often does the base image change?"],
    },
  ],
  explainBack: {
    prompt: "Explain how the Docker build cache works and how to take advantage of it.",
    rubric: [
      { id: "how", criterion: "Each step is cached by its instruction and inputs; the first changed step rebuilds along with every later step", keyIdea: "first change invalidates the rest" },
      { id: "order", criterion: "Order steps from least to most volatile and copy only the manifest before installing dependencies", keyIdea: "stable first" },
      { id: "ci", criterion: "Persist the cache across ephemeral CI runners and use cache mounts so installs are incremental", keyIdea: "keep the cache and mount it" },
    ],
    exemplar:
      "Each step is cached by its instruction and its inputs, and the first step that changes rebuilds along with every step after it. So I order steps from least to most volatile and copy only the dependency manifest before installing, so a code change reuses the expensive layers. On ephemeral CI I would persist the cache in a registry or the CI store, and use a cache mount so even a dependency change only fetches what is new.",
  },
  reviews: [
    {
      id: "dc-est",
      format: "estimate",
      scenario: "A well-ordered build takes 32 s for a code change, 57 s for a dependency change with a cache mount, and 137 s for a base image change. 87% of commits are code, 12% dependencies and 1% base. What is the average build time?",
      unit: "seconds",
      answer: 36,
      acceptFactor: 1.05,
      breakdown: ["0.87 × 32 = 27.8", "0.12 × 57 = 6.8", "0.01 × 137 = 1.4", "total ≈ 36 s"],
      explain: "The common case dominates the average. Speeding up code-only builds matters most.",
    },
    {
      id: "dc-pick",
      format: "pick-fix",
      scenario: "Builds on a hosted CI runner always take the full 200 seconds, though the Dockerfile is ordered well. What is the likely cause and fix?",
      options: [
        { id: "a", label: "The runner is fresh each time: export the layer cache to a registry and import it at the start" },
        { id: "b", label: "The image is too small" },
        { id: "c", label: "The Dockerfile has too few steps" },
        { id: "d", label: "The base image is too new" },
      ],
      answer: "a",
      explain: "Layer cache lives on the builder's disk. A fresh machine has none unless you bring it.",
    },
    {
      id: "dc-order",
      format: "order",
      scenario: "Order these Dockerfile steps from first to last for the best cache behaviour.",
      items: [
        { id: "base", label: "FROM the pinned base image" },
        { id: "manifest", label: "COPY the dependency manifest and lockfile" },
        { id: "install", label: "RUN the dependency install" },
        { id: "src", label: "COPY the application source" },
      ],
      answer: ["base", "manifest", "install", "src"],
      explain: "Least volatile first. The manifest changes only when dependencies do, and the source changes with every commit.",
    },
    {
      id: "dc-graph",
      format: "predict-graph",
      scenario: "As a Dockerfile's steps are ordered from most to least volatile, how does the build time after a code-only change vary with where the dependency install sits (earlier or later than the source copy)?",
      xLabel: "install placed later →",
      yLabel: "build time after a code change",
      options: [
        { id: "drop", label: "Falls sharply once the install is before the source copy", points: [122, 122, 122, 32, 32, 32, 32, 32] },
        { id: "linear", label: "Falls steadily", points: [122, 105, 88, 71, 54, 37, 32, 32] },
        { id: "flat", label: "Stays level", points: [122, 122, 122, 122, 122, 122, 122, 122] },
      ],
      answer: "drop",
      explain: "It is a threshold: either the source copy is above the install, and the install reruns, or below, and it does not.",
    },
    {
      id: "dc-flaw",
      format: "spot-flaw",
      scenario: "A Dockerfile begins 'FROM python:latest', then 'COPY . .', then 'RUN pip install -r requirements.txt'. Tap the first thing that wrecks caching.",
      diagram: {
        nodes: [
          { id: "from", label: "FROM python:latest", kind: "store", col: 0, row: 1 },
          { id: "copy", label: "COPY . .", kind: "server", col: 1, row: 1 },
          { id: "pip", label: "RUN pip install", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "from", to: "copy" },
          { from: "copy", to: "pip" },
        ],
      },
      answer: "copy->pip",
      explain: "Any file change invalidates the copy, and the install after it reruns on every commit. Copy the requirements file alone first. The unpinned base is a second, rarer problem.",
    },
    {
      id: "dc-explain",
      format: "explain",
      scenario: "In two sentences: why does a changed early step slow down the whole build?",
      rubric: [
        { id: "stack", criterion: "Each layer is built on top of the one before, so its result depends on everything below it" },
        { id: "invalidate", criterion: "When an early step changes, the cached layers above it are no longer valid and must be rebuilt" },
      ],
      exemplar: "Each layer is built on top of the one before it, so its result depends on everything below. When an early step changes, the cached layers above it are no longer valid and must all be rebuilt.",
      explain: "Order by how often things change.",
    },
  ],
  codex: {
    oneLiner: "Each step is cached; the first changed step rebuilds everything after it. Order stable steps first, persist the cache in CI, and use cache mounts.",
    keyNumbers: [
      { label: "Code change, bad order vs good order (lab)", value: "122 s vs 32 s", sourceId: "docker-cache-opt" },
      { label: "Cold CI runner (lab)", value: "202 s every build", sourceId: "docker-cache-backends" },
    ],
    tradeoffs: [
      { choice: "Dependencies first", gain: "Fast code-only builds", cost: "A slightly longer Dockerfile" },
      { choice: "Remote cache", gain: "Warm builds on fresh runners", cost: "Cache transfer time and storage" },
      { choice: "Pinned base", gain: "Repeatable builds", cost: "Must update on purpose" },
    ],
    seenIn: ["Every CI pipeline that builds images.", "Docker BuildKit cache mounts and cache exporters."],
    interviewAngle: "Say: 'stable layers first, manifest before source, persist the cache across runners, cache mount for packages, pinned bases'.",
    aws: [{ concept: "Build with remote cache", service: "AWS CodeBuild with Docker layer caching or an ECR cache" }],
    replay: { id: "cache-build-lab", config: DC, scene: "mount" },
  },
  interview: [
    "How does Docker's build cache work?",
    "Why do builds on CI sometimes ignore the cache?",
    "How would you speed up a slow image build?",
  ],
  deeper: [
    {
      title: "Secrets and the cache",
      body: "A secret passed as a build argument or copied in can end up in a layer and in the cache, visible to anyone with the image. Use build secrets, which are mounted for one step and never stored, and rotate anything that was ever baked in. Caching and secrets interact: a cached layer built with an old secret keeps it.",
      sourceIds: ["docker-cache-opt"],
    },
  ],
  honestPhysics: [
    "The steps: pull the base 20 s, install system packages 60 s, install dependencies 90 s (25 s with a cache mount), copy the source 2 s, build and test 30 s. A code change after good ordering costs 32 s, and cold builds take 202 s.",
    "Commits are 81% code only, 12% dependency changes and 6% base changes (1% if the base is pinned to a version you update on purpose). Without a persistent cache on CI every build is cold. Round figures.",
  ],
  sources: [BUILD_CACHE, CACHE_OPT, CACHE_BACKENDS],
  verify: [
    { id: "bad", claim: "A bad order makes a code change cost 122 seconds", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: false, ciCache: true }, metric: "srcBuildSec" }, expect: { min: 121, max: 123 } },
    { id: "good", claim: "A good order makes it 32 seconds", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: true, ciCache: true }, metric: "srcBuildSec" }, expect: { min: 31, max: 33 } },
    { id: "cold", claim: "A cold CI runner makes it 202 seconds regardless", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: true, ciCache: false }, metric: "srcBuildSec" }, expect: { min: 201, max: 203 } },
    { id: "mount", claim: "A cache mount cuts a dependency change to 57 seconds", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: true, ciCache: true, mount: true }, metric: "depBuildSec" }, expect: { min: 56, max: 58 } },
    { id: "all", claim: "Order, cache, mount and a pinned base average 36 seconds", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: true, ciCache: true, mount: true, pin: true }, metric: "expectedBuildSec" }, expect: { min: 35, max: 37 } },
    { id: "unpinned", claim: "An unpinned base misses the average target", run: "lab", params: { model: "cache-build-lab", config: DC_CHALLENGE, values: { depsFirst: true, ciCache: true, mount: true, pin: false }, metric: "expectedBuildSec" }, expect: { min: 38 } },
  ],
});
