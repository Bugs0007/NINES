/**
 * INC-0015 · Production: Certbot's 404.
 *
 * The certificate for the site expired at midnight. Renewal has been failing for a month: certbot answers the
 * HTTP-01 challenge by writing a token under /.well-known/acme-challenge/ and Let's Encrypt fetches it over port 80,
 * but a config change last month sent every path on port 80 to the app, which returns 404 for the token. The failure
 * emails went to a mailbox nobody reads. Browsers now refuse the site. The sim shows the TLS endpoint as down.
 * Red herrings: a DNS change last week and the firewall (port 80 is open).
 */
import type { ServerSpec, SimSpec, WindowMetrics } from "@/engine/types";
import { dashboardFor, decoy, df, free, uptime } from "./kit";
import type { Incident, LogLine } from "./types";

const edge = (down: boolean): ServerSpec => ({ kind: "server", id: "nginx", label: "nginx (TLS)", cores: 2, workers: 64, steps: [{ kind: "cpu", dist: { kind: "const", value: 0.004 } }], failure: down ? { down: true } : undefined, bootS: 10 });

function spec(): SimSpec {
  return {
    nodes: [
      { kind: "client", id: "users", target: "nginx", rate: { kind: "const", rps: 50 }, users: 3000, timeoutS: 5 },
      edge(true),
    ],
  };
}

const STATIC: LogLine[] = [
  { t: -2592000, host: "ops", source: "deploy", level: "INFO", text: "nginx.conf change: port 80 server block now 'location / { proxy_pass http://app; }' (was: redirect to https, plus ACME location)", evidence: "nginx-change" },
  { t: -2505600, host: "web", source: "cron", level: "ERROR", text: "certbot renew: Challenge failed for domain example.test: Invalid response from http://example.test/.well-known/acme-challenge/Zk9...: 404", evidence: "acme-404" },
  { t: -1728000, host: "web", source: "cron", level: "ERROR", text: "certbot renew: Challenge failed ... 404 (attempt 14); email sent to old-admin@example.test", evidence: "acme-404" },
  { t: -604800, host: "dns", source: "app", level: "INFO", text: "dns: A example.test changed to 198.51.100.7 (same host; TTL 300)", evidence: "dns-change" },
  { t: -3600, host: "web", source: "app", level: "INFO", text: "ufw status: 80/tcp ALLOW Anywhere; 443/tcp ALLOW Anywhere", evidence: "firewall-open" },
  { t: -30, host: "web", source: "nginx", level: "ERROR", text: "SSL_do_handshake failed: certificate has expired (notAfter=Sep 14 00:00:00 2026 GMT)", evidence: "expired" },
  { t: 10, host: "browser", source: "app", level: "ERROR", text: "NET::ERR_CERT_DATE_INVALID: example.test", evidence: "expired" },
];

function liveLogs(w: WindowMetrics, rand: () => number): LogLine[] {
  const out: LogLine[] = [];
  if (Math.floor(w.t) % 2 === 0 && w.failed > 0) out.push({ t: w.t + rand(), host: "web", source: "nginx", level: "ERROR", text: "client " + Math.floor(rand() * 255) + ".18.4." + Math.floor(rand() * 255) + " SSL alert 46 certificate_unknown (cert expired)", evidence: "expired" });
  return out;
}

const has = (s: { applied: string[] }, ...ids: string[]) => ids.some((i) => s.applied.includes(i));

export const PROD_CERTBOT: Incident = {
  id: "prod-certbot-404",
  code: "INC-0015",
  title: "Production: Certbot's 404",
  severity: "SEV-1",
  clock0: "00:00:30",
  pageAt: 60,
  page: { title: "Site shows 'Your connection is not private' to every visitor", detail: "TLS errors at 100% since midnight. The servers are up and the app is healthy on port 80 internally." },
  intro: [
    { speaker: "pager", line: "SEV-1: certificate expired. Every browser refuses the site." },
    { speaker: "meera", line: "Fixing the date is easy. The question is why a renewal that should be automatic quietly failed for a month." },
  ],
  spec: spec(),
  seed: "prod-certbot-404",
  service: "the site",
  slo: { p99: 1, errorRate: 0.01 },
  honestPhysics: [
    "A browser refusing an expired certificate is shown as the TLS endpoint being down. Real clients differ: some browsers allow a click-through, API clients usually fail hard.",
    "Fixing the challenge path and running certbot is shown as taking about a minute; Let's Encrypt validation itself usually takes seconds.",
  ],
  hosts: ["web", "dns"],
  services: ["nginx"],
  staticLogs: STATIC,
  liveLogs,
  dashboard: dashboardFor("the edge", ["nginx"], (id, nw) => (!nw.up ? "expired" : undefined), {
    nodes: [
      { id: "users", label: "browsers", kind: "client", x: 100, y: 300 },
      { id: "nginx", label: "nginx (TLS)", kind: "server", x: 600, y: 300, workers: 64, cores: 2 },
    ],
    edges: [{ from: "users", to: "nginx" }],
  }),
  commands: [
    {
      cmd: "echo | openssl s_client -connect example.test:443 2>/dev/null | openssl x509 -noout -dates",
      describe: "certificate dates",
      run: (h, s) => ({ out: has(s, "fix-acme", "manual-cert") ? "notBefore=Sep 14 00:03:11 2026 GMT\nnotAfter=Dec 13 00:03:10 2026 GMT" : "notBefore=Jun 16 00:00:02 2026 GMT\nnotAfter=Sep 14 00:00:00 2026 GMT   (expired)", evidence: has(s, "fix-acme", "manual-cert") ? undefined : "expired" }),
    },
    {
      cmd: "sudo certbot renew --dry-run",
      describe: "try a renewal",
      run: (h, s) => ({ out: has(s, "fix-acme") ? "Congratulations, all simulated renewals succeeded" : "Failed to renew certificate example.test\nChallenge failed: Invalid response from http://example.test/.well-known/acme-challenge/Zk9...: 404", evidence: has(s, "fix-acme") ? undefined : "acme-404" }),
    },
    {
      cmd: "curl -si http://example.test/.well-known/acme-challenge/probe",
      describe: "fetch the challenge path over port 80",
      run: (h, s) => ({ out: has(s, "fix-acme") ? "HTTP/1.1 200 OK\n(served from /var/www/certbot)" : "HTTP/1.1 404 Not Found\nserver: gunicorn\n(port 80 is proxied to the app, which has no such route)", evidence: has(s, "fix-acme") ? undefined : "nginx-change" }),
    },
    { cmd: "sudo nginx -T | grep -A4 'listen 80'", describe: "port 80 server block", run: () => ({ out: "server {\n  listen 80;\n  location / { proxy_pass http://app; }\n}\n(no location for /.well-known/acme-challenge/, no redirect to https)", evidence: "nginx-change" }) },
    { cmd: "sudo ufw status", describe: "firewall", run: () => ({ out: "80/tcp ALLOW Anywhere\n443/tcp ALLOW Anywhere\n22/tcp ALLOW 203.0.113.0/24", evidence: "firewall-open" }) },
    { cmd: "sudo systemctl list-timers certbot*", describe: "renewal timer", run: () => ({ out: "NEXT 12h  LAST 12h ago  UNIT certbot.timer\n(timer runs twice a day; it has failed every run for 30 days)" }) },
    uptime(() => 0.2),
    free(() => 700),
    df(),
  ],
  evidence: [
    { id: "expired", label: "The certificate expired at midnight (notAfter in the past)", key: true },
    { id: "acme-404", label: "certbot renewals have failed for a month: the challenge URL returns 404", key: true },
    { id: "nginx-change", label: "Port 80 now proxies every path to the app, including /.well-known/acme-challenge/", key: true },
    { id: "firewall-open", label: "Ports 80 and 443 are open", key: false },
    { id: "dns-change", label: "DNS was changed a week ago (same address)", key: false },
  ],
  hypotheses: [
    { id: "acme", label: "Automatic renewal has been failing since an nginx change blocked the ACME HTTP-01 challenge, and the failure alerts went unseen, so the certificate expired", correct: true },
    { id: "dns", label: "The DNS change broke validation and the site", correct: false },
    { id: "fw", label: "A firewall is blocking port 80 for Let's Encrypt", correct: false },
    { id: "ca", label: "Let's Encrypt is having an outage", correct: false },
    { id: "clock", label: "The server clock is wrong", correct: false },
  ],
  mitigations: [
    {
      id: "fix-acme",
      label: "Add the ACME location to port 80, reload nginx, run certbot renew",
      detail: "location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; } plus a redirect for everything else.",
      takesS: 60,
      kind: "fix",
      patches: () => [{ delay: 60, patch: { op: "set", node: "nginx", changes: { failure: { down: false } } } }],
      note: "nginx -s reload; certbot renew succeeded; new certificate valid to Dec 13. Port 80 now redirects to https except for the challenge path.",
    },
    {
      id: "manual-cert",
      label: "Issue a certificate with the DNS-01 challenge and install it by hand",
      detail: "Works without port 80, then fix the renewal properly.",
      takesS: 150,
      kind: "mitigate",
      patches: () => [{ delay: 150, patch: { op: "set", node: "nginx", changes: { failure: { down: false } } } }],
      note: "certbot certonly --manual --preferred-challenges dns; TXT record added; certificate installed and nginx reloaded. Renewal is still broken.",
    },
    decoy("force-renew", "Run certbot renew --force-renewal", "Try the renewal again.", "Renewal failed with the same 404. Forcing does not change the challenge path.", 30),
    { ...decoy("restart-nginx", "Restart nginx", "Reload the service.", "nginx restarted. It serves the same expired certificate.", 10), patches: () => [{ delay: 10, patch: { op: "restart", node: "nginx" } }] },
    decoy("http-only", "Tell users to use http:// instead", "Serve the site on port 80.", "Port 80 is not served; the app returns 404 on it, and HSTS makes browsers upgrade to https again.", 10, "harmful"),
    decoy("dns-revert", "Revert the DNS change", "Point the record back.", "DNS reverted. It pointed at the same host.", 60),
    decoy("check-ca", "Check Let's Encrypt's status page", "Look for a CA incident.", "Let's Encrypt: all systems operational.", 5),
  ],
  traces: [
    {
      id: "tls",
      title: "GET https://example.test/ · TLS alert 46",
      status: 495,
      evidence: "expired",
      spans: [
        { name: "TCP connect :443", start: 0, ms: 12, depth: 0, kind: "net" },
        { name: "TLS handshake: certificate expired 30 s ago", start: 12, ms: 8, depth: 0, kind: "net" },
      ],
    },
    {
      id: "acme",
      title: "GET http://example.test/.well-known/acme-challenge/Zk9 · 404 · Let's Encrypt validator",
      status: 404,
      evidence: "acme-404",
      spans: [
        { name: "nginx :80 location / -> app", start: 0, ms: 6, depth: 0, kind: "net" },
        { name: "gunicorn: no route for /.well-known/...", start: 2, ms: 3, depth: 1, kind: "cpu" },
      ],
    },
  ],
  timeline: [
    { t: -2592000, label: "nginx port-80 block rewritten", kind: "deploy" },
    { t: -2505600, label: "first certbot renewal failure", kind: "cron" },
    { t: -604800, label: "DNS record re-saved", kind: "deploy" },
    { t: 0, label: "certificate expires", kind: "cron" },
    { t: 60, label: "Page: TLS errors for all visitors", kind: "page" },
  ],
  extraSeries: [{ id: "days", label: "Days until certificate expiry (scaled: 100 = 90)", unit: "%", at: (t) => Math.max(0, 100 - ((t + 7776000) / 7776000) * 100 * 1) }],
  evidenceVia: ["expired", "firewall-open", "dns-change"],
  postmortem: {
    rubric: [
      { id: "impact", criterion: "States the impact: every visitor saw a certificate error from midnight, and how long it lasted" },
      { id: "cause", criterion: "Root cause: the port-80 nginx block began proxying the ACME challenge path to the app (404), so certbot's HTTP-01 renewals failed for a month until the certificate expired" },
      { id: "detect", criterion: "Why nobody knew: the failure emails went to an unmonitored address, there was no expiry alarm, and everything else worked until the expiry date" },
      { id: "prevent", criterion: "Prevention: alert on days-to-expiry (e.g., 21 days), send certbot failures to a monitored channel, test renewal after nginx changes with --dry-run, or move to automated management" },
      { id: "mitigate", criterion: "States what worked (fix the challenge location and renew, or a manual DNS-01 certificate) and why force-renewing or restarting did not" },
    ],
    exemplar:
      "What happened: At midnight the certificate expired and every browser refused the site until about 00:02. Root cause: a month earlier an nginx change sent every path on port 80 to the app, including the ACME HTTP-01 challenge URL, which returned 404; certbot's twice-daily renewals failed every time, and the failure email went to a mailbox no one reads. The firewall and the DNS change were fine. Mitigation: adding the challenge location, reloading nginx and running certbot renew restored a valid certificate in about a minute; a manual DNS-01 certificate also worked. Force-renewing and restarting could not help. Prevention: alert at 21 days to expiry, route certbot failures to a monitored channel, and run certbot renew --dry-run after any nginx change.",
  },
  hints: [
    "Fixing the certificate is only half the job. Why did the automatic renewal not run?",
    "Run a dry-run renewal and read the failure.",
    "Request the challenge URL over port 80 yourself. What answers?",
  ],
  exercises: ["reverse-proxy", "tls-handshake"],
};
