/** Every Model Lab model, by widget id. Add a chapter file and list its models here. */
import type { LabModel } from "../types";
import { A2_MODELS } from "./a2";
import { A3_MODELS } from "./a3";
import { A4_MODELS } from "./a4";
import { A5_MODELS } from "./a5";
import { A6_MODELS } from "./a6";
import { A7_MODELS } from "./a7";
import { A8A_MODELS } from "./a8a";
import { A8B_MODELS } from "./a8b";
import { A9_MODELS } from "./a9";
import { A10_MODELS } from "./a10";
import { A11_MODELS } from "./a11";
import { A12_MODELS } from "./a12";
import { A13_MODELS } from "./a13";
import { B2_MODELS } from "./b2";
import { B3_MODELS } from "./b3";
import { B4_MODELS } from "./b4";
import { B5_MODELS } from "./b5";
import { B6_MODELS } from "./b6";
import { B7_MODELS } from "./b7";
import { B8_MODELS } from "./b8";
import { B9_MODELS } from "./b9";
import { B10_MODELS } from "./b10";
import { B11_MODELS } from "./b11";
import { C1_MODELS } from "./c1";
import { C2_MODELS } from "./c2";
import { estimateLab } from "./estimate";

export const ALL_MODELS: LabModel[] = [estimateLab, ...A2_MODELS, ...A3_MODELS, ...A4_MODELS, ...A5_MODELS, ...A6_MODELS, ...A7_MODELS, ...A8A_MODELS, ...A8B_MODELS, ...A9_MODELS, ...A10_MODELS, ...A11_MODELS, ...A12_MODELS, ...A13_MODELS, ...B2_MODELS, ...B3_MODELS, ...B4_MODELS, ...B5_MODELS, ...B6_MODELS, ...B7_MODELS, ...B8_MODELS, ...B9_MODELS, ...B10_MODELS, ...B11_MODELS, ...C1_MODELS, ...C2_MODELS];

export const LAB_MODELS: Record<string, LabModel> = Object.fromEntries(ALL_MODELS.map((m) => [m.id, m]));
