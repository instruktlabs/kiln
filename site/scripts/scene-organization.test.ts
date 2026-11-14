import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import * as sceneData from '../src/data/scenes';

test('scene browsing separates current Cathedral from earlier Kiln scenes without treating Troy as a module', () => {
  const groups = sceneData.sceneBrowseGroups?.(true);
  expect(groups?.map(group => [group.label, group.scenes.map(scene => scene.id)])).toEqual([
    ['Current Kiln scenes', ['seed-town', 'cathedral-square']],
    ['Earlier Kiln scenes', ['troy', 'farm', 'golden-gate', 'foundry-floor', 'cabin-woods-psx-horror']],
  ]);
  expect('troy' in sceneData.scenes).toBe(false);
});

test('packs-off browsing omits the gated Troy route and all selectable routes stay local', () => {
  const groups = sceneData.sceneBrowseGroups?.(false);
  expect(groups).toBeDefined();
  expect(groups?.flatMap(group => group.scenes).some(scene => scene.id === 'troy')).toBe(false);
  for (const group of groups ?? []) for (const scene of group.scenes) expect(scene.href).toMatch(/^\/scenes\/[a-z0-9-]+\/$/);
});

test('listing and dropdown share grouping, and Holodeck keeps its separate world links', async () => {
  const page = await readFile(new URL('../src/pages/scenes/index.astro', import.meta.url), 'utf8');
  const selector = await readFile(new URL('../src/components/SceneSelector.astro', import.meta.url), 'utf8');
  expect(page).toContain('sceneBrowseGroups(PACKS_ENABLED)');
  expect(page).toContain('heading="Holodeck worlds"');
  expect(page).not.toContain('none of the three');
  expect(selector).toContain('sceneBrowseGroups(PACKS_ENABLED)');
  expect(selector).toContain('<optgroup label={group.label}>');
});
