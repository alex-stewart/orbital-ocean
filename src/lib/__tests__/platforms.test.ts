import { describe, expect, it } from 'vitest';
import calendarSource from '../../data/calendar.yaml?raw';
import worldSource from '../../data/world.yaml?raw';
import { parseCalendar } from '../calendar';
import { isletPosition, platformPositions, positionsAt } from '../orbits';
import { reach } from '../platforms';
import { parseWorld } from '../world';

const cal = parseCalendar(calendarSource);
const world = parseWorld(worldSource, cal);
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

describe('platforms', () => {
  it('generates thousands, deterministically, with unique register numbers', () => {
    expect(platforms.length).toBeGreaterThan(2000);
    expect(new Set(platforms.map((p) => p.id)).size).toBe(platforms.length);
    expect(platforms.every((p) => /^HPBE-[PX]-\d{5}$/.test(p.id))).toBe(true);
    const again = parseWorld(worldSource, cal).platforms;
    expect(again.map((p) => p.id + p.bearing)).toEqual(platforms.map((p) => p.id + p.bearing));
  });

  it('anchors most Home Band platforms and orbits most in the outer bands', () => {
    const share = (band: string) => {
      const inBand = platforms.filter((p) => p.band?.id === band);
      return inBand.filter((p) => p.motion === 'anchored').length / inBand.length;
    };
    expect(share('home')).toBeGreaterThan(0.5);
    expect(share('second')).toBeLessThan(0.5);
    expect(share('frontier')).toBeLessThan(0.5);
  });

  it('uses every kind of motion', () => {
    for (const m of ['anchored', 'lane', 'convoy', 'continent']) {
      expect(platforms.some((p) => p.motion === m)).toBe(true);
    }
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
