import type { World } from '../../lib/world';

interface Props {
  world: World;
  /** The body selected, or that the selection belongs to (a moon's or a town's body). */
  activeBodyId: string | null;
  onPick(id: string): void;
}

/**
 * The major islands in order outward from the centre, grouped by band:
 * one click to fly to any of them.
 */
export function QuickSelect({ world, activeBodyId, onPick }: Props) {
  const majors = world.bodies.filter((b) => b.kind !== 'moon');
  const bandOf = (r: number) => world.bands.find((b) => r >= b.innerRadius && r < b.outerRadius);
  const groups = world.bands.map((band) => ({
    band,
    bodies: majors.filter((b) => bandOf(b.parent ? b.orbitRadius : 0)?.id === band.id),
  }));

  return (
    <nav className="quick-select" aria-label="Major islands">
      {groups.map(({ band, bodies }) =>
        bodies.length ? (
          <div key={band.id} className="qs-group" role="group" aria-label={band.name}>
            <span className="qs-band">{band.name.replace(/^The /, '').replace(/ Band$/, '')}</span>
            {bodies.map((b) => (
              <button
                key={b.id}
                className={`qs-chip${b.id === activeBodyId ? ' active' : ''}${b.kind === 'central' ? ' central' : ''}`}
                onClick={() => onPick(b.id)}
                title={`${b.name}${b.position ? ` — ${b.position} of 16` : ''}`}
                aria-pressed={b.id === activeBodyId}
              >
                {b.position !== null && <span className="qs-pos">{b.position}</span>}
                <span className="qs-name">{b.name.replace(/^Continent /, 'C. ')}</span>
              </button>
            ))}
          </div>
        ) : null,
      )}
    </nav>
  );
}
