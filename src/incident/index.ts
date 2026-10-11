import { INC_DNS } from "./inc-dns-ttl";
import { INC_FOURTH_BOX } from "./inc-fourth-box";
import { INC_POOL } from "./inc-pool-exhaustion";
import type { Incident } from "./types";

export const INCIDENTS: Incident[] = [INC_FOURTH_BOX, INC_POOL, INC_DNS];
export const INCIDENT_BY_ID: ReadonlyMap<string, Incident> = new Map(INCIDENTS.map((i) => [i.id, i]));
