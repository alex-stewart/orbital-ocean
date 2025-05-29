import { TIME_SCALE } from './timeScale.js';

export function computeOrbitalAngle({ initialAngle, periodWorldYears, realTimeSeconds }) {
  const worldYearsElapsed = realTimeSeconds / TIME_SCALE;
  const orbitFraction = worldYearsElapsed / periodWorldYears;
  const angle = (initialAngle + orbitFraction * 360) % 360;
  return angle;
}

export function computeSpinAngle(currentWorldTime, spinPeriodYears) {
  if (!spinPeriodYears || spinPeriodYears <= 0 || spinPeriodYears === Infinity) return 0;

  const secondsPerYear = 365 * 24 * 60 * 60;
  const rotationFraction = (currentWorldTime / (spinPeriodYears * secondsPerYear)) % 1;
  return rotationFraction * 360;
}
