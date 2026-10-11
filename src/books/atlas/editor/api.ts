import type { EditRequest, EditorStatus } from '../../../lib/editing';

/** Talking to the editor's server (scripts/editor-plugin.ts; `npm run dev` only). */

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/__editor/${path}`, {
    method: body === undefined && path === 'status' ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const out = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? res.statusText);
  return out;
}

export const editorApi = {
  status: () => call<EditorStatus>('status'),
  edit: (req: EditRequest) => call<EditorStatus>('edit', req),
  undo: () => call<EditorStatus & { undone: string | null }>('undo', {}),
  seed: (step: 'archipelagos' | 'places' | 'platforms' | 'all', ids: string[] = []) => call<EditorStatus & { log: string[] }>('seed', { step, ids }),
};
