import { polar } from '../orbits';
import type { Archipelago, Belt, World } from '../world';
import { continentMap } from './index';
import type { Settlement, SettlementKind } from './settlements';

/**
 * Settling a belt: it has as many places as a continent of its land would
 * (its land area at the belt's density), shared among its populated
 * archipelagos by land area, at least a village each, so the small ones are
 * settled like moons. Within an archipelago the larger places go on the larger
 * islands and villages spread across their neighbours, so a town or city sits
 * amid a cluster of island villages. Ferries join them.
 */

export type KindCounts = Record<SettlementKind, number>;

const plans = new WeakMap<World, Map<string, Map<string, KindCounts>>>();

const islandArea = (a: Archipelago) => a.islands.reduce((s, i) => s + Math.PI * i.radius * i.radius, 0);

/** How many places each populated archipelago of a belt gets. */
function beltShares(world: World, belt: Belt): Map<string, number> {
  const density = world.params.settlements.belt_density[belt.id] ?? 0;
  const land = belt.archipelagos.reduce((s, a) => s + islandArea(a), 0);
  const settled = belt.archipelagos.filter((a) => a.populated && a.islands.length);
  const total = Math.max(settled.length, Math.round((land / 10_000) * density));
  const settledLand = settled.reduce((s, a) => s + islandArea(a), 0) || 1;
  // Largest remainder, after the one village each.
  const spare = total - settled.length;
  const exact = settled.map((a) => (spare * islandArea(a)) / settledLand);
  const shares = exact.map(Math.floor);
  let left = spare - shares.reduce((s, v) => s + v, 0);
  const byRemainder = exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((x, y) => y.r - x.r);
  for (const { i } of byRemainder) {
    if (left-- <= 0) break;
    shares[i]++;
  }
  return new Map(settled.map((a, i) => [a.id, 1 + shares[i]]));
}

/** How many cities, towns and villages each island of an archipelago gets. */
export function archipelagoPlan(world: World, arch: Archipelago): Map<string, KindCounts> {
  let byArch = plans.get(world);
  if (!byArch) plans.set(world, (byArch = new Map()));
  const hit = byArch.get(arch.id);
  if (hit) return hit;

  const sp = world.params.settlements;
  const plan = new Map<string, KindCounts>(arch.islands.map((i) => [i.id, { city: 0, town: 0, village: 0 }]));
  byArch.set(arch.id, plan);
  const total = beltShares(world, arch.belt).get(arch.id) ?? 0;
  if (!total) return plan;

  // Like a continent's mix; a group of three or more gathers round a town.
  const want: KindCounts = {
    city: Math.round(total * sp.mix.city),
    town: Math.round(total * sp.mix.town),
    village: 0,
  };
  if (total >= sp.minimum.city_from) want.city = Math.max(1, want.city);
  if (total >= 3 && want.city + want.town === 0) want.town = 1;
  want.village = Math.max(0, total - want.city - want.town);

  // Largest islands first: one city or town each while they last, then villages
  // first to any island still empty (the neighbours), the rest by island size.
  const islands = [...arch.islands].sort((a, b) => b.radius - a.radius);
  let next = 0;
  const give = (kind: SettlementKind) => {
    const island = islands[Math.min(next, islands.length - 1)];
    plan.get(island.id)![kind]++;
    if (next < islands.length - 1) next++;
  };
  for (let c = 0; c < want.city; c++) give('city');
  for (let t = 0; t < want.town; t++) give('town');
  let villages = want.village;
  for (const island of islands) {
    if (!villages) break;
    const counts = plan.get(island.id)!;
    if (counts.city + counts.town + counts.village === 0) {
      counts.village++;
      villages--;
    }
  }
  const weights = islands.map((i) => i.radius * i.radius);
  const sum = weights.reduce((a, b) => a + b, 0);
  for (let v = 0; v < villages; v++) {
    // Largest remaining share of area gets the next village.
    let best = 0;
    let bestScore = -Infinity;
    islands.forEach((island, k) => {
      const c = plan.get(island.id)!;
      const score = weights[k] / sum - (c.village + c.town + c.city) / (total || 1);
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    });
    plan.get(islands[best].id)!.village++;
  }
  return plan;
}

export interface Ferry {
  /** Settlement ids. */
  from: string;
  to: string;
  /** Main ferries join towns and cities; local ones reach villages. */
  rank: 'main' | 'local';
  /** Crossing distance, IL (constant: the archipelago turns as one). */
  length: number;
}

const ferryCache = new WeakMap<World, Map<string, Ferry[]>>();

/**
 * Ferries joining the settled islands of an archipelago: a minimum spanning
 * network over the islands, each link between the closest pair of places on
 * the two islands. Builds those islands' maps if they aren't built yet.
 */
export function archipelagoFerries(world: World, arch: Archipelago): Ferry[] {
  let byArch = ferryCache.get(world);
  if (!byArch) ferryCache.set(world, (byArch = new Map()));
  const hit = byArch.get(arch.id);
  if (hit) return hit;

  // Every settled island's places, at their day-0 positions (the group is rigid,
  // so distances between them never change).
  const groups = arch.islands
    .map((island) => {
      const c = polar(island.orbitRadius, island.bearing);
      return {
        island,
        places: continentMap(world, island).settlements.map((s) => ({ s, x: c.x + s.x, y: c.y + s.y })),
      };
    })
    .filter((g) => g.places.length);

  type Link = { a: number; b: number; from: Settlement; to: Settlement; d: number };
  const links: Link[] = [];
  for (let a = 0; a < groups.length; a++)
    for (let b = a + 1; b < groups.length; b++) {
      let best: Link | null = null;
      for (const p of groups[a].places)
        for (const q of groups[b].places) {
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (!best || d < best.d) best = { a, b, from: p.s, to: q.s, d };
        }
      if (best) links.push(best);
    }
  links.sort((x, y) => x.d - y.d);
  const parent = groups.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const ferries: Ferry[] = [];
  for (const l of links) {
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    ferries.push({
      from: l.from.id,
      to: l.to.id,
      rank: l.from.kind !== 'village' && l.to.kind !== 'village' ? 'main' : 'local',
      length: l.d,
    });
  }
  byArch.set(arch.id, ferries);
  return ferries;
}
