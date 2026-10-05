import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDeliveryArchive, revisionBundle } from './asset-delivery.mjs';
import { hydrateAssetSources } from './hydrate-asset-sources.mjs';
import { hashBytes } from './mirror-core.mjs';

test('hydration validates the complete selected history before writing any source', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-hydrate-'));
  try {
    const source = Buffer.from('return 1;');
    const manifest = { assetId: 'crate', revisionId: 'r_current', files: { 'source.kiln.js': { bytes: source.length, sha256: `sha256:${hashBytes(source)}` } } };
    const bytes = buildDeliveryArchive({ group: 'farm', profile: 'editable', files: { 'revisions/project/crate/r_current.zip': revisionBundle({ manifest, files: { 'source.kiln.js': source } }) } });
    await writeFile(join(root, 'editable.zip'), bytes);
    const catalog = { groups: { farm: { downloads: [{ profile: 'editable', path: 'editable.zip', bytes: bytes.length, sha256: hashBytes(bytes) }], assets: [{ collection: 'project', assetId: 'crate', includedRevisions: ['r_current', 'r_missing'] }] } } };
    const directory = join(root, 'restored'); await mkdir(directory);
    await expect(hydrateAssetSources({ catalog, group: 'farm', directory, mirror: root })).rejects.toThrow('inventory');
    expect(await readdir(directory)).toEqual([]);
    catalog.groups.farm.assets[0].includedRevisions = ['r_current'];
    expect(await hydrateAssetSources({ catalog, group: 'farm', directory, mirror: root })).toEqual([{ collection: 'project', assetId: 'crate', revisionId: 'r_current' }]);
    expect(await readFile(join(directory, 'assets/kiln/crate/revisions/r_current/source.kiln.js'), 'utf8')).toBe('return 1;');
    const manifestPath = join(directory, 'assets/kiln/crate/revisions/r_current/manifest.json');
    const reordered = JSON.stringify(Object.fromEntries(Object.entries(manifest).reverse()));
    await writeFile(manifestPath, reordered);
    await hydrateAssetSources({ catalog, group: 'farm', directory, mirror: root });
    expect(await readFile(manifestPath, 'utf8')).toBe(reordered);
    const sourcePath = join(directory, 'assets/kiln/crate/revisions/r_current/source.kiln.js');
    await writeFile(sourcePath, 'existing edited source');
    await expect(hydrateAssetSources({ catalog, group: 'farm', directory, mirror: root })).rejects.toThrow('Existing revision differs');
    expect(await readFile(sourcePath, 'utf8')).toBe('existing edited source');
  } finally { await rm(root, { recursive: true, force: true }); }
});
