import { useEffect, useRef, useState } from 'preact/hooks';

export function useZoomPan(svgRef) {
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const [_, forceRender] = useState(0);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const point = svg.createSVGPoint();
      point.x = e.clientX;
      point.y = e.clientY;
      const CTM = svg.getScreenCTM().inverse();
      const cursor = point.matrixTransform(CTM);

      const zoomFactor = 1.05;
      const currentZoom = zoomRef.current;
      const newZoom = e.deltaY < 0 ? currentZoom * zoomFactor : currentZoom / zoomFactor;
      const scaleDelta = newZoom / currentZoom;

      const prevPan = panRef.current;
      panRef.current = {
        x: cursor.x - (cursor.x - prevPan.x) * scaleDelta,
        y: cursor.y - (cursor.y - prevPan.y) * scaleDelta,
      };
      zoomRef.current = newZoom;
      forceRender((v) => v + 1);
    };

    const handleMouseDown = (e) => {
      isPanning.current = true;
      start.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e) => {
      if (!isPanning.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      start.current = { x: e.clientX, y: e.clientY };
      const prevPan = panRef.current;
      panRef.current = { x: prevPan.x + dx, y: prevPan.y + dy };
      forceRender((v) => v + 1);
    };

    const handleMouseUp = () => {
      isPanning.current = false;
    };

    svg.addEventListener('wheel', handleWheel, { passive: false });
    svg.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      svg.removeEventListener('wheel', handleWheel);
      svg.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return {
    zoom: zoomRef.current,
    pan: panRef.current,
  };
}
