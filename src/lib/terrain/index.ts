import type { Body, World } from '../world';
import { contourLevels, isoSegments, joinSegments } from './contours';
import type { ContinentDesign } from './design';
import { contourElevation, generatedElevation } from './elevation';
import { chaikin, polylineLength } from './geometry';
import { cellAt, makeGrid, rasterize, sample, type Grid } from './grid';
import { hydrology, type River } from './hydrology';
import { slug } from './names';
import { routeRoads, type Road } from './routes';
import { placeSettlements, type Settlement } from './settlements';

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
  /** Notes about a design (skipped shapes and why). */
  warnings: string[];
}

const cache = new WeakMap<World, Map<string, ContinentMap>>();

/** The map of a continent (cached per world). */
export function continentMap(world: World, body: Body): ContinentMap {
  let byId = cache.get(world);
  if (!byId) cache.set(world, (byId = new Map()));
  let m = byId.get(body.id);
  if (!m) byId.set(body.id, (m = buildContinentMap(world, body)));
  return m;
}

/** Whether a body's map is already built (so using it costs nothing). */
export function hasContinentMap(world: World, body: Body): boolean {
  return cache.get(world)?.has(body.id) ?? false;
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

/** Bodies with detailed maps: the central isle, the continents and their moons. */
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

export function buildContinentMap(world: World, body: Body): ContinentMap {
  const P = world.params;
  const design: ContinentDesign | undefined = world.designs.get(body.id);
  const coast = body.coast;
  const radius = body.radius;
  const half = body.outerRadius * 1.08;
  const gp = P.terrain.grid;
  const n = Math.max(gp.min_cells, Math.min(gp.max_cells, Math.round(radius * gp.cells_per_il_of_radius)));
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

  // Settlements: drawn ones as given, otherwise placed by population density for the band
  // (a moon is in its parent's band).
  const fromCentre = body.kind === 'moon' ? (body.parent!.parent ? body.parent!.orbitRadius : 0) : body.parent ? body.orbitRadius : 0;
  const band = world.bands.find((b) => fromCentre >= b.innerRadius && fromCentre < b.outerRadius);
  const used = new Set<string>();
  const uniqueId = (name: string) => {
    let id = `${body.id}/${slug(name) || 'place'}`;
    for (let i = 2; used.has(id); i++) id = `${body.id}/${slug(name)}-${i}`;
    used.add(id);
    return id;
  };
  let settlements: Settlement[];
  if (design?.settlements.length) {
    settlements = design.settlements.map((s) => {
      const k = cellAt(g, s.x, s.y);
      const onLand = k >= 0 && land[k] === 1;
      if (!onLand) warnings.push(`settlement ${s.name} is not on land`);
      const nearRiver = water.rivers.some((r) => {
        for (let v = 0; v < r.points.length; v += 2) if (Math.hypot(r.points[v] - s.x, r.points[v + 1] - s.y) < g.cell * 2) return true;
        return false;
      });
      return {
        id: uniqueId(s.name),
        name: s.name,
        kind: s.kind,
        x: s.x,
        y: s.y,
        elevation: Math.round(Math.max(0, sample(g, elevation, s.x, s.y))),
        port: s.port,
        river: nearRiver,
        riverPort: nearRiver && water.rivers.some((r) => r.navigableFrom >= 0 && r.points.some((_, v) => v % 2 === 0 && v / 2 >= r.navigableFrom && Math.hypot(r.points[v] - s.x, r.points[v + 1] - s.y) < g.cell * 2)),
      };
    });
  } else {
    const sp = P.settlements;
    const density = body.settlementDensity ?? (band ? sp.density[band.id] : undefined);
    if (density === undefined) throw new Error(`parameters/settlements.yaml: density.${band?.id ?? '(no band)'} is missing`);
    settlements = placeSettlements(
      seed + sp.seed * 1000,
      g,
      elevation,
      land,
      water,
      maxElevation,
      { density, minimum: body.kind === 'moon' ? sp.minimum.moon : sp.minimum.continent },
      sp,
      world.names,
    ).map((s) => ({ ...s, id: uniqueId(s.name) }));
  }

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
    warnings,
  };
}
