import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Calendar } from '../../../lib/calendar';
import type { EditRequest } from '../../../lib/editing';
import type { Point } from '../../../lib/orbits';
import { continentMap, findSettlement, hasContinentMap, type SettlementKind } from '../../../lib/terrain';
import { slug } from '../../../lib/terrain/names';
import type { Archipelago, Body, World } from '../../../lib/world';
import type { PlatformMotion } from '../../../lib/platforms';
import type { MapEditor } from '../AtlasMap';
import { editorApi } from './api';
import { PARAMETERS, paramValue, type ParamSpec } from './parameters';
import {
  addEdits,
  archipelagoSource,
  bodySource,
  canMove,
  deleteEdits,
  fieldEdit,
  moveEdits,
  placeIndex,
  placePlatform,
  platformRow,
  positionOf,
  type AddTool,
} from './edits';

/**
 * The Atlas editor (`npm run dev` only): move things by dragging them, add
 * places and platforms, edit fields in the gazetteer, tune parameters, and
 * regenerate. Every change is written straight into the data files, which
 * reload into the chart; Undo puts the files back.
 */

// ── A little shared state: undo list, what's happening, messages ─────────────

type State = { undo: string[]; busy: string | null; message: { text: string; error?: boolean } | null };
let state: State = { undo: [], busy: null, message: null };
const listeners = new Set<() => void>();
const setState = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};
const useEditorState = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );

let clearMessage: ReturnType<typeof setTimeout> | undefined;
function say(text: string, error = false) {
  setState({ message: { text, error } });
  clearTimeout(clearMessage);
  clearMessage = setTimeout(() => setState({ message: null }), error ? 9000 : 4000);
}

/** Send edits to the files; the edited world arrives by itself (live reload). */
async function run(req: EditRequest | null, after?: () => void): Promise<boolean> {
  if (!req) return false;
  setState({ busy: req.label });
  try {
    const s = await editorApi.edit(req);
    setState({ undo: s.undo });
    after?.();
    return true;
  } catch (e) {
    say(`${req.label}: ${(e as Error).message}`, true);
    setState({ busy: null });
    return false;
  }
}

async function regenerate(step: 'archipelagos' | 'places' | 'platforms' | 'all', ids: string[] = [], what: string = step) {
  if (!window.confirm(`Regenerate ${what}? This overwrites what is there now, edits included (Undo can put it back).`)) return;
  setState({ busy: `Regenerating ${what}…` });
  try {
    const s = await editorApi.seed(step, ids);
    setState({ undo: s.undo });
    say(s.log.join(' · '));
  } catch (e) {
    say(`Regenerate ${what}: ${(e as Error).message}`, true);
    setState({ busy: null });
  }
}

async function undo() {
  try {
    const s = await editorApi.undo();
    setState({ undo: s.undo, busy: s.undone ? `Undoing ${s.undone}` : null });
    if (!s.undone) say('Nothing to undo.');
  } catch (e) {
    say(`Undo: ${(e as Error).message}`, true);
  }
}

// ── The toolbar, on the chart ─────────────────────────────────────────────────

interface Props {
  world: World;
  calendar: Calendar;
  t: number;
  onSelect(id: string | null): void;
  onFocus(id: string): void;
  /** Hand the chart its editing behaviour (null when the editor closes). */
  onMapEditor(e: MapEditor | null): void;
  /** The chart forgets a dropped ghost (after a failed edit). */
  clearDrag(): void;
  onClose(): void;
}

const TOOLS: { tool: AddTool; label: string }[] = [
  { tool: 'city', label: 'City' },
  { tool: 'town', label: 'Town' },
  { tool: 'village', label: 'Village' },
  { tool: 'grand', label: 'Grand' },
  { tool: 'keep', label: 'Keep' },
];

export default function EditorUI(p: Props) {
  const { world, t } = p;
  const s = useEditorState();
  const [tool, setTool] = useState<AddTool | null>(null);
  const [panel, setPanel] = useState<'parameters' | 'warnings' | null>(null);

  // The edited world has arrived: whatever was being saved is done.
  useEffect(() => {
    setState({ busy: null });
  }, [world]);
  useEffect(() => {
    editorApi.status().then(
      (st) => setState({ undo: st.undo }),
      () => say('The editor needs `npm run dev`: its server is not answering.', true),
    );
  }, []);

  // Chart behaviour: drag to move, click to place.
  useEffect(() => {
    p.onMapEditor({
      canMove: (id) => canMove(world, id),
      onMove: (id, at: Point) => {
        run(moveEdits(world, id, at, t)).then((ok) => !ok && p.clearDrag());
      },
      placing: tool !== null,
      onPlace: (at: Point) => {
        if (!tool) return;
        const out = addEdits(world, tool, at, t);
        if ('error' in out) return say(out.error, true);
        run(out.request, () => p.onSelect(out.id));
      },
    });
  }, [world, t, tool]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => p.onMapEditor(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keys: Ctrl/⌘+Z undoes; Escape drops the tool; Delete removes the selection (handled in the panel).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'Escape' && tool) {
        e.stopPropagation();
        setTool(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool]);

  const warnings = useWarnings(world);

  return (
    <div className="editor-bar" role="toolbar" aria-label="Editor">
      <span className="editor-title">Editing</span>
      <div className="editor-tools" role="group" aria-label="Add">
        {TOOLS.map((x) => (
          <button key={x.tool} title={x.tool === 'grand' ? 'Add a grand platform' : x.tool === 'keep' ? 'Add a keep (platform)' : `Add a ${x.tool}`} className={tool === x.tool ? 'active' : ''} aria-pressed={tool === x.tool} onClick={() => setTool(tool === x.tool ? null : x.tool)}>
            + {x.label}
          </button>
        ))}
      </div>
      <button onClick={undo} disabled={!s.undo.length} title={s.undo.length ? `Undo: ${s.undo[s.undo.length - 1]} (Ctrl+Z)` : 'Nothing to undo'}>
        Undo{s.undo.length ? ` (${s.undo.length})` : ''}
      </button>
      <button className={panel === 'parameters' ? 'active' : ''} onClick={() => setPanel(panel === 'parameters' ? null : 'parameters')}>
        Parameters
      </button>
      <button className={`${panel === 'warnings' ? 'active' : ''} ${warnings.length ? 'warn' : ''}`} onClick={() => setPanel(panel === 'warnings' ? null : 'warnings')}>
        {warnings.length ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'No warnings'}
      </button>
      <button onClick={p.onClose} title="Stop editing (E)">
        Done
      </button>
      {(s.busy || s.message || tool) && (
        <p className={`editor-status${s.message?.error ? ' error' : ''}`} role="status">
          {s.busy ? `${s.busy}…` : s.message ? s.message.text : `Click ${tool === 'grand' || tool === 'keep' ? 'open water' : 'dry land'} to place a ${tool === 'grand' ? 'grand platform' : tool}. Esc to stop.`}
        </p>
      )}
      {panel === 'parameters' && <ParametersPanel world={world} onClose={() => setPanel(null)} />}
      {panel === 'warnings' && (
        <div className="editor-panel" role="dialog" aria-label="Warnings">
          <h3>Warnings</h3>
          {warnings.length ? (
            <ul className="editor-warnings">
              {warnings.map((w, i) => (
                <li key={i}>
                  {w.id ? (
                    <button className="link" onClick={() => p.onFocus(w.id!)}>
                      {w.text}
                    </button>
                  ) : (
                    w.text
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nothing in the data looks wrong.</p>
          )}
          <p className="hint">Only bodies whose maps are built are checked for misplaced places; the tests check them all.</p>
        </div>
      )}
    </div>
  );
}

/** What looks wrong in the data, with the thing to look at where it can be told. */
function useWarnings(world: World): { text: string; id?: string }[] {
  const [tick, setTick] = useState(0);
  // Maps build in the background: look again now and then.
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 3000);
    return () => clearInterval(id);
  }, []);
  return useMemo(() => {
    const out: { text: string; id?: string }[] = world.warnings.map((text) => {
      const pf = text.match(/^(\S+-[A-Z]-\d+)/)?.[1];
      return { text, id: pf && world.platformIndex.has(pf) ? pf : undefined };
    });
    for (const b of world.bodies) if (hasContinentMap(world, b)) for (const w of continentMap(world, b).warnings) out.push({ text: `${b.name}: ${w}`, id: b.id });
    return out;
  }, [world, tick]);
}

// ── Parameters ────────────────────────────────────────────────────────────────

function ParametersPanel({ world, onClose }: { world: World; onClose(): void }) {
  const groups = [...new Set(PARAMETERS.map((x) => x.group))];
  return (
    <div className="editor-panel params" role="dialog" aria-label="Parameters">
      <header>
        <h3>Parameters</h3>
        <button className="link" onClick={onClose}>
          Close
        </button>
      </header>
      {groups.map((g) => (
        <section key={g}>
          <h4>{g}</h4>
          {PARAMETERS.filter((x) => x.group === g).map((spec) => (
            <ParamRow key={spec.file + spec.path.join('.')} spec={spec} value={paramValue(world, spec)} />
          ))}
        </section>
      ))}
      <section>
        <h4>Regenerate</h4>
        <p className="hint">The seeding numbers above only take effect when you regenerate. Each overwrites what it makes, edits included.</p>
        <div className="editor-actions">
          <button onClick={() => regenerate('platforms', [], 'every platform (re-site by trade)')}>Re-site platforms</button>
          <button onClick={() => regenerate('places', [], 'every settlement')}>Regenerate all places</button>
          <button onClick={() => regenerate('archipelagos', [], 'the archipelagos and their places')}>Regenerate archipelagos</button>
        </div>
      </section>
    </div>
  );
}

function ParamRow({ spec, value }: { spec: ParamSpec; value: number }) {
  return (
    <label className="param-row" title={spec.hint}>
      <span>{spec.label}</span>
      <NumberField
        value={value}
        step={spec.step}
        min={spec.min}
        onCommit={(v) => run({ label: `${spec.label} = ${v}`, edits: [{ file: spec.file, op: 'set', path: spec.path, value: v }] })}
      />
    </label>
  );
}

// ── Fields: commit on Enter or leaving the field ──────────────────────────────

function NumberField({ value, onCommit, step, min }: { value: number; onCommit(v: number): void; step?: number; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (!Number.isFinite(v) || (min !== undefined && v < min)) return setText(String(value));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      value={text}
      step={step ?? 'any'}
      min={min}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function TextField({ value, onCommit, multiline }: { value: string; onCommit(v: string): void; multiline?: boolean }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() !== value) onCommit(text.trim());
  };
  return multiline ? (
    <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} onBlur={commit} />
  ) : (
    <input type="text" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="edit-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ── The gazetteer's Edit section, for the selection ───────────────────────────

const r = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

export function EditPanel({ world, calendar, t, selectedId, onSelect }: { world: World; calendar: Calendar; t: number; selectedId: string; onSelect(id: string | null): void }) {
  const body = world.bodies.find((b) => b.id === selectedId);
  const arch = world.archipelagos.find((a) => a.id === selectedId);
  const pfIndex = world.platformIndex.get(selectedId);
  const st = selectedId.includes('/') ? findSettlement(world, selectedId) : null;

  // Delete removes the selected place or platform.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const req = deleteEdits(world, selectedId);
        if (req) run(req, () => onSelect(null));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [world, selectedId, onSelect]);

  let content: ReactNode = null;
  if (st) content = <SettlementForm world={world} id={selectedId} onSelect={onSelect} />;
  else if (pfIndex !== undefined) content = <PlatformForm world={world} t={t} index={pfIndex} onSelect={onSelect} />;
  else if (arch) content = <ArchipelagoForm arch={arch} />;
  else if (body) content = <BodyForm body={body} calendar={calendar} />;
  if (!content) return null;
  return (
    <section className="edit-panel" aria-label="Edit">
      <h3>Edit</h3>
      {content}
    </section>
  );
}

function SettlementForm({ world, id, onSelect }: { world: World; id: string; onSelect(id: string | null): void }) {
  const where = placeIndex(world, id);
  const { body, settlement: s } = findSettlement(world, id)!;
  if (!where) return <p className="hint">{body.name}'s settlements are drawn in its design (continents/{body.id}.svg): edit them there.</p>;
  const file = `data/places/${body.id}.yaml`;
  const set = (key: string, value: unknown, label: string) =>
    run({ label, edits: [value === false ? { file, op: 'delete', path: [where.index, key] } : { file, op: 'set', path: [where.index, key], value }] });
  const row = world.places.get(body.id)![where.index];
  return (
    <>
      <Field label="Name">
        <TextField value={s.name} onCommit={(v) => v && set('name', v, `Rename ${s.name} to ${v}`).then((ok) => ok && onSelect(`${body.id}/${slug(v)}`))} />
      </Field>
      <Field label="Size">
        <select value={s.kind} onChange={(e) => set('kind', e.target.value as SettlementKind, `${s.name} becomes a ${e.target.value}`)}>
          <option value="city">City</option>
          <option value="town">Town</option>
          <option value="village">Village</option>
        </select>
      </Field>
      <Field label="Harbour">
        <input type="checkbox" checked={!!row.harbour} onChange={(e) => set('harbour', e.target.checked ? true : false, `${s.name} ${e.target.checked ? 'gets' : 'loses'} its harbour`)} />
      </Field>
      <p className="hint">Drag it on the chart to move it; its roads re-route.</p>
      <div className="editor-actions">
        <button className="danger" onClick={() => run(deleteEdits(world, id), () => onSelect(body.id))}>
          Delete {s.kind}
        </button>
      </div>
    </>
  );
}

function PlatformForm({ world, t, index, onSelect }: { world: World; t: number; index: number; onSelect(id: string | null): void }) {
  const p = world.platforms[index];
  const content = world.platformContent!;
  const row = platformRow(p);
  const save = (next: typeof row, label: string) => run({ label, edits: [{ file: 'data/platforms.yaml', op: 'set', path: [{ id: p.id }], value: next }] });
  const continents = world.bodies.filter((b) => b.kind === 'isle');
  return (
    <>
      <Field label="Class">
        <select value={row.class} onChange={(e) => save({ ...row, class: e.target.value }, `${p.id} becomes a ${e.target.value}`)}>
          {content.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Held by">
        <select value={row.owner} onChange={(e) => save({ ...row, owner: e.target.value }, `${p.id} passes to ${e.target.value}`)}>
          {content.owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Motion">
        <select
          value={row.motion}
          onChange={(e) => save(placePlatform(world, row, e.target.value as PlatformMotion, positionOf(world, p.id, t)!, t), `${p.id} becomes ${e.target.value}`)}
        >
          <option value="anchored">Anchored</option>
          <option value="lane">Lane about the centre</option>
          <option value="convoy">Convoy on a continent's orbit</option>
          <option value="ring">Ring about a continent</option>
        </select>
      </Field>
      {row.motion === 'convoy' && (
        <>
          <Field label="With">
            <select value={row.with} onChange={(e) => save({ ...row, with: e.target.value }, `${p.id} joins ${e.target.value}`)}>
              {continents.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Offset (°)">
            <NumberField value={row.offset ?? 0} onCommit={(v) => save({ ...row, offset: v }, `${p.id} offset ${v}°`)} />
          </Field>
        </>
      )}
      {(row.motion === 'lane' || row.motion === 'ring' || row.motion === 'anchored') && (
        <>
          <Field label={row.motion === 'ring' ? `Radius about ${p.parent!.name}` : 'Distance from centre'}>
            <NumberField value={row.radius ?? 0} min={0} onCommit={(v) => save({ ...row, radius: v }, `${p.id} radius ${v}`)} />
          </Field>
          <Field label={row.motion === 'anchored' ? 'Bearing (°)' : 'Bearing at day 0 (°)'}>
            <NumberField value={row.bearing ?? 0} onCommit={(v) => save({ ...row, bearing: v }, `${p.id} bearing ${v}°`)} />
          </Field>
        </>
      )}
      <p className="hint">Drag it on the chart to move it.</p>
      <div className="editor-actions">
        <button className="danger" onClick={() => run(deleteEdits(world, p.id), () => onSelect(null))}>
          Delete platform
        </button>
      </div>
    </>
  );
}

function BodyForm({ body, calendar }: { body: Body; calendar: Calendar }) {
  const src = bodySource(body);
  const set = (key: string, value: unknown, label = `${body.name}: ${key}`) => run({ label, edits: [fieldEdit(src, key, value)] });
  const orbiting = body.kind === 'isle' || body.kind === 'moon';
  const years = body.kind === 'isle';
  return (
    <>
      <Field label="Name">
        <TextField value={body.name} onCommit={(v) => v && set('name', v, `Rename ${body.name} to ${v}`)} />
      </Field>
      {body.kind !== 'islet' && (
        <Field label="Short name">
          <TextField value={body.shortName === body.name ? '' : body.shortName} onCommit={(v) => set('short_name', v || null)} />
        </Field>
      )}
      <Field label="Radius (IL)">
        <NumberField value={body.radius} min={0.5} onCommit={(v) => set('radius', v)} />
      </Field>
      {orbiting && (
        <>
          <Field label={`Orbit radius (IL from ${body.parent!.name})`}>
            <NumberField value={body.orbitRadius} min={0} onCommit={(v) => set('orbit_radius', v)} />
          </Field>
          <Field label="Bearing at day 0 (°)">
            <NumberField value={r(body.bearing, 2)} onCommit={(v) => set('bearing', v)} />
          </Field>
          <Field label={years ? 'Period (years)' : 'Period (days)'}>
            <NumberField
              value={years ? r(body.periodDays / calendar.yearLength, 3) : r(body.periodDays, 2)}
              min={0.01}
              onCommit={(v) =>
                run({
                  label: `${body.name}: period`,
                  edits: [fieldEdit(src, years ? 'period_days' : 'period_years', null), fieldEdit(src, years ? 'period_years' : 'period_days', v)],
                })
              }
            />
          </Field>
        </>
      )}
      <Field label="Coastline seed">
        <span className="edit-inline">
          <NumberField value={body.seed} onCommit={(v) => set('seed', Math.round(v))} />
          <button title="A new coastline" onClick={() => set('seed', Math.floor(Math.random() * 1e6), `${body.name}: new coastline`)}>
            Reroll
          </button>
        </span>
      </Field>
      {body.kind !== 'islet' && (
        <Field label="Description">
          <TextField multiline value={body.description ?? ''} onCommit={(v) => set('description', v || null)} />
        </Field>
      )}
      <p className="hint">{body.kind === 'central' ? 'The Land of the Large stays at the centre.' : body.archipelago ? 'Drag it to move it within its archipelago.' : 'Drag it on the chart to change its orbit.'}</p>
      <div className="editor-actions">
        <button onClick={() => regenerate('places', [body.id], `the places on ${body.name}`)}>Regenerate places here</button>
      </div>
    </>
  );
}

function ArchipelagoForm({ arch }: { arch: Archipelago }) {
  const src = archipelagoSource(arch);
  const set = (key: string, value: unknown, label = `${arch.name}: ${key}`) => run({ label, edits: [fieldEdit(src, key, value)] });
  return (
    <>
      <Field label="Name">
        <TextField value={arch.name} onCommit={(v) => v && set('name', v, `Rename ${arch.name} to ${v}`)} />
      </Field>
      <Field label="Orbit radius (IL)">
        <NumberField value={r(arch.orbitRadius)} min={0} onCommit={(v) => set('orbit_radius', v)} />
      </Field>
      <Field label="Bearing at day 0 (°)">
        <NumberField value={r(arch.bearing, 2)} onCommit={(v) => set('bearing', v)} />
      </Field>
      <Field label="Settled when regenerating">
        <input type="checkbox" checked={arch.populated} onChange={(e) => set('populated', e.target.checked)} />
      </Field>
      <p className="hint">Drag it (zoomed out) to move the whole group; zoom in to move its islands.</p>
      <div className="editor-actions">
        <button onClick={() => regenerate('places', [arch.id], `the places of ${arch.name}`)}>Regenerate places here</button>
      </div>
    </>
  );
}
