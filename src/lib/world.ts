import yaml from 'js-yaml';
import type { Calendar } from './calendar';
import type { Parameters } from '../parameters/schema';
import { generatePlatforms, type Platform, type PlatformContent, type PlatformRules } from './platforms';
import { generateArchipelagos } from './archipelagos';
import { coastlinePoints } from './coastline';
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
  id: string;
  name: string;
  belt: Belt;
  populated: boolean;
  /** Centre at day 0, and the period every island shares. */
  orbitRadius: number;
  bearing: number;
  periodDays: number;
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

export interface WorldSources {
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
      const unit = coastlinePoints(body.seed, params.terrain.coast[kind === 'isle' ? 'continent' : kind]);
      body.coast = [Array.from(unit, (v) => v * r.radius)];
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
  // all islands of a group sharing its period.
  const usedIds = new Set(bodies.map((b) => b.id));
  const archipelagos: Archipelago[] = [];
  for (const belt of belts) {
    for (const spec of generateArchipelagos(belt, params.belts, names, usedIds)) {
      const arch: Archipelago = {
        id: spec.id,
        name: spec.name,
        belt,
        populated: spec.populated,
        orbitRadius: spec.orbitRadius,
        bearing: spec.bearing,
        periodDays: spec.periodDays,
        extent: spec.extent,
        islands: [],
      };
      arch.islands = spec.islands.map((is) => {
        const body = toBody(
          { id: is.id, name: is.name, radius: is.radius, seed: is.seed, orbit_radius: is.orbitRadius, bearing: is.bearing, period_days: spec.periodDays },
          'islet',
          central,
        );
        body.archipelago = arch;
        return body;
      });
      belt.archipelagos.push(arch);
      archipelagos.push(arch);
      bodies.push(...arch.islands);
    }
  }
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
  const { platforms, rules: platformRules } = generatePlatforms(platformContent, params.platforms, {
    central,
    continents: isles,
    belts,
    bands,
    oceanRadius,
  });

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
