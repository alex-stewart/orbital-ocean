export function IslandInfoBox({ island }) {
  return (
    <div class="absolute top-2 right-2 bg-white/90 text-black text-sm font-mono rounded-lg px-4 py-2 shadow-md border border-gray-300">
      <div><strong>ID:</strong> {island.id}</div>
      <div><strong>Radius:</strong> {island.orbit_radius}</div>
      <div><strong>Angle:</strong> {island.initial_angle}°</div>
      <div><strong>World Years:</strong> {island.period_world_years}</div>
      <div><strong>Pos:</strong> {island.orbitX.toFixed(1)}, {island.orbitY.toFixed(1)}</div>
    </div>
  );
}
