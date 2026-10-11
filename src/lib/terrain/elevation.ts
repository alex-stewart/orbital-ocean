import { rng } from '../random';
import { segmentDistance, type Poly } from './geometry';
import { cellX, cellY, distanceTo, rasterize, type Grid } from './grid';
import { fbm, ridged } from './noise';

/**
 * Elevation in metres for every land cell (sea cells are -1).
 */

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Generated terrain: land rises from the coast, with one to three mountain
 * ranges along random lines, ridged noise for crests, and gentle fBm hills.
 */
export function generatedElevation(g: Grid, land: Uint8Array, seed: number, radius: number, maxElevation: number): Float32Array {
  const rand = rng(seed * 7919 + 13);
  const { n } = g;
  const sea = new Uint8Array(n * n);
  for (let k = 0; k < n * n; k++) sea[k] = land[k] ? 0 : 1;
  const inland = distanceTo(g, sea);

  // Mountain ranges: segments through the interior.
  const interior: number[] = [];
  for (let k = 0; k < n * n; k++) if (inland[k] > radius * 0.25) interior.push(k);
  const ranges: { ax: number; ay: number; bx: number; by: number; h: number; w: number }[] = [];
  const count = 1 + Math.floor(rand() * 3);
  for (let r = 0; r < count && interior.length; r++) {
    const k = interior[Math.floor(rand() * interior.length)];
    const cx = cellX(g, k % n);
    const cy = cellY(g, Math.floor(k / n));
    const a = rand() * Math.PI;
    const len = radius * (0.35 + rand() * 0.55);
    ranges.push({
      ax: cx - (Math.cos(a) * len) / 2,
      ay: cy - (Math.sin(a) * len) / 2,
      bx: cx + (Math.cos(a) * len) / 2,
      by: cy + (Math.sin(a) * len) / 2,
      h: r === 0 ? 1 : 0.55 + rand() * 0.35,
      w: radius * (0.1 + rand() * 0.08),
    });
  }

  const e = new Float32Array(n * n);
  const s = (seed % 9973) + 1;
  const f = 3 / radius; // noise frequency: a few features across the continent
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!land[k]) {
        e[k] = -1;
        continue;
      }
      const x = cellX(g, i);
      const y = cellY(g, j);
      const coastRamp = smoothstep(0, radius * 0.12, inland[k]);
      const plateau = smoothstep(0, radius * 0.45, inland[k]);
      let range = 0;
      for (const r of ranges) {
        const d = segmentDistance(x, y, r.ax, r.ay, r.bx, r.by);
        range = Math.max(range, r.h * Math.exp(-(d * d) / (2 * r.w * r.w)));
      }
      const crest = ridged(x * f * 1.7, y * f * 1.7, s + 3);
      const hills = fbm(x * f, y * f, s);
      const h = 0.04 + 0.22 * plateau * hills + range * (0.45 + 0.55 * crest);
      e[k] = Math.max(1, maxElevation * coastRamp * Math.min(1, h));
    }
  return e;
}

export interface ContourLine {
  level: number;
  rings: Poly[];
}

export interface Peak {
  x: number;
  y: number;
  elevation: number;
}

/**
 * Terrain from hand-drawn contours. Each contour is a closed line at a level;
 * the coast is level 0. Between two levels, elevation is interpolated by
 * distance to each line, so slopes are steep where lines are close.
 * Ground inside the highest contours rises gently to a summit; peaks, if
 * drawn, pull the ground up to their height.
 */
export function contourElevation(g: Grid, land: Uint8Array, contours: ContourLine[], peaks: Peak[]): Float32Array {
  const { n } = g;
  const levels = [...new Set(contours.map((c) => c.level))].filter((l) => l > 0).sort((a, b) => a - b);
  // masks[k]: inside any contour at level >= levels[k] (and on land).
  const masks = levels.map((lv) => {
    const m = rasterize(
      g,
      contours.filter((c) => c.level >= lv).flatMap((c) => c.rings),
    );
    for (let k = 0; k < n * n; k++) m[k] &= land[k];
    return m;
  });
  const all = [0, ...levels];
  const inMask = [land, ...masks];
  // Distance from each cell to the outside of each mask, and to the inside of the next.
  const toOutside = inMask.map((m) => {
    const out = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) out[k] = m[k] ? 0 : 1;
    return distanceTo(g, out);
  });
  const toInside = inMask.map((m) => distanceTo(g, m));
  const interval = levels.length > 1 ? (levels[levels.length - 1] - levels[0]) / (levels.length - 1) : levels[0] || 100;

  const e = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) {
    if (!land[k]) {
      e[k] = -1;
      continue;
    }
    let b = 0;
    while (b + 1 < inMask.length && inMask[b + 1][k]) b++;
    const lo = all[b];
    const dLo = toOutside[b][k];
    // (an empty mask leaves distances near 1e9: no higher ground to climb towards)
    if (b + 1 < inMask.length && toInside[b + 1][k] < 1e8) {
      const dHi = toInside[b + 1][k];
      e[k] = lo + ((all[b + 1] - lo) * dLo) / (dLo + dHi);
    } else {
      // A summit area: rise by up to half an interval towards its middle.
      e[k] = lo + interval * 0.5 * (dLo / (dLo + 4 * g.cell));
    }
    e[k] = Math.max(1, e[k]);
  }

  for (const p of peaks) {
    const reach = 4 * g.cell;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        if (!land[k]) continue;
        const d = Math.hypot(cellX(g, i) - p.x, cellY(g, j) - p.y);
        if (d > reach * 2) continue;
        const w = Math.max(0, 1 - d / (reach * 2));
        if (p.elevation > e[k]) e[k] += (p.elevation - e[k]) * w * w;
      }
  }
  return e;
}
