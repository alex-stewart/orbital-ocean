import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { applyEdits } from '../../../../scripts/yaml-edit';
import type { EditRequest } from '../../../lib/editing';
import { bearingAt, polar, positionsAt, type Point } from '../../../lib/orbits';
import type { ArchipelagoRows } from '../../../lib/archipelagos';
import type { PlatformRow } from '../../../lib/platforms';
import { findSettlement } from '../../../lib/terrain';
import { parseWorld, type PlaceRow, type World } from '../../../lib/world';
import { cal, names, worldSource } from '../../../lib/__tests__/world';
import archipelagosSource from '../../../data/archipelagos.yaml?raw';
import platformsSource from '../../../data/platforms.yaml?raw';
import { parameters } from '../../../parameters';
import { addEdits, deleteEdits, moveEdits, positionOf } from './edits';

/** The data files as text, which edits change and the world is rebuilt from. */
const placeFiles = import.meta.glob('../../../data/places/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
type Files = Map<string, string>;
const original: Files = new Map([
  ['data/world.yaml', worldSource],
  ['data/archipelagos.yaml', archipelagosSource],
  ['data/platforms.yaml', platformsSource],
  ...Object.entries(placeFiles).map(([p, t]) => [`data/places/${p.split('/').pop()}`, t] as [string, string]),
]);

function build(files: Files): World {
  const places = new Map<string, PlaceRow[]>();
  for (const [f, t] of files) if (f.startsWith('data/places/')) places.set(f.slice(12, -5), (yaml.load(t) ?? []) as PlaceRow[]);
  return parseWorld(files.get('data/world.yaml')!, cal, {
    params: parameters,
    names,
    archipelagos: yaml.load(files.get('data/archipelagos.yaml')!) as ArchipelagoRows,
    platforms: yaml.load(files.get('data/platforms.yaml')!) as PlatformRow[],
    places,
  });
}

function apply(files: Files, req: EditRequest | null): Files {
  expect(req).not.toBeNull();
  const out = new Map(files);
  for (const e of req!.edits) out.set(e.file, applyEdits(out.get(e.file) ?? e.create!, [e]));
  return out;
}

const world = build(original);
const t = cal.defaultDay + 123.4;
const near = (a: Point | null, b: Point, tol = 0.15) => {
  expect(a).not.toBeNull();
  expect(Math.hypot(a!.x - b.x, a!.y - b.y)).toBeLessThan(tol);
};

describe('the editor', () => {
  it('moves a settlement to where it is dropped', () => {
    const body = world.bodies.find((b) => b.id === 'mort')!;
    const s = (world.places.get('mort') ?? [])[0];
    const sid = `mort/${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const at = { x: positionsAt(world.bodies, t).get(body.id)!.x + s.x + 5, y: positionsAt(world.bodies, t).get(body.id)!.y + s.y + 3 };
    const next = build(apply(original, moveEdits(world, sid, at, t)));
    near(positionOf(next, sid, t), at, 0.02);
  });

  it('moves platforms of every motion to where they are dropped', () => {
    for (const motion of ['anchored', 'lane', 'ring'] as const) {
      const p = world.platforms.find((q) => q.motion === motion)!;
      const from = positionOf(world, p.id, t)!;
      const at = { x: from.x + 7, y: from.y - 4 };
      near(positionOf(build(apply(original, moveEdits(world, p.id, at, t))), p.id, t), at, 1);
    }
    // A convoy keeps to its continent's orbit: drop it on the orbit, further round.
    const c = world.platforms.find((q) => q.motion === 'convoy')!;
    const at = polar(c.companion!.orbitRadius, bearingAt(c, t) + 15);
    near(positionOf(build(apply(original, moveEdits(world, c.id, at, t))), c.id, t), at, 1);
  });

  it('moves continents, moons, archipelagos and their islands', () => {
    const pos = positionsAt(world.bodies, t);
    const mort = world.bodies.find((b) => b.id === 'mort')!;
    let at = polar(4120, bearingAt(mort, t) + 3);
    near(positionOf(build(apply(original, moveEdits(world, 'mort', at, t))), 'mort', t), at, 1);

    const moon = mort.moons[0];
    at = { x: pos.get('mort')!.x + 30, y: pos.get('mort')!.y - 150 };
    near(positionOf(build(apply(original, moveEdits(world, moon.id, at, t))), moon.id, t), at, 1);

    const arch = world.archipelagos[0];
    const island = arch.islands[1];
    at = { x: pos.get(island.id)!.x + 3, y: pos.get(island.id)!.y - 2 };
    near(positionOf(build(apply(original, moveEdits(world, island.id, at, t))), island.id, t), at, 0.05);

    at = polar(arch.orbitRadius + 5, bearingAt(arch, t) - 2);
    near(positionOf(build(apply(original, moveEdits(world, arch.id, at, t))), arch.id, t), at, 0.2);
  });

  it('adds and deletes places and platforms', () => {
    const pos = positionsAt(world.bodies, t);
    const centre = pos.get(world.central.id)!;
    // Somewhere on the Land of the Large's dry land: next to one of its towns.
    const town = world.places.get(world.central.id)!.find((s) => s.kind === 'town')!;
    const at = { x: centre.x + town.x + 1.5, y: centre.y + town.y + 1 };
    const added = addEdits(world, 'village', at, t);
    if ('error' in added) throw new Error(added.error);
    const w2 = build(apply(original, added.request));
    near(positionOf(w2, added.id, t), at, 0.02);
    expect(findSettlement(w2, added.id)!.settlement.kind).toBe('village');
    const w3 = build(apply(apply(original, added.request), deleteEdits(w2, added.id)));
    expect(findSettlement(w3, added.id)).toBeNull();

    const sea = polar(1500, 10);
    const pf = addEdits(world, 'keep', sea, t);
    if ('error' in pf) throw new Error(pf.error);
    const w4 = build(apply(original, pf.request));
    near(positionOf(w4, pf.id, t), sea, 0.2);
    expect(w4.platforms.length).toBe(world.platforms.length + 1);
    expect(addEdits(world, 'village', sea, t)).toHaveProperty('error');
  });
});
