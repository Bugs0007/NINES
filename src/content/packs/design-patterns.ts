import { definePack } from "../define";

export const DP = { start: { s1: "strategy", s2: "observer", s3: "factory", s4: "none" } };
export const DP_CHALLENGE = { start: { s1: "none", s2: "none", s3: "none", s4: "none" } };

const GOF_BOOK = { id: "gof-book", title: "Gamma, Helm, Johnson, Vlissides (1994), Design Patterns: Elements of Reusable Object-Oriented Software", url: "https://en.wikipedia.org/wiki/Design_Patterns" };
const REFACTORING_GURU = { id: "refactoring-guru", title: "Refactoring.Guru: Design Patterns catalogue (problem, solution, applicability)", url: "https://refactoring.guru/design-patterns/catalog" };
const SINGLETON_HARMFUL = { id: "singleton-testing", title: "Google Testing Blog: Singletons are pathological liars (hidden global state)", url: "https://testing.googleblog.com/2008/08/by-miko-hevery-so-you-join-new-project.html" };

export default definePack({
  id: "design-patterns",
  title: "Design Patterns in Action",
  kind: "concept",
  estimatedMinutes: 14,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "code review · 14 classes for a function that adds two numbers", detail: "'it's the Strategy Factory Singleton'" },
    lines: [
      { speaker: "kabir", line: "A teammate reached for patterns in every file and the code has become impossible to read. Another uses none and has a thousand-line if/else." },
      { speaker: "meera", line: "A pattern is a name for a problem and a solution that keeps recurring. Use one when you have the problem, and not before." },
    ],
  },
  predictions: [
    {
      id: "mismatch",
      kind: "choice",
      prompt: "You use a Singleton for all four requirements: the pricing rule, shipping notifications, payment clients and client wrappers. Each wrong pattern adds 3 classes and still needs 3 files per new variant. How many files does one new variant of each cost in total?",
      options: [
        { id: "4", label: "4, one per requirement" },
        { id: "12", label: "12, three per requirement" },
        { id: "16", label: "16, four per requirement" },
      ],
      answer: "12",
      observe: "mismatch",
      reveal: {
        text: "A misapplied pattern has the structure and none of the benefit: 3 files per variant for each of the four, 12 in all, and 12 extra classes. A plain if/else would cost 16 files per set of variants but only 0 extra classes now. The fitting patterns cost 8 extra classes and 4 files per set, one each.",
        derived: true,
        line: { speaker: "rao", line: "Structure that doesn't match the problem is just more code." },
      },
    },
    {
      id: "perfect",
      kind: "choice",
      prompt: "You match all four: strategy for the pricing rule, observer for shipping notifications, factory for payment clients and decorator for wrappers. Compared with plain conditionals, what do you pay and what do you gain?",
      options: [
        { id: "a", label: "8 extra classes now; 1 file per new variant instead of 4" },
        { id: "b", label: "No extra classes and 1 file per new variant" },
        { id: "c", label: "16 extra classes and 1 file per new variant" },
      ],
      answer: "a",
      observe: "perfect",
      reveal: {
        text: "Each fitting pattern is 2 classes: 8 in all, and every new pricing rule, subscriber, payment type or wrapper becomes one new file instead of four edits to a conditional. If you expect two variants ever, the conditional wins. If they arrive every sprint, the patterns repay the 8 classes in a few weeks.",
        derived: true,
        line: { speaker: "meera", line: "A pattern is an investment in a kind of change you expect." },
      },
    },
  ],
  widget: { id: "pattern-lab", config: DP },
  mechanism: [
    {
      id: "what",
      text: "A design pattern is a named, reusable solution to a problem that recurs in object-oriented design: its intent, structure and trade-offs, described in a shared vocabulary. Saying 'make that a strategy' tells a colleague the shape in two words. Patterns are not code to copy. They are shapes to recognise, adapted to the language and the problem.",
      sourceIds: ["gof-book", "refactoring-guru"],
    },
    {
      id: "strategy",
      scene: "strategy",
      text: "Strategy and factory handle variation. Strategy puts interchangeable algorithms behind one interface and lets the caller or configuration pick one at run time: pricing rules, sort orders, retry policies. A factory decides which concrete object to create, so callers depend on an interface and never name the class: payment clients, parsers, storage backends.",
      sourceIds: ["refactoring-guru"],
    },
    {
      id: "observer",
      scene: "observer",
      text: "Observer handles notification. A subject keeps a list of subscribers and calls them when something happens, so the code that ships an order does not know about email, analytics or inventory. New subscribers need no edit to the subject. The cost is indirect control flow: it is hard to see what runs, and ordering and failures need thought.",
      sourceIds: ["refactoring-guru", "gof-book"],
    },
    {
      id: "decorator",
      scene: "decorator",
      text: "Decorator adds behaviour by wrapping: an object with the same interface as the one it contains, adding logging, caching or retries. Wrappers combine in any order, with no class per combination. Beware of Singleton, one global instance: it hides shared state that makes tests order-dependent. Pass it in.",
      sourceIds: ["refactoring-guru", "singleton-testing"],
    },
  ],
  challenges: [
    {
      id: "match-patterns",
      title: "Match the patterns",
      brief: "Pick the pattern that fits each of the four requirements, using all four correctly, and end with at most 4 files for one new variant of each.",
      line: { speaker: "rao", line: "The right shape for each problem, and no more." },
      widget: { id: "pattern-lab", config: DP_CHALLENGE },
      conditions: [
        { metric: "matched", op: ">=", value: 4, label: "All four requirements matched" },
        { metric: "changeCost", op: "<=", value: 4, label: "At most 4 files for one new variant of each" },
      ],
      stars: [],
      hints: ["Which requirement is about swapping an algorithm?", "Which one is about telling several parts something happened?", "Which one stacks behaviours in any order?"],
    },
  ],
  explainBack: {
    prompt: "Explain what a design pattern is and how to decide to use one.",
    rubric: [
      { id: "what", criterion: "A named, recurring solution to a recurring design problem; a shared vocabulary rather than code to copy", keyIdea: "a named solution" },
      { id: "examples", criterion: "Strategy swaps algorithms, factory hides which class is created, observer notifies subscribers, decorator wraps to add behaviour", keyIdea: "four examples" },
      { id: "when", criterion: "Use one when the problem it solves exists and change is expected; a misapplied pattern adds structure without benefit", keyIdea: "match the problem" },
    ],
    exemplar:
      "A design pattern is a named, recurring solution to a recurring design problem, a shared vocabulary rather than code to copy. A strategy swaps algorithms, a factory hides which class is created, an observer notifies subscribers and a decorator wraps an object to add behaviour. I would use one when the problem it solves actually exists and change is expected, because a misapplied pattern adds structure without any benefit.",
  },
  reviews: [
    {
      id: "dpa-est",
      format: "estimate",
      scenario: "Each fitting pattern costs 2 classes. Four patterns cost how many extra classes, and how many files per set of four new variants does that save compared with four files per variant in conditionals (16 versus 4)?",
      unit: "extra classes",
      answer: 8,
      acceptFactor: 1,
      breakdown: ["4 × 2 = 8 extra classes", "16 − 4 = 12 fewer files per set of variants"],
      explain: "The break-even depends on how often variants arrive.",
    },
    {
      id: "dpa-pick",
      format: "pick-fix",
      scenario: "Logging, caching and retry behaviour must wrap an HTTP client in any combination, and a subclass for every combination is exploding. Which pattern fits?",
      options: [
        { id: "a", label: "Decorator" },
        { id: "b", label: "Singleton" },
        { id: "c", label: "Observer" },
        { id: "d", label: "Factory" },
      ],
      answer: "a",
      explain: "Wrappers that share the client's interface combine freely in any order, and no class per combination is needed.",
    },
    {
      id: "dpa-order",
      format: "order",
      scenario: "Order these by files touched to add one new variant, most first.",
      items: [
        { id: "ifelse", label: "if / else for the variant" },
        { id: "wrong", label: "The wrong pattern" },
        { id: "right", label: "The fitting pattern" },
      ],
      answer: ["ifelse", "wrong", "right"],
      explain: "4, 3 and 1.",
    },
    {
      id: "dpa-graph",
      format: "predict-graph",
      scenario: "Adding variants to the conditional approach edits 4 files each time. How does the cumulative number of files edited grow with the number of variants?",
      xLabel: "variants added →",
      yLabel: "cumulative files edited",
      options: [
        { id: "steep", label: "4 for every variant: a steep straight line", points: [0, 4, 8, 12, 16, 20, 24, 28] },
        { id: "one", label: "1 for every variant", points: [0, 1, 2, 3, 4, 5, 6, 7] },
        { id: "flat", label: "Stays flat", points: [0, 0, 0, 0, 0, 0, 0, 0] },
      ],
      answer: "steep",
      explain: "A pattern costs 2 classes up front and 1 file per variant, so it is ahead from the second variant. With one variant ever, the conditional wins.",
    },
    {
      id: "dpa-flaw",
      format: "spot-flaw",
      scenario: "A global DatabaseConnection.getInstance() is called from forty classes, and tests share one connection and fail when run in a different order. Tap the cause.",
      diagram: {
        nodes: [
          { id: "classes", label: "40 classes call getInstance()", kind: "server", col: 0, row: 1 },
          { id: "single", label: "global singleton connection", kind: "db", col: 1, row: 1 },
          { id: "tests", label: "tests share state", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "classes", to: "single" },
          { from: "single", to: "tests" },
        ],
      },
      answer: "single->tests",
      explain: "A singleton is hidden global state. Tests inherit each other's changes. Pass the connection in, and create one instance at start-up if you want only one.",
    },
    {
      id: "dpa-explain",
      format: "explain",
      scenario: "In two sentences: why can using a pattern make code worse?",
      rubric: [
        { id: "cost", criterion: "Every pattern adds classes and indirection that readers must follow, which is a cost paid whether or not the variation ever arrives" },
        { id: "fit", criterion: "A pattern that does not match the problem has the structure and none of the benefit" },
      ],
      exemplar: "Every pattern adds classes and indirection that readers must follow, a cost paid whether or not the variation ever arrives. A pattern that does not match the problem has the structure and none of the benefit.",
      explain: "Patterns are for problems you have.",
    },
  ],
  codex: {
    oneLiner: "A pattern names a recurring problem and its shape. Strategy swaps algorithms, factory hides creation, observer notifies, decorator wraps. Use when the problem exists.",
    keyNumbers: [
      { label: "Fitting pattern vs conditionals, files per new variant (lab)", value: "1 vs 4", sourceId: "gof-book" },
      { label: "Four fitting patterns, extra classes (lab)", value: "8", sourceId: "refactoring-guru" },
    ],
    tradeoffs: [
      { choice: "A pattern", gain: "Cheap new variants; shared vocabulary", cost: "Classes and indirection now" },
      { choice: "Plain conditionals", gain: "Simple while variants are few", cost: "Grows with every variant" },
      { choice: "Singleton", gain: "One instance", cost: "Hidden global state; hard tests" },
    ],
    seenIn: ["Payment gateways (strategy + factory); event buses (observer); HTTP middleware (decorator).", "Every machine-coding round that asks for extensibility."],
    interviewAngle: "Say: 'name the problem first, then the pattern: swappable algorithm is strategy, notifying is observer, creation hidden is factory, stacked behaviour is decorator'.",
    aws: [{ concept: "Event-driven observers", service: "Amazon EventBridge and SNS as managed observers" }],
    replay: { id: "pattern-lab", config: DP, scene: "decorator" },
  },
  interview: [
    "What is the Strategy pattern and when would you use it?",
    "What is the difference between a factory and a builder?",
    "Why is the Singleton considered harmful by some?",
  ],
  deeper: [
    {
      title: "Patterns in your language",
      body: "Many patterns are shaped by what a language lacks. In a language with first-class functions, a strategy is just a function you pass in, and an observer is a list of callbacks. Know the idea in the book's form, and write the lighter version your language allows.",
      sourceIds: ["gof-book"],
    },
  ],
  honestPhysics: [
    "Four requirements, each with one fitting pattern: choose a pricing rule at run time (strategy), notify several parts when an order ships (observer), create a payment client without naming a class (factory), wrap a client with logging, caching and retries in any mix (decorator).",
    "A fitting pattern costs 2 classes and makes a new variant 1 file. A plain if/else costs 0 classes and 4 files per variant. A misapplied pattern costs 3 classes and 3 files per variant. Round figures.",
  ],
  sources: [GOF_BOOK, REFACTORING_GURU, SINGLETON_HARMFUL],
  verify: [
    { id: "none", claim: "Conditionals everywhere cost 16 files per set of variants", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: {}, metric: "changeCost" }, expect: { min: 16, max: 16 } },
    { id: "right", claim: "The four fitting patterns cost 4 files and 8 classes", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: { s1: "strategy", s2: "observer", s3: "factory", s4: "decorator" }, metric: "changeCost" }, expect: { min: 4, max: 4 } },
    { id: "right-c", claim: "…8 extra classes", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: { s1: "strategy", s2: "observer", s3: "factory", s4: "decorator" }, metric: "extraClasses" }, expect: { min: 8, max: 8 } },
    { id: "matched", claim: "All four are matched", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: { s1: "strategy", s2: "observer", s3: "factory", s4: "decorator" }, metric: "matched" }, expect: { min: 4, max: 4 } },
    { id: "wrong", claim: "Singletons everywhere cost 12 files and 12 classes", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: { s1: "singleton", s2: "singleton", s3: "singleton", s4: "singleton" }, metric: "changeCost" }, expect: { min: 12, max: 12 } },
    { id: "three", claim: "Three matched and one conditional cost 7 files", run: "lab", params: { model: "pattern-lab", config: DP_CHALLENGE, values: { s1: "strategy", s2: "observer", s3: "factory", s4: "none" }, metric: "changeCost" }, expect: { min: 7, max: 7 } },
  ],
});
