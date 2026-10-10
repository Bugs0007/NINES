/** Every Model Lab model, by widget id. Add a chapter file and list its models here. */
import type { LabModel } from "../types";
import { A2_MODELS } from "./a2";
import { A3_MODELS } from "./a3";
import { A4_MODELS } from "./a4";
import { estimateLab } from "./estimate";

export const ALL_MODELS: LabModel[] = [estimateLab, ...A2_MODELS, ...A3_MODELS, ...A4_MODELS];

export const LAB_MODELS: Record<string, LabModel> = Object.fromEntries(ALL_MODELS.map((m) => [m.id, m]));
