"use client";
import { BOSS_BY_ID } from "@/content/packs";
import { useGame } from "@/game/store";
import { BossRunner } from "@/mission/BossRunner";

export function BossPage({ id }: { id: string }) {
  const hydrated = useGame((s) => s.hydrated);
  if (!hydrated) return <div className="grid min-h-dvh place-items-center text-[13px] text-ink-3">connecting…</div>;
  return <BossRunner key={id} boss={BOSS_BY_ID.get(id)!} />;
}
