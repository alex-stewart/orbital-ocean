import { computeOrbitalAngle } from './timePhysics.js';
import { mulberry32 } from '../utils/random.js';

export function generateAsteroidsFromBelt(beltConfig, time) {
    const rng = mulberry32(beltConfig.seed);
    const asteroids = [];

    for (let i = 0; i < beltConfig.count; i++) {
        const orbit_radius = lerpRange(rng(), beltConfig.orbit_radius_range);
        const initial_angle = lerpRange(rng(), beltConfig.initial_angle_range);
        const period_world_years = lerpRange(rng(), beltConfig.period_world_years_range);
        const size = lerpRange(rng(), beltConfig.size_range);
        const shapeIndex = Math.floor(rng() * beltConfig.shape_variants);

        const angleDeg = computeOrbitalAngle({
            initialAngle: initial_angle,
            periodWorldYears: period_world_years,
            realTimeSeconds: time,
        });

        const angleRad = (angleDeg * Math.PI) / 180;
        const x = orbit_radius * Math.cos(angleRad);
        const y = orbit_radius * Math.sin(angleRad);

        asteroids.push({
            id: `${beltConfig.id}_${i}`,
            orbitX: x,
            orbitY: y,
            size: [size, size],
            shapeIndex,
        });
    }

    return asteroids;
}

function lerpRange(t, [min, max]) {
    return min + (max - min) * t;
}
