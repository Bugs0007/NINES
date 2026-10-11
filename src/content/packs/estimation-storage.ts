import { definePack } from "../define";

const SDP = { id: "sdp-estimation", title: "System Design Primer: Back-of-the-envelope calculations (powers of two, byte sizes)", url: "https://github.com/donnemartin/system-design-primer#back-of-the-envelope-calculations" };

export const STORAGE_PLAY = {
  title: "Pigeon · message storage after five years",
  answerLabel: "Total storage",
  answerMin: 1e9,
  answerMax: 1e17,
  answerFmt: "bytes",
  mode: "faded",
  given: ["replicas"],
  chain: "messages per day × bytes each × days kept × copies",
  steps: [
    { id: "msgsPerDay", label: "Messages per day", min: 1e5, max: 1e11, truth: 8e7 },
    { id: "bytesPerMsg", label: "Stored bytes per message", min: 10, max: 1e5, truth: 250, fmt: "bytes" },
    { id: "days", label: "Days kept", min: 1, max: 5000, truth: 1825 },
    { id: "replicas", label: "Copies kept", min: 1, max: 10, truth: 3, fmt: "x" },
  ],
  start: { msgsPerDay: 1e6, bytesPerMsg: 20, days: 30 },
};

export const STORAGE_SOLO = {
  title: "Pigeon · one year of photos",
  answerLabel: "Photo storage after a year",
  answerMin: 1e9,
  answerMax: 1e17,
  answerFmt: "bytes",
  mode: "solo",
  hideTruth: true,
  chain: "photos per day × bytes stored per photo × days kept",
  steps: [
    { id: "photosPerDay", label: "Photos per day", min: 1e4, max: 1e9, truth: 1.5e6 },
    { id: "bytesPerPhoto", label: "Bytes stored per photo", min: 1e3, max: 1e8, truth: 5e5, fmt: "bytes" },
    { id: "days", label: "Days kept", min: 1, max: 5000, truth: 365 },
  ],
};

export default definePack({
  id: "estimation-storage",
  title: "Estimation: Storage & Bandwidth",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "complaint",
    alert: { severity: "warn", title: "Finance · storage budget", detail: "needs a number for the board deck" },
    lines: [
      { speaker: "rao", line: "The board wants to know what five years of messages will cost to keep. I said 'a lot', and they did not laugh." },
      { speaker: "meera", line: "Then count bytes the same way you counted requests: per item, per day, per year." },
    ],
  },
  predictions: [
    {
      id: "five-years",
      kind: "numeric",
      prompt: "Pigeon stores 80 million messages a day at about 250 bytes each, keeps them for five years, and keeps 3 copies. Roughly how much storage is that?",
      unit: "TB",
      min: 1,
      max: 10000,
      log: true,
      answer: 110,
      tolerance: 1.6,
      observe: "close",
      reveal: {
        text: "80 million times 250 bytes is 20 GB a day. Five years is 1,825 days, so about 36 TB. Three copies makes about 110 TB.",
        derived: true,
        line: { speaker: "kabir", line: "A hundred terabytes. That is a few drives, not a data centre." },
      },
    },
  ],
  widget: { id: "estimate-lab", config: STORAGE_PLAY },
  mechanism: [
    {
      id: "chain",
      scene: "chain",
      text: "Storage is items per day times bytes per item times days kept times copies. Pick a believable bytes-per-item by writing out what one record holds: text, ids, timestamps, and index overhead.",
      derived: true,
    },
    {
      id: "units",
      scene: "round",
      text: "Keep the unit ladder in your head: a thousand bytes is a kilobyte, a million a megabyte, a billion a gigabyte, a trillion a terabyte. 20 GB a day over 1,825 days is 36,500 GB, which is 36.5 TB.",
      sourceIds: ["sdp-estimation"],
    },
    {
      id: "bandwidth",
      text: "Bandwidth is requests per second times bytes per response. 50 responses a second of 200 KB each is 10 MB a second, which is 80 megabits a second. Multiply bytes by 8 for bits, because network links are quoted in bits.",
      derived: true,
    },
    {
      id: "scope",
      text: "Decide what counts before you multiply: raw data or with indexes, with replicas or without, hot storage or archive. A factor of three from replication and a factor of two from indexes are bigger than most rounding errors.",
    },
  ],
  challenges: [
    {
      id: "photo-year",
      title: "Budget the photo year",
      brief: "Pigeon photos: 1.5 million photos a day, about 500 KB stored per photo (original plus thumbnails), kept for one year with no extra copies counted. Estimate total storage. Within a factor of two wins.",
      line: { speaker: "rao", line: "Give me one number I can put next to a price per terabyte." },
      widget: { id: "estimate-lab", config: STORAGE_SOLO },
      conditions: [{ metric: "factor", op: "<=", value: 2, label: "Within 2× of the reference" }],
      stars: [{ metric: "factor", op: "<=", value: 1.25, label: "Within 25%" }],
      hints: [
        "How many bytes arrive per day: photos times bytes each?",
        "A year is 365 days. Multiply the daily bytes by that.",
        "Convert to terabytes at the end. A trillion bytes is a terabyte.",
      ],
    },
  ],
  explainBack: {
    prompt: "How do you estimate how much storage a product needs after a few years, and what do you decide before multiplying?",
    rubric: [
      { id: "chain", criterion: "Multiplies items per day, bytes per item, and days kept", keyIdea: "rate × size × time" },
      { id: "scope", criterion: "Decides scope first: replicas, indexes, hot versus archive", keyIdea: "decide what counts" },
      { id: "bits", criterion: "Notes that bandwidth is bytes times 8 for bits, or checks the result against a unit ladder", keyIdea: "units" },
    ],
    exemplar:
      "I multiply the items per day by the bytes each one occupies, then by how long I keep them, and then by the number of copies. First I decide what counts: with indexes or without, replicas, hot versus archive. For bandwidth I multiply requests per second by response size and convert bytes to bits.",
  },
  reviews: [
    {
      id: "es-est-day",
      format: "estimate",
      scenario: "A service stores 10 million events a day at 1 KB each. How many GB of new data is that per day?",
      unit: "GB",
      answer: 10,
      acceptFactor: 1.3,
      breakdown: ["10,000,000 × 1,000 bytes", "= 10,000,000,000 bytes", "= 10 GB"],
      explain: "Million times kilobyte is gigabyte. A good rule to keep: 1M × 1KB = 1GB.",
    },
    {
      id: "es-est-bw",
      format: "estimate",
      scenario: "An API returns 200 KB responses at 50 requests per second. About how many megabits per second of bandwidth is that?",
      unit: "Mbps",
      answer: 80,
      acceptFactor: 1.3,
      breakdown: ["50 × 200 KB = 10 MB/s", "× 8 bits per byte", "= 80 Mbps"],
      explain: "Network links are quoted in bits. Forgetting the factor of eight is the classic miss.",
    },
    {
      id: "es-est-year",
      format: "estimate",
      scenario: "A table gains 5 GB a day and nothing is ever deleted. About how many terabytes after two years?",
      unit: "TB",
      answer: 3.65,
      acceptFactor: 1.3,
      breakdown: ["5 GB × 730 days", "= 3,650 GB", "= 3.65 TB"],
      explain: "Two years is about 730 days. 5 GB a day for 730 days is under 4 TB, which fits on a single disk.",
    },
    {
      id: "es-pick",
      format: "pick-fix",
      scenario: "Your estimate: 36 TB of messages. The database team says the real disk need is closer to 220 TB. What accounts for most of the gap?",
      options: [
        { id: "a", label: "Messages are bigger than 250 bytes in text" },
        { id: "b", label: "Replicas, indexes, and headroom multiply the raw data several times" },
        { id: "c", label: "Disks are measured in bits" },
        { id: "d", label: "Compression adds size" },
      ],
      answer: "b",
      explain: "Three replicas times indexes times free-space headroom easily multiplies raw data by five to six. Decide the scope of the estimate before you quote it.",
    },
    {
      id: "es-order",
      format: "order",
      scenario: "Order these by total data stored, smallest first.",
      items: [
        { id: "a", label: "1 million photos at 500 KB" },
        { id: "b", label: "10 million log lines at 1 KB" },
        { id: "c", label: "1 billion messages at 100 bytes" },
        { id: "d", label: "50,000 videos at 100 MB" },
      ],
      answer: ["b", "c", "a", "d"],
      explain: "The log lines are 10 GB, the messages 100 GB, the photos 500 GB, and the videos 5 TB. Multiply count by size and compare in one unit.",
    },
    {
      id: "es-explain",
      format: "explain",
      scenario: "In two sentences: why should you decide whether to count replicas and indexes before estimating storage?",
      rubric: [
        { id: "multiplier", criterion: "Replicas and indexes multiply raw data by several times" },
        { id: "clarity", criterion: "Without a scope the number could be off by a larger factor than any rounding error" },
      ],
      exemplar: "Replicas and indexes can multiply raw data several times over. If the scope is not stated, two people can both be right and differ by more than any rounding.",
      explain: "Scope is the biggest single multiplier in a storage estimate.",
    },
  ],
  codex: {
    oneLiner: "Items per day × bytes per item × days kept × copies. Bandwidth is requests per second × bytes per response × 8 for bits.",
    keyNumbers: [
      { label: "Unit ladder", value: "KB 10^3 · MB 10^6 · GB 10^9 · TB 10^12", sourceId: "sdp-estimation" },
      { label: "1M items × 1 KB", value: "1 GB", sourceId: "sdp-estimation" },
    ],
    tradeoffs: [
      { choice: "Count raw data only", gain: "A clean first number", cost: "Real disk need is a multiple of it" },
      { choice: "Count replicas, indexes, headroom", gain: "A number finance can act on", cost: "Needs a scope everyone has agreed" },
    ],
    seenIn: ["The first five minutes of any storage-heavy interview question (photos, video, messaging).", "A budget request for S3 or EBS."],
    interviewAngle: "Quote storage per day, then per year, then with replicas, and call out which you are using. Converting bytes to bits for bandwidth shows you have done it before.",
    aws: [{ concept: "Object storage", service: "Amazon S3", note: "Priced per GB-month" }, { concept: "Block storage", service: "Amazon EBS gp3", note: "Priced per GB-month provisioned" }],
    replay: { id: "estimate-lab", config: { ...STORAGE_PLAY, mode: "worked" }, scene: "chain" },
  },
  interview: [
    "Estimate the storage for a photo-sharing app over five years.",
    "How much bandwidth does it take to serve 1,000 requests per second of 200 KB responses?",
    "What multipliers turn raw data size into real disk need?",
  ],
  deeper: [
    {
      title: "Hot, warm, and cold",
      body: "Most data is read rarely. Splitting storage into a hot tier (recent, fast, expensive) and a cold tier (old, cheap) can cut cost sharply because the hot set is usually a small fraction of the whole. The estimate then has two lines instead of one.",
      derived: true,
    },
  ],
  honestPhysics: [
    "The 250-byte message and 500 KB photo are round assumptions. Real sizes vary with media, language, encoding, and what you index.",
    "Compression, deduplication, and tiering are not applied. They can shrink the real number by a large factor.",
  ],
  sources: [SDP],
  verify: [
    { id: "ref", claim: "The five-year chain gives about 110 TB", run: "lab", params: { model: "estimate-lab", config: STORAGE_PLAY, values: { msgsPerDay: 8e7, bytesPerMsg: 250, days: 1825 }, metric: "estimate" }, expect: { min: 1.05e14, max: 1.15e14 } },
    { id: "photo-ref", claim: "A year of photos is about 274 TB", run: "lab", params: { model: "estimate-lab", config: STORAGE_SOLO, values: { guess: 2.74e14 }, metric: "factor" }, expect: { max: 1.02 } },
  ],
});
