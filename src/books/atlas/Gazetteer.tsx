import { Fragment, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { formatDuration, ordinal, type Calendar } from '../../lib/calendar';
import { bearingAt, bearingBetween, compassPoint, distance, platformPositions, positionsAt, type Point } from '../../lib/orbits';
import type { Platform } from '../../lib/platforms';
import { portName, type ShippingNetwork, type ShippingRoute } from '../../lib/shipping';
import { continentMap, findSettlement, hasContinentMap, type Settlement, type SettlementKind } from '../../lib/terrain';
import { archipelagoFerries, type Ferry } from '../../lib/terrain/archipelago';
import { bandAt, orbitalDistance, type Archipelago, type Belt, type Body, type World } from '../../lib/world';

interface Props {
  open: boolean;
  onToggle(): void;
  world: World;
  calendar: Calendar;
  t: number;
  selectedId: string | null;
  followId: string | null;
  shipping: ShippingNetwork | null;
  onSelect(id: string | null): void;
  onFocus(id: string): void;
  onFollow(id: string | null): void;
  /** Start measuring from a place. */
  onMeasure(id: string): void;
  /** The editor's fields for the selection (development only). */
  editSlot?: ReactNode;
}

const fmt = new Intl.NumberFormat('en-GB');
const deg = (b: number) => `${Math.round(b).toString().padStart(3, '0')}°`;
const KIND: Record<SettlementKind, [string, string]> = {
  city: ['city', 'cities'],
  town: ['town', 'towns'],
  village: ['village', 'villages'],
};
const count = (n: number, k: SettlementKind) => `${n} ${KIND[k][n === 1 ? 0 : 1]}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** What a selection id refers to. */
type Selection =
  | { type: 'body'; body: Body }
  | { type: 'archipelago'; archipelago: Archipelago }
  | { type: 'settlement'; body: Body; settlement: Settlement }
  | { type: 'platform'; platform: Platform }
  | { type: 'route'; route: ShippingRoute | null; id: string }
  | null;

function resolve(world: World, shipping: ShippingNetwork | null, id: string | null): Selection {
  if (!id) return null;
  if (id.startsWith('route:')) return { type: 'route', route: shipping?.routes.find((r) => r.id === id) ?? null, id };
  const body = world.bodies.find((b) => b.id === id);
  if (body) return { type: 'body', body };
  const archipelago = world.archipelagos.find((a) => a.id === id);
  if (archipelago) return { type: 'archipelago', archipelago };
  const st = findSettlement(world, id);
  if (st) return { type: 'settlement', ...st };
  const i = world.platformIndex.get(id);
  if (i !== undefined) return { type: 'platform', platform: world.platforms[i] };
  return null;
}

function bandOfBody(world: World, b: Body) {
  return bandAt(world, orbitalDistance(b));
}

/** The continents and the central landmass: what the index lists by band. */
const isMajor = (b: Body) => b.kind === 'central' || b.kind === 'isle';

/** An archipelago's places, all islands together (those whose maps are built). */
function archipelagoPlaces(world: World, a: Archipelago): Settlement[] | null {
  if (!a.islands.every((i) => hasContinentMap(world, i))) return null;
  return a.islands.flatMap((i) => continentMap(world, i).settlements);
}

/** Ferries, once all the archipelago's maps are built. */
function ferriesOf(world: World, a: Archipelago): Ferry[] | null {
  return a.islands.every((i) => hasContinentMap(world, i)) ? archipelagoFerries(world, a) : null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * On phones the gazetteer is a bottom sheet: drag its handle between about
 * half and nearly full height, or down to fold it away.
 */
function useSheet(open: boolean, onToggle: () => void) {
  const [height, setHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; parent: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const aside = e.currentTarget.closest('aside')!;
    const parent = aside.parentElement!.clientHeight;
    drag.current = { y: e.clientY, h: aside.getBoundingClientRect().height, parent };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setHeight(Math.max(48, Math.min(d.parent * 0.92, d.h - (e.clientY - d.y))));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || height === null) return;
    // Snap: folded, half, or nearly full.
    const f = height / d.parent;
    if (f < 0.22) {
      setHeight(null);
      if (open) onToggle();
    } else setHeight(d.parent * (f < 0.65 ? 0.5 : 0.88));
  };
  return { style: open && height !== null ? { height, maxHeight: 'none' } : undefined, handle: { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp } };
}

export function Gazetteer(p: Props) {
  const { world, shipping } = p;
  const sel = resolve(world, shipping, p.selectedId);
  const sheet = useSheet(p.open, p.onToggle);

  // Breadcrumb: Index › body › place.
  const crumbs: { id: string | null; label: string }[] = [{ id: null, label: 'Index' }];
  if (sel?.type === 'body') {
    if (sel.body.kind === 'moon') crumbs.push({ id: sel.body.parent!.id, label: sel.body.parent!.name });
    if (sel.body.archipelago) crumbs.push({ id: sel.body.archipelago.id, label: sel.body.archipelago.name });
  } else if (sel?.type === 'settlement') {
    if (sel.body.kind === 'moon') crumbs.push({ id: sel.body.parent!.id, label: sel.body.parent!.name });
    if (sel.body.archipelago) crumbs.push({ id: sel.body.archipelago.id, label: sel.body.archipelago.name });
    crumbs.push({ id: sel.body.id, label: sel.body.name });
  } else if (sel?.type === 'route' || sel?.type === 'platform') {
    crumbs.push({ id: null, label: 'Sea' });
  }

  return (
    <aside className={`gazetteer ${p.open ? 'open' : 'closed'}`} aria-label="Gazetteer" style={sheet.style}>
      <div className="gz-handle" {...sheet.handle} aria-hidden />
      <header className="gz-head">
        <button className="gz-title" onClick={p.onToggle} aria-expanded={p.open}>
          <span>Gazetteer</span>
          <span className="gz-toggle" aria-hidden>
            {p.open ? '–' : '+'}
          </span>
        </button>
      </header>
      {p.open && (
        <>
          <Search world={world} onFocus={p.onFocus} />
          {sel && (
            <nav className="gz-crumbs" aria-label="Breadcrumb">
              {crumbs.map((c, i) => (
                <span key={i}>
                  <button className="link" onClick={() => p.onSelect(c.id)}>
                    {c.label}
                  </button>
                  <span aria-hidden> › </span>
                </span>
              ))}
            </nav>
          )}
          <div className="gz-body">
            {sel && p.editSlot}
            {!sel && <Index {...p} />}
            {sel?.type === 'body' && <BodyEntry {...p} body={sel.body} />}
            {sel?.type === 'archipelago' && <ArchipelagoEntry {...p} archipelago={sel.archipelago} />}
            {sel?.type === 'settlement' && <SettlementEntry {...p} body={sel.body} settlement={sel.settlement} />}
            {sel?.type === 'platform' && <PlatformEntry {...p} platform={sel.platform} />}
            {sel?.type === 'route' && <RouteEntry {...p} route={sel.route} />}
          </div>
        </>
      )}
    </aside>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

function Section({ title, children, open = true, count }: { title: string; children: ReactNode; open?: boolean; count?: number | string }) {
  return (
    <details className="gz-section" open={open}>
      <summary>
        {title}
        {count !== undefined && <span className="gz-count">{count}</span>}
      </summary>
      <div className="gz-section-body">{children}</div>
    </details>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="gz-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Links<T extends { id: string; name: string }>({ items, onFocus }: { items: T[]; onFocus(id: string): void }) {
  return (
    <>
      {items.map((x, i) => (
        <span key={x.id}>
          {i > 0 && ', '}
          <button className="link" onClick={() => onFocus(x.id)}>
            {x.name}
          </button>
        </span>
      ))}
    </>
  );
}

function Head({ title, kind, description }: { title: string; kind: ReactNode; description?: string | null }) {
  return (
    <div className="gz-entry-head">
      <h2>{title}</h2>
      <p className="gz-kind">{kind}</p>
      {description && <p className="gz-desc">{description}</p>}
    </div>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────

function Search({ world, onFocus }: { world: World; onFocus(id: string): void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return [];
    const out: { id: string; label: string; kind: string }[] = [];
    const bodyKind = (b: Body) =>
      b.kind === 'moon' ? 'moon' : b.kind === 'central' ? 'central landmass' : b.archipelago ? `island of ${b.archipelago.name}` : 'continent';
    for (const b of world.bodies) if (b.name.toLowerCase().includes(query)) out.push({ id: b.id, label: b.name, kind: bodyKind(b) });
    for (const a of world.archipelagos)
      if (a.name.toLowerCase().includes(query)) out.push({ id: a.id, label: a.name, kind: `archipelago, ${a.belt.name}` });
    // Settlements on bodies whose maps are built (all of them, shortly after opening).
    for (const b of world.bodies) {
      if (!hasContinentMap(world, b)) continue;
      for (const s of continentMap(world, b).settlements)
        if (s.name.toLowerCase().includes(query)) out.push({ id: s.id, label: s.name, kind: `${s.kind} on ${b.name}` });
    }
    // Platform register numbers: full or digits only ("1423" → HPBE-…-01423).
    const digits = query.replace(/\D/g, '');
    if (digits.length >= 2) {
      for (const pf of world.platforms) {
        if (pf.id.toLowerCase().includes(query) || (/^\d+$/.test(query) && pf.id.endsWith(digits.padStart(5, '0')))) {
          out.push({ id: pf.id, label: pf.id, kind: `${pf.size.name.toLowerCase()}, ${pf.motion}` });
        }
        if (out.length > 40) break;
      }
    }
    return out.slice(0, 8);
  }, [q, world]);

  const go = (id: string) => {
    onFocus(id);
    setQ('');
  };

  return (
    <div className="gz-search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) go(results[0].id);
          if (e.key === 'Escape') setQ('');
        }}
        placeholder="Find a place or platform number…"
        aria-label="Find a place or platform number"
      />
      {results.length > 0 && (
        <ul className="gz-results" role="listbox">
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => go(r.id)}>
                <span>{r.label}</span>
                <span className="gz-result-kind">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="hint">Nothing by that name.</p>}
    </div>
  );
}

// ── Index ───────────────────────────────────────────────────────────────────

function Index(p: Props) {
  const [tab, setTab] = useState<'places' | 'sea'>('places');
  return (
    <>
      <div className="gz-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'places'} className={tab === 'places' ? 'active' : ''} onClick={() => setTab('places')}>
          Places
        </button>
        <button role="tab" aria-selected={tab === 'sea'} className={tab === 'sea' ? 'active' : ''} onClick={() => setTab('sea')}>
          Sea
        </button>
      </div>
      {tab === 'places' ? <PlacesIndex {...p} /> : <SeaIndex {...p} />}
    </>
  );
}

function PlacesIndex(p: Props) {
  const { world, onFocus } = p;
  const majors = world.bodies.filter(isMajor);
  const listed = new Set<string>();
  return (
    <>
      {world.bands.map((band) => {
        const bodies = majors.filter((b) => bandOfBody(world, b)?.id === band.id);
        const belts = world.belts.filter((bt) => bt.innerRadius >= band.innerRadius && bt.outerRadius <= band.outerRadius);
        // Each belt's archipelagos follow the band it begins in.
        const beltsAfter = world.belts.filter((bt) => !listed.has(bt.id) && bt.innerRadius < band.outerRadius);
        for (const bt of beltsAfter) listed.add(bt.id);
        return (
          <Fragment key={band.id}>
            <Section title={band.name} count={bodies.length}>
              {band.description && <p className="hint">{band.description}</p>}
              <ul className="gz-list">
                {bodies.map((b) => {
                  const places = hasContinentMap(world, b) ? continentMap(world, b).settlements.length : null;
                  return (
                    <li key={b.id}>
                      <button onClick={() => onFocus(b.id)}>
                        <span className="gz-pos">{b.position ?? ''}</span>
                        <span className="gz-name">{b.name}</span>
                        <span className="gz-meta">
                          {[b.moons.length ? `${b.moons.length} ${b.moons.length === 1 ? 'moon' : 'moons'}` : '', places !== null ? `${places} ${places === 1 ? 'place' : 'places'}` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {belts.length > 0 && (
                <p className="hint">
                  Bounded by{' '}
                  {belts.map((bt) => `the ${bt.name} (${fmt.format(bt.innerRadius)}–${fmt.format(bt.outerRadius)} ${world.units.abbr})`).join(' and ')}.
                </p>
              )}
            </Section>
            {beltsAfter.map((bt) => (
              <BeltIndex key={bt.id} {...p} belt={bt} />
            ))}
          </Fragment>
        );
      })}
      <p className="hint">
        Beyond {fmt.format(world.oceanRadius)} {world.units.abbr} the ocean ends at {world.edgeName}.
      </p>
    </>
  );
}

function BeltIndex({ world, belt, onFocus }: Props & { belt: Belt }) {
  // Settled archipelagos first, the most populous leading.
  const rows = belt.archipelagos
    .map((a) => ({ a, places: archipelagoPlaces(world, a) }))
    .sort((x, y) => (y.places?.length ?? Number(y.a.populated)) - (x.places?.length ?? Number(x.a.populated)) || y.a.extent - x.a.extent);
  return (
    <Section title={`The ${belt.name}`} count={belt.archipelagos.length} open={false}>
      <p className="hint">
        {fmt.format(belt.innerRadius)}–{fmt.format(belt.outerRadius)} {world.units.abbr} from the centre. Its islands keep together in archipelagos,
        each turning about the centre as one.
      </p>
      <ul className="gz-list">
        {rows.map(({ a, places }) => (
          <li key={a.id}>
            <button onClick={() => onFocus(a.id)}>
              <span className="gz-name">{a.name}</span>
              <span className="gz-meta">
                {[plural(a.islands.length, 'island', 'islands'), places === null ? '' : places.length ? plural(places.length, 'place', 'places') : 'uninhabited']
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function SeaIndex({ world, shipping, onFocus }: Props) {
  const routes = shipping ? [...shipping.routes].sort((a, b) => b.traffic - a.traffic) : [];
  const counts = (band: string, anchored: boolean) =>
    world.platforms.filter((q) => q.band?.id === band && (q.motion === 'anchored') === anchored).length;
  return (
    <>
      <Section title="Imperial shipping" count={routes.length || undefined}>
        {!shipping ? (
          <p className="hint">Turn on shipping routes in Layers to plan them for this date.</p>
        ) : (
          <>
            <p className="hint">
              Cargo routes between {shipping.ports.length} chief ports for this date, calling at {shipping.hubs.size} resupply platforms. Busiest
              first.
            </p>
            <ul className="gz-list">
              {routes.map((r) => (
                <li key={r.id}>
                  <button onClick={() => onFocus(r.id)}>
                    <span className="gz-name">
                      {portName(r.from)} ⇄ {portName(r.to)}
                    </span>
                    <span className="gz-meta">
                      {fmt.format(Math.round(r.length))} {world.units.abbr}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {shipping.unreachable.length > 0 && (
              <p className="hint">
                {shipping.unreachable.length} wanted {shipping.unreachable.length === 1 ? 'route lies' : 'routes lie'} beyond resupply range on this
                date.
              </p>
            )}
          </>
        )}
      </Section>
      <Section title="Ocean platforms" count={fmt.format(world.platforms.length)} open={false}>
        <table className="gz-table">
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
                <td>{fmt.format(counts(b.id, true))}</td>
                <td>{fmt.format(counts(b.id, false))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          {(world.platformRules?.owners ?? [])
            .map((o) => `${o.name}: ${fmt.format(world.platforms.filter((q) => q.owner.id === o.id).length)}`)
            .join(' · ')}
          . Find one by its register number in the search above.
        </p>
      </Section>
    </>
  );
}

// ── Entries ─────────────────────────────────────────────────────────────────

function Actions({
  id,
  followable,
  followId,
  onFocus,
  onFollow,
  onMeasure,
}: { id: string; followable: boolean; onMeasure?: (id: string) => void } & Pick<Props, 'followId' | 'onFocus' | 'onFollow'>) {
  return (
    <div className="gz-actions">
      <button onClick={() => onFocus(id)}>Centre on chart</button>
      {onMeasure && (
        <button onClick={() => onMeasure(id)} title="Measure the distance and bearing to another place">
          Measure
        </button>
      )}
      {followable && (
        <button className={followId === id ? 'active' : ''} onClick={() => onFollow(followId === id ? null : id)}>
          {followId === id ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
}

function routesFrom(shipping: ShippingNetwork | null, bodyId: string) {
  return (shipping?.routes ?? []).filter((r) => r.from.body.id === bodyId || r.to.body.id === bodyId).sort((a, b) => b.traffic - a.traffic);
}

function RouteList({ routes, bodyId, world, onFocus }: { routes: ShippingRoute[]; bodyId: string; world: World; onFocus(id: string): void }) {
  return (
    <ul className="gz-list">
      {routes.map((r) => {
        const other = r.from.body.id === bodyId ? r.to : r.from;
        return (
          <li key={r.id}>
            <button onClick={() => onFocus(r.id)}>
              <span className="gz-name">to {portName(other)}</span>
              <span className="gz-meta">
                {fmt.format(Math.round(r.length))} {world.units.abbr} · {r.stops.length} {r.stops.length === 1 ? 'stop' : 'stops'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The template exporter is loaded only when someone asks for a template. */
async function downloadTemplate(world: World, body: Body) {
  const { designTemplate } = await import('../../lib/terrain/template');
  const limit = body.kind === 'islet' ? world.params.belts.coast_reach : world.params.terrain.design.max_coast_reach;
  const svg = designTemplate(body, continentMap(world, body), limit);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${body.id}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BodyEntry({ world, body, calendar: cal, t, shipping, followId, onFocus, onFollow, onSelect, onMeasure }: Props & { body: Body }) {
  const u = world.units.abbr;
  const map = continentMap(world, body);
  const positions = useMemo(() => positionsAt(world.bodies, t), [world, t]);
  const band = bandOfBody(world, body);
  const by = (k: SettlementKind) => map.settlements.filter((s) => s.kind === k);
  const ports = map.settlements.filter((s) => s.port).length;
  const roadLength = (rank: string) => map.roads.filter((r) => r.rank === rank).reduce((sum, r) => sum + r.length, 0);
  const navigable = map.rivers.filter((r) => r.navigableFrom >= 0).length;
  const orbiting = world.platforms.filter((q) => q.parent?.id === body.id && q.motion === 'ring').length;
  const convoy = world.platforms.filter((q) => q.companion?.id === body.id).length;
  const seaRoutes = routesFrom(shipping, body.id);
  const chief = shipping?.ports.find((pt) => pt.body.id === body.id);
  const arch = body.archipelago;
  const ids = new Set(map.settlements.map((x) => x.id));
  const ferries = arch ? (ferriesOf(world, arch) ?? []).filter((f) => ids.has(f.from) || ids.has(f.to)) : map.ferries;

  const kind =
    body.kind === 'central'
      ? 'The central landmass'
      : body.kind === 'moon'
        ? `Moon of ${body.parent!.name}`
        : arch
          ? `Island of ${arch.name.replace(/^The /, 'the ')}, in the ${arch.belt.name}`
          : `Continent, ${ordinal(body.position ?? 0)} of 16 from the centre`;

  const facts: [string, ReactNode][] = [];
  if (arch)
    facts.push([
      'Archipelago',
      <button className="link" onClick={() => onFocus(arch.id)}>
        {arch.name}
      </button>,
    ]);
  if (band) facts.push(['Band', band.name.replace(/^The /, '')]);
  facts.push(['Breadth', `≈ ${fmt.format(Math.round(body.radius * 2))} ${u}`], ['Highest', `${fmt.format(map.maxElevation)} m`]);
  if (body.parent) {
    const b = bearingAt(body, t);
    facts.push(
      ['Orbit', `${fmt.format(Math.round(body.orbitRadius))} ${u}, every ${formatDuration(cal, body.periodDays)}`],
      ['Bearing', `${deg(b)} ${compassPoint(b)} of ${body.parent.name}`],
    );
  }

  const here = positions.get(body.id)!;
  const others = world.bodies
    .filter((b) => b.id !== body.id && isMajor(b))
    .map((b) => ({ b, d: distance(here, positions.get(b.id)!), bearing: bearingBetween(here, positions.get(b.id)!) }))
    .sort((a, b) => a.d - b.d);

  return (
    <article className="gz-entry">
      <Head title={body.name} kind={kind} description={body.description} />
      <Actions id={body.id} followable={body.kind !== 'central'} followId={followId} onFocus={onFocus} onFollow={onFollow} onMeasure={onMeasure} />
      <Facts rows={facts} />

      {map.settlements.length === 0 && <p className="hint">No one lives here.</p>}
      {map.settlements.length > 0 && (
      <Section title="Settlements" count={map.settlements.length}>
        <p className="gz-line">
          {(['city', 'town', 'village'] as SettlementKind[])
            .filter((k) => by(k).length > 0)
            .map((k) => count(by(k).length, k))
            .join(', ')}
          {ports ? `; ${ports} with harbours` : ''}.
        </p>
        {by('city').length > 0 && (
          <p className="gz-line">
            <span className="gz-label">Cities</span> <Links items={by('city')} onFocus={onFocus} />
          </p>
        )}
        {by('town').length > 0 && (
          <p className="gz-line">
            <span className="gz-label">Towns</span> <Links items={by('town')} onFocus={onFocus} />
          </p>
        )}
        {by('village').length > 0 && (
          <details className="gz-more">
            <summary>{count(by('village').length, 'village')}</summary>
            <p className="gz-line">
              <Links items={by('village')} onFocus={onFocus} />
            </p>
          </details>
        )}
      </Section>
      )}

      {ferries.length > 0 && (
        <Section title="Ferries" count={ferries.length}>
          <FerryList world={world} ferries={ferries} onFocus={onFocus} />
        </Section>
      )}

      {(chief || seaRoutes.length > 0) && (
        <Section title="Sea routes" count={seaRoutes.length}>
          {chief && (
            <p className="gz-line">
              <span className="gz-label">Chief port</span>{' '}
              <button className="link" onClick={() => onFocus(chief.id)}>
                {chief.settlement.name}
              </button>
            </p>
          )}
          <RouteList routes={seaRoutes} bodyId={body.id} world={world} onFocus={onFocus} />
        </Section>
      )}

      <Section title="Land and water" open={false}>
        <Facts
          rows={[
            ['Waters', `${map.rivers.length} rivers${navigable ? ` (${navigable} navigable)` : ''}, ${map.lakes.length} ${map.lakes.length === 1 ? 'lake' : 'lakes'}`],
            [
              'Roads',
              (['highway', 'road', 'track'] as const)
                .filter((r) => roadLength(r) > 0)
                .map((r) => `${fmt.format(Math.round(roadLength(r)))} ${u} ${r}`)
                .join(', ') || 'None',
            ],
            ['Area', `≈ ${fmt.format(Math.round((Math.PI * body.radius * body.radius) / 100) * 100)} ${u}²`],
          ]}
        />
      </Section>

      {body.moons.length > 0 && (
        <Section title="Moons" count={body.moons.length} open={false}>
          <p className="gz-line">
            <Links items={body.moons} onFocus={onFocus} />
          </p>
        </Section>
      )}

      {(orbiting > 0 || convoy > 0) && (
        <Section title="Platforms" count={orbiting + convoy} open={false}>
          <p className="gz-line">{[orbiting && `${orbiting} in orbit about it`, convoy && `${convoy} in convoy on its orbit`].filter(Boolean).join('; ')}.</p>
        </Section>
      )}

      <Section title="Distances on this date" open={false}>
        <table className="gz-table">
          <tbody>
            {others.map(({ b, d, bearing }) => (
              <tr key={b.id} onClick={() => onSelect(b.id)}>
                <th>{b.name}</th>
                <td>
                  {fmt.format(Math.round(d))} {u}
                </td>
                <td className="gz-dim">{deg(bearing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">Hover another place on the chart to measure to it.</p>
      </Section>

      <Section title="Design" open={false}>
        <p className="gz-line">
          {map.source === 'designed' ? 'Drawn by hand.' : 'Generated placeholder.'}{' '}
          <button className="link" onClick={() => downloadTemplate(world, body)}>
            Download design template
          </button>
        </p>
        {map.warnings.length > 0 && <p className="hint warn">{map.warnings.length} design notes; see the browser console.</p>}
      </Section>
    </article>
  );
}

function FerryList({ world, ferries, onFocus, from }: { world: World; ferries: Ferry[]; onFocus(id: string): void; from?: string }) {
  const u = world.units.abbr;
  const name = (id: string) => {
    const st = findSettlement(world, id);
    return st ? `${st.settlement.name}, ${st.body.name}` : id;
  };
  return (
    <table className="gz-table">
      <tbody>
        {ferries.map((f) => {
          const other = from ? (f.from === from ? f.to : f.from) : null;
          return (
            <tr key={`${f.from}|${f.to}`} onClick={() => onFocus(other ?? f.from)}>
              <th>{other ? name(other) : `${name(f.from)} ⇄ ${name(f.to)}`}</th>
              <td>
                {f.length < 10 ? f.length.toFixed(1) : fmt.format(Math.round(f.length))} {u}
              </td>
              <td className="gz-dim">{f.rank === 'main' ? 'main' : 'local'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ArchipelagoEntry({ world, archipelago: a, calendar: cal, t, shipping, followId, onFocus, onFollow, onSelect, onMeasure }: Props & { archipelago: Archipelago }) {
  const u = world.units.abbr;
  const positions = useMemo(() => positionsAt(world.bodies, t), [world, t]);
  const places = archipelagoPlaces(world, a);
  const ferries = ferriesOf(world, a);
  const by = (k: SettlementKind) => (places ?? []).filter((s) => s.kind === k);
  const chief = shipping?.ports.find((pt) => pt.archipelago?.id === a.id);
  const seaRoutes = chief ? routesFrom(shipping, chief.body.id) : [];
  const land = a.islands.reduce((sum, i) => sum + Math.PI * i.radius * i.radius, 0);
  const b = bearingAt(a, t);
  const islands = [...a.islands].sort((x, y) => y.radius - x.radius);
  const centre = { x: 0, y: 0 };
  const here = (() => {
    const sx = a.islands.reduce((sum, i) => sum + positions.get(i.id)!.x, 0) / a.islands.length;
    const sy = a.islands.reduce((sum, i) => sum + positions.get(i.id)!.y, 0) / a.islands.length;
    return { x: sx, y: sy };
  })();
  const others = world.bodies
    .filter(isMajor)
    .map((o) => ({ b: o, d: distance(here, positions.get(o.id)!), bearing: bearingBetween(here, positions.get(o.id)!) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 6);

  return (
    <article className="gz-entry">
      <Head
        title={a.name}
        kind={`Archipelago of the ${a.belt.name} · ${plural(a.islands.length, 'island', 'islands')}${a.populated ? '' : ', uninhabited'}`}
      />
      <Actions id={a.id} followable followId={followId} onFocus={onFocus} onFollow={onFollow} onMeasure={onMeasure} />
      <Facts
        rows={[
          ['Breadth', `≈ ${fmt.format(Math.round(a.extent * 2))} ${u} across`],
          ['Land', `≈ ${fmt.format(Math.round(land / 10) * 10)} ${u}²`],
          ['Orbit', `${fmt.format(Math.round(a.orbitRadius))} ${u}, every ${formatDuration(cal, a.periodDays)}, all its islands together`],
          ['Bearing', `${deg(b)} ${compassPoint(b)} of ${world.central.name}, ${fmt.format(Math.round(distance(centre, here)))} ${u} out`],
        ]}
      />
      <Section title="Islands" count={a.islands.length}>
        <ul className="gz-list">
          {islands.map((i) => {
            const n = hasContinentMap(world, i) ? continentMap(world, i).settlements.length : null;
            return (
              <li key={i.id}>
                <button onClick={() => onFocus(i.id)}>
                  <span className="gz-name">{i.name}</span>
                  <span className="gz-meta">
                    {[`≈ ${fmt.format(Math.round(i.radius * 2))} ${u}`, n === null ? '' : n ? plural(n, 'place', 'places') : 'uninhabited'].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
      {places && places.length > 0 && (
        <Section title="Settlements" count={places.length}>
          <p className="gz-line">
            {(['city', 'town', 'village'] as SettlementKind[])
              .filter((k) => by(k).length > 0)
              .map((k) => count(by(k).length, k))
              .join(', ')}
            .
          </p>
          {by('city').length > 0 && (
            <p className="gz-line">
              <span className="gz-label">Cities</span> <Links items={by('city')} onFocus={onFocus} />
            </p>
          )}
          {by('town').length > 0 && (
            <p className="gz-line">
              <span className="gz-label">Towns</span> <Links items={by('town')} onFocus={onFocus} />
            </p>
          )}
          {by('village').length > 0 && (
            <p className="gz-line">
              <span className="gz-label">Villages</span> <Links items={by('village')} onFocus={onFocus} />
            </p>
          )}
        </Section>
      )}
      {ferries && ferries.length > 0 && (
        <Section title="Ferries" count={ferries.length}>
          <FerryList world={world} ferries={ferries} onFocus={onFocus} />
        </Section>
      )}
      {(chief || seaRoutes.length > 0) && (
        <Section title="Sea routes" count={seaRoutes.length}>
          {chief && (
            <p className="gz-line">
              <span className="gz-label">Chief port</span>{' '}
              <button className="link" onClick={() => onFocus(chief.id)}>
                {chief.settlement.name}
              </button>
              , on {chief.body.name}
            </p>
          )}
          <RouteList routes={seaRoutes} bodyId={chief!.body.id} world={world} onFocus={onFocus} />
        </Section>
      )}
      <Section title="Nearest continents on this date" open={false}>
        <table className="gz-table">
          <tbody>
            {others.map(({ b: o, d, bearing }) => (
              <tr key={o.id} onClick={() => onSelect(o.id)}>
                <th>{o.name}</th>
                <td>
                  {fmt.format(Math.round(d))} {u}
                </td>
                <td className="gz-dim">{deg(bearing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </article>
  );
}

function SettlementEntry({ world, body, settlement: st, shipping, onFocus, onMeasure }: Props & { body: Body; settlement: Settlement }) {
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
  const chief = shipping?.ports.some((pt) => pt.id === st.id);
  const seaRoutes = chief ? routesFrom(shipping, body.id) : [];
  const features = [chief ? 'the chief port' : st.port && 'a harbour', st.riverPort && 'a river port', st.river && !st.riverPort && 'on a river'].filter(Boolean);
  const ferries = (body.archipelago ? (ferriesOf(world, body.archipelago) ?? []) : map.ferries).filter((f) => f.from === st.id || f.to === st.id);

  return (
    <article className="gz-entry">
      <Head
        title={st.name}
        kind={`${cap(KIND[st.kind][0])} on ${body.name}${features.length ? `; ${features.join(', ')}` : ''}`}
      />
      <Actions id={st.id} followable={false} followId={null} onFocus={onFocus} onFollow={() => undefined} onMeasure={onMeasure} />
      <Facts
        rows={[
          ['Elevation', `${fmt.format(st.elevation)} m`],
          ['Position', `${fmt.format(Math.round(Math.hypot(st.x, st.y)))} ${u} ${compassPoint(bearingBetween({ x: 0, y: 0 }, st))} of ${body.name}'s centre`],
        ]}
      />
      {links.length > 0 && (
        <Section title="By road" count={links.length}>
          <table className="gz-table">
            <tbody>
              {links.map(({ r, other }) => (
                <tr key={`${r.from}-${r.to}`} onClick={() => onFocus(other!.id)}>
                  <th>{other!.name}</th>
                  <td>
                    {fmt.format(Math.round(r.length))} {u}
                  </td>
                  <td className="gz-dim">{r.rank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      {ferries.length > 0 && (
        <Section title="By ferry" count={ferries.length}>
          <FerryList world={world} ferries={ferries} onFocus={onFocus} from={st.id} />
        </Section>
      )}
      {seaRoutes.length > 0 && (
        <Section title="Sea routes" count={seaRoutes.length}>
          <RouteList routes={seaRoutes} bodyId={body.id} world={world} onFocus={onFocus} />
        </Section>
      )}
      <Section title="Nearest settlements" open={!links.length && !ferries.length}>
        <table className="gz-table">
          <tbody>
            {near.map(({ x, d }) => (
              <tr key={x.id} onClick={() => onFocus(x.id)}>
                <th>{x.name}</th>
                <td>
                  {fmt.format(Math.round(d))} {u}
                </td>
                <td className="gz-dim">{x.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </article>
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
    case 'ring':
      return `Orbits ${p.parent!.name} at ${fmt.format(p.orbitRadius)} ${u}, once every ${formatDuration(cal, p.periodDays)}`;
  }
}

function PlatformEntry({ world, platform: pf, calendar: cal, t, shipping, followId, onFocus, onFollow, onSelect, onMeasure }: Props & { platform: Platform }) {
  const u = world.units.abbr;
  const positions = useMemo(() => positionsAt(world.bodies, t), [world, t]);
  const here = useMemo<Point>(() => {
    const one = platformPositions([pf], t, positions);
    return { x: one[0], y: one[1] };
  }, [pf, t, positions]);
  const nearest = world.bodies
    .filter((b) => b.kind !== 'moon')
    .map((b) => ({ b, d: distance(here, positions.get(b.id)!), bearing: bearingBetween(here, positions.get(b.id)!) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);
  const onRoutes = (shipping?.routes ?? []).filter((r) => r.stops.includes(pf.id)).sort((a, b) => b.traffic - a.traffic);
  const breadth = pf.size.radius * 2;

  return (
    <article className="gz-entry">
      <Head
        title={pf.id}
        kind={`${pf.motion === 'anchored' ? 'Anchored' : 'Orbital'} platform · ${pf.size.name}${pf.size.like ? `, the size of ${pf.size.like}` : ''}`}
      />
      <Actions id={pf.id} followable={pf.motion !== 'anchored'} followId={followId} onFocus={onFocus} onFollow={onFollow} onMeasure={onMeasure} />
      <Facts
        rows={[
          ['Held by', pf.owner.name],
          ['Band', pf.band?.name.replace(/^The /, '') ?? '—'],
          ['Breadth', `≈ ${breadth < 1 ? breadth.toFixed(breadth < 0.1 ? 3 : 2) : fmt.format(breadth)} ${u}`],
          ['Station', describeMotion(pf, world, cal)],
        ]}
      />
      {onRoutes.length > 0 && (
        <Section title="Resupplies" count={onRoutes.length}>
          <ul className="gz-list">
            {onRoutes.map((r) => (
              <li key={r.id}>
                <button onClick={() => onFocus(r.id)}>
                  <span className="gz-name">
                    {portName(r.from)} ⇄ {portName(r.to)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Nearest places on this date" open={!onRoutes.length}>
        <table className="gz-table">
          <tbody>
            {nearest.map(({ b, d, bearing }) => (
              <tr key={b.id} onClick={() => onSelect(b.id)}>
                <th>{b.name}</th>
                <td>
                  {fmt.format(Math.round(d))} {u}
                </td>
                <td className="gz-dim">{deg(bearing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </article>
  );
}

function RouteEntry({ world, route: r, shipping, onFocus }: Props & { route: ShippingRoute | null }) {
  const u = world.units.abbr;
  if (!r) {
    return (
      <article className="gz-entry">
        <Head title="Route not running" kind="Imperial shipping" />
        <p className="hint">This route isn't among the busiest on the current date. Pick another from the Sea index.</p>
      </article>
    );
  }
  const ranked = [...(shipping?.routes ?? [])].sort((a, b) => b.traffic - a.traffic);
  const rank = ranked.findIndex((x) => x.id === r.id) + 1;
  return (
    <article className="gz-entry">
      <Head title={`${portName(r.from)} ⇄ ${portName(r.to)}`} kind="Imperial cargo route, as planned for this date" />
      <Actions id={r.id} followable={false} followId={null} onFocus={onFocus} onFollow={() => undefined} />
      <Facts
        rows={[
          [
            'Between',
            <>
              <button className="link" onClick={() => onFocus(r.from.id)}>
                {r.from.settlement.name}
              </button>{' '}
              and{' '}
              <button className="link" onClick={() => onFocus(r.to.id)}>
                {r.to.settlement.name}
              </button>
            </>,
          ],
          ['Distance', `${fmt.format(Math.round(r.length))} ${u} under sail`],
          ['Longest leg', `${fmt.format(Math.round(r.longestLeg))} ${u} (limit ${fmt.format(world.params.shipping.resupply_range)})`],
          ['Traffic', `${rank ? `${ordinal(rank)} busiest of ${ranked.length}` : ''} · ${Math.round(r.traffic * 100)}% of the busiest`],
        ]}
      />
      <Section title="Calls at" count={r.stops.length}>
        {r.stops.length ? (
          <ol className="gz-stops">
            {r.stops.map((id) => (
              <li key={id}>
                <button className="link" onClick={() => onFocus(id)}>
                  {id}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="hint">Sails direct, within one resupply range.</p>
        )}
      </Section>
    </article>
  );
}
