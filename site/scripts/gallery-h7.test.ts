import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import selection from '../../packs/h-7/selection.json';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery } from '../src/lib/gallery-browse';
import { H7_ID, h7AssetHref, h7DemoHref, h7GalleryAssets, h7ModelUrl, h7Pack, h7Parts } from '../src/lib/h7-gallery';
import { assetDelivery } from '../src/lib/delivery';
import { isAssetPageRoute } from './engine-note.mjs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const cards = selection.assets.filter((asset) => !('partOf' in asset));
const extras = selection.assets.filter((asset) => 'partOf' in asset);

test('every selected asset with a page of its own is a gallery card, and the extra models are not', () => {
  const gallery = browseGallery(buildGallery(true), { pack: H7_ID });
  expect(gallery.map((card) => card.href).sort()).toEqual(cards.map((asset) => h7AssetHref(asset.id)).sort());
  for (const asset of cards) {
    const card = gallery.find((candidate) => candidate.slug === asset.id)!;
    expect(card).toMatchObject({ pack: H7_ID, packs: [H7_ID], revisionId: asset.revisionId });
    expect(card.runtimeDownload.sha256).toBe(asset.sha256);
    expect(card.scenes).toBeUndefined();
  }
  for (const asset of extras) expect(buildGallery(true).some((card) => card.href === h7AssetHref(asset.id))).toBe(false);
  expect(h7GalleryAssets(false)).toEqual([]);
  expect(buildGallery(false)).toEqual([]);
});

test('the catalog is the selection, and each model loads from its pinned download', () => {
  expect(h7Pack.release).toBe(selection.release);
  expect(h7Pack.assets.map((asset) => asset.slug)).toEqual(selection.assets.map((asset) => asset.id));
  for (const asset of h7Pack.assets) {
    const pin = selection.assets.find((candidate) => candidate.id === asset.slug)!;
    const delivery = assetDelivery(H7_ID, asset.slug);
    expect(asset.runtimeModelDownload).toEqual({ member: `models/${asset.slug}.glb`, bytes: pin.bytes, sha256: pin.sha256 });
    expect(delivery.runtimeDownload).toMatchObject({ bytes: pin.bytes, sha256: pin.sha256 });
    expect(h7ModelUrl(asset)).toBe(delivery.runtimeDownload.url);
    expect(h7ModelUrl(asset)).toBe(`https://assets.kilnstudio.tools/packs/h-7/${selection.release}/models/${asset.slug}.glb`);
  }
});

test('the skitterer card carries its low-detail model and its corpse', () => {
  expect(h7Parts('skitterer').map((part) => part.slug)).toEqual(['skitterer-low', 'skitterer-corpse']);
  expect(h7Parts('hive-fissure')).toEqual([]);
  const skitterer = h7Pack.assets.find((asset) => asset.slug === 'skitterer')!;
  expect(skitterer.clips).toEqual(['Walk', 'Run', 'Climb', 'Crest', 'Attack', 'Death', 'Idle', 'Fall', 'Corpse']);
});

test('the asset page shows the model, its downloads, the extra models and the licence, with no scene link', () => {
  const page = read('../src/pages/gallery/h-7/[slug].astro');
  for (const piece of ['<AssetViewer', '<EngineNote', '<AssetDownloads', 'h7Parts(', 'h7PackHref', 'license.url', 'h7DemoHref']) expect(page).toContain(piece);
  expect(h7DemoHref).toBe('/play/');
  expect(page).not.toMatch(/Explore the scene/);
  expect(page).not.toMatch(/accept|approv/i);
  const pack = read('../src/pages/packs/h-7.astro');
  for (const piece of ['<AssetDownloads', '<AssetCard', 'license.url', 'h7DemoHref']) expect(pack).toContain(piece);
  expect(pack).not.toMatch(/accept|approv/i);
});

test('the collection is listed with the packs, in the gallery pack filter and as engine-note routes', () => {
  expect(read('../src/pages/gallery/index.astro')).toContain('<option value="h-7">H-7</option>');
  expect(read('../src/pages/packs/index.astro')).toContain('h7PackHref');
  expect(isAssetPageRoute('/gallery/h-7/skitterer/')).toBe(true);
  expect(isAssetPageRoute('/gallery/h-7/')).toBe(false);
  expect(isAssetPageRoute('/gallery/h-7/skitterer/extra/')).toBe(false);
});
