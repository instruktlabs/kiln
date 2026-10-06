import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import troy from '../src/data/troy.json';
import foundry from '../src/data/packs/foundry-floor.json';
import media from '../src/data/scene-media.json';
import mirror from '../src/data/mirror-manifest.json';
import commons from '../src/data/commons-build.json';

const source = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('homepage includes both current Troy captures with scene and pack links in a two-column scene grid', async () => {
  const page = await source('../src/pages/index.astro');
  const cards = page.slice(page.indexOf('aria-labelledby="made-heading"'));
  expect(troy.posters).toHaveLength(2);
  expect(cards).toMatch(/<ScenePoster\s+images=\{troy\.posters\}/);
  expect(cards).toContain('href="/scenes/troy/"');
  expect(cards).toContain('href="/packs/troy/"');
  expect(cards).toContain('md:grid-cols-2');
  expect(cards).not.toContain('mt-8 grid gap-10 md:grid-cols-3');
  const sizes = page.match(/const CARD_SIZES = ([^;]+);/)![1]!;
  expect(sizes).toContain('50vw');
  expect(sizes).toContain('632px');
});

test('Foundry featured samples include two campus buildings alongside process and transport equipment', async () => {
  const page = await source('../src/pages/packs/index.astro');
  const selected = JSON.parse(page.match(/const featured = (\[[^\n]+\])/)![1]!) as string[];
  expect(selected).toHaveLength(6);
  const assets = selected.map(slug => foundry.assets.find(asset => asset.slug === slug)!);
  expect(assets.every(Boolean)).toBe(true);
  expect(assets.filter(asset => asset.group === 'campus')).toHaveLength(2);
  expect(assets.some(asset => asset.group === 'tools')).toBe(true);
  expect(assets.some(asset => asset.group === 'transport')).toBe(true);
  const card = page.slice(page.indexOf('href="/packs/foundry-floor/"'));
  expect(card.indexOf('image={foundryCampusPoster}')).toBeGreaterThan(0);
  expect(card.indexOf('image={foundryCampusPoster}')).toBeLessThan(card.indexOf('featured.map'));
});

test('Foundry pack leads its inventory with a genuine campus capture and descriptive caption', async () => {
  const page = await source('../src/components/FoundryFloorPack.astro');
  const intro = page.slice(0, page.indexOf('aria-labelledby="inventory"'));
  expect(intro).toContain('image={foundryCampusPoster}');
  expect(intro).toContain('<figcaption');
  expect(intro).toContain('campus buildings');
});

test('the clearer Foundry campus image is immutably pinned while retaining the previous aerial capture', () => {
  const campus = media['foundry-floor'].captures.campus;
  const path = 'media/scenes/foundry-floor/preview-20261005-01/foundry-floor-campus-arrival.png';
  expect(campus.poster.inputPath).toBe(path);
  expect(campus.poster.alt).toContain('entrance');
  expect(campus.capture.view).toBe('Arrival');
  expect(campus.capture.source).toContain('Unretouched');
  expect(media['foundry-floor'].captures['campus-aerial'].poster.inputPath).not.toBe(path);
  const pin = mirror.files.find(row => row.path === path)!;
  expect(pin).toBeDefined();
  expect(pin.bytes).toBe(campus.capture.pngBytes);
  expect(pin.sha256).toBe(campus.capture.pngSha256);
  expect(commons.images.find(row => row.inputPath === path)).toEqual(campus.poster);
});
