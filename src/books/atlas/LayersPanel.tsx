import { layerGroups, type Layers } from './layers';
import { RAMP } from './terrainLayer';

const top = RAMP[RAMP.length - 1][0];
/** The height tints as a CSS gradient, matching the chart. */
const heightGradient = `linear-gradient(90deg, ${RAMP.map(([m, [r, g, b]]) => `rgb(${r}, ${g}, ${b}) ${((m / top) * 100).toFixed(1)}%`).join(', ')})`;

interface Props {
  layers: Layers;
  onChange(layers: Layers): void;
  onClose(): void;
}

/** Checklist of chart layers, with a key to the platform symbols. */
export function LayersPanel({ layers, onChange, onClose }: Props) {
  return (
    <div className="layers-panel" role="dialog" aria-label="Map layers" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="layers-head">
        <h2>Layers</h2>
        <button onClick={onClose} aria-label="Close layers">
          ×
        </button>
      </div>
      {layerGroups.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          {g.items.map((item) => (
            <label key={item.key}>
              <input
                type="checkbox"
                checked={layers[item.key]}
                onChange={(e) => onChange({ ...layers, [item.key]: e.target.checked })}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      ))}
      <fieldset className="layers-key land-key">
        <legend>Key to the land</legend>
        <div className="height-bar" style={{ background: heightGradient }} aria-hidden />
        <div className="height-scale" aria-hidden>
          <span>0</span>
          <span>1,000</span>
          <span>2,000</span>
          <span>3,000 m</span>
        </div>
        <ul>
          <li>
            <svg viewBox="0 0 24 12" aria-hidden>
              <line x1="1" y1="6" x2="23" y2="6" stroke="#3b2f24" strokeWidth="3.4" />
              <line x1="1" y1="6" x2="23" y2="6" stroke="#c4532f" strokeWidth="2" />
            </svg>
            Highway
          </li>
          <li>
            <svg viewBox="0 0 24 12" aria-hidden>
              <line x1="1" y1="6" x2="23" y2="6" stroke="#9b3a26" strokeWidth="1.4" />
            </svg>
            Road
          </li>
          <li>
            <svg viewBox="0 0 24 12" aria-hidden>
              <line x1="1" y1="6" x2="23" y2="6" stroke="rgba(59,47,36,0.6)" strokeWidth="1.1" strokeDasharray="3 2" />
            </svg>
            Track
          </li>
          <li>
            <svg viewBox="0 0 24 12" aria-hidden>
              <line x1="1" y1="6" x2="23" y2="6" stroke="#4f7a96" strokeWidth="2.4" />
              <line x1="1" y1="6" x2="23" y2="6" stroke="#9b3a26" strokeWidth="0.9" strokeDasharray="3 3" />
            </svg>
            Navigable river
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <circle r="4.4" fill="#f4ecd6" stroke="#3b2f24" strokeWidth="1.5" />
              <circle r="1.9" fill="#3b2f24" />
            </svg>
            City
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <circle r="3" fill="#3b2f24" />
            </svg>
            Town
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <circle r="2.2" fill="#f4ecd6" stroke="#3b2f24" strokeWidth="1.1" />
            </svg>
            Village
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <g fill="none" stroke="#4f7a96" strokeWidth="1">
                <circle cy="-4" r="1.2" />
                <path d="M0 -3 V4 M-2 -1.5 H2 M-3.5 1 Q-3 4 0 4 Q3 4 3.5 1" />
              </g>
            </svg>
            Harbour
          </li>
          <li>
            <svg viewBox="0 0 24 12" aria-hidden>
              <line x1="1" y1="6" x2="23" y2="6" stroke="rgba(91,58,122,0.8)" strokeWidth="2" strokeDasharray="6 3" />
              <circle cx="12" cy="6" r="3" fill="#f4ecd6" stroke="#5b3a7a" strokeWidth="1.2" />
            </svg>
            Shipping, with a hub
          </li>
        </ul>
      </fieldset>
      <fieldset className="layers-key">
        <legend>Key to platforms</legend>
        <ul>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <rect x="-3.5" y="-3.5" width="7" height="7" className="k-imperial" />
            </svg>
            Anchored
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <path d="M0 -4.6 L4.6 0 L0 4.6 L-4.6 0 Z" className="k-imperial" />
            </svg>
            Orbital
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <rect x="-3.5" y="-3.5" width="7" height="7" className="k-imperial" />
            </svg>
            Imperial
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <rect x="-3.5" y="-3.5" width="7" height="7" className="k-independent" />
            </svg>
            Independent
          </li>
          <li>
            <svg viewBox="-6 -6 12 12" aria-hidden>
              <rect x="-3.5" y="-3.5" width="7" height="7" className="k-derelict" />
            </svg>
            Derelict
          </li>
        </ul>
        <p>Zoomed out, platforms show as a faint haze. Larger classes appear first as you zoom in.</p>
      </fieldset>
    </div>
  );
}
