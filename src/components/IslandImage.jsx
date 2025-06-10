import { computeSpinAngle } from '../utils/timePhysics.js';

export function IslandImage({ island, currentTime, setHoveredIsland, isCentral = false }) {
  const x = island.orbitX;
  const y = island.orbitY;
  const [width, height] = island.size;

  const spinAngle = computeSpinAngle(currentTime, island.spin_period_world_years);

  return (
    <g
      transform={`
        translate(${x}, ${y})
        rotate(${spinAngle})
        translate(${-width / 2}, ${-height / 2})
      `}
      onPointerEnter={() => setHoveredIsland(island)}
      onPointerLeave={() => setHoveredIsland(null)}
    >
      <rect
        width={width}
        height={height}
        fill="transparent"
        x={0}
        y={0}
      />
      <image
        href={`${import.meta.env.BASE_URL}assets/islands/${island.id}.svg`}
        width={width}
        height={height}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
}
