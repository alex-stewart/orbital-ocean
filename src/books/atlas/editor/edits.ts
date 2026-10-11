import type { Edit, EditRequest, PathSegment } from '../../../lib/editing';
import { archipelagoCentre, bearingAt, polar, positionsAt, type Point } from '../../../lib/orbits';
import { convoyMinOffset, orbitLaws, type Platform, type PlatformMotion, type PlatformRow } from '../../../lib/platforms';
import { continentMap, findSettlement, type SettlementKind } from '../../../lib/terrain';
import { cellAt } from '../../../lib/terrain/grid';
import { nameMaker } from '../../../lib/terrain/names';
import { beltPeriod, type Archipelago, type Body, type World } from '../../../lib/world';

/**
 * What the editor writes for each change: moving, adding and deleting things,
 * and where each thing lives in the data files.
 */

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap360 = (b: number) => ((b % 360) + 360) % 360;
const wrap180 = (b: number) => ((((b + 180) % 360) + 360) % 360) - 180;
const bearingOf = (p: Point) => wrap360((Math.atan2(p.x, -p.y) * 180) / Math.PI);

/** Where a body is defined: its file and path. */
export function bodySource(body: Body): { file: string; path: PathSegment[] } {
  if (body.archipelago) {
    const a = body.archipelago;
    return { file: 'data/archipelagos.yaml', path: [a.belt.id, { id: a.key }, 'islands', { id: body.id }] };
  }
  if (body.kind === 'central') return { file: 'data/world.yaml', path: ['central'] };
  if (body.kind === 'isle') return { file: 'data/world.yaml', path: ['orbitals', { id: body.id }] };
  const parent = body.parent!;
  const base: PathSegment[] = parent.kind === 'central' ? ['central'] : ['orbitals', { id: parent.id }];
  return { file: 'data/world.yaml', path: [...base, 'moons', { id: body.id }] };
}

export function archipelagoSource(a: Archipelago): { file: string; path: PathSegment[] } {
  return { file: 'data/archipelagos.yaml', path: [a.belt.id, { id: a.key }] };
}

/** One field of a body or archipelago. */
export function fieldEdit(src: { file: string; path: PathSegment[] }, key: string, value: unknown): Edit {
  return value === null || value === undefined || value === ''
    ? { file: src.file, op: 'delete', path: [...src.path, key] }
    : { file: src.file, op: 'set', path: [...src.path, key], value };
}

/** A platform as it would be written back to platforms.yaml. */
export function platformRow(p: Platform): PlatformRow {
  const row: PlatformRow = { id: p.id, class: p.size.id, owner: p.owner.id, motion: p.motion };
  if (p.motion === 'convoy') return { ...row, with: p.companion!.id, offset: r1(wrap180(p.bearing - p.companion!.bearing)) };
  if (p.motion === 'ring') return { ...row, around: p.parent!.id, radius: r1(p.orbitRadius), bearing: r1(p.bearing) };
  return { ...row, radius: r1(p.orbitRadius), bearing: r2(p.bearing) };
}

/** A platform row with the given motion, placed where `at` is on day `t`. */
export function placePlatform(world: World, row: PlatformRow, motion: PlatformMotion, at: Point, t: number): PlatformRow {
  const base: PlatformRow = { id: row.id, class: row.class, owner: row.owner, motion };
  const continents = world.bodies.filter((b) => b.kind === 'isle');
  const laws = orbitLaws({ central: world.central, continents });
  const pos = positionsAt(world.bodies, t);
  const r = Math.hypot(at.x, at.y);
  if (motion === 'anchored') return { ...base, radius: r1(r), bearing: r2(bearingOf(at)) };
  if (motion === 'lane') return { ...base, radius: Math.round(r), bearing: r2(wrap360(bearingOf(at) - (360 * t) / laws.central(Math.round(r)))) };
  // Convoy and ring: about the nearest continent (by orbit for a convoy, by distance for a ring).
  if (motion === 'convoy') {
    const c = [...continents].sort((a, b) => Math.abs(a.orbitRadius - r) - Math.abs(b.orbitRadius - r))[0];
    let offset = wrap180(bearingOf(at) - bearingAt(c, t));
    const min = convoyMinOffset(c, world.platformRules?.rings.get(c.id) ?? [], world.platformRules?.clearance ?? 20);
    if (Math.abs(offset) < min) offset = (offset < 0 ? -1 : 1) * Math.min(180, min + 1);
    return { ...base, with: c.id, offset: r1(offset) };
  }
  const c = [...continents].sort((a, b) => dist(pos.get(a.id)!, at) - dist(pos.get(b.id)!, at))[0];
  const rel = { x: at.x - pos.get(c.id)!.x, y: at.y - pos.get(c.id)!.y };
  const radius = Math.round(Math.hypot(rel.x, rel.y));
  return { ...base, around: c.id, radius, bearing: r1(wrap360(bearingOf(rel) - (360 * t) / laws.local(radius))) };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Rotate a map vector by a compass angle (clockwise on the chart). */
function rotate(v: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) };
}

/** The settlement's index in its body's places file, if it is listed there (not drawn in a design). */
export function placeIndex(world: World, id: string): { body: Body; index: number } | null {
  const st = findSettlement(world, id);
  if (!st || !world.places.has(st.body.id) || world.designs.get(st.body.id)?.settlements.length) return null;
  const index = continentMap(world, st.body).settlements.findIndex((s) => s.id === id);
  return index < 0 ? null : { body: st.body, index };
}

/** Can this be dragged about the chart? */
export function canMove(world: World, id: string): boolean {
  if (world.platformIndex.has(id)) return true;
  if (id.includes('/')) return !!placeIndex(world, id);
  if (world.archipelagos.some((a) => a.id === id)) return true;
  const body = world.bodies.find((b) => b.id === id);
  return !!body && body.kind !== 'central';
}

/** Edits that move something to `at` (map position on day `t`). */
export function moveEdits(world: World, id: string, at: Point, t: number): EditRequest | null {
  const pos = positionsAt(world.bodies, t);
  const i = world.platformIndex.get(id);
  if (i !== undefined) {
    const p = world.platforms[i];
    const row = placePlatform(world, platformRow(p), p.motion, at, t);
    // A convoy stays with its own continent.
    if (p.motion === 'convoy') Object.assign(row, { with: p.companion!.id, offset: r1(wrap180(bearingOf(at) - bearingAt(p.companion!, t))) });
    return { label: `Move ${id}`, edits: [{ file: 'data/platforms.yaml', op: 'set', path: [{ id }], value: row }] };
  }
  if (id.includes('/')) {
    const where = placeIndex(world, id);
    if (!where) return null;
    const c = pos.get(where.body.id)!;
    const file = `data/places/${where.body.id}.yaml`;
    const name = findSettlement(world, id)!.settlement.name;
    return {
      label: `Move ${name}`,
      edits: [
        { file, op: 'set', path: [where.index, 'x'], value: r2(at.x - c.x) },
        { file, op: 'set', path: [where.index, 'y'], value: r2(at.y - c.y) },
      ],
    };
  }
  const arch = world.archipelagos.find((a) => a.id === id);
  if (arch) {
    const src = archipelagoSource(arch);
    // Further out it turns more slowly (unless its period is fixed): day 0's bearing follows from the new one.
    const r = r1(Math.hypot(at.x, at.y));
    const period = arch.periodFixed ? arch.periodDays : beltPeriod(arch.belt, r);
    return {
      label: `Move ${arch.name}`,
      edits: [fieldEdit(src, 'orbit_radius', r), fieldEdit(src, 'bearing', r2(wrap360(bearingOf(at) - (360 * t) / period)))],
    };
  }
  const body = world.bodies.find((b) => b.id === id);
  if (!body || body.kind === 'central') return null;
  const src = bodySource(body);
  if (body.archipelago) {
    // An island moves within its group: its offset from the centre, turned back to day 0.
    const a = body.archipelago;
    const c = archipelagoCentre(a, t);
    const off = rotate({ x: at.x - c.x, y: at.y - c.y }, -(360 * t) / a.periodDays);
    return { label: `Move ${body.name}`, edits: [fieldEdit(src, 'x', r2(off.x)), fieldEdit(src, 'y', r2(off.y))] };
  }
  const parent = pos.get(body.parent!.id)!;
  const rel = { x: at.x - parent.x, y: at.y - parent.y };
  return {
    label: `Move ${body.name}`,
    edits: [
      fieldEdit(src, 'orbit_radius', Math.round(Math.hypot(rel.x, rel.y))),
      fieldEdit(src, 'bearing', r1(wrap360(bearingOf(rel) - (360 * t) / body.periodDays))),
    ],
  };
}

export type AddTool = SettlementKind | 'grand' | 'keep';

/** The body whose dry land is at `at` on day `t`, and the local position there. */
export function landAt(world: World, at: Point, t: number): { body: Body; local: Point } | null {
  const pos = positionsAt(world.bodies, t);
  // Smaller bodies first: a moon over its continent's sea, an island in a belt.
  const near = world.bodies.filter((b) => dist(pos.get(b.id)!, at) < b.outerRadius).sort((a, b) => a.radius - b.radius);
  for (const body of near) {
    const c = pos.get(body.id)!;
    const local = { x: at.x - c.x, y: at.y - c.y };
    const map = continentMap(world, body);
    const k = cellAt(map.grid, local.x, local.y);
    if (k >= 0 && map.land[k] && map.lake[k] < 0) return { body, local };
  }
  return null;
}

/** Edits that add a new place or platform at `at`; null (with why) if it can't go there. */
export function addEdits(world: World, tool: AddTool, at: Point, t: number): { request: EditRequest; id: string } | { error: string } {
  if (tool === 'grand' || tool === 'keep') {
    const owner = world.platformContent?.owners.find((o) => o.imperial) ?? world.platformContent?.owners[0];
    if (!owner) return { error: 'world.yaml lists no platform owners' };
    const prefix = `${world.platformContent!.register}-${owner.code}-`;
    const n = Math.max(0, ...world.platforms.filter((p) => p.id.startsWith(prefix)).map((p) => Number(p.id.slice(prefix.length)) || 0)) + 1;
    const id = `${prefix}${String(n).padStart(5, '0')}`;
    const row = placePlatform(world, { id, class: tool, owner: owner.id, motion: 'anchored' }, 'anchored', at, t);
    return { id, request: { label: `Add ${id}`, edits: [{ file: 'data/platforms.yaml', op: 'add', path: [], value: row }] } };
  }
  const land = landAt(world, at, t);
  if (!land) return { error: 'Places go on dry land: click on an island.' };
  const { body, local } = land;
  if (world.designs.get(body.id)?.settlements.length) return { error: `${body.name}'s settlements are drawn in its design (continents/${body.id}.svg).` };
  const taken = new Set(continentMap(world, body).settlements.map((s) => s.name));
  const make = nameMaker(body.seed + taken.size * 7919 + 13, world.names);
  let name = make({ coastal: false, river: false, high: false });
  for (let k = 0; taken.has(name) && k < 20; k++) name = make({ coastal: false, river: false, high: false });
  const file = `data/places/${body.id}.yaml`;
  const create = `# Settlements on ${body.name} (see README.md in this folder).\n\n[]\n`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return {
    id: `${body.id}/${slug}`,
    request: { label: `Add ${tool} ${name} on ${body.name}`, edits: [{ file, op: 'add', path: [], value: { name, kind: tool, x: r2(local.x), y: r2(local.y) }, create }] },
  };
}

/** Edits that remove a place or platform. */
export function deleteEdits(world: World, id: string): EditRequest | null {
  if (world.platformIndex.has(id)) return { label: `Delete ${id}`, edits: [{ file: 'data/platforms.yaml', op: 'delete', path: [{ id }] }] };
  const where = placeIndex(world, id);
  if (!where) return null;
  return {
    label: `Delete ${findSettlement(world, id)!.settlement.name}`,
    edits: [{ file: `data/places/${where.body.id}.yaml`, op: 'delete', path: [where.index] }],
  };
}

/** Where something is on the chart on day `t` (for dragging it). */
export function positionOf(world: World, id: string, t: number): Point | null {
  const pos = positionsAt(world.bodies, t);
  const body = pos.get(id);
  if (body) return body;
  const arch = world.archipelagos.find((a) => a.id === id);
  if (arch) return archipelagoCentre(arch, t);
  const st = findSettlement(world, id);
  if (st) {
    const c = pos.get(st.body.id)!;
    return { x: c.x + st.settlement.x, y: c.y + st.settlement.y };
  }
  const i = world.platformIndex.get(id);
  if (i === undefined) return null;
  const p = world.platforms[i];
  const c = p.parent ? pos.get(p.parent.id)! : { x: 0, y: 0 };
  const o = polar(p.orbitRadius, bearingAt(p, t));
  return { x: c.x + o.x, y: c.y + o.y };
}
