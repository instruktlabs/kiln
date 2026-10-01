import { expect, test } from 'bun:test';
import { buildGallery, foundry } from '../src/lib/gallery';

test('every sealed Foundry model is discoverable in the gallery with its exact revision and download', () => {
  const cards = buildGallery(true);
  for (const asset of foundry.assets) {
    const card = cards.find((candidate) =>
      candidate.slug === asset.slug && candidate.packs.includes('foundry-floor'));
    expect(card, asset.slug).toBeDefined();
    expect(card?.revisionId).toBe(asset.revisionId);
    expect(card?.runtimeDownload.sha256).toBe(asset.runtimeDownload.sha256);
  }
  expect(new Set(cards.map((card) => card.href)).size).toBe(cards.length);
});

test('shared road vehicles retain one existing gallery page and both pack memberships', () => {
  const cards = buildGallery(true);
  for (const asset of foundry.assets.filter((asset) => asset.group === 'vehicles')) {
    const matching = cards.filter((card) => card.slug === asset.slug);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.href).toBe(`/gallery/${asset.slug}/`);
    expect(matching[0]?.packs).toEqual(['vehicles', 'foundry-floor']);
  }
});

test('pre-publication mode does not emit Commons gallery cards', () => {
  expect(buildGallery(false)).toEqual([]);
});
