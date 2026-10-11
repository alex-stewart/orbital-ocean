import type { Point } from '../../lib/orbits';
import type { Platform, SizeClass } from '../../lib/platforms';
import { circlePath, textWidth, type Box, type HitTarget, type RenderInput } from './render';
import { fonts, theme } from './theme';

/**
 * Platforms are numerous and tiny, so they are drawn by level of detail:
 *  - below a class's `reveal` zoom, each is a faint dot. Thousands of dots
 *    together read as a density haze rather than as individual marks;
 *  - from `reveal` up, each is a small symbol (square anchored, diamond
 *    orbital), sized by class and styled by owner;
 *  - once a platform's true size outgrows its symbol, it is drawn to scale;
 *  - register numbers appear only when zoomed well past the reveal.
 */

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Symbol half-size in px, larger for larger classes. */
function symbolSize(sizes: SizeClass[], size: SizeClass): number {
  const rank = [...sizes].sort((a, b) => a.radius - b.radius).indexOf(size);
  return 2 + rank * 0.8;
}

function visible(p: Platform, s: RenderInput): boolean {
  return p.motion === 'anchored' ? s.layers.anchored : s.layers.orbital;
}

export function drawPlatforms(ctx: CanvasRenderingContext2D, s: RenderInput, toScreen: (p: Point) => Point): HitTarget[] {
  const { world, view, width: w, height: h, platformXY: xy } = s;
  const rules = world.platformRules;
  if (!rules || (!s.layers.anchored && !s.layers.orbital)) return [];
  const scale = view.scale;
  const hits: HitTarget[] = [];

  // Lanes and continent rings, faintly, once there is room to see them.
  if (s.layers.orbits && s.layers.orbital) {
    ctx.save();
    ctx.strokeStyle = theme.imperialWash(0.3);
    ctx.lineWidth = 0.7;
    ctx.setLineDash([1, 4]);
    const origin = toScreen({ x: 0, y: 0 });
    const alpha = smoothstep(0.15, 0.4, scale);
    if (alpha > 0) {
      ctx.globalAlpha = alpha;
      const half = Math.hypot(w, h) / 2 / scale;
      const viewDist = Math.hypot(view.cx, view.cy);
      for (const lane of rules.lanes) {
        if (Math.abs(viewDist - lane.radius) > half) continue;
        ctx.beginPath();
        circlePath(ctx, origin.x, origin.y, lane.radius * scale, w, h);
        ctx.stroke();
      }
    }
    const ringAt = world.params.display.platform_rings;
    for (const [id, rings] of rules.rings) {
      const c = toScreen(s.positions.get(id)!);
      for (const ring of rings) {
        const r = ring.radius * scale;
        if (r < ringAt || c.x + r < 0 || c.y + r < 0 || c.x - r > w || c.y - r > h) continue;
        ctx.globalAlpha = smoothstep(ringAt, ringAt * 2, r);
        ctx.beginPath();
        circlePath(ctx, c.x, c.y, r, w, h);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Haze: batch every unrevealed platform into two paths (imperial, other).
  const hazeImperial = new Path2D();
  const hazeOther = new Path2D();
  let hazeAlpha = 0;
  const symbols: { p: Platform; x: number; y: number; alpha: number }[] = [];

  for (let i = 0; i < world.platforms.length; i++) {
    const p = world.platforms[i];
    if (!visible(p, s)) continue;
    const pt = toScreen({ x: xy[i * 2], y: xy[i * 2 + 1] });
    if (pt.x < -10 || pt.y < -10 || pt.x > w + 10 || pt.y > h + 10) continue;
    const reveal = smoothstep(p.size.reveal * 0.7, p.size.reveal, scale);
    if (reveal < 1) {
      (p.owner.imperial ? hazeImperial : hazeOther).rect(pt.x - 0.7, pt.y - 0.7, 1.4, 1.4);
      hazeAlpha = 0.42;
    }
    if (reveal > 0) symbols.push({ p, x: pt.x, y: pt.y, alpha: reveal });
  }
  if (hazeAlpha > 0) {
    ctx.globalAlpha = hazeAlpha;
    ctx.fillStyle = theme.imperial;
    ctx.fill(hazeImperial);
    ctx.fillStyle = theme.ink;
    ctx.fill(hazeOther);
    ctx.globalAlpha = 1;
  }

  // Symbols, smallest classes first so larger ones sit on top.
  symbols.sort((a, b) => a.p.size.radius - b.p.size.radius);
  for (const { p, x, y, alpha } of symbols) {
    const sym = symbolSize(rules.sizes, p.size);
    const sr = p.size.radius * scale;
    const selected = p.id === s.selectedId;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    if (sr > sym) {
      // To scale: an octagonal platform outline.
      for (let k = 0; k < 8; k++) {
        const a = ((k + 0.5) / 8) * Math.PI * 2;
        const px = x + Math.cos(a) * sr;
        const py = y + Math.sin(a) * sr;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
    } else if (p.motion === 'anchored') {
      ctx.rect(x - sym, y - sym, sym * 2, sym * 2);
    } else {
      const d = sym * 1.3;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
    }
    if (p.owner.imperial) {
      ctx.fillStyle = theme.imperial;
      ctx.fill();
      ctx.strokeStyle = selected ? theme.accent : theme.paper;
      ctx.lineWidth = selected ? 1.6 : 0.7;
      ctx.stroke();
    } else if (p.owner.id === 'derelict') {
      ctx.strokeStyle = selected ? theme.accent : theme.inkSoft;
      ctx.lineWidth = 1;
      ctx.setLineDash([1.5, 1.5]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = theme.paper;
      ctx.fill();
      ctx.strokeStyle = selected ? theme.accent : theme.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (alpha > 0.5) hits.push({ id: p.id, x, y, r: Math.max(sr, sym * 1.3) });
  }
  return hits;
}

/** Register numbers, only when zoomed well in, after every other label. */
export function drawPlatformLabels(ctx: CanvasRenderingContext2D, s: RenderInput, hits: HitTarget[], placed: Box[]) {
  const { world, view } = s;
  const collides = (r: Box) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
  ctx.font = `italic 11px ${fonts.serif}`;
  ctx.lineJoin = 'round';
  // Larger classes claim space first.
  const ordered = hits
    .map((h) => ({ h, p: world.platforms[world.platformIndex.get(h.id)!] }))
    .filter(({ p }) => p.id === s.selectedId || (s.layers.labels && view.scale >= p.size.reveal * world.params.display.platform_label_factor))
    .sort((a, b) => Number(b.p.id === s.selectedId) - Number(a.p.id === s.selectedId) || b.p.size.radius - a.p.size.radius);
  for (const { h, p } of ordered) {
    const tw = textWidth(ctx, p.id);
    const box = { x: h.x + h.r + 4, y: h.y - 7, w: tw + 4, h: 12 };
    if (p.id !== s.selectedId && collides(box)) continue;
    placed.push(box);
    ctx.strokeStyle = theme.halo;
    ctx.lineWidth = 3;
    ctx.strokeText(p.id, box.x + 2, h.y + 3.5);
    ctx.fillStyle = p.id === s.selectedId ? theme.accent : theme.inkSoft;
    ctx.fillText(p.id, box.x + 2, h.y + 3.5);
  }
}
