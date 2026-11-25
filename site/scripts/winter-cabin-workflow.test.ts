import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import sharp from 'sharp';

test('the workflow connects a real cabin asset to its kit and placed scene', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/winter-cabin-workflow.json'), 'utf8'));
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

test('the README links a lighter animated construction cut and the full film', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/winter-cabin-workflow.json'), 'utf8'));
  const root = resolve(import.meta.dir, '../..');
  const readme = await readFile(resolve(root, 'README.md'), 'utf8');
  const path = 'assets/readme/cabin-construction.gif';
  expect(readme).toContain(`https://raw.githubusercontent.com/instruktlabs/kiln/main/${path}`);
  expect(readme).toContain('https://kilnstudio.tools' + data.media.mp4);
  const gif = await readFile(resolve(root, path));
  const info = await sharp(gif, { animated: true }).metadata();
  const full = data.files.find((file: { path: string }) => file.path === `public${data.media.gif}`);
  expect(info.format).toBe('gif');
  expect(info.pages).toBeGreaterThan(1);
  expect(info.delay!.reduce((total, delay) => total + delay, 0)).toBeLessThan(data.media.duration * 1000);
  expect(gif.length).toBeLessThan(full.bytes);
});

test('the property film has a deliberate pace and includes the furnished room tour', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/winter-cabin-workflow.json'), 'utf8'));
  expect(data.media.duration).toBeGreaterThanOrEqual(25);
  expect(data.media.duration).toBeLessThanOrEqual(40);
  expect(data.capture.style).toBe('property-film-v1');
  expect(data.capture.placementMethod).toBe('grounded-reveal');
  expect(data.capture.fps).toBe(30);
  expect(data.capture.frameCount).toBe(Math.round(data.media.duration * data.capture.fps));
  expect(data.capture.shots.map((shot: { id: string }) => shot.id)).toEqual(['asset', 'reveal', 'architecture', 'living', 'living-tour', 'stairs', 'loft', 'scene']);
});

test('the internal stair flight stays out of the living room and builds with the loft landing', async () => {
  const data = JSON.parse(await readFile(resolve(import.meta.dir, '../src/data/winter-cabin-workflow.json'), 'utf8'));
  expect(data.capture.upstairsAssembly?.internalTreadCount).toBe(17);
  expect(data.capture.upstairsAssembly.maxVisibleTreadsBeforeBuild).toBe(0);
  expect(data.capture.upstairsAssembly.visibleTreadsAfterBuild).toBe(17);
  expect(data.capture.upstairsAssembly.landingVisible).toBe(true);
  expect(data.capture.upstairsAssembly.hiddenUntil).toBeGreaterThanOrEqual(data.capture.shots.find((shot: {id: string}) => shot.id === 'living-tour').end);
});
