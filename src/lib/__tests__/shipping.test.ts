import { describe, expect, it } from 'vitest';
import { platformPositions, positionsAt } from '../orbits';
import { planShipping } from '../shipping';
import { continentMap, mappedBodies } from '../terrain';
import { cal, loadWorld } from './world';

const world = loadWorld();
for (const b of mappedBodies(world)) continentMap(world, b);
const p = world.params.shipping;

function plan(t: number) {
  const bodies = positionsAt(world.bodies, t);
  return { net: planShipping(world, t, bodies, platformPositions(world.platforms, t, bodies)), bodies };
}

describe('shipping', () => {
  const { net, bodies } = plan(cal.defaultDay);

  it('trades through one chief port per body with a harbour', () => {
    expect(net.ports.length).toBeGreaterThan(8);
    expect(new Set(net.ports.map((x) => x.body.id)).size).toBe(net.ports.length);
    for (const port of net.ports) expect(port.settlement.port).toBe(true);
  });

  it('plans the busiest routes, and gives every reachable port at least one', () => {
    expect(net.routes.length).toBeGreaterThanOrEqual(Math.min(p.max_routes, 10));
    expect(Math.max(...net.routes.map((r) => r.traffic))).toBe(1);
    const served = new Set(net.routes.flatMap((r) => [r.from.id, r.to.id]));
    const stranded = net.ports.filter((x) => !served.has(x.id));
    // A stranded port must have no reachable partner at all.
    for (const s of stranded) expect(net.unreachable.some(([a, b]) => a === s.id || b === s.id)).toBe(true);
  });

  it('never sails a leg longer than the resupply range', () => {
    for (const r of net.routes) {
      expect(r.longestLeg).toBeLessThanOrEqual(p.resupply_range + 1e-6);
      // Legs between stops (excluding the short quay-to-roadstead hops at each end).
      for (let k = 2; k < r.points.length - 1; k++) {
        const d = Math.hypot(r.points[k].x - r.points[k - 1].x, r.points[k].y - r.points[k - 1].y);
        expect(d).toBeLessThanOrEqual(p.resupply_range + 1e-6);
      }
    }
  });

  it('never crosses land', () => {
    for (const r of net.routes) {
      for (let k = 2; k < r.points.length - 1; k++) {
        const a = r.points[k - 1];
        const b = r.points[k];
        for (const body of world.bodies) {
          const c = bodies.get(body.id)!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const u = Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy)));
          expect(Math.hypot(a.x + u * dx - c.x, a.y + u * dy - c.y), `${r.id} over ${body.id}`).toBeGreaterThan(body.outerRadius);
        }
      }
    }
  });

  it('calls at resupply platforms, which become hubs', () => {
    const allStops = net.routes.flatMap((r) => r.stops);
    expect(allStops.length).toBeGreaterThan(net.routes.length);
    for (const id of allStops) {
      const pf = world.platforms[world.platformIndex.get(id)!];
      expect(pf.owner.imperial).toBe(true);
      expect(p.resupply_classes).toContain(pf.size.id);
    }
    expect(net.hubs.size).toBeGreaterThan(0);
  });

  it('re-forms as the bodies move', () => {
    const later = plan(cal.defaultDay + 3 * cal.yearLength).net;
    const key = (n: typeof net) => n.routes.map((r) => r.stops.join(',')).join(';');
    expect(key(later)).not.toBe(key(net));
  });
});
