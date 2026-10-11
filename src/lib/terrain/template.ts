import type { Body } from '../world';
import { simplify } from './geometry';
import type { ContinentMap } from './index';

/**
 * A starting point for hand-drawing a continent: an Inkscape-ready SVG with
 * every layer the design reader understands, pre-filled from the current
 * (usually generated) map. Edit, delete or redraw anything, save it as
 * src/data/continents/<id>.svg, and it replaces the generated map.
 */

const f = (v: number) => (Math.round(v * 100) / 100).toString();

function pathData(points: number[], closed: boolean): string {
  let d = `M ${f(points[0])},${f(points[1])}`;
  for (let i = 2; i < points.length; i += 2) d += ` L ${f(points[i])},${f(points[i + 1])}`;
  return closed ? `${d} Z` : d;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function layer(name: string, body: string, extra = ''): string {
  return `  <g inkscape:groupmode="layer" inkscape:label="${name}" id="layer-${name.split(' ')[0]}"${extra}>\n${body}  </g>\n`;
}

/** `limit`: how far the coast may reach, × radius (the guide's outer circle). */
export function designTemplate(body: Body, map: ContinentMap, limit = 1.6): string {
  const half = Math.ceil(Math.max(body.radius * limit, body.outerRadius * 1.15));
  const tol = map.grid.cell * 0.4;
  const thin = (pts: number[], closed: boolean) => {
    const s = simplify(pts, tol);
    return s.length >= (closed ? 6 : 4) ? s : pts;
  };

  const coast = body.coast
    .map((r, i) => `    <path id="coast-${i + 1}" d="${pathData(thin(r, true), true)}" />\n`)
    .join('');

  // Contours as closed outlines, one path per ring, labelled with their height.
  const contours = map.contours
    .flatMap(({ level, lines }) =>
      lines
        .filter((l) => l.length >= 8)
        .map((l, i) => `    <path inkscape:label="${level}" id="contour-${level}-${i + 1}" d="${pathData(thin(l, true), true)}" />\n`),
    )
    .join('');

  // The highest point, as a peak.
  let top = 0;
  for (let k = 1; k < map.elevation.length; k++) if (map.elevation[k] > map.elevation[top]) top = k;
  const tx = -map.grid.half + ((top % map.grid.n) + 0.5) * map.grid.cell;
  const ty = -map.grid.half + (Math.floor(top / map.grid.n) + 0.5) * map.grid.cell;
  const peaks = `    <circle inkscape:label="${map.maxElevation}" id="peak-1" cx="${f(tx)}" cy="${f(ty)}" r="${f(body.radius * 0.02)}" />\n`;

  const lakes = map.lakes
    .filter((l) => l.length >= 8)
    .map((l, i) => `    <path id="lake-${i + 1}" d="${pathData(thin(l, true), true)}" />\n`)
    .join('');

  const rivers = map.rivers
    .map((r, i) => {
      const label = [r.name, r.navigableFrom >= 0 ? 'navigable' : ''].filter(Boolean).join(' ');
      return `    <path${label ? ` inkscape:label="${esc(label)}"` : ''} id="river-${i + 1}" d="${pathData(thin(r.points, false), false)}" />\n`;
    })
    .join('');

  const marker = { city: 0.03, town: 0.022, village: 0.015 };
  const settlements = map.settlements
    .map(
      (s, i) =>
        `    <circle inkscape:label="${s.kind} ${esc(s.name)}${s.port ? ' port' : ''}" id="settlement-${i + 1}" cx="${f(s.x)}" cy="${f(s.y)}" r="${f(Math.max(0.6, body.radius * marker[s.kind]))}" />\n`,
    )
    .join('');

  const guideRoads = map.roads
    .map((r, i) => `    <path inkscape:label="${r.rank} (generated)" id="guide-road-${i + 1}" d="${pathData(thin(r.points, false), false)}" />\n`)
    .join('');

  const sw = (k: number) => f(body.radius * k);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Design template for ${esc(body.name)} (${body.id}).
  Units: 1 user unit = 1 Imperial League. 0,0 is the continent's centre; north is up.
  Save as src/data/continents/${body.id}.svg. Full guide: docs/designing-continents.md

  Layers the atlas reads (by name):
    coast        closed outlines of the land (required)
    contours     closed lines, each labelled with its height in metres, e.g. "500"
    peaks        circles labelled with a height (and optional name), e.g. "Mount Ost 1800"
    lakes        closed outlines
    rivers       lines from source to mouth; add "navigable" to the label for boat traffic
    settlements  circles labelled "city Name", "town Name" or "village Name"; add "port" for a harbour
    roads        leave empty to route roads automatically, or draw lines labelled highway / road / track
  The "guide" layer is ignored: it shows the size limit and the generated roads for reference.
-->
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
     width="${half * 2 * 4}" height="${half * 2 * 4}" viewBox="${-half} ${-half} ${half * 2} ${half * 2}">
  <sodipodi:namedview pagecolor="#dde6e1" inkscape:document-units="px" />
${layer(
  'guide',
  `    <circle id="guide-limit" cx="0" cy="0" r="${f(body.radius * limit)}" fill="none" stroke="#9b3a26" stroke-width="${sw(0.006)}" stroke-dasharray="${sw(0.03)} ${sw(0.02)}" />
    <circle id="guide-radius" cx="0" cy="0" r="${f(body.radius)}" fill="none" stroke="#3b2f24" stroke-opacity="0.3" stroke-width="${sw(0.004)}" />
    <g id="guide-roads" fill="none" stroke="#9b3a26" stroke-opacity="0.35" stroke-width="${sw(0.005)}">
${guideRoads}    </g>
`,
  ' sodipodi:insensitive="true" style="opacity:0.8"',
)}${layer('coast', coast, ` style="fill:#efe0b6;stroke:#3b2f24;stroke-width:${sw(0.006)}"`)}${layer(
    'contours',
    contours,
    ` style="fill:none;stroke:#8a6a3a;stroke-width:${sw(0.003)}"`,
  )}${layer('lakes', lakes, ` style="fill:#c9dbe0;stroke:#4f7a96;stroke-width:${sw(0.004)}"`)}${layer(
    'rivers',
    rivers,
    ` style="fill:none;stroke:#4f7a96;stroke-width:${sw(0.006)}"`,
  )}${layer('peaks', peaks, ' style="fill:#3b2f24"')}${layer('roads', '', ` style="fill:none;stroke:#9b3a26;stroke-width:${sw(0.006)}"`)}${layer(
    'settlements',
    settlements,
    ' style="fill:#5b3a7a;stroke:#f4ecd6;stroke-width:0.2"',
  )}</svg>
`;
}
