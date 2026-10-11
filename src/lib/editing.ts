/**
 * Edits the Atlas's editor (development only) asks its server to make to the
 * data and parameter files. The server applies them to the text itself
 * (scripts/yaml-edit.ts), so comments and layout survive.
 */

/** A key, a list index, or { field: value } to pick a list item by a field. */
export type PathSegment = string | number | Record<string, string>;

export interface Edit {
  /** Relative to src/: data/world.yaml, data/places/<id>.yaml, parameters/shipping.yaml… */
  file: string;
  op: 'set' | 'delete' | 'add';
  path: PathSegment[];
  value?: unknown;
  /** For a file that may not exist yet: its text to start from. */
  create?: string;
}

export interface EditRequest {
  /** What the change was, for the undo list. */
  label: string;
  edits: Edit[];
}

export interface EditorStatus {
  /** Labels of changes that can be undone, latest last. */
  undo: string[];
}
