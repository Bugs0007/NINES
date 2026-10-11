import { definePack } from "../define";

export const DI = { start: { base: "slim", multi: false, clean: false, ignore: false } };
export const DI_CHALLENGE = { start: { base: "full", multi: false, clean: false, ignore: false } };

const DOCKER_BP = { id: "docker-best-practices", title: "Docker docs: Building best practices", url: "https://docs.docker.com/build/building/best-practices/" };
const MULTISTAGE = { id: "docker-multistage", title: "Docker docs: Multi-stage builds", url: "https://docs.docker.com/build/building/multi-stage/" };
const OCI = { id: "oci-image", title: "OCI Image Format Specification (layers, manifests, configuration)", url: "https://github.com/opencontainers/image-spec/blob/main/spec.md" };

export default definePack({
  id: "docker-images-layers",
  title: "Images & Layers",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "registry · image api:latest · 2.2 GB · 38 s cold pull per node", detail: "autoscaler added 6 nodes during the spike" },
    lines: [
      { speaker: "kabir", line: "Our new nodes need almost a minute just to download the image, so the autoscaler is always late. The app itself is 125 megabytes." },
      { speaker: "meera", line: "An image is every layer anyone ever added, kept. Deleting a file in a later layer hides it and does not shrink anything." },
    ],
  },
  predictions: [
    {
      id: "fat",
      kind: "choice",
      prompt: "A Dockerfile starts from a full 1,000 MB base, adds a 600 MB build toolchain, leaves a 150 MB package cache and copies a project folder with 300 MB of git history and local dependencies, plus the 125 MB app. How big is the image?",
      options: [
        { id: "125", label: "About 125 MB, the app" },
        { id: "1000", label: "About 1 GB" },
        { id: "2175", label: "About 2.2 GB" },
      ],
      answer: "2175",
      observe: "fat-image",
      reveal: {
        text: "1,000 + 600 + 150 + 300 + 125 is 2,175 MB. Every layer stays in the image: the toolchain used at build time, the cache apt left behind and the junk copied from the context are all shipped to production and pulled onto every node.",
        derived: true,
        line: { speaker: "rao", line: "Size is the sum of everything ever added, not of what you meant to keep." },
      },
    },
    {
      id: "slim",
      kind: "choice",
      prompt: "You switch to a slim 150 MB base, build in a separate stage so only the result is copied, remove the package cache in the same instruction that created it, and add a .dockerignore. How big is the image now?",
      options: [
        { id: "275", label: "About 275 MB" },
        { id: "500", label: "About 500 MB" },
        { id: "125", label: "About 125 MB" },
      ],
      answer: "275",
      observe: "slim-image",
      reveal: {
        text: "150 for the base plus 125 for the app is 275 MB, an eighth of the original, and it pulls in 11 seconds instead of 87. The multi-stage build also leaves behind the compilers and 60 vulnerable packages that never needed to run in production.",
        derived: true,
        line: { speaker: "meera", line: "Ship what runs. Leave the workshop behind." },
      },
    },
  ],
  widget: { id: "image-lab", config: DI },
  mechanism: [
    {
      id: "layers",
      text: "An image is a stack of read-only layers. Most Dockerfile instructions that change the filesystem add a layer containing the difference. Layers are content-addressed and shared between images, so common bases are stored and pulled once. The image's size is the sum of its layers, and a file deleted in a later layer is still present in the one below.",
      sourceIds: ["oci-image", "docker-best-practices"],
    },
    {
      id: "multistage",
      scene: "multistage",
      text: "A multi-stage build uses one stage with compilers and tools to build the application, and a final stage that starts from a small base and copies only the result. Nothing from the earlier stages is shipped. This cuts size and also the number of installed packages, which cuts the attack surface and the vulnerability scanner's report.",
      sourceIds: ["docker-multistage"],
    },
    {
      id: "clean",
      scene: "clean",
      text: "Clean up in the same instruction that makes the mess. Installing packages and deleting the package manager's cache in one RUN keeps the cache out of the layer; a later RUN that deletes it hides it without reclaiming the space. A .dockerignore file keeps local dependencies, build outputs and version history out of the build context altogether.",
      sourceIds: ["docker-best-practices"],
    },
    {
      id: "base",
      scene: "base",
      text: "Choose the base deliberately. Slim variants of a distribution drop documentation and tools. Alpine is smaller still, with a different C library that can break prebuilt packages. Distroless images hold just the runtime and no shell, which is small and hard to attack and also hard to debug. Pin the version, and rebuild regularly for security patches.",
      sourceIds: ["docker-best-practices"],
    },
  ],
  challenges: [
    {
      id: "build-image",
      title: "Build the image",
      brief: "Ship an image of 300 MB or less with at most 50 known vulnerable packages and a compatibility cost of at most 0.5.",
      line: { speaker: "rao", line: "Small enough to pull in seconds and clean enough to pass the scanner." },
      widget: { id: "image-lab", config: DI_CHALLENGE },
      conditions: [
        { metric: "imageMB", op: "<=", value: 300, label: "Image at most 300 MB" },
        { metric: "vulnerabilities", op: "<=", value: 50, label: "At most 50 vulnerable packages" },
        { metric: "compatIssues", op: "<=", value: 0.5, label: "Compatibility cost at most 0.5" },
      ],
      stars: [{ metric: "imageMB", op: "<=", value: 200, label: "Image at most 200 MB" }],
      hints: ["What stays in the image that production never runs?", "Where must the cache be removed?", "Which small bases carry a compatibility cost?"],
    },
  ],
  explainBack: {
    prompt: "Explain how an image's size is determined and how to shrink it.",
    rubric: [
      { id: "layers", criterion: "An image is a stack of layers and its size is the sum of them; deleting a file in a later layer does not remove it from an earlier one", keyIdea: "layers only add" },
      { id: "shrink", criterion: "Use multi-stage builds, clean up in the same instruction, add a .dockerignore and choose a smaller base", keyIdea: "multi-stage, clean, ignore, base" },
      { id: "trade", criterion: "Smaller bases trade compatibility or debuggability; smaller images pull faster and have fewer vulnerable packages", keyIdea: "small has a price" },
    ],
    exemplar:
      "An image is a stack of layers and its size is the sum of them, and a file deleted in a later layer is still in an earlier one. To shrink it I would use a multi-stage build so compilers stay behind, clean up in the same instruction that creates the mess, add a .dockerignore and choose a smaller base. Smaller bases trade compatibility or ease of debugging, but they pull faster and carry fewer vulnerable packages.",
  },
  reviews: [
    {
      id: "di-est",
      format: "estimate",
      scenario: "A node pulls a 2,175 MB image at 25 MB/s. How long does the cold pull take, in seconds?",
      unit: "seconds",
      answer: 87,
      acceptFactor: 1.05,
      breakdown: ["2,175 ÷ 25 = 87 s", "against 11 s for a 275 MB image"],
      explain: "Image size is a direct cost in scale-up latency.",
    },
    {
      id: "di-pick",
      format: "pick-fix",
      scenario: "A Dockerfile runs 'RUN apt-get install -y build-essential' and, in a later line, 'RUN rm -rf /var/lib/apt/lists/*'. The image is still large. What is the fix?",
      options: [
        { id: "a", label: "Do the install and the cleanup in the same RUN instruction, and better, build in a separate stage" },
        { id: "b", label: "Run the rm command twice" },
        { id: "c", label: "Rename the image" },
        { id: "d", label: "Compress the registry" },
      ],
      answer: "a",
      explain: "The first RUN stored the files in its layer. A later delete adds a layer that hides them without freeing the space.",
    },
    {
      id: "di-order",
      format: "order",
      scenario: "Order these bases by known vulnerable packages, most first.",
      items: [
        { id: "full", label: "Full distribution" },
        { id: "slim", label: "Slim" },
        { id: "alpine", label: "Alpine" },
        { id: "distroless", label: "Distroless" },
      ],
      answer: ["full", "slim", "alpine", "distroless"],
      explain: "180, 40, 8 and 3 in the lab: fewer packages, fewer to patch.",
    },
    {
      id: "di-graph",
      format: "predict-graph",
      scenario: "As you apply four size habits in turn (slim base, multi-stage, same-layer cleanup, .dockerignore), how does image size change?",
      xLabel: "habits applied →",
      yLabel: "image MB",
      options: [
        { id: "steps", label: "Falls in steps, with the base and the toolchain the biggest", points: [2175, 1325, 725, 275, 275, 275, 275, 275] },
        { id: "linear", label: "Falls in equal steps", points: [2175, 1700, 1250, 800, 275, 275, 275, 275] },
        { id: "late", label: "Barely moves until the last habit", points: [2175, 2175, 2175, 2175, 275, 275, 275, 275] },
      ],
      answer: "steps",
      explain: "Each habit removes a different block: base 850 MB, toolchain 600, cache 150 and junk 300, in the order you apply them.",
    },
    {
      id: "di-flaw",
      format: "spot-flaw",
      scenario: "A Dockerfile copies the whole project directory, including .git, node_modules and local test data, then runs the build. Tap the problem.",
      diagram: {
        nodes: [
          { id: "ctx", label: "build context: project folder with .git and local deps", kind: "store", col: 0, row: 1 },
          { id: "copy", label: "COPY . .", kind: "server", col: 1, row: 1 },
          { id: "img", label: "production image", kind: "store", col: 2, row: 1 },
        ],
        edges: [
          { from: "ctx", to: "copy" },
          { from: "copy", to: "img" },
        ],
      },
      answer: "ctx->copy",
      explain: "Everything in the context is sent to the builder and copied in. A .dockerignore keeps history, local dependencies and secrets out of it.",
    },
    {
      id: "di-explain",
      format: "explain",
      scenario: "In two sentences: why does deleting a file in a later Dockerfile instruction not make the image smaller?",
      rubric: [
        { id: "layers", criterion: "Each layer is a read-only record of the changes from its instruction, and layers below are kept as they were" },
        { id: "hide", criterion: "A later delete only marks the file as removed in a new layer, so the earlier layer still contains its bytes" },
      ],
      exemplar: "Each layer is a read-only record of the changes from one instruction, and the layers below are kept exactly as they were. A later delete only marks the file as removed in a new layer, so the earlier layer still contains its bytes.",
      explain: "Layers add. They never subtract.",
    },
  ],
  codex: {
    oneLiner: "An image is a stack of layers summed in size. Multi-stage builds, same-layer cleanup, a .dockerignore and a small base cut size and attack surface.",
    keyNumbers: [
      { label: "Careless image vs tidy image (lab)", value: "2,175 MB vs 275 MB", sourceId: "docker-best-practices" },
      { label: "Cold pull at 25 MB/s (lab)", value: "87 s vs 11 s", sourceId: "oci-image" },
    ],
    tradeoffs: [
      { choice: "Alpine", gain: "Tiny", cost: "A different libc breaks some packages" },
      { choice: "Distroless", gain: "Small and hard to attack", cost: "No shell to debug with" },
      { choice: "Multi-stage builds", gain: "Leaves build tools behind", cost: "A longer Dockerfile" },
    ],
    seenIn: ["Every production Dockerfile that has been reviewed.", "Registry scanners that report vulnerable packages per layer."],
    interviewAngle: "Say: 'layers add; multi-stage, clean in the same layer, dockerignore and a small base; smaller images pull faster and scan cleaner'.",
    aws: [{ concept: "Image registry and scanning", service: "Amazon ECR with image scanning" }],
    replay: { id: "image-lab", config: DI, scene: "multistage" },
  },
  interview: [
    "How would you reduce the size of a Docker image?",
    "What is a multi-stage build?",
    "Why does 'rm' in a later layer not shrink an image?",
  ],
  deeper: [
    {
      title: "Reproducible and patched",
      body: "Small is one goal and current is another. Pin the base image by version or digest so builds are repeatable, and rebuild on a schedule so security fixes in the base reach production. Scan images in CI and fail on serious findings, and keep a record of which base each image used so a vulnerability can be traced to the services it affects.",
      sourceIds: ["docker-best-practices"],
    },
  ],
  honestPhysics: [
    "Base images are about 1,000 MB (full), 150 (slim), 60 (Alpine) and 40 (distroless) with about 180, 40, 8 and 3 known vulnerable packages. The application adds 125 MB. Skipping a multi-stage build ships a 600 MB toolchain with 60 more vulnerable packages, leaving the package cache adds 150 MB, and no .dockerignore adds 300 MB.",
    "Alpine costs 1 compatibility unit for libc differences, distroless 0.5 for having no shell. A cold pull at 25 MB/s takes size ÷ 25 seconds. Round figures.",
  ],
  sources: [DOCKER_BP, MULTISTAGE, OCI],
  verify: [
    { id: "fat", claim: "A careless image on a full base is 2,175 MB", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: {}, metric: "imageMB" }, expect: { min: 2175, max: 2175 } },
    { id: "pull", claim: "…and takes 87 seconds to pull", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: {}, metric: "pullSec" }, expect: { min: 86, max: 88 } },
    { id: "tidy", claim: "A tidy image on a slim base is 275 MB", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: { base: "slim", multi: true, clean: true, ignore: true }, metric: "imageMB" }, expect: { min: 275, max: 275 } },
    { id: "distroless", claim: "Distroless shrinks it to 165 MB with 3 vulnerable packages", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: { base: "distroless", multi: true, clean: true, ignore: true }, metric: "vulnerabilities" }, expect: { min: 3, max: 3 } },
    { id: "alpine", claim: "Alpine misses the compatibility target", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: { base: "alpine", multi: true, clean: true, ignore: true }, metric: "compatIssues" }, expect: { min: 1, max: 1 } },
    { id: "slim-only", claim: "A slim base without the other habits is still over 1 GB", run: "lab", params: { model: "image-lab", config: DI_CHALLENGE, values: { base: "slim" }, metric: "imageMB" }, expect: { min: 1000 } },
  ],
});
