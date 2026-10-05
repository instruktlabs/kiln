import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { unzipSync } from 'fflate';

export const ASSET_BASE = 'https://assets.kilnstudio.tools/';
export const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function assetPath(path) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') || path.includes(':') || path.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Unsafe asset path: ${path}`);
  }
  return path;
}
export function verifyBytes(bytes, record, name = record.path) {
  const actual = hashBytes(bytes);
  if (actual !== record.sha256.replace(/^sha256:/, '') || bytes.length !== record.bytes) {
    throw new Error(`SHA-256/size verification failed for ${name}: expected ${record.sha256} / ${record.bytes} bytes, received ${actual} / ${bytes.length} bytes`);
  }
  return bytes;
}
export async function fetchPinnedFile(record, { mirror = process.env.KILN_ASSET_MIRROR, cache, base = ASSET_BASE } = {}) {
  const path = assetPath(record.path);
  if (!cache) throw new Error('A local cache directory is required');
  const target = join(cache, path);
  try {
    verifyBytes(await readFile(target), record, path);
    return target;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let bytes;
  if (mirror) {
    try { bytes = await readFile(join(mirror, path)); }
    catch (error) { throw new Error(`Required mirror asset is unavailable: ${path}. Check KILN_ASSET_MIRROR or set KILN_SITE_PACKS=0 for the pre-upload build.`, { cause: error }); }
  } else {
    try {
      const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new Error(`Required public asset is unavailable: ${new URL(path, base)}. Set KILN_ASSET_MIRROR to a verified local mirror, or KILN_SITE_PACKS=0 before the R2 upload.`, { cause: error });
    }
  }
  verifyBytes(bytes, record, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return target;
}

/**
 * Which seal an archive carries, from where it sits in the mirror: a saved revision's editable archive (the
 * bridge's under `standalone/`, each vehicle's in an `editable/` directory) is sealed by its own revision
 * `manifest.json`; every pack archive is sealed by a `delivery.json` inventory.
 */
export const archiveProfile = (path) => (path.startsWith('standalone/') || path.split('/').includes('editable') ? 'editable' : 'delivery');

/** Only data pinned by the outer manifest is accepted; every inner file is sealed too. */
export function verifyArchive(bytes, profile = 'delivery') {
  const files = unzipSync(bytes);
  for (const path of Object.keys(files)) assetPath(path);
  const deliveryEnvelope = profile === 'editable' && files['delivery.json']
    && JSON.parse(new TextDecoder().decode(files['delivery.json'])).profile === 'editable';
  const manifestPath = profile === 'editable' && !deliveryEnvelope
    ? Object.keys(files).find((path) => path.endsWith('/manifest.json'))
    : 'delivery.json';
  if (!manifestPath || !files[manifestPath]) throw new Error(`Archive lacks ${profile === 'editable' ? 'revision manifest.json' : 'delivery.json'}`);
  const manifest = JSON.parse(new TextDecoder().decode(files[manifestPath]));
  if (!manifest.files || typeof manifest.files !== 'object') throw new Error('Archive manifest has no file seals');
  const prefix = profile === 'editable' && !deliveryEnvelope ? manifestPath.slice(0, -'manifest.json'.length) : '';
  const sealed = new Set([manifestPath]);
  for (const [relativePath, record] of Object.entries(manifest.files)) {
    const path = `${prefix}${assetPath(relativePath)}`;
    if (!files[path]) throw new Error(`Sealed archive member is missing: ${path}`);
    verifyBytes(files[path], record, path);
    sealed.add(path);
  }
  for (const path of Object.keys(files)) {
    if (!path.endsWith('/') && !sealed.has(path)) throw new Error(`Unsealed archive member: ${path}`);
  }
  return { files, manifest, prefix };
}
