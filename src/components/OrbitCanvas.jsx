import { useRef } from 'preact/hooks';
import { useZoomPan } from '../hooks/useZoomPan.js';
import { computeOrbitalAngle } from '../utils/timePhysics.js';
import { IslandImage } from './IslandImage.jsx';
import { OrbitPath } from './OrbitPath.jsx';

export function OrbitCanvas({ world, currentTime, hoveredIsland, setHoveredIsland }) {
  const svgRef = useRef(null);
  const { zoom, pan } = useZoomPan(svgRef);

  return (
    <svg
      ref={svgRef}
      class="w-full h-full block"
      viewBox="-500 -500 1000 1000"
    >
      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
        {/* Ocean background */}
        <rect x="-1000" y="-1000" width="2000" height="2000" fill="#bfdbfe" />

        {/* Central island */}
        <IslandImage
          island={{
            ...world.central,
            orbit_radius: 0,
            period_world_years: '∞',
            initial_angle: 0,
            orbitX: 0,
            orbitY: 0,
          }}
          isCentral
          currentTime={currentTime}
          setHoveredIsland={setHoveredIsland}
        />

        {/* Orbit path for hovered island (only orbiting) */}
        {hoveredIsland?.orbit_radius > 0 && (
          <OrbitPath r={hoveredIsland.orbit_radius} />
        )}

        {/* Orbiting islands */}
        {world.orbitals.map((island) => {
          // Compute angle based on time
          const angleDeg = computeOrbitalAngle({
            initialAngle: island.initial_angle,
            periodWorldYears: island.period_world_years,
            realTimeSeconds: currentTime,
          });

          // Convert to radians and compute x/y position
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = island.orbit_radius * Math.cos(angleRad);
          const y = island.orbit_radius * Math.sin(angleRad);

          return (
            <IslandImage
              key={island.id}
              island={{
                ...island,
                orbitX: x,
                orbitY: y,
              }}
              currentTime={currentTime}
              setHoveredIsland={setHoveredIsland}
            />
          );
        })}
      </g>
    </svg>
  );
}
