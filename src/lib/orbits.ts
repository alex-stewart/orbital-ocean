import type { Belt, Body, Islet } from './world';

/**
 * Map coordinates: x east, y SOUTH (screen-down), in IL, with the central
 * isle at the origin. Bearings are compass bearings (0 = north, clockwise),
 * so an increasing bearing is clockwise motion on the map.
 */
export interface Point {
  x: number;
  y: number;
}

const RAD = Math.PI / 180;

export function bearingAt(orbit: { bearing: number; periodDays: number }, t: number): number {
  if (!Number.isFinite(orbit.periodDays)) return orbit.bearing;
  const b = orbit.bearing + (360 * t) / orbit.periodDays;
  return ((b % 360) + 360) % 360;
}

export function polar(r: number, bearingDeg: number): Point {
  return { x: r * Math.sin(bearingDeg * RAD), y: -r * Math.cos(bearingDeg * RAD) };
}

/** Absolute map position of a body at day `t`. */
export function bodyPosition(body: Body, t: number): Point {
  if (!body.parent) return { x: 0, y: 0 };
  const p = bodyPosition(body.parent, t);
  const o = polar(body.orbitRadius, bearingAt(body, t));
  return { x: p.x + o.x, y: p.y + o.y };
}

export function positionsAt(bodies: Body[], t: number): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const b of bodies) {
    const p = b.parent ? out.get(b.parent.id) ?? bodyPosition(b.parent, t) : { x: 0, y: 0 };
    const o = b.parent ? polar(b.orbitRadius, bearingAt(b, t)) : { x: 0, y: 0 };
    out.set(b.id, { x: p.x + o.x, y: p.y + o.y });
  }
  return out;
}

export function isletPosition(islet: Islet, t: number): Point {
  return polar(islet.orbitRadius, bearingAt(islet, t));
}

export function beltPositions(belt: Belt, t: number): Point[] {
  return belt.islets.map((i) => isletPosition(i, t));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Compass bearing from a to b, degrees. */
export function bearingBetween(a: Point, b: Point): number {
  const deg = Math.atan2(b.x - a.x, -(b.y - a.y)) / RAD;
  return (deg + 360) % 360;
}

export function compassPoint(bearing: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(bearing / 22.5) % 16];
}
