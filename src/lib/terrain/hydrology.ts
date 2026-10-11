import { chaikin } from './geometry';
import { cellX, cellY, NEIGHBOURS, type Grid } from './grid';
import { MinHeap } from './geometry';

/**
 * Water: fill depressions (some become lakes), route flow downhill to the
 * sea, and trace rivers where enough water gathers.
 */

export interface River {
  name: string | null;
  /** Polyline, local IL, from source towards the mouth. */
  points: number[];
  /** Relative flow (0–1) at each vertex, for drawing width. */
  flow: number[];
  /** Index of the first vertex from which the river is navigable, or -1. */
  navigableFrom: number;
}

export interface Hydrology {
  /** Lake id per cell (-1 = not lake). */
  lake: Int16Array;
  lakeCount: number;
  /** Downstream neighbour per cell (-1 = sea/edge outlet). */
  down: Int32Array;
  /** Upstream area per cell, in cells. */
  accumulation: Float32Array;
  /** 1 where a river runs through the cell. */
  riverMask: Uint8Array;
  rivers: River[];
}

export interface HydrologyOptions {
  /** Minimum depth (m) for a depression to hold a lake. */
  lakeDepth: number;
  /** Minimum lake size, cells. */
  lakeCells: number;
  /** Upstream area (fraction of land) at which a stream is drawn as a river. */
  riverShare: number;
  /** Upstream area (fraction of land) at which a river becomes navigable. */
  navigableShare: number;
  /** Designed lakes: cells forced to be lake (lake id per cell, -1 none). */
  fixedLakes?: Int16Array;
}

export function hydrology(g: Grid, elevation: Float32Array, land: Uint8Array, o: HydrologyOptions): Hydrology {
  const { n } = g;
  const N = n * n;
  const filled = new Float32Array(elevation);
  const done = new Uint8Array(N);
  const heap = new MinHeap();
  const eps = 0.01;

  // Fixed lakes are flattened to their lowest shore so they fill as one body.
  if (o.fixedLakes) {
    const shore = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      const id = o.fixedLakes[k];
      if (id < 0) continue;
      shore.set(id, Math.min(shore.get(id) ?? Infinity, elevation[k]));
    }
    for (let k = 0; k < N; k++) if (o.fixedLakes[k] >= 0) filled[k] = shore.get(o.fixedLakes[k])!;
  }

  // Priority-flood (Barnes et al.) with epsilon: every cell drains to the sea.
  for (let k = 0; k < N; k++) {
    const i = k % n;
    const j = (k / n) | 0;
    if (!land[k]) {
      done[k] = 1;
      continue;
    }
    const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
    let coastal = edge;
    if (!edge) for (const [di, dj] of NEIGHBOURS) if (!land[k + dj * n + di]) coastal = true;
    if (coastal) {
      done[k] = 1;
      heap.push(filled[k], k);
    }
  }
  while (heap.size) {
    const k = heap.pop();
    const i = k % n;
    const j = (k / n) | 0;
    for (const [di, dj] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const m = jj * n + ii;
      if (done[m]) continue;
      done[m] = 1;
      if (filled[m] <= filled[k]) filled[m] = filled[k] + eps;
      heap.push(filled[m], m);
    }
  }

  // Lakes: connected filled depressions deep and wide enough, plus fixed lakes.
  const lake = new Int16Array(N).fill(-1);
  let lakeCount = 0;
  const deep = (k: number) => land[k] && filled[k] - elevation[k] > o.lakeDepth;
  const seen = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (seen[k] || !deep(k) || (o.fixedLakes && o.fixedLakes[k] >= 0)) continue;
    const comp: number[] = [];
    const stack = [k];
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const i = c % n;
      const j = (c / n) | 0;
      for (const [di, dj] of NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const m = jj * n + ii;
        if (!seen[m] && deep(m)) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    if (comp.length >= o.lakeCells) {
      for (const c of comp) lake[c] = lakeCount;
      lakeCount++;
    }
  }
  if (o.fixedLakes) {
    const remap = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      const id = o.fixedLakes[k];
      if (id < 0) continue;
      if (!remap.has(id)) remap.set(id, lakeCount++);
      lake[k] = remap.get(id)!;
    }
  }

  // Steepest descent on the filled surface.
  const down = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) {
    if (!land[k]) continue;
    const i = k % n;
    const j = (k / n) | 0;
    let best = -1;
    let bestDrop = 0;
    for (const [di, dj, len] of NEIGHBOURS) {
      const ii = i + di;
      const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      const m = jj * n + ii;
      const drop = ((land[m] ? filled[m] : -1) < filled[k] ? filled[k] - (land[m] ? filled[m] : -1) : 0) / len;
      if (drop > bestDrop) {
        bestDrop = drop;
        best = m;
      }
    }
    down[k] = best;
  }

  // Flow accumulation, highest cells first.
  const order: number[] = [];
  for (let k = 0; k < N; k++) if (land[k]) order.push(k);
  order.sort((a, b) => filled[b] - filled[a]);
  const acc = new Float32Array(N);
  for (const k of order) acc[k] += 1;
  for (const k of order) if (down[k] >= 0 && land[down[k]]) acc[down[k]] += acc[k];

  const landCells = order.length || 1;
  const riverAt = Math.max(6, o.riverShare * landCells);
  const navAt = Math.max(riverAt * 2, o.navigableShare * landCells);
  const isRiver = (k: number) => land[k] && lake[k] < 0 && acc[k] >= riverAt;

  // Trace each river from its head to where it meets the sea, a lake, or a larger river.
  const riverMask = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (isRiver(k)) riverMask[k] = 1;
  const hasRiverUpstream = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (riverMask[k] && down[k] >= 0) hasRiverUpstream[down[k]] = 1;
  const heads = order.filter((k) => riverMask[k] && !hasRiverUpstream[k]);
  const claimed = new Uint8Array(N);
  const maxAcc = Math.max(...order.map((k) => acc[k]));
  const rivers: River[] = [];
  for (const h of heads) {
    const pts: number[] = [];
    const flow: number[] = [];
    let navigableFrom = -1;
    let k = h;
    while (k >= 0) {
      pts.push(cellX(g, k % n), cellY(g, (k / n) | 0));
      flow.push(Math.sqrt(acc[k] / maxAcc));
      if (navigableFrom < 0 && acc[k] >= navAt) navigableFrom = pts.length / 2 - 1;
      if (!land[k] || lake[k] >= 0) break; // reached the sea or a lake
      if (claimed[k] && k !== h) break; // joined a river already traced
      claimed[k] = 1;
      k = down[k];
    }
    if (pts.length >= 6) {
      // Smooth, then re-sample flow along the smoothed line.
      const smooth = chaikin(pts, 2);
      const sf: number[] = [];
      for (let v = 0; v < smooth.length / 2; v++) sf.push(flow[Math.min(flow.length - 1, Math.floor((v / (smooth.length / 2)) * flow.length))]);
      rivers.push({
        name: null,
        points: smooth,
        flow: sf,
        navigableFrom: navigableFrom < 0 ? -1 : Math.floor((navigableFrom / (pts.length / 2)) * (smooth.length / 2)),
      });
    }
  }

  return { lake, lakeCount, down, accumulation: acc, riverMask, rivers };
}
