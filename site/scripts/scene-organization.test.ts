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
  expect(selector).toContain('sceneSelectorGroups(PACKS_ENABLED)');
  expect(selector).toContain('<optgroup label={group.label}>');
});

test('the dropdown lists the Holodeck worlds between the current and the earlier Kiln scenes', async () => {
  const { sceneSelectorGroups } = await import('../src/lib/scene-selector');
  const { curatedWorlds } = await import('../src/lib/site-curation');
  const { holodeckSite } = await import('../src/lib/holodeck');
  const groups = sceneSelectorGroups(true);
  expect(groups.map(group => group.label)).toEqual(['Current Kiln scenes', 'Holodeck worlds', 'Earlier Kiln scenes']);
  expect(groups[0]!.options.map(option => option.id)).toEqual(['seed-town', 'cathedral-square']);
  expect(groups[2]!.options.map(option => option.id)).toEqual(['troy', 'farm', 'golden-gate', 'foundry-floor', 'cabin-woods-psx-horror']);
  // Every curated world, in the order the Scenes page shows them, each at its own place on Holodeck.
  expect(groups[1]!.options.map(option => option.name)).toEqual(curatedWorlds.map(pack => pack.name));
  expect(groups[1]!.options[0]!.name).toBe('Lagoon Sanctuary');
  for (const option of groups[1]!.options) expect(option.href.startsWith(`${holodeckSite}worlds/`)).toBe(true);
  expect(new Set(groups[1]!.options.map(option => option.href)).size).toBe(curatedWorlds.length);
  // A build without packs shows no Holodeck worlds on the Scenes page, so the dropdown lists none.
  const local = sceneSelectorGroups(false);
  expect(local.map(group => group.label)).toEqual(['Current Kiln scenes', 'Earlier Kiln scenes']);
  for (const group of local) for (const option of group.options) expect(option.href).toMatch(/^\/scenes\/[a-z0-9-]+\/$/);
  // The control goes only to a scene page or to Holodeck.
  const selector = await readFile(new URL('../src/components/SceneSelector.astro', import.meta.url), 'utf8');
  expect(selector).toContain('data-holodeck={holodeckSite}');
  expect(selector).toContain("select.value.startsWith('/scenes/') || (!!holodeck && select.value.startsWith(holodeck))");
});
