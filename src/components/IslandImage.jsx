export function IslandImage({ island, currentTime, setHoveredIsland, isCentral = false }) {
    const x = island.orbitX;
    const y = island.orbitY;
  
    return (
      <image
        href={`/assets/islands/${island.id}.svg`}
        x={x - island.size[0] / 2}
        y={y - island.size[1] / 2}
        width={island.size[0]}
        height={island.size[1]}
        onPointerEnter={() => setHoveredIsland(island)}
        onPointerLeave={() => setHoveredIsland(null)}
      />
    );
  }
  