import yaml from 'js-yaml';
import type { Calendar } from './calendar';
import { rng } from './random';

export type BodyKind = 'central' | 'isle' | 'moon';

export interface Body {
  id: string;
  name: string;
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
  islets: Islet[];
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
  /** Every body in drawing order: central, isles, moons. */
  bodies: Body[];
  belts: Belt[];
  bands: Band[];
  /** Radius of the whole chart (the ocean's edge), IL. */
  extent: number;
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
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function parseWorld(source: string, cal: Calendar): World {
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
    };
    body.moons = (r.moons ?? []).map((m) => toBody(m, 'moon', body));
    return body;
  };

  const central = toBody(raw.central, 'central', null);
  const isles = (raw.orbitals ?? []).map((o) => toBody(o, 'isle', central));
  const bodies = [central, ...isles, ...isles.flatMap((i) => i.moons)];

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
    };
  });

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
    bands,
    extent: oceanRadius,
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
