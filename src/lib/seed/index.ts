import yaml from 'js-yaml';
import { archipelagoRow, generateArchipelagos, type ArchipelagoRows } from '../archipelagos';
import type { PlatformRow } from '../platforms';
import { generatePlaces } from '../terrain';
import type { Body, PlaceRow, World } from '../world';

export { sitePlatforms } from './platforms';

/**
 * Seeding: the generators that write the starting data files. The world is
 * then read from those files, which you are free to edit (by hand or in the
 * Atlas's editor); nothing is regenerated unless you seed again.
 */

/** Fresh archipelagos for every belt (`npm run seed -- archipelagos`). */
export function seedArchipelagos(world: World): ArchipelagoRows {
  const used = new Set(world.bodies.filter((b) => b.kind !== 'islet').map((b) => b.id));
  const out: ArchipelagoRows = {};
  for (const belt of world.belts) out[belt.id] = generateArchipelagos(belt, world.params.belts, world.names, used).map(archipelagoRow);
  return out;
}

/** Fresh settlements for a body (`npm run seed -- places <id>`). */
export function seedPlaces(world: World, body: Body): PlaceRow[] {
  return generatePlaces(world, body);
}

// ── File formats ──────────────────────────────────────────────────────────────

const dump = (v: unknown, flowLevel: number) => yaml.dump(v, { flowLevel, lineWidth: -1, noRefs: true, noCompatMode: true });

export function formatArchipelagos(rows: ArchipelagoRows): string {
  return `# ─────────────────────────────────────────────────────────────────────────────
#  ARCHIPELAGOS — the islands of the belts, grouped by belt id
#
#  Seeded by \`npm run seed -- archipelagos\` (tuned in parameters/belts.yaml),
#  then yours to edit: here or in the Atlas's editor (\`npm run dev\`).
#
#  Every island of an archipelago shares its orbit, so the group turns about
#  the centre as one. Per archipelago:
#    id            unique within its belt (the full id is arch:<belt>:<id>)
#    orbit_radius  the group's centre: IL from the centre of the ocean...
#    bearing       ...and compass bearing, at day 0
#    period_days   optional; otherwise by the belt's law (P ∝ r^1.5)
#    populated     whether \`npm run seed -- places\` settles it
#  Per island: a body id (unique in the world), name, radius (IL), seed (its
#  coastline), and x/y: its offset from the group's centre (IL, x east, y south).
#  Archipelagos in a belt must not meet as they turn: groups at different
#  radii need their lanes to be further apart than their reaches.
# ─────────────────────────────────────────────────────────────────────────────

${dump(rows, 4)}`;
}

export function formatPlaces(body: Body, rows: PlaceRow[]): string {
  return `# Settlements on ${body.name} (see README.md in this folder).\n\n${rows.length ? dump(rows, 1) : '[]\n'}`;
}

export function formatPlatforms(rows: PlatformRow[]): string {
  return `# ─────────────────────────────────────────────────────────────────────────────
#  OCEAN PLATFORMS — one per line, by register number
#
#  Sited by \`npm run seed -- platforms\` (tuned in parameters/platforms.yaml),
#  where valuable trade passes most often; then yours to edit. Re-site after
#  moving continents a long way. class and owner: ids from world.yaml.
#  motion:
#    anchored  radius, bearing: fixed, IL and compass bearing from the centre
#    lane      radius, bearing: orbits the centre (bearing at day 0)
#    convoy    with, offset: rides continent \`with\`'s orbit, \`offset\`° ahead (+) or behind (−)
#    ring      around, radius, bearing: orbits continent \`around\` (bearing at day 0)
#  The Atlas warns about any platform in something's path.
# ─────────────────────────────────────────────────────────────────────────────

${rows.length ? dump(rows, 1) : '[]\n'}`;
}
