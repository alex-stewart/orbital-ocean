import { insideRings, type Poly } from './geometry';

/**
 * A square raster over a continent, in local coordinates: IL from the
 * continent's centre, x east, y south (north up), matching the chart.
 */
export interface Grid {
  /** Cells per side. */
  n: number;
  /** Half-width of the covered square, IL. */
  half: number;
  /** Cell size, IL. */
  cell: number;
}

export function makeGrid(half: number, n: number): Grid {
  return { n, half, cell: (2 * half) / n };
}

export function cellX(g: Grid, i: number) {
  return -g.half + (i + 0.5) * g.cell;
}
export function cellY(g: Grid, j: number) {
  return -g.half + (j + 0.5) * g.cell;
}
export function cellAt(g: Grid, x: number, y: number): number {
  const i = Math.floor((x + g.half) / g.cell);
  const j = Math.floor((y + g.half) / g.cell);
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return -1;
  return j * g.n + i;
}

/** 1 where a cell centre lies inside the rings. */
export function rasterize(g: Grid, rings: Poly[]): Uint8Array {
  const m = new Uint8Array(g.n * g.n);
  // Scanline per row: find crossings, fill between pairs.
  for (let j = 0; j < g.n; j++) {
    const y = cellY(g, j);
    const xs: number[] = [];
    for (const r of rings) {
      const n = r.length / 2;
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ya = r[a * 2 + 1];
        const yb = r[b * 2 + 1];
        if (ya > y !== yb > y) xs.push(r[a * 2] + ((y - ya) / (yb - ya)) * (r[b * 2] - r[a * 2]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + g.half) / g.cell - 0.5));
      const i1 = Math.min(g.n - 1, Math.floor((xs[k + 1] + g.half) / g.cell - 0.5));
      for (let i = i0; i <= i1; i++) m[j * g.n + i] = 1;
    }
  }
  return m;
}

/** Exact test, for points (not cells). */
export function inside(rings: Poly[], x: number, y: number) {
  return insideRings(x, y, rings);
}

/**
 * Chamfer distance transform: distance (IL) from each cell to the nearest
 * cell where `target` is 1. Cells that are targets get 0.
 */
export function distanceTo(g: Grid, target: Uint8Array): Float32Array {
  const { n } = g;
  const INF = 1e9;
  const d = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) d[k] = target[k] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - n] + a);
        if (i > 0) v = Math.min(v, d[k - n - 1] + b);
        if (i < n - 1) v = Math.min(v, d[k - n + 1] + b);
      }
      d[k] = v;
    }
  for (let j = n - 1; j >= 0; j--)
    for (let i = n - 1; i >= 0; i--) {
      const k = j * n + i;
      let v = d[k];
      if (i < n - 1) v = Math.min(v, d[k + 1] + a);
      if (j < n - 1) {
        v = Math.min(v, d[k + n] + a);
        if (i < n - 1) v = Math.min(v, d[k + n + 1] + b);
        if (i > 0) v = Math.min(v, d[k + n - 1] + b);
      }
      d[k] = v;
    }
  for (let k = 0; k < n * n; k++) d[k] *= g.cell;
  return d;
}

/** Bilinear sample of a field at a local point. */
export function sample(g: Grid, f: Float32Array, x: number, y: number): number {
  const fx = Math.min(g.n - 1.001, Math.max(0, (x + g.half) / g.cell - 0.5));
  const fy = Math.min(g.n - 1.001, Math.max(0, (y + g.half) / g.cell - 0.5));
  const i = Math.floor(fx);
  const j = Math.floor(fy);
  const tx = fx - i;
  const ty = fy - j;
  const k = j * g.n + i;
  const a = f[k];
  const b = f[k + 1];
  const c = f[k + g.n];
  const d = f[k + g.n + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** 8-neighbour offsets and their step lengths in cells. */
export const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];
