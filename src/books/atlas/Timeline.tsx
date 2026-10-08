import { useMemo, useState } from 'react';
import { dateToDays, daysToDate, formatYear, ordinal, weekdayOf, type Calendar } from '../../lib/calendar';

interface Props {
  calendar: Calendar;
  t: number;
  onChange(t: number): void;
  playing: boolean;
  onPlayingChange(p: boolean): void;
  /** Days advanced per second of playback. */
  speed: number;
  onSpeedChange(s: number): void;
}

export function Timeline({ calendar: cal, t, onChange, playing, onPlayingChange, speed, onSpeedChange }: Props) {
  const date = daysToDate(cal, t);
  const month = cal.months[date.monthIndex];
  const weekday = weekdayOf(cal, t);
  const [editing, setEditing] = useState(false);

  const speeds = useMemo(
    () => [
      { label: '1 day / sec', value: 1 },
      { label: '10 days / sec', value: 10 },
      { label: '1 month / sec', value: cal.months.find((m) => !m.intercalary)?.days ?? 30 },
      { label: '1 year / sec', value: cal.yearLength },
      { label: '5 years / sec', value: cal.yearLength * 5 },
    ],
    [cal],
  );

  // Year ticks: choose an interval giving roughly a dozen labels.
  const ticks = useMemo(() => {
    const y0 = daysToDate(cal, cal.startDay).year;
    const y1 = daysToDate(cal, cal.endDay).year + 1;
    const span = y1 - y0;
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => span / s <= 10) ?? 1000;
    const minor = step / ([1, 2].includes(step) ? 1 : 5);
    const out: { year: number; pct: number; major: boolean }[] = [];
    for (let y = Math.ceil(y0 / minor) * minor; y <= y1; y += minor) {
      const pct = ((dateToDays(cal, y, 0, 1) - cal.startDay) / (cal.endDay - cal.startDay)) * 100;
      if (pct >= 0 && pct <= 100) out.push({ year: y, pct, major: y % step === 0 });
    }
    return out;
  }, [cal]);

  const stepBy = (unit: 'day' | 'month' | 'year', dir: 1 | -1) => {
    onPlayingChange(false);
    if (unit === 'day') return onChange(Math.floor(t) + dir);
    if (unit === 'year') return onChange(dateToDays(cal, date.year + dir, date.monthIndex, date.day));
    // Month: move to the same day of the next/previous month, clamped to its length.
    let mi = date.monthIndex + dir;
    let y = date.year;
    if (mi < 0) (mi = cal.months.length - 1), y--;
    if (mi >= cal.months.length) (mi = 0), y++;
    onChange(dateToDays(cal, y, mi, Math.min(date.day, cal.months[mi].days)));
  };

  return (
    <footer className="timeline">
      <div className="timeline-row">
        <div className="timeline-date">
          <button className="date-display" onClick={() => setEditing((e) => !e)} title="Go to a date">
            <span className="date-weekday">{weekday ?? cal.eraName}</span>
            <span className="date-main">
              {ordinal(date.day)} of {month.name}
            </span>
            <span className="date-year">Year {formatYear(cal, date.year)}</span>
          </button>
          {editing && (
            <GoToDate
              calendar={cal}
              initial={date}
              onGo={(d) => {
                onPlayingChange(false);
                onChange(d);
                setEditing(false);
              }}
              onClose={() => setEditing(false)}
            />
          )}
        </div>

        <div className="timeline-controls" role="group" aria-label="Step through time">
          <button onClick={() => stepBy('year', -1)} title="Back one year">
            «Y
          </button>
          <button onClick={() => stepBy('month', -1)} title="Back one month">
            ‹M
          </button>
          <button onClick={() => stepBy('day', -1)} title="Back one day">
            ‹D
          </button>
          <button
            className="play"
            onClick={() => onPlayingChange(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
            title={playing ? 'Pause (space)' : 'Play (space)'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => stepBy('day', 1)} title="Forward one day">
            D›
          </button>
          <button onClick={() => stepBy('month', 1)} title="Forward one month">
            M›
          </button>
          <button onClick={() => stepBy('year', 1)} title="Forward one year">
            Y»
          </button>
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="Playback speed"
          >
            {speeds.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="today"
            onClick={() => {
              onPlayingChange(false);
              onChange(cal.defaultDay);
            }}
            title="Return to the date the atlas opens on"
          >
            Reset date
          </button>
        </div>
      </div>

      <div className="timeline-track">
        <input
          type="range"
          min={cal.startDay}
          max={cal.endDay}
          step={1}
          value={Math.floor(t)}
          onChange={(e) => onChange(Number(e.target.value))}
          onPointerDown={() => onPlayingChange(false)}
          aria-label="Date"
          aria-valuetext={`${ordinal(date.day)} of ${month.name}, year ${formatYear(cal, date.year)}`}
        />
        <div className="timeline-ticks" aria-hidden>
          {ticks.map((k) => (
            <span key={k.year} className={k.major ? 'major' : 'minor'} style={{ left: `${k.pct}%` }}>
              {k.major && <em>{k.year}</em>}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}

function GoToDate({
  calendar: cal,
  initial,
  onGo,
  onClose,
}: {
  calendar: Calendar;
  initial: { year: number; monthIndex: number; day: number };
  onGo(t: number): void;
  onClose(): void;
}) {
  const [year, setYear] = useState(String(initial.year));
  const [mi, setMi] = useState(initial.monthIndex);
  const [day, setDay] = useState(String(initial.day));
  const max = cal.months[mi].days;
  return (
    <form
      className="goto"
      onSubmit={(e) => {
        e.preventDefault();
        const y = parseInt(year, 10);
        const d = Math.min(max, Math.max(1, parseInt(day, 10) || 1));
        if (Number.isFinite(y)) onGo(dateToDays(cal, y, mi, d));
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <label>
        Day
        <input type="number" min={1} max={max} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label>
        Month
        <select value={mi} onChange={(e) => setMi(Number(e.target.value))}>
          {cal.months.map((m, i) => (
            <option key={i} value={i}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Year
        <input type="number" value={year} onChange={(e) => setYear(e.target.value)} autoFocus />
      </label>
      <button type="submit">Go</button>
    </form>
  );
}
