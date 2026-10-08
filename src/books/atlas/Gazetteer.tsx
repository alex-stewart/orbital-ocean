import { useMemo } from 'react';
import { formatDuration, type Calendar } from '../../lib/calendar';
import { bearingAt, bearingBetween, compassPoint, distance, positionsAt } from '../../lib/orbits';
import type { Body, World } from '../../lib/world';

interface Props {
  open: boolean;
  onToggle(): void;
  world: World;
  calendar: Calendar;
  t: number;
  selectedId: string | null;
  followId: string | null;
  onSelect(id: string | null): void;
  onFocus(id: string): void;
  onFollow(id: string | null): void;
}

const fmt = new Intl.NumberFormat('en-GB');
const deg = (b: number) => `${Math.round(b).toString().padStart(3, '0')}°`;

function describe(b: Body, world: World): string {
  if (b.kind === 'central') return 'The fixed centre of the ocean';
  if (b.kind === 'moon') return `Lesser isle in orbit about ${b.parent!.name}`;
  const rank = world.bodies.filter((o) => o.kind === 'isle').indexOf(b) + 1;
  const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][rank - 1];
  return `Orbital isle, ${ord ?? `${rank}th`} from the centre`;
}

export function Gazetteer(p: Props) {
  const { world, calendar: cal, t } = p;
  const positions = useMemo(() => positionsAt(world.bodies, t), [world, t]);
  const body = p.selectedId ? world.bodies.find((b) => b.id === p.selectedId) : undefined;

  return (
    <aside className={`gazetteer ${p.open ? 'open' : ''}`} aria-label="Gazetteer">
      <button className="gazetteer-tab" onClick={p.onToggle} aria-expanded={p.open}>
        {p.open ? 'Close ›' : '‹ Gazetteer'}
      </button>
      {p.open && (
        <div className="gazetteer-body">
          {body ? (
            <Entry {...p} body={body} positions={positions} cal={cal} />
          ) : (
            <>
              <h2>Index of Places</h2>
              <p className="hint">Select a place to centre it on the chart.</p>
              <ul className="index">
                {world.bodies
                  .filter((b) => b.kind !== 'moon')
                  .map((b) => (
                    <li key={b.id}>
                      <button onClick={() => p.onFocus(b.id)}>
                        <span>{b.name}</span>
                        <span className="dots" />
                        <span className="num">{b.kind === 'central' ? '—' : `${fmt.format(b.orbitRadius)} ${world.units.abbr}`}</span>
                      </button>
                      {b.moons.length > 0 && (
                        <ul>
                          {b.moons.map((m) => (
                            <li key={m.id}>
                              <button onClick={() => p.onFocus(m.id)}>
                                <span>{m.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                {world.belts.map((b) => (
                  <li key={b.id} className="index-belt">
                    <span>{b.name}</span>
                    <span className="dots" />
                    <span className="num">
                      {fmt.format(b.innerRadius)}–{fmt.format(b.outerRadius)} {world.units.abbr}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Entry({
  world,
  body,
  positions,
  cal,
  t,
  followId,
  onSelect,
  onFocus,
  onFollow,
}: Props & { body: Body; positions: Map<string, { x: number; y: number }>; cal: Calendar }) {
  const u = world.units.abbr;
  const here = positions.get(body.id)!;
  const others = world.bodies
    .filter((b) => b.id !== body.id && b.kind !== 'moon')
    .map((b) => {
      const there = positions.get(b.id)!;
      return { b, d: distance(here, there), bearing: bearingBetween(here, there) };
    })
    .sort((a, b) => a.d - b.d);

  const rows: [string, string][] = [
    ['Breadth', `≈ ${fmt.format(Math.round(body.radius * 2))} ${u}`],
    ['Area', `≈ ${fmt.format(Math.round((Math.PI * body.radius * body.radius) / 100) * 100)} ${u}²`],
  ];
  if (body.parent) {
    rows.push(
      ['Orbit', `${fmt.format(body.orbitRadius)} ${u} from ${body.parent.name}`],
      ['Period', formatDuration(cal, body.periodDays)],
      ['Circuit', `${fmt.format(Math.round((2 * Math.PI * body.orbitRadius) / body.periodDays))} ${u} per day, clockwise`],
      ['Bearing now', `${deg(bearingAt(body, t))} ${compassPoint(bearingAt(body, t))} of ${body.parent.name}`],
    );
  }

  return (
    <article className="entry">
      <button className="entry-back" onClick={() => onSelect(null)}>
        ‹ Index of Places
      </button>
      <h2>{body.name}</h2>
      <p className="entry-kind">{describe(body, world)}</p>
      <div className="entry-actions">
        <button onClick={() => onFocus(body.id)}>Centre on chart</button>
        <button className={followId === body.id ? 'active' : ''} onClick={() => onFollow(followId === body.id ? null : body.id)}>
          {followId === body.id ? 'Following' : 'Follow'}
        </button>
      </div>
      <dl className="entry-facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {body.moons.length > 0 && (
        <p className="entry-moons">
          Attended by{' '}
          {body.moons.map((m, i) => (
            <span key={m.id}>
              {i > 0 && (i === body.moons.length - 1 ? ' and ' : ', ')}
              <button className="link" onClick={() => onFocus(m.id)}>
                {m.name}
              </button>
            </span>
          ))}
          .
        </p>
      )}

      <h3>Distances on this date</h3>
      <p className="hint">Hover another island on the chart to measure to it.</p>
      <table className="distances">
        <tbody>
          {others.map(({ b, d, bearing }) => (
            <tr key={b.id} onClick={() => onSelect(b.id)}>
              <th>{b.name}</th>
              <td>
                {fmt.format(Math.round(d))} {u}
              </td>
              <td className="brg">{deg(bearing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
