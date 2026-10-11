import type { Point } from '../orbits';
import { continentMap } from '../terrain';
import type { Settlement, SettlementKind } from '../terrain';
import type { Body, World } from '../world';

/**
 * A rough model of sea trade, used only when siting platforms. Each body
 * (or settled archipelago) trades through its largest harbour; how much two
 * ports trade grows with the places they serve and falls with distance.
 * The Atlas itself doesn't plan or draw voyages.
 */

export interface Trader {
  body: Body;
  settlement: Settlement;
  /** The places it serves, weighted by size. */
  weight: number;
  /** The continent it belongs to (its own, or its moon's), if any. */
  continent: Body | null;
}

const RANK: Record<SettlementKind, number> = { city: 0, town: 1, village: 2 };

/** Every body's chief harbour, and one per settled archipelago. Builds any maps not yet built. */
export function traders(world: World, weights: Record<SettlementKind, number>): Trader[] {
  const out: Trader[] = [];
  const best = (bodies: Body[]) => {
    let pick: { body: Body; settlement: Settlement } | null = null;
    let weight = 0;
    for (const body of bodies)
      for (const s of continentMap(world, body).settlements) {
        weight += weights[s.kind];
        if (s.port && (!pick || RANK[s.kind] < RANK[pick.settlement.kind])) pick = { body, settlement: s };
      }
    return pick && { ...pick, weight };
  };
  const continentOf = (b: Body) => (b.kind === 'isle' ? b : b.parent?.kind === 'isle' ? b.parent : null);
  for (const body of world.bodies) {
    if (body.archipelago) continue;
    const b = best([body]);
    if (b) out.push({ ...b, continent: continentOf(body) });
  }
  for (const arch of world.archipelagos) {
    const b = best(arch.islands);
    if (b) out.push({ ...b, continent: null });
  }
  return out;
}

/** Where each trader's harbour is, given body positions. */
export function harbours(list: Trader[], positions: Map<string, Point>): Point[] {
  return list.map((p) => {
    const c = positions.get(p.body.id)!;
    return { x: c.x + p.settlement.x, y: c.y + p.settlement.y };
  });
}

/** The pairs that trade most on a date: the `max` busiest, plus each port's best partner. */
export function busiestPairs(list: Trader[], at: Point[], decay: number, max: number): { a: number; b: number; trade: number }[] {
  const pairs: { a: number; b: number; trade: number }[] = [];
  for (let a = 0; a < list.length; a++)
    for (let b = a + 1; b < list.length; b++) {
      const d = Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y);
      pairs.push({ a, b, trade: (list[a].weight * list[b].weight) / Math.max(1, d) ** decay });
    }
  pairs.sort((x, y) => y.trade - x.trade);
  const chosen = pairs.slice(0, max);
  for (let i = 0; i < list.length; i++) {
    if (chosen.some((c) => c.a === i || c.b === i)) continue;
    const best = pairs.find((c) => c.a === i || c.b === i);
    if (best) chosen.push(best);
  }
  return chosen;
}

/**
 * Which points can reach which, hopping no further than `range` at a time:
 * a component id per point. (Ships call at harbours and resupply platforms.)
 */
export function hopGroups(points: Point[], range: number): Int32Array {
  const parent = Int32Array.from(points, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const grid = new Map<string, number[]>();
  points.forEach((p, i) => {
    const key = `${Math.floor(p.x / range)},${Math.floor(p.y / range)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  });
  points.forEach((p, i) => {
    const gx = Math.floor(p.x / range);
    const gy = Math.floor(p.y / range);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++)
        for (const j of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (j <= i || Math.hypot(points[j].x - p.x, points[j].y - p.y) > range) continue;
          parent[find(i)] = find(j);
        }
  });
  return Int32Array.from(points, (_, i) => find(i));
}
