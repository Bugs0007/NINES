import { definePack } from "../define";

export const DV = { start: { store: "named", backup: false, cloud: false } };
export const DV_CHALLENGE = { start: { store: "layer", backup: false, cloud: false } };

const VOLUMES = { id: "docker-volumes", title: "Docker docs: Volumes (persistent data, named volumes and bind mounts)", url: "https://docs.docker.com/engine/storage/volumes/" };
const STORAGE = { id: "docker-storage", title: "Docker docs: Storage overview (writable layer, volumes, bind mounts, tmpfs)", url: "https://docs.docker.com/engine/storage/" };
const PRUNE = { id: "docker-prune", title: "Docker docs: docker volume prune", url: "https://docs.docker.com/reference/cli/docker/volume/prune/" };

export default definePack({
  id: "docker-volumes",
  title: "Volumes & Persistence",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "complaint",
    alert: { severity: "page", title: "support · all customer uploads from the last 3 weeks are gone", detail: "after a routine redeploy" },
    lines: [
      { speaker: "kabir", line: "We redeployed with a new image and the uploads folder came up empty. The old container had weeks of files in it." },
      { speaker: "meera", line: "A container's own filesystem is scratch space that dies with the container. Anything you want to keep lives somewhere that outlives it." },
    ],
  },
  predictions: [
    {
      id: "recreate",
      kind: "choice",
      prompt: "A database writes into its container's own filesystem layer. Over a year the container restarts about 52 times and is recreated from a new image about 12 times. How many of those events lose the data?",
      options: [
        { id: "0", label: "None, restarts keep the data" },
        { id: "12", label: "About 13: every recreation, plus host loss" },
        { id: "64", label: "All 64" },
      ],
      answer: "12",
      observe: "recreate-wipe",
      reveal: {
        text: "A restart keeps the container, so its layer survives. A recreation builds a new container from the image, and the old container's layer is discarded with it: 12 events, plus the 0.5 a year the host is lost, 13 in all. With nightly backups each is a restore that loses about half a day of writes.",
        derived: true,
        line: { speaker: "rao", line: "Restart is not recreate. The difference is where your data went." },
      },
    },
    {
      id: "safe",
      kind: "choice",
      prompt: "You put the data on a named volume backed by a cloud disk and take a nightly backup. About how much unrecoverable loss and how many hours of writes lost a year?",
      options: [
        { id: "zero", label: "No unrecoverable loss and about 6 hours of writes a year" },
        { id: "some", label: "About 1 unrecoverable loss a year" },
        { id: "many", label: "About 13 losses a year" },
      ],
      answer: "zero",
      observe: "safe",
      reveal: {
        text: "The volume survives restarts, recreation and host loss because the disk is network-attached. The one event that deletes it is a prune of unused volumes, about 0.5 a year, and the nightly backup turns that into a restore that loses about 12 hours: 6 hours a year. Nothing is unrecoverable.",
        derived: true,
        line: { speaker: "meera", line: "A backup is the difference between a bad day and a lost year." },
      },
    },
  ],
  widget: { id: "volume-lab", config: DV },
  mechanism: [
    {
      id: "layer",
      scene: "layer",
      text: "A container writes into a thin writable layer on top of its image. That layer belongs to the container: it survives a restart, and it is deleted when the container is removed or recreated. A redeploy that creates a new container from a new image starts with an empty layer. Writes there are also slower, because of copy-on-write.",
      sourceIds: ["docker-storage"],
    },
    {
      id: "volume",
      scene: "volume",
      text: "To keep data, store it outside the container. A named volume is managed by Docker and survives recreation. A bind mount maps a host directory into the container, which is convenient for development and ties the container to that host's paths. A tmpfs mount is memory, fast and gone on restart. Choose by how long the data must live.",
      sourceIds: ["docker-volumes", "docker-storage"],
    },
    {
      id: "host",
      text: "Volumes on a host's local disk die with the host. If the machine is lost, a named volume goes with it unless its driver stores data on a network disk. For state that matters, run the database as a managed service or keep its volume on replicated storage. Containers are cattle, so the data must not live in them.",
      sourceIds: ["docker-volumes"],
    },
    {
      id: "backup",
      scene: "backup",
      text: "Backups cover what storage choices cannot: deleted volumes, corruption, mistakes. Take them on a schedule to storage outside the host, keep several generations and, most importantly, test a restore. A cleanup command that removes unused volumes will delete data that happens to be unattached, so name volumes and review before pruning.",
      sourceIds: ["docker-prune"],
    },
  ],
  challenges: [
    {
      id: "place-data",
      title: "Place the data",
      brief: "Lose no data permanently, no more than 10 hours of writes a year to restores, and write at 0.9× the speed of a named volume or better. The data starts in the container's own layer.",
      line: { speaker: "rao", line: "No more empty folders after a redeploy." },
      widget: { id: "volume-lab", config: DV_CHALLENGE },
      conditions: [
        { metric: "unrecoverableLosses", op: "<=", value: 0.1, label: "At most 0.1 unrecoverable losses a year" },
        { metric: "lostHoursPerYear", op: "<=", value: 10, label: "At most 10 hours of writes lost a year" },
        { metric: "writeSpeed", op: ">=", value: 0.9, label: "Write speed at least 0.9×" },
      ],
      stars: [],
      hints: ["Which storage survives a recreation?", "What survives losing the host?", "A managed database is safe and has a speed cost here."],
    },
  ],
  explainBack: {
    prompt: "Explain where a container's data goes and how to make it persist.",
    rubric: [
      { id: "layer", criterion: "The writable layer belongs to the container: it survives a restart and is lost when the container is recreated or removed", keyIdea: "the layer is scratch" },
      { id: "kinds", criterion: "Volumes, bind mounts and tmpfs outlive the container to different degrees; local volumes still die with the host", keyIdea: "outside the container, outside the host" },
      { id: "backup", criterion: "Back up outside the host, test restores, and be careful with prune; databases usually belong in a managed service", keyIdea: "backups and managed state" },
    ],
    exemplar:
      "The writable layer belongs to the container, so it survives a restart but is lost when the container is recreated or removed. To keep data I would use a volume or bind mount that outlives the container, and remember that a local one still dies with the host, so important state needs network storage or a managed database. I would back up outside the host, test restores and be careful with prune.",
  },
  reviews: [
    {
      id: "dv-est",
      format: "estimate",
      scenario: "A container is recreated 12 times a year and the host is lost 0.5 times. The data is in the container layer with no backup. How many data-loss events a year?",
      unit: "events",
      answer: 13,
      acceptFactor: 1.05,
      breakdown: ["12 recreations + 0.5 host losses + 0.5 prunes of the unused volume", "layer data is lost in each"],
      explain: "Restarts do not count; the layer survives them.",
    },
    {
      id: "dv-pick",
      format: "pick-fix",
      scenario: "A team keeps its production database in a container with a bind mount to /data on a single VM. What is the biggest remaining risk?",
      options: [
        { id: "a", label: "Losing the VM loses the data, so it needs replication, a managed database, or a tested off-host backup" },
        { id: "b", label: "Restarts lose data" },
        { id: "c", label: "The container cannot write to /data" },
        { id: "d", label: "Redeploys wipe the data" },
      ],
      answer: "a",
      explain: "The bind mount survives restarts and recreation. It does not survive the host.",
    },
    {
      id: "dv-order",
      format: "order",
      scenario: "Order these storage choices by the number of events a year that lose the live copy, most first.",
      items: [
        { id: "tmpfs", label: "tmpfs" },
        { id: "layer", label: "Container layer" },
        { id: "named", label: "Named volume on local disk" },
        { id: "db", label: "External managed database" },
      ],
      answer: ["tmpfs", "layer", "named", "db"],
      explain: "65, 13, 1 and 0 events a year.",
    },
    {
      id: "dv-graph",
      format: "predict-graph",
      scenario: "Hours of writes lost per year to restores, with a nightly backup, as you move the data from layer to bind mount to named volume on a cloud disk to a managed database.",
      xLabel: "storage →",
      yLabel: "hours lost",
      options: [
        { id: "fall", label: "Falls at each step to zero", points: [156, 6, 6, 0, 0, 0, 0, 0] },
        { id: "flat", label: "The same at each step", points: [156, 156, 156, 156, 156, 156, 156, 156] },
        { id: "rise", label: "Rises with each step", points: [0, 6, 12, 60, 120, 156, 156, 156] },
      ],
      answer: "fall",
      explain: "Backups bound the loss per event, and better storage reduces the number of events.",
    },
    {
      id: "dv-flaw",
      format: "spot-flaw",
      scenario: "A cleanup job runs 'docker volume prune -f' weekly to free disk. The database volume is only attached while its container runs, and the container was stopped for maintenance. Tap the problem.",
      diagram: {
        nodes: [
          { id: "job", label: "weekly cleanup: volume prune -f", kind: "worker", col: 0, row: 1 },
          { id: "vol", label: "db volume (container stopped)", kind: "store", col: 1, row: 1 },
          { id: "ctr", label: "database container", kind: "server", col: 2, row: 1 },
        ],
        edges: [
          { from: "job", to: "vol" },
          { from: "vol", to: "ctr" },
        ],
      },
      answer: "job->vol",
      explain: "Prune removes volumes not used by any container, and a stopped container's volume looks unused. Label volumes you must keep and never force-prune on a schedule.",
    },
    {
      id: "dv-explain",
      format: "explain",
      scenario: "In two sentences: why is a container's filesystem not a place to keep data?",
      rubric: [
        { id: "life", criterion: "The writable layer is tied to the container, so it is lost when the container is removed or recreated, as in every redeploy" },
        { id: "design", criterion: "Containers are meant to be replaceable, so state belongs in storage with its own life and backups" },
      ],
      exemplar: "The writable layer is tied to the container, so it is lost when the container is removed or recreated, which happens in every redeploy. Containers are meant to be replaceable, so state belongs in storage that has its own life and backups.",
      explain: "Replaceable compute, durable data.",
    },
  ],
  codex: {
    oneLiner: "The container layer dies with the container. Keep state in volumes or managed services, remember local disks die with the host, and back up off-host.",
    keyNumbers: [
      { label: "Layer data lost per year (lab)", value: "13 events", sourceId: "docker-storage" },
      { label: "Cloud-disk volume plus nightly backup (lab)", value: "0 unrecoverable, 6 hours lost", sourceId: "docker-volumes" },
    ],
    tradeoffs: [
      { choice: "Bind mount", gain: "Simple, visible on the host", cost: "Tied to one host's paths" },
      { choice: "Named volume", gain: "Docker-managed, portable across containers", cost: "Local volumes die with the host" },
      { choice: "Managed database", gain: "Survives everything", cost: "Network latency and a bill" },
    ],
    seenIn: ["Postgres and MySQL containers with a data volume.", "Compose files with named volumes."],
    interviewAngle: "Say: 'containers are disposable, data is not: volumes or a managed service, backups off the host, and prune carefully'.",
    aws: [{ concept: "Durable storage for containers", service: "Amazon EBS or EFS volumes; Amazon RDS" }],
    replay: { id: "volume-lab", config: DV, scene: "backup" },
  },
  interview: [
    "Where does a Docker container store its data?",
    "What is the difference between a volume and a bind mount?",
    "How would you run a database in a container safely?",
  ],
  deeper: [
    {
      title: "Should a database run in a container?",
      body: "It can, and for development it usually should. In production the question is who handles failover, backups, upgrades and storage. A managed database does all four for a fee. Running your own gives control at the price of owning those jobs, and a container adds nothing to the data's safety: the volume and the backups do.",
      sourceIds: ["docker-volumes"],
    },
  ],
  honestPhysics: [
    "Four events a year: the container restarts about 52 times, is recreated about 12 times, the host is lost about 0.5 times, and a prune deletes unused volumes about 0.5 times. The container layer survives only restarts; a bind mount survives restarts, recreation and prune; a named volume survives restarts and recreation, and the host only on a cloud disk; tmpfs survives nothing; an external database survives everything.",
    "A backup turns every other loss into a restore that loses about 12 hours of writes. Write speed is relative to a named volume: the layer 0.85, a bind mount 0.95, tmpfs 3, a networked database 0.6. Round figures.",
  ],
  sources: [VOLUMES, STORAGE, PRUNE],
  verify: [
    { id: "layer", claim: "Data in the container layer is lost 13 times a year", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: {}, metric: "lossEvents" }, expect: { min: 12.9, max: 13.1 } },
    { id: "named", claim: "A named volume on local disk loses it once a year", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "named" }, metric: "lossEvents" }, expect: { min: 0.9, max: 1.1 } },
    { id: "cloud", claim: "A cloud-disk named volume loses it half a year", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "named", cloud: true }, metric: "lossEvents" }, expect: { min: 0.4, max: 0.6 } },
    { id: "backup", claim: "With a backup that is 6 hours of writes lost a year", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "named", cloud: true, backup: true }, metric: "lostHoursPerYear" }, expect: { min: 5.9, max: 6.1 } },
    { id: "bind", claim: "A bind mount with a backup also meets the target", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "bind", backup: true }, metric: "lostHoursPerYear" }, expect: { max: 10 } },
    { id: "db", claim: "A managed database loses nothing but writes at 0.6×", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "db" }, metric: "writeSpeed" }, expect: { min: 0.59, max: 0.61 } },
    { id: "local-backup", claim: "A local named volume with a backup loses 12 hours a year, over the limit", run: "lab", params: { model: "volume-lab", config: DV_CHALLENGE, values: { store: "named", backup: true }, metric: "lostHoursPerYear" }, expect: { min: 11, max: 13 } },
  ],
});
