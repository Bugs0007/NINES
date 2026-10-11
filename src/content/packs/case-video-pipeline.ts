import { defineBoss } from "../define";

export const VPC = {};

const NETFLIX_TITLE = { id: "netflix-per-title", title: "Netflix Tech Blog: Per-title encode optimization", url: "https://netflixtechblog.com/per-title-encode-optimization-7e99442b62a2" };
const HLS = { id: "rfc8216", title: "RFC 8216: HTTP Live Streaming (segments and adaptive-bitrate playlists)", url: "https://www.rfc-editor.org/rfc/rfc8216" };
const S3_CLASSES = { id: "s3-classes", title: "AWS docs: Amazon S3 storage classes (hot and cold tiers)", url: "https://aws.amazon.com/s3/storage-classes/" };

export default defineBoss({
  id: "case-video-pipeline",
  title: "Case: Video Pipeline (YouTube)",
  kind: "boss",
  estimatedMinutes: 22,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "creators · 'my video has been processing for two hours'", detail: "12% of large uploads fail and restart; delivery cost $13,500 a day" },
    lines: [{ speaker: "kabir", line: "A thousand hours of video a day. One upload in eight dies and starts over, encodes take an afternoon, and delivery costs thirteen thousand dollars a day." }],
  },
  intro: [
    { speaker: "meera", line: "A video is a pipeline: upload, split, encode, store, deliver. Each stage has a different bottleneck and a different bill." },
    { speaker: "rao", line: "Most of the money is in the part viewers see, delivery. Most of the cleverness is in the part they never do." },
  ],
  forecast: {
    metric: "coresNeeded",
    prompt: "Encoding each upload into a single rendition costs 1.5 core-hours per hour of video. For 1,000 hours a day, with peak at three times the average, about how many cores are needed at peak?",
    unit: "cores",
    scale: 1,
    min: 10,
    max: 5000,
    tolerance: 1.5,
  },
  exercises: ["blob-storage", "queues-vs-logs", "cdn-caching"],
  challenge: {
    id: "design-video",
    title: "Design the pipeline",
    brief: "Let a video play within 15 minutes of upload, use at most 700 encode cores at peak, fail at most 1% of uploads, give viewers a fitting quality, and cost $4,000 a day or less.",
    line: { speaker: "meera", line: "Each stage has one lever. Pull the right ones." },
    widget: { id: "video-lab", config: VPC },
    conditions: [
      { metric: "timeToPlayMin", op: "<=", value: 15, label: "Playable within 15 minutes" },
      { metric: "coresNeeded", op: "<=", value: 700, label: "At most 700 encode cores" },
      { metric: "uploadFailure", op: "<=", value: 0.01, label: "At most 1% of uploads fail" },
      { metric: "viewerQuality", op: ">=", value: 0.9, label: "Viewers get a fitting quality" },
      { metric: "costPerDay", op: "<=", value: 4000, label: "At most $4,000 a day" },
    ],
    stars: [{ metric: "costPerDay", op: "<=", value: 3300, label: "At most $3,300 a day" }],
    hints: ["What lets an encode finish sooner without more total work?", "How many renditions do viewers actually need?", "Where does the money go?"],
  },
  debrief: [
    { id: "upload", text: "Resumable chunked uploads send a large file in pieces, so a dropped connection resumes from the last piece: failures fell from 12% to 0.5% of uploads, and creators stopped restarting hour-long uploads from zero.", derived: true },
    { id: "encode", text: "Splitting a file into segments encodes them in parallel, bringing time to play from over two hours to about 5 minutes for the same total work. A per-title ladder gives each video only the renditions it needs, 3.5 on average instead of 5, which keeps the cores under 700.", sourceIds: ["netflix-per-title", "rfc8216"] },
    { id: "cost", text: "Delivery dominated the bill: $13,500 a day without a CDN and $3,000 with one. Moving old videos to cold storage saved another $160 a day. Compute was the smaller line.", sourceIds: ["s3-classes"] },
  ],
  outro: { speaker: "kabir", line: "Resumable chunks, segment-parallel encodes, a per-title ladder, a CDN. Five minutes to play and thirty-three hundred dollars a day." },
  explainBack: {
    prompt: "Walk through your video pipeline from upload to playback, with the bottleneck and the cost at each stage.",
    rubric: [
      { id: "upload", criterion: "Resumable chunked upload makes large uploads reliable", keyIdea: "resumable uploads" },
      { id: "encode", criterion: "Split into segments and encode in parallel to cut the time to play; choose renditions per video to limit compute", keyIdea: "parallel segments, right ladder" },
      { id: "deliver", criterion: "Serve from a CDN with adaptive-bitrate segments; delivery is the largest cost", keyIdea: "CDN and adaptive streaming" },
      { id: "store", criterion: "Tier storage by age, keeping popular videos hot and old ones cold", keyIdea: "storage tiers" },
    ],
    exemplar:
      "Uploads are chunked and resumable, so a dropped connection costs one piece, not the whole file. The file is split into segments encoded in parallel into a per-title ladder, which brought the time to play to about five and a half minutes with 657 cores at peak. Viewers get adaptive-bitrate segments from a CDN, because delivery is the largest cost, $3,000 a day against $13,500 without it, and old videos move to cold storage to save more.",
  },
  honestPhysics: [
    "1,000 hours of video are uploaded a day, three times that at peak. One hour of video takes 1.5 core-hours to encode into one rendition, 7.5 for a ladder of five, 5.25 for a per-title ladder averaging 3.5. A file encoded on one machine takes 30, 150 or 105 minutes; split into 30 parallel segments, a few minutes. Compute is $0.04 a core-hour.",
    "Large uploads fail 12% of the time in one request and 0.5% in resumable chunks. Viewers watch 100,000 hours a day at 1.5 GB an hour, delivered at $0.09 a gigabyte directly or $0.02 through a CDN. Cold storage cuts the storage bill from $240 to $80 a day. A single rendition fits 60% of viewers. Round figures.",
  ],
  sources: [NETFLIX_TITLE, HLS, S3_CLASSES],
  verify: [
    { id: "forecast", claim: "A single rendition needs 188 cores at peak", run: "lab", params: { model: "video-lab", config: VPC, values: {}, metric: "coresNeeded" }, expect: { min: 187, max: 189 } },
    { id: "fixed", claim: "A fixed ladder of five needs 938 cores", run: "lab", params: { model: "video-lab", config: VPC, values: { ladder: "fixed" }, metric: "coresNeeded" }, expect: { min: 937, max: 939 } },
    { id: "pertitle", claim: "A per-title ladder needs 657", run: "lab", params: { model: "video-lab", config: VPC, values: { ladder: "pertitle" }, metric: "coresNeeded" }, expect: { min: 656, max: 658 } },
    { id: "serial", claim: "Serial encoding takes 110 minutes to play a per-title ladder", run: "lab", params: { model: "video-lab", config: VPC, values: { ladder: "pertitle", segmentParallel: false }, metric: "timeToPlayMin" }, expect: { min: 109, max: 111 } },
    { id: "parallel", claim: "Segment-parallel encoding takes 5.5 minutes", run: "lab", params: { model: "video-lab", config: VPC, values: { ladder: "pertitle", segmentParallel: true }, metric: "timeToPlayMin" }, expect: { min: 5.4, max: 5.6 } },
    { id: "uploads", claim: "Resumable uploads fail 0.5% and one request 12%", run: "lab", params: { model: "video-lab", config: VPC, values: { resumable: true }, metric: "uploadFailure" }, expect: { min: 0.005, max: 0.005 } },
    { id: "cost", claim: "The full design costs $3,290 a day, a direct-delivery one $13,000 or more", run: "lab", params: { model: "video-lab", config: VPC, values: { resumable: true, ladder: "pertitle", segmentParallel: true, cdn: true, tiering: true }, metric: "costPerDay" }, expect: { min: 3280, max: 3300 } },
    { id: "no-cdn", claim: "Without a CDN delivery alone is $13,500", run: "lab", params: { model: "video-lab", config: VPC, values: { cdn: false, tiering: true }, metric: "costPerDay" }, expect: { min: 13000 } },
  ],
});
