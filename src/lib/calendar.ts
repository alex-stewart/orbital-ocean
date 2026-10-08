import yaml from 'js-yaml';

export interface MonthDef {
  name: string;
  days: number;
  intercalary: boolean;
  /** Day-of-year (0-based) on which this month begins. */
  start: number;
}

export interface Calendar {
  eraName: string;
  eraAbbr: string;
  epochYear: number;
  months: MonthDef[];
  yearLength: number;
  weekdays: string[];
  defaultDay: number;
  startDay: number;
  endDay: number;
}

export interface WorldDate {
  year: number;
  /** 0-based index into calendar.months. */
  monthIndex: number;
  /** 1-based day within the month. */
  day: number;
  /** 0-based day of the year. */
  dayOfYear: number;
}

interface RawCalendar {
  era?: { name?: string; abbreviation?: string };
  epoch_year?: number;
  months: { name: string; days: number; intercalary?: boolean }[];
  weekdays?: string[];
  default_date?: { year: number; month?: number; day?: number };
  timeline?: { start_year?: number; end_year?: number };
}

export function parseCalendar(source: string): Calendar {
  const raw = yaml.load(source) as RawCalendar;
  if (!raw?.months?.length) throw new Error('calendar.yaml: `months` must list at least one month');

  let start = 0;
  const months: MonthDef[] = raw.months.map((m, i) => {
    if (!(m.days > 0) || !Number.isInteger(m.days)) {
      throw new Error(`calendar.yaml: month ${i + 1} (${m.name}) needs a whole, positive number of days`);
    }
    const def = { name: String(m.name), days: m.days, intercalary: !!m.intercalary, start };
    start += m.days;
    return def;
  });
  const yearLength = start;
  const epochYear = raw.epoch_year ?? 1;

  const partial = { epochYear, months, yearLength };
  const d = raw.default_date ?? { year: epochYear };
  const defaultDay = dateToDays(partial, d.year, (d.month ?? 1) - 1, d.day ?? 1);
  const startYear = raw.timeline?.start_year ?? d.year - 100;
  const endYear = raw.timeline?.end_year ?? d.year + 100;

  return {
    eraName: raw.era?.name ?? '',
    eraAbbr: raw.era?.abbreviation ?? '',
    epochYear,
    months,
    yearLength,
    weekdays: raw.weekdays ?? [],
    defaultDay,
    startDay: dateToDays(partial, startYear, 0, 1),
    endDay: dateToDays(partial, endYear + 1, 0, 1) - 1,
  };
}

type CalendarShape = Pick<Calendar, 'epochYear' | 'months' | 'yearLength'>;

/** Days since epoch for a calendar date. Out-of-range days carry over. */
export function dateToDays(cal: CalendarShape, year: number, monthIndex: number, day: number): number {
  const m = cal.months[Math.min(Math.max(monthIndex, 0), cal.months.length - 1)];
  return (year - cal.epochYear) * cal.yearLength + m.start + (day - 1);
}

/** Calendar date containing the (possibly fractional) day count `t`. */
export function daysToDate(cal: CalendarShape, t: number): WorldDate {
  const whole = Math.floor(t);
  const yearOffset = Math.floor(whole / cal.yearLength);
  const dayOfYear = whole - yearOffset * cal.yearLength;
  let monthIndex = cal.months.length - 1;
  for (let i = 0; i < cal.months.length; i++) {
    if (dayOfYear < cal.months[i].start + cal.months[i].days) {
      monthIndex = i;
      break;
    }
  }
  return {
    year: cal.epochYear + yearOffset,
    monthIndex,
    day: dayOfYear - cal.months[monthIndex].start + 1,
    dayOfYear,
  };
}

export function weekdayOf(cal: Calendar, t: number): string | null {
  if (!cal.weekdays.length) return null;
  const n = cal.weekdays.length;
  return cal.weekdays[((Math.floor(t) % n) + n) % n];
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatYear(cal: Calendar, year: number): string {
  return cal.eraAbbr ? `${year} ${cal.eraAbbr}` : String(year);
}

/** e.g. "14th of Month IV, 1012 CR". */
export function formatDate(cal: Calendar, t: number): string {
  const d = daysToDate(cal, t);
  const m = cal.months[d.monthIndex];
  return `${ordinal(d.day)} of ${m.name}, ${formatYear(cal, d.year)}`;
}

/** Duration in days → "3 yrs 41 days" style text in calendar units. */
export function formatDuration(cal: Calendar, days: number): string {
  if (days < cal.yearLength) return `${Math.round(days)} days`;
  const years = days / cal.yearLength;
  return `${years.toFixed(years < 10 ? 2 : 1)} years`;
}
