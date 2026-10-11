/** Small 2D helpers for polygons and polylines stored as [x0, y0, x1, y1, …]. */

export type Poly = Float32Array | number[];

/** Even-odd point-in-polygon over a set of rings (holes work naturally). */
export function insideRings(x: number, y: number, rings: Poly[]): boolean {
  let inside = false;
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = r[i * 2];
      const yi = r[i * 2 + 1];
      const xj = r[j * 2];
      const yj = r[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

export function ringArea(r: Poly): number {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a / 2;
}

export function ringCentroid(r: Poly): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    sx += r[i * 2];
    sy += r[i * 2 + 1];
  }
  return { x: sx / n, y: sy / n };
}

export function polylineLength(p: Poly): number {
  let d = 0;
  for (let i = 2; i < p.length; i += 2) d += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return d;
}

/** Chaikin corner-cutting: smooths a grid-stepped line, keeping its ends. */
export function chaikin(p: number[], iterations = 2): number[] {
  let pts = p;
  for (let k = 0; k < iterations; k++) {
    if (pts.length < 6) return pts;
    const out = [pts[0], pts[1]];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const x0 = pts[i];
      const y0 = pts[i + 1];
      const x1 = pts[i + 2];
      const y1 = pts[i + 3];
      out.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
    }
    out.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

/** Ramer–Douglas–Peucker simplification of an open polyline. */
export function simplify(p: number[], tolerance: number): number[] {
  const n = p.length / 2;
  if (n < 3) return p;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a * 2];
    const ay = p[a * 2 + 1];
    const dx = p[b * 2] - ax;
    const dy = p[b * 2 + 1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1;
    let bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((p[i * 2] - ax) * dy - (p[i * 2 + 1] - ay) * dx) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(p[i * 2], p[i * 2 + 1]);
  return out;
}

/** Distance from a point to segment (ax,ay)-(bx,by). */
export function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Minimal binary min-heap keyed by number, for flooding and pathfinding. */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  /** Removes the smallest entry; returns its value (read `lastKey` for its key). */
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const topV = v[0];
    this.lastKey = k[0];
    const key = k.pop()!;
    const val = v.pop()!;
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        let mk = key;
        if (l < n && k[l] < mk) {
          m = l;
          mk = k[l];
        }
        if (r < n && k[r] < mk) m = r;
        if (m === i) break;
        k[i] = k[m];
        v[i] = v[m];
        i = m;
      }
      k[i] = key;
      v[i] = val;
    }
    return topV;
  }
  lastKey = 0;
}
