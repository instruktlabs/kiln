import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery } from '../src/lib/gallery-browse';
import { featuredAssetHrefs } from '../src/lib/site-curation';
import { TEXT_TO_3D_PACK, textTo3dAssetHref, textTo3dGalleryAssets } from '../src/lib/text-to-3d-gallery';
import { inspectGlb } from './generate-commons.mjs';

const site = resolve(import.meta.dir, '..');
const json = async (path: string) => JSON.parse(await readFile(resolve(site, path), 'utf8'));
const record = await json('src/data/text-to-3d.json');
const listing = await json('src/data/text-to-3d-gallery.json');
const pins = await json('src/data/mirror-manifest.json');
const mech = record.subjects.find((subject: { id: string }) => subject.id === 'mech');
const mechPath = new URL(mech.glbHref).pathname.slice(1);
const MECH = '/gallery/text-to-3d/mech/';
/** The GLB is on the asset host. A packs build keeps it in its verified mirror, and staging keeps its own copy; CI has neither. */
const localMech = ['.cache/commons/mirror', '.localdata/asset-delivery'].map((directory) => resolve(site, directory, mechPath)).find((file) => existsSync(file));

test('the Heavy Walker Mech is a gallery card made from the Text-to-3D record and its pinned file', () => {
  const cards = buildGallery(true).filter((card) => card.packs.includes(TEXT_TO_3D_PACK));
  expect(cards.map((card) => card.href)).toEqual([MECH]);
  expect(textTo3dAssetHref('mech')).toBe(MECH);
  const [card] = cards;
  const pin = pins.files.find((file: { path: string }) => file.path === mechPath);
  expect(card).toMatchObject({
    slug: 'mech', name: 'Heavy Walker Mech', pack: TEXT_TO_3D_PACK, packs: [TEXT_TO_3D_PACK], category: 'Vehicles',
    revisionId: 'r_369d7b0f63074203bdbda37064270049',
    runtimeDownload: { url: mech.glbHref, bytes: pin.bytes, sha256: pin.sha256 },
    metrics: { triangles: mech.triangles },
  });
  // The card shows the same review-rig still the Text-to-3D page opens with.
  expect(card!.poster).toEqual(mech.images.final);
  expect(card!.tags).toContain('mech');
});

test('the listing adds nothing the record already holds, and the gallery has no mech without packs', () => {
  expect(listing.assets).toHaveLength(1);
  expect(Object.keys(listing.assets[0]).sort()).toEqual(['bounds', 'clips', 'materials', 'revisionId', 'sha256', 'slug', 'subject', 'summary']);
  expect(textTo3dGalleryAssets(false)).toEqual([]);
  expect(buildGallery(false)).toEqual([]);
});

test('the mech is among the first ten assets the gallery shows, and stays there when newer assets arrive', () => {
  const cards = buildGallery(true);
  expect(browseGallery(cards).slice(0, 10).map((card) => card.href)).toContain(MECH);
  // Its place is curated, not an accident of its date: a later pack must not push it down the page.
  const newer = Array.from({ length: 12 }, (_, index) => ({ ...cards[0]!, href: `/gallery/later/${index}/`, name: `A later asset ${index}`, addedOn: '2099-01-01' }));
  expect(browseGallery([...cards, ...newer]).slice(0, 10).map((card) => card.href)).toContain(MECH);
  expect(featuredAssetHrefs).toHaveLength(8);
});

test.skipIf(!localMech)('the listed facts are the hosted file\'s own', async () => {
  const bytes = await readFile(localMech!);
  const [entry] = listing.assets;
  const facts = inspectGlb(bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
  expect(facts.triangles).toBe(mech.triangles);
  expect(facts.materials).toBe(entry.materials);
  expect(facts.clips).toEqual(entry.clips);
  expect(facts.bounds.map((value: number) => Number(value.toFixed(2)))).toEqual(entry.bounds);
});

test('the mech page opens the hosted GLB, offers it and its program, and states the licence', async () => {
  const page = await readFile(resolve(site, 'src/pages/gallery/text-to-3d/[slug].astro'), 'utf8');
  expect(page).toContain('textTo3dGalleryAssets()');
  expect(page).toContain('<AssetViewer');
  expect(page).toContain('modelUrl={asset.runtimeDownload.url}');
  expect(page).toContain('href={asset.runtimeDownload.url} download');
  expect(page).toContain('href={asset.source.sourceHref} download');
  expect(page).toContain('https://creativecommons.org/publicdomain/zero/1.0/');
  expect(page).toContain('href={asset.madeHref}');
  // Site pages carry no approval or acceptance wording.
  expect(page).not.toMatch(/accept|approv|review/i);
  const [asset] = textTo3dGalleryAssets(true);
  expect(asset!.madeHref).toBe('/text-to-3d/#mech');
  expect(asset!.source.sourceHref).toBe(mech.steps.at(-1).sourceHref);
});

test('the gallery can be filtered to Text to 3D, and the Text-to-3D page links the mech\'s gallery page', async () => {
  const index = await readFile(resolve(site, 'src/pages/gallery/index.astro'), 'utf8');
  expect(index).toContain('<option value="text-to-3d">Text to 3D</option>');
  expect(browseGallery(buildGallery(true), { pack: TEXT_TO_3D_PACK }).map((card) => card.href)).toEqual([MECH]);
  const page = await readFile(resolve(site, 'src/pages/text-to-3d.astro'), 'utf8');
  expect(page).toContain(`href="${MECH}"`);
});
