/**
 * Pack registry. Add a pack: create src/content/packs/<id>.ts, import it here, and set its status in graph.ts.
 */
import type { BossPack, ConceptPack } from "../schema";
import latencyNumbers from "./latency-numbers";
import littlesLaw from "./littles-law";
import queueingUtilization from "./queueing-utilization";

export const PACKS: ConceptPack[] = [latencyNumbers, littlesLaw, queueingUtilization];
export const BOSSES: BossPack[] = [];

export const PACK_BY_ID: ReadonlyMap<string, ConceptPack> = new Map(PACKS.map((p) => [p.id, p]));
export const BOSS_BY_ID: ReadonlyMap<string, BossPack> = new Map(BOSSES.map((b) => [b.id, b]));
