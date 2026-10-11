import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatArchipelagos, formatPlaces, formatPlatforms, seedArchipelagos, seedPlaces, sitePlatforms } from '../src/lib/seed';
import type { Body, World } from '../src/lib/world';
import { readWorld } from './disk';

export type SeedStep = 'archipelagos' | 'places' | 'platforms' | 'all';
export const STEPS: SeedStep[] = ['archipelagos', 'places', 'platforms', 'all'];

/**
 * Regenerate data files from the generators and parameters. Overwrites what
 * it seeds (edits included), so it only runs when asked:
 *   archipelagos       every belt's archipelagos, and their islands' places
 *   places [ids…]      settlements on the given bodies, or archipelagos (arch:…), or all
 *   platforms          re-site every platform by route value
 *   all                all of the above, in that order
 * Returns what it did, line by line.
 */
export function seed(root: string, step: SeedStep, ids: string[] = []): string[] {
  const log: string[] = [];
  const data = join(root, 'src/data');
  const placesDir = join(data, 'places');
  mkdirSync(placesDir, { recursive: true });

  const writePlaces = (world: World, bodies: Body[]) => {
    let settled = 0;
    let count = 0;
    for (const body of bodies) {
      const rows = seedPlaces(world, body);
      const file = join(placesDir, `${body.id}.yaml`);
      if (rows.length) {
        writeFileSync(file, formatPlaces(body, rows));
        settled++;
        count += rows.length;
      } else if (existsSync(file)) rmSync(file);
    }
    log.push(`places: ${count} settlements on ${settled} of ${bodies.length} bodies`);
  };

  if (step === 'archipelagos' || step === 'all') {
    const before = readWorld(root).world;
    // The old islands' places go with them.
    for (const b of before.bodies) if (b.kind === 'islet' && existsSync(join(placesDir, `${b.id}.yaml`))) rmSync(join(placesDir, `${b.id}.yaml`));
    const rows = seedArchipelagos(before);
    writeFileSync(join(data, 'archipelagos.yaml'), formatArchipelagos(rows));
    const n = Object.values(rows).flat();
    log.push(`archipelagos: ${n.length} archipelagos, ${n.reduce((s, a) => s + a.islands.length, 0)} islands`);
    if (step === 'archipelagos') {
      const world = readWorld(root).world;
      writePlaces(world, world.bodies.filter((b) => b.kind === 'islet'));
    }
  }

  if (step === 'places' || step === 'all') {
    const world = readWorld(root).world;
    const wanted = step === 'all' || !ids.length
      ? world.bodies
      : ids.flatMap((id) => {
          const arch = world.archipelagos.find((a) => a.id === id || a.key === id);
          if (arch) return arch.islands;
          const body = world.bodies.find((b) => b.id === id);
          if (!body) throw new Error(`seed places: no body or archipelago "${id}"`);
          return [body];
        });
    writePlaces(world, wanted);
  }

  if (step === 'platforms' || step === 'all') {
    const { world, calendar } = readWorld(root);
    const { rows, report } = sitePlatforms(world, calendar.yearLength);
    writeFileSync(join(data, 'platforms.yaml'), formatPlatforms(rows));
    log.push(...report.map((l) => `platforms: ${l}`));
  }
  return log;
}
