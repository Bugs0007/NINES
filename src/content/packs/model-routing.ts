import { definePack } from "../define";

export const RT = { start: { strategy: "small", accuracy: 0.9, threshold: 0.8 } };
export const RT_CHALLENGE = {};

const FRUGAL = { id: "frugalgpt", title: "Chen, Zaharia, Zou (2023), FrugalGPT: how to use LLMs while reducing cost and improving performance", url: "https://arxiv.org/abs/2305.05176" };
const ROUTELLM = { id: "routellm", title: "Ong et al. (2024), RouteLLM: learning to route LLMs with preference data", url: "https://arxiv.org/abs/2406.18665" };
const PRICING = { id: "anthropic-pricing", title: "Anthropic: pricing for Claude models (tiers differ by several times in price)", url: "https://www.anthropic.com/pricing" };

export default definePack({
  id: "model-routing",
  title: "Routing by Cost, Quality & Latency",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "bill",
    alert: { severity: "warn", title: "inference spend · $9.00 per 1,000 requests", detail: "60% of traffic is 'what are your opening hours'" },
    lines: [
      { speaker: "kabir", line: "We send every request to the biggest model because the hard ones need it. Most of what we send is trivial." },
      { speaker: "meera", line: "Paying for the large model on easy questions is the cost. A router decides, per request, how much model it deserves." },
    ],
  },
  predictions: [
    {
      id: "all-large",
      kind: "choice",
      prompt: "A large model costs ten times a small one per request. It gets 96.4% of requests right against 85.6% for the small one. Sending everything to the large model costs $9 per 1,000. Which statement is true?",
      options: [
        { id: "worth", label: "Worth it: ten points of quality for ten times the price" },
        { id: "waste", label: "Mostly waste: the extra quality sits in 10% of the requests, yet all of them pay" },
        { id: "equal", label: "Both models are about equal" },
      ],
      answer: "waste",
      observe: "all-large",
      reveal: {
        text: "The gap is concentrated in the hard 10%, where the small model is right 40% of the time against 88%. On easy requests the models are nearly equal (97% against 98.5%), yet each pays ten times. Spending the large model where it matters recovers most of the quality for about half the cost.",
        derived: true,
        line: { speaker: "rao", line: "The quality difference is not spread evenly across traffic." },
      },
    },
    {
      id: "misroute",
      kind: "choice",
      prompt: "A classifier sends easy requests to the small model and the rest to the large one. It is only 70% accurate. Compared with everything on the large model, what happens to quality?",
      options: [
        { id: "collapse", label: "It collapses toward the small model's 86%" },
        { id: "small", label: "It drops about two points, to 94%, at roughly half the cost" },
        { id: "same", label: "No change" },
      ],
      answer: "small",
      observe: "misroute",
      reveal: {
        text: "Mistakes go both ways. Easy requests sent up cost money but not quality, and hard ones sent down lose quality, but only 15% of hard and medium requests are misrouted to the small model with 70% accuracy. Quality is 94.3% at $5.17 per 1,000: a respectable router can be wrong 3 times in 10.",
        derived: true,
        line: { speaker: "meera", line: "A router does not have to be perfect. It has to be right where the stakes are." },
      },
    },
  ],
  widget: { id: "router-lab", config: RT },
  mechanism: [
    {
      id: "why",
      text: "Models differ in price, speed and quality, and requests differ in how much quality they need. A short factual lookup does not need the largest model, and a legal analysis may. Routing matches each request to the cheapest model that will answer it well enough, so spend follows difficulty.",
      sourceIds: ["frugalgpt", "anthropic-pricing"],
    },
    {
      id: "classify",
      scene: "classify",
      text: "A classifier router predicts the difficulty before answering and picks a model. It can be rules, a small model or a trained router. It costs a small call and adds a little delay, and its mistakes matter unevenly: sending an easy request up wastes money, and sending a hard one down costs quality.",
      sourceIds: ["routellm"],
    },
    {
      id: "cascade",
      scene: "cascade",
      text: "A cascade tries the small model first and escalates when it seems unsure, using a confidence score, a checker or a validation rule. A stricter threshold catches more wrong answers and escalates more good ones too. Escalated requests pay for both models and wait for both, so the latency tail grows.",
      sourceIds: ["frugalgpt"],
    },
    {
      id: "measure",
      text: "Decide by evaluating on your own traffic: the quality, cost and latency of each option on a labelled sample, drawn as a frontier. Pick the cheapest point that clears your quality bar, and re-check it when prices or models change, because the best route today may not be next quarter.",
      sourceIds: ["routellm"],
    },
  ],
  challenges: [
    {
      id: "route-it",
      title: "Choose the routing",
      brief: "Reach at least 95% right at no more than $5 per 1,000 requests and a mean latency of 1.7 s or less. Neither extreme works.",
      line: { speaker: "kabir", line: "Finance wants it under five dollars. Quality wants it above ninety-five." },
      widget: { id: "router-lab", config: RT_CHALLENGE },
      conditions: [
        { metric: "quality", op: ">=", value: 0.95, label: "At least 95% of answers right" },
        { metric: "costPer1k", op: "<=", value: 5, label: "At most $5 per 1,000 requests" },
        { metric: "meanLatency", op: "<=", value: 1.7, label: "Mean latency at most 1.7 s" },
      ],
      stars: [{ metric: "costPer1k", op: "<=", value: 4.4, label: "At most $4.40 per 1,000 requests" }],
      hints: ["Which two extremes fail?", "What does a classifier cost when it is wrong?", "How does the cascade threshold trade quality for cost?"],
    },
  ],
  explainBack: {
    prompt: "Explain how model routing saves money and how it can go wrong.",
    rubric: [
      { id: "why", criterion: "Requests differ in difficulty and models in price, so match each request to the cheapest model that is good enough", keyIdea: "spend follows difficulty" },
      { id: "methods", criterion: "A classifier picks before answering; a cascade tries the small model and escalates when unsure", keyIdea: "classify or cascade" },
      { id: "risk", criterion: "Misroutes cost quality when hard requests go down; escalations cost money and latency; measure on your own traffic", keyIdea: "measure the trade-off" },
    ],
    exemplar:
      "Requests differ in difficulty and models in price, so a router sends easy requests to a small, cheap model and keeps the large one for the hard ones. A classifier decides before answering, while a cascade tries the small model and escalates when it seems unsure. Mistakes cost quality when hard requests go down, and cost money and latency when easy ones go up or get escalated, so I would measure the options on a labelled sample of real traffic.",
  },
  reviews: [
    {
      id: "rt-est",
      format: "estimate",
      scenario: "A request costs $0.009 on the large model and $0.0009 on the small. If 60% of 1,000 requests go to the small model and 40% to the large, what is the cost?",
      unit: "$",
      answer: 4.14,
      acceptFactor: 1.05,
      breakdown: ["600 × $0.0009 = $0.54", "400 × $0.009 = $3.60", "total $4.14, against $9.00 for all large"],
      explain: "Even sending a minority to the large model removes most of the cost.",
    },
    {
      id: "rt-pick",
      format: "pick-fix",
      scenario: "A cascade escalates 40% of requests, and users complain it is slow. What is the likely cause?",
      options: [
        { id: "a", label: "Escalated requests wait for the small model and then the large one" },
        { id: "b", label: "The small model is too large" },
        { id: "c", label: "Caching is on" },
        { id: "d", label: "The large model is too fast" },
      ],
      answer: "a",
      explain: "Escalation pays for both calls in sequence. A better classifier or a tighter threshold reduces how often it happens.",
    },
    {
      id: "rt-order",
      format: "order",
      scenario: "Order these by cost per 1,000 requests in the lab, highest first.",
      items: [
        { id: "large", label: "Everything to the large model" },
        { id: "casc", label: "Cascade at threshold 0.8" },
        { id: "class", label: "Classifier at 90% accuracy" },
        { id: "small", label: "Everything to the small model" },
      ],
      answer: ["large", "class", "casc", "small"],
      explain: "$9.00, $4.52, $4.30 and $0.90.",
    },
    {
      id: "rt-graph",
      format: "predict-graph",
      scenario: "As the cascade's escalation threshold rises from low to high, how does the cost per 1,000 requests change?",
      xLabel: "threshold →",
      yLabel: "cost per 1,000",
      options: [
        { id: "rise", label: "Rises, because more requests escalate", points: [1.4, 2.1, 2.8, 3.4, 4.3, 5.4, 6.1, 6.5] },
        { id: "fall", label: "Falls as the router gets stricter", points: [6.5, 6.1, 5.4, 4.3, 3.4, 2.8, 2.1, 1.4] },
        { id: "flat", label: "Stays level", points: [4, 4, 4, 4, 4, 4, 4, 4] },
      ],
      answer: "rise",
      explain: "A higher threshold catches more wrong small answers and sends more good ones up too, so cost climbs toward the large model's.",
    },
    {
      id: "rt-flaw",
      format: "spot-flaw",
      scenario: "A team routes by prompt length: short prompts go to the small model, long ones to the large. Tap the weak assumption.",
      diagram: {
        nodes: [
          { id: "req", label: "request", kind: "client", col: 0, row: 1 },
          { id: "rule", label: "if prompt < 200 tokens", kind: "server", col: 1, row: 1 },
          { id: "small", label: "small model", kind: "llm", col: 2, row: 0 },
          { id: "large", label: "large model", kind: "llm", col: 2, row: 2 },
        ],
        edges: [
          { from: "req", to: "rule" },
          { from: "rule", to: "small" },
          { from: "rule", to: "large" },
        ],
      },
      answer: "rule->small",
      explain: "Length is a weak proxy for difficulty. A short question can need deep reasoning, and a long document may need a simple summary. Test the rule against labelled traffic.",
    },
    {
      id: "rt-explain",
      format: "explain",
      scenario: "In two sentences: why should you evaluate a router on your own traffic rather than on a published benchmark?",
      rubric: [
        { id: "mix", criterion: "The share of easy and hard requests in your traffic decides how much routing saves and costs, and a benchmark's mix differs" },
        { id: "bar", criterion: "Your quality bar and error costs are specific, so only a labelled sample of your own requests shows where the router fails you" },
      ],
      exemplar: "How much routing saves depends on the mix of easy and hard requests in your traffic, and a benchmark's mix is different. Your quality bar and the cost of an error are also yours, so only a labelled sample of your own requests shows where the router lets you down.",
      explain: "Measure on your own mix.",
    },
  ],
  codex: {
    oneLiner: "Send each request to the cheapest model that is good enough: classify first or cascade on confidence, and measure on your own traffic.",
    keyNumbers: [
      { label: "Large model vs small, per request (lab)", value: "10× the price", sourceId: "anthropic-pricing" },
      { label: "Classifier routing at 90% accuracy (lab)", value: "95% right at $4.52 per 1,000", sourceId: "frugalgpt" },
    ],
    tradeoffs: [
      { choice: "Classifier router", gain: "One model call per request", cost: "Misroutes and a router call" },
      { choice: "Cascade", gain: "Self-correcting", cost: "Escalated requests pay twice and wait twice" },
      { choice: "Always the large model", gain: "Simple, high quality", cost: "Pays for difficulty most requests lack" },
    ],
    seenIn: ["FrugalGPT-style cascades.", "Router products and gateway 'model fallback' rules."],
    interviewAngle: "Say: 'match model to difficulty; classify or cascade; evaluate the frontier of cost, quality and latency on real traffic'.",
    aws: [{ concept: "Prompt routing between models", service: "Amazon Bedrock Intelligent Prompt Routing" }],
    replay: { id: "router-lab", config: RT, scene: "classify" },
  },
  interview: [
    "How would you reduce LLM costs without hurting quality?",
    "Compare a classifier router with a cascade.",
    "How do you evaluate a router?",
  ],
  deeper: [
    {
      title: "Routing on more than difficulty",
      body: "Routes can also depend on latency needs (a live chat versus a nightly batch), data sensitivity (a private request to a model you host), or capability (images or long context). Keep the rules in configuration so they can be changed without a deploy, and log which route each request took so you can audit quality by route.",
      sourceIds: ["routellm"],
    },
  ],
  honestPhysics: [
    "Traffic is 60% easy, 30% medium and 10% hard. The small model is right 97%, 78% and 40% of the time; the large model 98.5%, 95% and 88%. Illustrative prices: $0.0009 a request for the small tier, $0.009 for the large; answers take 0.6 s and 2.4 s.",
    "A classifier sends easy requests small and the rest large, costs $0.00006 and 0.15 s, and misroutes at the accuracy you set. A cascade tries the small model and escalates a share of wrong answers equal to the threshold, plus 0.6 × threshold³ of the right ones. Round figures to show the shape of the trade-off, not measurements of any model.",
  ],
  sources: [FRUGAL, ROUTELLM, PRICING],
  verify: [
    { id: "large-cost", claim: "Everything to the large model costs $9 per 1,000 requests", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "large" }, metric: "costPer1k" }, expect: { min: 8.9, max: 9.1 } },
    { id: "large-q", claim: "…and is right 96.4% of the time", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "large" }, metric: "quality" }, expect: { min: 0.96, max: 0.97 } },
    { id: "small-q", claim: "Everything to the small model is right 85.6% of the time", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "small" }, metric: "quality" }, expect: { min: 0.85, max: 0.86 } },
    { id: "class70", claim: "A 70%-accurate classifier still reaches 94% quality", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "classify", accuracy: 0.7 }, metric: "quality" }, expect: { min: 0.94, max: 0.95 } },
    { id: "class90", claim: "A 90%-accurate classifier meets the target", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "classify", accuracy: 0.9 }, metric: "quality" }, expect: { min: 0.95 } },
    { id: "class90-cost", claim: "…at about $4.52 per 1,000", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "classify", accuracy: 0.9 }, metric: "costPer1k" }, expect: { max: 5 } },
    { id: "casc", claim: "A cascade at 0.8 also meets it", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "cascade", threshold: 0.8 }, metric: "quality" }, expect: { min: 0.95 } },
    { id: "casc-high", claim: "A cascade at 0.9 passes quality but exceeds the budget", run: "lab", params: { model: "router-lab", config: RT_CHALLENGE, values: { strategy: "cascade", threshold: 0.9 }, metric: "costPer1k" }, expect: { min: 5 } },
  ],
});
