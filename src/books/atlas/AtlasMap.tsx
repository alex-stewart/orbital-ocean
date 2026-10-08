import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { screenToWorld, zoomAbout, type View } from '../../lib/camera';
import { generateIsland, type IslandShape } from '../../lib/coastline';
import { positionsAt, type Point } from '../../lib/orbits';
import type { World } from '../../lib/world';
import { render, type HitTarget } from './render';

export interface AtlasMapHandle {
  zoomBy(factor: number): void;
  reset(): void;
  flyTo(id: string): void;
}

interface Props {
  world: World;
  t: number;
  selectedId: string | null;
  followId: string | null;
  onSelect(id: string | null): void;
  onFollowEnd(): void;
  onViewChange(view: View): void;
  onCursor(p: Point | null): void;
}

/** Most zoomed-in scale, pixels per IL. */
const MAX_SCALE = 40;
/** Exponential smoothing rate for zoom/fly animation, per second. */
const EASE = 11;

export const AtlasMap = forwardRef<AtlasMapHandle, Props>(function AtlasMap(props, ref) {
  const { world } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;

  const shapes = useMemo(() => {
    const m = new Map<string, IslandShape>();
    for (const b of world.bodies) {
      const central = b.kind === 'central';
      m.set(b.id, generateIsland(b.seed, { roughness: central ? 0.22 : 0.42, resolution: central ? 2048 : 720 }));
    }
    return m;
  }, [world]);

  // Mutable rendering state lives outside React to keep interaction at 60fps.
  const st = useRef({
    w: 0,
    h: 0,
    dpr: 1,
    view: { cx: 0, cy: 0, scale: 0.05 } as View,
    target: { cx: 0, cy: 0, scale: 0.05 } as View,
    anchor: null as null | { sx: number; sy: number; wx: number; wy: number },
    velocity: { x: 0, y: 0 },
    hits: [] as HitTarget[],
    hoveredId: null as string | null,
    dirty: true,
    frame: 0,
    last: 0,
    initialised: false,
  });

  const minScale = () => {
    const s = st.current;
    return Math.min(s.w, s.h) / 2 / (world.extent * 1.2);
  };
  const fitView = (): View => ({ cx: 0, cy: 0, scale: minScale() });
  const clampScale = (x: number) => Math.min(MAX_SCALE, Math.max(minScale() * 0.8, x));

  const requestFrame = () => {
    const s = st.current;
    s.dirty = true;
    if (!s.frame) {
      s.last = performance.now();
      s.frame = requestAnimationFrame(tick);
    }
  };

  const tick = (now: number) => {
    const s = st.current;
    s.frame = 0;
    const dt = Math.min(0.05, (now - s.last) / 1000);
    s.last = now;
    let animating = false;
    const p = latest.current;

    // Follow a body: keep the target centred on it.
    const positions = positionsAt(world.bodies, p.t);
    if (p.followId) {
      const fp = positions.get(p.followId);
      if (fp) {
        s.target.cx = fp.x;
        s.target.cy = fp.y;
        s.anchor = null;
      }
    }

    // Inertial panning after a fling.
    if (Math.hypot(s.velocity.x, s.velocity.y) > 0.01) {
      s.view.cx -= (s.velocity.x * dt) / s.view.scale;
      s.view.cy -= (s.velocity.y * dt) / s.view.scale;
      s.target.cx = s.view.cx;
      s.target.cy = s.view.cy;
      const decay = Math.exp(-dt * 5);
      s.velocity.x *= decay;
      s.velocity.y *= decay;
      if (Math.hypot(s.velocity.x, s.velocity.y) < 8) s.velocity = { x: 0, y: 0 };
      animating = true;
    }

    // Ease the view towards its target, zooming in log-space.
    const k = 1 - Math.exp(-EASE * dt);
    const ls = Math.log(s.view.scale);
    const lt = Math.log(s.target.scale);
    if (Math.abs(lt - ls) > 1e-4) {
      s.view.scale = Math.exp(ls + (lt - ls) * k);
      animating = true;
    } else s.view.scale = s.target.scale;
    if (s.anchor) {
      // Keep the zoom anchor pinned under the cursor while the scale eases.
      s.view.cx = s.anchor.wx - (s.anchor.sx - s.w / 2) / s.view.scale;
      s.view.cy = s.anchor.wy - (s.anchor.sy - s.h / 2) / s.view.scale;
      if (s.view.scale === s.target.scale) s.anchor = null;
    } else {
      const dx = s.target.cx - s.view.cx;
      const dy = s.target.cy - s.view.cy;
      if (Math.hypot(dx, dy) * s.view.scale > 0.2) {
        s.view.cx += dx * k;
        s.view.cy += dy * k;
        animating = true;
      } else {
        s.view.cx = s.target.cx;
        s.view.cy = s.target.cy;
      }
    }
    // Never drift far beyond the edge of the ocean.
    const limit = world.extent * 1.3;
    const d = Math.hypot(s.view.cx, s.view.cy);
    if (d > limit) {
      s.view.cx *= limit / d;
      s.view.cy *= limit / d;
      s.target.cx = s.view.cx;
      s.target.cy = s.view.cy;
    }

    const ctx = canvasRef.current?.getContext('2d');
    if (ctx && s.w > 0) {
      s.hits = render(ctx, {
        world,
        shapes,
        positions,
        t: p.t,
        view: s.view,
        width: s.w,
        height: s.h,
        dpr: s.dpr,
        selectedId: p.selectedId,
        hoveredId: s.hoveredId,
      });
      p.onViewChange({ ...s.view });
    }
    s.dirty = false;
    if (animating) requestFrame();
  };

  // Redraw whenever inputs from React change.
  useEffect(requestFrame, [props.t, props.selectedId, props.followId, world, shapes]);

  const flyTo = (id: string) => {
    const s = st.current;
    const body = world.bodies.find((b) => b.id === id);
    const p = positionsAt(world.bodies, latest.current.t).get(id);
    if (!body || !p) return;
    s.anchor = null;
    s.velocity = { x: 0, y: 0 };
    // Frame the island and its moons with room to spare.
    const span = Math.max(body.radius * 2.5, body.radius * 1.5 + Math.max(0, ...body.moons.map((m) => m.orbitRadius)) * 1.25);
    s.target = { cx: p.x, cy: p.y, scale: clampScale(Math.min(s.w, s.h) / 2 / span) };
    requestFrame();
  };

  useImperativeHandle(ref, () => ({
    zoomBy(factor) {
      const s = st.current;
      s.velocity = { x: 0, y: 0 };
      const w = screenToWorld(s.view, s.w, s.h, s.w / 2, s.h / 2);
      s.target = { ...s.target, scale: clampScale(s.target.scale * factor) };
      s.anchor = latest.current.followId ? null : { sx: s.w / 2, sy: s.h / 2, wx: w.x, wy: w.y };
      requestFrame();
    },
    reset() {
      const s = st.current;
      latest.current.onFollowEnd();
      s.anchor = null;
      s.velocity = { x: 0, y: 0 };
      s.target = fitView();
      requestFrame();
    },
    flyTo,
  }));

  // Canvas sizing.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const s = st.current;
      const { width, height } = entry.contentRect;
      s.w = width;
      s.h = height;
      s.dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * s.dpr);
      canvas.height = Math.round(height * s.dpr);
      if (!s.initialised && width > 0) {
        s.view = fitView();
        s.target = { ...s.view };
        s.initialised = true;
      }
      requestFrame();
    });
    ro.observe(canvas);
    // Canvas text needs the web fonts loaded before it can use them.
    Promise.all(
      ['500 15px "Cormorant SC"', '600 19px "Cormorant SC"', 'italic 13px "Cormorant Garamond"', 'italic 600 14px "Cormorant Garamond"'].map(
        (f) => document.fonts.load(f),
      ),
    ).then(requestFrame, () => undefined);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(st.current.frame);
      st.current.frame = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer interaction: drag to pan (with inertia), wheel/pinch to zoom,
  // click to select, double-click to zoom in or fly to an island.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let dragged = false;
    let downAt = { x: 0, y: 0 };
    let pinch: { dist: number; scale: number; wx: number; wy: number } | null = null;
    let samples: { x: number; y: number; t: number }[] = [];

    const local = (e: { clientX: number; clientY: number }) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hitAt = (x: number, y: number) => {
      let best: HitTarget | null = null;
      let bestD = Infinity;
      for (const h of st.current.hits) {
        const d = Math.hypot(h.x - x, h.y - y);
        if (d <= Math.max(h.r, 8) + 6 && d - h.r < bestD) {
          best = h;
          bestD = d - h.r;
        }
      }
      return best;
    };
    const stopFollow = () => {
      if (latest.current.followId) latest.current.onFollowEnd();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = st.current;
      const p = local(e);
      s.velocity = { x: 0, y: 0 };
      // Trackpad pinch arrives as ctrl+wheel with small deltas.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp((-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0022)));
      const scale = clampScale(s.target.scale * factor);
      if (latest.current.followId) {
        s.target.scale = scale;
      } else {
        const w = screenToWorld(s.view, s.w, s.h, p.x, p.y);
        s.anchor = { sx: p.x, sy: p.y, wx: w.x, wy: w.y };
        s.target = { ...zoomAbout(s.view, s.w, s.h, p.x, p.y, scale) };
      }
      requestFrame();
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      st.current.velocity = { x: 0, y: 0 };
      if (pointers.size === 1) {
        dragged = false;
        downAt = p;
        samples = [{ ...p, t: performance.now() }];
      } else if (pointers.size === 2) {
        const s = st.current;
        const [a, b] = [...pointers.values()];
        const anchor = screenToWorld(s.view, s.w, s.h, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: s.view.scale, wx: anchor.x, wy: anchor.y };
        dragged = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      const s = st.current;
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      latest.current.onCursor(screenToWorld(s.view, s.w, s.h, p.x, p.y));

      if (!prev) {
        const hit = hitAt(p.x, p.y);
        const id = hit?.id ?? null;
        canvas.style.cursor = id ? 'pointer' : 'grab';
        if (id !== s.hoveredId) {
          s.hoveredId = id;
          requestFrame();
        }
        return;
      }
      pointers.set(e.pointerId, p);

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const scale = clampScale((pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist);
        // Keep the map point first pinched pinned under the fingers' midpoint.
        s.view = { scale, cx: pinch.wx - (mid.x - s.w / 2) / scale, cy: pinch.wy - (mid.y - s.h / 2) / scale };
        s.target = { ...s.view };
        s.anchor = null;
        stopFollow();
        requestFrame();
        return;
      }

      if (!dragged && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
      if (!dragged) stopFollow();
      dragged = true;
      canvas.style.cursor = 'grabbing';
      s.view.cx -= (p.x - prev.x) / s.view.scale;
      s.view.cy -= (p.y - prev.y) / s.view.scale;
      s.target = { ...s.target, cx: s.view.cx, cy: s.view.cy };
      s.anchor = null;
      const now = performance.now();
      samples.push({ ...p, t: now });
      samples = samples.filter((q) => now - q.t < 90);
      requestFrame();
    };

    const onUp = (e: PointerEvent) => {
      const s = st.current;
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      // Lifting one finger of a pinch leaves a one-finger drag in progress.
      if (pointers.size > 0) return;
      canvas.style.cursor = 'grab';
      if (!dragged) {
        latest.current.onSelect(hitAt(p.x, p.y)?.id ?? null);
        return;
      }
      const first = samples[0];
      const last = samples[samples.length - 1];
      if (first && last && last.t - first.t > 10) {
        const dt = (last.t - first.t) / 1000;
        s.velocity = { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
        if (Math.hypot(s.velocity.x, s.velocity.y) < 150) s.velocity = { x: 0, y: 0 };
        requestFrame();
      }
    };

    const onDouble = (e: MouseEvent) => {
      const s = st.current;
      const p = local(e);
      const hit = hitAt(p.x, p.y);
      if (hit) {
        latest.current.onSelect(hit.id);
        flyTo(hit.id);
        return;
      }
      stopFollow();
      const w = screenToWorld(s.view, s.w, s.h, p.x, p.y);
      const scale = clampScale(s.target.scale * (e.shiftKey ? 1 / 2.5 : 2.5));
      s.anchor = { sx: p.x, sy: p.y, wx: w.x, wy: w.y };
      s.target = zoomAbout(s.view, s.w, s.h, p.x, p.y, scale);
      requestFrame();
    };

    const onLeave = () => {
      latest.current.onCursor(null);
      if (st.current.hoveredId) {
        st.current.hoveredId = null;
        requestFrame();
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('dblclick', onDouble);
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', onDouble);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="atlas-canvas"
      aria-label="Map of the Orbital Ocean. Drag to pan, scroll to zoom, click an island for details."
      role="img"
    />
  );
});
