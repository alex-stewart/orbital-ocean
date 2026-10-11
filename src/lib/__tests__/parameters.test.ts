import { describe, expect, it } from 'vitest';
import { parameters } from '../../parameters';
import { parseParameters } from '../../parameters/schema';
import terrainSource from '../../parameters/terrain.yaml?raw';
import { seedPlaces } from '../seed';
import { continentMap } from '../terrain';
import { data, loadWorld } from './world';

const files = import.meta.glob('../../parameters/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sources = Object.fromEntries(Object.entries(files).map(([p, t]) => [p.replace(/^.*\/(.+)\.yaml$/, '$1'), t]));

describe('parameters', () => {
  it('loads and checks every file', () => {
    expect(Object.keys(parameters).sort()).toEqual(['belts', 'display', 'platforms', 'roads', 'settlements', 'shipping', 'terrain']);
  });

  it('names the file and key when something is missing or mistyped', () => {
    expect(() => parseParameters({ ...sources, terrain: terrainSource.replace(/river_share: [\d.]+/, 'river_share: lots') })).toThrow(
      'parameters/terrain.yaml.water.river_share should be a number',
    );
    const { shipping: _omit, ...rest } = sources;
    expect(() => parseParameters(rest)).toThrow('parameters/shipping.yaml is missing');
  });

  it('really drives seeding: changing a parameter changes what is seeded', () => {
    const base = loadWorld();
    const denser = loadWorld({}, { ...parameters, settlements: { ...parameters.settlements, density: { home: 30, second: 3.5, frontier: 1.4 } } });
    const c2 = (w: typeof base) => w.bodies.find((b) => b.id === 'continent-2')!;
    expect(seedPlaces(denser, c2(denser)).length).toBeGreaterThan(seedPlaces(base, c2(base)).length * 2);
    // A body's own setting wins over its band.
    const empty = loadWorld({}, { ...parameters, settlements: { ...parameters.settlements, bodies: { 'continent-2': { density: 0 } } } });
    expect(seedPlaces(empty, c2(empty))).toEqual([]);
  });

  it('and the data files are what the world is built from', () => {
    const world = loadWorld();
    expect(world.platforms.length).toBe(data.platforms.length);
    expect(continentMap(world, world.central).settlements.map((s) => s.name)).toEqual(data.places.get(world.central.id)!.map((p) => p.name));
    expect(world.archipelagos.length).toBe(Object.values(data.archipelagos).flat().length);
  });

  it('keeps tuning numbers out of the world data', () => {
    const world = Object.values(import.meta.glob('../../data/world.yaml', { query: '?raw', import: 'default', eager: true }))[0] as string;
    for (const key of ['density:', 'clearance:', 'share:', 'reveal:', 'mix:']) expect(world).not.toContain(key);
  });
});
