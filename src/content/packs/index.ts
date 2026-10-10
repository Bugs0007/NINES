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
import tailLatency from "./tail-latency";
import estimationQps from "./estimation-qps";
import estimationStorage from "./estimation-storage";
import estimationMemory from "./estimation-memory";
import connectionPooling from "./connection-pooling";
import autoscaling from "./autoscaling";
import bossViralTuesday from "./boss-viral-tuesday";
import dns from "./dns";
import tcpUdp from "./tcp-udp";
import tlsHandshake from "./tls-handshake";
import httpVersions from "./http-versions";
import keepAlive from "./keep-alive";
import reverseProxy from "./reverse-proxy";
import cdn from "./cdn";
import anycast from "./anycast";
import requestJourney from "./request-journey";
import bossFarAwayUsers from "./boss-far-away-users";

export const PACKS: ConceptPack[] = [latencyNumbers, littlesLaw, queueingUtilization, scaleUpVsOut, loadBalancing, statelessServices, tokens, contextWindows, tailLatency, estimationQps, estimationStorage, estimationMemory, connectionPooling, autoscaling, dns, tcpUdp, tlsHandshake, httpVersions, keepAlive, reverseProxy, cdn, anycast, requestJourney];
export const BOSSES: BossPack[] = [bossLaunchDay, bossTheBill, bossViralTuesday, bossFarAwayUsers];

export const PACK_BY_ID: ReadonlyMap<string, ConceptPack> = new Map(PACKS.map((p) => [p.id, p]));
export const BOSS_BY_ID: ReadonlyMap<string, BossPack> = new Map(BOSSES.map((b) => [b.id, b]));
