import type { BeltParams } from '../parameters/schema';
import { polar } from './orbits';
import { rng } from './random';
import { nameMaker, slug, type NameParts } from './terrain/names';

/**
 * Archipelagos: the islands of a belt, in groups that orbit together.
 *
 * Every island of an archipelago shares one orbital period, so the group turns
 * about the centre as a rigid whole and neighbouring islands stay neighbours.
 * Archipelagos sit in lanes across the belt; each lane has its own period
 * (by the belt's own law, P ∝ r^1.5), and lanes are at least one archipelago
 * wide apart, so groups in different lanes pass each other without touching.
 * Within a lane they are spread round the circle and move in step.
 *
 * Island sizes follow a power law and are scaled so that a belt's islands
 * together have the land area of a continent of `mass_radius`.
 */

export interface IslandSpec {
  id: string;
  name: string;
  radius: number;
  seed: number;
  /** Position at day 0, about the ocean's centre. */
  orbitRadius: number;
  bearing: number;
}

export interface ArchipelagoSpec {
  id: string;
  name: string;
  beltId: string;
  populated: boolean;
  /** The group's centre at day 0, and the period all its islands share. */
  orbitRadius: number;
  bearing: number;
  periodDays: number;
  /** How far the group reaches from its centre, IL. */
  extent: number;
  islands: IslandSpec[];
}

export interface BeltShape {
  id: string;
  innerRadius: number;
  outerRadius: number;
  /** Orbital period at the belt's inner edge, days. */
  periodAtInnerDays: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function generateArchipelagos(belt: BeltShape, p: BeltParams, names: NameParts, usedIds: Set<string>): ArchipelagoSpec[] {
  const count = p.archipelagos[belt.id] ?? 0;
  if (!count) return [];
  const rand = rng(p.seed * 7919 + hash(belt.id));
  const randInt = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

  // ── Sizes: power law, scaled to the belt's mass, clamped to sensible islands.
  const raw = Array.from({ length: count }, () =>
    Array.from({ length: randInt(p.islands_per_archipelago.min, p.islands_per_archipelago.max) }, () => Math.pow(rand(), -1 / p.size_spread)).sort(
      (a, b) => b - a,
    ),
  );
  const target = p.mass_radius * p.mass_radius; // compare r² sums (π cancels)
  let k = 1;
  for (let it = 0; it < 6; it++) {
    const area = raw.flat().reduce((s, r) => s + Math.min(p.largest_island, Math.max(p.smallest_island, r * k)) ** 2, 0);
    k *= Math.sqrt(target / area);
  }
  const sizes = raw.map((group) => group.map((r) => Math.min(p.largest_island, Math.max(p.smallest_island, r * k))));

  // ── Layout within each archipelago: largest at the centre, the rest packed around.
  // Spacing is by how far each coast can reach, not the island's nominal radius.
  const reach = (r: number) => r * p.coast_reach;
  const layouts = sizes.map((radii) => {
    const placed: { x: number; y: number; r: number }[] = [{ x: 0, y: 0, r: radii[0] }];
    for (const r of radii.slice(1)) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const anchor = placed[Math.floor(rand() * placed.length)];
        const a = rand() * Math.PI * 2;
        const d = reach(anchor.r) + reach(r) + p.island_gap * (1 + rand() * 1.5);
        const x = anchor.x + Math.cos(a) * d;
        const y = anchor.y + Math.sin(a) * d;
        if (placed.every((q) => Math.hypot(q.x - x, q.y - y) >= reach(q.r) + reach(r) + p.island_gap)) {
          placed.push({ x, y, r });
          break;
        }
      }
    }
    // Centre the group on its bounding circle's middle, roughly.
    const cx = placed.reduce((s, q) => s + q.x, 0) / placed.length;
    const cy = placed.reduce((s, q) => s + q.y, 0) / placed.length;
    for (const q of placed) {
      q.x -= cx;
      q.y -= cy;
    }
    const extent = Math.max(...placed.map((q) => Math.hypot(q.x, q.y) + reach(q.r)));
    return { placed, extent };
  });

  // ── Lanes across the belt, each wide enough for the widest archipelago.
  const widest = Math.max(...layouts.map((l) => l.extent));
  const laneWidth = 2 * widest + 2 * p.island_gap;
  const usable = belt.outerRadius - belt.innerRadius - 2 * p.edge_margin;
  if (laneWidth > usable) {
    throw new Error(
      `parameters/belts.yaml: archipelagos in ${belt.id} are up to ${Math.round(laneWidth)} IL across, wider than the belt (${Math.round(usable)} IL usable). ` +
        `Lower mass_radius or largest_island, or raise islands_per_archipelago.`,
    );
  }
  const lanes = Math.max(1, Math.floor(usable / laneWidth));
  const slack = (usable - lanes * laneWidth) / 2;
  const laneRadius = (l: number) => belt.innerRadius + p.edge_margin + slack + laneWidth * (l + 0.5);
  const perLane = Array.from({ length: lanes }, (_, l) => layouts.filter((_, i) => i % lanes === l).length);

  const specs: ArchipelagoSpec[] = [];
  layouts.forEach((layout, i) => {
    const lane = i % lanes;
    const j = Math.floor(i / lanes);
    const m = perLane[lane];
    const r = laneRadius(lane);
    // Evenly round the lane (offset per lane), with a little jitter well inside the spacing.
    const bearing = ((360 * (j + 0.5 * (lane % 2))) / m + (rand() - 0.5) * (120 / m) + 360) % 360;
    const periodDays = belt.periodAtInnerDays * Math.pow(r / belt.innerRadius, 1.5);
    const centre = polar(r, bearing);

    const seed = p.seed * 1009 + hash(`${belt.id}#${i}`);
    const makeName = nameMaker(seed, names);
    const pattern = names.archipelagoPatterns[Math.floor(rand() * names.archipelagoPatterns.length)];
    const archName = pattern.replace('{name}', makeName({ coastal: false, river: false, high: false }));
    const islands = layout.placed.map((q) => {
      const name = makeName({ coastal: false, river: false, high: false });
      let id = `${belt.id}-${slug(name)}`;
      for (let n = 2; usedIds.has(id); n++) id = `${belt.id}-${slug(name)}-${n}`;
      usedIds.add(id);
      const x = centre.x + q.x;
      const y = centre.y + q.y;
      const b = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
      return { id, name, radius: Math.round(q.r * 10) / 10, seed: hash(id), orbitRadius: Math.hypot(x, y), bearing: b };
    });
    specs.push({
      id: `arch:${belt.id}:${slug(archName)}`,
      name: archName,
      beltId: belt.id,
      populated: i === 0 || rand() < p.populated_share,
      orbitRadius: r,
      bearing,
      periodDays,
      extent: layout.extent,
      islands,
    });
  });
  return specs;
}
