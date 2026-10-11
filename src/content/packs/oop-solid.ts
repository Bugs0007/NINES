import { definePack } from "../define";

export const SO = { start: { iface: true, di: true, split: true, compose: false, segregate: false } };
export const SO_CHALLENGE = { start: { iface: false, di: false, split: false, compose: false, segregate: false } };

const MARTIN = { id: "martin-solid", title: "Robert C. Martin: The principles of OOD (SOLID)", url: "http://butunclebob.com/ArticleS.UncleBob.PrinciplesOfOod" };
const GOF = { id: "gof", title: "Gamma, Helm, Johnson, Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software (favour composition over inheritance)", url: "https://en.wikipedia.org/wiki/Design_Patterns" };
const FOWLER_REFACTOR = { id: "fowler-refactor", title: "Martin Fowler: Refactoring (small behaviour-preserving steps)", url: "https://refactoring.com/" };

export default definePack({
  id: "oop-solid",
  title: "OOP & SOLID",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "complaint",
    alert: { severity: "info", title: "PR review · 'adding Slack support touches 6 files and breaks email'", detail: "test setup: needs live SMTP and SMS accounts" },
    lines: [
      { speaker: "kabir", line: "Adding a Slack notifier means editing a switch statement in six files, and testing it needs real SMS credentials. Each change feels like defusing something." },
      { speaker: "meera", line: "SOLID is five questions that make code easier to change. Each answer costs some structure, so ask which change you actually expect." },
    ],
  },
  predictions: [
    {
      id: "tangled",
      kind: "choice",
      prompt: "A notifier is one class with a switch on channel type, hard-wired provider calls, and formatting, sending and retry mixed together. How many files does adding one more channel touch in the lab?",
      options: [
        { id: "1", label: "One, the new class" },
        { id: "2", label: "Two" },
        { id: "6", label: "Six" },
      ],
      answer: "6",
      observe: "tangled",
      reveal: {
        text: "Each place that branches on the channel type must learn about the new one: the switch, the formatter, the retry rules, the configuration, the tests and the docs. Six files, and each is a chance to miss one. An interface with implementations registered by name lets a new channel be one new class and one line in a registry.",
        derived: true,
        line: { speaker: "rao", line: "If adding a feature means editing old code, the old code was closed in the wrong place." },
      },
    },
    {
      id: "over",
      kind: "choice",
      prompt: "You apply all five principles: interface, injection, split, composition and small interfaces. The class count goes to 9 and the chance a change breaks something falls to 8.7%. The three-principle version has 7 classes and 11.3%. Was the extra worth it?",
      options: [
        { id: "yes", label: "Yes, always apply every principle" },
        { id: "maybe", label: "Two classes for 2.6 points: judge it against the changes you expect" },
        { id: "no", label: "No, none of them are worth it" },
      ],
      answer: "maybe",
      observe: "over-built",
      reveal: {
        text: "Each principle has a price in classes and indirection. The first few buy a lot: the interface turns six files into two, and injection turns a 25-minute test into three. The last ones buy a point or two. A small, stable module may not need them; a module changing every sprint does.",
        derived: true,
        line: { speaker: "meera", line: "Abstract where the change is, not everywhere." },
      },
    },
  ],
  widget: { id: "solid-lab", config: SO },
  mechanism: [
    {
      id: "objects",
      text: "Object-oriented design groups data with the behaviour that uses it, hides detail behind an interface, lets different types respond to the same call (polymorphism), and reuses code through inheritance or composition. Its aim is to confine change: when a requirement moves, as few places as possible should need to be edited, and tests should not need the whole world.",
      sourceIds: ["gof", "martin-solid"],
    },
    {
      id: "srp-ocp",
      scene: "interface",
      text: "Single responsibility: a class should have one reason to change, so formatting, sending and retry live apart. Open/closed: add behaviour by adding code, not editing old code. Put what varies behind an interface, such as a Channel with send(), register implementations by name, and a new channel becomes a new class instead of a change to a switch.",
      sourceIds: ["martin-solid"],
    },
    {
      id: "lsp-isp-dip",
      scene: "inject",
      text: "Liskov: a subtype must work wherever its parent is expected, without surprises. Interface segregation: many small interfaces beat one wide one, so clients depend only on what they use. Dependency inversion: depend on abstractions, and pass concrete providers in from outside. Then a test supplies a fake sender, and no real accounts are needed.",
      sourceIds: ["martin-solid"],
    },
    {
      id: "judgement",
      scene: "split",
      text: "Prefer composition to inheritance: build behaviour from parts that can be swapped, and avoid deep class trees that couple a child to its parent's internals. Do not apply principles by rote. Refactor in small steps, with tests, towards the change you expect, and stop when the code is easy to change in the ways it actually changes.",
      sourceIds: ["gof", "fowler-refactor"],
    },
  ],
  challenges: [
    {
      id: "refactor-notifier",
      title: "Refactor the notifier",
      brief: "A new channel should touch at most 2 files, a change should be testable in 5 minutes or less, the chance of breaking something should be 12% or less, and the design should stay within 7 classes.",
      line: { speaker: "rao", line: "Enough structure to change safely, and no more." },
      widget: { id: "solid-lab", config: SO_CHALLENGE },
      conditions: [
        { metric: "filesToAddChannel", op: "<=", value: 2, label: "At most 2 files for a new channel" },
        { metric: "testSetupMin", op: "<=", value: 5, label: "At most 5 minutes to test a change" },
        { metric: "changeRisk", op: "<=", value: 0.12, label: "At most 12% chance of breaking something" },
        { metric: "classCount", op: "<=", value: 7, label: "At most 7 classes" },
      ],
      stars: [{ metric: "changeRisk", op: "<=", value: 0.1, label: "At most 10% chance of breaking something" }],
      hints: ["Which change makes a new channel cheap?", "Which makes tests fast?", "You cannot afford every principle: which ones cost no extra classes?"],
    },
  ],
  explainBack: {
    prompt: "Explain SOLID and how you would decide how much of it to apply.",
    rubric: [
      { id: "principles", criterion: "Single responsibility, open/closed, Liskov substitution, interface segregation and dependency inversion, each with its purpose", keyIdea: "five principles" },
      { id: "effect", criterion: "They make change cheap: new behaviour added by adding classes, tests using fakes, and fewer places a change can break", keyIdea: "they confine change" },
      { id: "judgement", criterion: "Each costs structure, so apply them where change is expected and stop when more adds little", keyIdea: "judgement, not rote" },
    ],
    exemplar:
      "SOLID is single responsibility, open/closed, Liskov substitution, interface segregation and dependency inversion. They make change cheap by letting me add behaviour by adding classes, test with fakes, and keep a change from breaking distant code. Each one costs structure, so I apply them where I expect change and stop when more adds little.",
  },
  reviews: [
    {
      id: "so-est",
      format: "estimate",
      scenario: "Each of two principles cuts the chance a change breaks something: 0.6 times and 0.7 times. Starting at 30%, what is the chance after both?",
      unit: "%",
      answer: 12.6,
      acceptFactor: 1.05,
      breakdown: ["30% × 0.6 × 0.7 = 12.6%"],
      explain: "Improvements multiply, and each one has diminishing absolute returns.",
    },
    {
      id: "so-pick",
      format: "pick-fix",
      scenario: "A ReportService creates its own PostgreSQL connection inside its methods. Tests need a database running. Which principle fixes this most directly?",
      options: [
        { id: "a", label: "Dependency inversion: depend on an abstraction and pass the implementation in" },
        { id: "b", label: "Open/closed" },
        { id: "c", label: "Single responsibility" },
        { id: "d", label: "Interface segregation" },
      ],
      answer: "a",
      explain: "Passing the connection (or a repository interface) in lets tests supply a fake with no database.",
    },
    {
      id: "so-order",
      format: "order",
      scenario: "Order these refactorings by minutes of test setup saved, most first.",
      items: [
        { id: "di", label: "Inject the providers" },
        { id: "iface", label: "Interface and registry only" },
        { id: "none", label: "No change" },
      ],
      answer: ["di", "iface", "none"],
      explain: "Down to 3 minutes, to 20 minutes, and 25 minutes unchanged.",
    },
    {
      id: "so-graph",
      format: "predict-graph",
      scenario: "As you apply principles one at a time (interface, injection, split, composition, small interfaces), how does the chance of a change breaking something fall?",
      xLabel: "principles applied →",
      yLabel: "chance of breakage",
      options: [
        { id: "diminish", label: "Falls, with each step smaller", points: [30, 18, 16.2, 11.3, 9.6, 8.7, 8.7, 8.7] },
        { id: "linear", label: "Falls evenly to zero", points: [30, 24, 18, 12, 6, 0, 0, 0] },
        { id: "flat", label: "Barely falls", points: [30, 29, 28, 27, 26, 25, 25, 25] },
      ],
      answer: "diminish",
      explain: "Each step multiplies the risk by a factor, so the absolute gain shrinks as the risk falls.",
    },
    {
      id: "so-flaw",
      format: "spot-flaw",
      scenario: "A Bird class has a fly() method. Penguin extends Bird and overrides fly() to throw an exception. Code that takes a Bird and calls fly() now crashes. Tap the broken principle's link.",
      diagram: {
        nodes: [
          { id: "bird", label: "Bird: fly()", kind: "server", col: 0, row: 1 },
          { id: "penguin", label: "Penguin extends Bird, fly() throws", kind: "server", col: 1, row: 1 },
          { id: "client", label: "code that expects any Bird to fly", kind: "client", col: 2, row: 1 },
        ],
        edges: [
          { from: "bird", to: "penguin" },
          { from: "penguin", to: "client" },
        ],
      },
      answer: "bird->penguin",
      explain: "Penguin cannot be used wherever a Bird is expected, which breaks Liskov substitution. Split the interface into Bird and FlyingBird, or compose abilities.",
    },
    {
      id: "so-explain",
      format: "explain",
      scenario: "In two sentences: why prefer composition to inheritance?",
      rubric: [
        { id: "coupling", criterion: "Inheritance ties a child to its parent's internals, so changes in the parent ripple down and behaviour is fixed at compile time" },
        { id: "swap", criterion: "Composition builds behaviour from parts that can be swapped or combined at run time and tested separately" },
      ],
      exemplar: "Inheritance ties a child to its parent's internals, so changes in the parent ripple down and the behaviour is fixed at compile time. Composition builds behaviour from parts that can be swapped or combined at run time and tested separately.",
      explain: "Has-a is more flexible than is-a.",
    },
  ],
  codex: {
    oneLiner: "SOLID makes change cheap: one reason to change, extend by adding, true subtypes, small interfaces, depend on abstractions. Apply where change is expected.",
    keyNumbers: [
      { label: "Files to add a channel: tangled vs interface (lab)", value: "6 vs 2", sourceId: "martin-solid" },
      { label: "Test time with injection (lab)", value: "3 vs 25 minutes", sourceId: "martin-solid" },
    ],
    tradeoffs: [
      { choice: "More interfaces and classes", gain: "Cheap extension and tests", cost: "Indirection to read through" },
      { choice: "Inheritance", gain: "Reuse with little code", cost: "Tight coupling to the parent" },
      { choice: "Abstract early", gain: "Ready for variation", cost: "Guessing which variation" },
    ],
    seenIn: ["Plug-in architectures and strategy registries.", "Constructor injection in Spring, NestJS and ASP.NET."],
    interviewAngle: "Say: 'SOLID in one line each; show a refactor from a switch to an interface; mention dependency injection for tests; and warn against over-abstraction'.",
    aws: [{ concept: "Pluggable providers", service: "AWS SDK client interfaces with dependency injection" }],
    replay: { id: "solid-lab", config: SO, scene: "inject" },
  },
  interview: [
    "Explain the SOLID principles.",
    "What is dependency injection and why does it help testing?",
    "When is it a mistake to apply a design principle?",
  ],
  deeper: [
    {
      title: "Cohesion and coupling",
      body: "SOLID is a set of ways to raise cohesion (things that change together live together) and lower coupling (things that change separately do not depend on each other). When a design feels wrong, ask which two things change for different reasons yet sit in one class, and which two change for the same reason yet sit apart.",
      sourceIds: ["fowler-refactor"],
    },
  ],
  honestPhysics: [
    "A notifier with one class, a switch on channel type and hard-wired providers: adding a channel touches 6 files, testing a change needs live accounts (25 minutes), a change breaks something 30% of the time, and the class has 5 responsibilities.",
    "A channel interface and registry: 2 files, risk × 0.6, 2 more classes. Injected dependencies: 3 minutes of test setup, risk × 0.9, 1 more class. Splitting by responsibility: 1.5 responsibilities per class, risk × 0.7, 2 more classes. Composition: risk × 0.85. Small interfaces: risk × 0.9, 2 more classes. Round figures.",
  ],
  sources: [MARTIN, GOF, FOWLER_REFACTOR],
  verify: [
    { id: "base", claim: "The tangled design touches 6 files to add a channel", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: {}, metric: "filesToAddChannel" }, expect: { min: 6, max: 6 } },
    { id: "iface", claim: "An interface and registry make it 2", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { iface: true }, metric: "filesToAddChannel" }, expect: { min: 2, max: 2 } },
    { id: "di", claim: "Injection cuts test setup to 3 minutes", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { di: true }, metric: "testSetupMin" }, expect: { min: 3, max: 3 } },
    { id: "three", claim: "Interface, injection and a split give 11.3% risk in 7 classes", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { iface: true, di: true, split: true }, metric: "changeRisk" }, expect: { min: 0.11, max: 0.115 } },
    { id: "three-c", claim: "…and 7 classes", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { iface: true, di: true, split: true }, metric: "classCount" }, expect: { min: 7, max: 7 } },
    { id: "all", claim: "All five give 8.7% risk in 9 classes", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { iface: true, di: true, split: true, compose: true, segregate: true }, metric: "changeRisk" }, expect: { min: 0.085, max: 0.09 } },
    { id: "all-c", claim: "…which is more classes than the target allows", run: "lab", params: { model: "solid-lab", config: SO_CHALLENGE, values: { iface: true, di: true, split: true, compose: true, segregate: true }, metric: "classCount" }, expect: { min: 9, max: 9 } },
  ],
});
