import calendarSource from '../../data/calendar.yaml?raw';
import namesSource from '../../data/names.yaml?raw';
import worldSource from '../../data/world.yaml?raw';
import { parameters } from '../../parameters';
import type { Parameters } from '../../parameters/schema';
import { parseCalendar } from '../calendar';
import { parseNames } from '../terrain/names';
import { parseWorld } from '../world';

/** The shipped world, built exactly as the app builds it. */
export const cal = parseCalendar(calendarSource);
export const names = parseNames(namesSource);
export { worldSource };

export function loadWorld(designs: Record<string, string> = {}, params: Parameters = parameters) {
  return parseWorld(worldSource, cal, { params, names, designs });
}
