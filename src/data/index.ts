import yaml from 'js-yaml';
import { parameters } from '../parameters';
import { parseCalendar } from '../lib/calendar';
import { parseNames } from '../lib/terrain/names';
import { parseWorld, type World } from '../lib/world';
import calendarSource from './calendar.yaml?raw';
import namesSource from './names.yaml?raw';
import worldSource from './world.yaml?raw';
import archipelagosSource from './archipelagos.yaml?raw';
import platformsSource from './platforms.yaml?raw';
import type { ArchipelagoRows } from '../lib/archipelagos';
import type { PlatformRow } from '../lib/platforms';
import type { PlaceRow } from '../lib/world';

// Settlements, one file per body: src/data/places/<body id>.yaml
const placeFiles = import.meta.glob('./places/*.yaml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Hand-drawn continents: src/data/continents/<continent id>.svg
const designFiles = import.meta.glob('./continents/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const designSources = Object.entries(designFiles).map(([path, svg]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), svg] as const);

// The SVG reader (and its XML parser) is only downloaded when there are designs.
const designs = new Map(
  designSources.length
    ? await import('../lib/terrain/design').then(({ parseDesign }) =>
        designSources.map(([id, svg]) => [id, parseDesign(svg, `continents/${id}.svg`)] as const),
      )
    : [],
);

export const calendar = parseCalendar(calendarSource);
export const world = parseWorld(worldSource, calendar, {
  params: parameters,
  names: parseNames(namesSource),
  designs,
  archipelagos: (yaml.load(archipelagosSource) ?? {}) as ArchipelagoRows,
  platforms: (yaml.load(platformsSource) ?? []) as PlatformRow[],
  places: new Map(Object.entries(placeFiles).map(([path, text]) => [path.replace(/^.*\/(.+)\.yaml$/, '$1'), (yaml.load(text) ?? []) as PlaceRow[]])),
});

// Problems in the data (say, after a hand edit): the world loads regardless.
for (const w of world.warnings) console.warn(w);

// Shapes a design skipped, and why — worth reading after editing a continent.
for (const [id, design] of world.designs) {
  for (const w of design.warnings) console.warn(`continents/${id}.svg: ${w}`);
}

// ── Live reload while editing (development only) ────────────────────────────
// Saving any data file (world, archipelagos, platforms, places, names), a parameter file or a continent design
// re-runs this module, which rebuilds the world and hands it to whoever is
// listening (the open Atlas), without reloading the page.

type Listener = (w: World) => void;
const listeners: Set<Listener> = import.meta.hot?.data.listeners ?? new Set();
if (import.meta.hot) {
  import.meta.hot.data.listeners = listeners;
  import.meta.hot.accept((next) => {
    if (next) for (const l of listeners) l(next.world as World);
  });
}

/** Be told when the world is rebuilt after an edit (development only). */
export function onWorldReload(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
