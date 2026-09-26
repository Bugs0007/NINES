/**
 * NINES discrete-event simulation.
 *
 * Every user request is an entity that travels through nodes. Servers hold a worker for the
 * whole life of a request (sync I/O model, like gunicorn sync workers), and CPU steps also need
 * a core. Nothing about saturation, retries, or hit ratios is hard-coded: they fall out of
 * queues, workers, cores, timeouts, and caches interacting.
 *
 * Determinism: (spec, seed, patch log) fully determines a run. Independent RNG streams per node
 * and concern keep unrelated randomness stable when one knob changes.
 */
import { Rng } from "./rng";
import { sample, scaleDist, Zipf, type Dist } from "./dist";
import { Deque, EventHeap, LatencyHistogram, LruCache } from "./structures";
import { maxRateOver, rateAt } from "./traffic";
import {
  FAIL_REASONS,
  VizState,
  type Aggregate,
  type CacheSpec,
  type ClientSpec,
  type FailReason,
  type LbSpec,
  type NodeSpec,
  type NodeWindow,
  type NotableEvent,
  type NotableKind,
  type ServerSpec,
  type SimPatch,
  type SimSpec,
  type TimedPatch,
  type VizParticle,
  type VizStateCode,
  type WindowMetrics,
} from "./types";

// ---------------------------------------------------------------- internals

interface Req {
  id: number;
  user: number;
  key: number;
  write: boolean;
  t0: number;
  attempts: number;
  synthetic: boolean;
}

interface Attempt {
  id: number;
  req: Req;
  done: boolean;
  orphan: boolean;
  viz: boolean;
  loc: string;
  state: VizStateCode;
  since: number;
  retry: boolean;
}

type Cb = (ok: boolean, reason?: FailReason) => void;

interface Frame {
  req: Req;
  att: Attempt;
  cb: Cb;
  enterAt: number;
  step: number;
  failed: boolean;
  reason?: FailReason;
  dead: boolean;
  pending: number;
}

const zeroReasons = (): Record<FailReason, number> => ({ timeout: 0, rejected: 0, error: 0, session: 0, down: 0 });

function toSparse(h: LatencyHistogram): [number, number][] {
  const out: [number, number][] = [];
  const c = h.counts;
  for (let i = 0; i < c.length; i++) if (c[i]) out.push([i, c[i] as number]);
  return out;
}

// ---------------------------------------------------------------- node runtimes

abstract class NodeRt {
  up = true;
  removed = false;
  epoch = 0;
  busyCores = 0;
  busyWorkers = 0;
  inflight = 0;
  // time integrals for the current window
  protected lastT = 0;
  protected accCores = 0;
  protected accWorkers = 0;
  protected accQueue = 0;
  protected accInflight = 0;
  protected queueMax = 0;
  arrivals = 0;
  completed = 0;
  rejected = 0;
  errors = 0;
  protected hist = new LatencyHistogram();
  // hysteresis flags for notable events
  saturatedFlag = false;
  overflowFlag = false;

  constructor(
    readonly sim: Simulation,
    public spec: NodeSpec,
  ) {
    this.lastT = sim.now;
  }

  get id(): string {
    return this.spec.id;
  }

  abstract accept(f: Frame): void;
  abstract cores(): number;
  abstract workers(): number;
  queueLen(): number {
    return 0;
  }
  /** Called after a `set` patch mutates the spec. */
  onSpecChange(_prev: NodeSpec): void {}
  start(): void {}
  crash(): void {}

  integrate(): void {
    const now = this.sim.now;
    const dt = now - this.lastT;
    if (dt > 0) {
      this.accCores += this.busyCores * dt;
      this.accWorkers += this.busyWorkers * dt;
      this.accQueue += this.queueLen() * dt;
      this.accInflight += this.inflight * dt;
    }
    this.lastT = now;
    const q = this.queueLen();
    if (q > this.queueMax) this.queueMax = q;
  }

  recordLatency(v: number): void {
    this.hist.record(v);
  }

  windowStats(dt: number): NodeWindow {
    const cores = this.cores();
    const workers = this.workers();
    return {
      util: cores > 0 && dt > 0 ? Math.min(1, this.accCores / (cores * dt)) : 0,
      workerUtil: workers > 0 && dt > 0 && Number.isFinite(workers) ? Math.min(1, this.accWorkers / (workers * dt)) : 0,
      queue: dt > 0 ? this.accQueue / dt : 0,
      queueMax: this.queueMax,
      inflight: dt > 0 ? this.accInflight / dt : 0,
      arrivals: this.arrivals,
      completed: this.completed,
      rejected: this.rejected,
      errors: this.errors,
      p50: this.hist.quantile(0.5),
      p99: this.hist.quantile(0.99),
      up: this.up,
    };
  }

  resetWindow(): void {
    this.accCores = this.accWorkers = this.accQueue = this.accInflight = 0;
    this.queueMax = this.queueLen();
    this.arrivals = this.completed = this.rejected = this.errors = 0;
    this.hist.reset();
  }

  protected mark(f: Frame, state: VizStateCode): void {
    const a = f.att;
    if (!a.viz) return;
    a.loc = this.id;
    a.state = state;
    a.since = this.sim.now;
  }
}

// ---- client ----------------------------------------------------------------

class ClientRt extends NodeRt {
  declare spec: ClientSpec;
  private arrivalsRng: Rng;
  private keyRng: Rng;
  private userRng: Rng;
  private opRng: Rng;
  private retryRng: Rng;
  private zipf: Zipf;
  private token = 0;

  constructor(sim: Simulation, spec: ClientSpec) {
    super(sim, spec);
    const base = sim.rootRng.stream(`client:${spec.id}`);
    this.arrivalsRng = base.stream("arrivals");
    this.keyRng = base.stream("keys");
    this.userRng = base.stream("users");
    this.opRng = base.stream("ops");
    this.retryRng = base.stream("retry");
    const k = spec.keys ?? { n: 100_000, s: 0.99 };
    this.zipf = new Zipf(k.n, k.s);
  }

  cores() {
    return 0;
  }
  workers() {
    return Infinity;
  }
  accept(): void {
    throw new Error("clients do not accept requests");
  }

  override start(): void {
    this.scheduleNext();
  }

  override onSpecChange(prev: NodeSpec): void {
    const p = prev as ClientSpec;
    if (p.keys?.n !== this.spec.keys?.n || p.keys?.s !== this.spec.keys?.s) {
      const k = this.spec.keys ?? { n: 100_000, s: 0.99 };
      this.zipf = new Zipf(k.n, k.s);
    }
    this.scheduleNext();
  }

  private rate(t: number): number {
    return rateAt(this.spec.rate, t) * (this.spec.rateScale ?? 1);
  }

  /** Non-homogeneous Poisson arrivals by thinning over 1-second horizons. */
  private scheduleNext(): void {
    const token = ++this.token;
    const sim = this.sim;
    let t = sim.now;
    const scale = this.spec.rateScale ?? 1;
    for (let guard = 0; guard < 100_000; guard++) {
      const lmax = maxRateOver(this.spec.rate, t, t + 1) * scale;
      if (lmax <= 0) {
        t += 1;
        continue;
      }
      const cand = t - Math.log(this.arrivalsRng.nextOpen()) / lmax;
      if (cand > t + 1) {
        t += 1;
        continue;
      }
      t = cand;
      if (this.arrivalsRng.next() * lmax <= this.rate(t)) {
        sim.at(t, () => {
          if (token !== this.token || this.removed) return;
          this.arrive();
          this.scheduleNext();
        });
        return;
      }
    }
  }

  private arrive(): void {
    const sim = this.sim;
    const users = this.spec.users ?? 10_000;
    const req: Req = {
      id: sim.nextReqId++,
      user: this.userRng.int(users),
      key: this.zipf.sample(this.keyRng),
      write: this.opRng.next() < (this.spec.writeFraction ?? 0),
      t0: sim.now,
      attempts: 0,
      synthetic: false,
    };
    sim.acc.arrivals++;
    this.attempt(req);
  }

  private attempt(req: Req): void {
    const sim = this.sim;
    req.attempts++;
    sim.acc.attempts++;
    const att = sim.newAttempt(req, req.attempts > 1);
    att.loc = this.id;
    const timeout = this.spec.timeoutS ?? 10;
    sim.after(timeout, () => {
      if (att.done) return;
      att.done = true;
      att.orphan = true;
      sim.noteTimeout();
      this.onFail(req, "timeout");
    });
    sim.call(this.spec.target, req, att, (ok, reason) => {
      sim.retireAttempt(att, ok, this.id);
      if (att.done) return;
      att.done = true;
      if (ok) {
        sim.acc.ok++;
        sim.acc.hist.record(sim.now - req.t0);
      } else this.onFail(req, reason ?? "error");
    });
  }

  private onFail(req: Req, reason: FailReason): void {
    const r = this.spec.retry;
    const retryable = r && req.attempts < r.maxAttempts && (r.retryOn ?? ["timeout", "rejected", "error", "down"]).includes(reason);
    if (retryable && r) {
      const n = req.attempts; // attempts so far
      let b = r.backoff === "exponential" ? r.baseS * Math.pow(2, n - 1) : r.baseS;
      b = Math.min(b, r.capS);
      if (r.jitter === "full") b = this.retryRng.next() * b;
      else if (r.jitter === "equal") b = b / 2 + (this.retryRng.next() * b) / 2;
      this.sim.after(b, () => this.attempt(req));
      return;
    }
    this.sim.acc.failed++;
    this.sim.acc.reasons[reason]++;
  }
}

// ---- server / db -----------------------------------------------------------

interface CpuWait {
  f: Frame;
  t: number;
}

class ServerRt extends NodeRt {
  declare spec: ServerSpec;
  private queue = new Deque<Frame>();
  private runQueue = new Deque<CpuWait>();
  private active = new Set<Frame>();
  private svcRng: Rng;
  private errRng: Rng;
  sessionEpoch = 0;

  constructor(sim: Simulation, spec: ServerSpec) {
    super(sim, spec);
    const base = sim.rootRng.stream(`server:${spec.id}`);
    this.svcRng = base.stream("service");
    this.errRng = base.stream("errors");
    if (spec.failure?.down) this.up = false;
  }

  cores() {
    return this.spec.cores;
  }
  workers() {
    return this.spec.workers;
  }
  override queueLen() {
    return this.queue.length + this.runQueue.length;
  }

  private slow(): number {
    return this.spec.failure?.slowFactor ?? 1;
  }

  accept(f: Frame): void {
    this.integrate();
    this.arrivals++;
    if (!this.up || this.removed) {
      this.errors++;
      this.sim.reply(f, false, "down");
      return;
    }
    f.enterAt = this.sim.now;
    this.inflight++;
    if (this.busyWorkers < this.spec.workers) this.begin(f);
    else if (this.queue.length < (this.spec.queueLimit ?? Infinity)) {
      this.queue.push(f);
      this.mark(f, VizState.Queued);
    } else {
      this.inflight--;
      this.rejected++;
      this.sim.reply(f, false, "rejected");
    }
  }

  private begin(f: Frame): void {
    this.integrate();
    this.busyWorkers++;
    this.active.add(f);
    f.step = 0;
    this.mark(f, VizState.Service);
    this.next(f);
  }

  private program(f: Frame) {
    return f.req.write && this.spec.writeSteps ? this.spec.writeSteps : this.spec.steps;
  }

  private next(f: Frame): void {
    if (f.dead) return;
    const steps = this.program(f);
    if (f.failed || f.step >= steps.length) {
      this.finish(f);
      return;
    }
    const st = steps[f.step++]!;
    const sim = this.sim;
    switch (st.kind) {
      case "cpu":
        this.cpu(f, sample(st.dist, this.svcRng) * this.slow());
        return;
      case "io":
        sim.after(sample(st.dist, this.svcRng) * this.slow(), () => this.next(f));
        return;
      case "call":
        if (st.prob !== undefined && this.svcRng.next() >= st.prob) {
          this.next(f);
          return;
        }
        sim.call(st.target, f.req, f.att, (ok, reason) => {
          if (f.dead) return;
          if (!ok) {
            f.failed = true;
            f.reason = reason === "session" ? "session" : "error";
          }
          this.mark(f, VizState.Service);
          this.next(f);
        });
        return;
      case "fanout": {
        f.pending = st.targets.length;
        if (f.pending === 0) {
          this.next(f);
          return;
        }
        this.mark(f, VizState.Waiting);
        const shadow: Attempt = { ...f.att, viz: false };
        for (const t of st.targets) {
          sim.call(t, f.req, shadow, (ok) => {
            if (f.dead) return;
            if (!ok) {
              f.failed = true;
              f.reason = "error";
            }
            if (--f.pending === 0) {
              this.mark(f, VizState.Service);
              this.next(f);
            }
          });
        }
        return;
      }
      case "session":
        this.session(f);
        return;
    }
  }

  private session(f: Frame): void {
    const s = this.spec.session ?? { mode: "local" as const };
    const sim = this.sim;
    if (f.req.synthetic) {
      this.next(f);
      return;
    }
    if (s.mode === "external") {
      sim.call(s.store, f.req, f.att, (ok) => {
        if (f.dead) return;
        if (!ok) {
          f.failed = true;
          f.reason = "error";
        }
        this.mark(f, VizState.Service);
        this.next(f);
      });
      return;
    }
    const home = sim.sessionHome.get(f.req.user);
    if (!home) {
      sim.sessionHome.set(f.req.user, { server: this.id, epoch: this.sessionEpoch });
      this.next(f);
    } else if (home.server === this.id && home.epoch === this.sessionEpoch) {
      this.next(f);
    } else {
      // The session lives on another box (or died with a restart): the user is logged out and logs in again here.
      sim.sessionHome.set(f.req.user, { server: this.id, epoch: this.sessionEpoch });
      f.failed = true;
      f.reason = "session";
      this.next(f);
    }
  }

  private cpu(f: Frame, t: number): void {
    if (this.busyCores < this.spec.cores) {
      this.integrate();
      this.busyCores++;
      this.sim.after(t, () => this.cpuDone(f));
    } else {
      this.integrate();
      this.runQueue.push({ f, t });
    }
  }

  private cpuDone(f: Frame): void {
    if (f.dead) return;
    this.integrate();
    this.busyCores--;
    this.dispatchCpu();
    this.next(f);
  }

  private dispatchCpu(): void {
    while (this.busyCores < this.spec.cores && this.runQueue.length > 0) {
      const w = this.runQueue.shift()!;
      if (w.f.dead) continue;
      this.busyCores++;
      this.sim.after(w.t, () => this.cpuDone(w.f));
    }
  }

  private finish(f: Frame): void {
    this.integrate();
    this.busyWorkers--;
    this.inflight--;
    this.active.delete(f);
    this.completed++;
    let ok = !f.failed;
    let reason = f.reason;
    const er = this.spec.failure?.errorRate ?? 0;
    if (ok && er > 0 && this.errRng.next() < er) {
      ok = false;
      reason = "error";
    }
    if (!ok) this.errors++;
    this.recordLatency(this.sim.now - f.enterAt);
    this.sim.reply(f, ok, reason);
    this.drain();
  }

  private drain(): void {
    while (this.up && this.busyWorkers < this.spec.workers && this.queue.length > 0) {
      this.begin(this.queue.shift()!);
    }
  }

  override onSpecChange(prev: NodeSpec): void {
    const p = prev as ServerSpec;
    const wasDown = !!p.failure?.down;
    const isDown = !!this.spec.failure?.down;
    if (!wasDown && isDown) this.crash();
    else if (wasDown && !isDown) {
      this.up = true;
      this.sim.notable("node-up", `${this.label()} is back`, this.id);
    }
    this.dispatchCpu();
    this.drain();
  }

  label(): string {
    return this.spec.label ?? this.id;
  }

  /** Lose everything in flight and in memory. */
  override crash(): void {
    this.integrate();
    this.up = false;
    this.epoch++;
    this.sessionEpoch++;
    const doomed: Frame[] = [...this.active];
    for (let f = this.queue.shift(); f; f = this.queue.shift()) doomed.push(f);
    this.runQueue = new Deque<CpuWait>();
    this.active.clear();
    this.busyCores = 0;
    this.busyWorkers = 0;
    this.inflight = 0;
    for (const f of doomed) {
      f.dead = true;
      this.errors++;
      this.sim.reply(f, false, "down");
    }
    this.sim.notable("node-down", `${this.label()} went down`, this.id);
  }

  restart(): void {
    this.crash();
    this.sim.after(this.spec.bootS ?? 20, () => {
      if (this.removed || this.spec.failure?.down) return;
      this.up = true;
      this.sim.notable("node-up", `${this.label()} finished booting`, this.id);
      this.drain();
    });
  }
}

// ---- load balancer ---------------------------------------------------------

interface HcState {
  healthy: boolean;
  ok: number;
  bad: number;
}

class LbRt extends NodeRt {
  declare spec: LbSpec;
  private rng: Rng;
  private rr = 0;
  outstanding = new Map<string, number>();
  hc = new Map<string, HcState>();
  private hcTokens = new Map<string, number>();

  constructor(sim: Simulation, spec: LbSpec) {
    super(sim, spec);
    this.rng = sim.rootRng.stream(`lb:${spec.id}`);
  }

  cores() {
    return 0;
  }
  workers() {
    return Infinity;
  }

  override start(): void {
    this.syncHealthChecks();
  }

  override onSpecChange(): void {
    this.syncHealthChecks();
  }

  private targetsAlive(): string[] {
    return this.spec.targets.filter((t) => this.sim.hasNode(t));
  }

  healthyTargets(): string[] {
    return this.targetsAlive().filter((t) => this.hc.get(t)?.healthy ?? true);
  }

  private choose(pool: string[], f: Frame): string {
    const alg = this.spec.algorithm;
    const out = (t: string) => this.outstanding.get(t) ?? 0;
    switch (alg) {
      case "round-robin":
        return pool[this.rr++ % pool.length]!;
      case "random":
        return pool[this.rng.int(pool.length)]!;
      case "least-outstanding": {
        let best = Infinity;
        let picks: string[] = [];
        for (const t of pool) {
          const o = out(t);
          if (o < best) {
            best = o;
            picks = [t];
          } else if (o === best) picks.push(t);
        }
        return picks[this.rng.int(picks.length)]!;
      }
      case "p2c": {
        if (pool.length === 1) return pool[0]!;
        const i = this.rng.int(pool.length);
        let j = this.rng.int(pool.length - 1);
        if (j >= i) j++;
        const a = pool[i]!;
        const b = pool[j]!;
        return out(a) <= out(b) ? a : b;
      }
      case "sticky": {
        // Hash-mod routing on the user id: stable only while the pool is stable.
        let h = f.req.user | 0;
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
        h ^= h >>> 16;
        return pool[(h >>> 0) % pool.length]!;
      }
    }
  }

  accept(f: Frame): void {
    this.integrate();
    this.arrivals++;
    const healthy = this.healthyTargets();
    // AWS ALB behaviour: if every target is unhealthy, fail open and route to all of them.
    const pool = healthy.length > 0 ? healthy : this.targetsAlive();
    if (pool.length === 0) {
      this.errors++;
      this.sim.reply(f, false, "error");
      return;
    }
    const target = this.choose(pool, f);
    this.outstanding.set(target, (this.outstanding.get(target) ?? 0) + 1);
    this.inflight++;
    this.mark(f, VizState.Service);
    const start = this.sim.now;
    const go = () =>
      this.sim.call(target, f.req, f.att, (ok, reason) => {
        this.integrate();
        this.outstanding.set(target, (this.outstanding.get(target) ?? 1) - 1);
        this.inflight--;
        this.completed++;
        if (!ok) this.errors++;
        this.recordLatency(this.sim.now - start);
        this.mark(f, VizState.Service);
        this.sim.reply(f, ok, reason === "down" ? "error" : reason);
      });
    const oh = this.spec.overhead;
    if (oh) this.sim.after(sample(oh, this.rng), go);
    else go();
  }

  private syncHealthChecks(): void {
    const hc = this.spec.healthCheck;
    for (const t of this.spec.targets) {
      if (!this.hc.has(t)) this.hc.set(t, { healthy: true, ok: 0, bad: 0 });
    }
    if (!hc) {
      for (const s of this.hc.values()) s.healthy = true;
      return;
    }
    for (const t of this.spec.targets) {
      const token = (this.hcTokens.get(t) ?? 0) + 1;
      this.hcTokens.set(t, token);
      // Stagger the first check so targets are not probed in lockstep.
      this.sim.after(this.rng.next() * hc.intervalS, () => this.probe(t, token));
    }
  }

  private probe(target: string, token: number): void {
    const hc = this.spec.healthCheck;
    if (!hc || this.removed || this.hcTokens.get(target) !== token || !this.spec.targets.includes(target)) return;
    const sim = this.sim;
    const node = sim.nodeRt(target);
    const record = (pass: boolean) => {
      const s = this.hc.get(target) ?? { healthy: true, ok: 0, bad: 0 };
      if (pass) {
        s.ok++;
        s.bad = 0;
        if (!s.healthy && s.ok >= hc.healthyThreshold) {
          s.healthy = true;
          sim.notable("health-restore", `${sim.labelOf(target)} passed health checks, back in rotation`, target);
        }
      } else {
        s.bad++;
        s.ok = 0;
        if (s.healthy && s.bad >= hc.unhealthyThreshold) {
          s.healthy = false;
          sim.notable("health-eject", `${sim.labelOf(target)} failed ${hc.unhealthyThreshold} health checks, removed from rotation`, target);
        }
      }
      this.hc.set(target, s);
    };
    if (!node) record(false);
    else if (!hc.deep) record(node.up);
    else {
      let settled = false;
      const req: Req = { id: 0, user: -1, key: 0, write: false, t0: sim.now, attempts: 1, synthetic: true };
      const att = sim.newAttempt(req, false, true);
      sim.after(hc.timeoutS, () => {
        if (settled) return;
        settled = true;
        record(false);
      });
      sim.call(target, req, att, (ok) => {
        if (settled) return;
        settled = true;
        record(ok);
      });
    }
    sim.after(hc.intervalS, () => this.probe(target, token));
  }

  override windowStats(dt: number): NodeWindow {
    return { ...super.windowStats(dt), healthy: this.healthyTargets() };
  }
}

// ---- cache -----------------------------------------------------------------

class CacheRt extends NodeRt {
  declare spec: CacheSpec;
  private lru: LruCache;
  private rng: Rng;
  private runQueue = new Deque<Frame>();
  hits = 0;
  misses = 0;

  constructor(sim: Simulation, spec: CacheSpec) {
    super(sim, spec);
    this.lru = new LruCache(spec.capacity);
    this.rng = sim.rootRng.stream(`cache:${spec.id}`);
    if (spec.failure?.down) this.up = false;
  }

  cores() {
    return this.spec.cores ?? 1;
  }
  workers() {
    return Infinity;
  }
  override queueLen() {
    return this.runQueue.length;
  }

  accept(f: Frame): void {
    this.integrate();
    this.arrivals++;
    if (!this.up || this.removed) {
      this.errors++;
      this.sim.reply(f, false, "down");
      return;
    }
    f.enterAt = this.sim.now;
    this.inflight++;
    if (this.busyCores < this.cores()) this.op(f);
    else {
      this.runQueue.push(f);
      this.mark(f, VizState.Queued);
    }
  }

  private op(f: Frame): void {
    this.busyCores++;
    this.mark(f, VizState.Service);
    const t = sample(this.spec.op, this.rng) * (this.spec.failure?.slowFactor ?? 1);
    this.sim.after(t, () => {
      if (f.dead) return;
      this.integrate();
      this.busyCores--;
      while (this.busyCores < this.cores() && this.runQueue.length > 0) this.op(this.runQueue.shift()!);
      this.lookup(f);
    });
  }

  private lookup(f: Frame): void {
    const sim = this.sim;
    const key = f.req.key;
    if (!f.req.write && this.lru.get(key, sim.now)) {
      this.hits++;
      this.done(f, true);
      return;
    }
    if (!f.req.write) this.misses++;
    sim.call(this.spec.backing, f.req, f.att, (ok, reason) => {
      if (f.dead) return;
      if (ok) {
        if (f.req.write) this.lru.delete(key);
        else this.lru.set(key, sim.now, this.spec.ttlS ?? 0);
      }
      this.mark(f, VizState.Service);
      this.done(f, ok, reason);
    });
  }

  private done(f: Frame, ok: boolean, reason?: FailReason): void {
    this.integrate();
    this.inflight--;
    this.completed++;
    if (!ok) this.errors++;
    this.recordLatency(this.sim.now - f.enterAt);
    this.sim.reply(f, ok, reason);
  }

  override onSpecChange(prev: NodeSpec): void {
    const p = prev as CacheSpec;
    if (p.capacity !== this.spec.capacity) this.lru.resize(this.spec.capacity);
    const wasDown = !!p.failure?.down;
    const isDown = !!this.spec.failure?.down;
    if (!wasDown && isDown) this.crash();
    else if (wasDown && !isDown) this.up = true;
  }

  override crash(): void {
    this.integrate();
    this.up = false;
    this.epoch++;
    this.lru.clear();
    const doomed: Frame[] = [];
    for (let f = this.runQueue.shift(); f; f = this.runQueue.shift()) doomed.push(f);
    this.busyCores = 0;
    this.inflight = 0;
    for (const f of doomed) {
      f.dead = true;
      this.sim.reply(f, false, "down");
    }
    this.sim.notable("node-down", `${this.spec.label ?? this.id} went down`, this.id);
  }

  override windowStats(dt: number): NodeWindow {
    return { ...super.windowStats(dt), hits: this.hits, misses: this.misses };
  }

  override resetWindow(): void {
    super.resetWindow();
    this.hits = 0;
    this.misses = 0;
  }
}

// ---------------------------------------------------------------- simulation

interface ClientAcc {
  arrivals: number;
  attempts: number;
  ok: number;
  failed: number;
  reasons: Record<FailReason, number>;
  hist: LatencyHistogram;
  timeouts: number;
}

export interface SimOptions {
  /** Called whenever a metrics window closes. */
  onWindow?: (w: WindowMetrics) => void;
  onNotable?: (e: NotableEvent) => void;
}

export class Simulation {
  now = 0;
  readonly seed: string;
  readonly rootRng: Rng;
  readonly windowS: number;
  hopS: number;
  vizRate: number;
  nextReqId = 1;
  private nextAttemptId = 1;
  private heap = new EventHeap();
  private seq = 0;
  private nodes = new Map<string, NodeRt>();
  private order: string[] = [];
  private vizRng: Rng;
  private live = new Map<number, Attempt>();
  private finished: VizParticle[] = [];
  private windowStart = 0;
  private windowIndex = 0;
  readonly sessionHome = new Map<number, { server: string; epoch: number }>();
  acc: ClientAcc = Simulation.freshAcc();
  windows: WindowMetrics[] = [];
  notables: NotableEvent[] = [];
  patchLog: TimedPatch[] = [];
  private timeoutsFlag = false;
  private retryFlag = false;
  private sessionFlag = false;
  private opts: SimOptions;

  constructor(spec: SimSpec, seed: string | number = "nines", opts: SimOptions = {}) {
    this.seed = String(seed);
    this.rootRng = new Rng(this.seed);
    this.vizRng = this.rootRng.stream("viz");
    this.windowS = spec.windowS ?? 1;
    this.hopS = spec.hopS ?? 0.00025;
    this.vizRate = spec.vizRate ?? 0;
    this.opts = opts;
    for (const n of spec.nodes) this.addNode(structuredClone(n));
    for (const id of this.order) this.nodes.get(id)!.start();
    this.at(this.windowS, () => this.closeWindow());
  }

  private static freshAcc(): ClientAcc {
    return { arrivals: 0, attempts: 0, ok: 0, failed: 0, reasons: zeroReasons(), hist: new LatencyHistogram(), timeouts: 0 };
  }

  // ---- scheduling

  at(t: number, fn: () => void): void {
    this.heap.push({ t: Math.max(t, this.now), seq: this.seq++, fn });
  }

  after(dt: number, fn: () => void): void {
    this.at(this.now + Math.max(0, dt), fn);
  }

  runUntil(t: number): void {
    while (this.heap.peekTime() <= t) {
      const ev = this.heap.pop()!;
      this.now = ev.t;
      ev.fn();
    }
    if (t > this.now) this.now = t;
  }

  runFor(dt: number): void {
    this.runUntil(this.now + dt);
  }

  /** Run with a recorded patch log (deterministic replay). */
  static replay(spec: SimSpec, seed: string | number, log: TimedPatch[], until: number, opts: SimOptions = {}): Simulation {
    const sim = new Simulation(spec, seed, opts);
    for (const p of log) {
      sim.runUntil(p.t);
      sim.apply(p.patch);
    }
    sim.runUntil(until);
    return sim;
  }

  // ---- nodes

  hasNode(id: string): boolean {
    const n = this.nodes.get(id);
    return !!n && !n.removed;
  }

  nodeRt(id: string): NodeRt | undefined {
    const n = this.nodes.get(id);
    return n && !n.removed ? n : undefined;
  }

  labelOf(id: string): string {
    return this.nodes.get(id)?.spec.label ?? id;
  }

  nodeIds(): string[] {
    return this.order.filter((id) => !this.nodes.get(id)!.removed);
  }

  specOf(id: string): NodeSpec | undefined {
    return this.nodes.get(id)?.spec;
  }

  private addNode(spec: NodeSpec): NodeRt {
    if (this.nodes.has(spec.id) && !this.nodes.get(spec.id)!.removed) throw new Error(`duplicate node ${spec.id}`);
    let rt: NodeRt;
    switch (spec.kind) {
      case "client":
        rt = new ClientRt(this, spec);
        break;
      case "lb":
        rt = new LbRt(this, spec);
        break;
      case "server":
      case "db":
        rt = new ServerRt(this, spec);
        break;
      case "cache":
        rt = new CacheRt(this, spec);
        break;
    }
    this.nodes.set(spec.id, rt);
    if (!this.order.includes(spec.id)) this.order.push(spec.id);
    return rt;
  }

  // ---- request plumbing

  newAttempt(req: Req, retry: boolean, synthetic = false): Attempt {
    const att: Attempt = {
      id: this.nextAttemptId++,
      req,
      done: false,
      orphan: false,
      viz: false,
      loc: "",
      state: VizState.Queued,
      since: this.now,
      retry,
    };
    // Always draw, so changing vizRate never shifts other random streams.
    const u = this.vizRng.next();
    if (!synthetic && u < this.vizRate) {
      att.viz = true;
      this.live.set(att.id, att);
    }
    return att;
  }

  retireAttempt(att: Attempt, ok: boolean, at: string): void {
    if (!att.viz) return;
    this.live.delete(att.id);
    this.finished.push({
      id: att.id,
      node: at,
      state: att.orphan ? VizState.Failed : ok ? VizState.Done : VizState.Failed,
      age: this.now - att.req.t0,
      since: this.now,
      retry: att.retry ? 1 : 0,
    });
  }

  call(target: string, req: Req, att: Attempt, cb: Cb): void {
    const f: Frame = { req, att, cb, enterAt: this.now, step: 0, failed: false, dead: false, pending: 0 };
    this.after(this.hopS, () => {
      const n = this.nodes.get(target);
      if (!n || n.removed) {
        this.reply(f, false, "down");
        return;
      }
      n.accept(f);
    });
  }

  reply(f: Frame, ok: boolean, reason?: FailReason): void {
    this.after(this.hopS, () => f.cb(ok, ok ? undefined : reason));
  }

  noteTimeout(): void {
    this.acc.timeouts++;
  }

  // ---- patches

  apply(p: SimPatch): void {
    this.patchLog.push({ t: this.now, patch: structuredClone(p) });
    switch (p.op) {
      case "vizRate":
        this.vizRate = p.value;
        return;
      case "set": {
        const n = this.nodes.get(p.node);
        if (!n) return;
        n.integrate();
        const prev = structuredClone(n.spec);
        n.spec = { ...n.spec, ...(structuredClone(p.changes) as object) } as NodeSpec;
        n.onSpecChange(prev);
        return;
      }
      case "add": {
        const rt = this.addNode(structuredClone(p.spec));
        rt.start();
        this.notable("patch", `${p.spec.label ?? p.spec.id} added`, p.spec.id);
        return;
      }
      case "remove": {
        const n = this.nodes.get(p.node);
        if (!n) return;
        n.crash();
        n.removed = true;
        return;
      }
      case "restart": {
        const n = this.nodes.get(p.node);
        if (n instanceof ServerRt) n.restart();
        else n?.crash();
        return;
      }
    }
  }

  /** Visual-only change: not recorded in the patch log. */
  setVizRate(v: number): void {
    this.vizRate = Math.max(0, Math.min(1, v));
  }

  // ---- notable events

  notable(kind: NotableKind, detail: string, node?: string): void {
    const e: NotableEvent = { t: this.now, kind, detail, node };
    this.notables.push(e);
    this.opts.onNotable?.(e);
  }

  // ---- windows & metrics

  private closeWindow(): void {
    const dt = this.now - this.windowStart;
    const nodes: Record<string, NodeWindow> = {};
    let cost = 0;
    for (const id of this.order) {
      const n = this.nodes.get(id)!;
      if (n.removed) continue;
      n.integrate();
      nodes[id] = n.windowStats(dt);
      n.resetWindow();
      cost += n.spec.costPerMonth ?? 0;
    }
    const a = this.acc;
    const total = a.ok + a.failed;
    const w: WindowMetrics = {
      t: this.windowStart,
      dt,
      arrivals: a.arrivals,
      attempts: a.attempts,
      ok: a.ok,
      failed: a.failed,
      failReasons: { ...a.reasons },
      timeouts: a.timeouts,
      p50: a.hist.quantile(0.5),
      p95: a.hist.quantile(0.95),
      p99: a.hist.quantile(0.99),
      mean: a.hist.mean,
      max: a.hist.max,
      throughput: dt > 0 ? a.ok / dt : 0,
      errorRate: total > 0 ? a.failed / total : 0,
      costPerMonth: cost,
      nodes,
      hist: toSparse(a.hist),
    };
    this.windows.push(w);
    this.detect(w);
    this.opts.onWindow?.(w);
    this.acc = Simulation.freshAcc();
    this.windowStart = this.now;
    this.windowIndex++;
    this.at((this.windowIndex + 1) * this.windowS, () => this.closeWindow());
  }

  private detect(w: WindowMetrics): void {
    for (const [id, nw] of Object.entries(w.nodes)) {
      const rt = this.nodes.get(id)!;
      const sat = Math.max(nw.util, nw.workerUtil);
      if (!rt.saturatedFlag && sat > 0.95 && nw.queue > 1) {
        rt.saturatedFlag = true;
        this.notable("saturated", `${this.labelOf(id)} saturated: ${Math.round(sat * 100)}% busy, ${nw.queue.toFixed(0)} queued`, id);
      } else if (rt.saturatedFlag && sat < 0.8 && nw.queue < 1) {
        rt.saturatedFlag = false;
        this.notable("recovered", `${this.labelOf(id)} back under 80% busy`, id);
      }
      if (!rt.overflowFlag && nw.rejected > 0) {
        rt.overflowFlag = true;
        this.notable("queue-overflow", `${this.labelOf(id)} queue full: rejecting requests`, id);
      } else if (rt.overflowFlag && nw.rejected === 0 && nw.queue < 1) rt.overflowFlag = false;
    }
    const total = w.ok + w.failed;
    if (!this.timeoutsFlag && w.timeouts > 0) {
      this.timeoutsFlag = true;
      this.notable("timeouts", `Clients started timing out (${w.timeouts} attempts in ${w.dt.toFixed(0)}s)`);
    } else if (this.timeoutsFlag && w.timeouts === 0) this.timeoutsFlag = false;
    const amp = w.arrivals > 0 ? w.attempts / w.arrivals : 1;
    if (!this.retryFlag && amp > 1.5 && w.arrivals > 5) {
      this.retryFlag = true;
      this.notable("retry-amplification", `Retries amplifying load: ${amp.toFixed(1)}× attempts per request`);
    } else if (this.retryFlag && amp < 1.1) this.retryFlag = false;
    const sessionRate = total > 0 ? w.failReasons.session / total : 0;
    if (!this.sessionFlag && sessionRate > 0.01) {
      this.sessionFlag = true;
      this.notable("session-loss", `Users being logged out: ${(sessionRate * 100).toFixed(1)}% of requests lost their session`);
    } else if (this.sessionFlag && sessionRate === 0) this.sessionFlag = false;
  }

  /** Aggregate complete windows in [from, to). With `sloS`, also the fraction of requests that were good (ok and fast enough). */
  aggregate(from = 0, to = Infinity, sloS?: number): Aggregate {
    const h = new LatencyHistogram();
    const reasons = zeroReasons();
    let arrivals = 0,
      attempts = 0,
      ok = 0,
      failed = 0,
      costSum = 0,
      span = 0,
      count = 0;
    const utilAcc: Record<string, number> = {};
    for (const w of this.windows) {
      if (w.t < from - 1e-9 || w.t + w.dt > to + 1e-9) continue;
      count++;
      arrivals += w.arrivals;
      attempts += w.attempts;
      ok += w.ok;
      failed += w.failed;
      for (const r of FAIL_REASONS) reasons[r] += w.failReasons[r];
      for (const [b, c] of w.hist) h.counts[b]! += c;
      h.n += w.ok;
      h.sum += w.mean * w.ok;
      if (w.max > h.max) h.max = w.max;
      costSum += w.costPerMonth * w.dt;
      span += w.dt;
      for (const [id, nw] of Object.entries(w.nodes)) utilAcc[id] = (utilAcc[id] ?? 0) + Math.max(nw.util, nw.workerUtil) * w.dt;
    }
    const util: Record<string, number> = {};
    for (const [id, v] of Object.entries(utilAcc)) util[id] = span > 0 ? v / span : 0;
    const total = ok + failed;
    return {
      from,
      to: count ? Math.min(to, from + span) : from,
      arrivals,
      attempts,
      ok,
      failed,
      failReasons: reasons,
      p50: h.quantile(0.5),
      p95: h.quantile(0.95),
      p99: h.quantile(0.99),
      mean: h.mean,
      throughput: span > 0 ? ok / span : 0,
      errorRate: total > 0 ? failed / total : 0,
      availability: total > 0 ? ok / total : 1,
      sloGood: sloS === undefined ? (total > 0 ? ok / total : 1) : total > 0 ? h.countUnder(sloS) / total : 1,
      sloS,
      costPerMonth: span > 0 ? costSum / span : 0,
      util,
    };
  }

  // ---- particles

  /** Live tracked requests plus those that finished since the last call. */
  particles(): { live: VizParticle[]; finished: VizParticle[] } {
    const live: VizParticle[] = [];
    for (const a of this.live.values()) {
      live.push({
        id: a.id,
        node: a.loc,
        state: a.orphan ? VizState.Orphan : a.state,
        age: this.now - a.req.t0,
        since: a.since,
        retry: a.retry ? 1 : 0,
      });
    }
    const finished = this.finished;
    this.finished = [];
    return { live, finished };
  }

  get liveCount(): number {
    return this.live.size;
  }

  /** Current instantaneous state, for widgets that need it between windows. */
  instant(id: string): { busyCores: number; busyWorkers: number; queue: number; inflight: number; up: boolean } | undefined {
    const n = this.nodes.get(id);
    if (!n) return undefined;
    return { busyCores: n.busyCores, busyWorkers: n.busyWorkers, queue: n.queueLen(), inflight: n.inflight, up: n.up };
  }
}

export { scaleDist };
export type { Dist };
