import type { Point } from '../../lib/orbits';
import { routeGeometry, type ShippingNetwork } from '../../lib/shipping';
import type { RenderInput } from './render';
import { theme } from './theme';

/** A route as drawn, in screen pixels, for hit testing. */
export interface RouteLine {
  id: string;
  points: number[];
}

/**
 * Imperial cargo routes: dashed lines whose weight shows their traffic, with
 * rings marking the resupply platforms they call at (larger = busier).
 */
export function drawShipping(
  ctx: CanvasRenderingContext2D,
  s: RenderInput,
  net: ShippingNetwork | null,
  toScreen: (p: Point) => Point,
): RouteLine[] {
  if (!net || !s.layers.shipping) return [];
  const lines: RouteLine[] = [];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Quietest first, so busy routes sit on top.
  const ordered = [...net.routes].sort((a, b) => a.traffic - b.traffic);
  for (const r of ordered) {
    const pts = routeGeometry(s.world, r, s.positions, s.platformXY).map(toScreen);
    const selected = r.id === s.selectedId || r.id === s.hoveredId;
    const flat: number[] = [];
    ctx.beginPath();
    pts.forEach((p, i) => {
      flat.push(p.x, p.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    // A pale casing keeps the route legible over orbits and graticule.
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(244, 236, 214, 0.55)';
    ctx.lineWidth = 2.5 + 3 * r.traffic;
    ctx.stroke();
    ctx.strokeStyle = selected ? theme.accent : theme.imperialWash(0.45 + 0.5 * r.traffic);
    ctx.lineWidth = 0.9 + 2.2 * r.traffic + (selected ? 0.8 : 0);
    ctx.setLineDash([7, 4]);
    ctx.stroke();
    lines.push({ id: r.id, points: flat });
  }
  ctx.setLineDash([]);

  // Hubs: resupply platforms on routes, ringed by how much traffic passes;
  // smaller when zoomed far out, where many crowd together.
  const top = Math.max(...net.hubs.values(), 1e-9);
  const z = 0.45 + 0.55 * Math.min(1, Math.max(0, (s.view.scale - 0.03) / 0.2));
  for (const [id, traffic] of net.hubs) {
    const i = s.world.platformIndex.get(id);
    if (i === undefined) continue;
    const p = toScreen({ x: s.platformXY[i * 2], y: s.platformXY[i * 2 + 1] });
    if (p.x < -10 || p.y < -10 || p.x > s.width + 10 || p.y > s.height + 10) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (2.5 + 3 * Math.sqrt(traffic / top)) * z, 0, Math.PI * 2);
    ctx.fillStyle = theme.paper;
    ctx.fill();
    ctx.strokeStyle = theme.imperial;
    ctx.lineWidth = 1.4 * z;
    ctx.stroke();
  }
  ctx.restore();
  return lines;
}

/** Distance from a point to a polyline, in px. */
export function distanceToLine(x: number, y: number, pts: number[]): number {
  let best = Infinity;
  for (let i = 2; i < pts.length; i += 2) {
    const ax = pts[i - 2];
    const ay = pts[i - 1];
    const dx = pts[i] - ax;
    const dy = pts[i + 1] - ay;
    const l2 = dx * dx + dy * dy || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(ax + u * dx - x, ay + u * dy - y));
  }
  return best;
}
