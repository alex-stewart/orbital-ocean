import type { PlatformParams } from '../parameters/schema';
import { rng } from './random';
import type { Band, Belt, Body } from './world';

/**
 * Ocean platforms: thousands of small structures, generated from rules in
 * world.yaml rather than listed one by one.
 *
 * Collision safety comes from geometry, not simulation. Every continent sweeps
 * a ring about the centre (its orbit ± its own reach, moons included). Nothing
 * else may enter that ring except the continent's own satellites and convoys:
 *  - anchored platforms sit only in water outside every swept ring and lane;
 *  - lane platforms orbit the centre on radii in the gaps between rings, and
 *    platforms sharing a lane share its period, so they never close up;
 *  - convoy platforms ride a continent's own orbit, far enough ahead or behind
 *    to clear it and its moons, moving at its speed;
 *  - continent platforms orbit a continent on rings clear of its moons.
 */

export type PlatformMotion = 'anchored' | 'lane' | 'convoy' | 'continent';

export interface SizeClass {
  id: string;
  name: string;
  like: string | null;
  /** Radius, IL. */
  radius: number;
  /** Zoom (px per IL) at which the class is drawn as individual symbols. */
  reveal: number;
}

export interface Owner {
  id: string;
  name: string;
  code: string;
  imperial: boolean;
}

export interface Platform {
  /** Imperial register number, e.g. HPBE-P-01423. */
  id: string;
  motion: PlatformMotion;
  /** Body orbited (the central isle for lanes and convoys); null if anchored. */
  parent: Body | null;
  /** For convoys: the continent whose orbit is shared. */
  companion: Body | null;
  orbitRadius: number;
  bearing: number;
  periodDays: number;
  size: SizeClass;
  owner: Owner;
  band: Band | null;
}

export interface PlatformRules {
  clearance: number;
  spacing: number;
  sizes: SizeClass[];
  owners: Owner[];
  /** Orbital lanes about the centre, IL. */
  lanes: { radius: number; periodDays: number; band: Band | null }[];
  /** Platform rings about each continent, IL from the continent. */
  rings: Map<string, { radius: number; periodDays: number }[]>;
}

/** What platforms exist and are called (src/data/world.yaml). */
export interface PlatformContent {
  register: string;
  classes: { id: string; name: string; like: string | null }[];
  owners: { id: string; name: string; code: string; imperial: boolean }[];
}

/** Furthest any satellite of a body reaches from it, including the body itself. */
export function reach(b: Body, rings: { radius: number }[] = []): number {
  return Math.max(
    b.outerRadius,
    ...b.moons.map((m) => m.orbitRadius + m.outerRadius),
    ...rings.map((r) => r.radius),
  );
}

/** Pick an item with probability proportional to its weight. */
function weighted<T>(items: T[], weight: (t: T) => number, rand: () => number): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let u = rand() * total;
  for (const t of items) {
    u -= weight(t);
    if (u <= 0) return t;
  }
  return items[items.length - 1];
}

/** Sorted, merged complement of `blocked` intervals within [lo, hi]. */
function freeIntervals(blocked: [number, number][], lo: number, hi: number): [number, number][] {
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = lo;
  for (const [a, b] of sorted) {
    if (a > cur) out.push([cur, Math.min(a, hi)]);
    cur = Math.max(cur, b);
    if (cur >= hi) break;
  }
  if (cur < hi) out.push([cur, hi]);
  return out.filter(([a, b]) => b > a);
}

/** Smallest angular gap (degrees) between bearing b and any in the list. */
function angularGap(b: number, others: number[]): number {
  let min = 360;
  for (const o of others) {
    const d = Math.abs(((b - o + 540) % 360) - 180);
    min = Math.min(min, d);
  }
  return min;
}

export function generatePlatforms(
  content: PlatformContent | null,
  p: PlatformParams,
  ctx: {
    central: Body;
    continents: Body[];
    belts: Belt[];
    bands: Band[];
    oceanRadius: number;
  },
): { platforms: Platform[]; rules: PlatformRules | null } {
  if (!content) return { platforms: [], rules: null };
  const { central, continents, belts, bands, oceanRadius } = ctx;
  const rand = rng(p.seed);
  const { clearance, spacing } = p;
  // Join each class and owner (content) with its numbers (parameters).
  const sizes: (SizeClass & { share: number })[] = content.classes.map((c) => {
    const n = p.sizes[c.id];
    if (!n) throw new Error(`parameters/platforms.yaml: sizes.${c.id} is missing (class "${c.name}" in world.yaml)`);
    return { ...c, ...n };
  });
  const owners: (Owner & { share: number })[] = content.owners.map((o) => {
    const share = p.owners[o.id];
    if (share === undefined) throw new Error(`parameters/platforms.yaml: owners.${o.id} is missing (owner "${o.name}" in world.yaml)`);
    return { ...o, share };
  });
  if (!sizes.length || !owners.length) throw new Error('world.yaml: platform_classes and platform_owners must not be empty');
  const bandAt = (r: number) => bands.find((b) => r >= b.innerRadius && r < b.outerRadius) ?? null;

  // Orbital periods follow the continents' own law: P ∝ r^1.5.
  const refs = continents.filter((c) => Number.isFinite(c.periodDays));
  const k = refs.reduce((s, c) => s + c.periodDays / Math.pow(c.orbitRadius, 1.5), 0) / Math.max(1, refs.length);
  const centralPeriod = (r: number) => k * Math.pow(r, 1.5);
  // Moons set the law about a continent; fall back to ~30 days at 150 IL.
  const moons = continents.flatMap((c) => c.moons).concat(central.moons);
  const km = moons.length
    ? moons.reduce((s, m) => s + m.periodDays / Math.pow(m.orbitRadius, 1.5), 0) / moons.length
    : 30 / Math.pow(150, 1.5);
  const localPeriod = (r: number) => km * Math.pow(r, 1.5);

  // ── Rings about each continent, in the clear water between it and its moons.
  const rings = new Map<string, { radius: number; periodDays: number }[]>();
  for (const c of continents) {
    const blocked: [number, number][] = c.moons.map((m) => [
      m.orbitRadius - m.outerRadius - clearance,
      m.orbitRadius + m.outerRadius + clearance,
    ]);
    const lo = c.outerRadius + clearance;
    // A moonless continent keeps its platforms close, within ~1.3× its coast.
    const hi = c.moons.length ? reach(c) - clearance : c.outerRadius * p.moonless_ring_reach + clearance;
    const out: { radius: number; periodDays: number }[] = [];
    for (const [a, b] of freeIntervals(blocked, lo, hi)) {
      if (b - a < 4) continue;
      const r = Math.round((a + b) / 2);
      out.push({ radius: r, periodDays: localPeriod(r) });
    }
    rings.set(c.id, out);
  }

  // ── Swept rings about the centre, and the free water between them.
  const swept: [number, number][] = [[0, reach(central) + clearance]];
  for (const c of continents) {
    const r = reach(c, rings.get(c.id)) + clearance;
    swept.push([c.orbitRadius - r, c.orbitRadius + r]);
  }
  for (const b of belts) swept.push([b.innerRadius - clearance, b.outerRadius + clearance]);
  const gaps = freeIntervals(swept, 0, oceanRadius - clearance);

  // Lanes: up to three per gap, evenly spaced, each with clearance either side.
  const lanes: PlatformRules['lanes'] = [];
  for (const [a, b] of gaps) {
    const n = Math.min(p.lanes.max_per_gap, Math.floor((b - a) / (clearance * p.lanes.min_gap_in_clearances)));
    for (let i = 1; i <= n; i++) {
      const r = Math.round(a + ((b - a) * i) / (n + 1));
      lanes.push({ radius: r, periodDays: centralPeriod(r), band: bandAt(r) });
    }
  }
  // Anchored water: the gaps, minus each lane's corridor.
  const anchoredWater = gaps.flatMap(([a, b]) =>
    freeIntervals(
      lanes.filter((l) => l.radius > a && l.radius < b).map((l) => [l.radius - clearance, l.radius + clearance]),
      a,
      b,
    ),
  );

  const platforms: Omit<Platform, 'id'>[] = [];
  const pickSize = () => weighted(sizes, (s) => s.share, rand);
  const pickOwner = () => weighted(owners, (o) => o.share, rand);

  // Anchored platforms keep apart from each other via a coarse spatial hash.
  const cell = Math.max(spacing * 4, 1);
  const grid = new Map<string, { x: number; y: number; r: number }[]>();
  const fits = (x: number, y: number, r: number) => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const p of grid.get(`${gx + i},${gy + j}`) ?? [])
          if (Math.hypot(p.x - x, p.y - y) < p.r + r + spacing) return false;
    return true;
  };
  const occupy = (x: number, y: number, r: number) => {
    const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push({ x, y, r });
  };

  // Platforms sharing one circle (lane, convoy orbit, continent ring) keep
  // their spacing as an angle, since they all move together.
  const onCircle = new Map<string, number[]>();
  const maxRadius = Math.max(...sizes.map((s) => s.radius));
  const placeOnCircle = (key: string, radius: number, _size: SizeClass, bearing: number) => {
    const taken = onCircle.get(key) ?? [];
    // Neighbours of any size: allow for the largest class, measured as a chord.
    const gap = maxRadius * 2 + spacing;
    const minDeg = gap >= 2 * radius ? 360 : ((2 * Math.asin(gap / (2 * radius))) * 180) / Math.PI;
    if (angularGap(bearing, taken) < minDeg) return false;
    taken.push(bearing);
    onCircle.set(key, taken);
    return true;
  };

  const weights = p.orbital;

  for (const band of bands) {
    const rule = p.bands[band.id];
    if (!rule?.count) continue;
    const anchoredCount = Math.round(rule.count * rule.anchored);
    const water = anchoredWater
      .map(([a, b]) => [Math.max(a, band.innerRadius), Math.min(b, band.outerRadius)] as [number, number])
      .filter(([a, b]) => b > a);

    // Anchored: uniform by area across the band's anchored water.
    let placed = 0;
    for (let tries = 0; placed < anchoredCount && water.length && tries < anchoredCount * 50; tries++) {
      const [a, b] = weighted(water, ([a, b]) => b * b - a * a, rand);
      const r = Math.sqrt(a * a + rand() * (b * b - a * a));
      const bearing = rand() * 360;
      const size = pickSize();
      const x = r * Math.sin((bearing * Math.PI) / 180);
      const y = -r * Math.cos((bearing * Math.PI) / 180);
      if (!fits(x, y, size.radius)) continue;
      occupy(x, y, size.radius);
      platforms.push({
        motion: 'anchored',
        parent: null,
        companion: null,
        orbitRadius: r,
        bearing,
        periodDays: Infinity,
        size,
        owner: pickOwner(),
        band,
      });
      placed++;
    }

    // Orbital: split between lanes, convoys and continent rings in this band.
    const bandLanes = lanes.filter((l) => l.band?.id === band.id);
    const bandContinents = continents.filter((c) => bandAt(c.orbitRadius)?.id === band.id);
    const ringed = bandContinents.filter((c) => rings.get(c.id)!.length);
    const kinds = (['lane', 'convoy', 'continent'] as const).filter(
      (m) => (m === 'lane' ? bandLanes.length : m === 'convoy' ? bandContinents.length : ringed.length) > 0,
    );
    const orbitalCount = rule.count - placed;
    let done = 0;
    for (let tries = 0; done < orbitalCount && kinds.length && tries < orbitalCount * 50; tries++) {
      const motion = weighted([...kinds], (m) => weights[m] ?? 0, rand);
      const size = pickSize();
      const bearing = rand() * 360;
      let p: Omit<Platform, 'id'> | null = null;
      if (motion === 'lane') {
        const lane = weighted(bandLanes, (l) => l.radius, rand);
        if (placeOnCircle(`lane:${lane.radius}`, lane.radius, size, bearing))
          p = { motion, parent: central, companion: null, orbitRadius: lane.radius, bearing, periodDays: lane.periodDays, size, owner: pickOwner(), band };
      } else if (motion === 'convoy') {
        const c = bandContinents[Math.floor(rand() * bandContinents.length)];
        // Ahead or behind by at least the continent's full reach plus clearance,
        // measured as a straight line (the chord), not along the orbit.
        const gap = reach(c, rings.get(c.id)) + clearance * 2;
        const minOffset = gap >= 2 * c.orbitRadius ? 180 : ((2 * Math.asin(gap / (2 * c.orbitRadius))) * 180) / Math.PI;
        const offset = (rand() < 0.5 ? -1 : 1) * (minOffset + rand() * (180 - minOffset));
        const b = (((c.bearing + offset) % 360) + 360) % 360;
        if (minOffset < 180 && placeOnCircle(`convoy:${c.id}`, c.orbitRadius, size, b))
          p = { motion, parent: central, companion: c, orbitRadius: c.orbitRadius, bearing: b, periodDays: c.periodDays, size, owner: pickOwner(), band };
      } else {
        const c = ringed[Math.floor(rand() * ringed.length)];
        const ring = rings.get(c.id)![Math.floor(rand() * rings.get(c.id)!.length)];
        if (placeOnCircle(`ring:${c.id}:${ring.radius}`, ring.radius, size, bearing))
          p = { motion, parent: c, companion: null, orbitRadius: ring.radius, bearing, periodDays: ring.periodDays, size, owner: pickOwner(), band };
      }
      if (p) {
        platforms.push(p);
        done++;
      }
    }
  }

  // Register numbers: shuffled so numbering doesn't follow band or kind.
  const registry = content.register;
  const order = platforms.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const counters = new Map<string, number>();
  const withIds = new Array<Platform>(platforms.length);
  for (const i of order) {
    const code = platforms[i].owner.code;
    const n = (counters.get(code) ?? 0) + 1;
    counters.set(code, n);
    withIds[i] = { ...platforms[i], id: `${registry}-${code}-${String(n).padStart(5, '0')}` };
  }
  return {
    platforms: withIds,
    rules: { clearance, spacing, sizes, owners, lanes, rings },
  };
}
