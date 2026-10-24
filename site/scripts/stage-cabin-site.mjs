import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDeliveryArchive } from './asset-delivery.mjs';
import { assetPath, fetchPinnedFile, hashBytes, verifyArchive } from './mirror-core.mjs';

/**
 * The Cabin Woods pack's site files (`/asset-demos/cabin-woods-psx-horror/`: downloads, models, sources and the scene),
 * staged reproducibly from one sealed archive pinned in `src/data/cabin-woods-site.json`, as Troy's scene is. A clean
 * checkout then builds the same pages; the staged folder stays ignored by Git.
 *
 *   node scripts/stage-cabin-site.mjs                                      stage for a build
 *   node scripts/stage-cabin-site.mjs --pack DIR --mirror DIR --release ID  seal DIR into the mirror and print its pin
 */

export const CABIN_SITE_ID = 'cabin-woods-psx-horror';
const BASE = `asset-demos/${CABIN_SITE_ID}`;

async function listFiles(root, dir = root, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in Cabin site files: ${path}`);
    if (entry.isDirectory()) await listFiles(root, path, out);
    else out.push(path.slice(root.length + 1).split(sep).join('/'));
  }
  return out.sort();
}

/** Seal a staged Cabin site folder into one deterministic archive under the mirror; immutable once written. */
export async function packCabinSite({ source, mirror, release }) {
  if (!source || !mirror || !/^[a-z0-9-]+$/.test(release ?? '')) throw new Error('Explicit source, mirror and safe release are required');
  const files = {};
  for (const path of await listFiles(resolve(source))) files[assetPath(path)] = await readFile(join(source, path));
  const bytes = buildDeliveryArchive({ profile: 'runtime', group: `${CABIN_SITE_ID}-site`, files });
  const path = `packs/${CABIN_SITE_ID}/${release}/${CABIN_SITE_ID}-site.zip`;
  const target = join(mirror, path);
  try { if (!(await readFile(target)).equals(bytes)) throw new Error(`Existing archive differs: ${path}; use a new release`); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return { release, path, bytes: bytes.length, sha256: hashBytes(bytes), files: Object.keys(files).length };
}

async function sameTree(target, files) {
  let present;
  try { present = await listFiles(target); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  const expected = Object.keys(files).sort();
  if (present.length !== expected.length || present.some((path, i) => path !== expected[i])) return false;
  for (const path of expected) if (!(await readFile(join(target, path))).equals(files[path])) return false;
  return true;
}

export async function stageCabinSite({ site = resolve(import.meta.dirname, '..'), record, mirror, enabled = !['0', 'false'].includes(process.env.KILN_SITE_PACKS ?? '1') } = {}) {
  if (!enabled) return { skipped: true };
  record ??= JSON.parse(await readFile(resolve(site, 'src/data/cabin-woods-site.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(resolve(site, `src/data/${CABIN_SITE_ID}.json`), 'utf8'));
  if (record.release !== catalog.release) throw new Error(`Cabin site archive release ${record.release} differs from the catalog's ${catalog.release}`);
  const file = await fetchPinnedFile(record, { mirror, cache: resolve(site, '.cache/cabin-site') });
  const files = Object.fromEntries(Object.entries(verifyArchive(await readFile(file)).files).filter(([path]) => path !== 'delivery.json' && !path.endsWith('/')));
  const target = resolve(site, 'public', BASE);
  if (await sameTree(target, files)) return { release: record.release, files: Object.keys(files).length, unchanged: true };
  // Earlier or hand-made staging is kept, never deleted.
  const history = resolve(site, '.cache/cabin-site/staged-history');
  try {
    await mkdir(history, { recursive: true });
    await rename(target, join(history, randomUUID()));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const [path, bytes] of Object.entries(files)) {
    const destination = resolve(target, assetPath(path));
    if (!destination.startsWith(target + sep)) throw new Error(`Cabin site path escaped its folder: ${path}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  return { release: record.release, files: Object.keys(files).length, unchanged: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--pack')) console.log(JSON.stringify(await packCabinSite({ source: option('--pack'), mirror: option('--mirror'), release: option('--release') }), null, 2));
  else console.log(JSON.stringify(await stageCabinSite({ mirror: process.env.KILN_ASSET_MIRROR })));
}
