import { definePack } from "../define";

export const OWASP = { start: { inject: true, xss: true, auth: true, deps: true, csrf: true, headers: false, logs: false } };
export const OWASP_CHALLENGE = {};

const TOP10 = { id: "owasp-top10-2021", title: "OWASP Top 10 (2021)", url: "https://owasp.org/Top10/" };
const SQLI = { id: "owasp-sqli", title: "OWASP Cheat Sheet Series: SQL Injection Prevention (parameterised queries)", url: "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html" };
const XSS = { id: "owasp-xss", title: "OWASP Cheat Sheet Series: Cross Site Scripting Prevention", url: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html" };

export default definePack({
  id: "owasp-top-risks",
  title: "OWASP Top Risks",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "pager",
    alert: { severity: "page", title: "security · customer table dumped via the search box", detail: "query: ' OR '1'='1" },
    lines: [
      { speaker: "kabir", line: "Someone typed a single quote and a bit of SQL into the search box and downloaded every customer. The search query was built by joining strings together." },
      { speaker: "meera", line: "You have two weeks and a small team. Fix the holes that matter most first, not the ones that are easiest to describe." },
    ],
  },
  predictions: [
    {
      id: "sqli",
      kind: "choice",
      prompt: "In the lab, an app with injection left open has about 1.2 expected breaches a year, and fixing it takes 2 engineer-days with parameterised queries. What does the fix change?",
      options: [
        { id: "little", label: "Little: it is one of seven risks" },
        { id: "quarter", label: "It removes about a quarter of the total risk for 2 days of work" },
        { id: "all", label: "It removes all the risk" },
      ],
      answer: "quarter",
      observe: "sqli-open",
      reveal: {
        text: "Injection is the largest single item in the lab: 1.2 of 4.6 expected breaches, about 26%, and the cheapest of the big ones to fix. Parameterised queries send the data separately from the command, so input can never become code. Fix the biggest, cheapest risk first.",
        derived: true,
        line: { speaker: "meera", line: "Parameterise every query. There is no good reason to build SQL from strings." },
      },
    },
    {
      id: "xss",
      kind: "choice",
      prompt: "The app prints a user's comment into the page without escaping it. Another user views the page, and the comment contains a script. What does the script run as?",
      options: [
        { id: "attacker", label: "As the attacker's own code, in their own browser" },
        { id: "victim", label: "As the page, in the victim's browser, with the victim's session" },
        { id: "server", label: "On the server" },
      ],
      answer: "victim",
      observe: "xss-open",
      reveal: {
        text: "The browser cannot tell the script from the site's own code, so it runs with the victim's session and permissions: it can read their data, act as them and steal their tokens. Escape every value for the place it is printed, and add a content security policy to limit what any script can do.",
        derived: true,
        line: { speaker: "rao", line: "The browser trusts the page. Whatever is in the page is the page." },
      },
    },
  ],
  widget: { id: "owasp-lab", config: OWASP },
  mechanism: [
    {
      id: "list",
      text: "The OWASP Top 10 ranks the most common and serious web application risks from real breach data. It is not a checklist of everything that can go wrong; it is a way of spending a small amount of attention where it prevents most harm. Broken access control, cryptographic failures and injection lead the 2021 list.",
      sourceIds: ["owasp-top10-2021"],
    },
    {
      id: "inject",
      scene: "inject",
      text: "Injection happens when untrusted input becomes part of a command: SQL, a shell, a template. The cure is to keep data and code apart. Parameterised queries send values separately from the statement, so a quote in the input is just a character. Validate input as well, but treat that as a second layer.",
      sourceIds: ["owasp-sqli"],
    },
    {
      id: "xss",
      scene: "xss",
      text: "Cross-site scripting puts attacker-controlled script into a page other users see. Escape output for its context, HTML, attribute or JavaScript, use a framework that does it by default, and add a content security policy as a safety net. Pair with SameSite cookies and anti-forgery tokens against cross-site request forgery.",
      sourceIds: ["owasp-xss", "owasp-top10-2021"],
    },
    {
      id: "triage",
      scene: "triage",
      text: "Security work competes with everything else, so rank by risk and cost. Close the large, cheap holes first: injection, output escaping, login guessing, outdated libraries. Add detection last but do add it, because the ones you miss will be found by someone, and logging decides how long they stay.",
      sourceIds: ["owasp-top10-2021"],
      derived: true,
    },
  ],
  challenges: [
    {
      id: "harden",
      title: "Harden the app with eleven days",
      brief: "An app with seven weaknesses and eleven engineer-days. Choose the fixes so expected breaches fall to half a breach a year or less within the time you have.",
      line: { speaker: "rao", line: "I have eleven days, not fourteen. Pick the work that earns the most." },
      widget: { id: "owasp-lab", config: OWASP_CHALLENGE },
      conditions: [
        { metric: "breachesPerYear", op: "<=", value: 0.51, label: "At most 0.5 expected breaches a year" },
        { metric: "engineerDays", op: "<=", value: 11, label: "At most 11 engineer-days" },
      ],
      stars: [{ metric: "breachesPerYear", op: "<=", value: 0.25, label: "At most 0.25 breaches a year" }],
      hints: [
        "Which weaknesses carry the most expected breaches?",
        "Which of the big ones are cheapest to close?",
        "What is left when the days run out?",
      ],
    },
  ],
  explainBack: {
    prompt: "Choose three web risks from the OWASP Top 10 and explain how to prevent each.",
    rubric: [
      { id: "inject", criterion: "Injection is prevented by separating data from commands with parameterised queries", keyIdea: "parameterise" },
      { id: "xss", criterion: "Cross-site scripting is prevented by escaping output for its context and using a content security policy", keyIdea: "escape output" },
      { id: "access", criterion: "Broken access control and weak authentication are prevented by server-side checks, deny by default, rate limiting and strong login", keyIdea: "server-side access control" },
    ],
    exemplar:
      "Injection is prevented by keeping data and commands apart with parameterised queries, so input can never become SQL. Cross-site scripting is prevented by escaping output for the place it is printed and adding a content security policy as a net. Broken access control is prevented by checking every request on the server, denying by default, and combining it with rate limits and strong login to stop credential guessing.",
  },
  reviews: [
    {
      id: "ow-est",
      format: "estimate",
      scenario: "An app has expected breaches of 1.2, 0.9, 0.8, 0.7, 0.5, 0.3 and 0.2 a year from seven weaknesses. After closing the first four, how many expected breaches a year remain?",
      unit: "breaches",
      answer: 1,
      acceptFactor: 1.05,
      breakdown: ["0.5 + 0.3 + 0.2", "= 1.0"],
      explain: "Closing the big four removes 3.6 of the 4.6. The tail is small but not zero.",
    },
    {
      id: "ow-pick",
      format: "pick-fix",
      scenario: "A search endpoint builds SQL as 'SELECT * FROM items WHERE name LIKE ' + userInput'. Which fix is the most reliable?",
      options: [
        { id: "a", label: "A parameterised query that passes the input as a bound value" },
        { id: "b", label: "Strip single quotes from the input" },
        { id: "c", label: "Block the word SELECT in input" },
        { id: "d", label: "Limit input length to 20 characters" },
      ],
      answer: "a",
      explain: "Blocklists and cleaning miss variants. Bound parameters make the database treat input as data whatever it contains.",
    },
    {
      id: "ow-order",
      format: "order",
      scenario: "Order these by expected breaches a year in the lab, highest first.",
      items: [
        { id: "inject", label: "Injection" },
        { id: "xss", label: "Cross-site scripting" },
        { id: "csrf", label: "Cross-site request forgery" },
        { id: "headers", label: "Misconfiguration and headers" },
      ],
      answer: ["inject", "xss", "csrf", "headers"],
      explain: "Injection 1.2, scripting 0.9, request forgery 0.5, misconfiguration 0.3.",
    },
    {
      id: "ow-graph",
      format: "predict-graph",
      scenario: "You fix the seven weaknesses from the largest risk to the smallest. After each fix, how do the remaining expected breaches per year change?",
      xLabel: "weaknesses fixed →",
      yLabel: "expected breaches a year left",
      options: [
        { id: "curve", label: "Falls steeply at first, then flattens", points: [4.6, 3.4, 2.5, 1.7, 1.0, 0.5, 0.2, 0] },
        { id: "line", label: "Falls in a straight line", points: [4.6, 3.9, 3.3, 2.6, 2.0, 1.3, 0.7, 0] },
        { id: "flat", label: "Barely changes until all are fixed", points: [4.6, 4.6, 4.6, 4.6, 4.6, 4.6, 4.6, 0] },
      ],
      answer: "curve",
      explain: "The risks are unequal, so the first fixes remove the most. That is the argument for ranking by risk.",
    },
    {
      id: "ow-flaw",
      format: "spot-flaw",
      scenario: "A login endpoint accepts unlimited password attempts. An attacker tries millions of leaked passwords against known email addresses. Tap the missing protection.",
      diagram: {
        nodes: [
          { id: "attacker", label: "attacker with a password list", kind: "client", col: 0, row: 1 },
          { id: "login", label: "POST /login, no limit", kind: "server", col: 1, row: 1 },
          { id: "users", label: "user accounts", kind: "db", col: 2, row: 1 },
        ],
        edges: [
          { from: "attacker", to: "login" },
          { from: "login", to: "users" },
        ],
      },
      answer: "attacker->login",
      explain: "Nothing slows guessing. Rate limit by account and address, lock or delay after failures, and prefer multi-factor sign-in.",
    },
    {
      id: "ow-explain",
      format: "explain",
      scenario: "In two sentences: why keep dependencies updated as a security measure?",
      rubric: [
        { id: "known", criterion: "Vulnerabilities in libraries are public once found, so attackers scan for apps using the vulnerable versions" },
        { id: "inherit", criterion: "An app inherits every flaw in its dependencies, often most of its code, so updating and scanning are cheap protection" },
      ],
      exemplar: "Once a library flaw is published, attackers scan for apps that still use the vulnerable version. Most of an app's code is dependencies, so scanning and updating them is cheap protection against known holes.",
      explain: "Known holes are the easiest ones to exploit.",
    },
  ],
  codex: {
    oneLiner: "Rank risks by harm and cost. Parameterise queries, escape output, rate limit login, update dependencies, check access server-side, and add detection.",
    keyNumbers: [
      { label: "Top item, OWASP Top 10 2021", value: "A01 Broken Access Control", sourceId: "owasp-top10-2021" },
      { label: "Injection prevention", value: "parameterised queries", sourceId: "owasp-sqli" },
    ],
    tradeoffs: [
      { choice: "Fix the biggest risks first", gain: "Most harm removed per day", cost: "Smaller risks wait" },
      { choice: "Content security policy", gain: "Limits what injected script can do", cost: "Takes tuning; can break pages" },
      { choice: "Security logging and alerts", gain: "Shortens how long an attacker stays", cost: "Does not stop the first attack" },
    ],
    seenIn: ["OWASP Top 10 and ASVS used in security reviews.", "Dependency scanners such as Dependabot and Snyk."],
    interviewAngle: "Say: 'parameterise queries, escape output, enforce access control server-side, rate limit authentication, patch dependencies, and log for detection'.",
    aws: [{ concept: "Managed rules for common attacks", service: "AWS WAF" }],
    replay: { id: "owasp-lab", config: { start: { inject: true, xss: true, auth: true, deps: true, csrf: true, headers: true, logs: false } }, scene: "triage" },
  },
  interview: [
    "How do you prevent SQL injection?",
    "What is cross-site scripting and how do you prevent it?",
    "How would you prioritise security work with limited time?",
  ],
  deeper: [
    {
      title: "The list is a floor",
      body: "The Top 10 changes with the data, and several entries are categories, not single bugs. It is a good place to start a review and a poor place to stop. Threat modelling, which asks what an attacker wants and how they would get it from your system, finds weaknesses the list cannot, because they depend on what your product does.",
      sourceIds: ["owasp-top10-2021"],
    },
  ],
  honestPhysics: [
    "An app with seven weaknesses, each with expected breaches a year if left open: injection 1.2, cross-site scripting 0.9, credential guessing 0.8, vulnerable dependencies 0.7, request forgery 0.5, misconfiguration 0.3, missing detection 0.2. Fixes cost 2, 3, 2, 1, 2, 1 and 3 engineer-days.",
    "The figures are invented for the exercise; their order follows what incident reports show.",
    "Expected breaches add; they are not a forecast for a real app.",
  ],
  sources: [TOP10, SQLI, XSS],
  verify: [
    { id: "all-open", claim: "With nothing fixed the lab expects 4.6 breaches a year", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: {}, metric: "breachesPerYear" }, expect: { min: 4.5, max: 4.7 } },
    { id: "five", claim: "Fixing the five biggest costs 10 days and leaves 0.5 breaches", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: { inject: true, xss: true, auth: true, deps: true, csrf: true }, metric: "breachesPerYear" }, expect: { max: 0.51 } },
    { id: "five-days", claim: "…for 10 engineer-days", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: { inject: true, xss: true, auth: true, deps: true, csrf: true }, metric: "engineerDays" }, expect: { min: 10, max: 10 } },
    { id: "six", claim: "Adding headers brings it to 0.2 for 11 days", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: { inject: true, xss: true, auth: true, deps: true, csrf: true, headers: true }, metric: "breachesPerYear" }, expect: { max: 0.25 } },
    { id: "skip-csrf", claim: "Skipping request forgery to pay for logging leaves 1 breach and costs 12 days", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: { inject: true, xss: true, auth: true, deps: true, headers: true, logs: true }, metric: "engineerDays" }, expect: { min: 12 } },
    { id: "inj-only", claim: "Injection alone leaves 3.4", run: "lab", params: { model: "owasp-lab", config: OWASP_CHALLENGE, values: { inject: true }, metric: "breachesPerYear" }, expect: { min: 3.3, max: 3.5 } },
  ],
});
