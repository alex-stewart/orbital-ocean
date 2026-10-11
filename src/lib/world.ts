import yaml from 'js-yaml';
import type { Calendar } from './calendar';
import type { Parameters } from '../parameters/schema';
import { parsePlatforms, type Platform, type PlatformContent, type PlatformRow, type PlatformRules } from './platforms';
import type { ArchipelagoRows } from './archipelagos';
import { coastlinePoints } from './coastline';
import { polar } from './orbits';
import { rng } from './random';
import type { ContinentDesign } from './terrain/design';
import type { NameParts } from './terrain/names';

/** central: the Land of the Large; isle: a continent; moon; islet: an island of a belt's archipelago. */
export type BodyKind = 'central' | 'isle' | 'moon' | 'islet';

export interface Body {
  id: string;
  name: string;
  /** For crowded places (zoomed out, the island strip): `short_name`, or "C. 7" for "Continent 7". */
  shortName: string;
  kind: BodyKind;
  /** Island radius, IL. */
  radius: number;
  seed: number;
  parent: Body | null;
  orbitRadius: number;
  /** Compass bearing from the parent at day 0, degrees. */
  bearing: number;
  /** Orbital period in days (Infinity for the central isle). */
  periodDays: number;
  moons: Body[];
  /** Place in the order outward from the centre, if given. */
  position: number | null;
  description: string | null;
  /** Coastline rings, IL from the body's centre (designed or generated). */
  coast: number[][];
  /** Furthest any coast reaches from the centre, IL (≥ the nominal radius's shape). */
  outerRadius: number;
  /** Height of the highest ground for generated terrain, metres (null: by size). */
  maxElevation: number | null;
  /** Settlements per 10,000 IL² of land, overriding the band's density. */
  settlementDensity: number | null;
  /** For belt islands: the archipelago they belong to. */
  archipelago: Archipelago | null;
}

/** A group of belt islands orbiting together (see archipelagos.ts). */
export interface Archipelago {
  /** `arch:<belt id>:<key>`; `key` is its id in archipelagos.yaml. */
  id: string;
  key: string;
  name: string;
  belt: Belt;
  populated: boolean;
  /** Centre at day 0, and the period every island shares. */
  orbitRadius: number;
  bearing: number;
  periodDays: number;
  /** Whether the period is set in archipelagos.yaml (else it follows the belt's law). */
  periodFixed: boolean;
  /** How far the group reaches from its centre, IL. */
  extent: number;
  islands: Body[];
}

export interface Islet {
  orbitRadius: number;
  bearing: number;
  periodDays: number;
  radius: number;
}

export interface Belt {
  id: string;
  name: string;
  position: number | null;
  innerRadius: number;
  outerRadius: number;
  /** Loose rocks, each on its own orbit. */
  islets: Islet[];
  /** Orbital period at the inner edge, days (P ∝ r^1.5 across the belt). */
  periodAtInnerDays: number;
  archipelagos: Archipelago[];
}

/** The period of an archipelago at distance r from the centre, by its belt's law. */
export function beltPeriod(belt: Belt, r: number): number {
  return belt.periodAtInnerDays * Math.pow(r / belt.innerRadius, 1.5);
}

/** An administrative ring of the ocean, between two radii. */
export interface Band {
  id: string;
  name: string;
  innerRadius: number;
  outerRadius: number;
  description: string | null;
}

export interface World {
  units: { name: string; plural: string; abbr: string };
  /** Radius of the ocean's circular edge, IL. */
  oceanRadius: number;
  edgeName: string;
  central: Body;
  /** Every body in drawing order: central, isles, moons, belt islands. */
  bodies: Body[];
  belts: Belt[];
  archipelagos: Archipelago[];
  bands: Band[];
  platforms: Platform[];
  /** What platforms there may be: classes, owners, the register (world.yaml). */
  platformContent: PlatformContent | null;
  /** Settlements by body id, as written in src/data/places/ (null: none). */
  places: Map<string, PlaceRow[]>;
  /** Problems found in the data (after an edit, say): the world still loads. */
  warnings: string[];
  /** Platform register number → index into `platforms`. */
  platformIndex: Map<string, number>;
  /** The generated lanes and rings platforms use; null if there are none. */
  platformRules: PlatformRules | null;
  /** Radius of the whole chart (the ocean's edge), IL. */
  extent: number;
  /** Hand-drawn continent designs, by body id. */
  designs: Map<string, ContinentDesign>;
  /** Sounds that placeholder names are built from (src/data/names.yaml). */
  names: NameParts;
  /** Every tuning parameter (src/parameters/). */
  params: Parameters;
}

interface RawBody {
  id: string;
  name?: string;
  radius: number;
  seed?: number;
  orbit_radius?: number;
  bearing?: number;
  period_years?: number;
  period_days?: number;
  position?: number;
  description?: string;
  short_name?: string;
  max_elevation?: number;
  settlement_density?: number;
  /** `islands`: a scatter of small islands within the body's radius, rather than one landmass. */
  shape?: 'single' | 'islands';
  /** For `shape: islands`, how many. */
  islands?: number;
  moons?: RawBody[];
}

type BandLimit = number | 'centre' | 'edge' | string;

interface RawWorld {
  units?: { name?: string; plural?: string; abbreviation?: string };
  ocean?: { radius?: number; edge?: { name?: string } };
  central: RawBody;
  orbitals?: RawBody[];
  belts?: {
    id: string;
    name?: string;
    position?: number;
    seed?: number;
    count: number;
    inner_radius: number;
    outer_radius: number;
    period_years_at_inner: number;
    islet_radius?: [number, number];
  }[];
  bands?: { id: string; name?: string; inner: BandLimit; outer: BandLimit; description?: string }[];
  platform_register?: string;
  platform_classes?: { id: string; name?: string; like?: string }[];
  platform_owners?: { id: string; name?: string; code?: string; imperial?: boolean }[];
}

/** A settlement as written in src/data/places/<body id>.yaml. */
export interface PlaceRow {
  name: string;
  kind: 'city' | 'town' | 'village';
  /** IL from the body's centre: x east, y south. */
  x: number;
  y: number;
  /** Keeps a harbour (only counts on the shore). */
  harbour?: boolean;
}

export interface WorldSources {
  /** The belts' archipelagos (src/data/archipelagos.yaml), already parsed. */
  archipelagos?: ArchipelagoRows;
  /** Platforms (src/data/platforms.yaml), already parsed. */
  platforms?: PlatformRow[];
  /** Settlements by body id (src/data/places/), already parsed. */
  places?: Map<string, PlaceRow[]>;
  /** Tuning parameters (src/parameters/). */
  params: Parameters;
  /** Name-building sounds (src/data/names.yaml), already parsed. */
  names: NameParts;
  /** Hand-drawn designs by body id, already read (see terrain/design.ts parseDesign). */
  designs?: Map<string, ContinentDesign>;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Build the world from world.yaml text, the calendar, parameters and any designs. */
export function parseWorld(source: string, cal: Calendar, sources: WorldSources): World {
  const { params, names, designs = new Map<string, ContinentDesign>() } = sources;
  const warnings: string[] = [];
  const raw = yaml.load(source) as RawWorld;
  if (!raw?.central) throw new Error('world.yaml: `central` is required');

  const toBody = (r: RawBody, kind: BodyKind, parent: Body | null): Body => {
    let periodDays = Infinity;
    if (parent) {
      periodDays = r.period_days ?? (r.period_years ?? NaN) * cal.yearLength;
      if (!(periodDays > 0)) throw new Error(`world.yaml: ${r.id} needs period_years or period_days`);
    }
    const body: Body = {
      id: r.id,
      name: r.name ?? r.id,
      shortName: r.short_name ?? (r.name ?? r.id).replace(/^Continent (\d+)$/, 'C. $1'),
      kind,
      radius: r.radius,
      seed: r.seed ?? hash(r.id),
      parent,
      orbitRadius: r.orbit_radius ?? 0,
      bearing: r.bearing ?? 0,
      periodDays,
      moons: [],
      position: r.position ?? null,
      description: r.description ?? null,
      coast: [],
      outerRadius: r.radius,
      maxElevation: r.max_elevation ?? null,
      settlementDensity: r.settlement_density ?? null,
      archipelago: null,
    };
    // Coastline: the hand-drawn one if there is a design, else generated from the seed.
    const design = designs.get(r.id);
    if (design) {
      body.coast = design.coast;
    } else {
      if (r.shape === 'islands') body.coast = islandGroup(body.seed, r.radius, r.islands ?? 7, params.terrain.coast.islet);
      else {
        const unit = coastlinePoints(body.seed, params.terrain.coast[kind === 'isle' ? 'continent' : kind]);
        body.coast = [Array.from(unit, (v) => v * r.radius)];
      }
    }
    body.outerRadius = Math.max(...body.coast.flatMap((ring) => ring.filter((_, i) => i % 2 === 0).map((x, i) => Math.hypot(x, ring[i * 2 + 1]))));
    // Belt islands are packed by their coasts' reach, so a drawn one must keep to it.
    const limit = kind === 'islet' ? params.belts.coast_reach : params.terrain.design.max_coast_reach;
    if (design && body.outerRadius > r.radius * limit) {
      throw new Error(
        `continents/${r.id}.svg: the coast reaches ${Math.round(body.outerRadius)} IL from the centre, but ${r.id} has radius ${r.radius}. ` +
          (kind === 'islet'
            ? `A belt island's coast must stay within ${limit} × its radius (belts.yaml → coast_reach), or it could touch its neighbours.`
            : `Keep the drawing within the guide circle, or raise its radius in world.yaml.`),
      );
    }
    body.moons = (r.moons ?? []).map((m) => toBody(m, 'moon', body));
    return body;
  };

  const central = toBody(raw.central, 'central', null);
  const isles = (raw.orbitals ?? []).map((o) => toBody(o, 'isle', central));
  const bodies = [central, ...isles, ...central.moons, ...isles.flatMap((i) => i.moons)];

  const belts: Belt[] = (raw.belts ?? []).map((b) => {
    const rand = rng(b.seed ?? hash(b.id));
    const [rMin, rMax] = b.islet_radius ?? [0.5, 3];
    const p0 = b.period_years_at_inner * cal.yearLength;
    const islets: Islet[] = Array.from({ length: b.count }, () => {
      const orbitRadius = b.inner_radius + rand() * (b.outer_radius - b.inner_radius);
      return {
        orbitRadius,
        bearing: rand() * 360,
        periodDays: p0 * Math.pow(orbitRadius / b.inner_radius, 1.5),
        // Skew towards small islets.
        radius: rMin + Math.pow(rand(), 3) * (rMax - rMin),
      };
    });
    return {
      id: b.id,
      name: b.name ?? b.id,
      position: b.position ?? null,
      innerRadius: b.inner_radius,
      outerRadius: b.outer_radius,
      islets,
      periodAtInnerDays: p0,
      archipelagos: [],
    };
  });

  // Archipelagos: their islands become bodies (kind 'islet') orbiting the centre,
  // all islands of a group sharing its period, so the group turns as one.
  const archipelagos: Archipelago[] = [];
  for (const [beltId, rows] of Object.entries(sources.archipelagos ?? {})) {
    const belt = belts.find((b) => b.id === beltId);
    if (!belt) {
      warnings.push(`archipelagos.yaml: there is no belt "${beltId}" in world.yaml`);
      continue;
    }
    for (const row of rows ?? []) {
      const period = row.period_days ?? beltPeriod(belt, row.orbit_radius);
      const arch: Archipelago = {
        id: `arch:${belt.id}:${row.id}`,
        key: row.id,
        name: row.name,
        belt,
        populated: row.populated ?? false,
        orbitRadius: row.orbit_radius,
        bearing: row.bearing,
        periodDays: period,
        periodFixed: row.period_days !== undefined,
        extent: 0,
        islands: [],
      };
      const centre = polar(row.orbit_radius, row.bearing);
      arch.islands = (row.islands ?? []).map((is) => {
        const x = centre.x + is.x;
        const y = centre.y + is.y;
        const body = toBody(
          {
            id: is.id,
            name: is.name,
            short_name: is.short_name,
            radius: is.radius,
            seed: is.seed,
            orbit_radius: Math.hypot(x, y),
            bearing: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360,
            period_days: period,
            description: is.description,
          },
          'islet',
          central,
        );
        body.archipelago = arch;
        return body;
      });
      arch.extent = Math.max(0, ...row.islands.map((is, i) => Math.hypot(is.x, is.y) + arch.islands[i].outerRadius));
      belt.archipelagos.push(arch);
      archipelagos.push(arch);
    }
  }
  const seenIds = new Set<string>();
  for (const b of [...bodies, ...archipelagos.flatMap((a) => a.islands)]) {
    if (seenIds.has(b.id)) throw new Error(`world.yaml / archipelagos.yaml: the id "${b.id}" is used twice`);
    seenIds.add(b.id);
  }
  for (const a of archipelagos) bodies.push(...a.islands);
  warnings.push(...checkArchipelagos(archipelagos, params.belts.island_gap));

  for (const id of designs.keys()) {
    if (!bodies.some((b) => b.id === id)) {
      throw new Error(`continents/${id}.svg: no continent, moon or island with id "${id}"`);
    }
  }

  const outermost = Math.max(
    central.radius,
    ...isles.map((i) => i.orbitRadius + i.radius + Math.max(0, ...i.moons.map((m) => m.orbitRadius))),
    ...belts.map((b) => b.outerRadius),
  );
  const oceanRadius = raw.ocean?.radius ?? outermost * 1.08;
  if (oceanRadius < outermost) throw new Error('world.yaml: ocean.radius is smaller than the outermost orbit');

  // A band limit names a belt (its near edge is used), the centre, the edge, or a radius.
  const limit = (v: BandLimit, side: 'inner' | 'outer', bandId: string): number => {
    if (typeof v === 'number') return v;
    if (v === 'centre') return 0;
    if (v === 'edge') return oceanRadius;
    const belt = belts.find((b) => b.id === v);
    if (!belt) throw new Error(`world.yaml: band ${bandId} refers to unknown belt "${v}"`);
    return side === 'inner' ? belt.outerRadius : belt.innerRadius;
  };
  const bands: Band[] = (raw.bands ?? []).map((b) => ({
    id: b.id,
    name: b.name ?? b.id,
    innerRadius: limit(b.inner, 'inner', b.id),
    outerRadius: limit(b.outer, 'outer', b.id),
    description: b.description ?? null,
  }));

  const platformContent: PlatformContent | null = raw.platform_classes?.length
    ? {
        register: raw.platform_register ?? 'REG',
        classes: raw.platform_classes.map((c) => ({ id: c.id, name: c.name ?? c.id, like: c.like ?? null })),
        owners: (raw.platform_owners ?? []).map((o) => ({ id: o.id, name: o.name ?? o.id, code: o.code ?? 'X', imperial: !!o.imperial })),
      }
    : null;
  const parsed = parsePlatforms(sources.platforms ?? [], platformContent, params.platforms, {
    central,
    continents: isles,
    belts,
    bands,
    oceanRadius,
  });
  const { platforms, rules: platformRules } = parsed;
  warnings.push(...parsed.warnings);

  const places = new Map<string, PlaceRow[]>();
  for (const [id, rows] of sources.places ?? []) {
    if (!bodies.some((b) => b.id === id)) warnings.push(`places/${id}.yaml: there is no body "${id}"`);
    else places.set(id, rows ?? []);
  }

  return {
    units: {
      name: raw.units?.name ?? 'League',
      plural: raw.units?.plural ?? raw.units?.name ?? 'Leagues',
      abbr: raw.units?.abbreviation ?? 'L',
    },
    oceanRadius,
    edgeName: raw.ocean?.edge?.name ?? 'The Edge',
    central,
    bodies,
    belts,
    archipelagos,
    bands,
    platforms,
    platformIndex: new Map(platforms.map((p, i) => [p.id, i])),
    platformRules,
    platformContent,
    places,
    warnings,
    extent: oceanRadius,
    designs,
    names,
    params,
  };
}

/** The band containing a distance from the centre, if any. */
export function bandAt(world: World, r: number): Band | null {
  return world.bands.find((b) => r >= b.innerRadius && r < b.outerRadius) ?? null;
}

/** Distance of a body's orbit from the centre (a moon uses its parent's). */
export function orbitalDistance(b: Body): number {
  return b.parent?.parent ? b.parent.orbitRadius : b.orbitRadius;
}

/**
 * Archipelagos that could collide: islands of one group touching, a group
 * reaching past its belt, or two groups that will meet as they turn (in lanes
 * at different speeds that overlap, or at one speed but touching already).
 */
export function checkArchipelagos(archipelagos: Archipelago[], gap: number): string[] {
  const out: string[] = [];
  for (const a of archipelagos) {
    if (a.orbitRadius - a.extent < a.belt.innerRadius || a.orbitRadius + a.extent > a.belt.outerRadius)
      out.push(`${a.name} reaches beyond the ${a.belt.name}`);
    const pos = a.islands.map((i) => polar(i.orbitRadius, i.bearing));
    for (let i = 0; i < a.islands.length; i++)
      for (let j = i + 1; j < a.islands.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
        if (d < a.islands[i].outerRadius + a.islands[j].outerRadius) out.push(`${a.islands[i].name} and ${a.islands[j].name} (${a.name}) overlap`);
      }
  }
  for (let i = 0; i < archipelagos.length; i++)
    for (let j = i + 1; j < archipelagos.length; j++) {
      const a = archipelagos[i];
      const b = archipelagos[j];
      if (a.belt !== b.belt) continue;
      const together = a.extent + b.extent + gap;
      const sameSpeed = Math.abs(a.periodDays - b.periodDays) < 1e-6 * a.periodDays;
      if (sameSpeed) {
        const p = polar(a.orbitRadius, a.bearing);
        const q = polar(b.orbitRadius, b.bearing);
        if (Math.hypot(p.x - q.x, p.y - q.y) < together) out.push(`${a.name} and ${b.name} overlap`);
      } else if (Math.abs(a.orbitRadius - b.orbitRadius) < together) {
        out.push(`${a.name} and ${b.name} will collide: their lanes are ${Math.round(Math.abs(a.orbitRadius - b.orbitRadius))} IL apart, they need ${Math.ceil(together)}`);
      }
    }
  return out;
}

/**
 * A body made of many small islands: a few larger and more smaller ones
 * (a power law), together about a third of the land a single body of this
 * radius would have, scattered within it and kept apart by open water.
 */
function islandGroup(seed: number, radius: number, count: number, coast: { roughness: number; resolution: number }): number[][] {
  const rand = rng(seed * 7 + 1);
  const reach = 1 + coast.roughness; // how far a coast can stray from its island's radius
  let sizes = Array.from({ length: Math.max(1, count) }, () => Math.pow(rand(), -1 / 1.6)).sort((a, b) => b - a);
  const k = (radius * 0.5) / Math.sqrt(sizes.reduce((s, r) => s + r * r, 0));
  sizes = sizes.map((r) => Math.min(radius * 0.35, r * k));
  const gap = radius * 0.08;
  const placed: { x: number; y: number; r: number }[] = [];
  for (const r of sizes) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      // Out to the body's radius, so the islands are scattered rather than huddled.
      const room = Math.max(0, radius * 1.15 - r * reach);
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * room;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (placed.every((q) => Math.hypot(q.x - x, q.y - y) >= (q.r + r) * reach + gap)) {
        placed.push({ x, y, r });
        break;
      }
    }
  }
  return placed.map((q, i) => {
    const unit = coastlinePoints(seed * 131 + i + 1, coast);
    return Array.from(unit, (v, j) => v * q.r + (j % 2 === 0 ? q.x : q.y));
  });
}
