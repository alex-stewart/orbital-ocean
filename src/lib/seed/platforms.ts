import { platformPositions, polar, positionsAt, type Point } from '../orbits';
import {
  convoyMinOffset,
  freeIntervals,
  parsePlatforms,
  platformKinds,
  ringWater,
  sweptRings,
  type OceanLayout,
  type PlatformMotion,
  type PlatformRow,
} from '../platforms';
import { rng } from '../random';
import { chiefPorts, planShipping } from '../shipping';
import { continentMap, primeContinentMap } from '../terrain';
import type { Body, World } from '../world';

/**
 * Siting platforms where they earn their keep (`npm run seed -- platforms`).
 *
 * Trade between every pair of chief ports is sampled on many dates over the
 * years (by the shipping model's gravity rule), and the value of each voyage
 * is spread along its line. Then:
 *  - anchored platforms go where the most valuable traffic passes most often,
 *    in the water no continent sweeps, a fair distance apart;
 *  - lanes open about the centre at the radii most traffic crosses, and lane
 *    platforms spread round them;
 *  - convoys ride ahead of and behind the continents that trade most, and
 *    rings orbit them;
 *  - the busiest spots get the grand platforms, the rest are keeps;
 *  - finally, routes still beyond resupply range on some dates get extra
 *    keeps along their way.
 * Everything sited follows the collision rules in platforms.ts.
 */

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

interface Sited {
  motion: PlatformMotion;
  radius?: number;
  bearing?: number;
  with?: string;
  offset?: number;
  around?: string;
  value: number;
  /** Map position (anchored), for spacing. */
  at?: Point;
}

/** Split `total` among weights, by largest remainder. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (const { i } of exact.map((v, i) => ({ i, r: v - Math.floor(v) })).sort((a, b) => b.r - a.r)) {
    if (left-- <= 0) break;
    out[i]++;
  }
  return out;
}

export function sitePlatforms(world: World, yearDays: number): { rows: PlatformRow[]; report: string[] } {
  const content = world.platformContent;
  if (!content) return { rows: [], report: ['world.yaml lists no platform classes'] };
  const P = world.params.platforms;
  const S = world.params.shipping;
  const rand = rng(P.seed * 7717 + 3);
  const { clearance } = P;
  const report: string[] = [];
  const continents = world.bodies.filter((b) => b.kind === 'isle');
  const layout: OceanLayout = { central: world.central, continents, belts: world.belts, bands: world.bands, oceanRadius: world.oceanRadius };
  const { sizes } = platformKinds(content, P.sizes);
  const counts = Object.fromEntries(sizes.map((s) => [s.id, Math.max(0, Math.round(P.count[s.id] ?? 0))]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // ── Demand: valuable voyages over the years ─────────────────────────────────
  for (const b of world.bodies) continentMap(world, b);
  const ports = chiefPorts(world, S);
  const portOf = new Map<string, number>(); // continent id → its trade value
  const cell = P.siting.cell;
  const anchoredCells = new Map<string, { v: number; x: number; y: number }>();
  const laneBin = 10;
  const laneValue = new Map<number, number>();
  const samples = Math.max(1, P.siting.samples);
  const span = P.siting.years * yearDays;
  for (let k = 0; k < samples; k++) {
    const t = (span * (k + 0.5)) / samples;
    const pos = positionsAt(world.bodies, t);
    const at = ports.map((p) => {
      const c = pos.get(p.body.id)!;
      return { x: c.x + p.settlement.x, y: c.y + p.settlement.y };
    });
    const pairs: { a: number; b: number; trade: number }[] = [];
    for (let a = 0; a < ports.length; a++)
      for (let b = a + 1; b < ports.length; b++) {
        const d = Math.hypot(at[a].x - at[b].x, at[a].y - at[b].y);
        pairs.push({ a, b, trade: (ports[a].weight * ports[b].weight) / Math.max(1, d) ** S.distance_decay });
      }
    pairs.sort((x, y) => y.trade - x.trade);
    const chosen = pairs.slice(0, S.max_routes);
    for (let i = 0; i < ports.length; i++) if (!chosen.some((c) => c.a === i || c.b === i)) chosen.push(pairs.find((c) => c.a === i || c.b === i)!);
    const top = chosen[0]?.trade || 1;
    for (const { a, b, trade } of chosen) {
      const v = trade / top / samples;
      for (const i of [a, b]) {
        const c = ports[i].body.kind === 'isle' ? ports[i].body : ports[i].body.parent?.kind === 'isle' ? ports[i].body.parent : null;
        if (c) portOf.set(c.id, (portOf.get(c.id) ?? 0) + v);
      }
      // Spread the voyage's value along its line, per IL sailed.
      const p = at[a];
      const q = at[b];
      const len = Math.hypot(q.x - p.x, q.y - p.y);
      const steps = Math.max(1, Math.ceil(len / (cell / 2)));
      for (let s = 0; s <= steps; s++) {
        const x = p.x + ((q.x - p.x) * s) / steps;
        const y = p.y + ((q.y - p.y) * s) / steps;
        const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
        const c = anchoredCells.get(key) ?? { v: 0, x: 0, y: 0 };
        const w = (v * len) / (steps + 1);
        c.v += w;
        c.x += x * w;
        c.y += y * w;
        anchoredCells.set(key, c);
        const bin = Math.floor(Math.hypot(x, y) / laneBin);
        laneValue.set(bin, (laneValue.get(bin) ?? 0) + w);
      }
    }
  }

  // ── How many of each motion ─────────────────────────────────────────────────
  const m = P.motion;
  const [nAnchored, nLane, nConvoy, nRing] = apportion(total, [m.anchored, m.lane, m.convoy, m.ring]);
  const value = (c: Body) => portOf.get(c.id) ?? 0;
  const sited: Sited[] = [];

  // Rings about the continents that trade most (one ring each, in the clear water before the moons).
  const ringFor = new Map<string, number>();
  for (const c of continents) {
    const water = ringWater(c, clearance, P.moonless_ring_reach).filter(([a, b]) => b - a >= 4);
    if (water.length) ringFor.set(c.id, Math.round((water[0][0] + water[0][1]) / 2));
  }
  const ringed = continents.filter((c) => ringFor.has(c.id) && value(c) > 0);
  apportion(nRing, ringed.map(value)).forEach((n, i) => {
    const c = ringed[i];
    const radius = ringFor.get(c.id)!;
    const start = rand() * 360;
    for (let j = 0; j < n; j++)
      sited.push({ motion: 'ring', around: c.id, radius, bearing: round((start + (360 * j) / n) % 360, 1), value: value(c) / n });
  });
  const rings = new Map<string, { radius: number }[]>();
  for (const s of sited) if (s.motion === 'ring') rings.set(s.around!, [{ radius: s.radius! }]);

  // Convoys ahead of and behind the busiest continents.
  const convoyed = continents.filter((c) => value(c) > 0 && convoyMinOffset(c, rings.get(c.id) ?? [], clearance) < 150);
  apportion(nConvoy, convoyed.map(value)).forEach((n, i) => {
    const c = convoyed[i];
    const min = convoyMinOffset(c, rings.get(c.id) ?? [], clearance);
    // Alternate ahead and behind, spreading out from the nearest allowed angle.
    const room = 180 - min;
    for (let j = 0; j < n; j++) {
      const side = j % 2 === 0 ? 1 : -1;
      const step = Math.floor(j / 2);
      const per = Math.ceil(n / 2);
      sited.push({ motion: 'convoy', with: c.id, offset: round(side * (min + 2 + (room - 4) * (per > 1 ? step / (per - 1) : 0.15)), 1), value: value(c) / n });
    }
  });

  // Lanes where the most traffic crosses, in the gaps no continent sweeps.
  const { gaps } = sweptRings(layout, rings, clearance);
  const laneCandidates: { r: number; v: number }[] = [];
  for (const [a, b] of gaps) {
    for (let r = a + clearance; r <= b - clearance; r += laneBin) {
      let v = 0;
      for (let d = -2; d <= 2; d++) v += laneValue.get(Math.floor(r / laneBin) + d) ?? 0;
      laneCandidates.push({ r: Math.round(r), v });
    }
  }
  laneCandidates.sort((x, y) => y.v - x.v);
  const lanes: { r: number; v: number }[] = [];
  for (const c of laneCandidates) {
    if (lanes.length >= Math.min(P.siting.max_lanes, nLane)) break;
    if (c.v <= 0 || lanes.some((l) => Math.abs(l.r - c.r) < clearance * 6)) continue;
    lanes.push(c);
  }
  apportion(nLane, lanes.map((l) => l.v)).forEach((n, i) => {
    const start = rand() * 360;
    for (let j = 0; j < n; j++) sited.push({ motion: 'lane', radius: lanes[i].r, bearing: round((start + (360 * j) / n) % 360, 1), value: lanes[i].v / n });
  });

  // Anchored platforms at the hottest spots of open water, a fair way apart.
  const anchoredWater = gaps.flatMap(([a, b]) =>
    freeIntervals(
      lanes.map((l) => [l.r - clearance, l.r + clearance] as [number, number]),
      a,
      b,
    ),
  );
  const inWater = (p: Point) => {
    const r = Math.hypot(p.x, p.y);
    return anchoredWater.some(([a, b]) => r > a + 1 && r < b - 1);
  };
  const candidates = [...anchoredCells.values()]
    .map((c) => ({ v: c.v, at: { x: c.x / c.v, y: c.y / c.v } }))
    .filter((c) => c.v > 0 && inWater(c.at))
    .sort((a, b) => b.v - a.v);
  const anchored: Sited[] = [];
  const far = (p: Point, min: number) => anchored.every((q) => Math.hypot(q.at!.x - p.x, q.at!.y - p.y) >= min);

  // First a backbone: rings of anchored keeps round the open water between
  // orbits, close enough together for ships to work their way round and
  // across. Rings go to the water that trade crosses most, while the budget lasts.
  const step = S.resupply_range * 0.8;
  const backboneBudget = Math.round(nAnchored * P.siting.backbone);
  const rings_: { r: number; v: number; n: number }[] = anchoredWater
    .filter(([a, b]) => b - a >= 2)
    .map(([a, b]) => {
      // The busiest radius in this stretch of water.
      let best = (a + b) / 2;
      let bestV = -1;
      for (let r = a + 1; r <= b - 1; r += laneBin / 2) {
        const v = laneValue.get(Math.floor(r / laneBin)) ?? 0;
        if (v > bestV) [best, bestV] = [r, v];
      }
      let v = 0;
      for (let r = a; r < b; r += laneBin) v += laneValue.get(Math.floor(r / laneBin)) ?? 0;
      return { r: best, v, n: Math.max(3, Math.ceil((2 * Math.PI * best) / step)) };
    })
    .sort((x, y) => y.v - x.v);
  let left = backboneBudget;
  for (const ring of rings_) {
    if (left <= 0 || ring.v <= 0) break;
    const n = Math.min(ring.n, left);
    const start = rand() * 360;
    for (let j = 0; j < n; j++) {
      // Evenly round (or as far round as the budget goes), each nudged to the busiest cell near its place.
      const b0 = start + (360 * j) / ring.n;
      let at = polar(ring.r, b0);
      let v = 0;
      for (const c of candidates) {
        const r = Math.hypot(c.at.x, c.at.y);
        const db = Math.abs(((((Math.atan2(c.at.x, -c.at.y) * 180) / Math.PI - b0) % 360) + 540) % 360 - 180);
        if (Math.abs(r - ring.r) < cell * 2 && db < 90 / ring.n && c.v > v) [at, v] = [c.at, c.v];
      }
      if (!far(at, P.siting.separation)) continue;
      anchored.push(anchorAt(at, v));
      left--;
    }
  }
  const backbone = anchored.length;

  // Then the hottest spots of open water, a fair way apart.
  for (const c of candidates) {
    if (anchored.length >= nAnchored) break;
    if (!far(c.at, P.siting.separation)) continue;
    anchored.push(anchorAt(c.at, c.v));
  }
  sited.push(...anchored);
  report.push(
    `Sited ${sited.length} platforms over ${P.siting.years} years of trade (${samples} dates): ` +
      `${anchored.length} anchored (${backbone} in rings round the open water), ${sited.filter((s) => s.motion === 'lane').length} on ${lanes.length} lanes, ` +
      `${sited.filter((s) => s.motion === 'convoy').length} in convoy, ${sited.filter((s) => s.motion === 'ring').length} in rings.`,
  );

  // ── Classes, owners, numbers ────────────────────────────────────────────────
  const toRows = (list: Sited[]): PlatformRow[] => {
    // Grand platforms where value is highest (relative to their own kind, so every kind gets some).
    const maxBy = new Map<string, number>();
    for (const s of list) maxBy.set(s.motion, Math.max(maxBy.get(s.motion) ?? 0, s.value));
    const ranked = list.map((s, i) => ({ i, score: s.value / (maxBy.get(s.motion) || 1) })).sort((a, b) => b.score - a.score);
    const classOf = new Array<string>(list.length);
    const ordered = [...sizes].sort((a, b) => b.radius - a.radius);
    let next = 0;
    for (const size of ordered) {
      const n = size === ordered[ordered.length - 1] ? list.length : counts[size.id];
      for (let k = 0; k < n && next < ranked.length; k++) classOf[ranked[next++].i] = size.id;
    }
    // Others hold a share of the keeps, in the quieter spots.
    const owners = content.owners.filter((o) => (P.owners[o.id] ?? 0) > 0);
    const imperial = owners.find((o) => o.imperial) ?? owners[0];
    const ownerOf = list.map(() => imperial.id);
    const quiet = ranked.filter(({ i }) => classOf[i] !== ordered[0].id).reverse();
    const others = owners.filter((o) => o !== imperial);
    const shares = apportion(
      Math.round(quiet.length * others.reduce((s, o) => s + P.owners[o.id], 0)),
      others.map((o) => P.owners[o.id]),
    );
    let q = 0;
    others.forEach((o, k) => {
      for (let j = 0; j < shares[k] && q < quiet.length; j++) {
        // Skip a few, so independents aren't simply the very quietest.
        if (rand() < 0.5 && q + 1 < quiet.length) q++;
        ownerOf[quiet[q++].i] = o.id;
      }
    });
    const order = list.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const counters = new Map<string, number>();
    const rows = new Array<PlatformRow>(list.length);
    for (const i of order) {
      const owner = content.owners.find((o) => o.id === ownerOf[i])!;
      const n = (counters.get(owner.code) ?? 0) + 1;
      counters.set(owner.code, n);
      const s = list[i];
      const row: PlatformRow = { id: `${content.register}-${owner.code}-${String(n).padStart(5, '0')}`, class: classOf[i], owner: owner.id, motion: s.motion };
      if (s.motion === 'convoy') Object.assign(row, { with: s.with, offset: s.offset });
      else if (s.motion === 'ring') Object.assign(row, { around: s.around, radius: s.radius, bearing: s.bearing });
      else Object.assign(row, { radius: s.radius, bearing: s.bearing });
      rows[i] = row;
    }
    // Listed in register order, which is easier to find things in.
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  };

  // ── Close gaps: extra keeps where wanted routes are out of range ────────────
  const evaluate = (rows: PlatformRow[]) => {
    const parsed = parsePlatforms(rows, content, P, layout);
    const w: World = { ...world, platforms: parsed.platforms, platformIndex: new Map(parsed.platforms.map((p, i) => [p.id, i])), platformRules: parsed.rules };
    // Maps are cached per world: share the ones already built.
    for (const b of world.bodies) primeContinentMap(w, b.id, continentMap(world, b));
    const dates = Array.from({ length: 16 }, (_, k) => (span * (k + 0.37)) / 16);
    let wanted = 0;
    let failed = 0;
    const misses: { a: Point; b: Point }[] = [];
    for (const t of dates) {
      const pos = positionsAt(w.bodies, t);
      const net = planShipping(w, t, pos, platformPositions(w.platforms, t, pos));
      wanted += net.routes.length + net.unreachable.length;
      failed += net.unreachable.length;
      for (const [a, b] of net.unreachable.slice(0, 6)) {
        const pa = net.ports.find((p) => p.id === a)!;
        const pb = net.ports.find((p) => p.id === b)!;
        const ca = pos.get(pa.body.id)!;
        const cb = pos.get(pb.body.id)!;
        misses.push({ a: { x: ca.x + pa.settlement.x, y: ca.y + pa.settlement.y }, b: { x: cb.x + pb.settlement.x, y: cb.y + pb.settlement.y } });
      }
    }
    return { share: wanted ? 1 - failed / wanted : 1, misses, warnings: parsed.warnings };
  };
  let rows = toRows(sited);
  let check = evaluate(rows);
  report.push(`Wanted routes within resupply range: ${Math.round(check.share * 100)}% of sampled dates.`);
  let added = 0;
  for (let round_ = 0; round_ < 4 && added < P.siting.repair && check.misses.length; round_++) {
    for (const { a, b } of check.misses) {
      if (added >= P.siting.repair) break;
      // Along the line, wherever no anchored platform is within half a range, add one (in open water).
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.ceil(len / (S.resupply_range * 0.6));
      for (let s = 1; s < steps && added < P.siting.repair; s++) {
        const p = { x: a.x + ((b.x - a.x) * s) / steps, y: a.y + ((b.y - a.y) * s) / steps };
        if (!inWater(p) || !far(p, S.resupply_range * 0.5)) continue;
        const k = anchorAt(p, 0);
        anchored.push(k);
        sited.push(k);
        added++;
      }
    }
    rows = toRows(sited);
    check = evaluate(rows);
  }
  if (added) report.push(`Added ${added} keeps to close gaps; now ${Math.round(check.share * 100)}% within range.`);
  if (check.warnings.length) report.push(...check.warnings.map((w) => `warning: ${w}`));
  return { rows, report };
}

function anchorAt(p: Point, value: number): Sited {
  const r = Math.hypot(p.x, p.y);
  const bearing = ((Math.atan2(p.x, -p.y) * 180) / Math.PI + 360) % 360;
  const at = polar(r, bearing);
  return { motion: 'anchored', radius: round(r, 1), bearing: round(bearing, 2), value, at };
}
