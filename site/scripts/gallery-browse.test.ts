import { expect, test } from 'bun:test';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery, galleryCategories } from '../src/lib/gallery-browse';
import taxonomy from '../src/data/gallery-taxonomy.json';
import { curatedWorlds, featuredAssetHrefs, worldCover } from '../src/lib/site-curation';
import { holodeckPacks } from '../src/lib/holodeck';

const cards = buildGallery(true);
const card = (href: string) => cards.find((asset) => asset.href === href)!;

test('every gallery asset has deliberate shared taxonomy and a catalog introduction date', () => {
  expect(Object.keys(taxonomy.assets).sort()).toEqual(cards.map((asset) => asset.href).sort());
  for (const asset of cards) {
    expect(galleryCategories).toContain(asset.category);
    expect(asset.tags.length).toBeGreaterThan(0);
    expect(new Set(asset.tags).size).toBe(asset.tags.length);
    expect(asset.addedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  }
  expect(card('/gallery/faceted-tree/').category).toBe('Vegetation');
  expect(card('/gallery/holodeck/crescent-palm-tall/').category).toBe('Vegetation');
  expect(card('/gallery/holodeck/winter-wmc-fir-hero-a/').category).toBe('Vegetation');
  expect(card('/gallery/holodeck/meridian-cypress-tall/').category).toBe('Vegetation');
  expect(card('/gallery/cabin-woods-psx-horror/pine/').category).toBe('Vegetation');
  expect(card('/gallery/cabin-woods-psx-horror/bed/').category).toBe('Furniture & Interiors');
  expect(card('/gallery/holodeck/meridian-statue-whale/').category).toBe('Props & Decoration');
});

test('curated world and asset selections resolve without dropping any current pack', () => {
  expect(curatedWorlds.map((pack) => pack.id).slice(0, 3)).toEqual([
    'holodeck-meridian-sanctuary', 'holodeck-crescent-cove', 'holodeck-winter-mountainside-cabin',
  ]);
  expect(new Set(curatedWorlds.map((pack) => pack.id))).toEqual(new Set(holodeckPacks.map((pack) => pack.id)));
  expect(curatedWorlds).toHaveLength(holodeckPacks.length);
  for (const pack of curatedWorlds) expect(worldCover(pack.id)?.src).toBeTruthy();
  for (const href of featuredAssetHrefs) expect(card(href)).toBeDefined();
});

test('default selection promotes a varied curated set without losing older assets', () => {
  const result = browseGallery(cards);
  expect(result[0]?.href).toBe('/gallery/holodeck/crescent-shelter/');
  expect(featuredAssetHrefs).not.toContain('/gallery/holodeck/crescent-rock-cliff-a/');
  expect(result.some((asset) => asset.href === '/gallery/holodeck/crescent-rock-cliff-a/')).toBe(true);
  expect(new Set(result.slice(0, 8).map((asset) => asset.category)).size).toBeGreaterThanOrEqual(4);
  expect(new Set(result.map((asset) => asset.href))).toEqual(new Set(cards.map((asset) => asset.href)));
  expect(browseGallery([])).toEqual([]);
});

test('search combines words across names and tags with category and shared pack membership', () => {
  const result = browseGallery(cards, { query: 'TROPICAL palm', category: 'Vegetation', pack: 'holodeck-crescent-cove' });
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((asset) => asset.slug.startsWith('crescent-palm-'))).toBe(true);
  expect(browseGallery(cards, { query: 'no-such-asset-123' })).toEqual([]);
  expect(browseGallery(cards, { pack: 'foundry-floor', query: 'sedan' }).map((asset) => asset.href)).toContain('/gallery/sedan/');
});

test('newest uses introduction date, with repeatable alphabetical ties', () => {
  const result = browseGallery(cards, { sort: 'newest' });
  expect(result[0]?.slug.startsWith('meridian-')).toBe(true);
  for (let i = 1; i < result.length; i++) expect(result[i - 1]!.addedOn >= result[i]!.addedOn).toBe(true);
  expect(browseGallery([...cards].reverse(), { sort: 'newest' })).toEqual(result);
});

test('A-Z order is independent of input order and keeps input immutable', () => {
  const original = cards.map((asset) => asset.href);
  const result = browseGallery(cards, { sort: 'az' });
  expect(browseGallery([...cards].reverse(), { sort: 'az' })).toEqual(result);
  expect(cards.map((asset) => asset.href)).toEqual(original);
});
