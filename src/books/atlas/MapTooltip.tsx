import { measureBetween, placeSummary } from '../../lib/places';
import type { World } from '../../lib/world';

interface Props {
  world: World;
  t: number;
  hover: { id: string; x: number; y: number } | null;
  /** Measure from here to the hovered place, if set (the selection or a measuring origin). */
  from: string | null;
}

/** A small label by the pointer: what's under it, and how far it is from the selection. */
export function MapTooltip({ world, t, hover, from }: Props) {
  if (!hover) return null;
  const s = placeSummary(world, hover.id);
  if (!s) return null;
  const distance = from && from !== hover.id ? measureBetween(world, from, hover.id, t) : null;
  const fromName = from ? placeSummary(world, from)?.title : null;
  return (
    <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="tooltip">
      <strong>{s.title}</strong>
      <span>{s.detail}</span>
      {distance && (
        <span className="map-tooltip-measure">
          {distance} from {fromName}
        </span>
      )}
    </div>
  );
}
