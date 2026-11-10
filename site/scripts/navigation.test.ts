import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { legacyDestination, matchesAsset } from '../src/lib/navigation';
test('legacy links resolve only known archive slugs and safely fall back',()=>{
 expect(legacyDestination('#/gallery',['barn'])).toBe('/gallery/archive/');
 expect(legacyDestination('#/barn',['barn'])).toBe('/gallery/archive/barn/');
 expect(legacyDestination('#/../../docs',['barn'])).toBe('/gallery/archive/');
 expect(legacyDestination('#section',['barn'])).toBeNull();
});
test('pack and category filters intersect; standalone is explicit',()=>{
 expect(matchesAsset({pack:null,category:'Architecture'},'standalone','all')).toBe(true);
 expect(matchesAsset({pack:'farm',category:'Buildings'},'farm','Animals')).toBe(false);
 expect(matchesAsset({pack:'farm',category:'Buildings'},'all','Buildings')).toBe(true);
});

test('an asset shared by two packs is visible in either pack filter without a duplicate card', () => {
 const shared = { pack: 'vehicles', packs: ['vehicles', 'foundry-floor'], category: 'Road vehicles' };
 expect(matchesAsset(shared, 'foundry-floor', 'all')).toBe(true);
 expect(matchesAsset(shared, 'vehicles', 'Road vehicles')).toBe(true);
 expect(matchesAsset(shared, 'farm', 'all')).toBe(false);
 expect(matchesAsset(shared, 'foundry-floor', 'Buildings')).toBe(false);
});

test('the primary nav links to Game demos, whose first entry launches the H-7 pre-alpha', async () => {
  const layout = await readFile(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
  expect(layout).toContain('["Game demos", "/play/"]');
  const listing = await readFile(new URL('../src/pages/play/index.astro', import.meta.url), 'utf8');
  expect(listing).toMatch(/href="\/play\/h-7\/"[^>]*>\s*Play H-7 pre-alpha/);
  expect(listing).toContain('WebGPU');
  expect(listing).toContain('keyboard and mouse');
  expect(listing).not.toMatch(/<iframe\b/);
});

test('the H-7 pre-alpha and its original mech walkthrough link to each other', async () => {
  const listing = await readFile(new URL('../src/pages/play/index.astro', import.meta.url), 'utf8');
  const walkthrough = await readFile(new URL('../src/pages/text-to-3d.astro', import.meta.url), 'utf8');
  expect(listing).toContain('href="/text-to-3d/#mech"');
  expect(walkthrough).toMatch(/subject=\{mech\}[\s\S]*?href="\/play\/h-7\/"[^>]*>\s*Play H-7 pre-alpha[\s\S]*?<\/TextTo3dRun>/);
});

test('the H-7 listing explains desktop-only play and the work-in-progress status before launch', async () => {
  const listing = await readFile(new URL('../src/pages/play/index.astro', import.meta.url), 'utf8');
  expect(listing).toMatch(/href="\/play\/h-7\/"[^>]*aria-describedby="h7-requirements h7-status"/);
  expect(listing).toMatch(/id="h7-requirements"[\s\S]*?desktop or laptop[\s\S]*?WebGPU[\s\S]*?keyboard and mouse[\s\S]*?Mobile play and touch controls are unsupported/);
  expect(listing).toContain('work in progress');
  expect(listing).toContain('Hardware compatibility is still being tested');
});
