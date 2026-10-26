import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

test('the workflow connects a real cabin asset to its kit and placed scene', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/asset-to-scene.json'), 'utf8'));
  expect(data.asset.slug).toBe('winter-wmc-wall-facade');
  expect(data.modules.length).toBeGreaterThan(8);
  expect(data.interiorAssets).toContain('wmc-loft-bed');
  expect(data.interiorAssets).toContain('wmc-kitchen-run');
  expect(data.interiorAssets).toContain('wmc-sofa-wool');
  expect(data.capture.camera.loft).toBeDefined();
  expect(data.capture.backend).toBe('WebGPU');
  expect(data.scene.capture.backend).toBe('WebGPU');
  expect(data.modules.every((module: { placedRevision: string; revision: string }) => module.placedRevision === module.revision)).toBe(true);
  for (const file of data.files) {
    const bytes = await readFile(resolve(import.meta.dir, '..', file.path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
  }
});

test('one player tells the asset, modular kit and finished scene story without repeated comparison media', async () => {
  const component = await readFile(resolve(import.meta.dir, '../src/components/AssetToScene.astro'), 'utf8');
  const page = await readFile(resolve(import.meta.dir, '../src/pages/index.astro'), 'utf8');
  expect(component.match(/<video\b/g)).toHaveLength(1);
  expect(component).not.toContain('<img');
  expect(component).toContain('One asset');
  expect(component).toContain('A modular kit');
  expect(component).toContain('A finished scene');
  expect(component).toContain('loft bed');
  expect(component).not.toContain('autoplay');
  expect(page).toContain('<AssetToScene');
  expect(page).not.toContain('CanopyWorkflow');
  expect(page).not.toContain('canopy-workflow.json');
});

test('the curated README shows the current asset-to-scene sequence', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/asset-to-scene.json'), 'utf8'));
  const readme = await readFile(resolve(import.meta.dir, '../../README.md'), 'utf8');
  expect(readme).toContain(`site/public${data.media.gif}`);
  expect(readme).not.toContain('workflow/canopy/');
});

test('the property film has a deliberate pace and includes the furnished room tour', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/asset-to-scene.json'), 'utf8'));
  expect(data.media.duration).toBeGreaterThanOrEqual(25);
  expect(data.media.duration).toBeLessThanOrEqual(40);
  expect(data.capture.style).toBe('property-film-v1');
  expect(data.capture.placementMethod).toBe('grounded-reveal');
  expect(data.capture.fps).toBe(30);
  expect(data.capture.frameCount).toBe(Math.round(data.media.duration * data.capture.fps));
  expect(data.capture.shots.map((shot: { id: string }) => shot.id)).toEqual(['asset', 'reveal', 'architecture', 'living', 'living-tour', 'stairs', 'loft', 'scene']);
});

test('the internal stair flight stays out of the living room and builds with the loft landing', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/asset-to-scene.json'), 'utf8'));
  expect(data.capture.upstairsAssembly?.internalTreadCount).toBe(17);
  expect(data.capture.upstairsAssembly.maxVisibleTreadsBeforeBuild).toBe(0);
  expect(data.capture.upstairsAssembly.visibleTreadsAfterBuild).toBe(17);
  expect(data.capture.upstairsAssembly.landingVisible).toBe(true);
  expect(data.capture.upstairsAssembly.hiddenUntil).toBeGreaterThanOrEqual(data.capture.shots.find((shot: {id: string}) => shot.id === 'living-tour').end);
});
