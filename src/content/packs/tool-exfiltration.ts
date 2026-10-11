import { definePack } from "../define";

export const EX = { start: { img: true, fetch: true, mail: true, csp: true, allow: true, approve: true, strip: false, dlp: false } };
export const EX_CHALLENGE = { start: { img: true, fetch: true, mail: true, csp: false, allow: false, approve: false, strip: false, dlp: false } };

const EMBRACE = { id: "embrace-red", title: "Embrace The Red: markdown image exfiltration in LLM applications (Johann Rehberger)", url: "https://embracethered.com/blog/posts/2023/bing-chat-data-exfiltration-poc-and-fix/" };
const OWASP_DISC = { id: "owasp-llm02", title: "OWASP GenAI: LLM02 Sensitive Information Disclosure", url: "https://genai.owasp.org/llmrisk/llm022025-sensitive-information-disclosure/" };
const MDN_CSP = { id: "mdn-csp", title: "MDN: Content Security Policy (img-src and connect-src directives)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP" };

export default definePack({
  id: "tool-exfiltration",
  title: "Exfiltration Through Tools",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "egress log · 212 requests to evil.example with long query strings", detail: "source: chat widget image loads" },
    lines: [
      { speaker: "kabir", line: "A hijacked answer rendered a markdown image from an attacker's server with a customer's record in the URL, and the browser fetched it unprompted." },
      { speaker: "meera", line: "Stealing needs a way out. List every way out the model has, then close them, instead of trying to read its intentions." },
    ],
  },
  predictions: [
    {
      id: "open",
      kind: "choice",
      prompt: "A hijacked agent holds a customer record. The product renders markdown images (90% likely to work as a channel), has a fetch-any-URL tool (85%) and can send email (80%), and nothing is closed. What is the chance the data gets out?",
      options: [
        { id: "90", label: "About 90%, the best channel" },
        { id: "997", label: "About 99.7%, any one will do" },
        { id: "50", label: "About 50%" },
      ],
      answer: "997",
      observe: "image-leak",
      reveal: {
        text: "The data needs only one channel, and the failure probabilities multiply: 0.1 × 0.15 × 0.2 × 0.9 leaves 0.3%, so 99.7% gets out. Every extra capability is another door. Features that look harmless, like rendering an image or previewing a link, are channels.",
        derived: true,
        line: { speaker: "rao", line: "Each tool is a door. List them before an attacker does." },
      },
    },
    {
      id: "sealed",
      kind: "choice",
      prompt: "You allow images only from your own domain, allowlist the fetch tool's destinations, require approval for outbound email, and scan outbound data. A link the user might click is still possible. What chance of exfiltration remains?",
      options: [
        { id: "0", label: "Zero" },
        { id: "4", label: "About 4%" },
        { id: "40", label: "About 40%" },
      ],
      answer: "4",
      observe: "sealed",
      reveal: {
        text: "A link in the answer is still a channel: it needs the user to click, so 10% before the data-loss scan and 4% after it cuts each channel's success by 60%. Stripping URLs from output closes it, but costs 3% of useful output. What you accept depends on the data's value.",
        derived: true,
        line: { speaker: "meera", line: "Close the doors you can. Price the ones you cannot." },
      },
    },
  ],
  widget: { id: "exfil-lab", config: EX },
  mechanism: [
    {
      id: "model",
      text: "An injection can read private data in the agent's context, but harm needs a way to move it out. A channel is anything that carries data to the attacker: a request to their URL, an email, a message posted somewhere visible, a file in a shared place, or text the user is led to copy.",
      sourceIds: ["embrace-red", "owasp-llm02"],
    },
    {
      id: "image",
      scene: "image",
      text: "The classic channel is a markdown image. The model writes an image whose URL carries the data in its query string, the chat interface renders it and the browser fetches it with no click. Fix it in the renderer: allow images only from known origins with a content security policy, or do not render model-written URLs.",
      sourceIds: ["embrace-red", "mdn-csp"],
    },
    {
      id: "tools",
      scene: "allowlist",
      text: "Tools are channels too. A tool that fetches any URL, posts to any webhook or emails any address can carry data out as arguments. Restrict destinations to an allowlist, send only where the task needs, and scan what leaves for sensitive content.",
      sourceIds: ["owasp-llm02"],
    },
    {
      id: "approval",
      scene: "approval",
      text: "Where you cannot close a channel, put a person in front of it. Show the full outbound action, the destination and the content, and require approval when it is triggered after the agent has read untrusted input. Approvals cost attention, so reserve them for the channels that carry the most risk and make them rare enough to be read.",
      sourceIds: ["owasp-llm02"],
    },
  ],
  challenges: [
    {
      id: "seal-channels",
      title: "Seal the channels",
      brief: "The product keeps image rendering, the fetch tool and email. Get the chance of exfiltration to 5% or less, with at most 10 approvals per 100 sessions and at least 92% of output kept useful.",
      line: { speaker: "rao", line: "Keep the features. Close the doors." },
      widget: { id: "exfil-lab", config: EX_CHALLENGE },
      conditions: [
        { metric: "leakProb", op: "<=", value: 0.05, label: "Exfiltration chance at most 5%" },
        { metric: "approvalsPer100", op: "<=", value: 10, label: "At most 10 approvals per 100 sessions" },
        { metric: "utility", op: ">=", value: 0.92, label: "At least 92% of output useful" },
      ],
      stars: [{ metric: "leakProb", op: "<=", value: 0.01, label: "Exfiltration chance at most 1%" }],
      hints: ["Which control closes each channel?", "What does stripping URLs cost?", "Where is a person worth the interruption?"],
    },
  ],
  explainBack: {
    prompt: "Explain how data is exfiltrated through an LLM application and how to close the channels.",
    rubric: [
      { id: "channel", criterion: "Harm needs an outbound channel: auto-loaded images, URL-fetching tools, email, webhooks or links, with the data in the URL or arguments", keyIdea: "needs a way out" },
      { id: "close", criterion: "Close channels at the rendering and tool layers: image origin policy, destination allowlists, restricted recipients and URL stripping", keyIdea: "close channels, not intentions" },
      { id: "gate", criterion: "Scan outbound data and require approval for the channels that remain, for actions after untrusted input", keyIdea: "scan and approve" },
    ],
    exemplar:
      "A hijack needs an outbound channel to move data out, such as an auto-loaded markdown image, a tool that fetches any URL, email or webhooks, with the data carried in the URL or arguments. I would close channels at the rendering and tool layers with an image-origin policy, destination allowlists and restricted recipients, and strip URLs where the cost is acceptable. For what remains I would scan outbound data and require a person to approve actions taken after untrusted input.",
  },
  reviews: [
    {
      id: "ex-est",
      format: "estimate",
      scenario: "Two independent channels each succeed 90% and 85% of the time when open. What is the chance data gets out through at least one?",
      unit: "%",
      answer: 98.5,
      acceptFactor: 1.01,
      breakdown: ["1 − (0.1 × 0.15) = 98.5%", "channels add: closing one barely helps if the other stays open"],
      explain: "Closing one of two open channels leaves 85–90%. You have to close them all.",
    },
    {
      id: "ex-pick",
      format: "pick-fix",
      scenario: "A chat app renders markdown from model output, including images from any URL. Which change closes the image channel?",
      options: [
        { id: "a", label: "A content security policy allowing images only from your own domains" },
        { id: "b", label: "Telling the model not to write image links" },
        { id: "c", label: "Scanning the user's message for attacks" },
        { id: "d", label: "Using a bigger model" },
      ],
      answer: "a",
      explain: "The browser enforces the policy whatever the model writes. A request to the model depends on the model obeying.",
    },
    {
      id: "ex-order",
      format: "order",
      scenario: "Order these setups by chance of exfiltration, highest first.",
      items: [
        { id: "open", label: "All three channels open" },
        { id: "one", label: "Image channel closed, fetch and email open" },
        { id: "sealed", label: "Images, fetch and email closed, link remains" },
      ],
      answer: ["open", "one", "sealed"],
      explain: "99.7%, 97% and 10%.",
    },
    {
      id: "ex-graph",
      format: "predict-graph",
      scenario: "As you close channels one at a time, starting with the most reliable for the attacker, how does the exfiltration chance change?",
      xLabel: "channels closed →",
      yLabel: "chance data gets out",
      options: [
        { id: "late", label: "Stays high until the last open channel closes", points: [99.7, 98, 85, 10, 10, 10, 10, 10] },
        { id: "linear", label: "Falls steadily with each", points: [100, 75, 50, 25, 0, 0, 0, 0] },
        { id: "first", label: "Falls to near zero after the first", points: [99.7, 5, 5, 5, 5, 5, 5, 5] },
      ],
      answer: "late",
      explain: "The data needs only one. Each open channel keeps the chance high until the last big one closes.",
    },
    {
      id: "ex-flaw",
      format: "spot-flaw",
      scenario: "An agent's email tool takes any recipient the model chooses and sends without review. The agent reads incoming support tickets. Tap the problem.",
      diagram: {
        nodes: [
          { id: "ticket", label: "support ticket (untrusted)", kind: "external", col: 0, row: 1 },
          { id: "agent", label: "agent", kind: "llm", col: 1, row: 1 },
          { id: "mail", label: "email to any address, no review", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "ticket", to: "agent" },
          { from: "agent", to: "mail" },
        ],
      },
      answer: "agent->mail",
      explain: "An attacker-written ticket can instruct the agent to mail private data anywhere. Restrict recipients to the ticket's own customer, or require approval.",
    },
    {
      id: "ex-explain",
      format: "explain",
      scenario: "In two sentences: why close channels instead of trying to detect malicious instructions?",
      rubric: [
        { id: "detect", criterion: "Detection is imperfect because attackers rephrase, so some injections will get through" },
        { id: "channel", criterion: "A closed channel limits the harm of every injection, known or unknown, because the data has no way out" },
      ],
      exemplar: "Detection is imperfect because attackers can rephrase, so some injections will get through. A closed channel limits the harm of every injection, known or unknown, because the data has no way out.",
      explain: "Controls that do not depend on the model's judgement are the ones that hold.",
    },
  ],
  codex: {
    oneLiner: "Stealing needs a channel. List every way out (images, fetch tools, email, links), close them with policy and allowlists, and gate the rest.",
    keyNumbers: [
      { label: "All three channels open (lab)", value: "99.7% exfiltration", sourceId: "embrace-red" },
      { label: "Three closed plus a scan (lab)", value: "4% via links", sourceId: "owasp-llm02" },
    ],
    tradeoffs: [
      { choice: "Strip URLs from output", gain: "Closes images and links", cost: "3% of useful output" },
      { choice: "Approval on email", gain: "Human stops a bad send", cost: "6 approvals per 100 sessions" },
      { choice: "Outbound scan", gain: "Cuts every channel", cost: "False blocks and latency" },
    ],
    seenIn: ["Markdown-image exfiltration reports against major chat products.", "Email and webhook tools in agent platforms."],
    interviewAngle: "Say: 'enumerate egress channels and close them in the renderer and tools, then scan and approve what remains'.",
    aws: [{ concept: "Egress control", service: "VPC endpoints and egress allowlists; CloudFront response headers for CSP" }],
    replay: { id: "exfil-lab", config: EX, scene: "image" },
  },
  interview: [
    "How could a prompt injection steal data from a chat application?",
    "Why is rendering markdown images risky?",
    "How would you restrict what an email tool can do?",
  ],
  deeper: [
    {
      title: "Egress is the control you already know",
      body: "Network egress filtering, allowlists for outbound destinations and review of outbound messages are old security practice. The new part is that the party picking the destination is a model that can be steered by text. Apply the old controls at the tool and rendering boundary, where the model's output becomes an action.",
      sourceIds: ["owasp-llm02"],
    },
  ],
  honestPhysics: [
    "A hijacked assistant holding a secret can hurt you only if it can get the data out. Channels when open: a markdown image whose URL carries the data (90% likely to work), a fetch tool for any URL (85%), a mail tool (80%) and a link the user might click (10%).",
    "Controls: an image-origin policy closes images, an allowlist closes the fetch tool, approval closes email (about 6 approvals per 100 sessions), and stripping URLs and images closes images and links at a 3% cost in useful output. A scan of outbound data cuts each remaining channel's success by 60%. Round figures.",
  ],
  sources: [EMBRACE, OWASP_DISC, MDN_CSP],
  verify: [
    { id: "open", claim: "With all three channels open 99.7% of hijacks exfiltrate", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: {}, metric: "leakProb" }, expect: { min: 0.996, max: 0.998 } },
    { id: "three-closed", claim: "Closing images, fetch and email leaves the link channel at 10%", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, allow: true, approve: true }, metric: "leakProb" }, expect: { min: 0.099, max: 0.101 } },
    { id: "plus-scan", claim: "A scan brings it to 4%", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, allow: true, approve: true, dlp: true }, metric: "leakProb" }, expect: { min: 0.039, max: 0.041 } },
    { id: "approvals", claim: "…at 6 approvals per 100 sessions", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, allow: true, approve: true, dlp: true }, metric: "approvalsPer100" }, expect: { min: 5.9, max: 6.1 } },
    { id: "util", claim: "…keeping 93% of output useful", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, allow: true, approve: true, dlp: true }, metric: "utility" }, expect: { min: 0.92, max: 0.94 } },
    { id: "strip", claim: "Stripping URLs too closes everything but costs utility below 92%", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, allow: true, approve: true, strip: true }, metric: "utility" }, expect: { max: 0.92 } },
    { id: "approve-fetch", claim: "Approving fetches instead of allowlisting costs 15 approvals per 100 sessions", run: "lab", params: { model: "exfil-lab", config: EX_CHALLENGE, values: { csp: true, approve: true }, metric: "approvalsPer100" }, expect: { min: 14.9, max: 15.1 } },
  ],
});
