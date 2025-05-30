const MIN_REAL_TIME = 1735689600; // Jan 1, 2020
const MAX_REAL_TIME = 1767225600; // Jan 1, 2030

export function TimelineBar({ realTime, setRealTime, setIsLiveTime }) {
  const year = new Date(realTime * 1000).getUTCFullYear();

  const handleInput = (e) => {
    setRealTime(parseFloat(e.target.value));
    setIsLiveTime(false);
  };

  return (
    <div class="absolute bottom-4 left-4 bg-white/80 rounded px-3 py-1 border text-sm shadow flex items-center gap-2 z-10">
      <input
        type="range"
        min={MIN_REAL_TIME}
        max={MAX_REAL_TIME}
        value={realTime}
        onInput={handleInput}
        class="w-64 h-1"
      />
      <span class="text-gray-700 whitespace-nowrap">Year: {year}</span>
      <button
        onClick={() => {
          setIsLiveTime(true);
          setRealTime(Date.now() / 1000);
        }}
        class="ml-2 text-xs px-2 py-0.5 rounded border bg-gray-200 hover:bg-gray-300 text-gray-800"
      >
        ⏵ Live
      </button>
    </div>
  );
}
