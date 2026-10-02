import { BossPackSchema, ConceptPackSchema, type BossPack, type BossPackInput, type ConceptPack, type ConceptPackInput } from "./schema";

/** Parse a concept pack at module load: invalid content fails fast in dev and in tests. */
export function definePack(input: ConceptPackInput): ConceptPack {
  const r = ConceptPackSchema.safeParse(input);
  if (!r.success) throw new Error(`Invalid concept pack "${input.id}": ${r.error.message}`);
  return r.data;
}

export function defineBoss(input: BossPackInput): BossPack {
  const r = BossPackSchema.safeParse(input);
  if (!r.success) throw new Error(`Invalid boss pack "${input.id}": ${r.error.message}`);
  return r.data;
}

/** Common sources reused across packs. */
export const SRC = {
  little1961: { id: "little-1961", title: "J.D.C. Little (1961), A Proof for the Queuing Formula: L = λW, Operations Research 9(3)", url: "https://doi.org/10.1287/opre.9.3.383" },
  harcholBalter: { id: "harchol-balter", title: "M. Harchol-Balter (2013), Performance Modeling and Design of Computer Systems, Cambridge University Press", url: "https://www.cs.cmu.edu/~harchol/PerformanceModeling/book.html" },
  gunicornWorkers: { id: "gunicorn-workers", title: "Gunicorn docs: How many workers?", url: "https://gunicorn.org/design/#how-many-workers" },
  gunicornSettings: { id: "gunicorn-settings", title: "Gunicorn docs: settings (workers default = 1)", url: "https://gunicorn.org/reference/settings/#workers" },
  pgConnections: { id: "pg-connections", title: "PostgreSQL docs: max_connections (default 100)", url: "https://www.postgresql.org/docs/current/runtime-config-connection.html" },
  norvig: { id: "norvig-21-days", title: "P. Norvig, Teach Yourself Programming in Ten Years (approximate timings table)", url: "https://norvig.com/21-days.html" },
  deanLadis: { id: "dean-ladis-2009", title: "J. Dean, Designs, Lessons and Advice from Building Large Distributed Systems (LADIS 2009 keynote)", url: "https://www.cs.cornell.edu/projects/ladis2009/talks/dean-keynote-ladis2009.pdf" },
  gregg: { id: "gregg-sysperf", title: "B. Gregg, Systems Performance, 2nd ed. (2020), Table 2.2: example time scale of system latencies", url: "https://www.brendangregg.com/systems-performance-2nd-edition-book.html" },
  nielsen: { id: "nielsen-response", title: "J. Nielsen, Response Times: The 3 Important Limits (Nielsen Norman Group)", url: "https://www.nngroup.com/articles/response-times-3-important-limits/" },
  awsEc2Pricing: { id: "aws-ec2-pricing", title: "Amazon EC2 On-Demand Pricing", url: "https://aws.amazon.com/ec2/pricing/on-demand/" },
  awsResize: { id: "aws-change-type", title: "AWS docs: Change the instance type (EBS-backed instances must be stopped)", url: "https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-resize.html" },
  albRouting: { id: "alb-routing", title: "AWS docs: ALB target groups, routing algorithms (round robin, least outstanding requests, weighted random)", url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html#modify-routing-algorithm" },
  albHealth: { id: "alb-health", title: "AWS docs: Health checks for Application Load Balancer target groups", url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html" },
  mitzenmacher: { id: "mitzenmacher-2001", title: "M. Mitzenmacher (2001), The Power of Two Choices in Randomized Load Balancing, IEEE TPDS 12(10)", url: "https://doi.org/10.1109/71.963420" },
  twelveFactor: { id: "twelve-factor", title: "The Twelve-Factor App, VI. Processes (stateless, share-nothing)", url: "https://12factor.net/processes" },
  djangoSessions: { id: "django-sessions", title: "Django docs: How to use sessions (database, cached, file, signed-cookie backends)", url: "https://docs.djangoproject.com/en/stable/topics/http/sessions/" },
  albSticky: { id: "alb-sticky", title: "AWS docs: Sticky sessions for Application Load Balancer target groups", url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html#sticky-sessions" },
  sreBookLb: { id: "sre-book-lb", title: "Google SRE Book, ch. 20: Load Balancing in the Datacenter", url: "https://sre.google/sre-book/load-balancing-datacenter/" },
  sreBookOverload: { id: "sre-book-overload", title: "Google SRE Book, ch. 21: Handling Overload", url: "https://sre.google/sre-book/handling-overload/" },
} as const;
