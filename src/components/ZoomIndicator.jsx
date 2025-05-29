export function ZoomIndicator({ zoom }) {
    return (
      <div class="fixed bottom-4 right-4 text-sm bg-white/90 text-gray-700 px-3 py-1 rounded shadow pointer-events-none select-none">
        Zoom: {(zoom * 100).toFixed(0)}%
      </div>
    );
  }