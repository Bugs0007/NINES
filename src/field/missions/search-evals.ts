import { defineField } from "../types";

export default defineField({
  id: "field-search-evals",
  title: "Field: An Eval Suite for Your Own Search",
  estimatedMinutes: 50,
  xp: 200,
  brief: [
    { speaker: "meera", line: "Everyone changes their search and says it feels better. Write the test set that lets you know." },
    { speaker: "rao", line: "Twenty queries, a score before and a score after. Anything less is a mood." },
  ],
  goal: "Build a small evaluation set for a search you have, measure recall and mean reciprocal rank, change one thing, and show the numbers moved.",
  needs: ["Any search you can query from code: a keyword index, a vector search, or a notes folder with embeddings", "20 minutes to write queries by hand", "A script in any language"],
  steps: [
    {
      id: "set",
      title: "Write 20 queries with known answers",
      detail: "For each query, record the id of the document that should come back. Mix easy ones, rewordings of the same document, and a few with exact names or numbers. Real queries beat invented ones: use things you actually searched for.",
    },
    {
      id: "metrics",
      title: "Implement two metrics",
      detail: "Recall at k: the share of queries whose right document is in the top k results. Mean reciprocal rank: the average of 1 divided by the rank of the right document (0 if it is missing). Use k = 5.",
      commands: ["recall_at_5 = hits_in_top5 / total", "mrr = sum(1 / rank_of_right_doc) / total"],
    },
    {
      id: "baseline",
      title: "Score the baseline",
      detail: "Run all 20 queries and print the two numbers, plus the list of queries that failed.",
    },
    {
      id: "change",
      title: "Change one thing",
      detail: "Examples: add keyword matching to a vector search, change the chunk size, add a reranker, or fix the query rewording. Change only one, then rerun the same 20.",
    },
    {
      id: "read",
      title: "Read the failures",
      detail: "Look at every query that still fails and say why in a few words. The failures are the next change.",
    },
  ],
  criteria: [
    { id: "set", criterion: "Evaluation set of about 20 queries with known right documents, including some exact-term and reworded queries" },
    { id: "metrics", criterion: "Recall at k and mean reciprocal rank are reported for a baseline and for a changed version" },
    { id: "one", criterion: "Exactly one change was made between the two runs and it is named" },
    { id: "failures", criterion: "Remaining failures are listed with a reason" },
  ],
  hints: [
    { text: "If the right document is at rank 3, its reciprocal rank is one third. If it is not in the results at all, it counts as zero.", cost: 15 },
    { text: "A query set where everything already passes tells you nothing. Add queries from places you know the search is weak: abbreviations, typos, exact codes.", cost: 20 },
    { text: "Twenty queries is small, so a one-query change is a five-point move in recall. Treat differences under about 10 points as noise.", cost: 25 },
  ],
  proof: {
    prompt: "Paste the output of both runs (baseline and changed) showing recall at 5 and MRR, the one change you made, and your list of remaining failures.",
    placeholder: "baseline: recall@5=0.60 mrr=0.41\nchange: added keyword fusion\nafter: recall@5=0.75 mrr=0.52\nfailures: q7 (abbreviation) ...",
    checks: [
      { id: "recall", label: "Reports recall", pattern: "recall" },
      { id: "mrr", label: "Reports MRR or mean reciprocal rank", pattern: "(mrr|reciprocal)" },
      { id: "two", label: "Shows two runs (baseline and after)", pattern: "(baseline|before)[\\s\\S]*(after|changed|variant)" },
      { id: "change", label: "Names the change", pattern: "change" },
      { id: "fail", label: "Lists failures", pattern: "fail" },
    ],
    sample:
      "baseline: recall@5=0.60 mrr=0.41 (20 queries)\nchange: added keyword (BM25) fusion with RRF\nafter: recall@5=0.75 mrr=0.52\nfailures: q4 'GST' abbreviation (doc uses 'goods and services tax'), q11 typo 'recipt', q17 two-hop question.",
  },
  debrief: [
    "A test set of twenty is enough to catch a regression and too small to prove a small gain. Its main value is that every change now gets a number and a list of what broke.",
    "The failures are more useful than the scores: they tell you whether to fix retrieval, chunking or the query.",
  ],
  honestPhysics: ["Hand-written queries are biased toward things you already think of. The score is relative to your set, not a measure of quality for real users."],
  sources: [
    { id: "ir-eval", title: "Manning, Raghavan and Schutze, Introduction to Information Retrieval: Evaluation in information retrieval", url: "https://nlp.stanford.edu/IR-book/html/htmledition/evaluation-in-information-retrieval-1.html" },
    { id: "rrf", title: "Cormack, Clarke, Buettcher (2009), Reciprocal rank fusion", url: "https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf" },
  ],
});
