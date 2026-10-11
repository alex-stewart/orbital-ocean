import { describe, expect, it } from 'vitest';
import { continentMap } from '../terrain';
import { loadWorld } from './world';

/**
 * The data files as they stand (seeded, then edited by hand or in the editor)
 * must make a sound world: the Atlas would still load, but these flag what an
 * edit broke. The editor shows the same warnings as you work.
 */
const world = loadWorld();

describe('the data files', () => {
  it('load without warnings', () => {
    expect(world.warnings).toEqual([]);
  });

  it('put every settlement on land, and every harbour on the shore', () => {
    const problems = world.bodies.flatMap((b) => continentMap(world, b).warnings.map((w) => `${b.id}: ${w}`));
    expect(problems).toEqual([]);
  });
});
