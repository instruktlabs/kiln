import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { collectCathedralGallery, stageCathedralGallery } from './stage-cathedral-gallery.mjs';

const sha = 'a'.repeat(64);
const pin = {
  id: 'bench', name: 'Square bench', collectionId: 'project', workspace: 'cathedral-square',
  assetId: 'a_fixture', revisionId: 'r_fixture', sha256: sha, bytes: 42, instances: 10,
};
const pack = {
  id: 'cathedral-square', release: 'cs2',
  models: [{ id: pin.id, path: 'models/bench.glb' }],
  files: [{ path: 'models/bench.glb', sha256: sha, bytes: pin.bytes }],
};
const integration = {
  artifactSha256: sha,
  bounds: { size: [1, 2, 3] },
  renderMetrics: { triangles: 12, uniqueMaterials: 1 },
};
const read = async () => ({
  manifest: {
    name: 'Saved fixture', assetId: pin.assetId, revisionId: pin.revisionId, editable: true,
    attribution: { model: 'fixture' }, files: { 'asset.glb': { sha256: 'sha256:' + sha, bytes: pin.bytes } },
    build: { integration },
  },
});

test('gallery projection preserves the selected scene asset, model and attribution', async () => {
  const catalog = await collectCathedralGallery([pin], pack, read);
  expect(catalog.release).toBe('cs2');
  expect(catalog.assets).toMatchObject([{
    slug: pin.id, assetId: pin.assetId, revisionId: pin.revisionId, instances: 10,
    attribution: { model: 'fixture' }, metrics: { triangles: 12, materials: 1, bounds: [1, 2, 3] },
    runtimeModelDownload: { member: 'models/bench.glb', bytes: pin.bytes, sha256: sha },
  }]);
});

test('gallery projection rejects changed pack bytes, another revision and incomplete inventory', async () => {
  await expect(collectCathedralGallery([pin], { ...pack, files: [{ ...pack.files[0], sha256: 'b'.repeat(64) }] }, read)).rejects.toThrow('sealed scene model');
  await expect(collectCathedralGallery([pin], pack, async () => {
    const record = await read();
    return { ...record, manifest: { ...record.manifest, revisionId: 'r_different' } };
  })).rejects.toThrow('saved revision');
  await expect(collectCathedralGallery([pin, pin], pack, read)).rejects.toThrow('inventory');
});

test('delivery review output cannot be staged under site public', async () => {
  await expect(stageCathedralGallery({ reviewOut: fileURLToPath(new URL('../public/gallery-review', import.meta.url)) })).rejects.toThrow('review directory');
});

test('checked-in catalog covers exactly the authored scene manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../scenes/packages/cathedral-square/ASSET-MANIFEST.json', import.meta.url), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('../src/data/packs/cathedral-square.json', import.meta.url), 'utf8'));
  expect(catalog.assets).toHaveLength(22);
  expect(catalog.assets.map(asset => [asset.slug, asset.assetId, asset.revisionId, asset.runtimeModelDownload.sha256, asset.runtimeModelDownload.bytes]))
    .toEqual(manifest.assets.map(asset => [asset.id, asset.assetId, asset.revisionId, asset.sha256, asset.bytes]));
  expect(manifest.assets.every(asset => asset.galleryPage === `/gallery/cathedral-square/${asset.id}/` && !asset.alreadyInGallery)).toBe(true);
});


test('Cathedral Square has one linked gallery card per asset and stays out of packs-off builds', async () => {
  const { buildGallery } = await import('../src/lib/gallery');
  const { cathedralGalleryAssets, cathedralModelUrl, cathedralPack } = await import('../src/lib/cathedral-gallery');
  const { browseGallery } = await import('../src/lib/gallery-browse');
  const assets = cathedralGalleryAssets(true);
  const cards = browseGallery(buildGallery(true), { pack: 'cathedral-square' });
  expect(cards).toHaveLength(22);
  expect(cathedralGalleryAssets(false)).toEqual([]);
  expect(buildGallery(false)).toEqual([]);
  const expected = assets.map((asset) => `/gallery/cathedral-square/${asset.slug}/`);
  expect(cards.map((card) => card.href).sort()).toEqual(expected.sort());
  for (const asset of assets) {
    expect(cathedralModelUrl(asset)).toBe(`/scene-packs/cathedral-square/${cathedralPack.release}/models/${asset.slug}.glb?revision=${asset.revisionId}`);
    expect(cards.find((card) => card.slug === asset.slug)?.scenes).toEqual([
      { label: 'Explore Cathedral Square', href: '/scenes/cathedral-square/' },
    ]);
  }
});

test('each exact Cathedral Square revision has a GPU rig poster, source download and licence coverage', async () => {
  const { default: catalog } = await import('../src/data/packs/cathedral-square.json');
  const { default: delivery } = await import('../src/data/asset-delivery.json');
  const { default: posters } = await import('../src/data/rig-posters.json');
  const { default: mirror } = await import('../src/data/mirror-manifest.json');
  const { default: rights } = await import('../../packs/cathedral-square/rights.json');
  const { default: plan } = await import('../src/data/commons-build.json');
  const group = delivery.groups['cathedral-square'];
  expect(catalog.license.spdx).toBe('CC0-1.0');
  expect(group.assets).toHaveLength(22);
  expect(group.downloads.map((download) => download.profile)).toEqual(['runtime', 'editable']);
  const pins = new Map(mirror.files.map((pin) => [pin.path, pin]));
  for (const asset of catalog.assets) {
    const record = (posters.posters as Record<string, any>)[`cathedral-square:${asset.slug}`]!;
    expect(record).toMatchObject({
      assetId: asset.assetId, revisionId: asset.revisionId,
      glb: { sha256: asset.runtimeModelDownload.sha256, bytes: asset.runtimeModelDownload.bytes },
    });
    expect(record.rendererId).toBeTruthy();
    expect(asset.poster.inputPath).toBe(record.path);
    expect(plan.images.some((image) => image.inputPath === record.path)).toBe(true);
    expect(pins.get(record.path)).toMatchObject({ bytes: record.bytes, sha256: record.sha256 });
    const rightsPin = rights.pins.find((pin) => pin.id === asset.slug)!;
    expect(rightsPin.source.sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(rightsPin.source.bytes).toBeGreaterThan(0);
    expect(rightsPin).toMatchObject({
      assetId: asset.assetId, revisionId: asset.revisionId, sha256: asset.runtimeModelDownload.sha256,
    });
    const downloads = group.assets.find((item) => item.slug === asset.slug)!;
    expect(downloads.includedRevisions).toEqual([asset.revisionId]);
    expect(downloads.runtimeDownload.sha256).toBe(asset.runtimeModelDownload.sha256);
    for (const file of [downloads.runtimeDownload, downloads.editableDownload]) {
      expect(pins.get(file.path)).toMatchObject({ bytes: file.bytes, sha256: file.sha256 });
    }
  }
});
