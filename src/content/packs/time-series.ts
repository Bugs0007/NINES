import { definePack } from "../define";

export const TS = { start: { rawDays: 7, r1m: 14, r1h: 730, compress: true, userTag: false } };
export const TS_CHALLENGE = {};

const GORILLA = { id: "gorilla-2015", title: "T. Pelkonen et al. (2015), Gorilla: A Fast, Scalable, In-Memory Time Series Database, VLDB", url: "https://www.vldb.org/pvldb/vol8/p1816-teller.pdf" };
const PROM_LABELS = { id: "prometheus-labels", title: "Prometheus docs: Metric and label naming (cardinality warning)", url: "https://prometheus.io/docs/practices/naming/#labels" };
const TIMESCALE_CAGG = { id: "timescale-cagg", title: "TimescaleDB docs: Continuous aggregates (automatic downsampling)", url: "https://docs.timescale.com/use-timescale/latest/continuous-aggregates/" };

export default definePack({
  id: "time-series",
  title: "Time-series Data",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "metrics store · 970 GB for one week, year chart takes 6 seconds", detail: "1 million devices, a reading every 10 seconds" },
    lines: [
      { speaker: "kabir", line: "A million devices report every ten seconds. We keep every reading, a week takes nearly a terabyte, and the yearly chart on the dashboard times out." },
      { speaker: "meera", line: "Nobody needs ten-second detail from last March. Keep the recent past sharp and the distant past blurred." },
    ],
  },
  predictions: [
    {
      id: "slow",
      kind: "choice",
      prompt: "You keep only one-minute rollups, 525,600 rows per device for a year. A chart reads each point in about 2 microseconds. How long does one device's yearly chart take?",
      options: [
        { id: "ms17", label: "About 17 ms" },
        { id: "ms170", label: "About 170 ms" },
        { id: "s1", label: "About 1 second" },
        { id: "s10", label: "About 10 seconds" },
      ],
      answer: "s1",
      observe: "slow-year",
      reveal: {
        text: "525,600 points × 2 µs is about 1.05 seconds for one device. Hourly rollups give 8,760 points for the same year: 17.5 ms. A year-long chart never needs minute resolution, since a screen cannot show half a million points anyway. Choose the tier to match the window.",
        derived: true,
        line: { speaker: "meera", line: "Draw only what the screen can show." },
      },
    },
    {
      id: "cardinality",
      kind: "choice",
      prompt: "Each series needs about 3 KB of index memory. You have a million devices, and someone adds the user id as a label on every point, 1,000 users per device. What does the index need?",
      options: [
        { id: "same", label: "About 3 GB, the same" },
        { id: "30", label: "About 30 GB" },
        { id: "3000", label: "About 3,000 GB: it no longer fits in memory" },
      ],
      answer: "3000",
      observe: "blown",
      reveal: {
        text: "Every distinct combination of labels is its own series. A million devices times a thousand users is a billion series at 3 KB each: 3,000 GB of index. Labels with unbounded values, user ids, request ids, are the classic way to bring a time-series database down. Keep labels low-cardinality and put identifiers in logs.",
        derived: true,
        line: { speaker: "rao", line: "A label is a multiplier. Count what you are multiplying." },
      },
    },
  ],
  widget: { id: "tsdb-lab", config: TS },
  mechanism: [
    {
      id: "shape",
      text: "Time-series data is a stream of (timestamp, value) pairs for many series, appended in time order and rarely changed. Writes are constant and huge, reads are mostly recent ranges and aggregates, and old data matters less. A database designed for this chunks data by time, so dropping old data is deleting a whole chunk.",
      sourceIds: ["gorilla-2015", "timescale-cagg"],
    },
    {
      id: "compress",
      scene: "compress",
      text: "Consecutive readings are similar and timestamps are regular, so they compress extremely well. Storing the difference between timestamps' differences, and the XOR of successive values, as Gorilla does, takes about 1.6 bytes a point instead of 16. Most time-series databases do something like it.",
      sourceIds: ["gorilla-2015"],
    },
    {
      id: "down",
      scene: "downsample",
      text: "Downsampling keeps coarser summaries of older data: one-minute rollups storing min, max, mean and count, then hourly ones. Recent data stays at full resolution for debugging; old data answers trend questions cheaply. Retention policies drop each tier after its useful life, which bounds storage.",
      sourceIds: ["timescale-cagg"],
    },
    {
      id: "card",
      scene: "cardinality",
      text: "Cardinality, the number of distinct series, is the real limit. Every unique combination of label values is a series with its own index entry. Keep labels to a bounded set, such as device type and region; never put ids that grow without bound in them.",
      sourceIds: ["prometheus-labels"],
    },
  ],
  challenges: [
    {
      id: "retention",
      title: "Plan the retention",
      brief: "1 million devices. Dashboards show the last week at full resolution and a year-long chart per device. Choose retention tiers, compression and labels so a year chart takes at most 100 ms, storage is at most 500 GB, and index memory is at most 8 GB.",
      line: { speaker: "rao", line: "Keep what people look at, drop what they don't, and compress everything." },
      widget: { id: "tsdb-lab", config: TS_CHALLENGE },
      conditions: [
        { metric: "yearQueryMs", op: "<=", value: 100, label: "Year chart in 100 ms or less" },
        { metric: "storageGB", op: "<=", value: 500, label: "Storage at most 500 GB" },
        { metric: "indexMemGB", op: "<=", value: 8, label: "Index memory at most 8 GB" },
      ],
      stars: [{ metric: "storageGB", op: "<=", value: 250, label: "Storage at most 250 GB" }],
      hints: [
        "Which tier answers a year-long question cheaply?",
        "How much does uncompressed raw data cost for a week?",
        "What does adding the user id as a label do to the number of series?",
      ],
    },
  ],
  explainBack: {
    prompt: "Explain how you would store a million devices' metrics for years without running out of space or time.",
    rubric: [
      { id: "compress", criterion: "Compress raw points with delta encoding of timestamps and values, about ten times smaller", keyIdea: "compression" },
      { id: "down", criterion: "Keep raw data briefly and roll up into minute and hour tiers kept longer, with retention policies", keyIdea: "downsample and expire" },
      { id: "card", criterion: "Keep labels low-cardinality; an unbounded label multiplies series and the index outgrows memory", keyIdea: "mind cardinality" },
    ],
    exemplar:
      "I would compress raw points with delta encoding of timestamps and values, which shrinks them about ten times. Raw data would be kept for a week, then rolled up into one-minute and hourly summaries kept for longer, with each tier dropped when it is no longer useful, so year-long charts read hourly points and not millions of raw ones. I would keep labels to a bounded set, because an unbounded one like a user id multiplies the series count and the index would outgrow memory.",
  },
  reviews: [
    {
      id: "ts-est",
      format: "estimate",
      scenario: "A million series report every 10 seconds, 16 bytes a point uncompressed. About how many gigabytes does one day take?",
      unit: "GB",
      answer: 138,
      acceptFactor: 1.05,
      breakdown: ["8,640 points a day × 1,000,000 series = 8.64 × 10⁹ points", "× 16 bytes = 138 GB"],
      explain: "Compression at 1.6 bytes brings it to under 14 GB a day.",
    },
    {
      id: "ts-pick",
      format: "pick-fix",
      scenario: "A dashboard's yearly chart reads raw 10-second points and takes 30 seconds. What is the best fix?",
      options: [
        { id: "a", label: "Query a precomputed hourly rollup for long windows" },
        { id: "b", label: "Add more RAM to the database" },
        { id: "c", label: "Cache the raw query result" },
        { id: "d", label: "Drop the yearly chart" },
      ],
      answer: "a",
      explain: "A year at 10-second resolution is 3.15 million points a series, far more than a screen can show. An hourly rollup has 8,760.",
    },
    {
      id: "ts-order",
      format: "order",
      scenario: "Order these by points a chart reads for one device over a year, most first.",
      items: [
        { id: "raw", label: "Raw, every 10 seconds" },
        { id: "min", label: "One-minute rollups" },
        { id: "hour", label: "Hourly rollups" },
      ],
      answer: ["raw", "min", "hour"],
      explain: "3.15 million, 525,600 and 8,760 points: each tier is a factor of 6 to 60 smaller.",
    },
    {
      id: "ts-graph",
      format: "predict-graph",
      scenario: "As the number of values a label can take rises from 10 to 1,000,000 (on top of 1 million devices), how does the number of series change?",
      xLabel: "label values →",
      yLabel: "series",
      options: [
        { id: "mult", label: "Multiplies: devices × label values", points: [1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e12, 1e12] },
        { id: "add", label: "Adds a little", points: [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6] },
        { id: "flat", label: "Stays at 1 million", points: [1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6, 1e6] },
      ],
      answer: "mult",
      explain: "Series are the product of the label value sets, so one high-cardinality label multiplies everything.",
    },
    {
      id: "ts-flaw",
      format: "spot-flaw",
      scenario: "Each metric is labelled with the request id so engineers can find a single request. The metrics server's memory climbs until it crashes. Tap the cause.",
      diagram: {
        nodes: [
          { id: "app", label: "app emits metric{request_id=...}", kind: "server", col: 0, row: 1 },
          { id: "series", label: "a new series for every request", kind: "queue", col: 1, row: 1 },
          { id: "tsdb", label: "metrics server index", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "app", to: "series" },
          { from: "series", to: "tsdb" },
        ],
      },
      answer: "app->series",
      explain: "A label with unbounded values creates unbounded series. Request ids belong in logs and traces, not metric labels.",
    },
    {
      id: "ts-explain",
      format: "explain",
      scenario: "In two sentences: why is deleting old time-series data cheap in a time-partitioned database?",
      rubric: [
        { id: "chunks", criterion: "Data is stored in chunks by time range, so everything older than the cut-off lives in whole chunks" },
        { id: "drop", criterion: "Dropping a chunk is a file deletion, not a row-by-row delete that would write tombstones and need vacuuming" },
      ],
      exemplar: "Data is stored in chunks by time range, so everything older than the cut-off lives in whole chunks. Dropping a chunk is a file delete, not a row-by-row delete that would generate writes and need cleaning up.",
      explain: "Partition by the thing you delete by.",
    },
  ],
  codex: {
    oneLiner: "Compress raw points, keep them briefly, roll up into coarser tiers kept longer, drop each tier on schedule, and keep label cardinality bounded.",
    keyNumbers: [
      { label: "Gorilla compression", value: "about 1.6 bytes per point", sourceId: "gorilla-2015" },
      { label: "Series count", value: "the product of label value counts", sourceId: "prometheus-labels" },
    ],
    tradeoffs: [
      { choice: "Raw retention", gain: "Full detail for debugging", cost: "Storage, and slow long queries" },
      { choice: "Rollup tiers", gain: "Fast long-range charts; bounded storage", cost: "Lost detail; rollups to maintain" },
      { choice: "Rich labels", gain: "Slice by anything", cost: "Series explosion" },
    ],
    seenIn: ["Prometheus, InfluxDB, TimescaleDB and VictoriaMetrics.", "CloudWatch metrics' automatic coarsening of old data."],
    interviewAngle: "Say: 'append-only chunks by time, delta compression, tiered rollups with retention, and watch label cardinality'.",
    aws: [{ concept: "Managed time-series storage", service: "Amazon Timestream, CloudWatch metrics" }],
    replay: { id: "tsdb-lab", config: TS, scene: "downsample" },
  },
  interview: [
    "How would you design storage for metrics from a million devices?",
    "What is downsampling and why do it?",
    "What is high cardinality and why does it hurt a time-series database?",
  ],
  deeper: [
    {
      title: "Out-of-order and late data",
      body: "Devices go offline and send their buffers later, so points arrive out of order and into chunks that were thought closed. Time-series databases keep recent chunks open for writes and handle late points with a small penalty, but a rollup built from incomplete data may need recomputing, so aggregation windows are usually closed only after a grace period.",
      sourceIds: ["timescale-cagg"],
    },
  ],
  honestPhysics: [
    "1 million devices, each reporting every 10 seconds: 8,640 points a day per series. A raw point is 16 bytes, 1.6 compressed. A one-minute rollup stores min, max, mean and count: 1,440 rows a day at 16 bytes. An hourly rollup, 24 rows a day.",
    "A year chart reads the coarsest tier covering the year: 8,760 points hourly, 525,600 by the minute, at 2 microseconds a point. A series costs about 3 KB of index memory; an unbounded label multiplies series by 1,000.",
    "Round figures for comparison.",
  ],
  sources: [GORILLA, PROM_LABELS, TIMESCALE_CAGG],
  verify: [
    { id: "raw", claim: "A week of uncompressed raw data takes about 970 GB", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { rawDays: 7, r1m: 0, r1h: 0, compress: false }, metric: "storageGB" }, expect: { min: 960, max: 975 } },
    { id: "compressed", claim: "Compression cuts it to about 97 GB", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { rawDays: 7, r1m: 0, r1h: 0, compress: true }, metric: "storageGB" }, expect: { min: 95, max: 99 } },
    { id: "minute-year", claim: "A year of minute rollups takes over a second to chart", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { r1m: 365, r1h: 0 }, metric: "yearQueryMs" }, expect: { min: 1000 } },
    { id: "hourly-year", claim: "Hourly rollups chart a year in 17.5 ms", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { r1h: 365 }, metric: "yearQueryMs" }, expect: { max: 20 } },
    { id: "good-storage", claim: "Compressed raw week plus a year of hourly rollups is under 250 GB", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { rawDays: 7, r1m: 0, r1h: 365, compress: true }, metric: "storageGB" }, expect: { max: 250 } },
    { id: "tag", claim: "A user-id label needs 3,000 GB of index", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { userTag: true }, metric: "indexMemGB" }, expect: { min: 3000, max: 3000 } },
    { id: "no-tag", claim: "Without it, 3 GB", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { userTag: false }, metric: "indexMemGB" }, expect: { max: 8 } },
    { id: "minute-too-long", claim: "Ninety days of minute rollups break the storage limit", run: "lab", params: { model: "tsdb-lab", config: TS_CHALLENGE, values: { rawDays: 7, r1m: 90, r1h: 730, compress: true }, metric: "storageGB" }, expect: { min: 500 } },
  ],
});
