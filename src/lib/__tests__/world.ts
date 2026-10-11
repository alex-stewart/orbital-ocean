import calendarSource from '../../data/calendar.yaml?raw';
import namesSource from '../../data/names.yaml?raw';
import worldSource from '../../data/world.yaml?raw';
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

export function loadWorld(designs: Record<string, string> = {}, params: Parameters = parameters) {
  const parsed = new Map(Object.entries(designs).map(([id, svg]) => [id, parseDesign(svg, `continents/${id}.svg`)]));
  return parseWorld(worldSource, cal, { params, names, designs: parsed });
}
