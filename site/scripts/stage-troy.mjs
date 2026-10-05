import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetPath, fetchPinnedFile, verifyArchive } from './mirror-core.mjs';

/** Reproducible public staging from the same sealed archive offered for download. */
export async function stageTroy({ site = resolve(import.meta.dirname, '..'), record, mirror } = {}) {
  if (['0','false'].includes(process.env.KILN_SITE_PACKS ?? '1')) return { skipped: true };
  record ??= JSON.parse(await readFile(resolve(site, 'src/data/troy-delivery.json'), 'utf8'));
  if (!/^[a-z0-9-]+$/.test(record.release)) throw new Error('Invalid Troy release');
  const file = await fetchPinnedFile(record, { mirror, cache: resolve(site, '.cache/troy') });
  const { files, manifest } = verifyArchive(await readFile(file));
  if (manifest.release !== record.release) throw new Error('Troy release differs from its archive');
  if (!files['web/index.html']) throw new Error('Troy browser entry is missing');
  const base = `/scene-packs/troy/${record.release}/`;
  const target = resolve(site, 'public', base.slice(1));
  for (const [path, bytes] of Object.entries(files)) {
    assetPath(path);
    if (path.endsWith('/')) continue;
    const destination = resolve(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  return { base, url: `${base}web/index.html`, release: record.release, sha256: record.sha256 };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await stageTroy({ mirror: process.env.KILN_ASSET_MIRROR })));
}
