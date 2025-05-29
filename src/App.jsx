import { useEffect, useState } from 'preact/hooks';
import { loadWorldYaml } from './utils/loadWorld.js';
import { TimeHUD } from './components/TimeHUD.jsx';
import { OrbitCanvas } from './components/OrbitCanvas.jsx';
import { IslandInfoBox } from './components/IslandInfoBox.jsx';
import { ZoomIndicator } from './components/ZoomIndicator.jsx';
import { TimelineBar } from './components/TimelineBar.jsx';

export function App() {
  const [world, setWorld] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [hoveredIsland, setHoveredIsland] = useState(null);
  const [realTime, setRealTime] = useState(Date.now() / 1000);
  const [isLiveTime, setIsLiveTime] = useState(true);

  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => {
      setRealTime(Date.now() / 1000);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  useEffect(() => {
    loadWorldYaml().then(setWorld);
  }, []);

  return (
    <div class="fixed inset-0 overflow-hidden">
      <TimeHUD realTime={realTime} />
      {world && (
        <OrbitCanvas
          world={world}
          currentTime={realTime}
          hoveredIsland={hoveredIsland}
          setHoveredIsland={setHoveredIsland}
          setZoom={setZoom}
        />
      )}
      <TimelineBar
        realTime={realTime}
        setRealTime={setRealTime}
        setIsLiveTime={setIsLiveTime}
      />
      <ZoomIndicator zoom={zoom} />
      {hoveredIsland && <IslandInfoBox island={hoveredIsland} />}
    </div>
  );
}
