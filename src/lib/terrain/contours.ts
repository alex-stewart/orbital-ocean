import { cellX, cellY, type Grid } from './grid';

/**
 * Marching squares over cell centres. `field` values above `level` are
 * inside. Returns line segments [x1, y1, x2, y2, …] in local IL.
 */
export function isoSegments(g: Grid, field: Float32Array, level: number): Float32Array {
  const { n } = g;
  const out: number[] = [];
  const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-9);
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const k = j * n + i;
      const a = field[k];
      const b = field[k + 1];
      const c = field[k + n + 1];
      const d = field[k + n];
      const idx = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = cellX(g, i);
      const y0 = cellY(g, j);
      const s = g.cell;
      // Edge crossing points: top (a-b), right (b-c), bottom (d-c), left (a-d).
      const top = [x0 + s * lerp(a, b), y0];
      const right = [x0 + s, y0 + s * lerp(b, c)];
      const bottom = [x0 + s * lerp(d, c), y0 + s];
      const left = [x0, y0 + s * lerp(a, d)];
      const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 5: seg(left, top); seg(bottom, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 10: seg(top, right); seg(left, bottom); break;
      }
    }
  return Float32Array.from(out);
}

/** Join segments into polylines (closed ones repeat their first point). */
export function joinSegments(seg: Float32Array): number[][] {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const ends = new Map<string, number[]>();
  const count = seg.length / 4;
  const usedSeg = new Uint8Array(count);
  for (let s = 0; s < count; s++) {
    for (const e of [0, 1]) {
      const k = key(seg[s * 4 + e * 2], seg[s * 4 + e * 2 + 1]);
      (ends.get(k) ?? ends.set(k, []).get(k)!).push(s * 2 + e);
    }
  }
  const lines: number[][] = [];
  for (let s = 0; s < count; s++) {
    if (usedSeg[s]) continue;
    usedSeg[s] = 1;
    const line = [seg[s * 4], seg[s * 4 + 1], seg[s * 4 + 2], seg[s * 4 + 3]];
    // Extend forwards, then backwards.
    for (const forward of [true, false]) {
      for (;;) {
        const x = forward ? line[line.length - 2] : line[0];
        const y = forward ? line[line.length - 1] : line[1];
        const next = (ends.get(key(x, y)) ?? []).find((se) => !usedSeg[se >> 1]);
        if (next === undefined) break;
        const sIdx = next >> 1;
        usedSeg[sIdx] = 1;
        const other = (next & 1) === 0 ? 1 : 0;
        const ox = seg[sIdx * 4 + other * 2];
        const oy = seg[sIdx * 4 + other * 2 + 1];
        if (forward) line.push(ox, oy);
        else line.unshift(ox, oy);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** A tidy set of contour levels for a given relief, e.g. every 250 m. */
export function contourLevels(maxElevation: number): number[] {
  const step = maxElevation > 2400 ? 500 : maxElevation > 1200 ? 250 : maxElevation > 500 ? 100 : 50;
  const out: number[] = [];
  for (let l = step; l < maxElevation; l += step) out.push(l);
  return out;
}
