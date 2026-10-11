import { describe, expect, it } from 'vitest';
import { cal, loadWorld } from './world';
import { isletPosition, platformPositions, positionsAt } from '../orbits';
import { parsePlatforms, reach } from '../platforms';
import { continentMap, primeContinentMap } from '../terrain';
import { sitePlatforms } from '../seed';
import { planShipping } from '../shipping';

const world = loadWorld();
const { platforms } = world;
const continents = world.bodies.filter((b) => b.kind === 'isle');

describe('moons', () => {
  it('gives each continent between 0 and 3 moons', () => {
    for (const c of [world.central, ...continents]) expect(c.moons.length).toBeLessThanOrEqual(3);
    expect(world.bodies.filter((b) => b.kind === 'moon').length).toBeGreaterThan(10);
  });

  it("keeps each continent's swept ring clear of its neighbours and the belts", () => {
    const rings = [
      [0, reach(world.central)],
      ...continents.map((c) => [c.orbitRadius - reach(c), c.orbitRadius + reach(c)]),
      ...world.belts.map((b) => [b.innerRadius, b.outerRadius]),
    ].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < rings.length; i++) expect(rings[i][0]).toBeGreaterThan(rings[i - 1][1]);
    expect(rings[rings.length - 1][1]).toBeLessThan(world.oceanRadius);
  });
});

describe('siting platforms', () => {
  const sited = sitePlatforms(world, cal.yearLength);
  const rows = sited.rows;
  const P = world.params.platforms;

  it('sites the numbers asked for, with unique register numbers', () => {
    // Grand platforms exactly; keeps at least (more may be added to close gaps).
    expect(rows.filter((r) => r.class === 'grand').length).toBe(P.count.grand);
    expect(rows.filter((r) => r.class === 'keep').length).toBeGreaterThanOrEqual(P.count.keep);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => /^HPBE-[PX]-\d{5}$/.test(r.id))).toBe(true);
  });

  it('uses every kind of motion, and breaks no collision rule', () => {
    for (const m of ['anchored', 'lane', 'convoy', 'ring']) expect(rows.some((r) => r.motion === m), m).toBe(true);
    expect(sited.report.filter((l) => l.startsWith('warning'))).toEqual([]);
  });

  it('keeps wanted routes within resupply range', () => {
    const line = [...sited.report].reverse().find((l) => /within range|within resupply range/.test(l))!;
    expect(Number(line.match(/(\d+)%/)![1])).toBeGreaterThanOrEqual(85);
  });

  it('puts platforms where ships call: nearly all are used as stops over the years', () => {
    const parsed = parsePlatforms(rows, world.platformContent, P, {
      central: world.central,
      continents: world.bodies.filter((b) => b.kind === 'isle'),
      belts: world.belts,
      bands: world.bands,
      oceanRadius: world.oceanRadius,
    });
    const w = { ...world, platforms: parsed.platforms, platformIndex: new Map(parsed.platforms.map((p, i) => [p.id, i])), platformRules: parsed.rules };
    for (const b of world.bodies) primeContinentMap(w, b.id, continentMap(world, b));
    const used = new Set<string>();
    for (let k = 0; k < 16; k++) {
      const t = cal.defaultDay + k * 1300;
      const pos = positionsAt(w.bodies, t);
      for (const r of planShipping(w, t, pos, platformPositions(w.platforms, t, pos)).routes) r.stops.forEach((s) => used.add(s));
    }
    const resupply = w.platforms.filter((p) => p.owner.imperial);
    expect(resupply.filter((p) => used.has(p.id)).length / resupply.length).toBeGreaterThan(0.9);
  });
});

describe('platforms as listed', () => {
  it('load without problems, with unique register numbers', () => {
    expect(world.warnings.filter((w) => w.startsWith('HPBE') || w.startsWith('platforms'))).toEqual([]);
    expect(new Set(platforms.map((p) => p.id)).size).toBe(platforms.length);
  });

  it('never comes near a continent, moon, islet or another platform', () => {
    const clearance = world.platformRules!.clearance;
    const spacing = world.platformRules!.spacing;
    // Sample a span of dates, including ones long after the epoch.
    const times = Array.from({ length: 24 }, (_, i) => cal.defaultDay + i * 977.3);
    let xy: Float64Array | undefined;
    const problems: string[] = [];
    for (const t of times) {
      const bodies = positionsAt(world.bodies, t);
      xy = platformPositions(platforms, t, bodies, xy);

      for (let i = 0; i < platforms.length; i++) {
        const x = xy[i * 2];
        const y = xy[i * 2 + 1];
        const r = platforms[i].size.radius;
        for (const b of world.bodies) {
          const p = bodies.get(b.id)!;
          if (Math.hypot(p.x - x, p.y - y) - b.outerRadius - r <= clearance * 0.99)
            problems.push(`${platforms[i].id} vs ${b.id} on day ${t}`);
        }
        const fromCentre = Math.hypot(x, y);
        for (const belt of world.belts) {
          const outside = fromCentre < belt.innerRadius - clearance * 0.99 || fromCentre > belt.outerRadius + clearance * 0.99;
          if (!outside) problems.push(`${platforms[i].id} inside ${belt.id}`);
        }
        if (fromCentre >= world.oceanRadius) problems.push(`${platforms[i].id} beyond the ocean`);
      }

      // Platform–platform spacing, via a spatial hash.
      const cell = 2;
      const grid = new Map<string, number[]>();
      for (let i = 0; i < platforms.length; i++) {
        const key = `${Math.floor(xy[i * 2] / cell)},${Math.floor(xy[i * 2 + 1] / cell)}`;
        (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
      }
      for (let i = 0; i < platforms.length; i++) {
        const gx = Math.floor(xy[i * 2] / cell);
        const gy = Math.floor(xy[i * 2 + 1] / cell);
        for (let a = -1; a <= 1; a++)
          for (let b = -1; b <= 1; b++)
            for (const j of grid.get(`${gx + a},${gy + b}`) ?? []) {
              if (j <= i) continue;
              const d = Math.hypot(xy[i * 2] - xy[j * 2], xy[i * 2 + 1] - xy[j * 2 + 1]);
              const min = platforms[i].size.radius + platforms[j].size.radius + spacing * 0.99;
              if (d <= min) problems.push(`${platforms[i].id} vs ${platforms[j].id} on day ${t}`);
            }
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  }, 30_000);

  it('keeps islets of the belts away from platforms', () => {
    const t = cal.defaultDay + 5000;
    const xy = platformPositions(platforms, t, positionsAt(world.bodies, t));
    const problems: string[] = [];
    for (const belt of world.belts) {
      for (const islet of belt.islets.slice(0, 60)) {
        const q = isletPosition(islet, t);
        for (let i = 0; i < platforms.length; i++) {
          if (Math.hypot(q.x - xy[i * 2], q.y - xy[i * 2 + 1]) <= islet.radius) problems.push(platforms[i].id);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
