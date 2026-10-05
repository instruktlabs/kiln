import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { alignTroyInventory } from './troy-inventory.mjs';

const fixture = () => {
  const pin = { slug: 'wooden-horse', collection: 'project', assetId: 'wooden-horse', revisionId: 'r_child', includedRevisions: ['r_child', 'r_parent'], missingParents: [], runtimeDownload: { url: 'https://assets.kilnstudio.tools/packs/troy/delivery/models/wooden-horse.glb', bytes: 42, sha256: 'a'.repeat(64) }, editableDownload: { url: 'https://assets.kilnstudio.tools/packs/troy/delivery/editable/wooden-horse.zip', bytes: 99, sha256: 'b'.repeat(64) } };
  const manifest = { assetId: pin.assetId, revisionId: pin.revisionId, parentRevision: 'r_parent', name: 'Trojan horse', createdAt: '2026-10-05T00:00:00.000Z', tags: ['troy'], description: 'Connected ears', files: { 'asset.glb': { bytes: 42, sha256: 'sha256:' + 'a'.repeat(64) } } };
  return { inventory: { generated: '2026-10-05', assets: [{ slug: pin.slug, revisionId: 'r_parent', glb: 'https://kilnstudio.tools/scene-packs/troy/old/models/wooden-horse.glb', poster: 'https://kilnstudio.tools/scene-packs/troy/old/media/wooden-horse.webp', license: 'CC0-1.0' }] }, catalog: { release: 'troy-20261005-06', assets: [{ slug: pin.slug, assetId: pin.assetId, revisionId: pin.revisionId, category: 'Buildings', metrics: { triangles: 12 }, runtimeDownload: pin.runtimeDownload, poster: { src: '/scene-packs/troy/troy-20261005-06/media/wooden-horse.webp' } }] }, group: { assets: [pin] }, manifests: new Map([[pin.slug, manifest]]) };
};

test('selects canonical current revision, R2 runtime pins and current scene posters without mutating inputs', () => {
  const input = fixture(), original = structuredClone(input.inventory);
  const result = alignTroyInventory(input), row = result.assets[0];
  expect(row.revisionId).toBe('r_child');
  expect(row.collection).toBe('project');
  expect(row.source).toBe('sources/project/wooden-horse/r_child/source.kiln.js');
  expect(row.manifest).toBe('sources/project/wooden-horse/r_child/manifest.json');
  expect(row.includedRevisions).toEqual(['r_child', 'r_parent']);
  expect(row.parentRevision).toBe('r_parent');
  expect(row.glb).toBe(input.group.assets[0].runtimeDownload.url);
  expect(row.glbSha256).toBe('a'.repeat(64));
  expect(row.glbBytes).toBe(42);
  expect(row.poster).toBe('https://kilnstudio.tools/scene-packs/troy/troy-20261005-06/media/wooden-horse.webp');
  expect(input.inventory).toEqual(original);
});

test('rejects omitted or duplicate assets and inconsistent revision and binary pins', () => {
  const missing = fixture(); missing.catalog.assets = [];
  expect(() => alignTroyInventory(missing)).toThrow('inventory');
  const duplicate = fixture(); duplicate.group.assets.push(duplicate.group.assets[0]);
  expect(() => alignTroyInventory(duplicate)).toThrow('duplicate');
  const stale = fixture(); stale.catalog.assets[0].revisionId = 'r_parent';
  expect(() => alignTroyInventory(stale)).toThrow('identity');
  const badSeal = fixture(); badSeal.manifests.get('wooden-horse')!.files['asset.glb'].bytes = 41;
  expect(() => alignTroyInventory(badSeal)).toThrow('GLB');
});

test('checked-in Troy inventory matches all selected canonical sources and published URLs', async () => {
  const json = async (relative: string) => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
  const inventory = await json('../../packs/troy/inventory.json');
  const catalog = await json('../src/data/troy.json');
  const group = (await json('../src/data/asset-delivery.json')).groups.troy;
  expect(inventory.assets).toHaveLength(21);
  for (const row of inventory.assets) {
    const pin = group.assets.find((item: any) => item.slug === row.slug);
    const asset = catalog.assets.find((item: any) => item.slug === row.slug);
    expect(row.glb).toBe(pin.runtimeDownload.url);
    expect(row.poster).toBe(new URL(asset.poster.src, 'https://kilnstudio.tools').href);
    const base = `sources/${pin.collection}/${pin.assetId}/${pin.revisionId}`;
    expect(row.source).toBe(`${base}/source.kiln.js`);
    expect(row.manifest).toBe(`${base}/manifest.json`);
    const manifest = await json(`../../packs/troy/${row.manifest}`);
    expect(manifest.assetId).toBe(row.assetId);
    expect(manifest.revisionId).toBe(row.revisionId);
    expect(await readFile(new URL(`../../packs/troy/${row.source}`, import.meta.url), 'utf8')).toBe(await readFile(new URL(`../../packs/troy/assets/${row.slug}.kiln.js`, import.meta.url), 'utf8'));
  }
});
