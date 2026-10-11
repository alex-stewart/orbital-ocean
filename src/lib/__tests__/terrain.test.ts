import { describe, expect, it } from 'vitest';
import { loadWorld } from './world';
import { buildContinentMap, continentMap, mappedBodies } from '../terrain';
import { flattenPath, parseDesign, parseSettlementLabel } from '../terrain/design';
import { cellAt, sample } from '../terrain/grid';
import { designTemplate } from '../terrain/template';
import exampleSource from '../../../docs/example-continent.svg?raw';

const world = loadWorld();
const maps = mappedBodies(world).map((b) => ({ body: b, map: continentMap(world, b) }));

describe('generated continents', () => {
  it('gives every continent terrain, water and at least one settlement', () => {
    for (const { body, map } of maps) {
      expect(map.maxElevation, body.id).toBeGreaterThan(300);
      expect(map.rivers.length, body.id).toBeGreaterThan(0);
      expect(map.settlements.length, body.id).toBeGreaterThan(0);
      // Continents have at least a town; moons at least a village.
      if (body.kind !== 'moon') expect(map.settlements.some((s) => s.kind !== 'village'), body.id).toBe(true);
    }
  });

  it('gives moons settlements too', () => {
    const moons = maps.filter(({ body }) => body.kind === 'moon');
    expect(moons.length).toBeGreaterThan(10);
    for (const { map } of moons) expect(map.settlements.length).toBeGreaterThan(0);
  });

  it('mostly builds villages, then towns, then a real share of cities', () => {
    const all = maps.flatMap((m) => m.map.settlements);
    const share = (k: string) => all.filter((s) => s.kind === k).length / all.length;
    expect(share('village')).toBeGreaterThan(share('town'));
    expect(share('town')).toBeGreaterThan(share('city'));
    expect(share('city')).toBeGreaterThan(0.06);
  });

  it('settles the inner ocean more densely than the outer', () => {
    const density = (band: string) => {
      const inBand = maps.filter(({ body }) => (body.parent ? world.bands.find((b) => body.orbitRadius >= b.innerRadius && body.orbitRadius < b.outerRadius)?.id : 'home') === band);
      const people = inBand.reduce((s, m) => s + m.map.settlements.length, 0);
      const area = inBand.reduce((s, m) => s + m.map.land.reduce((a, v) => a + v, 0) * m.map.grid.cell ** 2, 0);
      return people / area;
    };
    expect(density('home')).toBeGreaterThan(density('second'));
    expect(density('second')).toBeGreaterThan(density('frontier'));
  });

  it('puts settlements on dry land, apart from each other', () => {
    for (const { map } of maps) {
      for (const s of map.settlements) {
        const k = cellAt(map.grid, s.x, s.y);
        expect(map.land[k]).toBe(1);
        expect(map.lake[k]).toBe(-1);
      }
      for (let a = 0; a < map.settlements.length; a++)
        for (let b = a + 1; b < map.settlements.length; b++) {
          const p = map.settlements[a];
          const q = map.settlements[b];
          expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(5);
        }
    }
    const ids = maps.flatMap((m) => m.map.settlements.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('routes roads over land, never through the sea or a lake', () => {
    for (const { body, map } of maps) {
      for (const r of map.roads) {
        for (let v = 0; v < r.points.length; v += 2) {
          const k = cellAt(map.grid, r.points[v], r.points[v + 1]);
          // Smoothing can graze a shore by part of a cell; check the nearest cell centre's neighbourhood.
          const near = [0, 1, -1, map.grid.n, -map.grid.n].some((o) => map.land[k + o] === 1 && map.lake[k + o] < 0);
          expect(near, `${body.id} ${r.from}→${r.to}`).toBe(true);
        }
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  it('links every settlement on a continent by road when it shares a landmass', () => {
    const { map } = maps[0]; // the Land of the Large: one landmass
    const linked = new Set(map.roads.flatMap((r) => [r.from, r.to]));
    expect(map.settlements.filter((s) => !linked.has(s.id)).length).toBe(0);
  });

  it('runs rivers downhill overall', () => {
    for (const { map } of maps) {
      for (const r of map.rivers) {
        const top = sample(map.grid, map.elevation, r.points[0], r.points[1]);
        const end = sample(map.grid, map.elevation, r.points[r.points.length - 2], r.points[r.points.length - 1]);
        // A river may start in a shallow hollow and spill over its rim; hollows
        // deeper than the lake threshold (~1.2% of the relief) become lakes instead.
        expect(top).toBeGreaterThanOrEqual(end - Math.max(10, map.maxElevation * 0.015));
      }
    }
  });
});

describe('designed continents', () => {
  it('reads every SVG path command', () => {
    const [sub] = flattenPath('M0,0 h10 v10 H0 Z');
    expect(sub.closed).toBe(true);
    expect(sub.points).toEqual([0, 0, 10, 0, 10, 10, 0, 10]);
    const curves = flattenPath('M0 0 C 5 0 10 5 10 10 S 15 20 20 20 Q 25 20 25 25 T 30 30 A 5 5 0 0 1 40 30 l 1 1 1 1');
    const pts = curves[0].points;
    expect(pts[pts.length - 2]).toBeCloseTo(42);
    expect(pts[pts.length - 1]).toBeCloseTo(32);
  });

  it('reads settlement labels in either order', () => {
    expect(parseSettlementLabel('city Varrowick port')).toEqual({ kind: 'city', name: 'Varrowick', port: true });
    expect(parseSettlementLabel('Old Hale (village)')).toEqual({ kind: 'village', name: 'Old Hale', port: false });
    expect(parseSettlementLabel('Ostmere').kind).toBeNull();
  });

  it('round-trips a generated continent through its design template', () => {
    const body = world.bodies.find((b) => b.id === 'holy-purple-homeland')!;
    const generated = continentMap(world, body);
    const svg = designTemplate(body, generated);
    const design = parseDesign(svg, 'template');
    expect(design.warnings).toEqual([]);
    expect(design.settlements.length).toBe(generated.settlements.length);
    expect(design.roads).toBeNull(); // the roads layer is empty, so roads are routed
    const designed = loadWorld({ 'holy-purple-homeland': svg });
    const map = buildContinentMap(designed, designed.bodies.find((b) => b.id === body.id)!);
    expect(map.source).toBe('designed');
    expect(map.settlements.map((s) => s.name)).toEqual(generated.settlements.map((s) => s.name));
    expect(Math.abs(map.maxElevation - generated.maxElevation)).toBeLessThan(generated.maxElevation * 0.25);
    expect(map.roads.length).toBeGreaterThan(0);
  });

  it('applies transforms, and explains what it skips', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="-60 -60 120 120">
      <g inkscape:groupmode="layer" inkscape:label="coast" transform="translate(5,0)"><circle cx="0" cy="0" r="40"/></g>
      <g inkscape:label="contours"><circle inkscape:label="300" cx="0" cy="0" r="20"/><circle cx="0" cy="0" r="10"/></g>
      <g inkscape:label="settlements"><circle inkscape:label="town Brockley port" cx="30" cy="0" r="1"/><circle inkscape:label="Nameless" cx="0" cy="0" r="1"/></g>
    </svg>`;
    const d = parseDesign(svg);
    expect(d.coast[0][0]).toBeCloseTo(45);
    expect(d.contours).toHaveLength(1);
    expect(d.settlements).toEqual([{ name: 'Brockley', kind: 'town', x: 30, y: 0, port: true }]);
    expect(d.warnings).toHaveLength(2);
  });

  it('rejects designs for unknown continents or drawn too large', () => {
    const big = `<svg xmlns="http://www.w3.org/2000/svg"><g id="coast"><circle cx="0" cy="0" r="500"/></g></svg>`;
    expect(() => loadWorld({ mort: big })).toThrow(/guide circle/);
    expect(() => loadWorld({ atlantis: big })).toThrow(/no continent or moon/);
    expect(() => parseDesign('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toThrow(/coast/);
  });

  it('reads the documented example continent', () => {
    const d = parseDesign(exampleSource, 'example');
    expect(d.warnings).toEqual([]);
    expect(d.coast).toHaveLength(2);
    expect(d.contours.map((c) => c.level)).toEqual([200, 500, 800]);
    expect(d.peaks[0]).toMatchObject({ name: 'Mount Example', elevation: 1050 });
    expect(d.rivers.filter((r) => r.navigable).map((r) => r.name)).toEqual(['River Ost']);
    expect(d.settlements.map((s) => `${s.kind} ${s.name}${s.port ? ' port' : ''}`)).toEqual([
      'city Ostmouth port',
      'town Stillwater',
      'village High Hale',
      'village Westby port',
    ]);
    const w = loadWorld({ 'continent-7': exampleSource });
    const map = buildContinentMap(w, w.bodies.find((b) => b.id === 'continent-7')!);
    expect(map.source).toBe('designed');
    expect(map.maxElevation).toBeGreaterThan(900);
    expect(map.maxElevation).toBeLessThan(1200);
    expect(map.lakes.length).toBe(1);
    expect(map.roads.length).toBeGreaterThanOrEqual(2); // the islet's settlements aside, all linked
    expect(map.warnings).toEqual([]);
  });
});

