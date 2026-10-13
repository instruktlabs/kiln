import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagedScenes } from './scene-source.mjs';
import { cabinWoodsScene } from '../src/data/scenes';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
const id = 'cabin-woods-psx-horror';
const base = `/asset-demos/${id}/`;
const html = '<!doctype html><title>Cabin in the Woods: PSX Horror</title>';
const sha256 = createHash('sha256').update(html).digest('hex');
async function fixture({ pack = true, entry = true, hash = sha256 } = {}) {
  const site = await mkdtemp(join(tmpdir(), 'kiln-cabin-woods-'));
  directories.push(site);
  await mkdir(join(site, 'src/data'), { recursive: true });
  await writeFile(join(site, 'src/data', `${id}.json`), JSON.stringify({ base, available: false, runtime: { file: 'web/game.html', sha256: hash } }));
  const directory = join(site, 'public', base);
  await mkdir(join(directory, 'web'), { recursive: true });
  if (pack) await writeFile(join(directory, 'pack.json'), JSON.stringify({ release: 'candidate-1', models: [{ id: 'stone-golem', path: 'models/stone-golem.glb' }], files: [{ path: 'models/stone-golem.glb', bytes: 42, sha256: 'a'.repeat(64) }], source: { status: 'owner-review-pending' } }));
  if (entry) await writeFile(join(directory, 'web/game.html'), html);
  return site;
}
test('candidate frame requires both sealed pack and real entry HTML', async () => {
  expect(stagedScenes(await fixture({ pack: false }))[id]).toBeNull();
  expect(stagedScenes(await fixture({ entry: false }))[id]).toBeNull();
});
test('candidate uses SceneShell frame registration and carries exact source/model pins', async () => {
  expect(stagedScenes(await fixture())[id]).toMatchObject({ kind: 'frame', url: `${base}web/game.html`, sha256, pack: { release: 'candidate-1', models: { 'stone-golem': { path: 'models/stone-golem.glb', bytes: 42, sha256: 'a'.repeat(64) } }, source: { status: 'owner-review-pending' } } });
});
test('mismatched or malformed entry seal does not register a candidate', async () => {
  expect(stagedScenes(await fixture({ hash: 'b'.repeat(64) }))[id]).toBeNull();
  expect(stagedScenes(await fixture({ hash: 'not-a-hash' }))[id]).toBeNull();
});
test('optional entry seal may be absent, but never replaces the file guard', async () => {
  const site = await fixture();
  await writeFile(join(site, 'src/data', `${id}.json`), JSON.stringify({ base, available: false }));
  expect(stagedScenes(site)[id]).toMatchObject({ kind: 'frame', url: `${base}web/game.html` });
});
test('published pages use the shared shell, remain discoverable and retain device limits', async () => {
  const scene = await readFile(new URL('../src/pages/scenes/cabin-woods-psx-horror.astro', import.meta.url), 'utf8');
  const pack = await readFile(new URL('../src/pages/packs/cabin-woods-psx-horror.astro', import.meta.url), 'utf8');
  expect(scene).toContain('<SceneShell scene="cabin-woods-psx-horror">');
  expect(scene).not.toContain('<iframe');
  for (const page of [scene, pack]) {
    expect(page).not.toContain('noindex nofollow');
    expect(page).not.toMatch(/owner.{0,20}(pending|approval)|publication.{0,10}pending/i);
    expect(page).toContain('cabinWoods.name');
    expect(page).not.toMatch(/The Nightman Cometh|Nightman|WebGL2/);
  }
  expect(cabinWoodsScene.available).toBe(true);
  expect(cabinWoodsScene.name).toBe('Cabin in the Woods: PSX Horror');
  expect(cabinWoodsScene.description).toContain('Stone Golem');
  expect(cabinWoodsScene.copy.devices).toContain('Requires WebGPU');
  expect(cabinWoodsScene.copy.devices).toContain('Mobile play is not qualified');
  expect(cabinWoodsScene.copy.preview).not.toMatch(/pending|owner.review/i);
  const home = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  expect(home).not.toContain('Owner review preview.');
  for (const name of ['downloads', 'assets', 'posters', 'textureResources']) {
    expect(pack).toMatch(new RegExp(`const ${name} = PACKS_ENABLED \\?`));
  }
});
test('WebGPU-only candidate overrides graphics errors without changing older scene defaults', async () => {
  const shell = await readFile(new URL('../src/components/SceneShell.astro', import.meta.url), 'utf8');
  expect(shell).toContain('data-renderer-error-text=');
  expect(shell).toContain('this.dataset.rendererErrorText ??');
  expect(shell).toContain('Try a browser with WebGL2 or WebGPU enabled.');
  expect(cabinWoodsScene.copy).toHaveProperty('rendererErrorText');
  expect((cabinWoodsScene.copy as { rendererErrorText?: string }).rendererErrorText).toContain('WebGPU');
  expect((cabinWoodsScene.copy as { rendererErrorText?: string }).rendererErrorText).not.toContain('WebGL2');
});
test('full Kiln profile is explicitly remixable while keeping generic download defaults', async () => {
  const component = await readFile(new URL('../src/components/AssetDownloads.astro', import.meta.url), 'utf8');
  const page = await readFile(new URL('../src/pages/gallery/cabin-woods-psx-horror/[slug].astro', import.meta.url), 'utf8');
  expect(component).toContain('editableLabel');
  expect(page).toContain('Full Kiln assets (remixable)');
  expect(page).toContain('Import this ZIP');
});

