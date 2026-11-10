import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_RUNTIMES } from './scene-runtime.mjs';
import { stagedScenes } from './scene-source.mjs';
import { verifySceneDeliveryBinding } from './scene-delivery-binding.mjs';
import { cathedralSquareScene, sceneInMode, scenes } from '../src/data/scenes';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const json = async (path: string, value: unknown) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)); };

test('Cathedral is a separately built module using only its scene package and kit', () => {
  expect(BUILT_RUNTIMES['cathedral-square']).toEqual({ entry: 'src/scenes/runtime/cathedral-square.ts', packages: ['cathedral-square', 'scene-kit'] });
  expect(BUILT_RUNTIMES.farm.packages).toEqual(['farm', 'scene-kit']);
});

test('Cathedral availability requires both the staged runtime and selected pack', async () => {
  const site = await mkdtemp(join(tmpdir(), 'cathedral-site-')); dirs.push(site);
  const record = { id: 'cathedral-square', base: '/scene-packs/cathedral-square/cs2/' };
  const runtime = { kind: 'module', file: 'cathedral-current.js', url: '/scene-runtime/cathedral-square/cathedral-current.js' };
  await json(join(site, 'src/data/scene-packs.json'), { 'cathedral-square': record });
  expect(stagedScenes(site)['cathedral-square']).toBeNull();
  await json(join(site, 'public/scene-runtime/cathedral-square/runtime.json'), runtime);
  expect(stagedScenes(site)['cathedral-square']).toBeNull();
  await json(join(site, 'public', record.base, 'pack.json'), { release: 'cs2', models: [{ id: 'cathedral', path: 'cathedral.glb' }], files: [{ path: 'cathedral.glb', bytes: 10, sha256: 'a'.repeat(64) }] });
  expect(stagedScenes(site)['cathedral-square']).toMatchObject({ kind: 'module', pack: { release: 'cs2', models: { cathedral: { bytes: 10 } } } });
});

test('Cathedral module delivery binds its shell entry and selected cs2 pack', () => {
  const id = 'cathedral-square';
  const runtime = { schema: 'kiln.scene-runtime/1', id, kind: 'module', file: 'cathedral-current.js', url: `/scene-runtime/${id}/cathedral-current.js` };
  const record = { id, base: `/scene-packs/${id}/cs2/` };
  const shellHtml = `<scene-shell data-scene="${id}" data-kind="module" data-runtime-url="${runtime.url}" data-asset-base="${record.base}"></scene-shell>`;
  expect(verifySceneDeliveryBinding({ id, record, runtime, shellHtml })).toMatchObject({ id, kind: 'module' });
  expect(() => verifySceneDeliveryBinding({ id, record, runtime, shellHtml: shellHtml.replace('cs2', 'cs1') })).toThrow();
  expect(() => verifySceneDeliveryBinding({ id, record, runtime: { ...runtime, kind: 'frame' }, shellHtml })).toThrow();
});

test('the page uses the common shell and normal scene indexing without eager runtime imports', async () => {
  const page = await readFile(new URL('../src/pages/scenes/cathedral-square.astro', import.meta.url), 'utf8');
  expect(page).toContain('<SceneShell scene="cathedral-square">');
  expect(page).not.toContain('noindex');
  expect(page).not.toContain('@kiln-scenes/cathedral-square');
});

test('the scene selector includes Cathedral and packs-off fallback keeps the static pack overview', async () => {
  expect(scenes['cathedral-square']).toBe(cathedralSquareScene);
  expect(cathedralSquareScene.available).toBe(false);
  expect(sceneInMode('cathedral-square', false).fallback.href).toBe('/packs/cathedral-square/');
  expect(sceneInMode('cathedral-square', true).fallback.href).toBe('/packs/cathedral-square/');
  const selector = await readFile(new URL('../src/components/SceneSelector.astro', import.meta.url), 'utf8');
  expect(selector).toContain('sceneBrowseGroups(PACKS_ENABLED)');
  expect(selector).toContain('<select');
  const shell = await readFile(new URL('../src/components/SceneShell.astro', import.meta.url), 'utf8');
  const listing = await readFile(new URL('../src/pages/scenes/index.astro', import.meta.url), 'utf8');
  expect(shell).toContain('<SceneSelector current={id}');
  expect(listing).toContain('<SceneSelector');
});
