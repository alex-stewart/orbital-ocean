import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import type { EditRequest, EditorStatus } from '../src/lib/editing';
import { applyEdits } from './yaml-edit';

/**
 * The Atlas editor's server side, part of `npm run dev` only (never built).
 * It writes your edits into the data and parameter files under src/, which
 * Vite then reloads into the open Atlas:
 *   POST /__editor/edit   { label, edits }   apply edits (see src/lib/editing.ts)
 *   POST /__editor/undo                      put back the files as before the last change
 *   POST /__editor/seed   { step, ids }      regenerate (scripts/seed-lib.ts)
 *   GET  /__editor/status                    what can be undone
 * Only files under src/data and src/parameters can be touched.
 */

type Snapshot = Map<string, string | null>;

const MAX_UNDO = 100;

export function atlasEditor(): Plugin {
  const undo: { label: string; files: Snapshot }[] = [];
  let root = process.cwd();

  const src = (file: string) => {
    const path = normalize(join(root, 'src', file));
    const rel = relative(join(root, 'src'), path);
    if (rel.startsWith('..') || !/^(data|parameters)[\\/][\w./\\-]+\.(yaml|svg)$/.test(rel)) throw new Error(`not an editable file: ${file}`);
    return path;
  };
  const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
  const write = (path: string, text: string | null) => {
    if (text === null) {
      if (existsSync(path)) rmSync(path);
    } else {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  };
  /** Every editable file's text, for undoing a regeneration. */
  const snapshotAll = (): Snapshot => {
    const out: Snapshot = new Map();
    const walk = (dir: string) => {
      if (!existsSync(dir)) return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.yaml')) out.set(p, readFileSync(p, 'utf8'));
      }
    };
    walk(join(root, 'src/data'));
    walk(join(root, 'src/parameters'));
    return out;
  };
  const remember = (label: string, files: Snapshot) => {
    undo.push({ label, files });
    if (undo.length > MAX_UNDO) undo.shift();
  };
  const status = (): EditorStatus => ({ undo: undo.map((u) => u.label) });

  const body = (req: IncomingMessage) =>
    new Promise<unknown>((resolve, reject) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
  const send = (res: ServerResponse, code: number, payload: unknown) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  };

  const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse) => {
    const url = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && url === '/status') return send(res, 200, status());
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });

    if (url === '/edit') {
      const { label, edits } = (await body(req)) as EditRequest;
      // Work out every file's new text first; write nothing if any edit fails.
      const before: Snapshot = new Map();
      const after = new Map<string, string>();
      for (const e of edits) {
        const path = src(e.file);
        if (!before.has(path)) before.set(path, read(path));
        const text = after.get(path) ?? before.get(path) ?? e.create;
        if (text == null) throw new Error(`${e.file} does not exist`);
        after.set(path, applyEdits(text, [e]));
      }
      for (const [path, text] of after) write(path, text);
      remember(label, before);
      return send(res, 200, status());
    }

    if (url === '/undo') {
      const last = undo.pop();
      if (last) for (const [path, text] of last.files) write(path, text);
      return send(res, 200, { ...status(), undone: last?.label ?? null });
    }

    if (url === '/seed') {
      const { step, ids } = (await body(req)) as { step: string; ids?: string[] };
      const before = snapshotAll();
      const { seed, STEPS } = (await server.ssrLoadModule('/scripts/seed-lib.ts')) as typeof import('./seed-lib');
      if (!STEPS.includes(step as never)) throw new Error(`unknown seed step ${step}`);
      const log = seed(root, step as never, ids ?? []);
      // Files the seed created have no "before": undo removes them.
      const created = snapshotAll();
      for (const path of created.keys()) if (!before.has(path)) before.set(path, null);
      remember(`Regenerate ${step}${ids?.length ? ` (${ids.join(', ')})` : ''}`, before);
      return send(res, 200, { ...status(), log });
    }
    return send(res, 404, { error: 'unknown editor request' });
  };

  return {
    name: 'atlas-editor',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/__editor', (req, res) => {
        handle(server, req, res).catch((e: unknown) => send(res, 400, { error: e instanceof Error ? e.message : String(e) }));
      });
    },
  };
}
