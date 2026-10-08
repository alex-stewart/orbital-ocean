import { describe, expect, it } from 'vitest';
import calendarSource from '../../data/calendar.yaml?raw';
import worldSource from '../../data/world.yaml?raw';
import { parseCalendar } from '../calendar';
import { bearingAt, bearingBetween, bodyPosition, polar, positionsAt } from '../orbits';
import { parseWorld } from '../world';

const cal = parseCalendar(calendarSource);
const world = parseWorld(worldSource, cal);

describe('orbits', () => {
  it('uses compass bearings: 0 is north (up), 90 is east (right)', () => {
    const n = polar(10, 0);
    const e = polar(10, 90);
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(-10);
    expect(e.x).toBeCloseTo(10);
    expect(e.y).toBeCloseTo(0);
    expect(bearingBetween({ x: 0, y: 0 }, e)).toBeCloseTo(90);
  });

  it('moves every body clockwise', () => {
    for (const b of world.bodies.filter((b) => b.parent)) {
      const a0 = bearingAt(b, 0);
      const a1 = bearingAt(b, b.periodDays / 8);
      expect((a1 - a0 + 360) % 360).toBeCloseTo(45);
    }
  });

  it('returns to the starting point after one period', () => {
    const isle = world.bodies.find((b) => b.kind === 'isle')!;
    const p0 = bodyPosition(isle, 0);
    const p1 = bodyPosition(isle, isle.periodDays);
    expect(p1.x).toBeCloseTo(p0.x, 6);
    expect(p1.y).toBeCloseTo(p0.y, 6);
  });

  it('places moons relative to their parent', () => {
    const t = 12345.6;
    const pos = positionsAt(world.bodies, t);
    for (const m of world.bodies.filter((b) => b.kind === 'moon')) {
      const a = pos.get(m.id)!;
      const p = pos.get(m.parent!.id)!;
      expect(Math.hypot(a.x - p.x, a.y - p.y)).toBeCloseTo(m.orbitRadius, 6);
    }
  });

  it('keeps the shipped world at the agreed scale', () => {
    // Central isle between Iceland (~103k km²) and Great Britain (~209k km²).
    const area = Math.PI * world.central.radius ** 2;
    expect(area).toBeGreaterThan(103_000);
    expect(area).toBeLessThan(209_000);
    // Outermost orbit about a quarter of Earth's circumference.
    const outer = Math.max(...world.bodies.map((b) => (b.kind === 'isle' ? b.orbitRadius : 0)));
    expect(outer).toBeGreaterThan(9_000);
    expect(outer).toBeLessThan(11_000);
  });
});
