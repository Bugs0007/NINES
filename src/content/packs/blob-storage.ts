import { definePack } from "../define";

export const BLOB = { start: { life: "archive", path: "presigned", multipart: true } };
export const BLOB_CHALLENGE = {};

const S3_CLASSES = { id: "s3-classes", title: "AWS docs: Amazon S3 storage classes (Standard, Infrequent Access, Glacier; 11 nines of durability)", url: "https://aws.amazon.com/s3/storage-classes/" };
const S3_PRESIGNED = { id: "s3-presigned", title: "AWS docs: Sharing objects with presigned URLs", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html" };
const S3_MULTIPART = { id: "s3-multipart", title: "AWS docs: Uploading and copying objects using multipart upload", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html" };

export default definePack({
  id: "blob-storage",
  title: "Blob Storage",
  kind: "concept",
  estimatedMinutes: 13,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "storage · $11,500 a month, mostly photos nobody has opened in a year", detail: "uploads also saturate the app servers" },
    lines: [
      { speaker: "kabir", line: "Five hundred terabytes of uploads, mostly years old and never read, at the hot rate. The app servers also spend their day copying bytes to storage." },
      { speaker: "meera", line: "Object storage is cheap and durable if you let it be. Let the phone talk to the store directly, and let old data sink to cheaper tiers." },
    ],
  },
  predictions: [
    {
      id: "bill",
      kind: "choice",
      prompt: "500 TB sits in the standard storage class at $23 per TB a month. Only 10% is under 30 days old. What does storage cost a month?",
      options: [
        { id: "k5", label: "About $5,000" },
        { id: "k11", label: "About $11,500" },
        { id: "k23", label: "About $23,000" },
      ],
      answer: "k11",
      observe: "big-bill",
      reveal: {
        text: "500 × $23 is $11,500 a month, whatever the access pattern. 90% of the bytes are older than a month and rarely touched, so most of the bill pays for readiness nobody uses. Lifecycle rules move data to cheaper classes as it ages.",
        derived: true,
        line: { speaker: "rao", line: "We pay for the speed of data we never fetch." },
      },
    },
    {
      id: "retry",
      kind: "choice",
      prompt: "Users upload 5 GB videos in a single request. A network drop fails about 2% of each gigabyte, so a 5 GB upload fails about 10% of the time and restarts from zero. What share of upload bandwidth is wasted on retries?",
      options: [
        { id: "tiny", label: "About 0.2%" },
        { id: "ten", label: "About 10%" },
        { id: "half", label: "About half" },
      ],
      answer: "ten",
      observe: "wasted",
      reveal: {
        text: "A failure partway through discards the whole upload, so a tenth of attempts redo work. Multipart upload splits the file into parts of about 100 MB, uploaded and retried independently; a failure costs one part, so waste falls to about 0.2%. It also lets parts upload in parallel.",
        derived: true,
        line: { speaker: "meera", line: "Big uploads should fail in small pieces." },
      },
    },
  ],
  widget: { id: "blob-lab", config: BLOB },
  mechanism: [
    {
      id: "what",
      text: "Object storage keeps immutable blobs, photos, videos, backups, under a key in a flat namespace, behind an HTTP API. It is built for durability, eleven nines in S3's published figure, by copying objects across zones, and for scale without capacity planning. You replace an object, never edit part of it. It is not a file system or a database.",
      sourceIds: ["s3-classes"],
    },
    {
      id: "classes",
      scene: "classes",
      text: "Storage classes trade price for access. Standard is for frequently read data. Infrequent access costs about half as much per terabyte but charges for each read. Archive tiers cost a fraction as much and take minutes to hours to retrieve. A lifecycle rule moves objects down as they age, automatically.",
      sourceIds: ["s3-classes"],
    },
    {
      id: "presign",
      scene: "presign",
      text: "Do not carry file bytes through your app servers. Your server checks who may upload, then hands the client a presigned URL: a time-limited, signed address that lets exactly that upload (or download) go straight to the store. App servers handle small requests, and the store does the heavy lifting.",
      sourceIds: ["s3-presigned"],
    },
    {
      id: "multipart",
      scene: "multipart",
      text: "For large files, upload in parts. Each part is sent and retried on its own, parts can go in parallel, and an interrupted upload can resume. Combine with checksums to detect corruption, and a lifecycle rule to abort incomplete uploads, which otherwise stay invisible and keep costing money.",
      sourceIds: ["s3-multipart"],
    },
  ],
  challenges: [
    {
      id: "storage-plan",
      title: "Plan the storage",
      brief: "500 TB with most of it old, and 2 GB a second of uploads. Choose lifecycle rules, the upload path and the upload method so the monthly cost is at most $5,000, at most 3% of reads wait hours, no app servers are needed just for upload traffic, and at most 1% of upload bandwidth is wasted on retries.",
      line: { speaker: "rao", line: "Cheap, durable, and my app servers go back to running the app." },
      widget: { id: "blob-lab", config: BLOB_CHALLENGE },
      conditions: [
        { metric: "costPerMonth", op: "<=", value: 5000, label: "At most $5,000 a month" },
        { metric: "slowReadsPct", op: "<=", value: 0.03, label: "At most 3% of reads wait hours" },
        { metric: "appServers", op: "<=", value: 0, label: "No app servers for uploads" },
        { metric: "wastedUploadPct", op: "<=", value: 0.01, label: "At most 1% of upload bandwidth wasted" },
      ],
      stars: [],
      hints: [
        "What does the oldest data cost in standard, and how often is it read?",
        "What do the app servers do with uploads, and who else could do it?",
        "What does a failed 5 GB upload throw away?",
      ],
    },
  ],
  explainBack: {
    prompt: "Describe how you would store and serve user uploads in object storage.",
    rubric: [
      { id: "presign", criterion: "Upload and download directly to the store with presigned URLs, keeping bytes off the app servers", keyIdea: "presigned URLs" },
      { id: "multipart", criterion: "Use multipart uploads for large files so a failure retries one part", keyIdea: "multipart" },
      { id: "lifecycle", criterion: "Use lifecycle rules to move aging data to cheaper classes, accepting slower retrieval for old data", keyIdea: "lifecycle tiers" },
    ],
    exemplar:
      "The app checks permission and returns a presigned URL, so the client uploads straight to object storage and the bytes never pass through our servers. Large files go up in parts, each retried on its own, so a network drop costs a part and not the whole file. A lifecycle rule moves data to infrequent-access after thirty days and to archive after six months, which cuts the bill by about two thirds at the price of slow reads of the oldest files.",
  },
  reviews: [
    {
      id: "bs-est",
      format: "estimate",
      scenario: "100 TB sits in an archive class at $3.60 per TB a month. In standard at $23 it would cost more. How much does keeping it in archive save a month?",
      unit: "USD",
      answer: 1940,
      acceptFactor: 1.05,
      breakdown: ["standard: 100 × $23 = $2,300", "archive: 100 × $3.60 = $360", "saving $1,940"],
      explain: "Archive tiers cost a sixth as much per terabyte; retrieval fees and delays are the price.",
    },
    {
      id: "bs-pick",
      format: "pick-fix",
      scenario: "Mobile clients upload photos to an API server, which forwards them to object storage. During a campaign the servers saturate their network links while CPU is idle. What is the best fix?",
      options: [
        { id: "a", label: "Return a presigned URL so clients upload directly to the store" },
        { id: "b", label: "Add more app servers" },
        { id: "c", label: "Compress photos on the server" },
        { id: "d", label: "Cache uploads in memory" },
      ],
      answer: "a",
      explain: "The servers are only relaying bytes. Direct uploads take them out of the data path.",
    },
    {
      id: "bs-order",
      format: "order",
      scenario: "Order these storage classes by cost per terabyte a month, highest first.",
      items: [
        { id: "std", label: "Standard" },
        { id: "ia", label: "Infrequent access" },
        { id: "arch", label: "Archive" },
      ],
      answer: ["std", "ia", "arch"],
      explain: "Lower storage price comes with retrieval fees or delays: you pay on the read instead of on the holding.",
    },
    {
      id: "bs-graph",
      format: "predict-graph",
      scenario: "A single-request upload fails about 2% of each gigabyte. As file size grows from 100 MB to 20 GB, how does the share of uploads that must restart change?",
      xLabel: "file size →",
      yLabel: "uploads that restart",
      options: [
        { id: "rise", label: "Rises with the size, toward most uploads failing", points: [0.2, 1, 2, 10, 18, 33, 49, 67] },
        { id: "flat", label: "Stays at about 2%", points: [2, 2, 2, 2, 2, 2, 2, 2] },
        { id: "fall", label: "Falls", points: [67, 49, 33, 18, 10, 2, 1, 0.2] },
      ],
      answer: "rise",
      explain: "More bytes means more chances for a failure, and a single request throws away everything. Parts cap the loss per failure at one part.",
    },
    {
      id: "bs-flaw",
      format: "spot-flaw",
      scenario: "A team makes its upload bucket publicly writable so clients can upload without a server. Within weeks it holds gigabytes of unrelated files. Tap the flaw.",
      diagram: {
        nodes: [
          { id: "client", label: "anyone on the internet", kind: "client", col: 0, row: 1 },
          { id: "bucket", label: "bucket: public write", kind: "store", col: 1, row: 1 },
          { id: "bill", label: "storage bill", kind: "external", col: 2, row: 1 },
        ],
        edges: [
          { from: "client", to: "bucket" },
          { from: "bucket", to: "bill" },
        ],
      },
      answer: "client->bucket",
      explain: "Anyone can write. Keep the bucket private and issue short-lived presigned URLs after the app checks who is uploading and how much.",
    },
    {
      id: "bs-explain",
      format: "explain",
      scenario: "In two sentences: why can't you update part of an object in object storage?",
      rubric: [
        { id: "immutable", criterion: "Objects are written and read as whole units; the store replaces them rather than editing in place" },
        { id: "design", criterion: "That simplicity is how it achieves durability and scale, and applications needing edits use files, databases or new object versions" },
      ],
      exemplar: "Objects are stored and replaced as whole units, not edited in place. That simplicity is how the store gets durability and scale, so applications needing edits use a database, a file system or versioned objects.",
      explain: "Whole objects only.",
    },
  ],
  codex: {
    oneLiner: "Keep blobs in object storage, upload directly with presigned URLs in parts, and let lifecycle rules move aging data to cheaper classes.",
    keyNumbers: [
      { label: "Standard class, per TB a month (lab, list-price style)", value: "$23", sourceId: "s3-classes" },
      { label: "S3 durability", value: "99.999999999% (11 nines)", sourceId: "s3-classes" },
    ],
    tradeoffs: [
      { choice: "Standard class", gain: "Instant reads", cost: "Highest storage price" },
      { choice: "Archive class", gain: "A fraction of the price", cost: "Retrieval delay and fees" },
      { choice: "Presigned URLs", gain: "App servers off the data path", cost: "Careful expiry and size limits" },
    ],
    seenIn: ["Photo and video uploads going straight to S3 or Cloud Storage.", "Log and backup archives with lifecycle expiry."],
    interviewAngle: "Say: 'presigned multipart uploads straight to object storage, a CDN in front for reads, and lifecycle rules to move old data to cheaper classes'.",
    aws: [{ concept: "Lifecycle rules, presigned URLs, multipart upload", service: "Amazon S3" }],
    replay: { id: "blob-lab", config: BLOB, scene: "classes" },
  },
  interview: [
    "How do you design an upload service for large files?",
    "What are presigned URLs?",
    "How would you cut the cost of storing petabytes of old data?",
  ],
  deeper: [
    {
      title: "Eventual surprises",
      body: "Object stores differ in their consistency rules, request-rate limits per prefix, and costs per request. Billions of tiny objects can cost more in request fees and listing time than the bytes themselves, so small files are often packed into larger ones. Read the service's own limits before choosing key names.",
      sourceIds: ["s3-classes"],
    },
  ],
  honestPhysics: [
    "500 TB, 10% under 30 days old, 30% from 30 to 180 days, 60% older. Of the 100 TB read each month, 90% hits the newest data, 8% the middle band and 2% the oldest.",
    "Illustrative per-TB monthly prices in the style of S3 list prices: standard $23, infrequent access $12.50 plus $10 per TB read, archive $3.60 plus $10 per TB read. Archive reads take hours.",
    "Uploads: 2 GB a second needs 8 app servers at 2 Gbps each if routed through them. Single-request failures run at 2% a gigabyte; multipart retries only 100 MB parts, 0.2% waste.",
  ],
  sources: [S3_CLASSES, S3_PRESIGNED, S3_MULTIPART],
  verify: [
    { id: "std", claim: "Keeping 500 TB in standard costs $11,500 a month", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { life: "standard" }, metric: "costPerMonth" }, expect: { min: 11500, max: 11500 } },
    { id: "ia", claim: "Infrequent access after 30 days costs about $6,900", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { life: "ia" }, metric: "costPerMonth" }, expect: { min: 6500, max: 7200 } },
    { id: "archive", claim: "Archiving after 180 days brings it under $5,000", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { life: "archive" }, metric: "costPerMonth" }, expect: { max: 5000 } },
    { id: "archive-slow", claim: "…with 2% of reads waiting hours", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { life: "archive" }, metric: "slowReadsPct" }, expect: { min: 0.02, max: 0.02 } },
    { id: "server", claim: "Routing uploads through servers needs 8 of them", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { path: "server" }, metric: "appServers" }, expect: { min: 8, max: 8 } },
    { id: "presign", claim: "Presigned URLs need none", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { path: "presigned" }, metric: "appServers" }, expect: { max: 0 } },
    { id: "single", claim: "Single-request uploads waste about 10% of bandwidth", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { multipart: false }, metric: "wastedUploadPct" }, expect: { min: 0.1 } },
    { id: "multi", claim: "Multipart cuts it to 0.2%", run: "lab", params: { model: "blob-lab", config: BLOB_CHALLENGE, values: { multipart: true }, metric: "wastedUploadPct" }, expect: { max: 0.01 } },
  ],
});
