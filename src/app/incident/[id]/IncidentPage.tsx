"use client";
import { INCIDENT_BY_ID } from "@/incident";
import { IncidentRoom } from "@/incident/IncidentRoom";
import { useGame } from "@/game/store";

export function IncidentPage({ id }: { id: string }) {
  const hydrated = useGame((s) => s.hydrated);
  if (!hydrated) return <div className="grid min-h-dvh place-items-center eyebrow text-2xs text-ink-3">paging…</div>;
  return <IncidentRoom inc={INCIDENT_BY_ID.get(id)!} />;
}
