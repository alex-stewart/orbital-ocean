import { TIME_SCALE } from './timeScale.js';

export function computeOrbitalAngle({ initialAngle, periodWorldYears, realTimeSeconds }) {
  const worldYearsElapsed = realTimeSeconds / TIME_SCALE;
  const orbitFraction = worldYearsElapsed / periodWorldYears;
  const angle = (initialAngle + orbitFraction * 360) % 360;
  return angle;
}

export function computeSpinAngle(realTimeSeconds, spinPeriodYears) {
  if (!spinPeriodYears || spinPeriodYears <= 0 || spinPeriodYears === Infinity) return 0;

  const worldSeconds = realTimeSeconds;
  const worldYears = worldSeconds / TIME_SCALE;

  const fraction = (worldYears % spinPeriodYears) / spinPeriodYears;
  return fraction * 360;
}