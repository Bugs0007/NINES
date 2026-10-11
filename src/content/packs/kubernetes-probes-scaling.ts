import { definePack } from "../define";

export const KP = { start: { memLimit: 768, liveDelay: 60, readiness: true, hpaTarget: 80, minReplicas: 4 } };
export const KP_CHALLENGE = { start: { memLimit: 256, liveDelay: 10, readiness: false, hpaTarget: 50, minReplicas: 1 } };

const K8S_PROBES = { id: "k8s-probes", title: "Kubernetes docs: Liveness, readiness and startup probes", url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/" };
const K8S_RESOURCES = { id: "k8s-resources", title: "Kubernetes docs: Resource management for pods and containers (requests, limits, OOMKilled)", url: "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/" };
const K8S_HPA = { id: "k8s-hpa", title: "Kubernetes docs: Horizontal Pod Autoscaling", url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/" };

export default definePack({
  id: "kubernetes-probes-scaling",
  title: "Probes, Limits & HPA",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "api-7c9f · CrashLoopBackOff · restarts: 41", detail: "last state: OOMKilled, exit code 137" },
    lines: [
      { speaker: "kabir", line: "The new service restarts every forty seconds. The logs show nothing wrong, then the pod just ends." },
      { speaker: "meera", line: "Exit code 137 is the kernel saying you went over your memory limit. The limit, not the code, is what changed." },
    ],
  },
  predictions: [
    {
      id: "crashloop",
      kind: "choice",
      prompt: "A service peaks at 600 MB and takes 40 s to start. You set a 256 MB memory limit and a liveness probe that starts checking after 10 s. What happens?",
      options: [
        { id: "fine", label: "It runs, the limits are just guidance" },
        { id: "loop", label: "It is killed over and over and never stays up" },
        { id: "slow", label: "It runs slowly" },
      ],
      answer: "loop",
      observe: "crashloop",
      reveal: {
        text: "Two things kill it. A memory limit below the peak makes the kernel kill the container (OOMKilled), and a liveness probe that starts before the app is up fails and makes the kubelet restart a healthy container. Kubernetes waits longer between each restart, so the pod spends its life in CrashLoopBackOff.",
        derived: true,
        line: { speaker: "rao", line: "A limit is not a hint. It is a kill switch with a number on it." },
      },
    },
    {
      id: "spike",
      kind: "choice",
      prompt: "Traffic jumps from 100 to 400 requests per second. Each pod handles 100 at full CPU. With one minimum replica and an 80% autoscaler target, the autoscaler reacts after about 45 s and new pods need 40 s. About how many requests are dropped?",
      options: [
        { id: "0", label: "None, the autoscaler handles it" },
        { id: "27000", label: "About 27,000" },
        { id: "340000", label: "About 340,000" },
      ],
      answer: "27000",
      observe: "spike-drops",
      reveal: {
        text: "Before scaling, one pod at an 80% target gives 80 requests a second against 400 of demand, a deficit of 320 for the 85 seconds it takes to detect the spike and start pods: 27,200 dropped requests. Autoscaling reacts to load that has already arrived, so it needs headroom, a higher minimum or faster signals.",
        derived: true,
        line: { speaker: "meera", line: "The autoscaler is a reaction. The minimum replica count is your plan." },
      },
    },
  ],
  widget: { id: "probes-lab", config: KP },
  mechanism: [
    {
      id: "limits",
      scene: "limits",
      text: "Resource requests tell the scheduler what a pod needs, and limits cap what it may use. A container over its memory limit is killed by the kernel and restarted. Set the memory limit above the real peak with margin and the CPU request near typical use, measured and not guessed.",
      sourceIds: ["k8s-resources"],
    },
    {
      id: "probes",
      scene: "liveness",
      text: "Probes let Kubernetes ask the container how it is. Readiness says whether to send it traffic, and liveness whether to restart it. A startup probe holds the others off until a slow application has booted. A liveness probe that fires before the app is up kills healthy containers, so delay it past the boot time.",
      sourceIds: ["k8s-probes"],
    },
    {
      id: "hpa",
      scene: "hpa",
      text: "The horizontal pod autoscaler watches a metric, usually average CPU against a target, and sets the replica count to keep it near the target. A low target leaves headroom and costs more pods. It reacts only after load arrives: metrics lag, pods need time to start, and a sudden jump meets the capacity you already have.",
      sourceIds: ["k8s-hpa"],
    },
    {
      id: "plan",
      text: "Size for the surprise. Set the minimum replica count to carry the load you expect between scale-ups, pick the target for the headroom your spikes need, and make start-up fast so new capacity arrives sooner. Check with a load test that ramps traffic up the way production does, and watch for restarts and pods stuck pending.",
      sourceIds: ["k8s-hpa", "k8s-probes"],
    },
  ],
  challenges: [
    {
      id: "configure-pod",
      title: "Configure the pod",
      brief: "Stop the crash loop, and survive the 100 to 400 requests a second spike dropping at most 13,000 requests, with no more than three pods running at idle.",
      line: { speaker: "rao", line: "No restarts, no outage, and I do not want to pay for twelve idle pods." },
      widget: { id: "probes-lab", config: KP_CHALLENGE },
      conditions: [
        { metric: "oomKills", op: "<=", value: 0, label: "Not killed for memory" },
        { metric: "livenessKills", op: "<=", value: 0, label: "Not killed by an early liveness probe" },
        { metric: "droppedRequests", op: "<=", value: 13000, label: "At most 13,000 requests dropped" },
        { metric: "basePods", op: "<=", value: 3, label: "At most 3 pods at idle" },
      ],
      stars: [{ metric: "droppedRequests", op: "<=", value: 10000, label: "At most 10,000 requests dropped" }],
      hints: ["What does the memory peak need?", "How long does the app take to boot?", "What gives the most capacity before the autoscaler reacts?"],
    },
  ],
  explainBack: {
    prompt: "Explain probes, resource limits and autoscaling, and how they go wrong.",
    rubric: [
      { id: "limits", criterion: "A memory limit below the real peak makes the kernel kill the container, causing CrashLoopBackOff; set limits from measured peaks", keyIdea: "limits from measurements" },
      { id: "probes", criterion: "Readiness gates traffic, liveness restarts; a liveness probe that starts too early kills a healthy slow-starting app", keyIdea: "probe delays match start-up" },
      { id: "hpa", criterion: "The autoscaler reacts after load arrives, so a spike meets existing capacity; set the minimum and the target for headroom", keyIdea: "autoscaling lags" },
    ],
    exemplar:
      "A memory limit below the real peak makes the kernel kill the container, which shows up as CrashLoopBackOff, so I set limits from measured peaks with margin. Readiness gates traffic and liveness restarts the container, and a liveness probe that starts before a slow app has booted kills it needlessly, so its delay must exceed the start-up time. The autoscaler reacts only after load arrives, so the minimum replicas and the target have to provide headroom for the spike.",
  },
  reviews: [
    {
      id: "kp-est",
      format: "estimate",
      scenario: "Demand jumps to 400 requests a second. Three pods at an 80% target give 240 a second. For the 85 seconds before scaling, how many requests are dropped?",
      unit: "requests",
      answer: 13600,
      acceptFactor: 1.03,
      breakdown: ["deficit = 400 − 240 = 160 a second", "160 × 85 = 13,600"],
      explain: "Dropped requests are the deficit times the time to react. Raise the capacity or shorten the reaction.",
    },
    {
      id: "kp-pick",
      format: "pick-fix",
      scenario: "A slow-starting Java service is killed repeatedly right after deploy, though it works if you exec in and wait. Liveness checks begin after 10 s and boot takes 50 s. What is the fix?",
      options: [
        { id: "a", label: "Use a startup probe, or a liveness initial delay longer than the boot time" },
        { id: "b", label: "Increase the memory limit" },
        { id: "c", label: "Remove the readiness probe" },
        { id: "d", label: "Add more replicas" },
      ],
      answer: "a",
      explain: "The liveness probe sees a service that has not started yet and concludes it is dead. Give it the time to start.",
    },
    {
      id: "kp-order",
      format: "order",
      scenario: "Order these setups by requests dropped in the 100 to 400 spike, most first (readiness on).",
      items: [
        { id: "one", label: "Minimum 1 pod, 80% target" },
        { id: "two", label: "Minimum 2 pods, 80% target" },
        { id: "three", label: "Minimum 3 pods, 80% target" },
        { id: "four", label: "Minimum 4 pods, 80% target" },
      ],
      answer: ["one", "two", "three", "four"],
      explain: "27,200, 20,400, 13,600 and 6,800.",
    },
    {
      id: "kp-graph",
      format: "predict-graph",
      scenario: "As the autoscaler's CPU target rises from 40% to 90% with three minimum pods, how do the requests dropped in a spike change?",
      xLabel: "target →",
      yLabel: "requests dropped",
      options: [
        { id: "fall", label: "Fall, because the pods are allowed to run hotter before scaling", points: [23800, 21250, 18700, 16150, 13600, 11050, 9775, 8500] },
        { id: "rise", label: "Rise, because there is less headroom", points: [8500, 9775, 11050, 13600, 16150, 18700, 21250, 23800] },
        { id: "flat", label: "Do not change", points: [20000, 20000, 20000, 20000, 20000, 20000, 20000, 20000] },
      ],
      answer: "fall",
      explain: "In this model the target sets the capacity before scaling: at 90% each pod serves 90 requests a second. A higher target buys that capacity with less headroom against bursts of CPU, latency and noisy neighbours in real life.",
    },
    {
      id: "kp-flaw",
      format: "spot-flaw",
      scenario: "A service has a liveness probe that calls the database. The database has a brief outage. Tap what goes wrong.",
      diagram: {
        nodes: [
          { id: "db", label: "database outage (30 s)", kind: "db", col: 0, row: 1 },
          { id: "live", label: "liveness probe: checks the database", kind: "server", col: 1, row: 1 },
          { id: "pods", label: "all pods restarted", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "db", to: "live" },
          { from: "live", to: "pods" },
        ],
      },
      answer: "live->pods",
      explain: "Restarting pods cannot fix a database, and every healthy pod is killed at once. Liveness should check the process itself; dependency checks belong in readiness at most.",
    },
    {
      id: "kp-explain",
      format: "explain",
      scenario: "In two sentences: what is the difference between liveness and readiness probes?",
      rubric: [
        { id: "ready", criterion: "Readiness decides whether a pod receives traffic; a failing pod is removed from the Service but not restarted" },
        { id: "live", criterion: "Liveness decides whether a pod is broken beyond recovery; a failing pod is restarted" },
      ],
      exemplar: "Readiness decides whether a pod receives traffic, so a failing pod is taken out of the Service without being restarted. Liveness decides whether a pod is broken beyond recovery, so a failing one is restarted.",
      explain: "One removes from traffic. The other restarts.",
    },
  ],
  codex: {
    oneLiner: "Limits from measured peaks, readiness to gate traffic, liveness delayed past boot time, and an autoscaler that reacts late: size the minimum for the spike.",
    keyNumbers: [
      { label: "Exit code 137", value: "killed, often OOM", sourceId: "k8s-resources" },
      { label: "Autoscaler reaction plus pod start (lab)", value: "about 85 s", sourceId: "k8s-hpa" },
    ],
    tradeoffs: [
      { choice: "Low CPU target", gain: "Headroom for spikes", cost: "More pods at idle" },
      { choice: "Tight memory limit", gain: "Dense packing", cost: "OOM kills at the peak" },
      { choice: "Aggressive liveness", gain: "Quick restart of a stuck process", cost: "Kills slow starters and loaded pods" },
    ],
    seenIn: ["CrashLoopBackOff investigations.", "Autoscaling configurations that lag real spikes."],
    interviewAngle: "Say: 'requests and limits from measurements, readiness gates traffic, liveness only checks the process after a startup delay, and the HPA is reactive so set a minimum for the spike'.",
    aws: [{ concept: "Autoscaling pods and nodes", service: "EKS with HPA and Karpenter or Cluster Autoscaler" }],
    replay: { id: "probes-lab", config: KP, scene: "hpa" },
  },
  interview: [
    "What causes CrashLoopBackOff?",
    "What is the difference between liveness and readiness probes?",
    "Why does autoscaling not protect you from a sudden spike?",
  ],
  deeper: [
    {
      title: "Autoscaling nodes as well as pods",
      body: "Adding pods needs room for them. When no node has space, pods stay pending until a node autoscaler adds a machine, which takes minutes. For spiky services keep spare capacity, with low-priority placeholder pods that real pods can evict, so scaling is limited by pod start-up and not by buying a server.",
      sourceIds: ["k8s-hpa"],
    },
  ],
  honestPhysics: [
    "A pod uses 600 MB at peak and takes 40 s to start. A memory limit below 600 MB gets it killed at every start, and a liveness delay under 40 s does the same. Demand jumps from 100 to 400 requests a second; each pod handles 100 at full CPU, so capacity before scaling is minimum replicas × 100 × the target.",
    "The autoscaler reacts after about 45 s and new pods need 40 s, so the shortfall is dropped for 85 s. Without a readiness probe traffic also reaches pods still booting, and drops are 40% higher. Round figures.",
  ],
  sources: [K8S_PROBES, K8S_RESOURCES, K8S_HPA],
  verify: [
    { id: "oom", claim: "A 256 MB limit is below the 600 MB peak and gets OOM-killed", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: {}, metric: "oomKills" }, expect: { min: 1 } },
    { id: "live", claim: "A 10 s liveness delay is shorter than the 40 s boot and kills the pod", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768 }, metric: "livenessKills" }, expect: { min: 1 } },
    { id: "fixed", claim: "A 768 MB limit and a 60 s delay stop the loop", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768, liveDelay: 60 }, metric: "oomKills" }, expect: { max: 0 } },
    { id: "drops1", claim: "One minimum replica at 80% drops about 27,200 requests in the spike", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768, liveDelay: 60, readiness: true, hpaTarget: 80, minReplicas: 1 }, metric: "droppedRequests" }, expect: { min: 27000, max: 27400 } },
    { id: "drops3", claim: "Three minimum replicas drop 13,600", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768, liveDelay: 60, readiness: true, hpaTarget: 80, minReplicas: 3 }, metric: "droppedRequests" }, expect: { min: 13500, max: 13700 } },
    { id: "no-ready", claim: "Without a readiness probe drops are 40% higher", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768, liveDelay: 60, readiness: false, hpaTarget: 80, minReplicas: 3 }, metric: "droppedRequests" }, expect: { min: 18800, max: 19200 } },
    { id: "target85", claim: "A target of 85% with three replicas brings drops under 13,000", run: "lab", params: { model: "probes-lab", config: KP_CHALLENGE, values: { memLimit: 768, liveDelay: 60, readiness: true, hpaTarget: 85, minReplicas: 3 }, metric: "droppedRequests" }, expect: { max: 13000 } },
  ],
});
