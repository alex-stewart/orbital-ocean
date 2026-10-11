import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { parseCalendar } from '../src/lib/calendar';
import { parseDesign } from '../src/lib/terrain/design';
import { parseNames } from '../src/lib/terrain/names';
import { parseWorld, type PlaceRow } from '../src/lib/world';
import type { ArchipelagoRows } from '../src/lib/archipelagos';
import type { PlatformRow } from '../src/lib/platforms';
import { parseParameters } from '../src/parameters/schema';

/**
 * The world as the files on disk say right now (the seed script and the
 * editor's server read it fresh, since they change those files).
 */
export function readWorld(root: string) {
  const data = join(root, 'src/data');
  const read = (path: string) => readFileSync(join(data, path), 'utf8');
  const optional = <T>(path: string, empty: T): T => (existsSync(join(data, path)) ? ((yaml.load(read(path)) ?? empty) as T) : empty);
  const paramDir = join(root, 'src/parameters');
  const params = parseParameters(
    Object.fromEntries(
      readdirSync(paramDir)
        .filter((f) => f.endsWith('.yaml'))
        .map((f) => [f.replace(/\.yaml$/, ''), readFileSync(join(paramDir, f), 'utf8')]),
    ),
  );
  const list = (dir: string, ext: string) => (existsSync(join(data, dir)) ? readdirSync(join(data, dir)).filter((f) => f.endsWith(ext)) : []);
  const designs = new Map(list('continents', '.svg').map((f) => [f.replace(/\.svg$/, ''), parseDesign(read(`continents/${f}`), `continents/${f}`)]));
  const places = new Map(list('places', '.yaml').map((f) => [f.replace(/\.yaml$/, ''), (yaml.load(read(`places/${f}`)) ?? []) as PlaceRow[]]));
  const calendar = parseCalendar(read('calendar.yaml'));
  const world = parseWorld(read('world.yaml'), calendar, {
    params,
    names: parseNames(read('names.yaml')),
    designs,
    archipelagos: optional<ArchipelagoRows>('archipelagos.yaml', {}),
    platforms: optional<PlatformRow[]>('platforms.yaml', []),
    places,
  });
  return { world, calendar };
}
