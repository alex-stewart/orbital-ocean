import calendarSource from '../../data/calendar.yaml?raw';
import namesSource from '../../data/names.yaml?raw';
import worldSource from '../../data/world.yaml?raw';
import archipelagosSource from '../../data/archipelagos.yaml?raw';
import platformsSource from '../../data/platforms.yaml?raw';
import yaml from 'js-yaml';
import type { ArchipelagoRows } from '../archipelagos';
import type { PlatformRow } from '../platforms';
import type { PlaceRow, WorldSources } from '../world';
import { parameters } from '../../parameters';
import type { Parameters } from '../../parameters/schema';
import { parseCalendar } from '../calendar';
import { parseNames } from '../terrain/names';
import { parseDesign } from '../terrain/design';
import { parseWorld } from '../world';

/** The shipped world, built exactly as the app builds it. */
export const cal = parseCalendar(calendarSource);
export const names = parseNames(namesSource);
export { worldSource };

const placeFiles = import.meta.glob('../../data/places/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** The shipped data files, parsed. */
export const data = {
  archipelagos: (yaml.load(archipelagosSource) ?? {}) as ArchipelagoRows,
  platforms: (yaml.load(platformsSource) ?? []) as PlatformRow[],
  places: new Map(Object.entries(placeFiles).map(([path, text]) => [path.replace(/^.*\/(.+)\.yaml$/, '$1'), (yaml.load(text) ?? []) as PlaceRow[]])),
};

export function loadWorld(designs: Record<string, string> = {}, params: Parameters = parameters, overrides: Partial<WorldSources> = {}) {
  const parsed = new Map(Object.entries(designs).map(([id, svg]) => [id, parseDesign(svg, `continents/${id}.svg`)]));
  return parseWorld(worldSource, cal, { params, names, designs: parsed, ...data, ...overrides });
}

/**
 * The world freshly seeded (archipelagos and settlements), for testing the
 * generators: the shipped files may have been edited since they were seeded.
 */
let seeded: Promise<ReturnType<typeof loadWorld>> | null = null;
export function seededWorld() {
  seeded ??= import('../seed').then(({ seedArchipelagos, seedPlaces }) => {
    const archipelagos = seedArchipelagos(loadWorld());
    const bare = loadWorld({}, parameters, { archipelagos });
    return loadWorld({}, parameters, { archipelagos, places: new Map(bare.bodies.map((b) => [b.id, seedPlaces(bare, b)])) });
  });
  return seeded;
}
