import { definePack } from "../define";

export const LSM = { lockWrites: false, start: { engine: "btree", bloom: true, writes: 100000 } };
export const LSM_CHALLENGE = { lockWrites: true, writes: 100000, start: { engine: "btree", bloom: false } };

const ONEIL = { id: "oneil-1996", title: "P. O'Neil et al. (1996), The Log-Structured Merge-Tree (LSM-Tree), Acta Informatica 33(4)", url: "https://doi.org/10.1007/s002360050048" };
const ROCKS_LEVELED = { id: "rocksdb-leveled", title: "RocksDB wiki: Leveled Compaction (levels, write amplification, space amplification)", url: "https://github.com/facebook/rocksdb/wiki/Leveled-Compaction" };
const ROCKS_BLOOM = { id: "rocksdb-bloom", title: "RocksDB wiki: RocksDB Bloom Filter (avoiding reads of files that lack a key)", url: "https://github.com/facebook/rocksdb/wiki/RocksDB-Bloom-Filter" };
const PG_BTREE = { id: "pg-btree", title: "PostgreSQL docs: B-Tree indexes", url: "https://www.postgresql.org/docs/current/btree.html" };

export default definePack({
  id: "lsm-vs-btree",
  title: "LSM Trees vs B-trees",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "graph-spike",
    alert: { severity: "warn", title: "disk · write bandwidth", detail: "800 MB/s of writes to store 10 MB/s of data" },
    lines: [
      { speaker: "pager", line: "Ingest is writing eight hundred megabytes a second to disk to store ten megabytes a second of rows. The SSD is at its limit." },
      { speaker: "meera", line: "Each small row write rewrites a whole page in place. Some engines avoid that by never overwriting, only appending and merging later." },
    ],
  },
  predictions: [
    {
      id: "amp",
      kind: "choice",
      prompt: "A B-tree updates 100-byte rows by rewriting the 8 KB page that holds each one, in a random place. For 100,000 row writes a second, roughly how much disk write bandwidth does that need, ignoring the log?",
      options: [
        { id: "ten", label: "About 10 MB/s, the size of the rows" },
        { id: "hundred", label: "About 100 MB/s" },
        { id: "eight-hundred", label: "About 800 MB/s" },
        { id: "gb", label: "Several GB/s" },
      ],
      answer: "eight-hundred",
      observe: "amp-seen",
      reveal: {
        text: "8,192 bytes rewritten for every 100-byte row is a write amplification of about 80. 100,000 rows a second is 10 MB of data, so about 800 MB a second of page writes. LSM engines turn this into large sequential writes with a smaller multiplier.",
        derived: true,
        line: { speaker: "meera", line: "The disk does not care that the row was small. It rewrites the page." },
      },
    },
  ],
  widget: { id: "lsm-lab", config: LSM },
  mechanism: [
    {
      id: "btree",
      scene: "btree",
      text: "A B-tree updates data in place. A small change rewrites the whole page that holds the row, often in a random location, so write amplification is the page size over the row size. Reads are cheap: a handful of pages from root to leaf, with the top levels cached.",
      sourceIds: ["pg-btree"],
      derived: true,
    },
    {
      id: "lsm",
      scene: "lsm",
      text: "A log-structured merge tree never overwrites. Writes go to a log and an in-memory table; when it fills, it is flushed as a sorted immutable file. Background compaction merges files, keeping the data sorted. Writes become large sequential appends, which disks and SSDs do very well.",
      sourceIds: ["oneil-1996"],
    },
    {
      id: "compaction",
      scene: "compaction",
      text: "Compaction is the bill. Leveled compaction keeps each key in few files, so reads and space are good, but rewrites data about ten times per level. Size-tiered compaction merges similarly sized files and rewrites far less, but a read may check many files and space can double.",
      sourceIds: ["rocksdb-leveled", "oneil-1996"],
    },
    {
      id: "reads",
      text: "An LSM read may have to look in several files, so engines add Bloom filters: a small in-memory summary per file that says definitely not here or probably here. With them a point lookup usually reads one file, close to a B-tree. Range scans benefit less.",
      sourceIds: ["rocksdb-bloom"],
    },
  ],
  challenges: [
    {
      id: "ingest",
      title: "Absorb the write firehose",
      brief: "100,000 row writes a second must be ingested. The SSD tolerates 300 MB/s of writes. Point reads must take no more than 2 disk reads, and storage must stay within 1.5 times the data size. Choose the engine and whether Bloom filters are on.",
      line: { speaker: "rao", line: "Doubling the disk is a purchase order. Changing the engine is a config file." },
      widget: { id: "lsm-lab", config: LSM_CHALLENGE },
      conditions: [
        { metric: "diskWriteMBs", op: "<=", value: 300, label: "Disk writes at most 300 MB/s" },
        { metric: "readIos", op: "<=", value: 2, label: "At most 2 disk reads per point lookup" },
        { metric: "spaceFactor", op: "<=", value: 1.5, label: "At most 1.5× the data on disk" },
      ],
      stars: [{ metric: "diskWriteMBs", op: "<=", value: 200, label: "Disk writes at most 200 MB/s" }],
      hints: [
        "Which engine writes the most to disk per row?",
        "Size-tiered compaction writes the least. What does it cost in space, and in reads without Bloom filters?",
        "Which engine meets all three limits at once?",
      ],
    },
  ],
  explainBack: {
    prompt: "Compare B-trees and LSM trees on writes and reads, and say what compaction costs.",
    rubric: [
      { id: "btree", criterion: "B-trees update pages in place: cheap reads, but small writes rewrite whole pages (high write amplification)", keyIdea: "in-place updates" },
      { id: "lsm", criterion: "LSM trees append to a log and memtable, flush sorted files, and merge them by compaction: sequential, efficient writes", keyIdea: "append and merge" },
      { id: "cost", criterion: "Compaction costs write and read amplification and space; Bloom filters reduce read cost", keyIdea: "compaction and Bloom filters" },
    ],
    exemplar:
      "A B-tree updates data in place, so reads are cheap but each small write rewrites a whole page. An LSM tree appends writes to a log and an in-memory table, flushes sorted files, and merges them in the background, turning writes into large sequential appends. The cost is compaction, which rewrites data and uses extra space, and reads that may check several files unless Bloom filters skip them.",
  },
  reviews: [
    {
      id: "lb-est",
      format: "estimate",
      scenario: "A B-tree has a write amplification of about 80. At 50,000 row writes a second of 100 bytes each, roughly how many MB a second hit the disk?",
      unit: "MB/s",
      answer: 400,
      acceptFactor: 1.2,
      breakdown: ["50,000 × 100 bytes = 5 MB/s of rows", "× 80 amplification", "= 400 MB/s"],
      explain: "The rows are 5 MB a second; the pages are 400. That gap is what an LSM engine narrows.",
    },
    {
      id: "lb-pick",
      format: "pick-fix",
      scenario: "A service stores time-series events, ingesting a million writes a second and rarely updating anything, with reads by key and recent time. Which engine fits?",
      options: [
        { id: "a", label: "An LSM-based store, since writes dominate and it appends sequentially" },
        { id: "b", label: "A B-tree, since reads matter most" },
        { id: "c", label: "No index at all" },
        { id: "d", label: "An in-memory-only store" },
      ],
      answer: "a",
      explain: "Write-heavy ingest with simple reads is the LSM sweet spot. B-trees suit read-heavy, update-in-place workloads and range scans with fewer writes.",
    },
    {
      id: "lb-order",
      format: "order",
      scenario: "Order these by write amplification, lowest first.",
      items: [
        { id: "tiered", label: "LSM, size-tiered compaction" },
        { id: "leveled", label: "LSM, leveled compaction" },
        { id: "btree", label: "B-tree with small rows" },
      ],
      answer: ["tiered", "leveled", "btree"],
      explain: "Tiered rewrites data about once per level, leveled about ten times per level pair, and a B-tree rewrites an 8 KB page per small row.",
    },
    {
      id: "lb-graph",
      format: "predict-graph",
      scenario: "For an LSM tree without Bloom filters, add more sorted files over time without compacting. How does the cost of a point lookup change?",
      xLabel: "files →",
      yLabel: "disk reads per lookup",
      options: [
        { id: "flat", label: "Flat", points: [1, 1, 1, 1, 1, 1, 1, 1] },
        { id: "linear", label: "Grows with the number of files", points: [1, 2, 3, 4, 5, 6, 7, 8] },
        { id: "log", label: "Grows with the log of the files", points: [1, 1.5, 2, 2.3, 2.6, 2.8, 3, 3.1] },
        { id: "falls", label: "Falls", points: [8, 7, 6, 5, 4, 3, 2, 1] },
      ],
      answer: "linear",
      explain: "Without compaction or filters a lookup may have to check each file in turn, so reads grow with the number of files. That is exactly what compaction and Bloom filters keep in check.",
    },
    {
      id: "lb-flaw",
      format: "spot-flaw",
      scenario: "A team picks a size-tiered LSM store to save write bandwidth, with Bloom filters off, and later reports slow point reads and a disk that is half empty but 'full' during compactions. Tap the setting behind the slow reads.",
      diagram: {
        nodes: [
          { id: "app", label: "app: point lookups by key", kind: "server", col: 0, row: 1 },
          { id: "lsm", label: "LSM store · size-tiered, Bloom filters off", kind: "db", col: 1, row: 1 },
        ],
        edges: [{ from: "app", to: "lsm" }],
      },
      answer: "lsm",
      explain: "Without Bloom filters each lookup checks every sorted run that might hold the key, and size-tiered compaction leaves many runs. Turn the filters on and size the disk for the space a compaction needs.",
    },
    {
      id: "lb-explain",
      format: "explain",
      scenario: "In two sentences: why are sequential writes better than random writes for storage?",
      rubric: [
        { id: "seq", criterion: "Sequential writes need fewer, larger operations and are friendlier to disks and SSD write patterns" },
        { id: "amp", criterion: "They avoid rewriting whole pages for small changes, reducing write amplification" },
      ],
      exemplar: "Sequential writes are large and contiguous, which disks and SSDs handle efficiently, instead of many small scattered writes. They also avoid rewriting a whole page for each small change.",
      explain: "The cheapest write is one the device was built for.",
    },
  ],
  codex: {
    oneLiner: "B-trees update in place with cheap reads and high write amplification. LSM trees append and merge: cheap writes, paid for by compaction and filters.",
    keyNumbers: [
      { label: "B-tree write amplification, 100 B rows on 8 KB pages", value: "about 80×", sourceId: "pg-btree" },
      { label: "Leveled compaction", value: "about 10× rewrite per level pair; low space amplification", sourceId: "rocksdb-leveled" },
      { label: "Bloom filters", value: "skip files that lack the key; point read near 1 I/O", sourceId: "rocksdb-bloom" },
    ],
    tradeoffs: [
      { choice: "B-tree", gain: "Cheap point and range reads, predictable latency", cost: "Random page writes; high write amplification on small rows" },
      { choice: "LSM, leveled", gain: "Good reads and space", cost: "Heavy compaction writes" },
      { choice: "LSM, size-tiered", gain: "Lowest write amplification", cost: "More files per read and up to 2× space" },
    ],
    seenIn: ["RocksDB under many databases; Cassandra, HBase, and LevelDB.", "InnoDB and Postgres as B-tree engines."],
    interviewAngle: "Link the engine to the workload: 'write-heavy ingest suggests an LSM store; read-heavy OLTP with updates in place suggests a B-tree.' Then name compaction as the cost.",
    aws: [{ concept: "LSM-based managed stores", service: "Amazon Keyspaces (Cassandra), Amazon Neptune/DynamoDB internals are LSM-like", note: "Engine choice is usually fixed by the service" }],
    replay: { id: "lsm-lab", config: LSM, scene: "lsm" },
  },
  interview: [
    "Why are LSM trees good for write-heavy workloads?",
    "What is compaction and what does it cost?",
    "How do Bloom filters help an LSM tree?",
  ],
  deeper: [
    {
      title: "The three amplifications",
      body: "Storage engines trade three amplification factors against each other: write amplification (bytes written per byte stored), read amplification (I/Os per lookup), and space amplification (bytes on disk per byte of data). No engine minimises all three, which is why there are several. Choosing one is choosing which two you can afford.",
      derived: true,
    },
  ],
  honestPhysics: [
    "Amplification figures are textbook estimates: B-tree 8 KB page over a 100-byte row, leveled about 20, size-tiered about 6. Real values depend on the workload, settings, and data.",
    "Bloom filters bring a point read close to one I/O, and range scans benefit less. Read figures assume a modest number of levels.",
    "Space: B-tree about 70% page fill, leveled about 1.1×, size-tiered up to 2× while merging.",
  ],
  sources: [ONEIL, ROCKS_LEVELED, ROCKS_BLOOM, PG_BTREE],
  verify: [
    { id: "btree-bw", claim: "A B-tree needs about 800 MB/s for 100,000 row writes", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "btree" }, metric: "diskWriteMBs" }, expect: { min: 700, max: 900 } },
    { id: "leveled", claim: "Leveled LSM with Bloom filters meets all three limits (writes)", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "leveled", bloom: true }, metric: "diskWriteMBs" }, expect: { max: 300 } },
    { id: "leveled-read", claim: "…reads", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "leveled", bloom: true }, metric: "readIos" }, expect: { max: 2 } },
    { id: "leveled-space", claim: "…and space", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "leveled", bloom: true }, metric: "spaceFactor" }, expect: { max: 1.5 } },
    { id: "no-bloom", claim: "Without Bloom filters leveled reads are too slow", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "leveled", bloom: false }, metric: "readIos" }, expect: { min: 2 } },
    { id: "tiered-space", claim: "Size-tiered doubles the space", run: "lab", params: { model: "lsm-lab", config: LSM_CHALLENGE, values: { engine: "tiered", bloom: true }, metric: "spaceFactor" }, expect: { min: 1.5 } },
  ],
});
