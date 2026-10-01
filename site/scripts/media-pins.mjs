import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * Helpers for adding a file to the Commons media set the way the pipeline expects it: the file lives in the
 * mirror directory (KILN_ASSET_MIRROR), its path, size and SHA-256 are pinned in src/data/mirror-manifest.json
 * (the upload set for the owner's later R2 step), and scripts/fetch-mirror.mjs turns image pins into the
 * responsive variants named by src/data/commons-build.json. Nothing here uploads anything.
 */

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** A mirror-relative path that stays inside the mirror: no absolute path, no `..`, no backslash. */
export function mirrorPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '..' || part === '' || part === '.')) {
    throw new Error(`Unsafe mirror path: ${path}`);
  }
  return path;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Replace the entry whose `key` matches, or append; the rest of the list keeps its order. */
export function upsertBy(list, key, entry) {
  const index = list.findIndex((candidate) => candidate[key] === entry[key]);
  if (index < 0) return [...list, entry];
  return list.map((candidate, position) => (position === index ? entry : candidate));
}

/**
 * Make the entries whose `key` starts with `prefix` exactly `next`: entries that stay keep their place, stale
 * ones go, new ones are appended. A repeated run therefore leaves the list byte for byte as it was.
 */
export function syncGroup(list, key, prefix, next) {
  const wanted = new Set(next.map((entry) => entry[key]));
  let result = list.filter((entry) => !String(entry[key] ?? '').startsWith(prefix) || wanted.has(entry[key]));
  for (const entry of next) result = upsertBy(result, key, entry);
  return result;
}

/** Remove every entry whose `key` value starts with `prefix`. */
export function removeUnder(list, key, prefix) {
  return list.filter((candidate) => !String(candidate[key] ?? '').startsWith(prefix));
}

/** Write `bytes` at `mirror/path` and return its pin record. */
export async function writeMirrorFile(mirror, path, bytes) {
  const target = join(resolve(mirror), mirrorPath(path));
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return { path, bytes: bytes.length, sha256: sha256Hex(bytes) };
}

/** Pin one mirror file in a manifest object (replacing an earlier pin of the same path). */
export function pinInManifest(manifest, record) {
  return { ...manifest, files: upsertBy(manifest.files, 'path', { path: record.path, bytes: record.bytes, sha256: record.sha256 }) };
}

/** Write the file into the mirror and pin it in `manifestFile`; returns the pin. */
export async function pinMirrorFile({ mirror, manifestFile, path, bytes }) {
  const record = await writeMirrorFile(mirror, path, bytes);
  await writeJson(manifestFile, pinInManifest(await readJson(manifestFile), record));
  return record;
}
