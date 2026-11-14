import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILT_RUNTIMES, CEILINGS } from './scene-runtime.mjs';
import { RUNTIME_ENTRIES } from './typecheck-scenes.mjs';
import { SCENE_INPUT_IDS } from './scene-inputs.mjs';
import { FRAME_SCENES, SCENE_SOURCES } from './scene-pack.mjs';
import { stagedScenes } from './scene-source.mjs';
import { verifySceneDeliveryBinding } from './scene-delivery-binding.mjs';
import { sceneInMode, scenes, seedTownScene } from '../src/data/scenes';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const json = async (path: string, value: unknown) => { await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, JSON.stringify(value)); };

test('Seed Town is a separately built module using only its scene package and kit, with its own D-15 ceiling', async () => {
  expect(BUILT_RUNTIMES['seed-town']).toEqual({ entry: 'src/scenes/runtime/seed-town.ts', packages: ['seed-town', 'scene-kit'] });
  expect(RUNTIME_ENTRIES).toContain('src/scenes/runtime/seed-town.ts');
  const record = JSON.parse(await readFile(new URL('../../scenes/packages/seed-town/site-runtime.json', import.meta.url), 'utf8'));
  expect(record.ceiling.decision).toBe('D-15');
  expect(CEILINGS['seed-town']).toEqual({ bytes: record.ceiling.bytes, gzipBytes: record.ceiling.gzipBytes });
  expect(record.ceiling.bytes).toBe(Math.ceil(record.firstPassingBuild.bytes * 1.1));
  expect(record.ceiling.gzipBytes).toBe(Math.ceil(record.firstPassingBuild.gzipBytes * 1.1));
  expect(SCENE_INPUT_IDS).toContain('seed-town');
  expect(SCENE_SOURCES['seed-town']).toBe('.cache/site-inputs/seed-town/standalone');
  expect(FRAME_SCENES).not.toContain('seed-town');
});

test('Seed Town availability requires both the staged runtime and selected pack', async () => {
  const site = await mkdtemp(join(tmpdir(), 'seed-town-site-')); dirs.push(site);
  const record = { id: 'seed-town', base: '/scene-packs/seed-town/st1/' };
  const runtime = { kind: 'module', file: 'seed-town-current.js', url: '/scene-runtime/seed-town/seed-town-current.js' };
  await json(join(site, 'src/data/scene-packs.json'), { 'seed-town': record });
  expect(stagedScenes(site)['seed-town']).toBeNull();
  await json(join(site, 'public/scene-runtime/seed-town/runtime.json'), runtime);
  expect(stagedScenes(site)['seed-town']).toBeNull();
  await json(join(site, 'public', record.base, 'pack.json'), { release: 'st1', models: [{ id: 'roof', path: 'models/roof.glb' }], files: [{ path: 'models/roof.glb', bytes: 10, sha256: 'a'.repeat(64) }] });
  expect(stagedScenes(site)['seed-town']).toMatchObject({ kind: 'module', pack: { release: 'st1', models: { roof: { bytes: 10 } } } });
});

test('Seed Town module delivery binds its shell entry and selected pack', () => {
  const id = 'seed-town';
  const runtime = { schema: 'kiln.scene-runtime/1', id, kind: 'module', file: 'seed-town-current.js', url: `/scene-runtime/${id}/seed-town-current.js` };
  const record = { id, base: `/scene-packs/${id}/st1/` };
  const shellHtml = `<scene-shell data-scene="${id}" data-kind="module" data-runtime-url="${runtime.url}" data-asset-base="${record.base}"></scene-shell>`;
  expect(verifySceneDeliveryBinding({ id, record, runtime, shellHtml })).toMatchObject({ id, kind: 'module' });
  expect(() => verifySceneDeliveryBinding({ id, record, runtime, shellHtml: shellHtml.replace('st1', 'st0') })).toThrow();
  expect(() => verifySceneDeliveryBinding({ id, record, runtime: { ...runtime, kind: 'frame' }, shellHtml })).toThrow();
});

test('the page uses the common shell and normal scene indexing without eager runtime imports', async () => {
  const page = await readFile(new URL('../src/pages/scenes/seed-town.astro', import.meta.url), 'utf8');
  expect(page).toContain('<SceneShell scene="seed-town">');
  expect(page).toContain('title="Seed Town scene · Kiln"');
  expect(page).toContain('Every seed is a different town.');
  expect(page).not.toContain('noindex');
  expect(page).not.toContain('@kiln-scenes/seed-town');
});

test('the runtime entry stays thin: the address module owns parsing and the address, the package owns the scene', async () => {
  const entry = await readFile(new URL('../src/scenes/runtime/seed-town.ts', import.meta.url), 'utf8');
  expect(entry).toContain("from '@kiln-scenes/seed-town'");
  expect(entry).toContain("from '../seed-town-address'");
  expect(entry).toContain('readTownAddress(location.search)');
  expect(entry).toContain('history.replaceState');
  expect(entry).toContain('export { REVISION }');
});

test('Seed Town is in the scene map with its copy, and both build modes fall back to a page that exists', () => {
  expect(scenes['seed-town']).toBe(seedTownScene);
  expect(seedTownScene.available).toBe(false);
  expect(seedTownScene.name).toBe('Seed Town');
  expect(seedTownScene.href).toBe('/scenes/seed-town/');
  expect(seedTownScene.description).toBe('A small old town built in your browser from nine kit models: type a seed for a different town, then walk its streets by day or at dusk.');
  expect(seedTownScene.copy.available).toBe('Explore Seed Town in your browser.');
  expect(seedTownScene.copy.preview).toBe('Explore opens the Seed Town scene preview.');
  expect(seedTownScene.copy.devices).toBe('Desktop and touch controls. Loads only when you choose Explore.');
  expect(seedTownScene.links).toEqual([{ label: 'Credits and notices', path: 'THIRD-PARTY-NOTICES.txt' }]);
  // The poster is the recorded capture of the scene itself, with a description of what it shows.
  expect(seedTownScene.poster).toBe('/media/scenes/seed-town/st1/seed-town-scene-town.webp');
  expect([seedTownScene.posterWidth, seedTownScene.posterHeight]).toEqual([2560, 1440]);
  expect(seedTownScene.posterAlt).toContain('market square');
  // The pack overview is a static page, so both build modes fall back to it, as Cathedral Square does.
  for (const packsEnabled of [false, true]) {
    expect(sceneInMode('seed-town', packsEnabled).fallback).toEqual({ href: '/packs/seed-town/', label: 'View the Seed Town pack' });
  }
});

test('the scene page links to the Seed Town pack, and the scenes index describes both town scenes', async () => {
  const page = await readFile(new URL('../src/pages/scenes/seed-town.astro', import.meta.url), 'utf8');
  expect(page).toContain('href="/packs/seed-town/"');
  expect(page).not.toContain('href="/gallery/"');
  const index = await readFile(new URL('../src/pages/scenes/index.astro', import.meta.url), 'utf8');
  const description = /description="([^"]+)"/.exec(index)?.[1] ?? '';
  expect(description).toContain('Cathedral Square');
  expect(description).toContain('Seed Town');
  expect(description.startsWith('Explore Cathedral Square')).toBe(false);
});

test('the Seed Town scene picture is a pinned capture of the pack the page loads', async () => {
  const read = async (path: string) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
  const media = (await read('../src/data/scene-media.json'))['seed-town'];
  const pack = (await read('../src/data/scene-packs.json'))['seed-town'];
  expect(media.poster.inputPath).toBe(`media/scenes/seed-town/${pack.release}/seed-town-scene-town.png`);
  expect(media.poster.width).toBe(2560);
  expect(media.poster.alt.length).toBeGreaterThan(40);
  expect(media.capture.packJsonSha256).toBe(pack.packJsonSha256);
  const pin = (await read('../src/data/mirror-manifest.json')).files.find((row: { path: string }) => row.path === media.poster.inputPath);
  expect(pin).toMatchObject({ bytes: media.capture.pngBytes, sha256: media.capture.pngSha256 });
  expect((await read('../src/data/commons-build.json')).images.find((row: { inputPath: string }) => row.inputPath === media.poster.inputPath)).toEqual(media.poster);
  expect(seedTownScene.poster).toBe(media.poster.src);
});
