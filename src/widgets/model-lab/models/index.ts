/** Every Model Lab model, by widget id. Add a chapter file and list its models here. */
import type { LabModel } from "../types";
import { A2_MODELS } from "./a2";
import { estimateLab } from "./estimate";

export const ALL_MODELS: LabModel[] = [estimateLab, ...A2_MODELS];

export const LAB_MODELS: Record<string, LabModel> = Object.fromEntries(ALL_MODELS.map((m) => [m.id, m]));
