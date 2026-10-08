import { useCallback, useEffect, useRef, useState } from 'react';
import { calendar, world } from '../../data';
import { dateToDays, daysToDate } from '../../lib/calendar';
import type { View } from '../../lib/camera';
import type { Point } from '../../lib/orbits';
import { replaceParams } from '../../lib/route';
import { AtlasMap, type AtlasMapHandle } from './AtlasMap';
import { Compass, CursorReadout, ScaleBar } from './Instruments';
import { Gazetteer } from './Gazetteer';
import { Timeline } from './Timeline';
import '../../styles/atlas.css';

function parseDateParam(v: string | null): number | null {
  const m = v?.match(/^(-?\d+)-(\d+)-(\d+)$/);
  if (!m) return null;
  return dateToDays(calendar, +m[1], +m[2] - 1, +m[3]);
}

function dateParam(t: number): string {
  const d = daysToDate(calendar, t);
  return `${d.year}-${d.monthIndex + 1}-${d.day}`;
}

export default function Atlas({ params }: { params: URLSearchParams }) {
  const [t, setT] = useState(() => parseDateParam(params.get('date')) ?? calendar.defaultDay);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(params.get('isle'));
  const [followId, setFollowId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  // The gazetteer starts closed on narrow screens, where it would cover the chart.
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches);
  const mapRef = useRef<AtlasMapHandle>(null);

  const clampT = useCallback((x: number) => Math.min(calendar.endDay, Math.max(calendar.startDay, x)), []);

  // Playback: advance `speed` days per second of real time.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const dt = (now - last) / 1000;
      last = now;
      setT((cur) => {
        const next = clampT(cur + speed * dt);
        if (next === calendar.endDay) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, clampT]);

  // Keep the date and selection in the URL so a view can be shared.
  useEffect(() => {
    const id = setTimeout(() => replaceParams({ date: dateParam(t), isle: selectedId }), 250);
    return () => clearTimeout(id);
  }, [t, selectedId]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea')) return;
      if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === '+' || e.key === '=') mapRef.current?.zoomBy(1.6);
      else if (e.key === '-' || e.key === '_') mapRef.current?.zoomBy(1 / 1.6);
      else if (e.key === '0') mapRef.current?.reset();
      else if (e.key === 'Escape') {
        setSelectedId(null);
        setFollowId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id && !window.matchMedia('(max-width: 720px)').matches) setPanelOpen(true);
    setFollowId((f) => (f && f !== id ? null : f));
  }, []);

  const focus = useCallback((id: string) => {
    select(id);
    mapRef.current?.flyTo(id);
  }, [select]);

  return (
    <div className="atlas">
      <div className="plate">
        <div className="plate-map">
          <AtlasMap
            ref={mapRef}
            world={world}
            t={t}
            selectedId={selectedId}
            followId={followId}
            onSelect={select}
            onFollowEnd={() => setFollowId(null)}
            onViewChange={setView}
            onCursor={setCursor}
          />
          <div className="paper-grain" aria-hidden />

          <header className="cartouche">
            <a className="cartouche-back" href="#/">
              ← The Library
            </a>
            <p className="cartouche-plate">Plate I</p>
            <h1>General Chart of the Orbital Ocean</h1>
            <p className="cartouche-sub">Polar projection, centred upon the Central Isle · North uppermost</p>
          </header>

          <Compass />

          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button onClick={() => mapRef.current?.zoomBy(1.8)} aria-label="Zoom in" title="Zoom in (+)">
              +
            </button>
            <button onClick={() => mapRef.current?.zoomBy(1 / 1.8)} aria-label="Zoom out" title="Zoom out (−)">
              −
            </button>
            <button onClick={() => mapRef.current?.reset()} aria-label="Whole ocean" title="Whole ocean (0)">
              ◎
            </button>
          </div>

          <div className="map-foot">
            {view && <ScaleBar view={view} units={world.units} />}
            <CursorReadout point={cursor} world={world} />
          </div>

          <Gazetteer
            open={panelOpen}
            onToggle={() => setPanelOpen((o) => !o)}
            world={world}
            calendar={calendar}
            t={t}
            selectedId={selectedId}
            followId={followId}
            onSelect={select}
            onFocus={focus}
            onFollow={(id) => {
              setFollowId(id);
              if (id) mapRef.current?.flyTo(id);
            }}
          />
        </div>

        <Timeline
          calendar={calendar}
          t={t}
          onChange={(x) => setT(clampT(x))}
          playing={playing}
          onPlayingChange={setPlaying}
          speed={speed}
          onSpeedChange={setSpeed}
        />
      </div>
    </div>
  );
}
