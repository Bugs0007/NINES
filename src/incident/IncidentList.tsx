"use client";
import Link from "next/link";
import { GRAPH, NODE_BY_ID } from "@/content/graph";
import { useGame } from "@/game/store";
import { buttonClass, Chip, cx } from "@/ui/kit";
import { INCIDENT_BY_ID } from ".";
import { useIntro } from "@/intro/useIntro";
import { SECTION_INTROS } from "@/intro/specs";
import { SectionHeader } from "@/ui/SectionLabel";
import { BriefingButton } from "@/briefing/BriefingButton";

export function IncidentList() {
  const intro = useIntro(SECTION_INTROS.incident);
  const hydrated = useGame((s) => s.hydrated);
  const concepts = useGame((s) => s.concepts);
  const resolved = useGame((s) => s.profile.incidentsResolved);
  if (!hydrated) return null;
  const built = new Set(Object.values(concepts).filter((c) => c.builtAt).map((c) => c.id));
  // Only incidents that exist in this build; future ones live on the HQ map as blueprints, not as tiles here.
  const incidents = GRAPH.filter((n) => n.kind === "incident" && INCIDENT_BY_ID.has(n.id));
  return (
    <div className="flex min-h-dvh flex-col">
      {intro.node}
      <header className="flex h-14 items-center gap-4 border-b border-line/60 px-4 lg:px-8">
        <Link href="/" className="shrink-0 text-[13px] font-medium text-ink-2 transition-colors hover:text-amber">
          ← HQ
        </Link>
        <span className="font-display text-lg font-semibold text-ink-0">Incident Room</span>
        <BriefingButton className="ml-auto" />
      </header>
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-8 lg:px-8">
        <SectionHeader id="incident-room" className="mb-8" />
        <div className="eyebrow text-xs text-alert">On call</div>
        <h1 className="mt-2 font-display text-5xl font-semibold leading-none text-ink-0 sm:text-6xl">Pages</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-ink-1">Real-time incidents on the simulation. The error budget burns while you investigate. Scored on time to mitigate, root cause, evidence, and what you broke on the way.</p>
        <div className="mt-8 grid grid-cols-1 gap-3">
          {incidents.map((n) => {
            const inc = INCIDENT_BY_ID.get(n.id);
            const open = n.prereqs.every((p) => built.has(p));
            const done = resolved.includes(n.id);
            const card = (
              <div className={cx("flex flex-wrap items-center gap-x-5 gap-y-4 rounded-lg border p-5 shadow-card transition-colors duration-200", inc && open ? "border-alert-3/60 bg-alert-dim/20 hover:bg-alert-dim/35" : "border-line/80 bg-bg-1/60")}>
                <div className={cx("font-mono text-xs", inc && open ? "text-alert" : "text-ink-3")}>{inc ? inc.code : "INC"}</div>
                <div className="min-w-[12rem] flex-1">
                  <div className={cx("font-display text-2xl font-semibold leading-tight", inc && open ? "text-ink-0" : "text-ink-3")}>{n.title.replace(/^INC(-\d+)?: /, "")}</div>
                  <div className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{!inc ? "" : open ? `Needs: ${n.prereqs.map((p) => NODE_BY_ID.get(p)?.title).join(", ")}` : `Locked · build ${n.prereqs.filter((p) => !built.has(p)).map((p) => NODE_BY_ID.get(p)?.title).join(", ")}`}</div>
                </div>
                {done && <Chip tone="ok">Resolved</Chip>}
                {inc && open && <span className={buttonClass("danger", "md")}>{done ? "Replay" : "Take the page"}</span>}
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
