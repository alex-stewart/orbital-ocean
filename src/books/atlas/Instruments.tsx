import { niceFloor, type View } from '../../lib/camera';
import { bearingBetween, compassPoint, type Point } from '../../lib/orbits';
import type { World } from '../../lib/world';

const fmt = new Intl.NumberFormat('en-GB');

/** Alternating-segment scale bar plus representative fraction. */
export function ScaleBar({ view, units }: { view: View; units: World['units'] }) {
  const length = niceFloor(160 / view.scale);
  const px = length * view.scale;
  // 1 IL ≈ 1 km; a CSS pixel is 0.2646 mm.
  const rf = 1e6 / (view.scale * 0.2646);
  const digits = Math.pow(10, Math.floor(Math.log10(rf)) - 1);
  const segments = 4;
  return (
    <div className="scalebar" aria-label={`Scale: ${fmt.format(length)} ${units.plural}`}>
      <div className="scalebar-bar" style={{ width: px }}>
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={i % 2 ? 'light' : 'dark'} />
        ))}
      </div>
      <div className="scalebar-labels" style={{ width: px }}>
        <span>0</span>
        <span>{fmt.format(length / 2)}</span>
        <span>
          {fmt.format(length)} {units.abbr}
        </span>
      </div>
      <div className="scalebar-rf">
        Scale 1 : {fmt.format(Math.round(rf / digits) * digits)} · {units.plural}
      </div>
    </div>
  );
}

export function CursorReadout({ point, world }: { point: Point | null; world: World }) {
  if (!point) return <div className="readout" />;
  const r = Math.hypot(point.x, point.y);
  const b = bearingBetween({ x: 0, y: 0 }, point);
  return (
    <div className="readout">
      {fmt.format(Math.round(r))} {world.units.abbr} from the {world.central.name.replace(/^The /, '')}, bearing{' '}
      {Math.round(b).toString().padStart(3, '0')}° {compassPoint(b)}
    </div>
  );
}

/** Engraved compass rose. North is always up on this projection. */
export function Compass() {
  // Intercardinal points first so the cardinal ones sit on top.
  const points = [45, 135, 225, 315, 0, 90, 180, 270];
  return (
    <svg className="compass" viewBox="-60 -60 120 120" aria-hidden>
      <circle r="44" className="c-ring" />
      <circle r="40" className="c-ring thin" />
      {Array.from({ length: 32 }, (_, i) => {
        const a = (i * 360) / 32;
        return <line key={i} y1={-40} y2={i % 4 ? -43 : -44} transform={`rotate(${a})`} className="c-tick" />;
      })}
      {points.map((a) => {
        const major = a % 90 === 0;
        const len = major ? 38 : 24;
        const w = major ? 6 : 4.5;
        return (
          <g key={a} transform={`rotate(${a})`}>
            <path d={`M0 ${-len} L${w} 0 L0 0 Z`} className="c-dark" />
            <path d={`M0 ${-len} L${-w} 0 L0 0 Z`} className="c-light" />
          </g>
        );
      })}
      <circle r="2.4" className="c-dark" />
      <text y="-48" className="c-label">
        N
      </text>
    </svg>
  );
}
