import { useLayoutEffect, useRef, useState } from 'react';
import type { World } from '../../lib/world';

interface Props {
  world: World;
  /** The body selected, or that the selection belongs to (a moon's or a town's body). */
  activeBodyId: string | null;
  onPick(id: string): void;
}

/**
 * How much each chip says. The strip tries each in turn and keeps the first
 * that fits, so it copes with any number of islands and any length of name.
 */
const MODES = ['full', 'short', 'numbers'] as const;
type Mode = (typeof MODES)[number];

/**
 * The major islands in order outward from the centre, grouped by band:
 * one click to fly to any of them.
 */
export function QuickSelect({ world, activeBodyId, onPick }: Props) {
  const majors = world.bodies.filter((b) => b.kind === 'central' || b.kind === 'isle');
  const bandOf = (r: number) => world.bands.find((b) => r >= b.innerRadius && r < b.outerRadius);
  const groups = world.bands.map((band) => ({
    band,
    bodies: majors.filter((b) => bandOf(b.parent ? b.orbitRadius : 0)?.id === band.id),
  }));

  const nav = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>('full');
  const [overflowing, setOverflowing] = useState(false);
  const [width, setWidth] = useState(0);

  // Whenever the space changes (or a selection changes the active chip's width),
  // start again from full names, then step down until the strip fits. Layout
  // effects run before paint, so the in-between states are never seen.
  const key = `${width}|${activeBodyId}`;
  const measuredFor = useRef('');
  useLayoutEffect(() => {
    if (measuredFor.current !== key) {
      measuredFor.current = key;
      if (mode !== 'full') {
        setMode('full');
        return;
      }
    }
    const el = nav.current;
    if (!el) return;
    const fits = el.scrollWidth <= el.clientWidth + 1;
    if (!fits && mode !== 'numbers') setMode(MODES[MODES.indexOf(mode) + 1]);
    else setOverflowing(!fits);
  }, [key, mode]);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={nav} className={`quick-select mode-${mode}${overflowing ? ' overflowing' : ''}`} aria-label="Major islands">
      {groups.map(({ band, bodies }) =>
        bodies.length ? (
          <div key={band.id} className="qs-group" role="group" aria-label={band.name}>
            <span className="qs-band">{band.name.replace(/^The /, '').replace(/ Band$/, '')}</span>
            {bodies.map((b) => {
              const active = b.id === activeBodyId;
              // In number mode the active island still shows its (short) name.
              const label = mode === 'full' ? b.name : mode === 'short' || active ? b.shortName : null;
              return (
                <button
                  key={b.id}
                  className={`qs-chip${active ? ' active' : ''}${b.kind === 'central' ? ' central' : ''}`}
                  onClick={() => onPick(b.id)}
                  title={`${b.name}${b.position ? ` — ${b.position} of 16` : ''}`}
                  aria-label={b.name}
                  aria-pressed={active}
                >
                  {b.position !== null && <span className="qs-pos">{b.position}</span>}
                  {label && <span className="qs-name">{label}</span>}
                </button>
              );
            })}
          </div>
        ) : null,
      )}
    </nav>
  );
}
