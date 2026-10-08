import { describe, expect, it } from 'vitest';
import calendarSource from '../../data/calendar.yaml?raw';
import { dateToDays, daysToDate, formatDate, parseCalendar } from '../calendar';

const cal = parseCalendar(`
era: { name: Test Era, abbreviation: TE }
epoch_year: 1
months:
  - { name: A, days: 10 }
  - { name: Feast, days: 2, intercalary: true }
  - { name: B, days: 8 }
default_date: { year: 5, month: 3, day: 4 }
timeline: { start_year: 1, end_year: 9 }
`);

describe('calendar', () => {
  it('sums month lengths into the year', () => {
    expect(cal.yearLength).toBe(20);
  });

  it('round-trips dates through day counts', () => {
    for (let t = -100; t < 200; t++) {
      const d = daysToDate(cal, t);
      expect(dateToDays(cal, d.year, d.monthIndex, d.day)).toBe(t);
    }
  });

  it('places day 0 on the first day of the epoch year', () => {
    expect(daysToDate(cal, 0)).toMatchObject({ year: 1, monthIndex: 0, day: 1 });
    expect(daysToDate(cal, -1)).toMatchObject({ year: 0, monthIndex: 2, day: 8 });
    expect(daysToDate(cal, 10.7)).toMatchObject({ year: 1, monthIndex: 1, day: 1 });
  });

  it('resolves the default date and timeline bounds', () => {
    expect(cal.defaultDay).toBe(4 * 20 + 12 + 3);
    expect(cal.startDay).toBe(0);
    expect(cal.endDay).toBe(9 * 20 - 1);
  });

  it('formats dates with the era', () => {
    expect(formatDate(cal, 11)).toBe('2nd of Feast, 1 TE');
    expect(formatDate(cal, 13)).toBe('2nd of B, 1 TE');
  });

  it('parses the shipped calendar file', () => {
    const real = parseCalendar(calendarSource);
    expect(real.yearLength).toBe(365);
    expect(real.startDay).toBeLessThan(real.defaultDay);
    expect(real.endDay).toBeGreaterThan(real.defaultDay);
  });
});
