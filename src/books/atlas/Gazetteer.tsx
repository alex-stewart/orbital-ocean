import { useMemo } from 'react';
import { formatDuration, ordinal, type Calendar } from '../../lib/calendar';
import { bearingAt, bearingBetween, compassPoint, distance, positionsAt } from '../../lib/orbits';
import { bandAt, orbitalDistance, type Body, type World } from '../../lib/world';

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

/** Highest position number in the ocean, e.g. 16. */
function positionCount(world: World): number {
  return Math.max(0, ...world.bodies.map((b) => b.position ?? 0), ...world.belts.map((b) => b.position ?? 0));
}

function describe(b: Body, world: World): string {
  if (b.kind === 'central') return 'The central landmass';
  if (b.kind === 'moon') return `Lesser isle in orbit about ${b.parent!.name}`;
  return b.position ? `Continent, ${ordinal(b.position)} of ${positionCount(world)} from the centre` : 'Continent';
}

export function Gazetteer(p: Props) {
  const { world, calendar: cal, t } = p;
  const positions = useMemo(() => positionsAt(world.bodies, t), [world, t]);
  const body = p.selectedId ? world.bodies.find((b) => b.id === p.selectedId) : undefined;

  // Continents and belts together, in order outward from the centre.
  const index = useMemo(
    () =>
      [
        ...world.bodies
          .filter((b) => b.kind !== 'moon')
          .map((b) => ({ kind: 'body' as const, body: b, r: b.orbitRadius, position: b.position })),
        ...world.belts.map((b) => ({ kind: 'belt' as const, belt: b, r: b.innerRadius, position: b.position })),
      ].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.r - b.r),
    [world],
  );

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
              <p className="hint">In order outward from the centre. Select a place to centre it on the chart.</p>
              <ul className="index">
                {index.map((item) =>
                  item.kind === 'body' ? (
                    <li key={item.body.id}>
                      <button onClick={() => p.onFocus(item.body.id)}>
                        <span className="pos">{item.position ?? ''}</span>
                        <span>{item.body.name}</span>
                        <span className="dots" />
                        <span className="num">
                          {item.body.kind === 'central' ? '—' : `${fmt.format(item.body.orbitRadius)} ${world.units.abbr}`}
                        </span>
                      </button>
                      {item.body.moons.length > 0 && (
                        <ul>
                          {item.body.moons.map((m) => (
                            <li key={m.id}>
                              <button onClick={() => p.onFocus(m.id)}>
                                <span>{m.name}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ) : (
                    <li key={item.belt.id} className="index-belt">
                      <span className="pos">{item.position ?? ''}</span>
                      <span>{item.belt.name}</span>
                      <span className="dots" />
                      <span className="num">
                        {fmt.format(item.belt.innerRadius)}–{fmt.format(item.belt.outerRadius)} {world.units.abbr}
                      </span>
                    </li>
                  ),
                )}
              </ul>

              {world.bands.length > 0 && (
                <>
                  <h3>The Imperial Bands</h3>
                  <p className="hint">The Holy Purple Bureaucratic Empire divides the ocean into {world.bands.length} bands.</p>
                  <dl className="bands">
                    {world.bands.map((b) => (
                      <div key={b.id}>
                        <dt>{b.name}</dt>
                        <dd>
                          {b.description}{' '}
                          <span className="num">
                            ({fmt.format(b.innerRadius)}–{fmt.format(b.outerRadius)} {world.units.abbr})
                          </span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              <p className="hint edge-note">
                Beyond {fmt.format(world.oceanRadius)} {world.units.abbr} the ocean ends at {world.edgeName}.
              </p>
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
  const band = bandAt(world, orbitalDistance(body));

  const rows: [string, string][] = [];
  if (band) rows.push(['Band', band.name]);
  rows.push(
    ['Breadth', `≈ ${fmt.format(Math.round(body.radius * 2))} ${u}`],
    ['Area', `≈ ${fmt.format(Math.round((Math.PI * body.radius * body.radius) / 100) * 100)} ${u}²`],
  );
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
      {body.description && <p className="entry-desc">{body.description}</p>}
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
      <p className="hint">Hover another place on the chart to measure to it.</p>
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
