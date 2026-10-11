import { describe, expect, it } from 'vitest';
import { parameters } from '../../parameters';
import { parseParameters } from '../../parameters/schema';
import terrainSource from '../../parameters/terrain.yaml?raw';
import { loadWorld } from './world';

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

  it('really drives the world: changing a parameter changes the result', () => {
    const base = loadWorld();
    const denser = loadWorld({}, { ...parameters, settlements: { ...parameters.settlements, density: { home: 30, second: 3.5, frontier: 1.4 } } });
    expect(denser.platforms.length).toBe(base.platforms.length);
    // (settlements are built lazily per body; compare one)
    return import('../terrain').then(({ continentMap }) => {
      const a = continentMap(base, base.central).settlements.length;
      const b = continentMap(denser, denser.central).settlements.length;
      expect(b).toBeGreaterThan(a * 2);
    });
  });

  it('keeps tuning numbers out of the world data', () => {
    const world = Object.values(import.meta.glob('../../data/world.yaml', { query: '?raw', import: 'default', eager: true }))[0] as string;
    for (const key of ['density:', 'clearance:', 'share:', 'reveal:', 'mix:']) expect(world).not.toContain(key);
  });
});
