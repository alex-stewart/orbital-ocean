import type { Band, Belt, Body } from './world';

/**
 * Ocean platforms: the Empire's grand platforms and keeps, and a few held by
 * others. They are listed one by one in src/data/platforms.yaml, sited by
 * `npm run seed -- platforms` (see seed/platforms.ts) and then edited freely.
 *
 * Collision safety comes from geometry, not simulation. Every continent sweeps
 * a ring about the centre (its orbit ± its own reach, moons and platform rings
 * included). Nothing else may enter that ring except the continent's own
 * satellites and convoys:
 *  - anchored platforms sit only in water outside every swept ring, belt and lane;
 *  - lane platforms orbit the centre on radii in the gaps between rings, and
 *    platforms sharing a lane share its period, so they never close up;
 *  - convoy platforms ride a continent's own orbit, far enough ahead or behind
 *    to clear it and its moons, moving at its speed;
 *  - ring platforms orbit a continent on rings clear of its moons.
 * `checkPlatforms` reports any platform that breaks these rules (after an edit).
 */

export type PlatformMotion = 'anchored' | 'lane' | 'convoy' | 'ring';

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
  /** Bearing about the parent at day 0 (anchored: fixed bearing from the centre). */
  bearing: number;
  periodDays: number;
  size: SizeClass;
  owner: Owner;
  band: Band | null;
}

/** A platform as written in src/data/platforms.yaml. */
export interface PlatformRow {
  id: string;
  class: string;
  owner: string;
  motion: PlatformMotion;
  /** Anchored: distance from the centre. Lane: the lane's radius. Ring: distance from `around`. */
  radius?: number;
  /** Anchored and lane: bearing from the centre (at day 0 for lanes). Ring: bearing from `around` at day 0. */
  bearing?: number;
  /** Convoy: the continent whose orbit it shares. */
  with?: string;
  /** Convoy: degrees ahead of (+) or behind (−) that continent. */
  offset?: number;
  /** Ring: the continent it orbits. */
  around?: string;
}

export interface PlatformRules {
  clearance: number;
  spacing: number;
  sizes: SizeClass[];
  owners: Owner[];
  /** Orbital lanes about the centre in use, IL. */
  lanes: { radius: number; periodDays: number; band: Band | null }[];
  /** Platform rings about each continent in use, IL from the continent. */
  rings: Map<string, { radius: number; periodDays: number }[]>;
}

/** What platforms exist and are called (src/data/world.yaml). */
export interface PlatformContent {
  register: string;
  classes: { id: string; name: string; like: string | null }[];
  owners: { id: string; name: string; code: string; imperial: boolean }[];
}

export interface OceanLayout {
  central: Body;
  continents: Body[];
  belts: Belt[];
  bands: Band[];
  oceanRadius: number;
}

/** Furthest any satellite of a body reaches from it, including the body itself. */
export function reach(b: Body, rings: { radius: number }[] = []): number {
  return Math.max(
    b.outerRadius,
    ...b.moons.map((m) => m.orbitRadius + m.outerRadius),
    ...rings.map((r) => r.radius),
  );
}

/** Orbital periods for new orbits: P ∝ r^1.5, fitted to the continents (about the centre) and moons (about a continent). */
export function orbitLaws(layout: Pick<OceanLayout, 'central' | 'continents'>) {
  const refs = layout.continents.filter((c) => Number.isFinite(c.periodDays));
  const k = refs.reduce((s, c) => s + c.periodDays / Math.pow(c.orbitRadius, 1.5), 0) / Math.max(1, refs.length);
  const moons = layout.continents.flatMap((c) => c.moons).concat(layout.central.moons);
  const km = moons.length ? moons.reduce((s, m) => s + m.periodDays / Math.pow(m.orbitRadius, 1.5), 0) / moons.length : 30 / Math.pow(150, 1.5);
  return { central: (r: number) => k * Math.pow(r, 1.5), local: (r: number) => km * Math.pow(r, 1.5) };
}

/** Sorted, merged complement of `blocked` intervals within [lo, hi]. */
export function freeIntervals(blocked: [number, number][], lo: number, hi: number): [number, number][] {
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

/** Where about a continent a platform ring may run: clear of the coast and of each moon's path. */
export function ringWater(c: Body, clearance: number, moonlessReach: number): [number, number][] {
  const blocked: [number, number][] = c.moons.map((m) => [m.orbitRadius - m.outerRadius - clearance, m.orbitRadius + m.outerRadius + clearance]);
  const lo = c.outerRadius + clearance;
  // A moonless continent keeps its platforms close, within ~1.3× its coast.
  const hi = c.moons.length ? reach(c) - clearance : c.outerRadius * moonlessReach + clearance;
  return freeIntervals(blocked, lo, hi);
}

/**
 * Rings about the centre swept by moving things (continents with their moons
 * and rings, the belts), and the clear water between them.
 */
export function sweptRings(layout: OceanLayout, rings: Map<string, { radius: number }[]>, clearance: number) {
  const swept: [number, number][] = [[0, reach(layout.central) + clearance]];
  for (const c of layout.continents) {
    const r = reach(c, rings.get(c.id)) + clearance;
    swept.push([c.orbitRadius - r, c.orbitRadius + r]);
  }
  for (const b of layout.belts) swept.push([b.innerRadius - clearance, b.outerRadius + clearance]);
  return { swept, gaps: freeIntervals(swept, 0, layout.oceanRadius - clearance) };
}

/** Smallest angle (degrees) by which a convoy must lead or trail its continent to clear it. */
export function convoyMinOffset(c: Body, rings: { radius: number }[], clearance: number): number {
  const gap = reach(c, rings) + clearance * 2;
  return gap >= 2 * c.orbitRadius ? 180 : ((2 * Math.asin(gap / (2 * c.orbitRadius))) * 180) / Math.PI;
}

/** Join size classes and owners (world.yaml) with their numbers (parameters). */
export function platformKinds(content: PlatformContent, sizes: Record<string, { radius: number; reveal: number }>): { sizes: SizeClass[]; owners: Owner[] } {
  const out = content.classes.map((c) => {
    const n = sizes[c.id];
    if (!n) throw new Error(`parameters/platforms.yaml: sizes.${c.id} is missing (class "${c.name}" in world.yaml)`);
    return { ...c, radius: n.radius, reveal: n.reveal };
  });
  return { sizes: out, owners: content.owners.map((o) => ({ ...o })) };
}

/** Read platforms.yaml rows into platforms; problems with a row are reported, and the row skipped. */
export function parsePlatforms(
  rows: PlatformRow[],
  content: PlatformContent | null,
  params: { clearance: number; spacing: number; sizes: Record<string, { radius: number; reveal: number }> },
  layout: OceanLayout,
): { platforms: Platform[]; rules: PlatformRules | null; warnings: string[] } {
  const warnings: string[] = [];
  if (!content) return { platforms: [], rules: null, warnings };
  const { sizes, owners } = platformKinds(content, params.sizes);
  const laws = orbitLaws(layout);
  const bandAt = (r: number) => layout.bands.find((b) => r >= b.innerRadius && r < b.outerRadius) ?? null;
  const continent = (id: string | undefined) => (id ? layout.continents.find((c) => c.id === id) : undefined);
  const seen = new Set<string>();
  const platforms: Platform[] = [];
  for (const row of rows) {
    const where = `platforms.yaml: ${row.id ?? '(no id)'}`;
    const size = sizes.find((s) => s.id === row.class);
    const owner = owners.find((o) => o.id === row.owner);
    if (!row.id || seen.has(row.id)) {
      warnings.push(`${where}: missing or repeated register number`);
      continue;
    }
    if (!size || !owner) {
      warnings.push(`${where}: unknown ${size ? 'owner' : 'class'} "${size ? row.owner : row.class}"`);
      continue;
    }
    seen.add(row.id);
    const base = { id: row.id, size, owner };
    if (row.motion === 'anchored' || row.motion === 'lane') {
      const r = row.radius ?? 0;
      platforms.push({
        ...base,
        motion: row.motion,
        parent: row.motion === 'lane' ? layout.central : null,
        companion: null,
        orbitRadius: r,
        bearing: row.bearing ?? 0,
        periodDays: row.motion === 'lane' ? laws.central(r) : Infinity,
        band: bandAt(r),
      });
    } else if (row.motion === 'convoy') {
      const c = continent(row.with);
      if (!c) {
        warnings.push(`${where}: convoy needs \`with:\` a continent id`);
        continue;
      }
      platforms.push({
        ...base,
        motion: 'convoy',
        parent: layout.central,
        companion: c,
        orbitRadius: c.orbitRadius,
        bearing: (((c.bearing + (row.offset ?? 0)) % 360) + 360) % 360,
        periodDays: c.periodDays,
        band: bandAt(c.orbitRadius),
      });
    } else if (row.motion === 'ring') {
      const c = continent(row.around);
      if (!c) {
        warnings.push(`${where}: ring needs \`around:\` a continent id`);
        continue;
      }
      const r = row.radius ?? 0;
      platforms.push({
        ...base,
        motion: 'ring',
        parent: c,
        companion: null,
        orbitRadius: r,
        bearing: row.bearing ?? 0,
        periodDays: laws.local(r),
        band: bandAt(c.orbitRadius),
      });
    } else {
      warnings.push(`${where}: unknown motion "${row.motion}" (anchored, lane, convoy or ring)`);
    }
  }

  const lanes = [...new Set(platforms.filter((p) => p.motion === 'lane').map((p) => p.orbitRadius))]
    .sort((a, b) => a - b)
    .map((radius) => ({ radius, periodDays: laws.central(radius), band: bandAt(radius) }));
  const rings = new Map<string, { radius: number; periodDays: number }[]>();
  for (const p of platforms)
    if (p.motion === 'ring') {
      const list = rings.get(p.parent!.id) ?? [];
      if (!list.some((r) => r.radius === p.orbitRadius)) list.push({ radius: p.orbitRadius, periodDays: p.periodDays });
      rings.set(p.parent!.id, list);
    }
  const rules: PlatformRules = { clearance: params.clearance, spacing: params.spacing, sizes, owners, lanes, rings };
  warnings.push(...checkPlatforms(platforms, rules, layout));
  return { platforms, rules, warnings };
}

/** Platforms that break the collision rules (see the top of this file), described. */
export function checkPlatforms(platforms: Platform[], rules: PlatformRules, layout: OceanLayout): string[] {
  const out: string[] = [];
  const { clearance, spacing } = rules;
  const { swept } = sweptRings(layout, rules.rings, clearance);
  /** What sweeps the ring of water at distance r from the centre, if anything. */
  const sweeper = (r: number): string | null => {
    if (!swept.some(([a, b]) => r > a && r < b)) return null;
    if (r < reach(layout.central) + clearance) return layout.central.name;
    const c = layout.continents.find((c) => Math.abs(c.orbitRadius - r) < reach(c, rules.rings.get(c.id)) + clearance);
    return c?.name ?? layout.belts.find((b) => r > b.innerRadius - clearance && r < b.outerRadius + clearance)?.name ?? 'something';
  };

  for (const p of platforms) {
    const tag = `${p.id} (${p.motion})`;
    if (p.motion === 'anchored' || p.motion === 'lane') {
      const r = p.orbitRadius;
      const hit = sweeper(r);
      if (hit) out.push(`${tag} is in the path of ${hit}`);
      else if (r + p.size.radius >= layout.oceanRadius - clearance) out.push(`${tag} is beyond the ocean's edge`);
      if (p.motion === 'anchored') {
        const lane = rules.lanes.find((l) => Math.abs(l.radius - r) < clearance);
        if (lane) out.push(`${tag} is within ${clearance} IL of the ${lane.radius} IL lane`);
      }
    } else if (p.motion === 'convoy') {
      const c = p.companion!;
      const min = convoyMinOffset(c, rules.rings.get(c.id) ?? [], clearance);
      const off = Math.abs(((p.bearing - c.bearing + 540) % 360) - 180);
      if (off < min) out.push(`${tag} rides within ${Math.round(off)}° of ${c.name}; keep at least ${Math.ceil(min)}° ahead or behind`);
    } else {
      const c = p.parent!;
      const r = p.orbitRadius;
      // Rings may reach past the moons (they widen the continent's swept ring); only the coast and moon paths are off limits.
      const nearMoon = c.moons.find((m) => Math.abs(m.orbitRadius - r) < m.outerRadius + clearance);
      if (r < c.outerRadius + clearance) out.push(`${tag} orbits too close to ${c.name}'s coast`);
      else if (nearMoon) out.push(`${tag} crosses the path of ${nearMoon.name}`);
    }
  }

  // Neighbours on one circle keep an angle apart (they move together); anchored ones a distance.
  const circles = new Map<string, Platform[]>();
  for (const p of platforms) {
    const key = p.motion === 'anchored' ? 'anchored' : p.motion === 'convoy' ? `convoy:${p.companion!.id}` : `${p.motion}:${p.parent!.id}:${p.orbitRadius}`;
    (circles.get(key) ?? circles.set(key, []).get(key)!).push(p);
  }
  for (const [key, list] of circles) {
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let d: number;
        if (key === 'anchored') {
          const ra = (a.bearing * Math.PI) / 180;
          const rb = (b.bearing * Math.PI) / 180;
          d = Math.hypot(a.orbitRadius * Math.sin(ra) - b.orbitRadius * Math.sin(rb), a.orbitRadius * Math.cos(ra) - b.orbitRadius * Math.cos(rb));
        } else {
          const ang = (Math.abs(((a.bearing - b.bearing + 540) % 360) - 180) * Math.PI) / 180;
          d = 2 * a.orbitRadius * Math.sin(ang / 2);
        }
        if (d < a.size.radius + b.size.radius + spacing) out.push(`${a.id} and ${b.id} are within ${spacing} IL of each other`);
      }
  }
  return out;
}
