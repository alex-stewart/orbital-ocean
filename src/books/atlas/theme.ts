/** Canvas palette. Keep in step with the CSS tokens in styles/atlas.css. */
export const ink = '#3b2f24';
export const theme = {
  ocean: '#dde6e1',
  paper: '#f4ecd6',
  ink,
  inkFaint: 'rgba(59, 47, 36, 0.16)',
  inkSoft: 'rgba(59, 47, 36, 0.42)',
  land: '#efe0b6',
  relief: ['#e7d39f', '#dcc386', '#cfb06f'],
  accent: '#9b3a26',
  accentSoft: 'rgba(155, 58, 38, 0.55)',
  /** Imperial purple, for the Empire's administrative bands. */
  imperial: '#5b3a7a',
  imperialWash: (alpha: number) => `rgba(91, 58, 122, ${alpha})`,
  gunk: '#c2b893',
  gunkInk: 'rgba(80, 68, 36, 0.22)',
  halo: 'rgba(221, 230, 225, 0.92)',
};

export const fonts = {
  caps: '"Cormorant SC", "Cormorant Garamond", Georgia, serif',
  serif: '"Cormorant Garamond", Georgia, serif',
};

/** Opacity of the imperial purple wash over the i-th band from the centre. */
export function bandWash(i: number): number {
  return Math.max(0, 0.065 - i * 0.03);
}

/** The ocean colour as it appears under a purple wash of the given opacity. */
export function washedOcean(alpha: number): string {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const o = hex(theme.ocean);
  const p = hex(theme.imperial);
  const c = o.map((v, i) => Math.round(v * (1 - alpha) + p[i] * alpha));
  return `rgb(${c.join(', ')})`;
}
