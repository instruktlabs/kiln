import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import bridge from '../src/data/standalone/golden-gate-bridge.json';

const page = await readFile(new URL('../src/pages/gallery/[slug].astro', import.meta.url), 'utf8');
const at = (text: string) => {
  const index = page.indexOf(text);
  expect(index).toBeGreaterThan(-1);
  return index;
};

test('an asset page offers its downloads right after the model and its figures', () => {
  const downloads = at('id="downloads"');
  for (const before of ['<AssetViewer', '<StatRow']) expect(at(before)).toBeLessThan(downloads);
  for (const after of ['<VehicleTiers', 'id="review"', 'id="source"', 'id="history"', 'id="reference"']) expect(at(after)).toBeGreaterThan(downloads);
});

test('the engine note follows the downloads it describes', () => {
  expect(at('<EngineNote')).toBeGreaterThan(at('id="downloads"'));
});

test('an asset page keeps its revision history closed until asked for, under the same heading and anchor', () => {
  expect(page).toMatch(/<details[^>]*>\s*<summary[^>]*>\s*<h2 id="history"[^>]*>Follow the saved revisions\.<\/h2>\s*<\/summary>/);
});

test('Golden Gate offers its full detail first, with the other levels of the same bridge in one closed row', () => {
  expect(bridge.tiers.map(({ tier }) => tier)).toEqual(['full', 'web', 'far']);
  expect(page).toMatch(/<AssetTierDownloads \{\.\.\.fullTier!\} \/>\s*<details[^>]*>\s*<summary[^>]*>Other detail levels<\/summary>/);
  expect(page).toMatch(/otherTiers\.map\(\(tier\) => <AssetTierDownloads \{\.\.\.tier\} \/>\)/);
});
