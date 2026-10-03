"use client";
/** Dev-only: preview any section intro by id (?id=chapter:a1, chapter:b1, section:shift, section:incident, section:codex, boss:boss-the-bill). */
import { useState } from "react";
import { SectionIntro } from "@/intro/SectionIntro";
import { bossIntro, chapterIntro, SECTION_INTROS } from "@/intro/specs";

export function IntroPreview({ id }: { id: string }) {
  const [open, setOpen] = useState(true);
  const [kind, key] = id.split(":") as [string, string];
  const spec = kind === "chapter" ? chapterIntro(key) : kind === "boss" ? bossIntro(key) : SECTION_INTROS[key as keyof typeof SECTION_INTROS];
  if (!spec) return <div className="p-8 text-ink-1">No intro for {id}</div>;
  return open ? <SectionIntro spec={spec} onDone={() => setOpen(false)} /> : <button className="m-8 text-amber" onClick={() => setOpen(true)}>Replay {id}</button>;
}
