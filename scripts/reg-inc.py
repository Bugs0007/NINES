"""Register built incident nodes: graph STATUS + learning.ts entries. Usage: python scripts/reg-inc.py"""
import re, sys
L = {
 "inc-stampede": ("Find why a healthy cache stopped caching, read the hit ratio and TTL, and protect the database behind it.",
   "A cache hides database load until it stops. When the hit ratio collapses, the database sees the real traffic, usually at the worst moment.",
   "A cache that is up is not necessarily caching."),
 "inc-replica-lag": ("Trace missing or stale reads to a lagging replica, and stop sending traffic to it without waiting for it to catch up.",
   "Replication lag looks like a bug in the app: rows that exist are not found. The only signal is how far behind each replica is.",
   "Reads from a replica can be older than the write you just made."),
 "inc-hot-shard": ("Tell a hot key from a bad hash, and relieve one overloaded shard when adding more shards cannot help.",
   "Sharding spreads keys evenly only if the keys are used evenly. A single popular key lands on one machine no matter how many there are.",
   "Add shards for more keys, not for one hot key."),
 "inc-retry-storm": ("Recognise a retry storm that outlives its trigger, and end it by cutting retries or adding capacity rather than by shedding or waiting.",
   "Retries turn a small slowdown into a self-sustaining overload. The trigger can be long gone while the queues stay full of abandoned work.",
   "Retries multiply load exactly when you can least afford it."),
 "inc-poison-message": ("Find the message that keeps killing queue workers, and stop it with a dead-letter policy and a shorter processing timeout.",
   "A queue redelivers failures forever unless told otherwise. One bad message can occupy every worker while good messages wait.",
   "Every queue needs a redrive limit and a dead-letter queue."),
 "inc-agent-loop": ("Diagnose an agent stuck in a tool loop from calls per task and cost, and stop it with step caps, loop guards, or a kill switch.",
   "An agent with no stopping rule turns a failed tool call into dozens of model calls. The bill and the error rate rise together.",
   "Cap steps and spend per task, not just per month."),
 "inc-429-storm": ("Work out who is using a shared rate limit, and restore interactive traffic by throttling batch work and honouring Retry-After.",
   "A 429 is your own limit, not the provider failing. Batch jobs that retry hard on a shared key starve the users that matter.",
   "Separate batch from interactive traffic, and obey Retry-After."),
 "inc-injected-support-bot": ("Trace a bot's bad behaviour to untrusted text in its context, and contain it with source control, approvals, and tool limits.",
   "Retrieved documents are data, but a model reads them as instructions. When the bot can act, one poisoned page becomes real damage.",
   "Treat retrieved text as untrusted, and keep tools on a short leash."),
 "inc-oom-container": ("Read a crash loop to its cause (OOMKilled, exit 137), tell it from probe and node problems, and fix the memory growth.",
   "Restarting pods on a schedule is the kernel enforcing a memory limit. Scaling out or loosening probes only multiplies the crashes.",
   "A pod that dies on a schedule has a limit it keeps hitting."),
 "prod-polling-storm": ("Find the endpoint behind a traffic jump, size it with Little's Law, and cut polling load with push, backoff, or caching.",
   "A client release can multiply request rate by 30 without any new users. Rate times cost per request, compared with cores, tells you the answer.",
   "Polling cost = clients x frequency x response size."),
 "prod-t3-unreachable": ("Recognise a burstable instance out of CPU credits from the credit balance and steal time, and restore it with unlimited mode or a larger type.",
   "A machine can be running and healthy by every status check while the hypervisor withholds its CPU. Logs on the box will not tell you.",
   "Burstable CPU is a budget: watch the credit balance."),
 "prod-certbot-404": ("Fix an expired certificate, then find why automatic renewal failed, and make sure it can never fail silently again.",
   "Certificates expire on a date no one watches. Renewal depends on a proxy path that unrelated config changes can quietly break.",
   "Alert on days to expiry, not on the outage."),
}
g = open("src/content/graph.ts", encoding="utf8").read()
l = open("src/content/learning.ts", encoding="utf8").read()
marker = '  tokens: {\n    canDo: "Explain what a token is'
assert marker in l
add = ""
status = ""
for k, (c, w, i) in L.items():
    if f'"{k}": {{' in l:
        continue
    add += f'  "{k}": {{\n    canDo: {c!r},\n    why: {w!r},\n    keyIdea: {i!r},\n  }},\n'.replace("'", '"')
    if f'"{k}": "built"' not in g:
        status += f'  "{k}": "built",\n'
l = l.replace(marker, add + marker, 1)
g = g.replace('  "inc-dns-ttl": "built",\n', '  "inc-dns-ttl": "built",\n' + status, 1)
open("src/content/learning.ts", "w", encoding="utf8").write(l)
open("src/content/graph.ts", "w", encoding="utf8").write(g)
print("registered", len(L))
