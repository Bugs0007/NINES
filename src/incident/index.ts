import { INC_FOURTH_BOX } from "./inc-fourth-box";
import type { Incident } from "./types";

export const INCIDENTS: Incident[] = [INC_FOURTH_BOX];
export const INCIDENT_BY_ID: ReadonlyMap<string, Incident> = new Map(INCIDENTS.map((i) => [i.id, i]));
