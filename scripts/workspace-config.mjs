/** Shared configuration edits for local project integrations. Never writes files. */
import { isDeepStrictEqual } from 'node:util';
import { applyEdits, getNodeValue, modify, parseTree } from 'jsonc-parser';
import { parse as parseToml } from 'smol-toml';

const maxLength = 2 * 1024 * 1024;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const conflict = (path) =>
  new Error(`Configuration conflict at ${path.join('.')}; no files were changed.`);

function checkPath(path) {
  if (
    !Array.isArray(path) ||
    !path.length ||
    path.length > 16 ||
    path.some(
      (part) => typeof part !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(part) || forbidden.has(part),
    )
  )
    throw new Error('Invalid configuration path.');
}

function checkText(text, kind) {
  if (typeof text !== 'string' || text.length > maxLength)
    throw new Error(`Invalid ${kind} configuration.`);
}

function jsonTree(text, comments) {
  checkText(text, 'JSON');
  try {
    const errors = [];
    const root = parseTree(text, errors, {
      disallowComments: !comments,
      allowTrailingComma: comments,
    });
    if (errors.length || root?.type !== 'object') throw new Error();
    let count = 0;
    const visit = (node, depth = 0) => {
      if (++count > 100000 || depth > 64) throw new Error();
      if (node.type === 'object') {
        const keys = new Set();
        for (const property of node.children ?? []) {
          const key = property.children[0].value;
          if (keys.has(key)) throw new Error();
          keys.add(key);
        }
      }
      for (const child of node.children ?? []) visit(child, depth + 1);
    };
    visit(root);
    return root;
  } catch {
    // Parser messages can include source lines containing user credentials.
    throw new Error('Invalid JSON configuration.');
  }
}

function jsonEntry(root, path) {
  let node = root;
  for (const part of path) {
    if (node === undefined) return undefined;
    if (node.type !== 'object') throw conflict(path);
    node = node.children?.find((property) => property.children[0].value === part)?.children[1];
  }
  return node;
}

function jsonValue(value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || !isDeepStrictEqual(JSON.parse(serialized), value))
      throw new Error();
    jsonTree(`{"value":${serialized}}`, false);
    return value;
  } catch {
    throw new Error('Invalid configuration value.');
  }
}

function equalJson(a, b) {
  if (Object.is(a, b)) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && equalJson(a[key], b[key]))
  );
}

function checkOwnedNumbers(node, path) {
  if (
    node.type === 'number' &&
    (!Number.isFinite(node.value) ||
      (Number.isInteger(node.value) && !Number.isSafeInteger(node.value)))
  )
    throw conflict(path);
  for (const child of node.children ?? []) checkOwnedNumbers(child, path);
}

/** Apply non-overlapping owned entries; unrelated JSON bytes are not reserialized. */
export function mergeJsonConfig(text, changes, { comments = false } = {}) {
  checkText(text, 'JSON');
  if (!Array.isArray(changes) || changes.length > 64)
    throw new Error('Invalid configuration edits.');
  for (const change of changes) {
    checkPath(change?.path);
    jsonValue(change.value);
    if (Object.hasOwn(change, 'previous')) jsonValue(change.previous);
  }
  for (let i = 0; i < changes.length; i++)
    for (let j = i + 1; j < changes.length; j++) {
      const a = changes[i].path,
        b = changes[j].path;
      if (a.slice(0, Math.min(a.length, b.length)).every((part, k) => part === b[k]))
        throw new Error('Overlapping configuration edits.');
    }
  let result = text.trim() ? text : `${text}{}\n`;
  let root = jsonTree(result, comments);
  for (const change of changes) {
    const node = jsonEntry(root, change.path);
    if (node !== undefined) {
      checkOwnedNumbers(node, change.path);
      const current = getNodeValue(node);
      if (equalJson(current, change.value)) continue;
      if (!Object.hasOwn(change, 'previous') || !equalJson(current, change.previous))
        throw conflict(change.path);
    }
    // No whole-document formatter: preserve comments, large numbers and unrelated bytes.
    result = applyEdits(result, modify(result, change.path, change.value, {}));
    root = jsonTree(result, comments);
  }
  return result;
}

function toml(text) {
  checkText(text, 'TOML');
  try {
    return parseToml(text, { integersAsBigInt: true });
  } catch {
    throw new Error('Invalid TOML configuration.');
  }
}

function entry(root, path) {
  let value = root;
  for (const part of path) {
    if (!object(value)) throw conflict(path);
    if (!Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}

function withoutEntry(root, path) {
  const result = { ...root };
  const [key, ...rest] = path;
  if (Object.hasOwn(result, key)) {
    if (!rest.length) delete result[key];
    else {
      result[key] = withoutEntry(result[key], rest);
      if (!Object.keys(result[key]).length) delete result[key];
    }
  }
  return result;
}

function fragmentValue(fragment, path) {
  const parsed = toml(fragment);
  const value = entry(parsed, path);
  if (
    !object(value) ||
    !Object.keys(value).length ||
    Object.keys(withoutEntry(parsed, path)).length
  )
    throw new Error('Invalid managed TOML fragment.');
  return value;
}

function markerLines(text, marker) {
  const offsets = [];
  let offset = 0;
  for (const line of text.split('\n')) {
    if (line.replace(/\r$/, '') === marker) offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}

/** TOML is preserved verbatim outside a validated, exclusively owned table block. */
export function mergeTomlConfig(text, { path, fragment, previous } = {}) {
  checkPath(path);
  const original = toml(text);
  const desired = fragmentValue(fragment, path);
  if (previous !== undefined) fragmentValue(previous, path);
  const start = `# BEGIN KILN ${JSON.stringify(path)}`;
  const end = `# END KILN ${JSON.stringify(path)}`;
  const starts = markerLines(text, start),
    ends = markerLines(text, end);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const block = (value) =>
    `${start}${newline}${value.replace(/\r\n/g, '\n').trim().replace(/\n/g, newline)}${newline}${end}${newline}`;
  let prefix = text,
    suffix = '',
    base = original;
  if (starts.length || ends.length) {
    if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) throw conflict(path);
    const afterLine = text.indexOf('\n', ends[0]);
    const after = afterLine < 0 ? text.length : afterLine + 1;
    if (text.slice(starts[0], after) !== block(previous ?? fragment)) throw conflict(path);
    prefix = text.slice(0, starts[0]);
    suffix = text.slice(after);
    base = toml(prefix + suffix);
    if (
      entry(base, path) !== undefined ||
      !isDeepStrictEqual(entry(original, path), fragmentValue(previous ?? fragment, path)) ||
      !isDeepStrictEqual(withoutEntry(original, path), withoutEntry(base, path))
    )
      throw conflict(path);
  } else {
    if (entry(original, path) !== undefined) throw conflict(path);
    if (prefix && !prefix.endsWith('\n')) prefix += newline;
  }
  const result = prefix + block(fragment) + suffix;
  const parsed = toml(result);
  if (
    !isDeepStrictEqual(entry(parsed, path), desired) ||
    !isDeepStrictEqual(withoutEntry(parsed, path), withoutEntry(base, path))
  )
    throw conflict(path);
  return result;
}
