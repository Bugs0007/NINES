/**
 * Infrastructure map layout: tracks become districts, chapters become city blocks,
 * concepts become lots placed by prerequisite depth inside their block. Pure and deterministic.
 */
import { CHAPTERS, GRAPH, TRACKS, type PlannedNode, type Track } from "@/content/graph";

export const LOT = 30;
export const PITCH = 46;
const BLOCK_PAD = 14;
const BLOCK_HEADER = 30;
const BLOCK_GAP = 22;
const DISTRICT_PAD = 26;
const DISTRICT_HEADER = 40;
const DISTRICT_GAP = 60;

export interface LotLayout {
  node: PlannedNode;
  x: number; // centre
  y: number;
}

export interface BlockLayout {
  chapter: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  lots: LotLayout[];
}

export interface DistrictLayout {
  track: Track;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  blocks: BlockLayout[];
}

export interface EdgeLayout {
  from: string;
  to: string;
  d: string;
  local: boolean;
}

export interface MapLayout {
  width: number;
  height: number;
  districts: DistrictLayout[];
  lots: Map<string, LotLayout>;
  edges: EdgeLayout[];
}

const DISTRICT_WIDTH: Record<Track, number> = { A: 1380, B: 1000, C: 1000, D: 520 };

function blockFor(chapter: string, title: string): BlockLayout {
  const nodes = GRAPH.filter((n) => n.chapter === chapter);
  const ids = new Set(nodes.map((n) => n.id));
  const depth = new Map<string, number>();
  const d = (id: string): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    const n = nodes.find((x) => x.id === id)!;
    const local = n.prereqs.filter((p) => ids.has(p));
    const v = local.length ? 1 + Math.max(...local.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  nodes.forEach((n) => d(n.id));
  const cols = new Map<number, PlannedNode[]>();
  for (const n of nodes) {
    const k = depth.get(n.id)!;
    cols.set(k, [...(cols.get(k) ?? []), n]);
  }
  const maxDepth = Math.max(0, ...depth.values());
  const maxRows = Math.max(1, ...[...cols.values()].map((c) => c.length));
  const w = BLOCK_PAD * 2 + (maxDepth + 1) * PITCH - (PITCH - LOT);
  const h = BLOCK_HEADER + BLOCK_PAD + maxRows * PITCH - (PITCH - LOT);
  const lots: LotLayout[] = [];
  for (const [k, col] of cols) {
    const offset = ((maxRows - col.length) * PITCH) / 2;
    col.forEach((n, i) => {
      lots.push({ node: n, x: BLOCK_PAD + k * PITCH + LOT / 2, y: BLOCK_HEADER + offset + i * PITCH + LOT / 2 });
    });
  }
  return { chapter, title, x: 0, y: 0, w: Math.max(w, 150), h, lots };
}

function packDistrict(track: Track): DistrictLayout {
  const maxW = DISTRICT_WIDTH[track];
  const blocks = CHAPTERS.filter((c) => c.track === track)
    .sort((a, b) => a.order - b.order)
    .map((c) => blockFor(c.id, c.title));
  let x = DISTRICT_PAD;
  let y = DISTRICT_HEADER;
  let rowH = 0;
  let usedW = 0;
  for (const b of blocks) {
    if (x + b.w > maxW - DISTRICT_PAD && x > DISTRICT_PAD) {
      x = DISTRICT_PAD;
      y += rowH + BLOCK_GAP;
      rowH = 0;
    }
    b.x = x;
    b.y = y;
    x += b.w + BLOCK_GAP;
    rowH = Math.max(rowH, b.h);
    usedW = Math.max(usedW, x - BLOCK_GAP + DISTRICT_PAD);
  }
  return { track, name: TRACKS[track].district, x: 0, y: 0, w: Math.max(usedW, 300), h: y + rowH + DISTRICT_PAD, blocks };
}

function trace(x1: number, y1: number, x2: number, y2: number): string {
  // PCB-style: horizontal out, 45° jog, horizontal in.
  const mx = (x1 + x2) / 2;
  const dy = y2 - y1;
  const jog = Math.min(Math.abs(dy), Math.abs(x2 - x1) / 2);
  if (Math.abs(dy) < 1) return `M${x1},${y1}H${x2}`;
  const s = Math.sign(dy);
  return `M${x1},${y1}H${mx - jog / 2}L${mx + jog / 2},${y1 + s * jog}V${y2}H${x2}`;
}

let cached: MapLayout | null = null;

export function mapLayout(): MapLayout {
  if (cached) return cached;
  const A = packDistrict("A");
  const B = packDistrict("B");
  const C = packDistrict("C");
  const D = packDistrict("D");
  A.x = 0;
  A.y = 0;
  B.x = A.w + DISTRICT_GAP;
  B.y = 0;
  C.x = B.x;
  C.y = B.h + DISTRICT_GAP;
  D.x = 0;
  D.y = A.h + DISTRICT_GAP;
  const districts = [A, B, C, D];
  const lots = new Map<string, LotLayout>();
  for (const dist of districts) {
    for (const b of dist.blocks) {
      for (const l of b.lots) lots.set(l.node.id, { node: l.node, x: dist.x + b.x + l.x, y: dist.y + b.y + l.y });
    }
  }
  const edges: EdgeLayout[] = [];
  for (const n of GRAPH) {
    const to = lots.get(n.id)!;
    for (const p of n.prereqs) {
      const from = lots.get(p);
      if (!from) continue;
      const local = from.node.chapter === n.chapter;
      if (!local) continue; // cross-chapter links are shown on selection, not as permanent clutter
      edges.push({ from: p, to: n.id, local, d: trace(from.x + LOT / 2, from.y, to.x - LOT / 2, to.y) });
    }
  }
  const width = Math.max(...districts.map((d) => d.x + d.w));
  const height = Math.max(...districts.map((d) => d.y + d.h));
  cached = { width, height, districts, lots, edges };
  return cached;
}

/** Straight-ish connector for a cross-chapter prerequisite (drawn only for the selected lot). */
export function crossTrace(fromId: string, toId: string): string | null {
  const L = mapLayout();
  const a = L.lots.get(fromId);
  const b = L.lots.get(toId);
  if (!a || !b) return null;
  return `M${a.x},${a.y}C${a.x + 80},${a.y} ${b.x - 80},${b.y} ${b.x},${b.y}`;
}

type Rect = { x: number; y: number; w: number; h: number };

/**
 * What to frame when the map opens on a chapter: its block, the row of blocks it sits in
 * (from the district header down when it is the first row), and its district.
 */
export function focusFrame(chapter: string): { block: Rect; row: Rect; district: Rect } | null {
  for (const d of mapLayout().districts) {
    const b = d.blocks.find((x) => x.chapter === chapter);
    if (!b) continue;
    const row = d.blocks.filter((x) => x.y === b.y);
    const top = b.y === DISTRICT_HEADER ? d.y : d.y + b.y - 14;
    const bottom = d.y + b.y + Math.max(...row.map((x) => x.h));
    return {
      block: { x: d.x + b.x, y: d.y + b.y, w: b.w, h: b.h },
      row: { x: d.x, y: top, w: d.w, h: bottom - top },
      district: { x: d.x, y: d.y, w: d.w, h: d.h },
    };
  }
  return null;
}

/** Absolute rect of a chapter block, for focusing the viewport. */
export function blockRect(chapter: string): { x: number; y: number; w: number; h: number } | null {
  for (const d of mapLayout().districts) {
    for (const b of d.blocks) if (b.chapter === chapter) return { x: d.x + b.x, y: d.y + b.y, w: b.w, h: b.h };
  }
  return null;
}
