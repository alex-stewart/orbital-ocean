export const TIME_SCALE = 60 * 60 * 24 * 365; // 1 world year per real second

export function getWorldTime(realTimeSeconds) {
    const worldYears = realTimeSeconds / TIME_SCALE;
    const totalDays = worldYears * 365.25;
  
    const years = Math.floor(worldYears);
    const daysInYear = totalDays % 365.25;
    const months = Math.floor(daysInYear / 30.44);
    const days = Math.floor(daysInYear % 30.44);
  
    return { years, months, days };
  }