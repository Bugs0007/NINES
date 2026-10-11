import { INC_DNS } from "./inc-dns-ttl";
import { INC_FOURTH_BOX } from "./inc-fourth-box";
import { INC_POOL } from "./inc-pool-exhaustion";
import { INC_STAMPEDE } from "./inc-stampede";
import { INC_REPLICA_LAG } from "./inc-replica-lag";
import { INC_HOT_SHARD } from "./inc-hot-shard";
import { INC_RETRY_STORM } from "./inc-retry-storm";
import { INC_POISON } from "./inc-poison-message";
import { INC_AGENT_LOOP } from "./inc-agent-loop";
import { INC_429 } from "./inc-429-storm";
import { INC_INJECTED_BOT } from "./inc-injected-support-bot";
import { INC_OOM } from "./inc-oom-container";
import { PROD_POLLING } from "./prod-polling-storm";
import { PROD_T3 } from "./prod-t3-unreachable";
import { PROD_CERTBOT } from "./prod-certbot-404";
import type { Incident } from "./types";

export const INCIDENTS: Incident[] = [INC_FOURTH_BOX, INC_POOL, INC_DNS, INC_STAMPEDE, INC_REPLICA_LAG, INC_HOT_SHARD, INC_RETRY_STORM, INC_POISON, INC_AGENT_LOOP, INC_429, INC_INJECTED_BOT, INC_OOM, PROD_POLLING, PROD_T3, PROD_CERTBOT];
export const INCIDENT_BY_ID: ReadonlyMap<string, Incident> = new Map(INCIDENTS.map((i) => [i.id, i]));
