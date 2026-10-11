import { describe, expect, it } from 'vitest';
import { positionsAt } from '../orbits';
import { traders } from '../seed/trade';
import { continentMap, mappedBodies } from '../terrain';
import { archipelagoFerries } from '../terrain/archipelago';
import { cal, seededWorld } from './world';

// Seeding is what these test; the shipped files are checked in data.test.ts.
const world = await seededWorld();
for (const b of mappedBodies(world)) continentMap(world, b);
const bp = world.params.belts;

describe('archipelagos', () => {
  it('fills each belt with named archipelagos', () => {
    for (const belt of world.belts) {
      expect(belt.archipelagos.length, belt.id).toBe(bp.archipelagos[belt.id]);
      for (const a of belt.archipelagos) {
        expect(a.name).toMatch(/\S/);
        expect(a.islands.length).toBeGreaterThanOrEqual(bp.islands_per_archipelago.min);
      }
    }
    const ids = world.bodies.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives each belt the land of one continent', () => {
    for (const belt of world.belts) {
      const area = belt.archipelagos.flatMap((a) => a.islands).reduce((s, i) => s + i.radius ** 2, 0);
      expect(Math.sqrt(area) / bp.mass_radius, belt.id).toBeGreaterThan(0.85);
      expect(Math.sqrt(area) / bp.mass_radius, belt.id).toBeLessThan(1.15);
    }
  });

  it('turns each archipelago as one, inside its belt, and never lets coasts touch', () => {
    for (const i of world.archipelagos.flatMap((a) => a.islands)) expect(i.outerRadius / i.radius).toBeLessThanOrEqual(bp.coast_reach);
    const islands = world.archipelagos.flatMap((a) => a.islands);
    for (const a of world.archipelagos) for (const i of a.islands) expect(i.periodDays).toBe(a.periodDays);
    for (const t of [0, cal.defaultDay, cal.defaultDay + 7.3 * cal.yearLength, 40 * cal.yearLength]) {
      const pos = positionsAt(world.bodies, t);
      for (const i of islands) {
        const r = Math.hypot(pos.get(i.id)!.x, pos.get(i.id)!.y);
        const belt = i.archipelago!.belt;
        expect(r - i.outerRadius).toBeGreaterThan(belt.innerRadius);
        expect(r + i.outerRadius).toBeLessThan(belt.outerRadius);
      }
      for (let a = 0; a < islands.length; a++)
        for (let b = a + 1; b < islands.length; b++) {
          const p = pos.get(islands[a].id)!;
          const q = pos.get(islands[b].id)!;
          expect(Math.hypot(p.x - q.x, p.y - q.y), `${islands[a].id}–${islands[b].id}`).toBeGreaterThan(islands[a].outerRadius + islands[b].outerRadius);
        }
    }
  });

  it('gives each belt about a continent\'s people, shared among its settled archipelagos', () => {
    for (const belt of world.belts) {
      const land = belt.archipelagos.flatMap((a) => a.islands).reduce((s, i) => s + Math.PI * i.radius ** 2, 0);
      const places = belt.archipelagos.flatMap((a) => a.islands).reduce((s, i) => s + continentMap(world, i).settlements.length, 0);
      const settled = belt.archipelagos.filter((a) => a.populated).length;
      expect(places, belt.id).toBe(Math.max(settled, Math.round((land / 10_000) * world.params.settlements.belt_density[belt.id])));
    }
  });

  it('settles archipelagos as clusters round a town or city, small ones like moons, and leaves the rest wild', () => {
    let clusters = 0;
    for (const a of world.archipelagos) {
      const places = a.islands.flatMap((i) => continentMap(world, i).settlements);
      if (!a.populated) {
        expect(places.length, a.id).toBe(0);
        continue;
      }
      expect(places.length, a.id).toBeGreaterThan(0);
      expect(places.some((s) => s.port), a.id).toBe(true);
      if (places.length < 3) continue;
      clusters++;
      expect(places.some((s) => s.kind !== 'village'), a.id).toBe(true);
      const settled = a.islands.filter((i) => continentMap(world, i).settlements.length);
      expect(settled.length, a.id).toBeGreaterThan(1);
    }
    expect(clusters).toBeGreaterThanOrEqual(4);
  });

  it('settles the War Belt more densely than the Far Belt', () => {
    const density = (id: string) => {
      const islands = world.archipelagos.filter((a) => a.belt.id === id).flatMap((a) => a.islands);
      const places = islands.reduce((s, i) => s + continentMap(world, i).settlements.length, 0);
      return places / islands.reduce((s, i) => s + i.radius ** 2, 0);
    };
    expect(density('war-belt')).toBeGreaterThan(density('far-belt'));
  });

  it('joins every settled island of an archipelago by ferry', () => {
    for (const a of world.archipelagos) {
      const settled = a.islands.filter((i) => continentMap(world, i).settlements.length);
      const ferries = archipelagoFerries(world, a);
      expect(ferries.length, a.id).toBe(Math.max(0, settled.length - 1));
      for (const f of ferries) expect(f.from.split('/')[0]).not.toBe(f.to.split('/')[0]);
    }
  });

  it('trades through one harbour per settled archipelago (when siting platforms)', () => {
    const list = traders(world, world.params.platforms.trade.weights);
    const arch = list.filter((p) => p.body.archipelago);
    expect(new Set(arch.map((p) => p.body.archipelago!.id)).size).toBe(arch.length);
    expect(arch.length).toBe(world.archipelagos.filter((a) => a.islands.some((i) => continentMap(world, i).settlements.some((s) => s.port))).length);
  });
});
