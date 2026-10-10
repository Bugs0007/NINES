import { bm25Scores } from "../src/widgets/model-lab/models/b4";
for (const q of ["refund", "gift cards", "pigeon chats"]) for (const [k1, b] of [[1.2, 0], [1.2, 0.75], [1.2, 1]] as const) {
  const rows = bm25Scores(q, k1, b).sort((a, c) => c.score - a.score);
  console.log(q, k1, b, rows.map((r) => `${r.id}:${r.score.toFixed(2)}(${r.len})`).join(" "));
}
