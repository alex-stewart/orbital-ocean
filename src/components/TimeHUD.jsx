import { getWorldTime } from '../utils/timeScale.js';

export function TimeHUD({ realTime }) {
    const world = getWorldTime(realTime);
    const real = new Date(realTime * 1000).toLocaleString();
  
    return (
      <div class="absolute top-2 left-2 bg-white/90 text-black text-sm font-mono rounded-lg px-4 py-2 shadow-md border border-gray-300">
        <div><span class="font-semibold">Real Time:</span> {real}</div>
        <div><span class="font-semibold">World Time:</span> Year {world.years}, Month {world.months + 1}, Day {world.days + 1}</div>
      </div>
    );
  }
  