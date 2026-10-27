import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import releases from '../../packs/holodeck/releases.json';
import selection from '../../packs/holodeck/selection.json';
import catalog from '../src/data/holodeck.json';
import worlds from '../src/data/holodeck-worlds.json';
import mirror from '../src/data/mirror-manifest.json';
import plan from '../src/data/commons-build.json';
import rigPosters from '../src/data/rig-posters.json';
import shots from '../src/data/holodeck-shots.json';
import { HOLODECK_SITE } from '../src/lib/config';
import { buildGallery } from '../src/lib/gallery';
import { holodeckScenes, holodeckWorldUrl } from '../src/lib/holodeck';
import { HOLODECK_APPROVAL, HOLODECK_ASSETS, HOLODECK_PACKS, HOLODECK_SHOT_SIZE, HOLODECK_SHOTS, holodeckApproved, holodeckSlug } from './holodeck-spec.mjs';
import { HOLODECK_OBJECTS, HOLODECK_SHOTS_DIR, claimHolodeckRelease } from './stage-holodeck.mjs';
import { ASSET_BASE } from './mirror-core.mjs';
import { applyRigPosters } from './rig-posters-core.mjs';

const ROOT = resolve(import.meta.dir, '../..');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const pins = new Map(mirror.files.map((record) => [record.path, record]));

test('each scene pack holds every placed Kiln asset once, at its final version', () => {
  expect(Object.fromEntries(Object.entries(selection.packs).map(([id, pack]) => [id, pack.assets.length]))).toEqual({ 'holodeck-tidemark': 23, 'holodeck-courtyard': 32, 'holodeck-cove': 8, 'holodeck-crescent-cove': 49, 'holodeck-winter-mountainside-cabin': 56, 'holodeck-meridian-sanctuary': 53 });
  expect(catalog.packs.map((pack) => [pack.id, pack.assetCount])).toEqual(HOLODECK_PACKS.map((pack) => [pack.id, pack.expectedAssets]));
  expect(selection.versions).toBe('final-only');
  expect(catalog.assets).toHaveLength(188);
  expect(catalog.assets).toHaveLength(Object.keys(selection.assets).length);
  const shared = catalog.assets.filter((asset) => asset.packs.length > 1);
  expect(shared.map((asset) => asset.slug).sort()).toEqual(Object.keys(HOLODECK_ASSETS).filter((slug) => slug.startsWith('cove-')).sort());
  // The winter cabin keeps only the Cove's mood board; its trailhead replaces the rest of the Cove. Meridian Sanctuary lists every module.
  for (const asset of shared) expect(asset.packs).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard', 'holodeck-crescent-cove', ...(asset.slug === 'cove-moodboard' ? ['holodeck-winter-mountainside-cabin'] : []), 'holodeck-meridian-sanctuary']);
  expect(holodeckSlug('holodeck-courtyard', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-cove', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-crescent-cove', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-tidemark', 'island-palm')).toBe('island-palm');
  expect(holodeckSlug('holodeck-crescent-cove', 'shelter')).toBe('crescent-shelter');
  expect(holodeckSlug('holodeck-meridian-sanctuary', 'canopy')).toBe('cove-canopy');
  expect(holodeckSlug('holodeck-meridian-sanctuary', 'statue-figure')).toBe('meridian-statue-figure');
});

test('scenes list the Cove modules at their final revision, and say when the walkable scene places an earlier one', () => {
  const tidemark = selection.packs['holodeck-tidemark'].source, cove = selection.packs['holodeck-cove'].source;
  expect(tidemark).toMatchObject({ kind: 'holodeck-example', path: 'examples/tidemark', commit: cove.commit });
  expect(selection.packs['holodeck-crescent-cove'].source).toMatchObject({ kind: 'holodeck-example', path: 'examples/crescent-cove', sourceRevision: 17 });
  expect(selection.packs['holodeck-meridian-sanctuary'].source).toMatchObject({ kind: 'holodeck-example', path: 'examples/meridian-sanctuary', sourceRevision: 27 });
  for (const slug of selection.packs['holodeck-cove'].assets) {
    const record = selection.assets[slug as keyof typeof selection.assets];
    expect(record.placements.map((placement) => placement.pack)).toEqual(['holodeck-cove', 'holodeck-tidemark', 'holodeck-courtyard', 'holodeck-crescent-cove', ...(slug === 'cove-moodboard' ? ['holodeck-winter-mountainside-cabin'] : []), 'holodeck-meridian-sanctuary']);
  }
  for (const pack of catalog.packs) {
    const earlier = (pack as { sceneStillPlacesEarlier?: { slug: string; placedRevisionId: string; finalRevisionId: string }[] }).sceneStillPlacesEarlier ?? [];
    expect(earlier.map((entry) => entry.slug).sort()).toEqual([]);
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
  expect(approved).toHaveLength(188);
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
  // Releases staged before content addressing keep their release paths until the next staging replaces them.
  const legacy = `packs/holodeck/${catalog.release}/`;
  const downloads = [
    ...catalog.assets.flatMap((asset) => [asset.runtimeModelDownload, asset.runtimeDownload, asset.editableDownload]),
    ...catalog.packs.flatMap((pack) => pack.downloads),
  ];
  for (const download of downloads) {
    const name = download.path.split('/').at(-1);
    expect(download.path === `${HOLODECK_OBJECTS}${download.sha256}/${name}` || download.path.startsWith(legacy)).toBe(true);
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
  expect(holodeckWorldUrl('holodeck-meridian-sanctuary')).toBe('https://holodeck.kilnstudio.tools/worlds/meridian-sanctuary/');
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
  expect(holodeckScenes(shared).map((scene) => scene.label)).toEqual(['Walk Cove', 'Walk Tidemark Island', 'Walk Courtyard', 'Walk Crescent Cove', 'Walk Meridian Sanctuary']);
  expect(buildGallery(false)).toEqual([]);
});

test('the primary navigation has one Holodeck link, to the site the scene links use', async () => {
  const layout = await readFile(resolve(import.meta.dir, '../src/layouts/BaseLayout.astro'), 'utf8');
  expect(layout.match(/href=\{HOLODECK_SITE\}/g)).toHaveLength(1);
  expect(layout).not.toContain('["Holodeck"');
  expect(worlds.site).toBe(HOLODECK_SITE);
});

test('every pack shows its two scene shots, wide view first, captured from its world at full HD, pinned and planned', () => {
  expect(shots.size).toEqual(HOLODECK_SHOT_SIZE);
  expect(Object.keys(shots.packs)).toEqual(HOLODECK_PACKS.map((pack) => pack.id));
  for (const [id, images] of Object.entries(shots.packs)) {
    const declared = HOLODECK_SHOTS[id as keyof typeof HOLODECK_SHOTS];
    expect(images.map((image) => image.view)).toEqual(declared.map((shot) => shot.view));
    for (const [index, image] of images.entries()) {
      expect(image).toMatchObject({ ...HOLODECK_SHOT_SIZE, alt: declared[index]!.alt });
      expect(image.alt.length).toBeGreaterThan(20);
      expect(image.capture).toMatchObject({ tool: 'scripts/capture-holodeck-shots.mjs', world: holodeckWorldUrl(id), camera: declared[index]!.camera, backend: 'WebGPU' });
      expect(image.capture.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(image.inputPath).toBe(`${HOLODECK_SHOTS_DIR}${image.sha256}/${image.view}.png`);
      expect(pins.get(image.inputPath)).toEqual({ path: image.inputPath, bytes: image.bytes, sha256: image.sha256 });
      expect(plan.images.some((planned) => planned.inputPath === image.inputPath && planned.alt === image.alt)).toBe(true);
    }
  }
});

test('every release ID the packs have spent is recorded once, and the current one describes this selection', async () => {
  const ids = releases.releases.map((record) => record.release);
  expect(ids).toEqual([...new Set(ids)]);
  expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, 'en')));
  // Every release a Holodeck poster was rendered under was spent, whether or not its selection was kept.
  const rendered = new Set(Object.entries(rigPosters.posters).filter(([key]) => key.startsWith('holodeck:')).map(([, poster]) => poster.path.split('/')[4]));
  for (const release of rendered) expect(ids, release).toContain(release);
  expect(ids).toContain(catalog.release);
  // Restaging this selection under its own ID is the release loop and claims nothing new; reusing the ID for other
  // content is refused with the next free one.
  const bytes = await readFile(join(ROOT, 'packs/holodeck/selection.json'));
  expect(claimHolodeckRelease({ release: selection.release, selection: bytes, recorded: releases })).toEqual(releases);
  expect(() => claimHolodeckRelease({ release: selection.release, selection: Buffer.from('other'), recorded: releases })).toThrow('choose a new HOLODECK_RELEASE');
  expect(() => claimHolodeckRelease({ release: 'holodeck-20261025-02', selection: bytes, recorded: releases })).toThrow('holodeck-20261025-03');
});
