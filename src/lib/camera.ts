import type { Point } from './orbits';

/** View state: the map point at the canvas centre, and pixels per IL. */
export interface View {
  cx: number;
  cy: number;
  scale: number;
}

export function worldToScreen(v: View, w: number, h: number, p: Point): Point {
  return { x: (p.x - v.cx) * v.scale + w / 2, y: (p.y - v.cy) * v.scale + h / 2 };
}

export function screenToWorld(v: View, w: number, h: number, sx: number, sy: number): Point {
  return { x: (sx - w / 2) / v.scale + v.cx, y: (sy - h / 2) / v.scale + v.cy };
}

/** Zoom by `factor` keeping the map point under (sx, sy) fixed on screen. */
export function zoomAbout(v: View, w: number, h: number, sx: number, sy: number, scale: number): View {
  const anchor = screenToWorld(v, w, h, sx, sy);
  return {
    scale,
    cx: anchor.x - (sx - w / 2) / scale,
    cy: anchor.y - (sy - h / 2) / scale,
  };
}

/** Largest "nice" round number (1, 2, 5 × 10ⁿ) not above x. */
export function niceFloor(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
}

/** Smallest "nice" round number (1, 2, 5 × 10ⁿ) not below x. */
export function niceCeil(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
