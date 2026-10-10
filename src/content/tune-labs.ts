/**
 * `tune` review scenarios backed by Model Lab models (closed-form, so they evaluate instantly).
 * Each sweeps one control while the rest stay at their values.
 */
import { LAB_MODELS } from "@/widgets/model-lab/models";
import type { Values } from "@/widgets/model-lab/types";
import type { TuneScenario } from "./scenarios";

const NO_SIM = { build: () => ({ nodes: [] }), durationS: 0, fromS: 0, seed: "" } as const;

/** A tune scenario backed by a Model Lab model: sweep one control while the others stay fixed. */
export function labTune(model: string, config: Record<string, unknown>, param: string, values: Values = {}): TuneScenario {
  return {
    ...NO_SIM,
    evaluate: (v) => {
      const m = LAB_MODELS[model]!;
      return m.evaluate({ ...m.init(config), ...((config.start ?? {}) as Values), ...values, [param]: v }, config).metrics;
    },
  };
}

export const LAB_TUNES: Record<string, TuneScenario> = {
  "tl-hedge": labTune("fanout-lab", { median: 0.02, p99: 0.12, calls: 40, minCalls: 10, maxCalls: 200 }, "hedgeMs", { calls: 40 }),
};
