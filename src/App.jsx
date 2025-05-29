import { useEffect, useState } from 'preact/hooks';
import { loadWorldYaml } from './utils/loadWorld.js';
import { TimeHUD } from './components/TimeHUD.jsx';
import { OrbitCanvas } from './components/OrbitCanvas.jsx';
import { IslandInfoBox } from './components/IslandInfoBox.jsx';
import { ZoomIndicator } from './components/ZoomIndicator.jsx';
import { TIME_SCALE } from './utils/timeScale.js';

export function App() {
  const [world, setWorld] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredIsland, setHoveredIsland] = useState(null);

  const [now, setNow] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now() / 1000);
    }, 1000);
  
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadWorldYaml().then(setWorld);
  }, []);

  return (
    <div class="fixed inset-0 overflow-hidden">
      <TimeHUD realTime={now} />
      {world && (
        <OrbitCanvas
          world={world}
          currentTime={now}
          hoveredIsland={hoveredIsland}
          setHoveredIsland={setHoveredIsland}
          setZoom={setZoom}
        />
      )}
      <ZoomIndicator zoom={zoom} />
      {hoveredIsland && <IslandInfoBox island={hoveredIsland} />}
    </div>
  );
}
