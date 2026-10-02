"use client";
import { PACK_BY_ID } from "@/content/packs";
import { nextMission } from "@/content/progression";
import { useGame } from "@/game/store";
import { MissionRunner } from "@/mission/MissionRunner";

export function MissionPage({ id }: { id: string }) {
  const hydrated = useGame((s) => s.hydrated);
  const pack = PACK_BY_ID.get(id)!;
  if (!hydrated) return <div className="grid min-h-dvh place-items-center eyebrow text-2xs text-ink-3">connecting…</div>;
  return <MissionRunner key={id} pack={pack} next={nextMission(id)} />;
}
