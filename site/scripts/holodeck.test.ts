import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import selection from '../../packs/holodeck/selection.json';
import catalog from '../src/data/holodeck.json';
import worlds from '../src/data/holodeck-worlds.json';
import mirror from '../src/data/mirror-manifest.json';
import plan from '../src/data/commons-build.json';
import rigPosters from '../src/data/rig-posters.json';
import { HOLODECK_SITE } from '../src/lib/config';
import { buildGallery } from '../src/lib/gallery';
import { holodeckScenes, holodeckWorldUrl } from '../src/lib/holodeck';
import { HOLODECK_ASSETS, HOLODECK_PACKS, holodeckSlug } from './holodeck-spec.mjs';
import { holodeckPrefix } from './stage-holodeck.mjs';
import { ASSET_BASE } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';

const ROOT = resolve(import.meta.dir, '../..');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pins = new Map(mirror.files.map((record) => [record.path, record]));

test('each scene pack holds every placed Kiln asset once, at its final version', () => {
  expect(Object.fromEntries(Object.entries(selection.packs).map(([id, pack]) => [id, pack.assets.length]))).toEqual({ 'holodeck-tidemark': 23, 'holodeck-courtyard': 32, 'holodeck-cove': 8 });
  expect(catalog.packs.map((pack) => [pack.id, pack.assetCount])).toEqual(HOLODECK_PACKS.map((pack) => [pack.id, pack.expectedAssets]));
  expect(selection.versions).toBe('final-only');
  expect(catalog.assets).toHaveLength(47);
  expect(catalog.assets).toHaveLength(Object.keys(selection.assets).length);
  const shared = catalog.assets.filter((asset) => asset.packs.length > 1);
  expect(shared.map((asset) => asset.slug).sort()).toEqual(Object.keys(HOLODECK_ASSETS).filter((slug) => slug.startsWith('cove-')).sort());
  for (const asset of shared) expect(asset.packs).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard']);
  expect(holodeckSlug('holodeck-courtyard', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-cove', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-tidemark', 'island-palm')).toBe('island-palm');
});

test('every scene places the Cove modules at their final revision, read from the walkable sources', () => {
  const tidemark = selection.packs['holodeck-tidemark'].source, cove = selection.packs['holodeck-cove'].source;
  expect(tidemark).toMatchObject({ kind: 'holodeck-example', path: 'examples/tidemark', commit: cove.commit });
  for (const pack of [...Object.values(selection.packs), ...catalog.packs]) expect(pack).not.toHaveProperty('sceneStillPlacesEarlier');
  for (const slug of selection.packs['holodeck-cove'].assets) {
    const record = selection.assets[slug as keyof typeof selection.assets];
    expect(record.placements.map((placement) => placement.pack)).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard']);
  }
});

test('catalog assets name the selected revisions and stay awaiting owner review under CC0', async () => {
  expect(selection.licence).toBe('CC0-1.0');
  expect(catalog.licence.spdx).toBe('CC0-1.0');
  for (const asset of catalog.assets) {
    const chosen = selection.assets[asset.slug as keyof typeof selection.assets];
    expect(asset.assetId).toBe(chosen.assetId);
    expect(asset.revisionId).toBe(chosen.revisionId);
    expect(asset.sourceSha256).toBe(chosen.source.sha256);
    expect(asset.review).toEqual({ ownerAccepted: false, status: 'awaiting-owner-review' });
    expect(sha256(await readFile(join(ROOT, asset.sourcePath)))).toBe(asset.sourceSha256);
  }
  for (const pack of catalog.packs) expect(pack.available).toBe(false);
});

test('every staged download and viewer model is pinned for the asset host at its own URL', () => {
  const prefix = holodeckPrefix(catalog.release);
  const downloads = [
    ...catalog.assets.flatMap((asset) => [asset.runtimeModelDownload, asset.runtimeDownload, asset.editableDownload]),
    ...catalog.packs.flatMap((pack) => pack.downloads),
  ];
  for (const download of downloads) {
    expect(download.path.startsWith(prefix)).toBe(true);
    expect(download.url).toBe(ASSET_BASE + download.path);
    expect(pins.get(download.path)).toEqual({ path: download.path, bytes: download.bytes, sha256: download.sha256 });
  }
  for (const asset of catalog.assets) expect(plan.viewerModels).toContain(asset.runtimeModelDownload.path);
});

test('every Holodeck card has a rig poster of its exact runtime model, planned for the build', () => {
  expect(() => applyRigPosters(catalog.assets.map((asset) => ({ ...asset, poster: null })), 'holodeck', rigPosters, { required: true })).not.toThrow();
  for (const asset of catalog.assets) {
    expect(asset.poster?.sourceRevisionId).toBe(asset.revisionId);
    expect(pins.has(asset.poster!.inputPath)).toBe(true);
    expect(plan.images.some((image) => image.inputPath === asset.poster!.inputPath)).toBe(true);
  }
});

test('walkable scene addresses come from one map and fall back to the Holodeck site', () => {
  expect(holodeckWorldUrl('holodeck-tidemark')).toBe('https://holodeck.kilnstudio.tools/worlds/tidemark/');
  expect(holodeckWorldUrl('holodeck-crescent-cove')).toBe('https://holodeck.kilnstudio.tools/worlds/crescent-cove/');
  expect(holodeckWorldUrl('not-a-pack')).toBe(worlds.site);
  for (const pack of catalog.packs) expect(Object.keys(worlds.worlds)).toContain(pack.id);
});

test('gallery cards link to their pages and to every scene that places them', () => {
  const cards = buildGallery(true).filter((card) => card.packs.some((pack) => pack.startsWith('holodeck-')));
  expect(cards).toHaveLength(catalog.assets.length);
  for (const card of cards) {
    expect(card.href).toBe(`/gallery/holodeck/${card.slug}/`);
    expect(card.scenes?.map((scene) => scene.href)).toEqual(card.packs.map((pack) => holodeckWorldUrl(pack)));
  }
  const shared = cards.find((card) => card.slug === 'cove-hearth')!;
  expect(holodeckScenes(shared).map((scene) => scene.label)).toEqual(['Walk Cove', 'Walk Tidemark Island', 'Walk Courtyard']);
  expect(buildGallery(false)).toEqual([]);
});

test('the primary navigation has one Holodeck link, to the site the scene links use', async () => {
  const layout = await readFile(resolve(import.meta.dir, '../src/layouts/BaseLayout.astro'), 'utf8');
  expect(layout.match(/href=\{HOLODECK_SITE\}/g)).toHaveLength(1);
  expect(layout).not.toContain('["Holodeck"');
  expect(worlds.site).toBe(HOLODECK_SITE);
});
