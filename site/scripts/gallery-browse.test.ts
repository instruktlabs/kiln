import { expect, test } from 'bun:test';
import { buildGallery } from '../src/lib/gallery';
import { browseGallery, galleryCategories } from '../src/lib/gallery-browse';
import taxonomy from '../src/data/gallery-taxonomy.json';
import galleryOrder from '../src/data/gallery-order.json';
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

test('the gallery opens in the curated order, and unlisted assets follow newest first without loss', () => {
  const order = galleryOrder.order;
  expect(new Set(order).size).toBe(order.length);
  for (const href of order) expect(card(href)).toBeDefined();
  const result = browseGallery(cards);
  expect(result.slice(0, order.length).map((asset) => asset.href)).toEqual(order);
  expect(order[0]).toBe('/gallery/cathedral-square/cathedral/');
  expect(order[1]).toBe('/gallery/text-to-3d/mech/');
  expect(order[9]).toBe('/gallery/cathedral-square/crucifix/');
  const rest = result.slice(order.length);
  for (let i = 1; i < rest.length; i++) {
    const previous = rest[i - 1]!, current = rest[i]!;
    expect(previous.addedOn >= current.addedOn).toBe(true);
    if (previous.addedOn === current.addedOn) expect(previous.name.localeCompare(current.name, 'en')).toBeLessThanOrEqual(0);
  }
  expect(new Set(result.map((asset) => asset.href))).toEqual(new Set(cards.map((asset) => asset.href)));
  expect(browseGallery([...cards].reverse())).toEqual(result);
  expect(browseGallery([])).toEqual([]);
});

test('a new asset that is not in the order lands right after it, never ahead of it', () => {
  const order = galleryOrder.order;
  const added = { ...card(order[0]!), href: '/gallery/not-ranked-yet/', name: 'Not ranked yet', addedOn: '2099-01-01' };
  const result = browseGallery([added, ...cards]);
  expect(result.slice(0, order.length).map((asset) => asset.href)).toEqual(order);
  expect(result[order.length]?.href).toBe('/gallery/not-ranked-yet/');
});

test('filters keep the curated order among the assets they leave', () => {
  const order = galleryOrder.order;
  const hrefs = browseGallery(cards, { pack: 'cathedral-square' }).map((asset) => asset.href);
  const listed = hrefs.filter((href) => order.includes(href));
  expect(listed.length).toBeGreaterThan(1);
  expect(hrefs.slice(0, listed.length)).toEqual(order.filter((href) => listed.includes(href)));
  expect(browseGallery(cards, { sort: 'newest' })[0]?.addedOn).toBe(cards.map((asset) => asset.addedOn).sort().at(-1));
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
  expect(result[0]?.addedOn).toBe(cards.map((asset) => asset.addedOn).sort().at(-1));
  for (let i = 1; i < result.length; i++) {
    const previous = result[i - 1]!, current = result[i]!;
    expect(previous.addedOn >= current.addedOn).toBe(true);
    if (previous.addedOn === current.addedOn) expect(previous.name.localeCompare(current.name, 'en')).toBeLessThanOrEqual(0);
  }
  expect(browseGallery([...cards].reverse(), { sort: 'newest' })).toEqual(result);
});

test('A-Z order is independent of input order and keeps input immutable', () => {
  const original = cards.map((asset) => asset.href);
  const result = browseGallery(cards, { sort: 'az' });
  expect(browseGallery([...cards].reverse(), { sort: 'az' })).toEqual(result);
  expect(cards.map((asset) => asset.href)).toEqual(original);
});
