import { chaikin, MinHeap, polylineLength, simplify } from './geometry';
import { cellAt, cellX, cellY, NEIGHBOURS, type Grid } from './grid';
import type { Hydrology } from './hydrology';
import type { RoadParams } from '../../parameters/schema';
import type { Settlement, SettlementKind } from './settlements';

export type RoadRank = 'highway' | 'road' | 'track';

export interface Road {
  /** Settlement ids at each end (null if a drawn road ends elsewhere). */
  from: string | null;
  to: string | null;
  rank: RoadRank;
  /** Polyline, local IL. */
  points: number[];
  /** Length along the road, IL. */
  length: number;
  /** Bridges over rivers along the way. */
  bridges: number;
}

const RANK: Record<SettlementKind, number> = { city: 0, town: 1, village: 2 };

/** City–city links are highways, links involving a village are tracks. */
function rankOf(a: SettlementKind, b: SettlementKind): RoadRank {
  const worst = Math.max(RANK[a], RANK[b]);
  return worst === 0 ? 'highway' : worst === 1 ? 'road' : 'track';
}

/**
 * Which settlements to join: a minimum spanning tree (so every settlement
 * on a landmass is reachable), plus extra links between nearby larger
 * places, the way trunk roads form loops. Candidate links come from each
 * settlement's nearest neighbours.
 */
export function plannedLinks(settlements: Settlement[], p: RoadParams): [number, number][] {
  const n = settlements.length;
  const d = (a: number, b: number) => Math.hypot(settlements[a].x - settlements[b].x, settlements[a].y - settlements[b].y);
  const cand = new Map<string, [number, number, number]>();
  for (let a = 0; a < n; a++) {
    const near = Array.from({ length: n }, (_, b) => b)
      .filter((b) => b !== a)
      .sort((p, q) => d(a, p) - d(a, q))
      .slice(0, p.neighbours);
    for (const b of near) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      // Larger places attract: weight links by importance, not just distance.
      const w = d(a, b) * (1 + 0.3 * (RANK[settlements[a].kind] + RANK[settlements[b].kind]));
      cand.set(key, [Math.min(a, b), Math.max(a, b), w]);
    }
  }
  const edges = [...cand.values()].sort((p, q) => p[2] - q[2]);
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const links: [number, number][] = [];
  const extras: [number, number][] = [];
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
      links.push([a, b]);
    } else if (settlements[a].kind !== 'village' && settlements[b].kind !== 'village') {
      extras.push([a, b]);
    }
  }
  return [...links, ...extras.slice(0, Math.ceil(n / p.extra_link_every))];
}

export interface RouteTerrain {
  grid: Grid;
  elevation: Float32Array;
  land: Uint8Array;
  water: Hydrology;
}

/**
 * Route roads over the terrain with A*. Cost per step grows with the square
 * of the gradient (roads avoid steep ground and wind up hills), a little
 * with altitude; sea and lakes are impassable; entering a river cell costs a
 * bridge. Earlier, more important roads lower the cost of the cells they use,
 * so later roads join them rather than running alongside.
 */
export function routeRoads(settlements: Settlement[], t: RouteTerrain, p: RoadParams): Road[] {
  const { grid: g, elevation, land, water } = t;
  const { n } = g;
  const N = n * n;
  const used = new Float32Array(N).fill(1);
  const links = plannedLinks(settlements, p).sort(
    (p, q) =>
      Math.max(RANK[settlements[p[0]].kind], RANK[settlements[p[1]].kind]) -
      Math.max(RANK[settlements[q[0]].kind], RANK[settlements[q[1]].kind]),
  );
  const passable = (k: number) => land[k] === 1 && water.lake[k] < 0;
  const roads: Road[] = [];

  /** A* between two settlements; adds the road and returns true if one exists. */
  const route = (ia: number, ib: number): boolean => {
    const A = settlements[ia];
    const B = settlements[ib];
    const start = cellAt(g, A.x, A.y);
    const goal = cellAt(g, B.x, B.y);
    if (start < 0 || goal < 0 || !passable(start) || !passable(goal)) return false;
    const gx = goal % n;
    const gy = (goal / n) | 0;
    const cost = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    cost[start] = 0;
    heap.push(0, start);
    let found = false;
    let expansions = 0;
    while (heap.size && expansions++ < N * 4) {
      const k = heap.pop();
      if (k === goal) {
        found = true;
        break;
      }
      const i = k % n;
      const j = (k / n) | 0;
      for (const [di, dj, len] of NEIGHBOURS) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const m = jj * n + ii;
        if (!passable(m)) continue;
        const grade = Math.abs(elevation[m] - elevation[k]) / (len * g.cell * 1000);
        let step = len * (1 + Math.pow(grade / p.grade_scale, 2) * p.slope_weight + elevation[m] / p.height_scale) * used[m];
        if (water.riverMask[m] && !water.riverMask[k]) step += p.bridge;
        const c = cost[k] + step;
        if (c < cost[m]) {
          cost[m] = c;
          from[m] = k;
          // Heuristic: straight-line distance, admissible since every step costs ≥ its length × reuse.
          heap.push(c + Math.hypot(ii - gx, jj - gy) * p.reuse, m);
        }
      }
    }
    if (!found) return false; // on separate landmasses: a job for sea routes

    const cells: number[] = [];
    for (let k = goal; k >= 0; k = from[k]) cells.push(k);
    cells.reverse();
    let bridges = 0;
    const pts: number[] = [A.x, A.y];
    for (let c = 1; c < cells.length - 1; c++) {
      const k = cells[c];
      if (water.riverMask[k] && !water.riverMask[cells[c - 1]]) bridges++;
      pts.push(cellX(g, k % n), cellY(g, (k / n) | 0));
      used[k] = Math.min(used[k], p.reuse);
    }
    pts.push(B.x, B.y);
    const smooth = chaikin(simplify(pts, g.cell * 0.35), 3);
    roads.push({
      from: A.id,
      to: B.id,
      rank: rankOf(A.kind, B.kind),
      points: smooth,
      length: polylineLength(smooth),
      bridges,
    });
    return true;
  };

  for (const [ia, ib] of links) route(ia, ib);

  // Anything left unconnected (its planned link failed): try its nearest neighbours.
  const linked = new Set(roads.flatMap((r) => [r.from, r.to]));
  settlements.forEach((A, ia) => {
    if (linked.has(A.id) || settlements.length < 2) return;
    const near = settlements
      .map((B, ib) => ({ ib, d: Math.hypot(B.x - A.x, B.y - A.y) }))
      .filter(({ ib }) => ib !== ia)
      .sort((p, q) => p.d - q.d)
      .slice(0, 6);
    for (const { ib } of near) if (route(ia, ib)) break;
  });
  return roads;
}
