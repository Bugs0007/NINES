import type { Condition } from "@/content/schema";

export type WidgetMode = "play" | "challenge" | "codex" | "preview";

export interface ChallengeVerdict {
  won: boolean;
  failed: Condition[];
  metrics: Record<string, number>;
}

export interface WidgetProps<C = Record<string, unknown>> {
  config: C;
  mode: WidgetMode;
  /** Active mechanism scene (captions drive the widget), or null. */
  scene?: string | null;
  /** The player's locked predictions, by prediction id. */
  calls?: Record<string, unknown>;
  /** Called when the player has produced a situation the runner is waiting for. */
  onObserve?: (event: string, data?: Record<string, unknown>) => void;
  /** Challenge mode: the run finished; metrics are evaluated against the pack's conditions. */
  onResult?: (metrics: Record<string, number>) => void;
  /** Set by the runner after evaluating a challenge run (drives replay UI). */
  verdict?: ChallengeVerdict | null;
  /** Challenge conditions, so widgets can show live pass/fail. */
  conditions?: Condition[];
  /** Disable interaction (e.g. before predictions are locked). */
  locked?: boolean;
}
