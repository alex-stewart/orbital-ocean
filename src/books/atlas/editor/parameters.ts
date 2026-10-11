import type { World } from '../../../lib/world';

/**
 * The parameters worth tuning from the editor: the ones whose effect you can
 * judge by eye. The rest stay in src/parameters/*.yaml, documented there.
 */
export interface ParamSpec {
  group: string;
  label: string;
  /** Relative to src/. */
  file: string;
  path: string[];
  step?: number;
  min?: number;
  hint?: string;
}

const P = (group: string, file: string, path: string, label: string, extra: Partial<ParamSpec> = {}): ParamSpec => ({
  group,
  label,
  file: `parameters/${file}.yaml`,
  path: path.split('.'),
  min: 0,
  ...extra,
});

const LIVE = 'On the chart now';
const PLACES = 'When places are regenerated';
const PLATFORMS = 'When platforms are re-sited';
const BELTS = 'When archipelagos are regenerated';

export const PARAMETERS: ParamSpec[] = [
  P(LIVE, 'roads', 'slope_weight', 'Roads avoid slopes', { step: 0.5 }),
  P(LIVE, 'roads', 'bridge', 'Cost of a bridge', { step: 1 }),
  P(LIVE, 'roads', 'reuse', 'Roads share routes (lower: more)', { step: 0.05 }),
  P(LIVE, 'terrain', 'water.river_share', 'Rivers drawn from (share of land upstream)', { step: 0.002, hint: 'Lower: more, smaller rivers' }),
  P(LIVE, 'terrain', 'water.navigable_share', 'Rivers navigable from', { step: 0.01 }),
  P(LIVE, 'terrain', 'water.lake_min_depth', 'Lakes at least this deep (m)', { step: 1 }),

  P(PLACES, 'settlements', 'density.home', 'Places per 10,000 IL², Home Band', { step: 0.5 }),
  P(PLACES, 'settlements', 'density.second', 'Second Band', { step: 0.5 }),
  P(PLACES, 'settlements', 'density.frontier', 'Frontier Band', { step: 0.1 }),
  P(PLACES, 'settlements', 'belt_density.war-belt', 'War Belt islands', { step: 0.5 }),
  P(PLACES, 'settlements', 'belt_density.far-belt', 'Far Belt islands', { step: 0.5 }),
  P(PLACES, 'settlements', 'mix.city', 'Share of cities', { step: 0.01 }),
  P(PLACES, 'settlements', 'mix.town', 'Share of towns', { step: 0.01 }),
  P(PLACES, 'settlements', 'mix.village', 'Share of villages', { step: 0.01 }),
  P(PLACES, 'settlements', 'spacing.city', 'Space round a city (IL)', { step: 1 }),
  P(PLACES, 'settlements', 'spacing.town', 'Space round a town (IL)', { step: 1 }),
  P(PLACES, 'settlements', 'spacing.village', 'Space round a village (IL)', { step: 1 }),

  P(PLATFORMS, 'platforms', 'siting.range', "A ship's longest leg between resupply points (IL)", { step: 50 }),
  P(PLATFORMS, 'platforms', 'count.grand', 'Grand platforms', { step: 1 }),
  P(PLATFORMS, 'platforms', 'count.keep', 'Keeps', { step: 5 }),
  P(PLATFORMS, 'platforms', 'motion.anchored', 'Share anchored', { step: 0.05 }),
  P(PLATFORMS, 'platforms', 'motion.lane', 'Share on lanes', { step: 0.05 }),
  P(PLATFORMS, 'platforms', 'motion.convoy', 'Share in convoy', { step: 0.05 }),
  P(PLATFORMS, 'platforms', 'motion.ring', 'Share in rings', { step: 0.05 }),
  P(PLATFORMS, 'platforms', 'siting.backbone', 'Share of anchored in rings round the water', { step: 0.05 }),
  P(PLATFORMS, 'platforms', 'siting.separation', 'Anchored at least this far apart (IL)', { step: 10 }),
  P(PLATFORMS, 'platforms', 'siting.years', 'Years of trade considered', { step: 5, hint: 'Fewer: sited for the routes of the present era' }),

  P(BELTS, 'belts', 'mass_radius', "A belt's land, as a continent of this radius", { step: 5 }),
  P(BELTS, 'belts', 'archipelagos.war-belt', 'Archipelagos in the War Belt', { step: 1 }),
  P(BELTS, 'belts', 'archipelagos.far-belt', 'Archipelagos in the Far Belt', { step: 1 }),
  P(BELTS, 'belts', 'populated_share', 'Share settled', { step: 0.05 }),
];

/** The parameter's current value. */
export function paramValue(world: World, spec: ParamSpec): number {
  const name = spec.file.replace(/^parameters\/|\.yaml$/g, '') as keyof World['params'];
  let v: unknown = world.params[name];
  for (const k of spec.path) v = (v as Record<string, unknown>)?.[k];
  return typeof v === 'number' ? v : NaN;
}
