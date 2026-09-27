"use client";
/**
 * Widget id -> lazily loaded component. Config schemas and metric names live in manifest.ts
 * (React-free, so the content lint can import it).
 */
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { WidgetProps } from "./types";

function Loading() {
  return <div className="grid h-full min-h-[300px] place-items-center font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">booting…</div>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWidget = ComponentType<WidgetProps<any>>;

export const WIDGETS: Record<string, AnyWidget> = {
  "queue-lab": dynamic(() => import("./queue-lab/QueueLab"), { ssr: false, loading: Loading }),
  "latency-ladder": dynamic(() => import("./latency-ladder/LatencyLadder"), { ssr: false, loading: Loading }),
  "latency-budget": dynamic(() => import("./latency-budget/LatencyBudget"), { ssr: false, loading: Loading }),
};

export function Widget({ id, ...props }: WidgetProps & { id: string }) {
  const C = WIDGETS[id];
  if (!C) return <div className="p-4 font-mono text-sm text-alert">Unknown widget: {id}</div>;
  return <C {...props} />;
}
