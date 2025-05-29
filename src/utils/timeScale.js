export const TIME_SCALE = 60 * 60 * 24 * 365;

const BASE_REAL_TIME = 1577836800;

export function getWorldTime(realTimeSeconds) {
  const worldSeconds = realTimeSeconds - BASE_REAL_TIME;
  const worldYears = worldSeconds / TIME_SCALE;
  const totalDays = worldYears * 365.25;

  const years = Math.floor(worldYears);
  const daysInYear = totalDays % 365.25;
  const months = Math.floor(daysInYear / 30.44);
  const days = Math.floor(daysInYear % 30.44);

  return { years, months, days };
}
