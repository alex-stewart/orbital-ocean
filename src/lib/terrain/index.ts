import type { Body, PlaceRow, World } from '../world';
import { contourLevels, isoSegments, joinSegments } from './contours';
import type { ContinentDesign } from './design';
import { contourElevation, generatedElevation } from './elevation';
import { chaikin, polylineLength } from './geometry';
import { cellAt, makeGrid, NEIGHBOURS, rasterize, sample, type Grid } from './grid';
import { hydrology, type River } from './hydrology';
import { slug } from './names';
import { routeRoads, type Road } from './routes';
import { placeSettlements, type Settlement, type SettlementKind } from './settlements';
import { archipelagoPlan, type Ferry } from './archipelago';

export type { Road, RoadRank } from './routes';
export type { Settlement, SettlementKind } from './settlements';
export type { River } from './hydrology';

/**
 * Everything drawn on a continent: terrain, water, settlements and roads,
 * in local coordinates (IL from the continent's centre, north up).
 * Built from a hand-drawn design where one exists, generated otherwise.
 */
export interface ContinentMap {
  id: string;
  source: 'designed' | 'generated';
  grid: Grid;
  /** Metres; -1 at sea. */
  elevation: Float32Array;
  land: Uint8Array;
  /** Lake id per cell, -1 if none. */
  lake: Int16Array;
  maxElevation: number;
  /** Contour lines by level, as polylines (closed ones repeat their first point). */
  contours: { level: number; lines: number[][] }[];
  /** Closed lake shorelines. */
  lakes: number[][];
  rivers: River[];
  settlements: Settlement[];
  roads: Road[];
  /** Ferries between the body's own islands (where its settlements stand on more than one). */
  ferries: Ferry[];
  /** Notes about a design (skipped shapes and why). */
  warnings: string[];
}

const cache = new WeakMap<World, Map<string, ContinentMap>>();

/**
 * Maps by what they are built from, across worlds: when the world is rebuilt
 * after an edit, every body the edit didn't touch keeps its map.
 */
const byInputs = new WeakMap<object, Map<string, ContinentMap>>();
const designIds = new WeakMap<object, number>();
let nextDesign = 0;
function inputsKey(world: World, body: Body): string {
  const design = world.designs.get(body.id);
  if (design && !designIds.has(design)) designIds.set(design, ++nextDesign);
  return JSON.stringify([
    body.id,
    body.kind,
    body.radius,
    body.seed,
    body.outerRadius,
    body.maxElevation,
    design ? designIds.get(design) : 0,
    world.places.get(body.id) ?? null,
  ]);
}
function remember(world: World, body: Body, map: ContinentMap) {
  let m = byInputs.get(world.params);
  if (!m) byInputs.set(world.params, (m = new Map()));
  m.set(inputsKey(world, body), map);
}
/** This world's map for a body, if built (here or for an earlier world from the same inputs). */
function existing(world: World, body: Body): ContinentMap | undefined {
  let byId = cache.get(world);
  if (!byId) cache.set(world, (byId = new Map()));
  let m = byId.get(body.id);
  if (!m) {
    m = byInputs.get(world.params)?.get(inputsKey(world, body));
    if (m) byId.set(body.id, m);
  }
  return m;
}

/** The map of a continent (cached per world). */
export function continentMap(world: World, body: Body): ContinentMap {
  let m = existing(world, body);
  if (!m) {
    m = buildContinentMap(world, body);
    cache.get(world)!.set(body.id, m);
    remember(world, body, m);
  }
  return m;
}

/** Accept a map built elsewhere (the background worker), unless one is already in use. */
export function primeContinentMap(world: World, id: string, map: ContinentMap): boolean {
  const body = world.bodies.find((b) => b.id === id);
  if (!body || existing(world, body)) return false;
  cache.get(world)!.set(id, map);
  remember(world, body, map);
  return true;
}

/** Whether a body's map is already built (so using it costs nothing). */
export function hasContinentMap(world: World, body: Body): boolean {
  return !!existing(world, body);
}

/** A settlement by id (`<continent id>/<slug>`), with its continent. */
export function findSettlement(world: World, id: string): { body: Body; settlement: Settlement } | null {
  const slash = id.indexOf('/');
  if (slash < 0) return null;
  const body = world.bodies.find((b) => b.id === id.slice(0, slash));
  if (!body) return null;
  const settlement = continentMap(world, body).settlements.find((st) => st.id === id);
  return settlement ? { body, settlement } : null;
}

/** Bodies with detailed maps: the central isle, the continents, their moons and the belt islands. */
export function mappedBodies(world: World): Body[] {
  return world.bodies;
}

/** Mark the grid cells a polyline passes through. */
function rasterLine(g: Grid, pts: number[], mask: Uint8Array) {
  for (let v = 2; v < pts.length; v += 2) {
    const x0 = pts[v - 2], y0 = pts[v - 1], x1 = pts[v], y1 = pts[v + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (g.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const k = cellAt(g, x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
      if (k >= 0) mask[k] = 1;
    }
  }
}

/** Land, height and water of a body, before anyone lives there. */
function buildTerrain(world: World, body: Body) {
  const P = world.params;
  const design: ContinentDesign | undefined = world.designs.get(body.id);
  const coast = body.coast;
  const radius = body.radius;
  const half = body.outerRadius * 1.08;
  const gp = P.terrain.grid;
  const floor = body.kind === 'islet' ? gp.islet_min_cells : gp.min_cells;
  const n = Math.max(floor, Math.min(gp.max_cells, Math.round(radius * gp.cells_per_il_of_radius)));
  const g = makeGrid(half, n);
  const land = rasterize(g, coast);
  const maxElevation = body.maxElevation ?? Math.round(P.terrain.elevation.base + radius * P.terrain.elevation.per_il_of_radius);
  const seed = body.seed;
  const warnings = [...(design?.warnings ?? [])];

  const elevation = design?.contours.length
    ? contourElevation(g, land, design.contours, design.peaks)
    : generatedElevation(g, land, seed, radius, maxElevation, P.terrain.elevation.mountain_ranges);

  // Lakes: drawn ones are fixed (and generated ones switched off); otherwise found from the terrain.
  let fixedLakes: Int16Array | undefined;
  if (design?.lakes.length) {
    fixedLakes = new Int16Array(n * n).fill(-1);
    design.lakes.forEach((l, id) => {
      const m = rasterize(g, [l.ring]);
      for (let k = 0; k < n * n; k++) if (m[k] && land[k]) fixedLakes![k] = id;
    });
  }
  const water = hydrology(g, elevation, land, {
    lakeDepth: fixedLakes ? Infinity : Math.max(P.terrain.water.lake_min_depth, maxElevation * P.terrain.water.lake_min_depth_share_of_relief),
    lakeCells: P.terrain.water.lake_min_cells,
    riverShare: P.terrain.water.river_share,
    navigableShare: P.terrain.water.navigable_share,
    fixedLakes,
  });

  // Drawn rivers replace generated ones; each runs from its higher end to its lower.
  if (design?.rivers.length) {
    water.rivers = design.rivers.map((r) => {
      let pts = r.points;
      const nPts = pts.length / 2;
      const eStart = sample(g, elevation, pts[0], pts[1]);
      const eEnd = sample(g, elevation, pts[pts.length - 2], pts[pts.length - 1]);
      if (eStart < eEnd) {
        const rev: number[] = [];
        for (let v = nPts - 1; v >= 0; v--) rev.push(pts[v * 2], pts[v * 2 + 1]);
        pts = rev;
      }
      const flow = Array.from({ length: nPts }, (_, v) => (r.navigable ? 0.45 : 0.15) + (r.navigable ? 0.55 : 0.35) * (v / Math.max(1, nPts - 1)));
      return { name: r.name, points: pts, flow, navigableFrom: r.navigable ? 0 : -1 };
    });
    water.riverMask.fill(0);
    for (const r of water.rivers) rasterLine(g, r.points, water.riverMask);
  }

  return { g, n, land, elevation, water, maxElevation, design, warnings };
}

type Terrain = ReturnType<typeof buildTerrain>;

/** Is there sea within `d` IL of a point? */
function nearSea(g: Grid, land: Uint8Array, x: number, y: number, d: number): boolean {
  const steps = Math.ceil(d / g.cell);
  for (let i = -steps; i <= steps; i++)
    for (let j = -steps; j <= steps; j++) {
      if (Math.hypot(i, j) * g.cell > d) continue;
      const k = cellAt(g, x + i * g.cell, y + j * g.cell);
      if (k < 0 || !land[k]) return true;
    }
  return false;
}

/** Settlements as written (in places/ or a design), checked against the terrain. */
function readSettlements(body: Body, t: Terrain, rows: { name: string; kind: SettlementKind; x: number; y: number; port: boolean }[]): Settlement[] {
  const { g, land, elevation, water, warnings } = t;
  const used = new Set<string>();
  const uniqueId = (name: string) => {
    let id = `${body.id}/${slug(name) || 'place'}`;
    for (let i = 2; used.has(id); i++) id = `${body.id}/${slug(name)}-${i}`;
    used.add(id);
    return id;
  };
  const near = (s: { x: number; y: number }, d: number, from = 0) => (r: River) => {
    for (let v = from * 2; v < r.points.length; v += 2) if (Math.hypot(r.points[v] - s.x, r.points[v + 1] - s.y) < d) return true;
    return false;
  };
  return rows.map((s) => {
    const k = cellAt(g, s.x, s.y);
    if (k < 0 || land[k] !== 1) warnings.push(`${s.name} is not on land`);
    const shore = nearSea(g, land, s.x, s.y, Math.max(g.cell * 3, 3));
    const river = water.rivers.some(near(s, g.cell * 2));
    const riverPort = river && water.rivers.some((r) => r.navigableFrom >= 0 && near(s, g.cell * 2, r.navigableFrom)(r));
    if (s.port && !shore && !riverPort) warnings.push(`${s.name} has a harbour but is neither on the shore nor a navigable river`);
    return {
      id: uniqueId(s.name),
      name: s.name,
      kind: s.kind,
      x: s.x,
      y: s.y,
      elevation: Math.round(Math.max(0, sample(g, elevation, s.x, s.y))),
      port: s.port && (shore || riverPort),
      river,
      riverPort,
    };
  });
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Generated settlements for a body (for `npm run seed -- places`): placed by
 * population density for its band (a moon is in its parent's band), or for a
 * belt island by its archipelago's plan.
 */
export function generatePlaces(world: World, body: Body): PlaceRow[] {
  const P = world.params;
  const t = buildTerrain(world, body);
  const { g, elevation, land, water, maxElevation } = t;
  const seed = body.seed;
  let placed;
  if (body.archipelago) {
    const exact = archipelagoPlan(world, body.archipelago).get(body.id)!;
    placed = placeSettlements(seed + P.settlements.seed * 1000, g, elevation, land, water, maxElevation, { density: 0, minimum: 'village', exact, islanders: true }, P.settlements, world.names);
  } else {
    const fromCentre = body.kind === 'moon' ? (body.parent!.parent ? body.parent!.orbitRadius : 0) : body.parent ? body.orbitRadius : 0;
    const band = world.bands.find((b) => fromCentre >= b.innerRadius && fromCentre < b.outerRadius);
    const sp = P.settlements;
    const own = sp.bodies?.[body.id];
    const density = own?.density ?? body.settlementDensity ?? (band ? sp.density[band.id] : undefined);
    if (density === undefined) throw new Error(`parameters/settlements.yaml: density.${band?.id ?? '(no band)'} is missing`);
    if (density <= 0) return [];
    placed = placeSettlements(
      seed + sp.seed * 1000,
      g,
      elevation,
      land,
      water,
      maxElevation,
      { density, minimum: body.kind === 'moon' ? sp.minimum.moon : sp.minimum.continent, coastWithin: own?.coast },
      sp,
      world.names,
    );
  }
  return placed.map((s) => ({ name: s.name, kind: s.kind, x: round2(s.x), y: round2(s.y), ...(s.port ? { harbour: true } : {}) }));
}

/** The map of a body, built (see `continentMap` for the cached one). */
export function buildContinentMap(world: World, body: Body): ContinentMap {
  const P = world.params;
  const t = buildTerrain(world, body);
  const { g, n, land, elevation, water, design, warnings } = t;
  const radius = body.radius;

  // Settlements: as drawn in a design that draws them; otherwise as listed in places/<id>.yaml.
  const drawn = !!design?.settlements.length;
  const rows = drawn ? undefined : world.places.get(body.id);
  if (drawn && world.places.has(body.id)) warnings.push(`places/${body.id}.yaml is ignored: the design draws its own settlements`);
  const settlements = drawn
    ? readSettlements(body, t, design!.settlements)
    : readSettlements(body, t, (rows ?? []).map((r) => ({ name: String(r.name), kind: r.kind, x: r.x, y: r.y, port: !!r.harbour })));
  for (const s of rows ?? [])
    if (!['city', 'town', 'village'].includes(s.kind)) warnings.push(`${s.name}: kind must be city, town or village, not "${s.kind}"`);

  // Roads: drawn ones as given (ends snapped to nearby settlements), otherwise routed.
  let roads: Road[];
  if (design?.roads) {
    const near = (x: number, y: number) =>
      settlements.find((s) => Math.hypot(s.x - x, s.y - y) < Math.max(2, radius * P.terrain.design.road_snap_share_of_radius))?.id ?? null;
    roads = design.roads.map((r) => ({
      from: near(r.points[0], r.points[1]),
      to: near(r.points[r.points.length - 2], r.points[r.points.length - 1]),
      rank: r.rank,
      points: r.points,
      length: polylineLength(r.points),
      bridges: 0,
    }));
  } else roads = routeRoads(settlements, { grid: g, elevation, land, water }, P.roads);
  const ferries = islandFerries(g, land, water.lake, settlements);

  const top = elevation.reduce((m, v) => Math.max(m, v), 0);
  // Drawn contours and lakes are shown exactly as drawn; traced ones are smoothed
  // so the grid's stair-steps don't show when zoomed in.
  const traced = (field: Float32Array, level: number) => joinSegments(isoSegments(g, field, level)).map((l) => chaikin(l, 2));
  const contours = design?.contours.length
    ? [...new Set(design.contours.map((c) => c.level))]
        .sort((a, b) => a - b)
        .map((level) => ({
          level,
          lines: design.contours.filter((c) => c.level === level).flatMap((c) => c.rings.map((r) => [...r, r[0], r[1]])),
        }))
    : contourLevels(top).map((level) => ({ level, lines: traced(elevation, level) }));
  let lakes: number[][];
  if (design?.lakes.length) lakes = design.lakes.map((l) => l.ring);
  else {
    const lakeField = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) lakeField[k] = water.lake[k] >= 0 ? 1 : 0;
    lakes = traced(lakeField, 0.5);
  }

  return {
    id: body.id,
    source: design ? 'designed' : 'generated',
    grid: g,
    elevation,
    land,
    lake: water.lake,
    maxElevation: Math.round(top),
    contours,
    lakes,
    rivers: water.rivers,
    settlements,
    roads,
    ferries,
    warnings,
  };
}

/**
 * Ferries between the landmasses of one body, where settlements stand on more
 * than one: a minimum spanning network, each link between the closest pair of
 * places on the two islands. (Roads join places on the same landmass.)
 */
function islandFerries(g: Grid, land: Uint8Array, lake: Int16Array, settlements: Settlement[]): Ferry[] {
  if (settlements.length < 2) return [];
  const { n } = g;
  const label = new Int32Array(n * n).fill(-1);
  const dry = (k: number) => land[k] === 1 && lake[k] < 0;
  const groupOf = settlements.map((st) => {
    const k0 = cellAt(g, st.x, st.y);
    if (k0 < 0 || !dry(k0)) return -1;
    if (label[k0] < 0) {
      // Flood this landmass.
      const stack = [k0];
      label[k0] = k0;
      while (stack.length) {
        const k = stack.pop()!;
        const i = k % n;
        const j = (k / n) | 0;
        for (const [di, dj] of NEIGHBOURS) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const m = jj * n + ii;
          if (label[m] < 0 && dry(m)) {
            label[m] = k0;
            stack.push(m);
          }
        }
      }
    }
    return label[k0];
  });
  const groups = [...new Set(groupOf.filter((x) => x >= 0))];
  if (groups.length < 2) return [];
  const links: { a: number; b: number; from: Settlement; to: Settlement; d: number }[] = [];
  for (let a = 0; a < groups.length; a++)
    for (let b = a + 1; b < groups.length; b++) {
      let best: (typeof links)[number] | null = null;
      settlements.forEach((p, i) => {
        if (groupOf[i] !== groups[a]) return;
        settlements.forEach((q, j) => {
          if (groupOf[j] !== groups[b]) return;
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          if (!best || d < best.d) best = { a, b, from: p, to: q, d };
        });
      });
      if (best) links.push(best);
    }
  links.sort((x, y) => x.d - y.d);
  const parent = groups.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const out: Ferry[] = [];
  for (const l of links) {
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra === rb) continue;
    parent[ra] = rb;
    out.push({ from: l.from.id, to: l.to.id, rank: l.from.kind !== 'village' && l.to.kind !== 'village' ? 'main' : 'local', length: l.d });
  }
  return out;
}
