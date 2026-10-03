"use client";
import { useState } from "react";
import { Widget } from "@/widgets/registry";
import type { WidgetMode } from "@/widgets/types";

export function DevWidget({ id, config, mode }: { id: string; config: Record<string, unknown>; mode: WidgetMode }) {
  const [events, setEvents] = useState<string[]>([]);
  return (
    <main className="flex min-h-dvh flex-col gap-3 p-3 md:p-6">
      <h1 className="eyebrow text-2xs text-ink-2">dev · {id} · {mode}</h1>
      <div className="h-[640px] max-lg:h-auto">
        <Widget
          id={id}
          config={config}
          mode={mode}
          onObserve={(e) => setEvents((x) => [...x, `observe:${e}`])}
          onResult={(m) => setEvents((x) => [...x, `result:${JSON.stringify(m)}`])}
        />
      </div>
      <pre className="max-h-40 overflow-auto font-mono text-2xs text-ink-2">{events.join("\n")}</pre>
    </main>
  );
}
