import { useCallback, useEffect, useRef, useState } from 'react';
import { calendar, onWorldReload, world as initialWorld } from '../../data';
import { dateToDays, daysToDate } from '../../lib/calendar';
import type { View } from '../../lib/camera';
import type { Point } from '../../lib/orbits';
import { currentParams, pushParams, replaceParams } from '../../lib/route';
import { stepDate } from '../../lib/calendar';
import { measureBetween, placeSummary } from '../../lib/places';
import { MapTooltip } from './MapTooltip';
import { AtlasMap, type AtlasMapHandle } from './AtlasMap';
import { Compass, CursorReadout, ScaleBar } from './Instruments';
import { Gazetteer } from './Gazetteer';
import { loadLayers, saveLayers, type Layers } from './layers';
import { LayersPanel } from './LayersPanel';
import { QuickSelect } from './QuickSelect';
import { Timeline } from './Timeline';
import { findSettlement } from '../../lib/terrain';
import type { ShippingNetwork } from '../../lib/shipping';
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
  // The world can be rebuilt while editing data in development; see data/index.ts.
  const [world, setWorld] = useState(initialWorld);
  useEffect(() => onWorldReload(setWorld), []);
  const [t, setT] = useState(() => parseDateParam(params.get('date')) ?? calendar.defaultDay);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const id = params.get('place') ?? params.get('isle');
    if (!id) return null;
    // Places in the URL: bodies, archipelagos, settlements (body/slug) and platforms. Routes are re-planned, so not kept.
    const known =
      world.bodies.some((b) => b.id === id) ||
      world.archipelagos.some((a) => a.id === id) ||
      world.platformIndex.has(id) ||
      (id.includes('/') && !!findSettlement(world, id));
    return known ? id : null;
  });
  const [layers, setLayersState] = useState<Layers>(loadLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const setLayers = useCallback((l: Layers) => {
    setLayersState(l);
    saveLayers(l);
  }, []);
  const [followId, setFollowId] = useState<string | null>(null);
  const [shipping, setShipping] = useState<ShippingNetwork | null>(null);
  // The timeline starts as one slim row; the choice is remembered in this browser.
  const [compactTime, setCompactTime] = useState(() => {
    try {
      return localStorage.getItem('orbital-ocean.timeline') !== 'full';
    } catch {
      return true;
    }
  });
  const setCompact = useCallback((c: boolean) => {
    setCompactTime(c);
    try {
      localStorage.setItem('orbital-ocean.timeline', c ? 'compact' : 'full');
    } catch {
      // Not saved; applies for this visit.
    }
  }, []);
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  // The gazetteer starts closed on narrow screens, where it would cover the chart.
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia('(max-width: 720px)').matches);
  const mapRef = useRef<AtlasMapHandle>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [measure, setMeasure] = useState<{ from: string; to: string | null } | null>(null);
  const measuring = useRef(false);
  measuring.current = !!measure;
  // A shared link's view: ?view=<centre x>,<centre y>,<px per IL>.
  const [initialView] = useState<View | null>(() => {
    const v = params.get('view')?.split(',').map(Number);
    return v && v.length === 3 && v.every(Number.isFinite) && v[2] > 0 ? { cx: v[0], cy: v[1], scale: v[2] } : null;
  });
  // Set while the selection is being restored from Back/Forward, so it isn't pushed again.
  const restoring = useRef(false);

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

  // The date and view are kept in the URL (replacing the entry, so they don't
  // flood history); each new selection is its own history entry, so Back and
  // Forward step through the places you've looked at.
  useEffect(() => {
    const id = setTimeout(() => replaceParams({ date: dateParam(t), isle: null }), 250);
    return () => clearTimeout(id);
  }, [t]);
  useEffect(() => {
    if (!view) return;
    const id = setTimeout(() => {
      const sig = (x: number) => Number(x.toPrecision(4));
      replaceParams({ view: `${Math.round(view.cx)},${Math.round(view.cy)},${sig(view.scale)}` });
    }, 400);
    return () => clearTimeout(id);
  }, [view]);
  const firstSelection = useRef(true);
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (restoring.current) {
      restoring.current = false;
      return;
    }
    const place = selectedId?.startsWith('route:') ? null : selectedId;
    if ((currentParams().get('place') ?? null) !== place) pushParams({ place });
  }, [selectedId]);
  useEffect(() => {
    const onPop = () => {
      const place = currentParams().get('place');
      restoring.current = true;
      setSelectedId(place);
      if (place) mapRef.current?.flyTo(place);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
      else if (e.key === 'l' || e.key === 'L') setLayersOpen((o) => !o);
      // Arrow keys pan; [ and ] step a day, { and } a month.
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const f = e.shiftKey ? 0.4 : 0.15;
        const d = { ArrowLeft: [-f, 0], ArrowRight: [f, 0], ArrowUp: [0, -f], ArrowDown: [0, f] }[e.key];
        if (d) mapRef.current?.panBy(d[0], d[1]);
      } else if (e.key === '[' || e.key === ']' || e.key === '{' || e.key === '}') {
        setPlaying(false);
        const dir = e.key === ']' || e.key === '}' ? 1 : -1;
        setT((cur) => clampT(stepDate(calendar, cur, e.key === '{' || e.key === '}' ? 'month' : 'day', dir)));
      } else if (e.key === 'Escape') {
        // Escape ends measuring first, then clears the selection.
        if (measuring.current) setMeasure(null);
        else {
          setSelectedId(null);
          setFollowId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clampT]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id && !window.matchMedia('(max-width: 720px)').matches) setPanelOpen(true);
    setFollowId((f) => (f && f !== id ? null : f));
  }, []);

  const focus = useCallback((id: string) => {
    select(id);
    mapRef.current?.flyTo(id);
  }, [select]);

  // The major island the selection belongs to, for the quick-select strip.
  const activeBodyId = (() => {
    if (!selectedId) return null;
    const id = selectedId.includes('/') ? selectedId.slice(0, selectedId.indexOf('/')) : selectedId;
    const body = world.bodies.find((b) => b.id === id);
    if (!body || body.kind === 'islet') return null;
    return body.kind === 'moon' ? body.parent!.id : body.id;
  })();

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
            layers={layers}
            onSelect={select}
            onFollowEnd={() => setFollowId(null)}
            onViewChange={setView}
            onCursor={setCursor}
            onShipping={setShipping}
            initialView={initialView}
            measure={measure}
            onHover={setHover}
            onMeasureTarget={(id) => setMeasure((m) => (m ? { ...m, to: id } : m))}
          />
          <MapTooltip world={world} t={t} shipping={shipping} hover={hover} from={measure ? (measure.to ? null : measure.from) : selectedId} />
          {measure && (
            <div className="measure-banner" role="status">
              <span>
                Measuring from <strong>{placeSummary(world, measure.from, shipping)?.title}</strong>
                {measure.to ? (
                  <>
                    {' '}
                    to <strong>{placeSummary(world, measure.to, shipping)?.title}</strong>: {measureBetween(world, measure.from, measure.to, t, shipping)}
                  </>
                ) : (
                  ' — click a place to measure to it'
                )}
              </span>
              <button onClick={() => setMeasure(null)} aria-label="Stop measuring">
                Done
              </button>
            </div>
          )}
          <div className="paper-grain" aria-hidden />

          <header className="cartouche">
            <a className="cartouche-back" href="#/">
              ← The Reference Shelf
            </a>
            <h1>
              <span className="cartouche-plate">Plate I</span> General Chart of the Orbital Ocean
            </h1>
            <p className="cartouche-authority">By authority of the Holy Purple Bureaucratic Empire</p>
          </header>

          <QuickSelect world={world} activeBodyId={activeBodyId} onPick={focus} />

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
            <button
              className={layersOpen ? 'active' : ''}
              onClick={() => setLayersOpen((o) => !o)}
              aria-label="Map layers"
              aria-expanded={layersOpen}
              title="Map layers (L)"
            >
              ☰
            </button>
          </div>
          {layersOpen && <LayersPanel layers={layers} onChange={setLayers} onClose={() => setLayersOpen(false)} />}

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
            shipping={layers.shipping ? shipping : null}
            onSelect={select}
            onFocus={focus}
            onMeasure={(id) => setMeasure({ from: id, to: null })}
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
          compact={compactTime}
          onCompactChange={setCompact}
        />
      </div>
    </div>
  );
}
