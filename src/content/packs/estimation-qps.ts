import { definePack } from "../define";

const SDP = { id: "sdp-estimation", title: "System Design Primer: Back-of-the-envelope calculations (seconds per month, requests per second rules of thumb)", url: "https://github.com/donnemartin/system-design-primer#back-of-the-envelope-calculations" };

const MSG_STEPS = [
  { id: "dau", label: "Daily active users", min: 1e4, max: 1e9, truth: 2e6 },
  { id: "perUser", label: "Messages per user per day", min: 1, max: 1000, truth: 40 },
  { id: "secondsPerDay", label: "Seconds in a day", min: 1e4, max: 2e5, truth: 86400, inverse: true, hint: "60 × 60 × 24, about 10^5" },
  { id: "peak", label: "Peak ÷ daily average", min: 1, max: 20, truth: 3, fmt: "x" },
];

export const QPS_PLAY = {
  title: "Pigeon · peak messages per second",
  answerLabel: "Peak messages per second",
  answerMin: 1,
  answerMax: 1e6,
  answerFmt: "num",
  mode: "faded",
  given: ["secondsPerDay"],
  chain: "users × messages each ÷ seconds in a day × peak factor",
  steps: MSG_STEPS,
  start: { dau: 1e5, perUser: 5, peak: 1 },
};

export const QPS_SOLO = {
  title: "Pigeon · peak photo uploads per second",
  answerLabel: "Peak uploads per second",
  answerMin: 0.1,
  answerMax: 1e5,
  answerFmt: "num",
  mode: "solo",
  hideTruth: true,
  chain: "users × share who upload × photos each ÷ seconds in a day × peak factor",
  steps: [
    { id: "dau", label: "Daily active users", min: 1e4, max: 1e9, truth: 5e6 },
    { id: "share", label: "Share who upload", min: 0.001, max: 1, truth: 0.2, fmt: "pct" },
    { id: "photos", label: "Photos each", min: 1, max: 100, truth: 1.5 },
    { id: "secondsPerDay", label: "Seconds in a day", min: 1e4, max: 2e5, truth: 86400, inverse: true },
    { id: "peak", label: "Peak ÷ average", min: 1, max: 20, truth: 3, fmt: "x" },
  ],
};

export default definePack({
  id: "estimation-qps",
  title: "Estimation: QPS from Users",
  kind: "concept",
  estimatedMinutes: 12,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "Capacity request · Pigeon API", detail: "due Friday" },
    lines: [
      { speaker: "rao", line: "Procurement wants a server count by Friday. I have a user count and a feeling." },
      { speaker: "meera", line: "Then turn the feeling into a chain of numbers you can argue with one at a time." },
    ],
  },
  predictions: [
    {
      id: "peak-qps",
      kind: "numeric",
      prompt: "Pigeon has 2 million daily active users, each sending about 40 messages a day. The evening peak is about 3 times the daily average. Roughly how many messages per second at peak?",
      unit: "messages/s",
      min: 10,
      max: 100000,
      log: true,
      answer: 2800,
      tolerance: 1.6,
      observe: "close",
      reveal: {
        text: "80 million messages a day divided by 86,400 seconds is about 930 per second on average. Three times that is about 2,800 at peak.",
        derived: true,
        line: { speaker: "meera", line: "Four small numbers, one answer. That is the whole trick." },
      },
    },
  ],
  widget: { id: "estimate-lab", config: QPS_PLAY },
  mechanism: [
    {
      id: "chain",
      scene: "chain",
      text: "Start with people and end with per-second. Users times actions per user per day gives requests per day. Divide by the seconds in a day for the average rate. Multiply by a peak factor to get the number you size for.",
    },
    {
      id: "day",
      scene: "round",
      text: "A day is 86,400 seconds. Rounding it to 100,000 is only 16% high and lets you divide in your head: 10 million requests a day is about 100 per second. A month is about 2.5 million seconds.",
      sourceIds: ["sdp-estimation"],
    },
    {
      id: "round",
      text: "Round hard and keep one significant digit. Estimates go wrong by factors of ten, not by small percentages, so the aim is the right power of ten and a written chain a reviewer can argue with one number at a time.",
    },
    {
      id: "peak",
      text: "Traffic is spiky, so the average is not the number to size for. For a consumer app a peak of two to five times the daily average is a common starting rule. Replace it with your own graph as soon as you have one.",
    },
  ],
  challenges: [
    {
      id: "photo-uploads",
      title: "Size the photo launch",
      brief: "Pigeon adds photo sharing. 5 million daily users; on a given day 20% upload photos, 1.5 photos each; peak is 3 times the daily average. Estimate peak uploads per second. Within a factor of two wins.",
      line: { speaker: "kabir", line: "Don't compute it exactly. Tell me the power of ten and show me the chain." },
      widget: { id: "estimate-lab", config: QPS_SOLO },
      conditions: [{ metric: "factor", op: "<=", value: 2, label: "Within 2× of the reference" }],
      stars: [{ metric: "factor", op: "<=", value: 1.25, label: "Within 25%" }],
      hints: [
        "How many users upload on a given day, and how many photos is that in total?",
        "Divide the daily total by the seconds in a day, about 100,000 if you round.",
        "That is the average. What do you multiply by to get the peak?",
      ],
    },
  ],
  explainBack: {
    prompt: "Walk through how you would turn a number of daily users into a peak requests-per-second figure to size servers for.",
    rubric: [
      { id: "chain", criterion: "Multiplies users by actions per user per day to get requests per day", keyIdea: "users × actions" },
      { id: "seconds", criterion: "Divides by the seconds in a day (about 100,000 when rounded) for the average rate", keyIdea: "÷ 86,400" },
      { id: "peak", criterion: "Applies a peak-to-average factor, because capacity is sized for the peak", keyIdea: "peak factor" },
    ],
    exemplar:
      "Daily users times requests per user gives requests a day. Dividing by about 86,400 seconds, roughly 100,000, gives the average per second. I then multiply by a peak factor, say three, because I size for the peak, and I state each assumption so it can be challenged.",
  },
  reviews: [
    {
      id: "eq-est-avg",
      format: "estimate",
      scenario: "An API serves 30 million requests a day, evenly spread. About how many requests per second is that on average?",
      unit: "req/s",
      answer: 350,
      acceptFactor: 1.3,
      breakdown: ["30,000,000 ÷ 86,400 seconds", "≈ 347", "round: 30M ÷ 100k = 300"],
      explain: "Divide by 86,400, or by 100,000 and add a sixth. Either way you land at a few hundred, not a few thousand.",
    },
    {
      id: "eq-est-day",
      format: "estimate",
      scenario: "A service peaks at 600 requests per second. Peak is about 3 times the daily average. Roughly how many requests does it serve per day?",
      unit: "requests",
      answer: 17000000,
      acceptFactor: 1.4,
      breakdown: ["Average = 600 ÷ 3 = 200 req/s", "200 × 86,400 seconds", "≈ 17 million requests"],
      explain: "Undo the peak factor first, then multiply by the seconds in a day.",
    },
    {
      id: "eq-est-month",
      format: "estimate",
      scenario: "A feature gets 1 billion requests a month. About how many per second on average? A month is about 2.5 million seconds.",
      unit: "req/s",
      answer: 400,
      acceptFactor: 1.3,
      breakdown: ["1,000,000,000 ÷ 2,500,000", "= 400 req/s"],
      explain: "A month of seconds is the other number worth remembering: 400 req/s is 1 billion requests a month.",
    },
    {
      id: "eq-pick",
      format: "pick-fix",
      scenario: "A teammate writes: 'Pigeon has 2M daily users, so the API must handle 2M requests per second.' What is wrong with the estimate?",
      options: [
        { id: "a", label: "Nothing; users and requests per second are the same thing" },
        { id: "b", label: "It skips requests per user per day and the division by seconds in a day" },
        { id: "c", label: "It should use monthly users instead" },
        { id: "d", label: "It should multiply by the number of servers" },
      ],
      answer: "b",
      explain: "Users are people, not a rate. You need how many requests each makes in a day, then spread them over the seconds in a day, then add a peak factor.",
    },
    {
      id: "eq-order",
      format: "order",
      scenario: "Order these traffic levels by average requests per second, lowest first.",
      items: [
        { id: "hr", label: "3 million requests an hour" },
        { id: "mo", label: "1 billion requests a month" },
        { id: "rps", label: "50 requests per second" },
        { id: "day", label: "10 million requests a day" },
      ],
      answer: ["rps", "day", "mo", "hr"],
      explain: "50, about 115, about 390, and about 830 requests per second. Putting everything in per-second first makes comparison easy.",
    },
    {
      id: "eq-explain",
      format: "explain",
      scenario: "In two sentences: why do you divide daily requests by 86,400 and then multiply by a peak factor?",
      rubric: [
        { id: "avg", criterion: "Dividing by seconds in a day converts a daily total into an average rate" },
        { id: "peak", criterion: "Capacity must cover the peak, which is higher than the average" },
      ],
      exemplar: "Dividing by 86,400 turns a daily count into an average per-second rate. Servers must handle the busiest moment, so I multiply that average by a peak factor.",
      explain: "Average rate sizes the bill; peak rate sizes the fleet.",
    },
  ],
  codex: {
    oneLiner: "Users × actions per day ÷ 86,400 × peak factor. Round hard, write the chain down, and aim for the right power of ten.",
    keyNumbers: [
      { label: "Seconds per day", value: "86,400 (about 10^5)", sourceId: "sdp-estimation" },
      { label: "Seconds per month", value: "about 2.5 million", sourceId: "sdp-estimation" },
      { label: "400 requests per second", value: "about 1 billion requests a month", sourceId: "sdp-estimation" },
    ],
    tradeoffs: [
      { choice: "Round aggressively", gain: "Fast, mental, easy to check", cost: "Can be 20-30% off, which rarely matters at this stage" },
      { choice: "Use a measured peak factor", gain: "Matches your real traffic", cost: "Needs data you may not have yet" },
    ],
    seenIn: ["Every system design interview opens with this arithmetic.", "A capacity request to finance or procurement that must justify a server count."],
    interviewAngle: "State assumptions out loud, label them, and give the result as a range: 'about 1k average, 3k at peak'. Interviewers score the chain, not the digits.",
    aws: [{ concept: "Request rate", service: "ALB RequestCount, CloudWatch metric math", note: "Check your estimate against real traffic when you can" }],
    replay: { id: "estimate-lab", config: { ...QPS_PLAY, mode: "worked" }, scene: "chain" },
  },
  interview: [
    "Design a service for 100 million daily users. What is the peak QPS, and how did you get it?",
    "How would you pick a peak-to-average factor for a brand new product?",
    "What is your quick way to convert requests per month into requests per second?",
  ],
  deeper: [
    {
      title: "Reads and writes are different numbers",
      body: "A chat app has far more reads than sends, since every message is read by every recipient. Split the chain into a write rate and a read rate before sizing, because they stress different parts of the system: writes hit the primary database, reads can often be cached. Do the same arithmetic twice with different actions per user.",
      derived: true,
    },
  ],
  honestPhysics: [
    "The reference answers use round assumptions (2 million users, 40 messages). Real systems have long tails of heavy users, regional daily cycles, and launch spikes the average hides.",
  ],
  sources: [SDP],
  verify: [
    { id: "ref", claim: "The messages chain gives about 2,800 per second at peak", run: "lab", params: { model: "estimate-lab", config: QPS_PLAY, values: { dau: 2e6, perUser: 40, peak: 3 }, metric: "estimate" }, expect: { min: 2700, max: 2850 } },
    { id: "solo-ref", claim: "The photo chain gives about 52 uploads per second at peak", run: "lab", params: { model: "estimate-lab", config: QPS_SOLO, values: { guess: 52 }, metric: "factor" }, expect: { max: 1.02 } },
    { id: "solo-far", claim: "Guessing 500 uploads per second misses by more than 2×", run: "lab", params: { model: "estimate-lab", config: QPS_SOLO, values: { guess: 500 }, metric: "factor" }, expect: { min: 5 } },
  ],
});
