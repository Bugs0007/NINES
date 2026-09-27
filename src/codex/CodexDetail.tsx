"use client";
import Link from "next/link";
import { useState } from "react";
import { PACK_BY_ID } from "@/content/packs";
import { useGame } from "@/game/store";
import { RichText } from "@/mission/panels";
import { Button, Panel } from "@/ui/kit";
import { Widget } from "@/widgets/registry";
import { CodexCard } from "./CodexCard";

export function CodexDetail({ id }: { id: string }) {
  const hydrated = useGame((s) => s.hydrated);
  const c = useGame((s) => s.concepts[id]);
  const [replay, setReplay] = useState(false);
  const pack = PACK_BY_ID.get(id)!;
  if (!hydrated) return null;
  const owned = !!c?.builtAt;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 items-center gap-3 border-b border-line px-3 lg:px-5">
        <Link href="/codex" className="font-mono text-2xs uppercase tracking-[0.16em] text-ink-2 hover:text-amber">
          ← Codex
        </Link>
        <span className="truncate font-display text-lg font-extrabold uppercase text-ink-0">{pack.title}</span>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-6">
        {!owned ? (
          <div className="rounded-sm border border-dashed border-line-2 p-6">
            <div className="font-display text-3xl font-extrabold uppercase text-ink-2">Locked</div>
            <p className="mt-2 text-ink-1">This card is earned by building {pack.title} in the campaign.</p>
            <Link href={`/mission/${id}`} className="mt-4 inline-block">
              <Button variant="primary">Go build it</Button>
            </Link>
          </div>
        ) : (
          <>
            <CodexCard pack={pack} mastery={c.mastery} onReplay={() => setReplay((r) => !r)} />
            {replay && (
              <div className="h-[560px] max-lg:h-auto">
                <Widget id={pack.codex.replay.id} config={pack.codex.replay.config} mode="play" scene={pack.codex.replay.scene ?? null} />
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              {pack.deeper.map((d, i) => (
                <Panel key={i} label={d.title}>
                  <RichText text={d.body} />
                </Panel>
              ))}
              <Panel label="interview questions">
                <ul className="space-y-1.5 text-sm text-ink-1">
                  {pack.interview.map((q, i) => (
                    <li key={i}>· {q}</li>
                  ))}
                </ul>
              </Panel>
              <Panel label="sources">
                <ul className="space-y-1 text-sm">
                  {pack.sources.map((s) => (
                    <li key={s.id}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-ink-1 underline decoration-line-3 underline-offset-2 hover:text-amber">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
            <div className="flex gap-2">
              <Link href={`/mission/${id}`}>
                <Button variant="secondary">Replay the mission</Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
