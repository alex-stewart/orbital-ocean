import { rng } from './random';

export interface IslandShape {
  /** Coastline as a unit-scale closed path (mean radius ≈ 1). */
  coast: Path2D;
  /** Inland relief contours, outermost first. */
  contours: Path2D[];
  /** Raw coastline points [x0, y0, x1, y1, …], unit scale. */
  points: Float32Array;
}

interface Options {
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
export function generateIsland(seed: number, { roughness, resolution }: Options): IslandShape {
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
  const coast = new Path2D();
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const r = raw[i] * norm;
    const x = r * Math.sin(th);
    const y = -r * Math.cos(th);
    points[i * 2] = x;
    points[i * 2 + 1] = y;
    if (i === 0) coast.moveTo(x, y);
    else coast.lineTo(x, y);
  }
  coast.closePath();

  // Relief: smoother, shrunken copies offset towards a random "highland" centre.
  const cx = (rand() - 0.5) * 0.3;
  const cy = (rand() - 0.5) * 0.3;
  const contours = [0.62, 0.36, 0.16].map((level) => {
    const p = new Path2D();
    for (let i = 0; i < n; i += 2) {
      const th = (i / n) * Math.PI * 2;
      const r = Math.max(0.2, 1 + roughness * 0.8 * profile(th, 10)) * norm * level;
      const x = cx * (1 - level) + r * Math.sin(th);
      const y = cy * (1 - level) - r * Math.cos(th);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    p.closePath();
    return p;
  });

  return { coast, contours, points };
}
