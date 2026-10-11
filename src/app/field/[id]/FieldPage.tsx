"use client";
import { FieldRunner } from "@/field/FieldRunner";
import { FIELD_BY_ID } from "@/field";
import { useGame } from "@/game/store";

export function FieldPage({ id }: { id: string }) {
  const hydrated = useGame((s) => s.hydrated);
  if (!hydrated) return <div className="grid min-h-dvh place-items-center text-[13px] text-ink-3">loading…</div>;
  return <FieldRunner mission={FIELD_BY_ID.get(id)!} />;
}
