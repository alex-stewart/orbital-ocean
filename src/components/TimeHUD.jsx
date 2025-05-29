import { getWorldTime } from '../utils/timeScale.js';

export function TimeHUD({ realTime }) {
  const date = new Date(realTime * 1000).toUTCString();
  const worldTime = getWorldTime(realTime);

  return (
    <div class="absolute top-4 left-4 bg-white/80 text-gray-800 px-3 py-1 rounded shadow text-sm">
      <div>Real Time: {date}</div>
      <div>
        World Time: {worldTime.years}y {worldTime.months}m {worldTime.days}d
      </div>
    </div>
  );
}
