import { niceCeil, worldToScreen, type View } from '../../lib/camera';
import type { IslandShape } from '../../lib/coastline';
import { bearingAt, bearingBetween, distance, isletPosition, polar, type Point } from '../../lib/orbits';
import { orbitalDistance, type Body, type World } from '../../lib/world';
import { rng } from '../../lib/random';
import type { Layers } from './layers';
import { drawPlatformLabels, drawPlatforms } from './platformLayer';
import { drawSettlementLabels, drawSettlements, drawTerrain } from './terrainLayer';
import { drawShipping, type RouteLine } from './shippingLayer';
import type { ShippingNetwork } from '../../lib/shipping';
import { findSettlement } from '../../lib/terrain';
import { bandWash, fonts, theme, washedOcean } from './theme';

export interface RenderInput {
  world: World;
  shapes: Map<string, IslandShape>;
  positions: Map<string, Point>;
  t: number;
  view: View;
  width: number;
  height: number;
  dpr: number;
  selectedId: string | null;
  hoveredId: string | null;
  layers: Layers;
  /** Platform positions at `t`, [x0, y0, x1, y1, …]. */
  platformXY: Float64Array;
  /** Shipping planned for (about) this date, or null if not planned yet. */
  shipping: ShippingNetwork | null;
  /** Explicit measuring (from the gazetteer's Measure button), if active. */
  measure: { from: string; to: string | null } | null;
}

export interface RenderResult {
  hits: HitTarget[];
  routes: RouteLine[];
}

/** On-screen footprint of a body or platform, used for hit testing. */
export interface HitTarget {
  id: string;
  x: number;
  y: number;
  r: number;
}


function symbolRadius(b: Body): number {
  if (b.kind === 'moon') return 2.6;
  if (b.kind === 'central') return 7;
  return b.radius < 40 ? 4 : b.radius < 70 ? 5 : 6;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Add a circle to the current path — or, when it is far larger than the
 * canvas, only the arc that crosses the canvas. Stroking (especially dashing)
 * a full circle hundreds of thousands of pixels round stalls the browser.
 */
export function circlePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, w: number, h: number) {
  const diag = Math.hypot(w, h);
  if (r < diag * 2) {
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    return;
  }
  const mid = Math.atan2(h / 2 - cy, w / 2 - cx);
  const span = Math.min(Math.PI, (diag / r) * 1.5);
  ctx.moveTo(cx + r * Math.cos(mid - span), cy + r * Math.sin(mid - span));
  ctx.arc(cx, cy, r, mid - span, mid + span);
}

const fmt = new Intl.NumberFormat('en-GB');

export function render(ctx: CanvasRenderingContext2D, s: RenderInput): RenderResult {
  const { view, width: w, height: h, dpr, world } = s;
  const base = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const toScreen = (p: Point) => worldToScreen(view, w, h, p);
  const origin = toScreen({ x: 0, y: 0 });
  const halfDiag = Math.hypot(w, h) / 2 / view.scale;
  const viewDist = Math.hypot(view.cx, view.cy);
  /** Is a circle of radius r about the origin visible? */
  const ringVisible = (r: number) => Math.abs(viewDist - r) < halfDiag;

  const { layers } = s;
  // Below `symbol_below` px a body is a fixed-size symbol; below `coast_from` its coast isn't drawn.
  const { symbol_below: SYMBOL_BELOW, coast_from: COAST_FROM, reveal } = world.params.display;
  /** Map position of a body or platform by id. */
  const placeAt = (id: string): Point | null => {
    const body = s.positions.get(id);
    if (body) return body;
    const settled = findSettlement(world, id);
    if (settled) {
      const c = s.positions.get(settled.body.id)!;
      return { x: c.x + settled.settlement.x, y: c.y + settled.settlement.y };
    }
    const i = world.platformIndex.get(id);
    return i === undefined ? null : { x: s.platformXY[i * 2], y: s.platformXY[i * 2 + 1] };
  };

  base();
  drawOcean(ctx, s, origin);
  drawGraticule(ctx, s, origin, ringVisible);

  // ── Orbits ────────────────────────────────────────────────────────────────
  const visibleMoon = (b: Body) =>
    b.kind !== 'moon' || (layers.moons && b.orbitRadius * view.scale > symbolRadius(b.parent!) + 9);
  ctx.lineWidth = 0.9;
  for (const b of world.bodies) {
    if (!b.parent || !visibleMoon(b)) continue;
    if (!layers.orbits && b.id !== s.selectedId) continue;
    const centre = toScreen(s.positions.get(b.parent.id)!);
    const r = b.orbitRadius * view.scale;
    if (b.kind === 'isle' && !ringVisible(b.orbitRadius)) continue;
    const selected = b.id === s.selectedId;
    ctx.strokeStyle = selected ? theme.accentSoft : theme.inkSoft;
    ctx.setLineDash(selected ? [] : b.kind === 'moon' ? [2, 3] : [5, 4]);
    ctx.beginPath();
    circlePath(ctx, centre.x, centre.y, r, w, h);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Direction-of-travel chevrons just ahead of each isle.
  for (const b of world.bodies) {
    if (b.kind !== 'isle' || !layers.orbits) continue;
    const r = b.orbitRadius * view.scale;
    const ahead = bearingAt(b, s.t) + ((symbolRadius(b) + 16) / r) * (180 / Math.PI);
    const p = toScreen(polar(b.orbitRadius, ahead));
    if (p.x < -20 || p.y < -20 || p.x > w + 20 || p.y > h + 20) continue;
    const dir = ((ahead + 90) * Math.PI) / 180; // tangent, clockwise
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(dir - Math.PI / 2);
    ctx.strokeStyle = b.id === s.selectedId ? theme.accent : theme.inkSoft;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-3.5, -3);
    ctx.lineTo(0, 0);
    ctx.lineTo(-3.5, 3);
    ctx.stroke();
    ctx.restore();
  }

  // ── Belts ─────────────────────────────────────────────────────────────────
  for (const belt of world.belts) {
    if (!layers.belts) break;
    if (!ringVisible(belt.innerRadius) && !ringVisible(belt.outerRadius)) continue;
    ctx.fillStyle = 'rgba(59, 47, 36, 0.035)';
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, belt.outerRadius * view.scale, 0, Math.PI * 2);
    ctx.arc(origin.x, origin.y, belt.innerRadius * view.scale, 0, Math.PI * 2, true);
    ctx.fill();
    for (const islet of belt.islets) {
      const p = toScreen(isletPosition(islet, s.t));
      if (p.x < -10 || p.y < -10 || p.x > w + 10 || p.y > h + 10) continue;
      const r = islet.radius * view.scale;
      ctx.beginPath();
      if (r < 1.6) {
        ctx.fillStyle = theme.inkSoft;
        ctx.arc(p.x, p.y, Math.max(0.6, r), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = theme.land;
        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 0.8;
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  // ── Shipping (over the sea, under the land) ─────────────────────────────────
  const routes = drawShipping(ctx, s, s.shipping, toScreen);

  // ── Bodies ────────────────────────────────────────────────────────────────
  const drawn = world.bodies.filter(visibleMoon).map((b) => {
    const p = toScreen(s.positions.get(b.id)!);
    return { b, p, sr: b.radius * view.scale };
  });
  const onScreen = drawn.filter(({ p, sr }) => p.x > -sr - 40 && p.y > -sr - 40 && p.x < w + sr + 40 && p.y < h + sr + 40);

  const withShape = (b: Body, p: Point, sr: number, fn: (shape: IslandShape) => void) => {
    const shape = s.shapes.get(b.id);
    if (!shape) return;
    ctx.setTransform(dpr * sr, 0, 0, dpr * sr, dpr * p.x, dpr * p.y);
    fn(shape);
    base();
  };

  // Engraved water-lines: concentric offsets of the coast, drawn as a thick ink
  // stroke overpainted by a slightly thinner ocean stroke, largest first.
  // The overpainting colour must match the sea under each island, purple wash included.
  const seaUnder = (b: Body) => {
    const r = orbitalDistance(b);
    const i = world.bands.findIndex((band) => r >= band.innerRadius && r < band.outerRadius);
    return layers.bands && i >= 0 && bandWash(i) > 0 ? washedOcean(bandWash(i)) : theme.ocean;
  };
  ctx.lineJoin = 'round';
  for (const { b, p, sr } of onScreen) {
    if (sr < SYMBOL_BELOW) continue;
    const sea = seaUnder(b);
    const gaps = [16, 10, 5.5, 2.5].filter((d) => d < sr * 1.2);
    withShape(b, p, sr, (shape) => {
      gaps.forEach((d, i) => {
        ctx.strokeStyle = `rgba(59, 47, 36, ${0.18 + i * 0.1})`;
        ctx.lineWidth = (2 * d + 0.9) / sr;
        ctx.stroke(shape.coast);
        ctx.strokeStyle = sea;
        ctx.lineWidth = (2 * d - 0.9) / sr;
        ctx.stroke(shape.coast);
      });
    });
  }

  for (const { b, p, sr } of onScreen) {
    if (sr < COAST_FROM) continue;
    withShape(b, p, sr, (shape) => {
      ctx.fillStyle = theme.land;
      ctx.fill(shape.coast);
      if (sr > reveal.relief) drawTerrain(ctx, s, b, p, sr, shape);
      // A selected continent gets a heavier coast (not red: roads are red).
      const selected = b.id === s.selectedId && sr > 40;
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = (selected ? 2.2 : Math.min(1.4, 0.6 + sr / 40)) / sr;
      ctx.stroke(shape.coast);
    });
  }

  // Fixed-size symbols, fading out as the true coastline becomes legible.
  for (const { b, p, sr } of onScreen) {
    const alpha = 1 - smoothstep(SYMBOL_BELOW * 0.55, SYMBOL_BELOW, sr);
    if (alpha <= 0 || b.kind === 'central') continue;
    const r = symbolRadius(b);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (b.kind === 'moon') {
      ctx.fillStyle = theme.ink;
      ctx.fill();
    } else {
      ctx.fillStyle = theme.land;
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = theme.ink;
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const bodyHits: HitTarget[] = drawn.map(({ b, p, sr }) => ({ id: b.id, x: p.x, y: p.y, r: Math.max(sr, symbolRadius(b)) }));
  const settled = drawSettlements(ctx, s, onScreen);
  const platformHits = drawPlatforms(ctx, s, toScreen);
  const hits = [...bodyHits, ...settled.hits, ...platformHits];
  const hitById = new Map(hits.map((t) => [t.id, t]));

  // ── Selection, hover and measurement ─────────────────────────────────────
  const ring = (id: string | null, color: string, dash: number[]) => {
    const t = id && hitById.get(id);
    if (!t || t.r > 40) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  ring(s.hoveredId !== s.selectedId ? s.hoveredId : null, theme.inkSoft, [3, 3]);
  ring(s.selectedId, theme.accent, []);

  // Measure from the selection (or an explicit origin) to the hovered (or pinned) place.
  const fromId = s.measure?.from ?? s.selectedId;
  const toId = s.measure?.to ?? s.hoveredId;
  const measureA = fromId && !fromId.startsWith('route:') && placeAt(fromId);
  const measureB = toId && !toId.startsWith('route:') && placeAt(toId);
  if (measureA && measureB && fromId !== toId) {
    const a = measureA;
    const b = measureB;
    const sa = toScreen(a);
    const sb = toScreen(b);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const d = distance(a, b);
    const text = `${d < 10 ? d.toFixed(2) : fmt.format(Math.round(d))} ${world.units.abbr} · ${Math.round(bearingBetween(a, b))
      .toString()
      .padStart(3, '0')}°`;
    ctx.font = `italic 600 14px ${fonts.serif}`;
    // Label the line nearer the hovered end, clear of the selected island's own label.
    haloText(ctx, text, sa.x + (sb.x - sa.x) * 0.62 + 8, sa.y + (sb.y - sa.y) * 0.62 - 8, theme.accent);
  }

  const placed = drawLabels(ctx, s, drawn, new Map(bodyHits.map((t) => [t.id, t])));
  drawSettlementLabels(ctx, s, settled.labels, placed);
  drawPlatformLabels(ctx, s, platformHits, placed);
  return { hits, routes };
}

function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = theme.halo;
  ctx.lineWidth = 4;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

let gunkPattern: { pattern: CanvasPattern; dpr: number } | null = null;

/** A tile of murky stipple and swirls for the Endless Gunk. */
function gunkTile(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | null {
  if (gunkPattern?.dpr === dpr) return gunkPattern.pattern;
  const size = 160;
  const c = document.createElement('canvas');
  c.width = c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.fillStyle = theme.gunk;
  g.fillRect(0, 0, size, size);
  const rand = rng(7);
  g.fillStyle = theme.gunkInk;
  for (let i = 0; i < 380; i++) {
    g.beginPath();
    g.arc(rand() * size, rand() * size, 0.3 + rand() * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  // A few short wavy strokes suggest slow-moving sludge.
  g.strokeStyle = theme.gunkInk;
  g.lineWidth = 0.6;
  for (let i = 0; i < 10; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.beginPath();
    g.moveTo(x, y);
    g.bezierCurveTo(x + 5, y - 3, x + 9, y + 3, x + 14, y);
    g.stroke();
  }
  const pattern = ctx.createPattern(c, 'repeat');
  if (!pattern) return null;
  gunkPattern = { pattern, dpr };
  return pattern;
}

/** The Gunk everywhere, the circular ocean over it, and the Empire's bands. */
function drawOcean(ctx: CanvasRenderingContext2D, s: RenderInput, origin: Point) {
  const { view, world, width: w, height: h, dpr } = s;
  const R = world.oceanRadius * view.scale;

  const pattern = gunkTile(ctx, dpr);
  // Anchor the texture to the map so it pans with it.
  pattern?.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, origin.x % 160, origin.y % 160]));
  ctx.fillStyle = pattern ?? theme.gunk;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = theme.ocean;
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, R, 0, Math.PI * 2);
  ctx.fill();

  // Imperial influence: a purple wash that fades band by band away from the centre.
  world.bands.forEach((band, i) => {
    if (!s.layers.bands) return;
    const alpha = bandWash(i);
    if (alpha <= 0) return;
    ctx.fillStyle = theme.imperialWash(alpha);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, band.outerRadius * view.scale, 0, Math.PI * 2);
    if (band.innerRadius > 0) ctx.arc(origin.x, origin.y, band.innerRadius * view.scale, 0, Math.PI * 2, true);
    ctx.fill();
  });

  // The shoreline of the world: a heavy rule with a fine inner line.
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  circlePath(ctx, origin.x, origin.y, R, w, h);
  ctx.stroke();
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  circlePath(ctx, origin.x, origin.y, Math.max(0, R - 4), w, h);
  ctx.stroke();
}

function drawGraticule(
  ctx: CanvasRenderingContext2D,
  s: RenderInput,
  origin: Point,
  ringVisible: (r: number) => boolean,
) {
  const { view, world, width: w, height: h } = s;
  const step = niceCeil(110 / view.scale);
  const rim = world.oceanRadius;
  const maxRing = Math.floor(rim / step) * step;

  ctx.strokeStyle = theme.inkFaint;
  ctx.lineWidth = 0.8;
  ctx.font = `italic 12px ${fonts.serif}`;
  ctx.textAlign = 'center';
  const showGrid = s.layers.graticule;
  // Only rings that can cross the screen (there may be thousands in total).
  const viewDist = Math.hypot(view.cx, view.cy);
  const halfDiag = Math.hypot(w, h) / 2 / view.scale;
  const firstRing = Math.max(step, Math.floor((viewDist - halfDiag) / step) * step);
  const lastRing = Math.min(maxRing, viewDist + halfDiag);
  for (let r = firstRing; r <= lastRing && showGrid; r += step) {
    if (!ringVisible(r)) continue;
    ctx.beginPath();
    circlePath(ctx, origin.x, origin.y, r * view.scale, w, h);
    ctx.stroke();
  }
  // Radial bearing lines.
  const every = view.scale * rim > 2500 ? 10 : 30;
  const inner = Math.min(step, rim) * view.scale;
  for (let deg = 0; deg < 360 && showGrid; deg += every) {
    const a = ((deg - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(origin.x + Math.cos(a) * inner, origin.y + Math.sin(a) * inner);
    ctx.lineTo(origin.x + Math.cos(a) * rim * view.scale, origin.y + Math.sin(a) * rim * view.scale);
    ctx.stroke();
  }
  // Ring distance labels along the north line (or whichever bearing faces the viewer).
  const toward = Math.hypot(view.cx, view.cy) > step ? Math.atan2(view.cx, -view.cy) * (180 / Math.PI) : 0;
  const lb = Math.round(toward / every) * every + every / 2;
  for (let r = firstRing; r <= lastRing && showGrid; r += step) {
    const p = worldToScreen(view, w, h, polar(r, lb));
    if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) continue;
    ctx.fillStyle = theme.inkSoft;
    ctx.fillText(`${fmt.format(r)} ${world.units.abbr}`, p.x, p.y - 3);
  }

  // Bezel: a double rim with degree ticks, like the border of a star chart.
  if (ringVisible(rim)) {
    const R = rim * view.scale;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    circlePath(ctx, origin.x, origin.y, R + 14, w, h);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.font = `13px ${fonts.caps}`;
    for (let deg = 0; deg < 360; deg += 1) {
      const len = deg % 30 === 0 ? 14 : deg % 10 === 0 ? 9 : deg % 5 === 0 ? 6 : 3;
      if (len === 3 && R < 900) continue;
      const a = ((deg - 90) * Math.PI) / 180;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(origin.x + c * R, origin.y + sn * R);
      ctx.lineTo(origin.x + c * (R + len), origin.y + sn * (R + len));
      ctx.stroke();
      if (deg % 30 === 0) {
        ctx.save();
        ctx.translate(origin.x + c * (R + 28), origin.y + sn * (R + 28));
        // Keep numerals upright: flip those on the lower half of the rim.
        ctx.rotate(a + Math.PI / 2 + (deg > 90 && deg < 270 ? Math.PI : 0));
        ctx.fillStyle = theme.ink;
        ctx.fillText(deg === 0 ? 'N' : `${deg.toString().padStart(3, '0')}°`, 0, 4);
        ctx.restore();
      }
    }
  }
  ctx.textAlign = 'left';
}

interface Drawn {
  b: Body;
  p: Point;
  sr: number;
}

export type Box = { x: number; y: number; w: number; h: number };

/** Draws names; returns the boxes taken so later labels can avoid them. */
/** Where each label went last frame, tried first, so labels don't jump about. */
const lastSlot = new Map<string, number>();

/** measureText is slow and labels rarely change: remember widths by font and text. */
const widths = new Map<string, number>();
export function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  const key = `${ctx.font}|${ctx.letterSpacing}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (widths.size > 4000) widths.clear();
    widths.set(key, (w = ctx.measureText(text).width));
  }
  return w;
}

function drawLabels(ctx: CanvasRenderingContext2D, s: RenderInput, drawn: Drawn[], hitById: Map<string, HitTarget>): Box[] {
  const placed: Box[] = [];
  // Reserve the island footprints themselves so labels never sit on land.
  for (const t of hitById.values()) placed.push({ x: t.x - t.r, y: t.y - t.r, w: t.r * 2, h: t.r * 2 });
  const collides = (r: { x: number; y: number; w: number; h: number }) =>
    placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);

  const priority = (d: Drawn) =>
    (d.b.id === s.selectedId ? -10 : 0) + (d.b.kind === 'central' ? 0 : d.b.kind === 'isle' ? 1 : 2);
  const order = [...drawn].sort((a, b) => priority(a) - priority(b));

  const symbolBelow = s.world.params.display.symbol_below;
  for (const d of order) {
    if (!s.layers.labels && d.b.id !== s.selectedId) continue;
    // Moons are named a little after their dots appear, so names don't flicker at the threshold.
    if (d.b.kind === 'moon' && d.b.orbitRadius * s.view.scale < symbolRadius(d.b.parent!) + 22 && d.b.id !== s.selectedId) continue;
    const t = hitById.get(d.b.id)!;
    if (t.x < -200 || t.y < -50 || t.x > s.width + 200 || t.y > s.height + 50) continue;
    const central = d.b.kind === 'central';
    const size = central ? 19 : d.b.kind === 'isle' ? 15 : 13;
    ctx.font = d.b.kind === 'moon' ? `italic ${size}px ${fonts.serif}` : `${central ? 600 : 500} ${size}px ${fonts.caps}`;
    ctx.letterSpacing = d.b.kind === 'moon' ? '0px' : central ? '3px' : '1.5px';
    // Zoomed out (drawn as a symbol), use the short name.
    const text = d.sr < symbolBelow ? d.b.shortName : d.b.name;
    const tw = textWidth(ctx, text);
    const gap = t.r + 6;
    // Labels sit inside a large central isle; otherwise beside the symbol.
    const candidates =
      central && t.r > 60
        ? [{ x: t.x - tw / 2, y: t.y + size / 3 }]
        : [
            { x: t.x + gap, y: t.y + size / 3 },
            { x: t.x - gap - tw, y: t.y + size / 3 },
            { x: t.x - tw / 2, y: t.y - gap - 2 },
            { x: t.x - tw / 2, y: t.y + gap + size * 0.8 },
          ];
    const prev = lastSlot.get(d.b.id) ?? 0;
    const tryOrder = candidates.map((_, i) => i).sort((a, b) => (a === prev ? -1 : b === prev ? 1 : a - b));
    for (const i of tryOrder) {
      const c = candidates[i];
      const box = { x: c.x - 2, y: c.y - size * 0.8, w: tw + 4, h: size * 1.05 };
      if (!(central && t.r > 60) && collides(box)) continue;
      placed.push(box);
      lastSlot.set(d.b.id, i);
      haloText(ctx, text, c.x, c.y, d.b.id === s.selectedId ? theme.accent : theme.ink);
      break;
    }
  }
  ctx.letterSpacing = '0px';

  // Ring names follow their curve, on the side of the chart nearest the viewer.
  // Zoomed out, belts are named along the top and bands along the bottom.
  const centred = Math.hypot(s.view.cx, s.view.cy) * s.view.scale < 40;
  const toward = centred ? 0 : Math.atan2(s.view.cx, -s.view.cy) * (180 / Math.PI);
  if (!s.layers.labels) return placed;
  for (const belt of s.world.belts) {
    if (!s.layers.belts) break;
    const r = ((belt.innerRadius + belt.outerRadius) / 2) * s.view.scale;
    if (r < 120) continue;
    curvedText(ctx, belt.name.toUpperCase(), s, r, toward, theme.inkSoft, `italic 500 13px ${fonts.serif}`);
  }
  for (const band of s.world.bands) {
    if (!s.layers.bands) break;
    const r = ((band.innerRadius + band.outerRadius) / 2) * s.view.scale;
    if (r < 120) continue;
    curvedText(ctx, band.name.toUpperCase(), s, r, centred ? 180 : toward + 4, theme.imperial, `600 12px ${fonts.caps}`);
  }
  const edge = s.world.oceanRadius * s.view.scale + 58;
  curvedText(ctx, s.world.edgeName.toUpperCase(), s, edge, centred ? 0 : toward, theme.ink, `italic 600 16px ${fonts.serif}`, 7, theme.gunk);
  return placed;
}

function curvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  s: RenderInput,
  r: number,
  bearing: number,
  color: string,
  font: string,
  spacing = 4,
  halo: string = theme.halo,
) {
  const origin = worldToScreen(s.view, s.width, s.height, { x: 0, y: 0 });
  ctx.font = font;
  const widths = [...text].map((ch) => textWidth(ctx, ch) + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  // Upright text across the top half, reversed across the bottom half.
  const bottom = Math.cos((bearing * Math.PI) / 180) < 0;
  let a = (bearing * Math.PI) / 180 + ((bottom ? 1 : -1) * total) / 2 / r;
  ctx.textAlign = 'center';
  [...text].forEach((ch, i) => {
    const mid = a + ((bottom ? -1 : 1) * widths[i]) / 2 / r;
    const x = origin.x + Math.sin(mid) * r;
    const y = origin.y - Math.cos(mid) * r;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bottom ? mid + Math.PI : mid);
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(ch, 0, 4);
    ctx.fillStyle = color;
    ctx.fillText(ch, 0, 4);
    ctx.restore();
    a += ((bottom ? -1 : 1) * widths[i]) / r;
  });
  ctx.textAlign = 'left';
}
