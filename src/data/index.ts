import { parseCalendar } from '../lib/calendar';
import { parseWorld } from '../lib/world';
import calendarSource from './calendar.yaml?raw';
import worldSource from './world.yaml?raw';

export const calendar = parseCalendar(calendarSource);
export const world = parseWorld(worldSource, calendar);
