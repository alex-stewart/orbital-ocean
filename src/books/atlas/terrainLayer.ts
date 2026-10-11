import type { IslandShape } from '../../lib/coastline';
import type { Point } from '../../lib/orbits';
import { sample } from '../../lib/terrain/grid';
import { continentMap, type ContinentMap, type RoadRank, type Settlement, type SettlementKind } from '../../lib/terrain';
import type { Body } from '../../lib/world';
import { textWidth, type Box, type HitTarget, type RenderInput } from './render';
import { fonts, theme } from './theme';

/**
 * Continent detail: shaded relief, contours, lakes, rivers, roads and
 * settlements, each revealed by zoom as the body grows on screen
 * (thresholds in src/parameters/display.yaml → reveal).
 */


const water = '#4f7a96';
const lakeFill = '#cfdfe0';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Hypsometric tints, by height in metres.
export const RAMP: [number, [number, number, number]][] = [
  [0, [233, 227, 186]],
  [200, [229, 219, 170]],
  [600, [223, 204, 148]],
  [1200, [210, 183, 124]],
  [1800, [191, 160, 106]],
  [2400, [170, 143, 110]],
  [2900, [196, 188, 176]],
  [3300, [247, 245, 239]],
];

function tint(e: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    if (e <= RAMP[i][0]) {
      const [e0, c0] = RAMP[i - 1];
      const [e1, c1] = RAMP[i];
      const t = (e - e0) / (e1 - e0);
      return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

interface Drawables {
  relief: HTMLCanvasElement;
  contours: { level: number; path: Path2D }[];
  lakes: Path2D;
  /** River segments grouped by width bucket (0–4), plus navigable stretches. */
  rivers: Path2D[];
  navigable: Path2D;
  roads: Record<RoadRank, Path2D>;
}

const cache = new WeakMap<ContinentMap, Drawables>();

/** Relief image (tint × hillshade) and cached paths, built once per map. */
function drawables(map: ContinentMap): Drawables {
  const hit = cache.get(map);
  if (hit) return hit;
  const { grid: g, elevation: e, land } = map;
  const { n } = g;
  // Twice the grid's resolution, with heights interpolated between cells, so the
  // shading stays smooth when zoomed in. Sea counts as height 0 here: the coast
  // clip hides it, and it keeps the shoreline colour from fringing. Lakes are
  // shaded as land too; their outlines are drawn over the top (no pale halo).
  const R = 2;
  const size = n * R;
  const flat = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) flat[k] = land[k] ? Math.max(0, e[k]) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const exaggerate = 6;
  const L = [-1, -1, 1.3];
  const ll = Math.hypot(...L);
  const step = g.cell / R;
  for (let pj = 0; pj < size; pj++)
    for (let pi = 0; pi < size; pi++) {
      const x = -g.half + (pi + 0.5) * step;
      const y = -g.half + (pj + 0.5) * step;
      const h = sample(g, flat, x, y);
      const dzdx = ((sample(g, flat, x + step, y) - sample(g, flat, x - step, y)) / (2 * step * 1000)) * exaggerate;
      const dzdy = ((sample(g, flat, x, y + step) - sample(g, flat, x, y - step)) / (2 * step * 1000)) * exaggerate;
      const nl = Math.hypot(dzdx, dzdy, 1);
      const shade = (-dzdx * L[0] - dzdy * L[1] + L[2]) / (nl * ll);
      const f = Math.min(1.1, Math.max(0.72, 0.62 + 0.45 * shade));
      const rgb = tint(h);
      const o = (pj * size + pi) * 4;
      img.data[o] = rgb[0] * f;
      img.data[o + 1] = rgb[1] * f;
      img.data[o + 2] = rgb[2] * f;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);

  const contours = map.contours.map(({ level, lines }) => {
    const p = new Path2D();
    for (const l of lines) for (let i = 0; i < l.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, l[i], l[i + 1]);
    return { level, path: p };
  });

  const lakes = new Path2D();
  for (const ring of map.lakes) {
    for (let i = 0; i < ring.length; i += 2) (i ? lakes.lineTo : lakes.moveTo).call(lakes, ring[i], ring[i + 1]);
    lakes.closePath();
  }

  const rivers = Array.from({ length: 5 }, () => new Path2D());
  const navigable = new Path2D();
  for (const r of map.rivers) {
    for (let v = 1; v < r.points.length / 2; v++) {
      const b = Math.min(4, Math.floor(r.flow[v] * 5));
      rivers[b].moveTo(r.points[v * 2 - 2], r.points[v * 2 - 1]);
      rivers[b].lineTo(r.points[v * 2], r.points[v * 2 + 1]);
    }
    if (r.navigableFrom >= 0) {
      for (let v = r.navigableFrom; v < r.points.length / 2; v++) (v === r.navigableFrom ? navigable.moveTo : navigable.lineTo).call(navigable, r.points[v * 2], r.points[v * 2 + 1]);
    }
  }

  const roads = { highway: new Path2D(), road: new Path2D(), track: new Path2D() };
  for (const r of map.roads) {
    const p = roads[r.rank];
    for (let i = 0; i < r.points.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, r.points[i], r.points[i + 1]);
  }

  const d = { relief: canvas, contours, lakes, rivers, navigable, roads };
  cache.set(map, d);
  return d;
}

/**
 * Draw a continent's terrain inside its coast. Called with the canvas in
 * base (screen px) transform; `p` is the continent's centre on screen.
 */
export function drawTerrain(ctx: CanvasRenderingContext2D, s: RenderInput, body: Body, p: Point, sr: number, shape: IslandShape) {
  const { dpr, layers, view } = s;
  const map = continentMap(s.world, body);
  const d = drawables(map);
  const scale = view.scale;
  const px = 1 / scale; // one screen pixel in local IL
  const reveal = s.world.params.display.reveal;
  // Each kind of detail fades in from 70% of its reveal size.
  const fade = (at: number) => smoothstep(at * 0.7, at, sr);

  ctx.save();
  // Clip to the coast (shapes are unit-scale), then switch to local IL.
  ctx.setTransform(dpr * sr, 0, 0, dpr * sr, dpr * p.x, dpr * p.y);
  ctx.clip(shape.coast);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * p.x, dpr * p.y);

  if (layers.terrain) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(d.relief, -map.grid.half, -map.grid.half, map.grid.half * 2, map.grid.half * 2);
    const a = fade(reveal.contours);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.lineWidth = 0.6 * px;
      d.contours.forEach(({ path }, i) => {
        ctx.strokeStyle = i % 2 === 1 ? 'rgba(110, 78, 40, 0.42)' : 'rgba(110, 78, 40, 0.26)';
        ctx.stroke(path);
      });
      ctx.globalAlpha = 1;
    }
  }

  if (layers.water) {
    ctx.fillStyle = lakeFill;
    ctx.fill(d.lakes);
    ctx.strokeStyle = water;
    ctx.lineWidth = 0.8 * px;
    ctx.stroke(d.lakes);
    const a = fade(reveal.rivers);
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = water;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Width grows with flow, and a little with zoom.
      const z = Math.min(1.8, Math.max(0.7, sr / 400));
      d.rivers.forEach((path, b) => {
        ctx.lineWidth = (0.5 + b * 0.55) * z * px;
        ctx.stroke(path);
      });
      if (layers.roads) {
        // Navigable stretches: a fine dashed line along the river, in route colour.
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 0.8 * px;
        ctx.setLineDash([3 * px, 3 * px]);
        ctx.stroke(d.navigable);
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }
  }

  if (layers.roads) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const show = (rank: RoadRank) => fade(reveal.roads[rank]);
    let a = show('track');
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = theme.inkSoft;
      ctx.lineWidth = 0.9 * px;
      ctx.setLineDash([3 * px, 2 * px]);
      ctx.stroke(d.roads.track);
      ctx.setLineDash([]);
    }
    a = show('road');
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.2 * px;
      ctx.stroke(d.roads.road);
    }
    a = show('highway');
    if (a > 0) {
      ctx.globalAlpha = a;
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 3 * px;
      ctx.stroke(d.roads.highway);
      ctx.strokeStyle = '#c4532f';
      ctx.lineWidth = 1.8 * px;
      ctx.stroke(d.roads.highway);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

export interface SettlementLabel {
  settlement: Settlement;
  x: number;
  y: number;
  r: number;
  alpha: number;
}

function anchor(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x, y - size * 0.75, size * 0.2, 0, Math.PI * 2);
  ctx.moveTo(x, y - size * 0.55);
  ctx.lineTo(x, y + size * 0.6);
  ctx.moveTo(x - size * 0.35, y - size * 0.3);
  ctx.lineTo(x + size * 0.35, y - size * 0.3);
  ctx.moveTo(x - size * 0.55, y + size * 0.1);
  ctx.quadraticCurveTo(x - size * 0.5, y + size * 0.65, x, y + size * 0.6);
  ctx.quadraticCurveTo(x + size * 0.5, y + size * 0.65, x + size * 0.55, y + size * 0.1);
  ctx.stroke();
}

/** Settlement symbols for every continent on screen; returns hit targets and label candidates. */
export function drawSettlements(
  ctx: CanvasRenderingContext2D,
  s: RenderInput,
  bodies: { b: Body; p: Point; sr: number }[],
): { hits: HitTarget[]; labels: SettlementLabel[] } {
  const hits: HitTarget[] = [];
  const labels: SettlementLabel[] = [];
  if (!s.layers.settlements) return { hits, labels };
  const scale = s.view.scale;
  const REVEAL = s.world.params.display.reveal.settlements;
  for (const { b, p, sr: bodySr } of bodies) {
    // A belt island's places show as its archipelago grows on screen, so a
    // cluster appears together rather than island by island.
    const sr = b.archipelago ? b.archipelago.extent * scale : bodySr;
    if (sr < Math.min(REVEAL.city, REVEAL.town, REVEAL.village) * 0.7) continue;
    const map = continentMap(s.world, b);
    // Smaller places first, so cities draw on top.
    const order = [...map.settlements].sort((a, c) => REVEAL[c.kind] - REVEAL[a.kind]);
    for (const st of order) {
      const alpha = smoothstep(REVEAL[st.kind] * 0.7, REVEAL[st.kind], sr);
      if (alpha <= 0) continue;
      const x = p.x + st.x * scale;
      const y = p.y + st.y * scale;
      if (x < -20 || y < -20 || x > s.width + 20 || y > s.height + 20) continue;
      const selected = st.id === s.selectedId;
      const ink = selected ? theme.accent : theme.ink;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = ink;
      let r: number;
      if (st.kind === 'city') {
        r = 4.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = theme.paper;
        ctx.fill();
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
      } else if (st.kind === 'town') {
        r = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = ink;
        ctx.fill();
        ctx.strokeStyle = theme.paper;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else {
        r = 2.1;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = theme.paper;
        ctx.fill();
        ctx.stroke();
      }
      if (st.port || st.riverPort) {
        ctx.strokeStyle = water;
        ctx.lineWidth = 1;
        anchor(ctx, x - r - 5, y + 1, 7);
      }
      if (selected) {
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (alpha > 0.5) hits.push({ id: st.id, x, y, r: r + 2 });
      labels.push({ settlement: st, x, y, r, alpha });
    }
  }
  return { hits, labels };
}

/** Where each settlement's name went last frame, tried first so names stay put. */
const settlementSlot = new Map<string, number>();

/** Settlement names, larger places first, avoiding everything already placed. */
export function drawSettlementLabels(ctx: CanvasRenderingContext2D, s: RenderInput, labels: SettlementLabel[], placed: Box[]) {
  if (!s.layers.labels) return;
  const rank: Record<SettlementKind, number> = { city: 0, town: 1, village: 2 };
  const ordered = [...labels].sort(
    (a, b) => Number(b.settlement.id === s.selectedId) - Number(a.settlement.id === s.selectedId) || rank[a.settlement.kind] - rank[b.settlement.kind],
  );
  const collides = (r: Box) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  for (const l of ordered) {
    const { settlement: st } = l;
    const size = st.kind === 'city' ? 14 : st.kind === 'town' ? 12.5 : 11;
    ctx.font =
      st.kind === 'city' ? `600 ${size}px ${fonts.caps}` : st.kind === 'town' ? `500 ${size}px ${fonts.serif}` : `italic ${size}px ${fonts.serif}`;
    ctx.letterSpacing = st.kind === 'city' ? '1px' : '0px';
    const tw = textWidth(ctx, st.name);
    const gap = l.r + 4;
    const options = [
      { x: l.x + gap, y: l.y + size / 3 },
      { x: l.x - gap - tw, y: l.y + size / 3 },
      { x: l.x - tw / 2, y: l.y - gap - 1 },
      { x: l.x - tw / 2, y: l.y + gap + size * 0.8 },
    ];
    const prev = settlementSlot.get(st.id) ?? 0;
    const tryOrder = options.map((_, i) => i).sort((a, b) => (a === prev ? -1 : b === prev ? 1 : a - b));
    for (const i of tryOrder) {
      const o = options[i];
      const box = { x: o.x - 2, y: o.y - size * 0.8, w: tw + 4, h: size * 1.05 };
      if (st.id !== s.selectedId && collides(box)) continue;
      placed.push(box);
      settlementSlot.set(st.id, i);
      ctx.globalAlpha = l.alpha;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(244, 236, 214, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.strokeText(st.name, o.x, o.y);
      ctx.fillStyle = st.id === s.selectedId ? theme.accent : theme.ink;
      ctx.fillText(st.name, o.x, o.y);
      ctx.globalAlpha = 1;
      break;
    }
  }
  ctx.letterSpacing = '0px';
}
