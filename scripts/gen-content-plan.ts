/**
 * Regenerates the tables in CONTENT_PLAN.md from src/content/graph.ts.
 * Hand-written prose outside the GENERATED markers is preserved.
 *
 *   npm run content:plan
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CHAPTERS, GRAPH, TRACKS, type BuildStatus, type Track } from "../src/content/graph";

const START = "<!-- GENERATED:START -->";
const END = "<!-- GENERATED:END -->";
const file = resolve(__dirname, "..", "CONTENT_PLAN.md");

const statusIcon: Record<BuildStatus, string> = {
  planned: "·",
  drafted: "✎ drafted",
  built: "■ built",
  verified: "✔ verified",
};

function mermaidFor(chapterId: string): string {
  const nodes = GRAPH.filter((n) => n.chapter === chapterId);
  const ids = new Set(nodes.map((n) => n.id));
  const lines = ["```mermaid", "flowchart LR"];
  for (const n of nodes) {
    const label = n.title.replace(/"/g, "'");
    const shape = n.kind === "boss" || n.kind === "case" ? `{{"${label}"}}` : n.kind === "incident" ? `>"${label}"]` : `["${label}"]`;
    lines.push(`  ${n.id.replace(/-/g, "_")}${shape}`);
  }
  for (const n of nodes) {
    for (const p of n.prereqs) {
      if (ids.has(p)) lines.push(`  ${p.replace(/-/g, "_")} --> ${n.id.replace(/-/g, "_")}`);
    }
  }
  lines.push("```");
  return lines.join("\n");
}

function render(): string {
  const out: string[] = [];
  const total = GRAPH.length;
  const byStatus = (s: BuildStatus) => GRAPH.filter((n) => n.status === s).length;
  out.push(
    `**${total} nodes** · ${byStatus("verified")} verified · ${byStatus("built")} built · ${byStatus("drafted")} drafted · ${byStatus("planned")} planned`,
    "",
    "Legend: `·` planned, `✎` drafted (pack exists), `■` built (playable, lint green), `✔` verified (fact-checked + playtested). Kinds: concept, **boss**, *case* (interview case study boss), `incident`, `field`.",
    "",
  );
  for (const track of ["A", "B", "C", "D"] as Track[]) {
    out.push(`## Track ${track}: ${TRACKS[track].name} (${TRACKS[track].district})`, "");
    for (const ch of CHAPTERS.filter((c) => c.track === track).sort((a, b) => a.order - b.order)) {
      out.push(`### ${ch.id.toUpperCase()} · ${ch.title}`, "", `*${ch.stage}.* ${ch.blurb}`, "");
      out.push("| Status | Node | Kind | Prerequisites | Signature interaction |", "|---|---|---|---|---|");
      for (const n of GRAPH.filter((g) => g.chapter === ch.id)) {
        const kind = n.kind === "concept" ? "concept" : n.kind === "boss" ? "**boss**" : n.kind === "case" ? "*case*" : `\`${n.kind}\``;
        const pre = n.prereqs.length ? n.prereqs.map((p) => `\`${p}\``).join(", ") : "none";
        out.push(`| ${statusIcon[n.status]} | **${n.title}** \`${n.id}\` | ${kind} | ${pre} | ${n.interaction} |`);
      }
      out.push("", "<details><summary>Graph</summary>", "", mermaidFor(ch.id), "", "</details>", "");
    }
  }
  return out.join("\n");
}

const current = readFileSync(file, "utf8");
const s = current.indexOf(START);
const e = current.indexOf(END);
if (s === -1 || e === -1) throw new Error("CONTENT_PLAN.md is missing GENERATED markers");
const next = current.slice(0, s + START.length) + "\n\n" + render() + "\n" + current.slice(e);
writeFileSync(file, next);
console.log(`CONTENT_PLAN.md regenerated (${GRAPH.length} nodes).`);
