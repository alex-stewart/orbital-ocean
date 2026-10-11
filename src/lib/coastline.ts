import { rng } from './random';

export interface IslandShape {
  /** Coastline as a unit-scale closed path (mean radius ≈ 1). */
  coast: Path2D;
  /** Raw coastline points [x0, y0, x1, y1, …], unit scale. */
  points: Float32Array;
}

export interface CoastOptions {
  /** 0 = perfect circle, ~0.35 = very ragged. */
  roughness: number;
  /** Number of vertices around the coast. */
  resolution: number;
}

/**
 * Procedural placeholder coastline: a radial profile built from a sum of
 * harmonics with a 1/k^1.4 falloff (fractal-ish coast), plus a few
 * localised bays and headlands. Deterministic per seed.
 */
function buildCoast(seed: number, { roughness, resolution }: CoastOptions) {
  const rand = rng(seed);
  const harmonics: { k: number; amp: number; phase: number }[] = [];
  for (let k = 2; k <= 96; k++) {
    harmonics.push({ k, amp: (rand() * 2 - 1) / Math.pow(k, 1.4), phase: rand() * Math.PI * 2 });
  }
  const features = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => ({
    at: rand() * Math.PI * 2,
    width: 0.08 + rand() * 0.25,
    depth: (rand() < 0.6 ? -1 : 1) * (0.1 + rand() * 0.25),
  }));

  const profile = (theta: number, maxK: number) => {
    let r = 0;
    for (const h of harmonics) {
      if (h.k > maxK) break;
      r += h.amp * Math.sin(h.k * theta + h.phase);
    }
    for (const f of features) {
      let d = Math.abs(theta - f.at);
      d = Math.min(d, Math.PI * 2 - d);
      r += f.depth * Math.exp(-(d * d) / (2 * f.width * f.width));
    }
    return r;
  };

  const n = resolution;
  const raw = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    raw[i] = Math.max(0.25, 1 + roughness * profile((i / n) * Math.PI * 2, 96));
    sum += raw[i] * raw[i];
  }
  // Normalise so the shape's area matches a unit circle.
  const norm = 1 / Math.sqrt(sum / n);

  const points = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const r = raw[i] * norm;
    points[i * 2] = r * Math.sin(th);
    points[i * 2 + 1] = -r * Math.cos(th);
  }
  return { points };
}

/** The generated coastline as unit-scale points [x0, y0, x1, y1, …], without drawing. */
export function coastlinePoints(seed: number, opts: CoastOptions): Float32Array {
  return buildCoast(seed, opts).points;
}

function pathFrom(polygons: ArrayLike<number>[]): Path2D {
  const p = new Path2D();
  for (const pts of polygons) {
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) p.moveTo(pts[i], pts[i + 1]);
      else p.lineTo(pts[i], pts[i + 1]);
    }
    p.closePath();
  }
  return p;
}

/** A shape from given unit-scale coast polygons (e.g. a hand-drawn design). */
export function shapeFromPolygons(polygons: ArrayLike<number>[]): IslandShape {
  return { coast: pathFrom(polygons), points: Float32Array.from(polygons[0] ?? []) };
}
