import { layerGroups, type Layers } from './layers';

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
