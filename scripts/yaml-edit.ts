import jsYaml from 'js-yaml';
import { isCollection, isMap, isScalar, isSeq, parseDocument, type Node, type YAMLMap, type YAMLSeq } from 'yaml';
import type { Edit, PathSegment } from '../src/lib/editing';

/**
 * Apply edits to YAML text by splicing the text itself, so everything not
 * edited — comments, alignment, quoting, key order — stays exactly as it was.
 *   set     replace a scalar, or a whole flow item ({…}); add a missing key to a map
 *   delete  remove a sequence item or a map key
 *   add     append an item to a sequence
 * Paths are keys and indices, or { key: value } to find a sequence item by a field.
 */

const flow = (v: unknown) => jsYaml.dump(v, { flowLevel: 0, lineWidth: -1, noCompatMode: true }).trim();

function lineStart(text: string, i: number) {
  return text.lastIndexOf('\n', i - 1) + 1;
}
function lineEnd(text: string, i: number) {
  const n = text.indexOf('\n', i);
  return n < 0 ? text.length : n + 1;
}

/** Turn {key: value} segments into indices, against the document. */
function resolve(doc: ReturnType<typeof parseDocument>, path: PathSegment[]): (string | number)[] {
  const out: (string | number)[] = [];
  let node: unknown = doc.contents;
  for (const seg of path) {
    if (typeof seg === 'object') {
      if (!isSeq(node)) throw new Error(`expected a list at ${out.join('.') || '(top)'}`);
      const [[k, v]] = Object.entries(seg);
      const i = (node as YAMLSeq).items.findIndex((it) => isMap(it) && String((it as YAMLMap).get(k)) === String(v));
      if (i < 0) throw new Error(`no item with ${k}: ${v} at ${out.join('.') || '(top)'}`);
      out.push(i);
      node = (node as YAMLSeq).items[i];
    } else {
      out.push(seg);
      node = isCollection(node) ? (node as YAMLMap | YAMLSeq).get(seg as never, true) : undefined;
    }
  }
  return out;
}

const nodeAt = (doc: ReturnType<typeof parseDocument>, path: (string | number)[]): Node | undefined =>
  (path.length ? doc.getIn(path, true) : doc.contents) as Node | undefined;

export function applyEdit(text: string, edit: Edit): string {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const path = resolve(doc, edit.path);

  if (edit.op === 'set') {
    const node = nodeAt(doc, path);
    if (node && node.range) {
      const [start, end] = node.range;
      if (isScalar(node)) return text.slice(0, start) + flow(edit.value) + text.slice(end);
      if (isCollection(node) && (node as YAMLMap).flow) return text.slice(0, start) + flow(edit.value) + text.slice(end);
      throw new Error(`can only replace a value or a {…} item at ${path.join('.')}`);
    }
    // A new key in a map.
    const key = path[path.length - 1];
    const parent = nodeAt(doc, path.slice(0, -1));
    if (!isMap(parent) || !parent.range) throw new Error(`no map at ${path.slice(0, -1).join('.')}`);
    const pair = `${key}: ${flow(edit.value)}`;
    if (parent.flow) {
      const close = text.lastIndexOf('}', parent.range[1]);
      const empty = !parent.items.length;
      return text.slice(0, close).replace(/\s*$/, '') + (empty ? '' : ', ') + pair + text.slice(close);
    }
    const last = parent.items[parent.items.length - 1];
    const lastNode = (last.value ?? last.key) as Node;
    const keyNode = parent.items[0].key as Node;
    const indent = keyNode.range![0] - lineStart(text, keyNode.range![0]);
    const at = lineEnd(text, lastNode.range![1] - 1);
    return text.slice(0, at) + ' '.repeat(indent) + pair + '\n' + text.slice(at);
  }

  if (edit.op === 'delete') {
    const parent = nodeAt(doc, path.slice(0, -1));
    const key = path[path.length - 1];
    if (isSeq(parent)) {
      const item = parent.items[key as number] as Node;
      if (!item?.range) throw new Error(`no item ${key}`);
      if (parent.flow) throw new Error('cannot delete from a [...] list');
      const from = lineStart(text, item.range[0]);
      const to = lineEnd(text, item.range[1] - 1);
      const rest = text.slice(0, from) + text.slice(to);
      // An emptied list becomes [].
      return parent.items.length === 1 ? setEmpty(rest, doc, path.slice(0, -1)) : rest;
    }
    if (isMap(parent)) {
      const i = parent.items.findIndex((p) => String(isScalar(p.key) ? p.key.value : p.key) === String(key));
      if (i < 0) return text; // nothing to delete
      const p = parent.items[i];
      const kr = (p.key as Node).range!;
      const vr = ((p.value as Node | null)?.range ?? kr)!;
      if (parent.flow) {
        // Remove "key: value" and one neighbouring comma.
        let from = kr[0];
        let to = vr[1];
        const after = text.slice(to).match(/^\s*,\s*/);
        if (after) to += after[0].length;
        else {
          const before = text.slice(0, from).match(/,\s*$/);
          if (before) from -= before[0].length;
        }
        return text.slice(0, from) + text.slice(to);
      }
      return text.slice(0, lineStart(text, kr[0])) + text.slice(lineEnd(text, vr[1] - 1));
    }
    throw new Error(`nothing to delete at ${path.join('.')}`);
  }

  // add
  const seq = nodeAt(doc, path);
  if (!seq || (path.length && !isSeq(seq)) || (!path.length && seq && !isSeq(seq))) throw new Error(`no list at ${path.join('.') || '(top)'}`);
  const item = flow(edit.value);
  if (isSeq(seq) && seq.items.length && !seq.flow) {
    const first = seq.items[0] as Node;
    const last = seq.items[seq.items.length - 1] as Node;
    const dashLine = lineStart(text, first.range![0]);
    const dash = text.indexOf('-', dashLine);
    const indent = dash - dashLine;
    const at = lineEnd(text, last.range![1] - 1);
    const head = text.slice(0, at);
    return head + (head.endsWith('\n') ? '' : '\n') + ' '.repeat(indent) + '- ' + item + '\n' + text.slice(at);
  }
  // An empty list (`[]`, or nothing at all): the first item, on its own line.
  if (isSeq(seq) && seq.range) {
    const indent = path.length ? 2 * path.length : 0;
    const [start, end] = seq.range;
    const before = text.slice(0, start).replace(/[ \t]*$/, '');
    return before + (path.length ? '\n' : '') + ' '.repeat(indent) + '- ' + item + text.slice(end).replace(/^[ \t]*\n?/, '\n');
  }
  return text.replace(/\s*$/, '\n') + '- ' + item + '\n';
}

function setEmpty(text: string, _doc: unknown, path: (string | number)[]): string {
  // Re-parse: if the list is now empty (null), write [] in its place.
  const doc = parseDocument(text);
  const node = nodeAt(doc, path);
  if (path.length === 0 && (node === null || node === undefined || (isScalar(node) && node.value === null))) return text.replace(/\s*$/, '\n') + '[]\n';
  if (path.length && (node === null || node === undefined || (isScalar(node) && node.value === null))) {
    const parent = nodeAt(doc, path.slice(0, -1));
    if (isMap(parent)) {
      const p = parent.items.find((it) => String(isScalar(it.key) ? it.key.value : it.key) === String(path[path.length - 1]));
      const k = (p?.key as Node | undefined)?.range;
      if (k) {
        const colon = text.indexOf(':', k[1]);
        return text.slice(0, colon + 1) + ' []' + text.slice(lineEnd(text, colon) - 1);
      }
    }
  }
  return text;
}

/** Apply several edits to one text in order. */
export function applyEdits(text: string, edits: Edit[]): string {
  let out = text;
  for (const e of edits) {
    out = applyEdit(out, e);
    const check = parseDocument(out);
    if (check.errors.length) throw new Error(`edit would break the file: ${check.errors[0].message}`);
  }
  return out;
}
