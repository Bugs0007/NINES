# NINES Content Plan

The full curriculum as a **prerequisite graph**. The campaign map unlocks by prerequisites, not strict order. The source of truth is `src/content/graph.ts`; the tables below are generated from it with `npm run content:plan` (prose outside the markers is hand-written).

## How the graph is ordered

- **Track A (System Design)** is the campaign spine. Chapters follow Pigeon's growth: one server (A1) → growing pains (A2) → the network path (A3) → caching (A4) → the database (A5) → replication (A6) → partitioning (A7) → failure (A8) → async (A9) → APIs (A10) → operations (A11) → security (A12) → search and storage (A13). Chapters overlap: A3, A5, and A9 open early because their roots only need A1 fundamentals.
- **Track B (AI Engineering)** starts with no prerequisites (B1 is playable from day one) and pulls in Track A where it matters: production AI needs rate limiting, caching, retries, and observability; retrieval needs inverted indexes.
- **Track C (Dev Fundamentals)** is mostly independent and short. Linux (C2) comes before Containers (C1) in the graph because a container is a process with namespaces and cgroups; that is the click Bhagath is missing on Docker.
- **Track D (Case Intel Files)** unlocks late, each incident gated on the concepts needed to actually prove its root cause from logs and metrics. The capstone needs the legal-RAG case, the crawler, notifications, multi-tenancy, LLM cost controls, and the two Case Intel design missions.
- **Interview case studies** (kind *case*) are boss levels placed in the chapter where their last prerequisite lands. They run in Interview Arena format once that mode exists (Phase 3).
- **Transfer:** every boss, case, and incident interleaves concepts from earlier chapters without naming them.

## Accuracy log

| Date | Scope | Reviewer | Result |
|---|---|---|---|
| _pending_ | Chapter A1 + B1 | fact-check subagent | not yet run |

<!-- GENERATED:START -->
<!-- GENERATED:END -->
