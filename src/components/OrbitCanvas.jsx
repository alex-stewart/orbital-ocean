import { useRef } from 'preact/hooks';
import { useZoomPan } from '../hooks/useZoomPan.js';
import { computeOrbitalAngle } from '../utils/timePhysics.js';
import { generateAsteroidsFromBelt } from '../utils/generateAsteroids.js';
import { IslandImage } from './IslandImage.jsx';
import { OrbitPath } from './OrbitPath.jsx';

export function OrbitCanvas({ world, currentTime, hoveredIsland, setHoveredIsland, setZoom }) {
  const svgRef = useRef(null);
  const { zoom, pan } = useZoomPan(svgRef, setZoom);

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

        {/* Orbit path for hovered orbital (not central or moons) */}
        {hoveredIsland?.orbit_radius > 0 && hoveredIsland?.period_world_years !== '∞' && (
          <OrbitPath
            r={hoveredIsland.orbit_radius}
            cx={hoveredIsland.centerX ?? 0}
            cy={hoveredIsland.centerY ?? 0}
          />
        )}

        {/* Orbiting islands + moons */}
        {world.orbitals.map((island) => {
          // Compute orbital island position
          const angleDeg = computeOrbitalAngle({
            initialAngle: island.initial_angle,
            periodWorldYears: island.period_world_years,
            realTimeSeconds: currentTime,
          });

          const angleRad = (angleDeg * Math.PI) / 180;
          const x = island.orbit_radius * Math.cos(angleRad);
          const y = island.orbit_radius * Math.sin(angleRad);

          return (
            <>
              {/* Main orbital island */}
              <IslandImage
                key={island.id}
                island={{ ...island, orbitX: x, orbitY: y }}
                currentTime={currentTime}
                setHoveredIsland={setHoveredIsland}
              />

              {/* Moons (relative to this island) */}
              {island.moons?.map((moon) => {
                const moonAngle = computeOrbitalAngle({
                  initialAngle: moon.initial_angle,
                  periodWorldYears: moon.period_world_years,
                  realTimeSeconds: currentTime,
                });

                const moonRad = (moonAngle * Math.PI) / 180;
                const moonX = x + moon.orbit_radius * Math.cos(moonRad);
                const moonY = y + moon.orbit_radius * Math.sin(moonRad);

                return (
                  <IslandImage
                    key={moon.id}
                    island={{
                      ...moon,
                      orbitX: moonX,
                      orbitY: moonY,
                      centerX: x,  // parent island X
                      centerY: y,  // parent island Y
                    }}
                    currentTime={currentTime}
                    setHoveredIsland={setHoveredIsland}
                  />
                );
              })}
            </>
          );
        })}

        {world.asteroid_belts?.flatMap((belt) => {
          console.log('Generating belt:', belt.id);
          const asteroids = generateAsteroidsFromBelt(belt, currentTime);
          return asteroids.map(asteroid => (
            <circle
              key={asteroid.id}
              cx={asteroid.orbitX}
              cy={asteroid.orbitY}
              r={asteroid.size[0] / 2}
              fill="#888"
              opacity="0.6"
              style={{ pointerEvents: 'none' }}
            />
          ));
        })}
      </g>
    </svg>
  );
}
