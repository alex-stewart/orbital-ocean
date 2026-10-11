import { useMemo, useState } from 'react';
import type { Platform } from '../../lib/platforms';
import { formatDuration, ordinal, type Calendar } from '../../lib/calendar';
import { bearingAt, bearingBetween, compassPoint, distance, platformPositions, positionsAt, type Point } from '../../lib/orbits';
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
  const platform = p.selectedId ? world.platforms[world.platformIndex.get(p.selectedId) ?? -1] : undefined;

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
          ) : platform ? (
            <PlatformEntry {...p} platform={platform} positions={positions} cal={cal} />
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
                        <p className="index-moons">
                          {item.body.moons.length === 1 ? 'Moon' : 'Moons'}{' '}
                          {item.body.moons.map((m, i) => (
                            <span key={m.id}>
                              {i > 0 && ', '}
                              <button className="link" onClick={() => p.onFocus(m.id)}>
                                {m.name.slice(item.body.name.length).trim() || m.name}
                              </button>
                            </span>
                          ))}
                        </p>
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
              {world.platforms.length > 0 && <PlatformIndex world={world} onFocus={p.onFocus} />}
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
  const orbiting = world.platforms.filter((q) => q.parent?.id === body.id && q.motion === 'continent').length;
  const convoy = world.platforms.filter((q) => q.companion?.id === body.id).length;

  const rows: [string, string][] = [];
  if (band) rows.push(['Band', band.name]);
  if (orbiting || convoy) {
    rows.push([
      'Platforms',
      [orbiting && `${orbiting} in orbit about it`, convoy && `${convoy} in convoy on its orbit`].filter(Boolean).join('; '),
    ]);
  }
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

/** Summary of the platform register, with lookup by register number. */
function PlatformIndex({ world, onFocus }: { world: World; onFocus(id: string): void }) {
  const [query, setQuery] = useState('');
  const [missing, setMissing] = useState(false);
  const count = (band: string, anchored: boolean) =>
    world.platforms.filter((q) => q.band?.id === band && (q.motion === 'anchored') === anchored).length;
  const owners = world.platformRules!.owners.map((o) => ({
    o,
    n: world.platforms.filter((q) => q.owner.id === o.id).length,
  }));

  return (
    <>
      <h3>Ocean Platforms</h3>
      <p className="hint">
        {fmt.format(world.platforms.length)} platforms in the Imperial register, from beacons to cathedral-sized grand
        platforms.
      </p>
      <table className="register">
        <thead>
          <tr>
            <th />
            <th>Anchored</th>
            <th>Orbital</th>
          </tr>
        </thead>
        <tbody>
          {world.bands.map((b) => (
            <tr key={b.id}>
              <th>{b.name.replace(/^The /, '')}</th>
              <td>{fmt.format(count(b.id, true))}</td>
              <td>{fmt.format(count(b.id, false))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="owners">
        {owners.map(({ o, n }, i) => (
          <span key={o.id}>
            {i > 0 && ' · '}
            {o.name}: {fmt.format(n)}
          </span>
        ))}
      </p>
      <form
        className="lookup"
        onSubmit={(e) => {
          e.preventDefault();
          const raw = query.trim().toUpperCase();
          // Accept the full number or just its digits, e.g. "1423" → HPBE-P-01423.
          const digits = raw.match(/^\d+$/) ? raw.padStart(5, '0') : null;
          const id = digits
            ? world.platforms.find((q) => q.id.endsWith(`-${digits}`))?.id
            : world.platformIndex.has(raw)
              ? raw
              : undefined;
          setMissing(!id);
          if (id) onFocus(id);
        }}
      >
        <label htmlFor="register-lookup">Find by register number</label>
        <div>
          <input
            id="register-lookup"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMissing(false);
            }}
            placeholder="HPBE-P-01423"
            spellCheck={false}
          />
          <button type="submit">Find</button>
        </div>
        {missing && <p className="hint">No platform with that number is on the register.</p>}
      </form>
    </>
  );
}

function describeMotion(p: Platform, world: World, cal: Calendar): string {
  const u = world.units.abbr;
  switch (p.motion) {
    case 'anchored':
      return `Anchored ${fmt.format(Math.round(p.orbitRadius))} ${u} from ${world.central.name}, bearing ${deg(p.bearing)}`;
    case 'lane':
      return `In the ${fmt.format(p.orbitRadius)} ${u} lane about ${world.central.name}, once every ${formatDuration(cal, p.periodDays)}`;
    case 'convoy': {
      const c = p.companion!;
      const offset = ((p.bearing - c.bearing + 540) % 360) - 180;
      return `In convoy on the orbit of ${c.name}, ${Math.abs(Math.round(offset))}° ${offset > 0 ? 'ahead of' : 'behind'} it`;
    }
    case 'continent':
      return `Orbits ${p.parent!.name} at ${fmt.format(p.orbitRadius)} ${u}, once every ${formatDuration(cal, p.periodDays)}`;
  }
}

function PlatformEntry({
  world,
  platform: pf,
  positions,
  cal,
  t,
  followId,
  onSelect,
  onFocus,
  onFollow,
}: Props & { platform: Platform; positions: Map<string, Point>; cal: Calendar }) {
  const u = world.units.abbr;
  const here = useMemo(() => {
    const i = world.platformIndex.get(pf.id)!;
    const one = platformPositions([world.platforms[i]], t, positions);
    return { x: one[0], y: one[1] };
  }, [world, pf, t, positions]);
  const others = world.bodies
    .filter((b) => b.kind !== 'moon')
    .map((b) => {
      const there = positions.get(b.id)!;
      return { b, d: distance(here, there), bearing: bearingBetween(here, there) };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, 6);
  const breadth = pf.size.radius * 2;

  return (
    <article className="entry">
      <button className="entry-back" onClick={() => onSelect(null)}>
        ‹ Index of Places
      </button>
      <h2>{pf.id}</h2>
      <p className="entry-kind">
        {pf.motion === 'anchored' ? 'Anchored' : 'Orbital'} platform · {pf.size.name}
        {pf.size.like ? `, the size of ${pf.size.like}` : ''}
      </p>
      <div className="entry-actions">
        <button onClick={() => onFocus(pf.id)}>Centre on chart</button>
        {pf.motion !== 'anchored' && (
          <button className={followId === pf.id ? 'active' : ''} onClick={() => onFollow(followId === pf.id ? null : pf.id)}>
            {followId === pf.id ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
      <dl className="entry-facts">
        <div>
          <dt>Held by</dt>
          <dd>{pf.owner.name}</dd>
        </div>
        {pf.band && (
          <div>
            <dt>Band</dt>
            <dd>{pf.band.name}</dd>
          </div>
        )}
        <div>
          <dt>Breadth</dt>
          <dd>
            ≈ {breadth < 1 ? breadth.toFixed(breadth < 0.1 ? 3 : 2) : fmt.format(breadth)} {u}
          </dd>
        </div>
        <div>
          <dt>Station</dt>
          <dd>{describeMotion(pf, world, cal)}</dd>
        </div>
      </dl>

      <h3>Nearest places on this date</h3>
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
