import { useMemo, useState } from 'react';
import type { Platform } from '../../lib/platforms';
import { formatDuration, ordinal, type Calendar } from '../../lib/calendar';
import { bearingAt, bearingBetween, compassPoint, distance, platformPositions, positionsAt, type Point } from '../../lib/orbits';
import { bandAt, orbitalDistance, type Body, type World } from '../../lib/world';
import { continentMap, findSettlement, type Settlement, type SettlementKind } from '../../lib/terrain';
import { designTemplate } from '../../lib/terrain/template';

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
  const settled = p.selectedId ? findSettlement(world, p.selectedId) : null;

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
          ) : settled ? (
            <SettlementEntry {...p} body={settled.body} settlement={settled.settlement} />
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

      {body.kind !== 'moon' && <LandSection world={world} body={body} onFocus={onFocus} />}

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

const KIND_NAME: Record<SettlementKind, [string, string]> = {
  city: ['city', 'cities'],
  town: ['town', 'towns'],
  village: ['village', 'villages'],
};

function plural(n: number, kind: SettlementKind) {
  return `${n} ${KIND_NAME[kind][n === 1 ? 0 : 1]}`;
}

/** Offer the continent's current map as an SVG to draw over. */
function downloadTemplate(world: World, body: Body) {
  const svg = designTemplate(body, continentMap(world, body));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${body.id}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Terrain, water, roads and settlements of a continent. */
function LandSection({ world, body, onFocus }: { world: World; body: Body; onFocus(id: string): void }) {
  const map = continentMap(world, body);
  const by = (k: SettlementKind) => map.settlements.filter((st) => st.kind === k);
  const roadLength = (rank: string) => map.roads.filter((r) => r.rank === rank).reduce((sum, r) => sum + r.length, 0);
  const navigable = map.rivers.filter((r) => r.navigableFrom >= 0).length;
  const ports = map.settlements.filter((st) => st.port).length;
  const list = (items: Settlement[]) =>
    items.map((st, i) => (
      <span key={st.id}>
        {i > 0 && ', '}
        <button className="link" onClick={() => onFocus(st.id)}>
          {st.name}
        </button>
      </span>
    ));

  return (
    <>
      <h3>The land</h3>
      <dl className="entry-facts">
        <div>
          <dt>Highest point</dt>
          <dd>{fmt.format(map.maxElevation)} m</dd>
        </div>
        <div>
          <dt>Waters</dt>
          <dd>
            {map.rivers.length} rivers{navigable ? ` (${navigable} navigable)` : ''}, {map.lakes.length} {map.lakes.length === 1 ? 'lake' : 'lakes'}
          </dd>
        </div>
        <div>
          <dt>Settlements</dt>
          <dd>
            {(['city', 'town', 'village'] as SettlementKind[])
              .map((k) => plural(by(k).length, k))
              .join(', ')}
            {ports ? `; ${ports} with harbours` : ''}
          </dd>
        </div>
        <div>
          <dt>Roads</dt>
          <dd>
            {[
              ['highway', 'of highway'],
              ['road', 'of road'],
              ['track', 'of track'],
            ]
              .filter(([r]) => roadLength(r) > 0)
              .map(([r, label]) => `${fmt.format(Math.round(roadLength(r)))} ${world.units.abbr} ${label}`)
              .join(', ') || 'None'}
          </dd>
        </div>
      </dl>
      {by('city').length > 0 && <p className="entry-moons">Cities: {list(by('city'))}.</p>}
      {by('town').length > 0 && <p className="entry-moons">Towns: {list(by('town'))}.</p>}
      {by('village').length > 0 && (
        <details className="villages">
          <summary>{plural(by('village').length, 'village')}</summary>
          <p className="entry-moons">{list(by('village'))}.</p>
        </details>
      )}
      <p className="hint map-source">
        {map.source === 'designed' ? 'Drawn by hand.' : 'Generated placeholder.'}{' '}
        <button className="link" onClick={() => downloadTemplate(world, body)}>
          Download design template
        </button>
        {map.warnings.length > 0 && <span className="warn"> {map.warnings.length} design notes — see the console.</span>}
      </p>
    </>
  );
}

function SettlementEntry({
  world,
  body,
  settlement: st,
  onSelect,
  onFocus,
}: Props & { body: Body; settlement: Settlement }) {
  const map = continentMap(world, body);
  const u = world.units.abbr;
  const name = (id: string | null) => map.settlements.find((x) => x.id === id);
  const links = map.roads
    .filter((r) => r.from === st.id || r.to === st.id)
    .map((r) => ({ r, other: name(r.from === st.id ? r.to : r.from) }))
    .filter((l) => l.other)
    .sort((a, b) => a.r.length - b.r.length);
  const near = map.settlements
    .filter((x) => x.id !== st.id)
    .map((x) => ({ x, d: Math.hypot(x.x - st.x, x.y - st.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  const features = [
    st.port && 'a harbour',
    st.riverPort && 'a river port',
    st.river && !st.riverPort && 'on a river',
  ].filter(Boolean);

  return (
    <article className="entry">
      <button className="entry-back" onClick={() => onSelect(body.id)}>
        ‹ {body.name}
      </button>
      <h2>{st.name}</h2>
      <p className="entry-kind">
        {KIND_NAME[st.kind][0][0].toUpperCase() + KIND_NAME[st.kind][0].slice(1)} on {body.name}
        {features.length ? `, with ${features.join(' and ')}` : ''}
      </p>
      <div className="entry-actions">
        <button onClick={() => onFocus(st.id)}>Centre on chart</button>
      </div>
      <dl className="entry-facts">
        <div>
          <dt>Elevation</dt>
          <dd>{fmt.format(st.elevation)} m</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>
            {fmt.format(Math.round(Math.hypot(st.x, st.y)))} {u} {compassPoint(bearingBetween({ x: 0, y: 0 }, st))} of {body.name}'s centre
          </dd>
        </div>
      </dl>
      {links.length > 0 && (
        <>
          <h3>By road</h3>
          <table className="distances">
            <tbody>
              {links.map(({ r, other }) => (
                <tr key={`${r.from}-${r.to}`} onClick={() => onFocus(other!.id)}>
                  <th>{other!.name}</th>
                  <td>
                    {fmt.format(Math.round(r.length))} {u}
                  </td>
                  <td className="brg">{r.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <h3>Nearest settlements</h3>
      <table className="distances">
        <tbody>
          {near.map(({ x, d }) => (
            <tr key={x.id} onClick={() => onFocus(x.id)}>
              <th>{x.name}</th>
              <td>
                {fmt.format(Math.round(d))} {u}
              </td>
              <td className="brg">{x.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
