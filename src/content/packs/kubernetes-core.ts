import { definePack } from "../define";

export const KC = { start: { replicas: 6, maxUnavail: "25", maxSurge: "25", ready: true, spread: true } };
export const KC_CHALLENGE = { start: { replicas: 6, maxUnavail: "25", maxSurge: "25", ready: false, spread: false } };

const K8S_DEPLOY = { id: "k8s-deployments", title: "Kubernetes docs: Deployments (declared state, rolling update, maxSurge and maxUnavailable)", url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/" };
const K8S_SPREAD = { id: "k8s-topology-spread", title: "Kubernetes docs: Pod topology spread constraints", url: "https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/" };
const K8S_COMPONENTS = { id: "k8s-components", title: "Kubernetes docs: Cluster architecture (control plane, kubelet, controllers)", url: "https://kubernetes.io/docs/concepts/architecture/" };

export default definePack({
  id: "kubernetes-core",
  title: "Kubernetes Core",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "checkout · 503 for 4 minutes", detail: "node ip-10-0-3-17 lost; all 6 replicas were on it" },
    lines: [
      { speaker: "kabir", line: "We run six replicas for exactly this reason. One node failed and every one of them went with it." },
      { speaker: "meera", line: "Kubernetes keeps what you declared true, nothing more. Six copies somewhere is not the same as six copies in six places." },
    ],
  },
  predictions: [
    {
      id: "lost-all",
      kind: "choice",
      prompt: "Six replicas run on a three-node cluster and the scheduler happens to put all of them on one node. That node fails. How much capacity is left?",
      options: [
        { id: "67", label: "Two thirds, the other nodes carry on" },
        { id: "0", label: "None, until the pods are rescheduled" },
        { id: "50", label: "Half" },
      ],
      answer: "0",
      observe: "lost-all",
      reveal: {
        text: "Replicas protect against pod failure only if they are not all affected by the same failure. With no spread constraint the scheduler can place every replica on one node, and the cluster then needs minutes to notice and reschedule. With topology spread, replicas sit two per node and a node loss leaves 67%.",
        derived: true,
        line: { speaker: "rao", line: "Redundancy needs independence. Count the failure domains." },
      },
    },
    {
      id: "rollout",
      kind: "choice",
      prompt: "A rolling update with maxUnavailable 25% and maxSurge 25% on six replicas, and no readiness probe. The new pods take 30 s to boot but count as ready at once. What availability do users see at the lowest point?",
      options: [
        { id: "67", label: "About 67%, two pods are down" },
        { id: "47", label: "About 47%, traffic also reaches pods still booting" },
        { id: "100", label: "100%, Kubernetes handles it" },
      ],
      answer: "47",
      observe: "outage-deploy",
      reveal: {
        text: "Two pods can be down, leaving 67%. Without a readiness probe new pods get traffic the moment they start, while they cannot serve it, which costs another fifth of requests in the lab: 47%. A readiness probe keeps a pod out of the Service until it answers, and the rollout holds at 67%, or 100% with maxUnavailable 0.",
        derived: true,
        line: { speaker: "meera", line: "A pod that is running is not a pod that is ready." },
      },
    },
  ],
  widget: { id: "k8s-lab", config: KC },
  mechanism: [
    {
      id: "reconcile",
      text: "Kubernetes is a control loop. You declare the state you want, such as six copies of this container, and controllers compare it with what exists and create or delete pods until they match. A dead pod is replaced, and a dead node's pods are rescheduled.",
      sourceIds: ["k8s-deployments", "k8s-components"],
    },
    {
      id: "rolling",
      scene: "rolling",
      text: "A Deployment updates by rolling. It starts new pods and stops old ones in batches, bounded by maxSurge, the extra pods allowed, and maxUnavailable, the pods allowed to be down. With maxUnavailable at zero and some surge, capacity never drops below the target, and the rollout takes longer. The numbers trade speed against safety.",
      sourceIds: ["k8s-deployments"],
    },
    {
      id: "ready",
      scene: "readiness",
      text: "A rolling update is only as safe as the signal that a new pod is ready. A readiness probe tells the Service when a pod can take traffic. Without one, a pod counts as ready the moment its container starts, and users meet a half-started application. With one, rollouts take longer and users notice nothing.",
      sourceIds: ["k8s-deployments"],
    },
    {
      id: "spread",
      scene: "spread",
      text: "Copies need independent failure domains. The scheduler packs pods wherever they fit, which can be one node or one zone. Topology spread constraints or anti-affinity rules tell it to distribute replicas across nodes and zones, so a node or zone failure takes out a share of capacity and not all of it. Size the replica count to what is left.",
      sourceIds: ["k8s-topology-spread"],
    },
  ],
  challenges: [
    {
      id: "configure-deployment",
      title: "Configure the deployment",
      brief: "A rollout must not dip below 95% availability, finish within 90 seconds and never send traffic to unready pods. After losing a node, at least 65% of capacity must remain.",
      line: { speaker: "rao", line: "Deploy at noon without anyone noticing, and survive a node dying on the same afternoon." },
      widget: { id: "k8s-lab", config: KC_CHALLENGE },
      conditions: [
        { metric: "minAvailability", op: ">=", value: 0.95, label: "Availability never below 95%" },
        { metric: "rolloutSec", op: "<=", value: 90, label: "Rollout within 90 s" },
        { metric: "unreadyTraffic", op: "<=", value: 0, label: "No traffic to unready pods" },
        { metric: "afterNodeLoss", op: ">=", value: 0.65, label: "At least 65% capacity after losing a node" },
      ],
      stars: [{ metric: "rolloutSec", op: "<=", value: 60, label: "Rollout within 60 s" }],
      hints: ["What does maxUnavailable 0 need to move forward?", "Which setting takes unready pods off the traffic path?", "How many nodes do your replicas need to divide across evenly?"],
    },
  ],
  explainBack: {
    prompt: "Explain how Kubernetes keeps an application running and updates it safely.",
    rubric: [
      { id: "loop", criterion: "Controllers reconcile the declared state with the actual state, replacing failed pods and rescheduling from failed nodes", keyIdea: "reconciliation" },
      { id: "rollout", criterion: "Rolling updates are bounded by maxSurge and maxUnavailable and gated by readiness probes so traffic reaches only ready pods", keyIdea: "bounded, gated rollouts" },
      { id: "spread", criterion: "Replicas must be spread across nodes and zones, or one failure removes them all", keyIdea: "independent failure domains" },
    ],
    exemplar:
      "Controllers continually reconcile the declared state with the actual state, so failed pods are replaced and pods from a failed node are rescheduled. Rolling updates replace pods in batches bounded by maxSurge and maxUnavailable, and a readiness probe gates traffic so only ready pods receive it. Replicas also have to be spread across nodes and zones, otherwise one failure removes all of them.",
  },
  reviews: [
    {
      id: "kc-est",
      format: "estimate",
      scenario: "Nine replicas are spread evenly across three nodes. One node fails. What share of capacity is left?",
      unit: "%",
      answer: 66.7,
      acceptFactor: 1.02,
      breakdown: ["3 replicas per node", "9 − 3 = 6 remain; 6 ÷ 9 = 67%"],
      explain: "Spread turns a node failure into a one-third loss. Without spread it can be total.",
    },
    {
      id: "kc-pick",
      format: "pick-fix",
      scenario: "Each deploy causes a short burst of 502 errors, though pods start cleanly. The Deployment has no readiness probe. What is the fix?",
      options: [
        { id: "a", label: "Add a readiness probe so new pods only receive traffic once they answer" },
        { id: "b", label: "Add more replicas" },
        { id: "c", label: "Set maxUnavailable to 100%" },
        { id: "d", label: "Restart the Service" },
      ],
      answer: "a",
      explain: "Without a probe, a pod is added to the Service as soon as the container starts, before the app can answer.",
    },
    {
      id: "kc-order",
      format: "order",
      scenario: "Order these rollout settings by time to finish, longest first (readiness on, six replicas).",
      items: [
        { id: "slow", label: "maxUnavailable 0, maxSurge 25%: batches of 2" },
        { id: "mid", label: "maxUnavailable 0, maxSurge 50%: batches of 3" },
        { id: "fast", label: "maxUnavailable 50%, maxSurge 50%: one batch of 6" },
      ],
      answer: ["slow", "mid", "fast"],
      explain: "90 s, 60 s and 30 s, but the fastest one lets half the pods go down at once.",
    },
    {
      id: "kc-graph",
      format: "predict-graph",
      scenario: "With replicas spread evenly over three nodes, how does the capacity left after losing one node change as replicas rise from 3 to 12 (multiples of 3)?",
      xLabel: "replicas →",
      yLabel: "capacity left after a node loss",
      options: [
        { id: "flat", label: "Stays at two thirds", points: [67, 67, 67, 67, 67, 67, 67, 67] },
        { id: "rise", label: "Rises toward 100%", points: [67, 70, 75, 80, 85, 90, 95, 100] },
        { id: "fall", label: "Falls", points: [67, 60, 55, 50, 45, 40, 35, 30] },
      ],
      answer: "flat",
      explain: "With three nodes you always lose a third. More replicas means more capacity, and the fraction stays the same. More nodes would change the fraction.",
    },
    {
      id: "kc-flaw",
      format: "spot-flaw",
      scenario: "A Deployment sets replicas: 3, maxUnavailable: 1, and relies on defaults for scheduling. All three pods are running on node-a. Tap the weakness.",
      diagram: {
        nodes: [
          { id: "dep", label: "Deployment: 3 replicas", kind: "server", col: 0, row: 1 },
          { id: "a", label: "node-a: 3 pods", kind: "worker", col: 1, row: 0 },
          { id: "b", label: "node-b: 0 pods", kind: "worker", col: 1, row: 1 },
          { id: "c", label: "node-c: 0 pods", kind: "worker", col: 1, row: 2 },
        ],
        edges: [
          { from: "dep", to: "a" },
          { from: "dep", to: "b" },
          { from: "dep", to: "c" },
        ],
      },
      answer: "dep->a",
      explain: "All replicas share a failure domain. A topology spread constraint would place one on each node.",
    },
    {
      id: "kc-explain",
      format: "explain",
      scenario: "In two sentences: why does Kubernetes use a declared desired state instead of imperative commands?",
      rubric: [
        { id: "converge", criterion: "A controller can keep comparing and fixing, so the system converges back to the desired state after failures" },
        { id: "intent", criterion: "The declaration captures intent in a form that can be reviewed, stored and reapplied, instead of a sequence of one-off actions" },
      ],
      exemplar: "A controller can keep comparing the actual state with the desired one and fixing the difference, so the system converges back after failures. The declaration also captures intent in a form that can be reviewed, stored and reapplied, instead of a sequence of one-off commands.",
      explain: "Declare the outcome, and let the loop do the work.",
    },
  ],
  codex: {
    oneLiner: "Kubernetes reconciles declared state: it replaces failed pods, rolls updates in bounded batches gated by readiness, and needs replicas spread across failure domains.",
    keyNumbers: [
      { label: "Capacity left after a node loss, spread over 3 nodes (lab)", value: "67%", sourceId: "k8s-topology-spread" },
      { label: "Availability with maxUnavailable 0 and readiness (lab)", value: "100%", sourceId: "k8s-deployments" },
    ],
    tradeoffs: [
      { choice: "maxUnavailable 0", gain: "No capacity dip", cost: "Needs surge capacity; slower rollout" },
      { choice: "Readiness probes", gain: "Traffic only to ready pods", cost: "Each batch waits for the probe" },
      { choice: "Topology spread", gain: "Survives node and zone loss", cost: "Needs enough nodes; pods can become unschedulable" },
    ],
    seenIn: ["Every production Deployment manifest.", "Managed Kubernetes services: EKS, GKE, AKS."],
    interviewAngle: "Say: 'desired state and controllers; rolling updates bounded by surge and unavailable and gated by readiness; spread replicas across nodes and zones'.",
    aws: [{ concept: "Managed Kubernetes", service: "Amazon EKS" }],
    replay: { id: "k8s-lab", config: KC, scene: "spread" },
  },
  interview: [
    "How does a Kubernetes rolling update work?",
    "What happens when a node fails?",
    "Why do you need a readiness probe?",
  ],
  deeper: [
    {
      title: "Disruption budgets",
      body: "Voluntary disruptions, like draining a node for an upgrade, can evict several pods at once. A PodDisruptionBudget says how many replicas must stay available, and the drain waits when evicting would break it. Pair it with topology spread so a routine node upgrade cannot remove a service's capacity.",
      sourceIds: ["k8s-deployments"],
    },
  ],
  honestPhysics: [
    "A Deployment of N replicas on a cluster of three nodes. A rolling update replaces pods in batches of maxUnavailable plus maxSurge pods; the lowest availability is (N − maxUnavailable) ÷ N. With a readiness probe each batch takes 30 s; without one a pod counts as ready after 8 s but users lose about 30% of the batch's share of requests while it boots.",
    "Without a spread constraint every replica may sit on one node; with it replicas divide evenly, so losing a node removes at most ⌈N ÷ 3⌉. Round figures.",
  ],
  sources: [K8S_DEPLOY, K8S_SPREAD, K8S_COMPONENTS],
  verify: [
    { id: "no-spread", claim: "With every replica on one node, a node loss leaves nothing", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { spread: false }, metric: "afterNodeLoss" }, expect: { max: 0 } },
    { id: "spread", claim: "Spread across three nodes leaves two thirds", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { spread: true }, metric: "afterNodeLoss" }, expect: { min: 0.66, max: 0.67 } },
    { id: "no-ready", claim: "Without a readiness probe availability falls to 47%", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { ready: false }, metric: "minAvailability" }, expect: { min: 0.46, max: 0.48 } },
    { id: "ready", claim: "With one and 25% unavailable it holds at 67%", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { ready: true }, metric: "minAvailability" }, expect: { min: 0.66, max: 0.67 } },
    { id: "zero", claim: "maxUnavailable 0 with surge keeps availability at 100%", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { ready: true, spread: true, maxUnavail: "0", maxSurge: "50" }, metric: "minAvailability" }, expect: { min: 0.99 } },
    { id: "roll", claim: "…finishing in 60 seconds", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { ready: true, spread: true, maxUnavail: "0", maxSurge: "50" }, metric: "rolloutSec" }, expect: { min: 59, max: 61 } },
    { id: "slow", claim: "Surge 25% takes 90 seconds with six replicas", run: "lab", params: { model: "k8s-lab", config: KC_CHALLENGE, values: { ready: true, spread: true, maxUnavail: "0", maxSurge: "25" }, metric: "rolloutSec" }, expect: { min: 89, max: 91 } },
  ],
});
