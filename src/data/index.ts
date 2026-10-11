import { parameters } from '../parameters';
import { parseCalendar } from '../lib/calendar';
import { parseNames } from '../lib/terrain/names';
import { parseWorld, type World } from '../lib/world';
import calendarSource from './calendar.yaml?raw';
import namesSource from './names.yaml?raw';
import worldSource from './world.yaml?raw';

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
export const world = parseWorld(worldSource, calendar, { params: parameters, names: parseNames(namesSource), designs });

// Shapes a design skipped, and why — worth reading after editing a continent.
for (const [id, design] of world.designs) {
  for (const w of design.warnings) console.warn(`continents/${id}.svg: ${w}`);
}

// ── Live reload while editing (development only) ────────────────────────────
// Saving world.yaml, names.yaml, a parameter file or a continent design
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
