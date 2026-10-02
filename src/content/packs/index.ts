/**
 * Pack registry. Add a pack: create src/content/packs/<id>.ts, import it here, and set its status in graph.ts.
 */
import type { BossPack, ConceptPack } from "../schema";
import bossLaunchDay from "./boss-launch-day";
import latencyNumbers from "./latency-numbers";
import littlesLaw from "./littles-law";
import loadBalancing from "./load-balancing";
import queueingUtilization from "./queueing-utilization";
import scaleUpVsOut from "./scale-up-vs-out";
import statelessServices from "./stateless-services";
import tokens from "./tokens";
import contextWindows from "./context-windows";
import bossTheBill from "./boss-the-bill";

export const PACKS: ConceptPack[] = [latencyNumbers, littlesLaw, queueingUtilization, scaleUpVsOut, loadBalancing, statelessServices, tokens, contextWindows];
export const BOSSES: BossPack[] = [bossLaunchDay, bossTheBill];

export const PACK_BY_ID: ReadonlyMap<string, ConceptPack> = new Map(PACKS.map((p) => [p.id, p]));
export const BOSS_BY_ID: ReadonlyMap<string, BossPack> = new Map(BOSSES.map((b) => [b.id, b]));
