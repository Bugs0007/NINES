/**
 * React-free widget manifest: metric names (for challenge conditions), observation events, and scenes.
 * The content lint validates packs against this.
 */
export interface WidgetManifest {
  metrics: string[];
  observes: string[];
  scenes: string[];
}

export const MANIFEST: Record<string, WidgetManifest> = {
  "queue-lab": {
    metrics: ["p99", "p50", "errorRate", "workers", "cores", "memGiB", "costPerMonth", "util"],
    observes: ["over-capacity", "slow-dependency-queue", "little-holds", "rho-high"],
    scenes: ["focus-L", "focus-lambda", "focus-W", "focus-capacity", "focus-queue", "curve"],
  },
  "latency-ladder": { metrics: [], observes: ["raced"], scenes: ["race", "human-scale", "physics"] },
  "latency-budget": { metrics: ["latency", "days"], observes: [], scenes: [] },
  "scale-lab": { metrics: ["p99", "errorRate", "costPerMonth", "count", "vcpu"], observes: ["compared", "killed-both"], scenes: ["pooling", "spof"] },
  "lb-lab": { metrics: ["p99", "errorRate"], observes: ["slow-rr", "lor-recovers", "ejected"], scenes: ["rr", "lor", "blackhole"] },
  tokenizer: { metrics: [], observes: ["sliced", "script-gap", "json-dense", "strawberry"], scenes: ["chips", "cost", "scripts", "strawberry"] },
  "token-diet": { metrics: ["tokens", "factsKept", "costPerMonth"], observes: [], scenes: [] },
  "context-tetris": { metrics: ["overflow", "quality", "costPerConversation", "monthly", "ttft"], observes: ["history-cost", "forgot", "overflow"], scenes: ["window", "stateless", "policies"] },
  "launch-builder": { metrics: ["p99", "errorRate", "sessionLoss", "costPerMonth", "memFits", "launches"], observes: [], scenes: [] },
  "session-lab": { metrics: ["sessionLoss", "errorRate", "p99", "costPerMonth", "revocable"], observes: ["session-loss", "sticky-reshuffle", "fixed"], scenes: ["state", "store"] },
};

export function widgetMetrics(id: string): string[] | undefined {
  return MANIFEST[id]?.metrics;
}
