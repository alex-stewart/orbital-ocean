import { rng } from '../random';
import { cellX, cellY, distanceTo, NEIGHBOURS, sample, type Grid } from './grid';
import type { Hydrology } from './hydrology';
import type { SettlementParams } from '../../parameters/schema';
import { nameMaker, type NameParts } from './names';

export type SettlementKind = 'city' | 'town' | 'village';

export interface Settlement {
  /** `<continent id>/<name slug>`; unique across the world. */
  id: string;
  name: string;
  kind: SettlementKind;
  /** Local position, IL from the continent's centre. */
  x: number;
  y: number;
  elevation: number;
  /** A harbour on the coast. */
  port: boolean;
  /** Stands on a river (and on a navigable stretch, if `riverPort`). */
  river: boolean;
  riverPort: boolean;
}

export interface SettlementRules {
  /** Settlements per 10,000 IL² of land. */
  density: number;
  /** The least this body may have: at least one place of this size. */
  minimum: SettlementKind;
  /** Exactly these numbers instead (belt islands, planned per archipelago). */
  exact?: Record<SettlementKind, number>;
  /** Islanders: everyone lives by the sea, and every place on the shore keeps boats. */
  islanders?: boolean;
}

/**
 * Settlements go where people would put them: low, gentle ground near
 * fresh water and the coast. Cities take the best sites first, then towns,
 * then villages fill in, each keeping its distance from the others.
 */
export function placeSettlements(
  seed: number,
  g: Grid,
  elevation: Float32Array,
  land: Uint8Array,
  water: Hydrology,
  maxElevation: number,
  rules: SettlementRules,
  p: SettlementParams,
  names: NameParts,
): Omit<Settlement, 'id'>[] {
  const { n } = g;
  const N = n * n;
  const rand = rng(seed * 31337 + 5);
  const landArea = land.reduce((s, v) => s + v, 0) * g.cell * g.cell;
  const total = Math.max(1, Math.round((landArea / 10_000) * rules.density));
  const wanted: Record<SettlementKind, number> = rules.exact ? { ...rules.exact } : {
    city: Math.round(total * p.mix.city),
    town: Math.round(total * p.mix.town),
    village: 0,
  };
  // Populous bodies have at least a city; every body has at least its minimum.
  if (!rules.exact) {
    if (total >= p.minimum.city_from) wanted.city = Math.max(1, wanted.city);
    if (rules.minimum === 'city') wanted.city = Math.max(1, wanted.city);
    if (rules.minimum === 'town' && wanted.city + wanted.town === 0) wanted.town = 1;
    wanted.village = Math.max(0, total - wanted.city - wanted.town);
  }

  const sea = new Uint8Array(N);
  const riverOrLake = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    sea[k] = land[k] ? 0 : 1;
    riverOrLake[k] = water.riverMask[k] || water.lake[k] >= 0 ? 1 : 0;
  }
  const toSea = distanceTo(g, sea);
  const toWater = distanceTo(g, riverOrLake);

  // Size of the dry-land region each cell belongs to (lakes divide land too),
  // so no one settles a speck that roads could never reach.
  const region = new Int32Array(N).fill(-1);
  const regionSize: number[] = [];
  const dry = (k: number) => land[k] === 1 && water.lake[k] < 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (!dry(k0) || region[k0] >= 0) continue;
    const id = regionSize.length;
    let size = 0;
    const stack = [k0];
    region[k0] = id;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const i = k % n;
      const j = (k / n) | 0;
      for (const [di, dj] of NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const m = jj * n + ii;
        if (region[m] < 0 && dry(m)) {
          region[m] = id;
          stack.push(m);
        }
      }
    }
    regionSize.push(size);
  }
  const minRegion = p.siting.min_region_cells;
  const st = p.siting;

  // Suitability per cell.
  const score = new Float32Array(N);
  const slopeAt = (k: number) => {
    const i = k % n;
    const j = (k / n) | 0;
    const x = cellX(g, i);
    const y = cellY(g, j);
    const dx = sample(g, elevation, x + g.cell, y) - sample(g, elevation, x - g.cell, y);
    const dy = sample(g, elevation, x, y + g.cell) - sample(g, elevation, x, y - g.cell);
    return Math.hypot(dx, dy) / (2 * g.cell * 1000);
  };
  for (let k = 0; k < N; k++) {
    if (!dry(k) || water.riverMask[k] || regionSize[region[k]] < minRegion) continue;
    const low = 1 - Math.min(1, elevation[k] / (maxElevation * 0.7));
    const flat = Math.exp(-slopeAt(k) / st.gentle_slope);
    const fresh = Math.exp(-toWater[k] / (g.cell * 3));
    const coast = Math.exp(-(toSea[k] - g.cell) / (g.cell * 2));
    // Fresh water and good farmland matter most; the coast helps, but only some
    // places sit right on the shore (those become the harbours). Islanders
    // live by the sea first.
    const shore = toSea[k] <= g.cell * 1.6 && !rules.islanders ? st.shore : 1;
    const seaward = rules.islanders ? 4 * st.coast : st.coast;
    score[k] = low * flat * shore * (st.base + st.fresh_water * fresh + seaward * coast) * (0.5 + 0.5 * rand());
  }

  const placed: (Omit<Settlement, 'id'> & { k: number })[] = [];
  const fits = (x: number, y: number, kind: SettlementKind) =>
    placed.every((q) => Math.hypot(q.x - x, q.y - y) >= Math.max(p.spacing[kind], p.spacing[q.kind]));
  const makeName = nameMaker(seed, names);
  const candidates = Array.from({ length: N }, (_, k) => k).filter((k) => score[k] > 0);

  for (const kind of ['city', 'town', 'village'] as SettlementKind[]) {
    // Best sites first for cities; towns and villages sample by score.
    const pool = [...candidates].sort((a, b) => score[b] - score[a]);
    let need = wanted[kind];
    const take = kind === 'city' ? pool : pool.slice(0, Math.max(need * 25, 50));
    const order = kind === 'city' ? take : take.map((k) => ({ k, w: Math.pow(rand(), 1 / (score[k] + 1e-6)) })).sort((a, b) => b.w - a.w).map((o) => o.k);
    for (const k of order) {
      if (need <= 0) break;
      const x = cellX(g, k % n) + (rand() - 0.5) * g.cell * 0.6;
      const y = cellY(g, (k / n) | 0) + (rand() - 0.5) * g.cell * 0.6;
      if (!fits(x, y, kind)) continue;
      const coastal = toSea[k] <= g.cell * (rules.islanders ? 3 : 1.6);
      const river = toWater[k] <= g.cell * 1.5;
      const high = elevation[k] > maxElevation * 0.35;
      // A river port sits by a navigable stretch.
      const riverPort =
        river &&
        water.rivers.some(
          (r) =>
            r.navigableFrom >= 0 &&
            r.points.some((_, v) => v % 2 === 0 && v / 2 >= r.navigableFrom && Math.hypot(r.points[v] - x, r.points[v + 1] - y) < g.cell * 2),
        );
      placed.push({
        k,
        name: makeName({ coastal, river, high }),
        kind,
        x,
        y,
        elevation: Math.round(elevation[k]),
        port: coastal && (kind !== 'village' || !!rules.islanders || rand() < p.village_harbour_chance),
        river,
        riverPort,
      });
      need--;
    }
  }
  return placed.map(({ k: _k, ...s }) => s);
}
