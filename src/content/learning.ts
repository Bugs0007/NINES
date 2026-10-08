/**
 * The learning layer: what each part of NINES teaches, and why. Shown in section intros, chapter pages,
 * missions, debriefs, and the "How NINES teaches" page, so the player always knows what a screen is for.
 *
 * Every built node needs an entry (tests/content/learning.test.ts). Keep lines short: one idea each.
 */
import { GRAPH, NODE_BY_ID, type PlannedNode } from "./graph";

export interface ConceptLearning {
  /** What you'll be able to do afterwards. Starts with a verb. */
  canDo: string;
  /** Why it's worth your time: the real problem it solves, at work or in an interview. */
  why: string;
  /** The single idea to remember if you remember nothing else. */
  keyIdea: string;
}

export const CONCEPT_LEARNING: Record<string, ConceptLearning> = {
  "latency-numbers": {
    canDo: "Estimate how long any step takes, from a memory read to a round trip across an ocean, and find the step that dominates a slow request.",
    why: "Every performance decision starts with knowing what's expensive. At your scale, slow pages are usually too many network round trips, not slow code.",
    keyIdea: "Count round trips before you optimise code.",
  },
  "littles-law": {
    canDo: "Size worker pools and connection pools from traffic and latency with L = λW.",
    why: "When a dependency slows down, in-flight requests pile up and use every worker long before the CPU is busy. That is the classic '502s at 40% CPU' outage.",
    keyIdea: "In flight = arrival rate × time in the system.",
  },
  "queueing-utilization": {
    canDo: "Predict how waiting time grows as a server gets busy, and choose how much headroom to keep.",
    why: "A server at 90% busy looks efficient on a dashboard and feels like an outage to users. Capacity planning is picking your spot on that curve.",
    keyIdea: "Waiting explodes near 100% busy; plan for the peak with headroom.",
  },
  "scale-up-vs-out": {
    canDo: "Choose between a bigger box and more boxes using cost, failure impact, and pooling.",
    why: "It's the first fork in every scaling discussion, in interviews and in real launches, and the right answer depends on what a failure costs you.",
    keyIdea: "Bigger boxes pool better; more boxes fail smaller.",
  },
  "load-balancing": {
    canDo: "Pick a balancing algorithm and health checks that route around slow and dead servers.",
    why: "The balancer decides whether one bad server hurts a few requests or a quarter of them. Interviewers expect you to name both the algorithm and the health check.",
    keyIdea: "Route by how busy servers are, and check health through the real request path.",
  },
  "stateless-services": {
    canDo: "Move session state off the app server so boxes can be added, removed, and restarted freely.",
    why: "Scaling out, deploys, and autoscaling all assume any box can serve any request. State kept on a box quietly breaks all three.",
    keyIdea: "Keep state in a shared store or the client, never in one process.",
  },
  "boss-launch-day": {
    canDo: "Combine all six ideas into one design that survives a launch: sizing, headroom, N−1, routing, and stateless sessions.",
    why: "Real incidents never test one concept at a time. Deciding which idea applies, without being told, is what carries over to interviews and on-call.",
    keyIdea: "Design for the worst minute, not the average one.",
  },
  "inc-fourth-box": {
    canDo: "Work a live incident from dashboards, logs, and traces: stop the bleeding first, then prove the root cause.",
    why: "On-call is where these ideas get used for real. Finding the cause from evidence under time pressure is a different skill from knowing the theory.",
    keyIdea: "Mitigate first, explain second, prevent third.",
  },
  tokens: {
    canDo: "Explain what a token is, why counts differ by language and format, and what a prompt costs per month.",
    why: "Tokens are the unit of cost, speed, and context limits for every LLM feature you'll build.",
    keyIdea: "Cost = tokens × price × volume, and tokens aren't words.",
  },
  "context-windows": {
    canDo: "Decide what goes into each request (what to keep, pin, summarise, or retrieve) and what it costs per conversation.",
    why: "The model only knows what you send it. Most 'it forgot' bugs and runaway bills in LLM products are context decisions.",
    keyIdea: "The model is stateless: you choose what it remembers, every turn.",
  },
  "boss-the-bill": {
    canDo: "Cut an LLM bill by attacking tokens, price per token, and model choice without losing answer quality.",
    why: "Cost reviews come with every AI feature that ships, and 'how would you cut this bill' is a favourite AI-engineering interview question.",
    keyIdea: "Fewer tokens, cheaper tokens, cheaper model where it's safe.",
  },
};

export interface ChapterLearning {
  /** The story of the chapter in one line. */
  story: string;
  /** What you'll be able to do by the end. */
  outcomes: string[];
  /** Why this chapter comes where it does, and why it matters. */
  why: string;
  /** Concrete payoff: interviews and work. */
  payoff: string;
}

export const CHAPTER_LEARNING: Record<string, ChapterLearning> = {
  a1: {
    story: "Pigeon goes from one server to surviving a Product Hunt launch.",
    outcomes: [
      "Estimate latency and find the slow step",
      "Size workers and pools with Little's Law",
      "Keep headroom, and know why 90% busy feels like an outage",
      "Scale out behind a balancer that routes around failure",
      "Make servers stateless so any box can serve anyone",
    ],
    why: "These are the fundamentals every system design interview assumes, and the root cause of most incidents at small and medium scale. Everything later in the Core Grid builds on them.",
    payoff: "In an interview you can size a service from traffic and latency and defend losing a box. At work you'll recognise pool exhaustion and bad routing in your own Django and Postgres stack.",
  },
  b1: {
    story: "Pigeon ships an AI copilot and learns what the model actually sees, and what it costs.",
    outcomes: ["Count and price tokens, and know why languages and formats differ", "Design context: keep, pin, summarise, retrieve", "Cut an LLM bill with trimming, caching, and routing"],
    why: "Every AI-engineering role starts here: the cost, speed, and memory of an LLM feature are all decided by what goes into the context window. It has no prerequisites, so you can start it on day one.",
    payoff: "You'll be able to estimate and defend the cost of an LLM feature, design its memory, and answer the cost and context questions AI-engineering interviews lean on.",
  },
};

export type SectionId = "campaign" | "foundry" | "shift" | "incident" | "codex" | "boss";

export interface SectionLearning {
  name: string;
  /** What you do here, in one line. */
  does: string;
  /** What it trains. */
  trains: string;
  /** The learning reason this mode exists. */
  because: string;
}

export const SECTION_LEARNING: Record<SectionId, SectionLearning> = {
  campaign: {
    name: "Core Grid",
    does: "Learn one new idea per mission, by breaking a simulated system.",
    trains: "Understanding: why systems behave the way they do.",
    because: "You predict what will happen before you see it. A wrong guess you've committed to is the moment learning sticks best, so every mission starts with one.",
  },
  foundry: {
    name: "Agent Foundry",
    does: "The AI-engineering track: the same missions, for LLM systems.",
    trains: "Building with models: tokens, context, cost, and later retrieval and agents.",
    because: "It runs alongside the Core Grid and borrows from it where production AI needs real systems thinking: queues, caching, rate limits.",
  },
  shift: {
    name: "Daily Shift",
    does: "A short daily round: reviews, a micro-challenge, and an estimation drill.",
    trains: "Memory: keeping what you learned.",
    because: "Each review is scheduled just before you'd forget (spaced repetition), and pulling an answer from memory strengthens it far more than rereading. Services you don't review start to rust on the map.",
  },
  incident: {
    name: "Incident Room",
    does: "Take a live page on the simulation: find the cause, stop the bleeding, write the postmortem.",
    trains: "Transfer: using ideas when nobody tells you which one applies.",
    because: "Knowing Little's Law and spotting it in a log line at 2 a.m. are different skills. Incidents practise the second.",
  },
  codex: {
    name: "Codex",
    does: "Cards you earn by building concepts: key numbers, trade-offs, AWS mapping, and the interview angle.",
    trains: "Recall and interview prep.",
    because: "A compact reference you built yourself is the best thing to skim the night before an interview.",
  },
  boss: {
    name: "Boss fights",
    does: "End-of-chapter challenges that mix every idea in the chapter, with your own forecast scored.",
    trains: "Judgement: combining ideas, and knowing how sure you are.",
    because: "Mixing topics (interleaving) is harder in the moment and better for the long run, and scoring your forecast trains calibration.",
  },
};

/** The mission loop, step by step, with the reason each step exists. Used on the "How NINES teaches" page. */
export const LOOP: { step: string; what: string; why: string }[] = [
  { step: "Hook", what: "A real problem lands: a page, a complaint, a bill.", why: "Ideas stick when they arrive as the answer to a problem you already care about." },
  { step: "Predict", what: "You commit to what will happen, and how sure you are.", why: "Committing to a guess, then seeing the truth, is one of the strongest ways to learn. Your confidence is tracked so you learn how calibrated you are." },
  { step: "Play", what: "You make it happen in a live simulation.", why: "Seeing the system behave beats being told how it behaves." },
  { step: "Why", what: "The mechanism, in a few short captions, played on the simulation.", why: "Short explanations right after a surprise land better than long ones before it." },
  { step: "Challenge", what: "Use the idea to hit a target under constraints.", why: "Applying an idea is where understanding becomes skill." },
  { step: "Explain", what: "Say it back in two or three sentences.", why: "Putting an idea into your own words exposes the gaps; the AI coach grades it against a rubric." },
  { step: "Review", what: "The concept joins your Daily Shift and comes back on a schedule.", why: "Spaced retrieval is what makes it last for months instead of days." },
];

export function conceptLearning(id: string): ConceptLearning | undefined {
  return CONCEPT_LEARNING[id];
}

/** Concepts that list this one as a prerequisite: "where this comes back". */
export function buildsInto(id: string): PlannedNode[] {
  return GRAPH.filter((n) => n.prereqs.includes(id));
}

/** Titles of the next few concepts this one unlocks, nearest chapters first. */
export function comesBackIn(id: string, max = 4): string[] {
  const self = NODE_BY_ID.get(id);
  return buildsInto(id)
    .sort((a, b) => Number(a.chapter !== self?.chapter) - Number(b.chapter !== self?.chapter))
    .slice(0, max)
    .map((n) => n.title.replace(/^(Boss|Case|INC-\d+|INC|Field): /, ""));
}
