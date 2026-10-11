import type { ShippingParams } from '../parameters/schema';
import { MinHeap } from './terrain/geometry';
import { continentMap, hasContinentMap, type Settlement } from './terrain';
import type { Point } from './orbits';
import type { Body, World } from './world';

/**
 * Imperial cargo routes, planned for one date.
 *
 * Each body trades through its chief port: its largest harbour. Ships leave
 * from a roadstead just offshore and hop between roadsteads and resupply
 * platforms (larger Imperial ones), never sailing a leg longer than the
 * resupply range and never crossing land. Among valid routes the cheapest
 * wins; long open-sea legs cost more than the same distance in short hops,
 * and crossing a belt of islets costs extra. Trade between two ports follows
 * a gravity model: the product of their bodies' weights over distance.
 *
 * Positions change with the date, so the network is re-planned as time moves.
 */

export interface Port {
  /** The port settlement's id. */
  id: string;
  body: Body;
  settlement: Settlement;
  /** Trade weight of the body it serves (its settlements, by size). */
  weight: number;
}

export interface ShippingRoute {
  /** `route:<port id>|<port id>` */
  id: string;
  from: Port;
  to: Port;
  /** Relative cargo volume, 0–1 (1 = the busiest route). */
  traffic: number;
  /** The voyage as planned, map coordinates: port, roadstead, stops…, roadstead, port. */
  points: Point[];
  /** What the voyage passes, for re-placing it as things move: stops as platform indices. */
  stopIndices: number[];
  /** Resupply platforms called at, in order (register numbers). */
  stops: string[];
  /** Sailing distance, IL. */
  length: number;
  /** The longest leg between resupply points, IL. */
  longestLeg: number;
}

export interface ShippingNetwork {
  t: number;
  ports: Port[];
  routes: ShippingRoute[];
  /** Traffic through each resupply platform (by register number), summed over routes. */
  hubs: Map<string, number>;
  /** Port pairs wanted but with no chain of resupply points between them. */
  unreachable: [string, string][];
}

const RANK = { city: 0, town: 1, village: 2 } as const;

/** Each body's chief port (largest harbour), if its map is built and it has one. */
export function chiefPorts(world: World, p: ShippingParams): Port[] {
  const ports: Port[] = [];
  for (const body of world.bodies) {
    if (!hasContinentMap(world, body)) continue;
    const map = continentMap(world, body);
    const harbours = map.settlements.filter((s) => s.port).sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    if (!harbours.length) continue;
    const weight = map.settlements.reduce((sum, s) => sum + p.weights[s.kind], 0);
    ports.push({ id: harbours[0].id, body, settlement: harbours[0], weight });
  }
  return ports;
}

/** Where a port's roadstead lies: straight out from its body's centre, clear of the coast. */
function roadstead(port: Port, centre: Point, margin: number): Point {
  const s = port.settlement;
  const d = Math.hypot(s.x, s.y) || 1;
  const out = port.body.outerRadius + margin;
  return { x: centre.x + (s.x / d) * out, y: centre.y + (s.y / d) * out };
}

/**
 * A planned route's line at the current positions. Routes are re-planned only
 * every so often while time plays; this keeps their lines on the moving ports
 * and platforms in between.
 */
export function routeGeometry(world: World, r: ShippingRoute, bodyPositions: Map<string, Point>, platformXY: Float64Array): Point[] {
  const margin = world.params.shipping.coast_margin;
  const ends = [r.from, r.to].map((port) => {
    const c = bodyPositions.get(port.body.id)!;
    return { quay: { x: c.x + port.settlement.x, y: c.y + port.settlement.y }, road: roadstead(port, c, margin) };
  });
  return [
    ends[0].quay,
    ends[0].road,
    ...r.stopIndices.map((i) => ({ x: platformXY[i * 2], y: platformXY[i * 2 + 1] })),
    ends[1].road,
    ends[1].quay,
  ];
}

interface Node {
  x: number;
  y: number;
  /** Port index for roadsteads, else -1. */
  port: number;
  /** Platform register number and index for resupply stops. */
  platform: string | null;
  index: number;
}

/**
 * Plan the network at day `t`. `bodyPositions` and `platformXY` must be for `t`.
 */
export function planShipping(
  world: World,
  t: number,
  bodyPositions: Map<string, Point>,
  platformXY: Float64Array,
): ShippingNetwork {
  const p = world.params.shipping;
  const ports = chiefPorts(world, p);
  const range = p.resupply_range;

  // Nodes: a roadstead off each port, then every resupply platform.
  const nodes: Node[] = ports.map((port, i) => ({
    ...roadstead(port, bodyPositions.get(port.body.id)!, p.coast_margin),
    port: i,
    platform: null,
    index: -1,
  }));
  const classes = new Set(p.resupply_classes);
  world.platforms.forEach((pf, i) => {
    if (pf.owner.imperial && classes.has(pf.size.id)) {
      nodes.push({ x: platformXY[i * 2], y: platformXY[i * 2 + 1], port: -1, platform: pf.id, index: i });
    }
  });

  // Bodies as obstacles: circles of their coast's reach plus a margin.
  const obstacles = world.bodies.map((b) => {
    const c = bodyPositions.get(b.id)!;
    return { x: c.x, y: c.y, r: b.outerRadius + p.coast_margin * 0.5 };
  });
  const clear = (a: Node, b: Node) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    for (const o of obstacles) {
      // Quick reject by bounding box.
      if (o.x + o.r < Math.min(a.x, b.x) || o.x - o.r > Math.max(a.x, b.x) || o.y + o.r < Math.min(a.y, b.y) || o.y - o.r > Math.max(a.y, b.y)) continue;
      const u = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / l2));
      if (Math.hypot(a.x + u * dx - o.x, a.y + u * dy - o.y) < o.r) return false;
    }
    return true;
  };
  // Does a leg pass through a belt? Compare its nearest and furthest distance from the centre.
  const crossesBelt = (a: Node, b: Node) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const u = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy)));
    const near = Math.hypot(a.x + u * dx, a.y + u * dy);
    const far = Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
    return world.belts.some((bt) => near < bt.outerRadius && far > bt.innerRadius);
  };
  const legCost = (a: Node, b: Node, len: number) =>
    len * (1 + p.open_sea * (len / range) ** 2) * (crossesBelt(a, b) ? p.belt : 1);

  // Edges between nodes within range, found through a coarse grid.
  const cell = range;
  const grid = new Map<string, number[]>();
  nodes.forEach((n, i) => {
    const key = `${Math.floor(n.x / cell)},${Math.floor(n.y / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  });
  const adj: { to: number; cost: number; len: number }[][] = nodes.map(() => []);
  nodes.forEach((a, i) => {
    const gx = Math.floor(a.x / cell);
    const gy = Math.floor(a.y / cell);
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++)
        for (const j of grid.get(`${gx + ox},${gy + oy}`) ?? []) {
          if (j <= i) continue;
          const b = nodes[j];
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len > range || len === 0 || !clear(a, b)) continue;
          const cost = legCost(a, b, len);
          adj[i].push({ to: j, cost, len });
          adj[j].push({ to: i, cost, len });
        }
  });

  // Which pairs trade: the busiest by the gravity model, plus each port's best partner.
  const pairs: { a: number; b: number; trade: number }[] = [];
  for (let a = 0; a < ports.length; a++)
    for (let b = a + 1; b < ports.length; b++) {
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      pairs.push({ a, b, trade: (ports[a].weight * ports[b].weight) / Math.max(1, d) ** p.distance_decay });
    }
  pairs.sort((x, y) => y.trade - x.trade);

  // Shortest paths from each port (Dijkstra), computed on demand.
  const trees = new Map<number, { dist: Float64Array; prev: Int32Array }>();
  const tree = (src: number) => {
    let tr = trees.get(src);
    if (tr) return tr;
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const heap = new MinHeap();
    dist[src] = 0;
    heap.push(0, src);
    while (heap.size) {
      const u = heap.pop();
      if (heap.lastKey > dist[u]) continue;
      // A voyage may end at any port, but only passes through resupply platforms.
      if (u !== src && nodes[u].port >= 0) continue;
      for (const e of adj[u]) {
        const nd = dist[u] + e.cost;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
          heap.push(nd, e.to);
        }
      }
    }
    trees.set(src, (tr = { dist, prev }));
    return tr;
  };

  const chosen: typeof pairs = [];
  const served = new Set<number>();
  const unreachable: [string, string][] = [];
  const reachable = (a: number, b: number) => Number.isFinite(tree(a).dist[b]);
  for (const pr of pairs) {
    if (chosen.length >= p.max_routes) break;
    if (reachable(pr.a, pr.b)) {
      chosen.push(pr);
      served.add(pr.a).add(pr.b);
    } else unreachable.push([ports[pr.a].id, ports[pr.b].id]);
  }
  // Every port keeps at least its best reachable partner.
  for (let i = 0; i < ports.length; i++) {
    if (served.has(i)) continue;
    const best = pairs.find((pr) => (pr.a === i || pr.b === i) && reachable(pr.a, pr.b));
    if (best) {
      chosen.push(best);
      served.add(best.a).add(best.b);
    }
  }

  const maxTrade = Math.max(...chosen.map((c) => c.trade), 1e-9);
  const hubs = new Map<string, number>();
  const routes: ShippingRoute[] = chosen.map(({ a, b, trade }) => {
    const { prev } = tree(a);
    const path: number[] = [];
    for (let k = b; k >= 0; k = prev[k]) path.push(k);
    path.reverse();
    const traffic = trade / maxTrade;
    const stops = path.map((k) => nodes[k].platform).filter((x): x is string => !!x);
    const stopIndices = path.filter((k) => nodes[k].platform).map((k) => nodes[k].index);
    for (const s of stops) hubs.set(s, (hubs.get(s) ?? 0) + traffic);
    let length = 0;
    let longestLeg = 0;
    for (let k = 1; k < path.length; k++) {
      const leg = Math.hypot(nodes[path[k]].x - nodes[path[k - 1]].x, nodes[path[k]].y - nodes[path[k - 1]].y);
      length += leg;
      longestLeg = Math.max(longestLeg, leg);
    }
    const quay = (port: Port): Point => {
      const c = bodyPositions.get(port.body.id)!;
      return { x: c.x + port.settlement.x, y: c.y + port.settlement.y };
    };
    return {
      id: `route:${ports[a].id}|${ports[b].id}`,
      from: ports[a],
      to: ports[b],
      traffic,
      points: [quay(ports[a]), ...path.map((k) => ({ x: nodes[k].x, y: nodes[k].y })), quay(ports[b])],
      stops,
      stopIndices,
      length,
      longestLeg,
    };
  });

  return { t, ports, routes, hubs, unreachable };
}
