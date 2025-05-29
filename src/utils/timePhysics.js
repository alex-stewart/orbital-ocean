import { TIME_SCALE } from './timeScale.js';

export function computeOrbitalAngle({ initialAngle, periodWorldYears, realTimeSeconds }) {
  const worldYearsElapsed = realTimeSeconds / TIME_SCALE;
  const orbitFraction = worldYearsElapsed / periodWorldYears;
  const angle = (initialAngle + orbitFraction * 360) % 360;
  return angle;
}
