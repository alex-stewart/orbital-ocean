import { XMLParser } from 'fast-xml-parser';
import { ringCentroid } from './geometry';
import type { ContourLine, Peak } from './elevation';
import type { RoadRank } from './routes';
import type { SettlementKind } from './settlements';

/**
 * Hand-drawn continent designs: an SVG (Inkscape, Figma, …) with named layers.
 * See docs/designing-continents.md for the full reference.
 *
 * Coordinates are IL from the continent's centre (x east, y south), i.e.
 * SVG user units with 0,0 at the centre — the template's viewBox sets this up.
 */

export interface ContinentDesign {
  coast: number[][];
  contours: ContourLine[];
  peaks: (Peak & { name: string | null })[];
  rivers: { name: string | null; points: number[]; navigable: boolean }[];
  lakes: { name: string | null; ring: number[] }[];
  settlements: { name: string; kind: SettlementKind; x: number; y: number; port: boolean }[];
  /** Hand-drawn roads, or null to route them automatically. */
  roads: { rank: RoadRank; points: number[] }[] | null;
  /** Things that were skipped, with the reason. */
  warnings: string[];
}

export const LAYERS = ['coast', 'contours', 'peaks', 'rivers', 'lakes', 'settlements', 'roads'] as const;
type LayerName = (typeof LAYERS)[number];

// ── Transforms ──────────────────────────────────────────────────────────────

type M = [number, number, number, number, number, number]; // a b c d e f
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function parseTransform(t: string | undefined): M {
  let m: M = IDENTITY;
  if (!t) return m;
  for (const [, op, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args.split(/[\s,]+/).filter(Boolean).map(Number);
    let n: M = IDENTITY;
    switch (op) {
      case 'matrix':
        n = v.slice(0, 6) as M;
        break;
      case 'translate':
        n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        n = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
        break;
      case 'rotate': {
        const a = ((v[0] ?? 0) * Math.PI) / 180;
        const r: M = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        n = v.length >= 3 ? mul(mul([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
        break;
      }
      case 'skewX':
        n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, n);
  }
  return m;
}

// ── Path flattening ─────────────────────────────────────────────────────────

interface Sub {
  points: number[];
  closed: boolean;
}

/** Flatten SVG path data (all commands, curves sampled) into subpaths. */
export function flattenPath(d: string): Sub[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastCtrl: [number, number] | null = null;
  let lastCmd = '';
  let i = 0;
  const num = () => Number(tokens[i++] ?? 0);
  const add = (px: number, py: number) => {
    if (!cur) {
      cur = { points: [x, y], closed: false };
      subs.push(cur);
    }
    cur.points.push(px, py);
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number) => {
    for (let s = 1; s <= 8; s++) {
      const t = s / 8;
      const u = 1 - t;
      add(
        u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
        u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey,
      );
    }
  };
  const quad = (x1: number, y1: number, ex: number, ey: number) => {
    for (let s = 1; s <= 6; s++) {
      const t = s / 6;
      const u = 1 - t;
      add(u * u * x + 2 * u * t * x1 + t * t * ex, u * u * y + 2 * u * t * y1 + t * t * ey);
    }
  };
  const arc = (rx: number, ry: number, rot: number, large: number, sweep: number, ex: number, ey: number) => {
    // Endpoint → centre parameterisation (SVG spec F.6.5).
    if (!rx || !ry) return add(ex, ey);
    const phi = (rot * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (x - ex) / 2;
    const dy = (y - ey) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) {
      rx *= Math.sqrt(lam);
      ry *= Math.sqrt(lam);
    }
    const sign = large === sweep ? -1 : 1;
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const co = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
    const cxp = (co * rx * y1) / ry;
    const cyp = (-co * ry * x1) / rx;
    const cx = cos * cxp - sin * cyp + (x + ex) / 2;
    const cy = sin * cxp + cos * cyp + (y + ey) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= Math.PI * 2;
    if (sweep && dt < 0) dt += Math.PI * 2;
    const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 12)));
    for (let s = 1; s <= steps; s++) {
      const t = t1 + (dt * s) / steps;
      add(cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos);
    }
  };

  while (i < tokens.length) {
    let cmd = tokens[i];
    if (/^[A-Za-z]$/.test(cmd)) i++;
    else if (!lastCmd || /z/i.test(lastCmd)) {
      i++; // a stray number with no command to repeat: skip it
      continue;
    } else cmd = lastCmd === 'M' ? 'L' : lastCmd === 'm' ? 'l' : lastCmd; // implicit repeat
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (C) {
      case 'M':
        x = ox + num();
        y = oy + num();
        sx = x;
        sy = y;
        cur = { points: [x, y], closed: false };
        subs.push(cur);
        break;
      case 'L': {
        const nx = ox + num();
        const ny = oy + num();
        add(nx, ny);
        x = nx;
        y = ny;
        break;
      }
      case 'H':
        x = (rel ? x : 0) + num();
        add(x, y);
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        add(x, y);
        break;
      case 'C': {
        const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        cubic(x1, y1, x2, y2, ex, ey);
        lastCtrl = [x2, y2];
        x = ex;
        y = ey;
        break;
      }
      case 'S': {
        const [rx1, ry1]: [number, number] = lastCtrl && /[CS]/i.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
        cubic(rx1, ry1, x2, y2, ex, ey);
        lastCtrl = [x2, y2];
        x = ex;
        y = ey;
        break;
      }
      case 'Q': {
        const x1 = ox + num(), y1 = oy + num(), ex = ox + num(), ey = oy + num();
        quad(x1, y1, ex, ey);
        lastCtrl = [x1, y1];
        x = ex;
        y = ey;
        break;
      }
      case 'T': {
        const [x1, y1]: [number, number] = lastCtrl && /[QT]/i.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const ex = ox + num(), ey = oy + num();
        quad(x1, y1, ex, ey);
        lastCtrl = [x1, y1];
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
        const rx = num(), ry = num(), rot = num(), large = num(), sweep = num();
        const ex = ox + num(), ey = oy + num();
        arc(rx, ry, rot, large, sweep, ex, ey);
        x = ex;
        y = ey;
        break;
      }
      case 'Z':
        if (cur) cur.closed = true;
        x = sx;
        y = sy;
        cur = null;
        break;
      default:
        i++; // unknown token: skip
    }
    if (!/[CSQT]/i.test(C)) lastCtrl = null;
    lastCmd = cmd;
  }
  return subs.filter((s) => s.points.length >= 4);
}

// ── Document walking ────────────────────────────────────────────────────────

interface Shape {
  label: string;
  subs: Sub[];
  /** For points (circles, ellipses): the centre. */
  centre: [number, number] | null;
  tag: string;
}

type Node = Record<string, unknown> & { ':@'?: Record<string, string> };

function attrs(node: Node): Record<string, string> {
  return (node[':@'] as Record<string, string>) ?? {};
}
function tagOf(node: Node): string {
  return Object.keys(node).find((k) => k !== ':@') ?? '';
}
function childrenOf(node: Node): Node[] {
  const c = node[tagOf(node)];
  return Array.isArray(c) ? (c as Node[]) : [];
}

/** A shape's name: Inkscape label, data-name, <title>, or a meaningful id. */
function labelOf(node: Node): string {
  const a = attrs(node);
  const title = childrenOf(node).find((c) => tagOf(c) === 'title');
  const titleText = title ? String((childrenOf(title)[0] as Record<string, unknown>)?.['#text'] ?? '') : '';
  const id = a['@id'] ?? '';
  const autoId = /^(path|circle|ellipse|rect|g|polygon|polyline|line|layer|text|use)[-_]?\d+$/i.test(id);
  // Figma and others export layer names as ids, often with underscores for spaces.
  const fromId = autoId ? '' : id.replace(/_+/g, ' ');
  return (a['@inkscape:label'] ?? a['@data-name'] ?? (titleText || fromId)).trim();
}

function layerName(label: string): LayerName | null {
  const l = label.toLowerCase().trim();
  return (LAYERS as readonly string[]).find((n) => l === n || l.startsWith(`${n} `) || l.startsWith(`${n}(`)) as LayerName | null ?? null;
}

function geometry(node: Node, m: M): Shape | null {
  const tag = tagOf(node);
  const a = attrs(node);
  const n = (k: string) => Number(a[`@${k}`] ?? 0);
  const tx = (subs: Sub[]) =>
    subs.map((s) => {
      const pts: number[] = [];
      for (let k = 0; k < s.points.length; k += 2) pts.push(...apply(m, s.points[k], s.points[k + 1]));
      return { points: pts, closed: s.closed };
    });
  const label = labelOf(node);
  switch (tag) {
    case 'path':
      return { tag, label, subs: tx(flattenPath(a['@d'] ?? '')), centre: null };
    case 'polygon':
    case 'polyline': {
      const v = (a['@points'] ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      return { tag, label, subs: tx([{ points: v, closed: tag === 'polygon' }]), centre: null };
    }
    case 'line':
      return { tag, label, subs: tx([{ points: [n('x1'), n('y1'), n('x2'), n('y2')], closed: false }]), centre: null };
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      return { tag, label, subs: tx([{ points: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true }]), centre: apply(m, x + w / 2, y + h / 2) };
    }
    case 'circle':
    case 'ellipse': {
      const cx = n('cx'), cy = n('cy');
      const rx = tag === 'circle' ? n('r') : n('rx');
      const ry = tag === 'circle' ? n('r') : n('ry');
      const pts: number[] = [];
      for (let s = 0; s < 32; s++) pts.push(cx + rx * Math.cos((s / 32) * Math.PI * 2), cy + ry * Math.sin((s / 32) * Math.PI * 2));
      return { tag, label, subs: tx([{ points: pts, closed: true }]), centre: apply(m, cx, cy) };
    }
  }
  return null;
}

/** Collect drawable shapes under a node, applying nested transforms. */
function collect(node: Node, m: M, out: Shape[]) {
  const tag = tagOf(node);
  const mm = mul(m, parseTransform(attrs(node)['@transform']));
  if (tag === 'g' || tag === 'svg' || tag === 'a') {
    for (const c of childrenOf(node)) collect(c, mm, out);
    return;
  }
  const s = geometry(node, mm);
  if (s) out.push(s);
}

// ── Label parsing ───────────────────────────────────────────────────────────

/** "500", "500m", "500 m", "1,200 metres" → 500 / 1200. */
function numberIn(label: string): number | null {
  const m = label.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function withoutNumber(label: string): string | null {
  const s = label.replace(/,/g, '').replace(/-?\d+(\.\d+)?\s*(m|metres|meters)?\b/i, '').trim();
  return s || null;
}

/** "city Varrowick port" / "Ostmere (town)" → kind, name, port. */
export function parseSettlementLabel(label: string): { kind: SettlementKind | null; name: string; port: boolean } {
  const words = label.replace(/[()[\],]/g, ' ').split(/\s+/).filter(Boolean);
  let kind: SettlementKind | null = null;
  let port = false;
  const rest: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (!kind && (lw === 'city' || lw === 'town' || lw === 'village')) kind = lw;
    else if (lw === 'port' || lw === 'harbour' || lw === 'harbor') port = true;
    else rest.push(w);
  }
  return { kind, name: rest.join(' '), port };
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function parseDesign(svg: string, source = 'design'): ContinentDesign {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', preserveOrder: true, trimValues: true });
  const doc = parser.parse(svg) as Node[];
  const root = doc.find((n) => tagOf(n) === 'svg');
  if (!root) throw new Error(`${source}: not an SVG file`);

  const warnings: string[] = [];
  const layers = new Map<LayerName, Shape[]>();
  // Walk top-down; the first group whose label names a layer claims its contents.
  const walk = (node: Node, m: M) => {
    const tag = tagOf(node);
    const mm = mul(m, parseTransform(attrs(node)['@transform']));
    if (tag === 'g') {
      const name = layerName(labelOf(node));
      if (name) {
        const shapes: Shape[] = [];
        for (const c of childrenOf(node)) collect(c, mm, shapes);
        layers.set(name, [...(layers.get(name) ?? []), ...shapes]);
        return;
      }
    }
    if (tag === 'g' || tag === 'svg') for (const c of childrenOf(node)) walk(c, mm);
  };
  walk(root, IDENTITY);

  const get = (n: LayerName) => layers.get(n) ?? [];
  const coast = get('coast')
    .flatMap((s) => s.subs)
    .filter((s) => s.points.length >= 6)
    .map((s) => s.points);
  if (!coast.length) throw new Error(`${source}: no "coast" layer with a closed outline was found`);

  const contours: ContourLine[] = [];
  for (const s of get('contours')) {
    const level = numberIn(s.label);
    if (level === null) {
      warnings.push(`contour "${s.label || s.tag}" has no elevation in its label (e.g. "500") and was skipped`);
      continue;
    }
    contours.push({ level, rings: s.subs.map((x) => x.points) });
  }

  const peaks = get('peaks').flatMap((s) => {
    const elevation = numberIn(s.label);
    if (elevation === null) {
      warnings.push(`peak "${s.label || s.tag}" has no height in its label (e.g. "Mount Ost 1800") and was skipped`);
      return [];
    }
    const c = s.centre ?? ringCentroid(s.subs[0]?.points ?? [0, 0]);
    const [x, y] = Array.isArray(c) ? c : [c.x, c.y];
    return [{ x, y, elevation, name: withoutNumber(s.label) }];
  });

  const rivers = get('rivers').flatMap((s) =>
    s.subs.map((sub) => ({
      name: s.label.replace(/\bnavigable\b/i, '').trim() || null,
      points: sub.points,
      navigable: /\bnavigable\b/i.test(s.label),
    })),
  );

  const lakes = get('lakes').flatMap((s) => s.subs.map((sub) => ({ name: s.label || null, ring: sub.points })));

  const settlements = get('settlements').flatMap((s) => {
    const { kind, name, port } = parseSettlementLabel(s.label);
    if (!kind) {
      warnings.push(`settlement "${s.label || s.tag}" needs "city", "town" or "village" in its label and was skipped`);
      return [];
    }
    if (!name) {
      warnings.push(`a ${kind} has no name in its label and was skipped`);
      return [];
    }
    const c = s.centre ?? (() => {
      const r = ringCentroid(s.subs[0]?.points ?? [0, 0]);
      return [r.x, r.y] as [number, number];
    })();
    return [{ name, kind, x: c[0], y: c[1], port }];
  });

  const drawnRoads = get('roads').flatMap((s) => {
    const l = s.label.toLowerCase();
    const rank: RoadRank = l.includes('highway') ? 'highway' : l.includes('track') ? 'track' : 'road';
    return s.subs.map((sub) => ({ rank, points: sub.points }));
  });

  return { coast, contours, peaks, rivers, lakes, settlements, roads: drawnRoads.length ? drawnRoads : null, warnings };
}
