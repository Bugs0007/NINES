/**
 * Small, allocation-conscious data structures for the event loop.
 */

export interface SimEvent {
  t: number;
  seq: number;
  fn: () => void;
}

/** Binary min-heap ordered by (t, seq). The seq tie-break makes runs deterministic. */
export class EventHeap {
  private items: SimEvent[] = [];

  get size(): number {
    return this.items.length;
  }

  peekTime(): number {
    return this.items.length ? (this.items[0] as SimEvent).t : Infinity;
  }

  push(ev: SimEvent): void {
    const a = this.items;
    a.push(ev);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const pi = a[p] as SimEvent;
      if (pi.t < ev.t || (pi.t === ev.t && pi.seq < ev.seq)) break;
      a[i] = pi;
      i = p;
    }
    a[i] = ev;
  }

  pop(): SimEvent | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0] as SimEvent;
    const last = a.pop() as SimEvent;
    if (a.length > 0) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        let c = l;
        const lv = a[l] as SimEvent;
        if (r < n) {
          const rv = a[r] as SimEvent;
          if (rv.t < lv.t || (rv.t === lv.t && rv.seq < lv.seq)) c = r;
        }
        const cv = a[c] as SimEvent;
        if (last.t < cv.t || (last.t === cv.t && last.seq < cv.seq)) break;
        a[i] = cv;
        i = c;
      }
      a[i] = last;
    }
    return top;
  }

  clear(): void {
    this.items = [];
  }
}

/** Growable ring-buffer FIFO. O(1) push/shift, no array reindexing. */
export class Deque<T> {
  private buf: (T | undefined)[];
  private head = 0;
  private len = 0;

  constructor(capacity = 16) {
    this.buf = new Array(capacity);
  }

  get length(): number {
    return this.len;
  }

  push(v: T): void {
    if (this.len === this.buf.length) this.grow();
    this.buf[(this.head + this.len) % this.buf.length] = v;
    this.len++;
  }

  shift(): T | undefined {
    if (this.len === 0) return undefined;
    const v = this.buf[this.head];
    this.buf[this.head] = undefined;
    this.head = (this.head + 1) % this.buf.length;
    this.len--;
    return v;
  }

  at(i: number): T | undefined {
    if (i < 0 || i >= this.len) return undefined;
    return this.buf[(this.head + i) % this.buf.length];
  }

  /** Remove every element matching `pred`. O(n). */
  removeWhere(pred: (v: T) => boolean): T[] {
    const kept: T[] = [];
    const removed: T[] = [];
    for (let i = 0; i < this.len; i++) {
      const v = this.buf[(this.head + i) % this.buf.length] as T;
      (pred(v) ? removed : kept).push(v);
    }
    this.buf = new Array(Math.max(16, kept.length * 2));
    this.head = 0;
    this.len = 0;
    for (const v of kept) this.push(v);
    return removed;
  }

  private grow(): void {
    const next = new Array<T | undefined>(this.buf.length * 2);
    for (let i = 0; i < this.len; i++) next[i] = this.buf[(this.head + i) % this.buf.length];
    this.buf = next;
    this.head = 0;
  }
}

/**
 * Log-bucketed latency histogram (HDR-style), ~1% relative precision from 1µs to ~30min.
 * Mergeable, cheap to record, and good enough for p50/p95/p99/p999.
 */
export class LatencyHistogram {
  static readonly MIN = 1e-6;
  static readonly GROWTH = 1.02;
  static readonly BUCKETS = 1100;
  private static readonly LOG_G = Math.log(LatencyHistogram.GROWTH);

  counts = new Uint32Array(LatencyHistogram.BUCKETS);
  n = 0;
  sum = 0;
  max = 0;

  static bucketOf(v: number): number {
    if (v <= LatencyHistogram.MIN) return 0;
    const b = Math.floor(Math.log(v / LatencyHistogram.MIN) / LatencyHistogram.LOG_G) + 1;
    return b >= LatencyHistogram.BUCKETS ? LatencyHistogram.BUCKETS - 1 : b;
  }

  /** Representative (geometric-mid) value for a bucket. */
  static valueOf(b: number): number {
    if (b === 0) return LatencyHistogram.MIN;
    return LatencyHistogram.MIN * Math.pow(LatencyHistogram.GROWTH, b - 0.5);
  }

  record(v: number): void {
    this.counts[LatencyHistogram.bucketOf(v)]!++;
    this.n++;
    this.sum += v;
    if (v > this.max) this.max = v;
  }

  merge(o: LatencyHistogram): void {
    for (let i = 0; i < LatencyHistogram.BUCKETS; i++) this.counts[i]! += o.counts[i]!;
    this.n += o.n;
    this.sum += o.sum;
    if (o.max > this.max) this.max = o.max;
  }

  get mean(): number {
    return this.n ? this.sum / this.n : 0;
  }

  /** q in [0, 1]. Returns 0 for an empty histogram. */
  quantile(q: number): number {
    if (this.n === 0) return 0;
    const target = Math.max(1, Math.ceil(q * this.n));
    let acc = 0;
    for (let i = 0; i < LatencyHistogram.BUCKETS; i++) {
      acc += this.counts[i]!;
      if (acc >= target) return Math.min(LatencyHistogram.valueOf(i), this.max);
    }
    return this.max;
  }

  /** Number of recorded values <= v (bucket resolution). */
  countUnder(v: number): number {
    const b = LatencyHistogram.bucketOf(v);
    let acc = 0;
    for (let i = 0; i <= b; i++) acc += this.counts[i]!;
    return acc;
  }

  reset(): void {
    this.counts.fill(0);
    this.n = 0;
    this.sum = 0;
    this.max = 0;
  }
}

/** O(1) LRU over numeric keys, using Map insertion order. */
export class LruCache {
  private map = new Map<number, number>(); // key -> expiresAt
  capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
  }

  get size(): number {
    return this.map.size;
  }

  /** Returns true on a fresh hit (and refreshes recency). Expired entries count as misses. */
  get(key: number, now: number): boolean {
    const exp = this.map.get(key);
    if (exp === undefined) return false;
    if (exp <= now) {
      this.map.delete(key);
      return false;
    }
    this.map.delete(key);
    this.map.set(key, exp);
    return true;
  }

  set(key: number, now: number, ttl: number): number | undefined {
    if (this.capacity === 0) return undefined;
    this.map.delete(key);
    this.map.set(key, ttl > 0 ? now + ttl : Infinity);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as number;
      this.map.delete(oldest);
      return oldest;
    }
    return undefined;
  }

  delete(key: number): void {
    this.map.delete(key);
  }

  resize(capacity: number): void {
    this.capacity = Math.max(0, Math.floor(capacity));
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as number;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}
