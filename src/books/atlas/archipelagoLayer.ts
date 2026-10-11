import type { Point } from '../../lib/orbits';
import { archipelagoCentre } from '../../lib/shipping';
import { findSettlement, hasContinentMap } from '../../lib/terrain';
import { archipelagoFerries } from '../../lib/terrain/archipelago';
import type { Archipelago } from '../../lib/world';
import type { Box, RenderInput } from './render';
import { textWidth } from './render';
import { fonts, theme } from './theme';

/**
 * Archipelagos: their names, once a group is large enough on screen to read
 * as one, and the ferries between their islands' places.
 * (Thresholds in src/parameters/display.yaml → reveal.)
 */

/** Is this archipelago drawn in detail (named, its islands pickable)? */
export function revealedArchipelago(s: RenderInput, a: Archipelago): boolean {
  return a.extent * s.view.scale >= s.world.params.display.reveal.archipelagos;
}

const fade = (from: number, x: number) => Math.min(1, Math.max(0, (x - from * 0.7) / (from * 0.3)));

/** Ferry lines between island places: over the sea, under the land. */
export function drawFerries(ctx: CanvasRenderingContext2D, s: RenderInput, toScreen: (p: Point) => Point) {
  if (!s.layers.belts || !s.layers.shipping) return;
  const reveal = s.world.params.display.reveal.ferries;
  ctx.save();
  ctx.lineCap = 'round';
  for (const a of s.world.archipelagos) {
    if (!a.populated) continue;
    const alpha = fade(reveal, a.extent * s.view.scale);
    if (alpha <= 0) continue;
    const c = toScreen(archipelagoCentre(a, s.t));
    const er = a.extent * s.view.scale;
    if (c.x < -er || c.y < -er || c.x > s.width + er || c.y > s.height + er) continue;
    // Ferries are planned from the islands' maps: wait for them all.
    if (!a.islands.every((i) => hasContinentMap(s.world, i))) continue;
    ctx.globalAlpha = alpha;
    for (const f of archipelagoFerries(s.world, a)) {
      const ends = [f.from, f.to].map((id) => {
        const st = findSettlement(s.world, id)!;
        const b = s.positions.get(st.body.id)!;
        return toScreen({ x: b.x + st.settlement.x, y: b.y + st.settlement.y });
      });
      ctx.beginPath();
      ctx.moveTo(ends[0].x, ends[0].y);
      ctx.lineTo(ends[1].x, ends[1].y);
      ctx.strokeStyle = 'rgba(244, 236, 214, 0.6)';
      ctx.lineWidth = f.rank === 'main' ? 3.5 : 2.5;
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.strokeStyle = '#4f7a96';
      ctx.lineWidth = f.rank === 'main' ? 1.4 : 1;
      ctx.setLineDash(f.rank === 'main' ? [5, 3] : [1.5, 3]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Archipelago names, spaced italic capitals above each group. */
export function drawArchipelagoNames(ctx: CanvasRenderingContext2D, s: RenderInput, toScreen: (p: Point) => Point, placed: Box[]) {
  if (!s.layers.belts || !s.layers.labels) return;
  const reveal = s.world.params.display.reveal.archipelagos;
  const collides = (r: Box) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  ctx.save();
  ctx.font = `italic 500 13px ${fonts.serif}`;
  ctx.letterSpacing = '2px';
  ctx.lineJoin = 'round';
  // Larger groups first.
  for (const a of [...s.world.archipelagos].sort((x, y) => y.extent - x.extent)) {
    const er = a.extent * s.view.scale;
    const selected = a.id === s.selectedId;
    const alpha = selected ? 1 : fade(reveal, er);
    if (alpha <= 0) continue;
    const c = toScreen(archipelagoCentre(a, s.t));
    const text = a.name.toUpperCase();
    const tw = textWidth(ctx, text);
    // Just above the group's northernmost coast.
    const top = Math.min(...a.islands.map((i) => toScreen(s.positions.get(i.id)!).y - i.outerRadius * s.view.scale));
    const y = Math.min(c.y - 6, top - 8);
    const x = c.x - tw / 2;
    if (x > s.width || x + tw < 0 || y < -10 || y > s.height + 20) continue;
    const box = { x: x - 2, y: y - 12, w: tw + 4, h: 15 };
    if (!selected && collides(box)) continue;
    placed.push(box);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = theme.halo;
    ctx.lineWidth = 3.5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = selected ? theme.accent : theme.inkSoft;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}
