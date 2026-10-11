import yaml from 'js-yaml';

/**
 * Types and validation for src/parameters/*.yaml. The code reads tuning
 * numbers only from here; see src/parameters/README.md.
 */

type Kind3<T> = { city: T; town: T; village: T };

export interface TerrainParams {
  grid: { cells_per_il_of_radius: number; min_cells: number; max_cells: number; islet_min_cells: number };
  coast: Record<'central' | 'continent' | 'moon' | 'islet', { roughness: number; resolution: number }>;
  elevation: { base: number; per_il_of_radius: number; mountain_ranges: { min: number; max: number } };
  water: {
    lake_min_depth: number;
    lake_min_depth_share_of_relief: number;
    lake_min_cells: number;
    river_share: number;
    navigable_share: number;
  };
  design: { max_coast_reach: number; road_snap_share_of_radius: number };
}

export interface SettlementParams {
  seed: number;
  density: Record<string, number>;
  belt_density: Record<string, number>;
  mix: Kind3<number>;
  minimum: { continent: 'city' | 'town' | 'village'; moon: 'city' | 'town' | 'village'; city_from: number };
  spacing: Kind3<number>;
  siting: { base: number; fresh_water: number; coast: number; shore: number; gentle_slope: number; min_region_cells: number };
  village_harbour_chance: number;
  /** Bodies settled differently from their band, by id: density (per 10,000 IL²), coast (settle only within this many IL of the sea). */
  bodies: Record<string, { density?: number; coast?: number }>;
}

export interface RoadParams {
  grade_scale: number;
  slope_weight: number;
  height_scale: number;
  bridge: number;
  reuse: number;
  neighbours: number;
  extra_link_every: number;
}

export interface PlatformParams {
  seed: number;
  clearance: number;
  spacing: number;
  count: Record<string, number>;
  motion: { anchored: number; lane: number; convoy: number; ring: number };
  trade: { weights: Kind3<number>; distance_decay: number; pairs: number };
  siting: { range: number; years: number; samples: number; backbone: number; cell: number; separation: number; max_lanes: number; repair: number };
  /** Continents that draw more or fewer orbiting platforms, by id: weight × their trade, or exact ring and convoy counts. */
  continents: Record<string, { weight?: number; ring?: number; convoy?: number }>;
  /** How many of the platforms siting would put near a belt to keep there (by belt id), and how near counts (IL). */
  near_belts: Record<string, number>;
  near_belt_reach: number;
  moonless_ring_reach: number;
  sizes: Record<string, { radius: number; reveal: number }>;
  owners: Record<string, number>;
}

export interface BeltParams {
  seed: number;
  mass_radius: number;
  archipelagos: Record<string, number>;
  islands_per_archipelago: { min: number; max: number };
  size_spread: number;
  largest_island: number;
  smallest_island: number;
  island_gap: number;
  coast_reach: number;
  edge_margin: number;
  populated_share: number;
}

export interface DisplayParams {
  max_zoom: number;
  symbol_below: number;
  coast_from: number;
  reveal: {
    relief: number;
    rivers: number;
    contours: number;
    settlements: Kind3<number>;
    archipelagos: number;
    ferries: number;
    roads: { highway: number; road: number; track: number };
  };
  platform_label_factor: number;
  platform_rings: number;
}

export interface Parameters {
  terrain: TerrainParams;
  settlements: SettlementParams;
  roads: RoadParams;
  platforms: PlatformParams;
  belts: BeltParams;
  display: DisplayParams;
}

// ── Validation ──────────────────────────────────────────────────────────────

/** 'n' number, 's' string, 'n{}' map of numbers, 's[]' list of strings, '{}' map of objects (checked by `each`). */
type Spec = 'n' | 's' | 'n{}' | 's[]' | { [key: string]: Spec } | { each: Spec };

const k3: Spec = { city: 'n', town: 'n', village: 'n' };

const SPECS: Record<keyof Parameters, Spec> = {
  terrain: {
    grid: { cells_per_il_of_radius: 'n', min_cells: 'n', max_cells: 'n', islet_min_cells: 'n' },
    coast: {
      central: { roughness: 'n', resolution: 'n' },
      continent: { roughness: 'n', resolution: 'n' },
      moon: { roughness: 'n', resolution: 'n' },
      islet: { roughness: 'n', resolution: 'n' },
    },
    elevation: { base: 'n', per_il_of_radius: 'n', mountain_ranges: { min: 'n', max: 'n' } },
    water: { lake_min_depth: 'n', lake_min_depth_share_of_relief: 'n', lake_min_cells: 'n', river_share: 'n', navigable_share: 'n' },
    design: { max_coast_reach: 'n', road_snap_share_of_radius: 'n' },
  },
  settlements: {
    seed: 'n',
    density: 'n{}',
    belt_density: 'n{}',
    mix: k3,
    minimum: { continent: 's', moon: 's', city_from: 'n' },
    spacing: k3,
    siting: { base: 'n', fresh_water: 'n', coast: 'n', shore: 'n', gentle_slope: 'n', min_region_cells: 'n' },
    village_harbour_chance: 'n',
    bodies: { each: 'n{}' },
  },
  roads: { grade_scale: 'n', slope_weight: 'n', height_scale: 'n', bridge: 'n', reuse: 'n', neighbours: 'n', extra_link_every: 'n' },
  platforms: {
    seed: 'n',
    clearance: 'n',
    spacing: 'n',
    count: 'n{}',
    motion: { anchored: 'n', lane: 'n', convoy: 'n', ring: 'n' },
    trade: { weights: k3, distance_decay: 'n', pairs: 'n' },
    siting: { range: 'n', years: 'n', samples: 'n', backbone: 'n', cell: 'n', separation: 'n', max_lanes: 'n', repair: 'n' },
    continents: { each: 'n{}' },
    near_belts: 'n{}',
    near_belt_reach: 'n',
    moonless_ring_reach: 'n',
    sizes: { each: { radius: 'n', reveal: 'n' } },
    owners: 'n{}',
  },
  belts: {
    seed: 'n',
    mass_radius: 'n',
    archipelagos: 'n{}',
    islands_per_archipelago: { min: 'n', max: 'n' },
    size_spread: 'n',
    largest_island: 'n',
    smallest_island: 'n',
    island_gap: 'n',
    coast_reach: 'n',
    edge_margin: 'n',
    populated_share: 'n',
  },
  display: {
    max_zoom: 'n',
    symbol_below: 'n',
    coast_from: 'n',
    reveal: {
      relief: 'n',
      rivers: 'n',
      contours: 'n',
      settlements: k3,
      archipelagos: 'n',
      ferries: 'n',
      roads: { highway: 'n', road: 'n', track: 'n' },
    },
    platform_label_factor: 'n',
    platform_rings: 'n',
  },
};

function check(value: unknown, spec: Spec, path: string, problems: string[]) {
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (spec === 'n') {
    if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`${path} should be a number`);
  } else if (spec === 's') {
    if (typeof value !== 'string') problems.push(`${path} should be text`);
  } else if (spec === 'n{}') {
    if (!isObj(value)) problems.push(`${path} should be a set of named numbers`);
    else for (const [k, v] of Object.entries(value)) check(v, 'n', `${path}.${k}`, problems);
  } else if (spec === 's[]') {
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) problems.push(`${path} should be a list of names`);
  } else if ('each' in spec && Object.keys(spec).length === 1) {
    if (!isObj(value)) problems.push(`${path} should be a set of named entries`);
    else for (const [k, v] of Object.entries(value)) check(v, spec.each as Spec, `${path}.${k}`, problems);
  } else {
    if (!isObj(value)) {
      problems.push(`${path} is missing or not a section`);
      return;
    }
    for (const [k, s] of Object.entries(spec)) {
      if (!(k in value)) problems.push(`${path}.${k} is missing`);
      else check(value[k], s as Spec, `${path}.${k}`, problems);
    }
  }
}

/** Parse and check the parameter files, given each file's text by name (e.g. "terrain"). */
export function parseParameters(sources: Record<string, string>): Parameters {
  const problems: string[] = [];
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(SPECS) as (keyof Parameters)[]) {
    const src = sources[name];
    if (src === undefined) {
      problems.push(`parameters/${name}.yaml is missing`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = yaml.load(src);
    } catch (e) {
      problems.push(`parameters/${name}.yaml: ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    check(parsed, SPECS[name], `parameters/${name}.yaml`, problems);
    out[name] = parsed;
  }
  if (problems.length) throw new Error(`Parameter problems:\n  ${problems.join('\n  ')}`);
  return out as unknown as Parameters;
}
