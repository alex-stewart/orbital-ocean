import { parseCalendar } from '../lib/calendar';
import { parseWorld } from '../lib/world';
import calendarSource from './calendar.yaml?raw';
import worldSource from './world.yaml?raw';

// Hand-drawn continents: src/data/continents/<continent id>.svg
const designFiles = import.meta.glob('./continents/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const designs = Object.fromEntries(
  Object.entries(designFiles).map(([path, svg]) => [path.replace(/^.*\/(.+)\.svg$/, '$1'), svg]),
);

export const calendar = parseCalendar(calendarSource);
export const world = parseWorld(worldSource, calendar, designs);

// Shapes a design skipped, and why — worth reading after editing a continent.
for (const [id, design] of world.designs) {
  for (const w of design.warnings) console.warn(`continents/${id}.svg: ${w}`);
}
