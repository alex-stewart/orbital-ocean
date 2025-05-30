export function IslandLabel({ label, x, y, zoom, visibleZoomThreshold = 50, islandHeight = 40 }) {
    if (zoom > visibleZoomThreshold) return null;
  
    const offset = islandHeight / 2 + 10;
    const scaledFont = 12 / zoom; // keep consistent on screen
  
    return (
      <text
        x={x}
        y={y - offset}
        fontSize={scaledFont}
        fill="#111"                   // pure dark grey (very legible)
        textAnchor="middle"
        pointerEvents="none"
        style={{
          transition: 'opacity 0.2s ease',
          opacity: 1,                // or add fade logic if you like
        }}
      >
        {label}
      </text>
    );
  }
  