import { definePack } from "../define";

export const SP = { start: { algo: "greedy", money: "cents", n: 8 } };
export const SP_CHALLENGE = { lockN: true, n: 8, start: { algo: "each", money: "float" } };

const SPLITWISE = { id: "splitwise-debts", title: "Splitwise engineering: simplify debts (minimising the number of payments)", url: "https://blog.splitwise.com/2012/09/14/debts-made-simple/" };
const FLOAT_MONEY = { id: "float-money", title: "What every computer scientist should know about floating-point arithmetic (David Goldberg)", url: "https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html" };
const MIN_CASH_FLOW = { id: "min-cash-flow", title: "Minimum cash flow problem: settling debts among friends (greedy and its limits)", url: "https://www.geeksforgeeks.org/minimize-cash-flow-among-given-set-of-friends-who-have-borrowed-money-from-each-other/" };

export default definePack({
  id: "lld-splitwise",
  title: "LLD: Splitwise",
  kind: "concept",
  estimatedMinutes: 15,
  hook: {
    visual: "bill",
    alert: { severity: "info", title: "group trip · 8 people, 40 expenses, 80 payments to settle", detail: "ledger off by 3 cents" },
    lines: [
      { speaker: "kabir", line: "Eight friends share forty bills. The app wants eighty payments, and its totals are off by three cents." },
      { speaker: "meera", line: "Don't repay each bill: net everyone's balance and a few payments settle the group. Count money in cents." },
    ],
  },
  predictions: [
    {
      id: "many",
      kind: "choice",
      prompt: "Eight friends shared 40 expenses, each split among about three of them, and the app settles each expense separately. How many payments does that need?",
      options: [
        { id: "7", label: "7" },
        { id: "28", label: "28" },
        { id: "80", label: "80" },
      ],
      answer: "80",
      observe: "too-many-payments",
      reveal: {
        text: "Each expense has about two people who owe the payer, so 40 expenses need 80 payments. Everyone's final position is a single net number, though, and settling those balances needs at most N − 1 = 7 payments, since many of the 80 cancel out.",
        derived: true,
        line: { speaker: "rao", line: "Settle balances, not bills." },
      },
    },
    {
      id: "drift",
      kind: "choice",
      prompt: "The ledger stores amounts as floating-point dollars. After 40 expenses the sum of everyone's balances should be zero. What is it?",
      options: [
        { id: "0", label: "Exactly zero" },
        { id: "3", label: "A few cents off" },
        { id: "100", label: "A dollar off" },
      ],
      answer: "3",
      observe: "drift",
      reveal: {
        text: "Decimal amounts such as 0.10 have no exact binary representation, so every addition carries a tiny error. About 0.075 cents per expense in the lab: 3 cents after 40. Someone is always owed a cent no one owes. Storing integer cents, and deciding who gets the leftover cent, keeps the books balanced.",
        derived: true,
        line: { speaker: "meera", line: "Money is a count of cents. Treat it as an integer." },
      },
    },
  ],
  widget: { id: "split-lab", config: SP },
  mechanism: [
    {
      id: "model",
      text: "Model the domain simply: a User, a Group, and an Expense with a payer, a total and splits. Splits can be equal, exact, percentage or shares; each is a small strategy that turns a total into per-person amounts. Everything else is derived: a balance is what a person paid minus what they owe.",
      sourceIds: ["splitwise-debts"],
    },
    {
      id: "money",
      scene: "cents",
      text: "Keep money as an integer number of cents, or use a decimal type. When a total does not divide evenly, such as 100 split three ways, the pieces must still sum to the total: give the extra cent to someone deterministically. A ledger that does not sum to zero is a bug one check finds.",
      sourceIds: ["float-money"],
    },
    {
      id: "simplify",
      scene: "greedy",
      text: "To simplify debts, compute each net balance, then repeatedly match the person owed the most with the person who owes the most and transfer the smaller amount; one reaches zero each time. That settles N people in at most N − 1 payments, in N log N time with a heap.",
      sourceIds: ["splitwise-debts", "min-cash-flow"],
    },
    {
      id: "optimal",
      scene: "optimal",
      text: "The true minimum is harder. If the group splits into sub-groups whose balances already cancel, each needs one payment fewer, and finding them means testing subsets of people, which is exponential: fine for ten people, hopeless for fifty. Most products use the greedy method.",
      sourceIds: ["min-cash-flow"],
    },
  ],
  challenges: [
    {
      id: "settle-group",
      title: "Settle the group",
      brief: "Eight people, 40 expenses: settle in 7 payments or fewer, within 200 steps of computation, and with no rounding error.",
      line: { speaker: "rao", line: "Few payments, exact cents, and quick to compute." },
      widget: { id: "split-lab", config: SP_CHALLENGE },
      conditions: [
        { metric: "transactions", op: "<=", value: 7, label: "At most 7 payments" },
        { metric: "computeOps", op: "<=", value: 200, label: "At most 200 steps" },
        { metric: "errorCents", op: "<=", value: 0, label: "No rounding error" },
      ],
      stars: [],
      hints: ["What do you settle: bills or balances?", "What does the exact answer cost to compute?", "How should amounts be stored?"],
    },
  ],
  explainBack: {
    prompt: "Explain how you would design an expense-splitting app and simplify debts.",
    rubric: [
      { id: "model", criterion: "Users, groups and expenses with a payer and splits, where splits are strategies (equal, exact, percent) and balances are derived", keyIdea: "expenses with split strategies" },
      { id: "money", criterion: "Store money as integer cents and distribute remainders deterministically so each expense sums exactly", keyIdea: "integer cents" },
      { id: "settle", criterion: "Net the balances and greedily match the largest creditor with the largest debtor for at most N−1 payments; the exact minimum is exponential", keyIdea: "net balances, greedy" },
    ],
    exemplar:
      "I would model users, groups and expenses with a payer and a list of splits, where the split types are strategies for equal, exact or percentage amounts and the balances are derived. Money would be stored as integer cents with remainders distributed deterministically so every expense sums exactly. To simplify I would net the balances and greedily match the largest creditor with the largest debtor, which settles N people in at most N minus one payments, while the exact minimum is an exponential subset problem.",
  },
  reviews: [
    {
      id: "sw-est",
      format: "estimate",
      scenario: "A group of 8 uses net-balance settling. What is the most payments it can need?",
      unit: "payments",
      answer: 7,
      acceptFactor: 1,
      breakdown: ["Each payment zeroes at least one person's balance", "the last payment zeroes two, so at most N − 1 = 7"],
      explain: "The bound is N − 1 however many bills there were.",
    },
    {
      id: "sw-pick",
      format: "pick-fix",
      scenario: "A 100-dollar dinner is split equally among three people, and the three amounts are stored as 33.33 each. The expense no longer sums to 100. What is the best fix?",
      options: [
        { id: "a", label: "Use integer cents and give the leftover cent to one person deterministically: 3334, 3333, 3333" },
        { id: "b", label: "Round each one up" },
        { id: "c", label: "Store three decimal places" },
        { id: "d", label: "Ignore the missing cent" },
      ],
      answer: "a",
      explain: "Integer cents with a deterministic remainder keeps every expense and the whole ledger exactly balanced.",
    },
    {
      id: "sw-order",
      format: "order",
      scenario: "Order these by payments needed to settle 8 people (40 expenses), most first.",
      items: [
        { id: "each", label: "Settle each expense" },
        { id: "pair", label: "Net each pair" },
        { id: "greedy", label: "Net balances, greedy" },
        { id: "opt", label: "Exact minimum" },
      ],
      answer: ["each", "pair", "greedy", "opt"],
      explain: "80, 22, 7 and 6.",
    },
    {
      id: "sw-graph",
      format: "predict-graph",
      scenario: "As the group grows from 4 to 20 people, how does the computation for the exact minimum (about 2^N × N steps) compare with the greedy method?",
      xLabel: "people →",
      yLabel: "steps (log scale of growth)",
      options: [
        { id: "explode", label: "The exact method explodes; greedy grows gently", points: [64, 160, 384, 896, 2048, 4608, 10240, 20971520] },
        { id: "same", label: "Both grow at the same rate", points: [10, 20, 30, 40, 50, 60, 70, 80] },
        { id: "flat", label: "Both stay flat", points: [50, 50, 50, 50, 50, 50, 50, 50] },
      ],
      answer: "explode",
      explain: "Doubling per person is exponential. At 20 people the exact method needs about 20 million steps, and greedy about 170.",
    },
    {
      id: "sw-flaw",
      format: "spot-flaw",
      scenario: "The settle algorithm sorts debtors and creditors once at the start and then pairs them without re-sorting after each payment. Tap the step that goes wrong.",
      diagram: {
        nodes: [
          { id: "bal", label: "net balances", kind: "store", col: 0, row: 1 },
          { id: "sort", label: "sort once at the start", kind: "server", col: 1, row: 1 },
          { id: "pay", label: "pay in that fixed order", kind: "worker", col: 2, row: 1 },
        ],
        edges: [
          { from: "bal", to: "sort" },
          { from: "sort", to: "pay" },
        ],
      },
      answer: "sort->pay",
      explain: "After a payment the remaining balances change, so the largest debtor and creditor change. Use a heap or re-sort so each step picks the current largest, and the bound of N − 1 payments holds.",
    },
    {
      id: "sw-explain",
      format: "explain",
      scenario: "In two sentences: why does netting balances reduce payments?",
      rubric: [
        { id: "cancel", criterion: "Many debts cancel: if A owes B and B owes C, A can pay C directly, and a person who is owed and owes ends up with one net figure" },
        { id: "bound", criterion: "Each payment settles at least one person fully, so N people need at most N − 1 payments" },
      ],
      exemplar: "Many debts cancel: if A owes B and B owes C, then A can pay C directly, and a person who is owed and who owes ends up with one net figure. Each payment settles at least one person fully, so N people need at most N minus one payments.",
      explain: "Balances, not bills.",
    },
  ],
  codex: {
    oneLiner: "Expenses with split strategies, integer cents, derived balances, and greedy netting: at most N−1 payments. The exact minimum is exponential.",
    keyNumbers: [
      { label: "Eight people, 40 expenses: settle each vs net (lab)", value: "80 vs 7 payments", sourceId: "splitwise-debts" },
      { label: "Float drift over 40 expenses (lab)", value: "3 cents", sourceId: "float-money" },
    ],
    tradeoffs: [
      { choice: "Greedy netting", gain: "At most N−1 payments, fast", cost: "Not always the minimum" },
      { choice: "Exact minimum", gain: "Fewest payments", cost: "Exponential time" },
      { choice: "Integer cents", gain: "Exact", cost: "Conversion at the edges" },
    ],
    seenIn: ["Splitwise, Tricount and group-payment features.", "A common machine-coding problem."],
    interviewAngle: "Say: 'split strategies, integer cents with a deterministic remainder, balances derived, a heap-based greedy settle for N−1 payments'.",
    aws: [{ concept: "Decimal money in storage", service: "DynamoDB numbers or integer minor units in Aurora" }],
    replay: { id: "split-lab", config: SP, scene: "greedy" },
  },
  interview: [
    "Design Splitwise: how do you model expenses and balances?",
    "How would you minimise the number of settlement payments?",
    "Why not use floats for money?",
  ],
  deeper: [
    {
      title: "Currencies and rounding policy",
      body: "Real groups cross currencies and split unevenly. Store the currency with each amount, convert at a recorded rate, and decide the rounding policy once, in one place. The ledger should always sum to zero per currency, which makes a single audit check catch almost every bug.",
      sourceIds: ["float-money"],
    },
  ],
  honestPhysics: [
    "Eight people share 40 expenses, each split among about three. Settling each expense separately takes 80 payments; netting each pair at most 8(8 − 1) ÷ 2 payments, about 22 in practice; net balances matched greedily at most N − 1 = 7, in about 2N log₂ N steps; the true minimum N − 2 = 6 when two sub-groups already balance, in about 2^N × N steps.",
    "Floating-point dollars drift by about 0.075 cents per expense, 3 cents over 40; integer cents are exact. Round figures.",
  ],
  sources: [SPLITWISE, FLOAT_MONEY, MIN_CASH_FLOW],
  verify: [
    { id: "each", claim: "Settling each expense takes 80 payments", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: {}, metric: "transactions" }, expect: { min: 80, max: 80 } },
    { id: "greedy", claim: "Netting balances takes 7", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "greedy", money: "cents" }, metric: "transactions" }, expect: { min: 7, max: 7 } },
    { id: "greedy-ops", claim: "…in 48 steps", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "greedy", money: "cents" }, metric: "computeOps" }, expect: { min: 47, max: 49 } },
    { id: "optimal", claim: "The exact minimum is 6 payments but 2,048 steps", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "optimal", money: "cents" }, metric: "computeOps" }, expect: { min: 2048, max: 2048 } },
    { id: "float", claim: "Floating point leaves 3 cents of error", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "greedy", money: "float" }, metric: "errorCents" }, expect: { min: 3, max: 3 } },
    { id: "cents", claim: "Integer cents leave none", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "greedy", money: "cents" }, metric: "errorCents" }, expect: { max: 0 } },
    { id: "pair", claim: "Netting each pair still needs 22", run: "lab", params: { model: "split-lab", config: SP_CHALLENGE, values: { algo: "pairwise", money: "cents" }, metric: "transactions" }, expect: { min: 22, max: 22 } },
  ],
});
