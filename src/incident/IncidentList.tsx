"use client";
import Link from "next/link";
import { GRAPH, NODE_BY_ID } from "@/content/graph";
import { useGame } from "@/game/store";
import { Button, Chip, cx } from "@/ui/kit";
import { INCIDENT_BY_ID } from ".";

export function IncidentList() {
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const resolved = useGame((s) => s.profile.incidentsResolved);
  if (!hydrated) return null;
  const built = new Set(Object.values(concepts).filter((c) => c.builtAt).map((c) => c.id));
  // Only incidents that exist in this build; future ones live on the HQ map as blueprints, not as tiles here.
  const incidents = GRAPH.filter((n) => n.kind === "incident" && INCIDENT_BY_ID.has(n.id));
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-line px-3 lg:px-5">
        <Link href="/" className="eyebrow text-2xs text-ink-2 hover:text-amber">
          ← HQ
        </Link>
        <span className="font-display text-lg font-semibold text-ink-0">Incident Room</span>
      </header>
      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="eyebrow text-2xs text-alert">on call</div>
        <h1 className="font-display text-6xl font-semibold leading-none text-ink-0">Pages</h1>
        <p className="mt-2 max-w-xl text-ink-1">Real-time incidents on the simulation. The error budget burns while you investigate. Scored on time to mitigate, root cause, evidence, and what you broke on the way.</p>
        <div className="mt-6 grid gap-2">
          {incidents.map((n) => {
            const inc = INCIDENT_BY_ID.get(n.id);
            const open = n.prereqs.every((p) => built.has(p));
            const done = resolved.includes(n.id);
            const card = (
              <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-sm border p-4", inc && open ? "border-alert-3 bg-alert-dim/20 hover:bg-alert-dim/40" : "border-line bg-bg-1/50")}>
                <div className={cx("font-mono text-xs", inc && open ? "text-alert" : "text-ink-3")}>{inc ? inc.code : "INC"}</div>
                <div className="min-w-[12rem] flex-1">
                  <div className={cx("font-display text-2xl font-semibold leading-none", inc && open ? "text-ink-0" : "text-ink-3")}>{n.title.replace(/^INC(-\d+)?: /, "")}</div>
                  <div className="mt-1 font-mono text-2xs text-ink-2">{!inc ? "" : open ? `needs: ${n.prereqs.map((p) => NODE_BY_ID.get(p)?.title).join(", ")}` : `locked · build ${n.prereqs.filter((p) => !built.has(p)).map((p) => NODE_BY_ID.get(p)?.title).join(", ")}`}</div>
                </div>
                {done && <Chip tone="ok">resolved</Chip>}
                {inc && open && <Button variant="danger">{done ? "Replay" : "Take the page"}</Button>}
              </div>
            );
            return inc && open ? (
              <Link key={n.id} href={`/incident/${n.id}`}>
                {card}
              </Link>
            ) : (
              <div key={n.id}>{card}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
