import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import worldSource from '../src/data/world.yaml?raw';
import { applyEdit, applyEdits } from './yaml-edit';

const places = `# Settlements on Mort.
# x/y: IL from the centre.

- {name: Wrusands, kind: city, x: 34.06, y: 45.71, harbour: true}
- {name: Zosmill, kind: town, x: 53.78, y: -25.07}
`;

describe('editing YAML in place', () => {
  it('changes one value and nothing else', () => {
    const out = applyEdit(worldSource, { file: 'data/world.yaml', op: 'set', path: ['orbitals', { id: 'mort' }, 'orbit_radius'], value: 4100 });
    const changed = out.split('\n').filter((l, i) => l !== worldSource.split('\n')[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatch(/orbit_radius: 4100/);
    expect((yaml.load(out) as { orbitals: { id: string; orbit_radius: number }[] }).orbitals.find((o) => o.id === 'mort')!.orbit_radius).toBe(4100);
  });

  it('adds a missing key under the others, keeping comments', () => {
    const out = applyEdit(worldSource, { file: 'data/world.yaml', op: 'set', path: ['orbitals', { id: 'mort' }, 'short_name'], value: 'Mt' });
    expect(out).toContain('#  THE ORBITAL OCEAN');
    expect((yaml.load(out) as { orbitals: { id: string; short_name?: string }[] }).orbitals.find((o) => o.id === 'mort')!.short_name).toBe('Mt');
  });

  it('moves, renames, adds and removes items in a list of {…} rows', () => {
    let out = applyEdits(places, [
      { file: 'p', op: 'set', path: [1, 'x'], value: 50 },
      { file: 'p', op: 'set', path: [0, 'name'], value: "St. Wru's" },
      { file: 'p', op: 'add', path: [], value: { name: 'Newby', kind: 'village', x: 1, y: 2 } },
      { file: 'p', op: 'delete', path: [0, 'harbour'] },
    ]);
    expect(out.startsWith('# Settlements on Mort.')).toBe(true);
    expect(yaml.load(out)).toEqual([
      { name: "St. Wru's", kind: 'city', x: 34.06, y: 45.71 },
      { name: 'Zosmill', kind: 'town', x: 50, y: -25.07 },
      { name: 'Newby', kind: 'village', x: 1, y: 2 },
    ]);
    out = applyEdit(out, { file: 'p', op: 'set', path: [{ name: 'Newby' }], value: { name: 'Newby', kind: 'town', x: 3, y: 4 } });
    expect((yaml.load(out) as { kind: string }[])[2].kind).toBe('town');
    out = applyEdits(out, [0, 0, 0].map(() => ({ file: 'p', op: 'delete' as const, path: [0] })));
    expect(yaml.load(out)).toEqual([]);
    out = applyEdit(out, { file: 'p', op: 'add', path: [], value: { name: 'Again', kind: 'village', x: 0, y: 0 } });
    expect(yaml.load(out)).toEqual([{ name: 'Again', kind: 'village', x: 0, y: 0 }]);
    expect(out).toContain('# x/y: IL from the centre.');
  });

  it('edits nested lists by id', () => {
    const src = `war-belt:\n  - id: a\n    name: A\n    islands:\n      - {id: i1, name: One, radius: 3, x: 1, y: 2}\n      - {id: i2, name: Two, radius: 2, x: 5, y: 6}\n`;
    const out = applyEdit(src, { file: 'a', op: 'set', path: ['war-belt', { id: 'a' }, 'islands', { id: 'i2' }, 'x'], value: 7.5 });
    expect((yaml.load(out) as Record<string, { islands: { x: number }[] }[]>)['war-belt'][0].islands[1].x).toBe(7.5);
  });

  it('refuses edits that cannot be found', () => {
    expect(() => applyEdit(places, { file: 'p', op: 'set', path: [{ name: 'Nowhere' }, 'x'], value: 1 })).toThrow(/no item/);
  });
});
