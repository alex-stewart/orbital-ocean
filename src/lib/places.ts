import { bearingBetween, compassPoint, platformPositions, positionsAt, type Point } from './orbits';
import { routeGeometry, type ShippingNetwork } from './shipping';
import { findSettlement } from './terrain';
import type { World } from './world';

/**
 * Anything with an id on the chart: a body, a settlement (`body/slug`), a
 * platform (register number) or a shipping route (`route:a|b`).
 */

/** Map position of a place at day `t` (a route's midpoint for routes). */
export function placePosition(world: World, id: string, t: number, shipping?: ShippingNetwork | null): Point | null {
  const bodies = positionsAt(world.bodies, t);
  const body = bodies.get(id);
  if (body) return body;
  const st = findSettlement(world, id);
  if (st) {
    const c = bodies.get(st.body.id)!;
    return { x: c.x + st.settlement.x, y: c.y + st.settlement.y };
  }
  const i = world.platformIndex.get(id);
  if (i !== undefined) {
    const xy = platformPositions([world.platforms[i]], t, bodies);
    return { x: xy[0], y: xy[1] };
  }
  const route = shipping?.routes.find((r) => r.id === id);
  if (route) {
    const pts = routeGeometry(world, route, bodies, platformPositions(world.platforms, t, bodies));
    return pts[Math.floor(pts.length / 2)];
  }
  return null;
}

export interface PlaceSummary {
  title: string;
  detail: string;
}

const fmt = new Intl.NumberFormat('en-GB');

/** A one-line description, for tooltips and banners. */
export function placeSummary(world: World, id: string, shipping?: ShippingNetwork | null): PlaceSummary | null {
  const u = world.units.abbr;
  const body = world.bodies.find((b) => b.id === id);
  if (body) {
    const band = world.bands.find((b) => {
      const r = body.kind === 'moon' ? (body.parent!.parent ? body.parent!.orbitRadius : 0) : body.orbitRadius;
      return r >= b.innerRadius && r < b.outerRadius;
    });
    const kind = body.kind === 'central' ? 'Central landmass' : body.kind === 'moon' ? `Moon of ${body.parent!.name}` : `Continent ${body.position ?? ''}`.trim();
    return { title: body.name, detail: [kind, band?.name.replace(/^The /, '')].filter(Boolean).join(' · ') };
  }
  const st = findSettlement(world, id);
  if (st) {
    const s = st.settlement;
    const extras = [s.port && 'harbour', s.riverPort && 'river port'].filter(Boolean).join(', ');
    return {
      title: s.name,
      detail: `${s.kind[0].toUpperCase()}${s.kind.slice(1)} on ${st.body.name} · ${fmt.format(s.elevation)} m${extras ? ` · ${extras}` : ''}`,
    };
  }
  const i = world.platformIndex.get(id);
  if (i !== undefined) {
    const p = world.platforms[i];
    return { title: p.id, detail: `${p.size.name} · ${p.motion} · ${p.owner.name}` };
  }
  const route = shipping?.routes.find((r) => r.id === id);
  if (route) {
    return {
      title: `${route.from.body.name} ⇄ ${route.to.body.name}`,
      detail: `Cargo route · ${fmt.format(Math.round(route.length))} ${u} · ${route.stops.length} stops`,
    };
  }
  return null;
}

/** "2,345 IL, bearing 047° NE" between two places on day `t`. */
export function measureBetween(world: World, a: string, b: string, t: number, shipping?: ShippingNetwork | null): string | null {
  const p = placePosition(world, a, t, shipping);
  const q = placePosition(world, b, t, shipping);
  if (!p || !q) return null;
  const d = Math.hypot(q.x - p.x, q.y - p.y);
  const brg = bearingBetween(p, q);
  return `${d < 10 ? d.toFixed(2) : fmt.format(Math.round(d))} ${world.units.abbr}, bearing ${Math.round(brg).toString().padStart(3, '0')}° ${compassPoint(brg)}`;
}
