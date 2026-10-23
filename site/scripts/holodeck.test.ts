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
import { HOLODECK_APPROVAL, HOLODECK_ASSETS, HOLODECK_PACKS, holodeckApproved, holodeckSlug } from './holodeck-spec.mjs';
import { holodeckPrefix } from './stage-holodeck.mjs';
import { ASSET_BASE } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';

const ROOT = resolve(import.meta.dir, '../..');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pins = new Map(mirror.files.map((record) => [record.path, record]));

test('each scene pack holds every placed Kiln asset once, at its final version', () => {
  expect(Object.fromEntries(Object.entries(selection.packs).map(([id, pack]) => [id, pack.assets.length]))).toEqual({ 'holodeck-tidemark': 23, 'holodeck-courtyard': 32, 'holodeck-cove': 8, 'holodeck-crescent-cove': 49 });
  expect(catalog.packs.map((pack) => [pack.id, pack.assetCount])).toEqual(HOLODECK_PACKS.map((pack) => [pack.id, pack.expectedAssets]));
  expect(selection.versions).toBe('final-only');
  expect(catalog.assets).toHaveLength(88);
  expect(catalog.assets).toHaveLength(Object.keys(selection.assets).length);
  const shared = catalog.assets.filter((asset) => asset.packs.length > 1);
  expect(shared.map((asset) => asset.slug).sort()).toEqual(Object.keys(HOLODECK_ASSETS).filter((slug) => slug.startsWith('cove-')).sort());
  for (const asset of shared) expect(asset.packs).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard', 'holodeck-crescent-cove']);
  expect(holodeckSlug('holodeck-courtyard', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-cove', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-crescent-cove', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-tidemark', 'island-palm')).toBe('island-palm');
  expect(holodeckSlug('holodeck-crescent-cove', 'shelter')).toBe('crescent-shelter');
});

test('scenes list the Cove modules at their final revision, and say when the walkable scene places an earlier one', () => {
  const tidemark = selection.packs['holodeck-tidemark'].source, cove = selection.packs['holodeck-cove'].source;
  expect(tidemark).toMatchObject({ kind: 'holodeck-example', path: 'examples/tidemark', commit: cove.commit });
  expect(selection.packs['holodeck-crescent-cove'].source).toMatchObject({ kind: 'holodeck-example', path: 'examples/crescent-cove', sourceRevision: 15 });
  for (const slug of selection.packs['holodeck-cove'].assets) {
    const record = selection.assets[slug as keyof typeof selection.assets];
    expect(record.placements.map((placement) => placement.pack)).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard', 'holodeck-crescent-cove']);
  }
  for (const pack of catalog.packs) {
    const earlier = (pack as { sceneStillPlacesEarlier?: { slug: string; placedRevisionId: string; finalRevisionId: string }[] }).sceneStillPlacesEarlier ?? [];
    expect(earlier.map((entry) => entry.slug).sort()).toEqual(pack.id === 'holodeck-crescent-cove' ? selection.packs['holodeck-cove'].assets.slice().sort() : []);
    for (const entry of earlier) {
      expect(catalog.assets.find((candidate) => candidate.slug === entry.slug)?.revisionId).toBe(entry.finalRevisionId);
      expect(entry.placedRevisionId).not.toBe(entry.finalRevisionId);
    }
  }
});

test('assets that use saved materials carry their frozen closure into the editable downloads', () => {
  const closures = Object.entries(selection.assets).filter(([, record]) => 'materials' in record).map(([slug]) => slug);
  expect(closures).toHaveLength(14);
  for (const slug of closures) expect(slug.startsWith('crescent-')).toBe(true);
});

test('owner approval covers exact revisions, and a pack is available only when every asset it lists is approved', () => {
  const approved = catalog.assets.filter((asset) => asset.review.ownerAccepted).map((asset) => asset.slug).sort();
  expect(approved).toEqual(Object.keys(HOLODECK_APPROVAL.revisions).sort());
  expect(approved).toHaveLength(88);
  for (const asset of catalog.assets) {
    expect(asset.review).toEqual(holodeckApproved(asset.slug, asset.revisionId) ? { ownerAccepted: true, status: 'accepted' } : { ownerAccepted: false, status: 'awaiting-owner-review' });
  }
  expect(holodeckApproved('cove-hearth', 'r_' + '0'.repeat(32))).toBe(false);
  for (const pack of catalog.packs) expect(pack.available).toBe(pack.assets.every((slug) => catalog.assets.find((asset) => asset.slug === slug)?.review.ownerAccepted));
  expect(catalog.packs.every((pack) => pack.available)).toBe(true);
});

test('catalog assets name the selected revisions under CC0', async () => {
  expect(selection.licence).toBe('CC0-1.0');
  expect(catalog.licence.spdx).toBe('CC0-1.0');
  for (const asset of catalog.assets) {
    const chosen = selection.assets[asset.slug as keyof typeof selection.assets];
    expect(asset.assetId).toBe(chosen.assetId);
    expect(asset.revisionId).toBe(chosen.revisionId);
    expect(asset.sourceSha256).toBe(chosen.source.sha256);
    expect(sha256(await readFile(join(ROOT, asset.sourcePath)))).toBe(asset.sourceSha256);
  }
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
  expect(holodeckScenes(shared).map((scene) => scene.label)).toEqual(['Walk Cove', 'Walk Tidemark Island', 'Walk Courtyard', 'Walk Crescent Cove']);
  expect(buildGallery(false)).toEqual([]);
});

test('the primary navigation has one Holodeck link, to the site the scene links use', async () => {
  const layout = await readFile(resolve(import.meta.dir, '../src/layouts/BaseLayout.astro'), 'utf8');
  expect(layout.match(/href=\{HOLODECK_SITE\}/g)).toHaveLength(1);
  expect(layout).not.toContain('["Holodeck"');
  expect(worlds.site).toBe(HOLODECK_SITE);
});
