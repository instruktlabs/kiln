import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENE_DEDUPE, SCENE_FLAG_MODULE, THREE_FACADE, duplicatePackages, exportAliases, packageRoots, resolveScenesDir, sceneSiteConfig, stagedScenes, threeFacade } from './scene-source.mjs';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const temp = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-scene-source-'));
  directories.push(directory);
  return directory;
};
const json = (path: string, value: unknown) => mkdir(join(path, '..'), { recursive: true }).then(() => writeFile(path, JSON.stringify(value)));

/** A workspace with the two source packages the site builds into the Farm runtime. */
async function workspace(root: string) {
  await json(join(root, 'packages/farm/package.json'), { exports: { '.': './src/index.ts' } });
  await json(join(root, 'packages/scene-kit/package.json'), {
    exports: {
      '.': { browser: './src/index.browser.ts', default: './src/index.ts' },
      './instancing': './src/instancing/index.tsx',
    },
  });
  return root;
}

describe('scenes workspace location', () => {
  test('prefers the scenes source in the same repository', async () => {
    const root = await temp();
    const scenes = await workspace(join(root, 'kiln/scenes'));
    await workspace(join(root, 'kiln-commons/scenes'));
    expect(resolveScenesDir({ env: {}, site: join(root, 'kiln/site') })).toBe(scenes);
  });
  test('honours the environment, the sibling default and an explicit off', async () => {
    const root = await temp();
    const scenes = await workspace(join(root, 'kiln-commons/scenes'));
    const site = join(root, 'kiln-site-workbench/site');
    expect(resolveScenesDir({ env: {}, site })).toBe(scenes);
    expect(resolveScenesDir({ env: { KILN_SITE_SCENES_DIR: scenes }, site: root })).toBe(scenes);
    expect(resolveScenesDir({ env: { KILN_SITE_SCENES_DIR: 'kiln-commons/scenes' }, site: root })).toBe(scenes);
    expect(resolveScenesDir({ env: { KILN_SITE_SCENES_DIR: 'off' }, site })).toBeNull();
    expect(resolveScenesDir({ env: {}, site: root })).toBeNull();
  });

  test('a path that was asked for but is not a workspace is an error', async () => {
    const root = await temp();
    expect(() => resolveScenesDir({ env: { KILN_SITE_SCENES_DIR: join(root, 'missing') }, site: root })).toThrow('not a scenes workspace');
  });
});

describe('source aliases', () => {
  test('one exact alias per export, preferring the browser condition', async () => {
    const root = await temp();
    const scenes = await workspace(root);
    const aliases = exportAliases(join(scenes, 'packages/scene-kit'), '@kiln-scenes/scene-kit');
    const target = (specifier: string) => aliases.find((alias) => alias.find.test(specifier))?.replacement;
    expect(target('@kiln-scenes/scene-kit')).toBe(join(scenes, 'packages/scene-kit/src/index.browser.ts').replaceAll('\\', '/'));
    expect(target('@kiln-scenes/scene-kit/instancing')).toEndWith('/src/instancing/index.tsx');
    expect(target('@kiln-scenes/scene-kit/instancing/extra')).toBeUndefined();
    expect(target('@kiln-scenes/scene-kit-other')).toBeUndefined();
  });

  test('refuses export patterns it cannot resolve exactly', async () => {
    const root = await temp();
    await json(join(root, 'package.json'), { exports: { './*': './src/*.ts' } });
    expect(() => exportAliases(root, '@kiln-scenes/x')).toThrow('Unsupported');
  });

  test('bare three resolves to the scene kit facade, the way the kit builds a public scene', () => {
    expect(THREE_FACADE).toBe('packages/scene-kit/src/renderer/three-runtime.ts');
    const directory = join(tmpdir(), 'kiln-scenes');
    expect(threeFacade(directory)).toBe(join(directory, THREE_FACADE).replaceAll('\\', '/'));
  });
});

describe('one copy of the shared packages', () => {
  const at = (path: string) => `C:/site/node_modules/${path}`;
  test('accepts a single copy however deeply it is imported', () => {
    const ids = [at('three/build/three.core.js'), at('three/build/three.webgpu.js?v=1'), at('react/index.js'), at('react-dom/client.js'), at('@react-three/fiber/dist/x.js'), at('three-mesh-bvh/src/a.js')];
    expect(duplicatePackages(ids)).toEqual([]);
  });

  test('reports a second copy of three, React, React DOM or the fiber', () => {
    const ids = [
      at('three/build/three.core.js'),
      'C:/scenes/node_modules/.bun/three@0.186.0/node_modules/three/build/three.core.js',
      at('react/index.js'),
      'C:/scenes/node_modules/react/index.js',
      at('@react-three/fiber/dist/x.js'),
      'C:/scenes/node_modules/@react-three/fiber/dist/x.js',
    ];
    expect(duplicatePackages(ids).map((entry) => entry.name).sort()).toEqual(['@react-three/fiber', 'react', 'three']);
    expect(duplicatePackages(ids).find((entry) => entry.name === 'three')?.copies).toHaveLength(2);
    expect(SCENE_DEDUPE).toEqual(['three', 'react', 'react-dom', '@react-three/fiber']);
  });

  test('lists the package roots a bundle used, one entry per guarded package', () => {
    const roots = packageRoots([at('three/build/a.js'), at('three/build/b.js'), at('react/index.js')]);
    expect([...roots.get('three') ?? []]).toEqual(['C:/site/node_modules/three']);
    expect([...roots.get('react') ?? []]).toEqual(['C:/site/node_modules/react']);
    expect(roots.get('react-dom')?.size).toBe(0);
  });
});

describe('staged scenes', () => {
  const record = { base: '/scene-packs/farm/r34/' };
  const runtime = { kind: 'module', url: '/scene-runtime/farm/farm-abc.js', file: 'farm-abc.js', bytes: 10, gzipBytes: 5, sha256: 'a'.repeat(64) };

  /** A site directory holding the catalog and whichever halves of each scene are staged. */
  async function site(root: string, { farmRuntime, farmPack, goldenGate }: { farmRuntime: boolean; farmPack: boolean; goldenGate?: boolean }) {
    await json(join(root, 'src/data/scene-packs.json'), { farm: record, 'golden-gate': { base: '/scene-packs/golden-gate/g3/' } });
    if (farmRuntime) await json(join(root, 'public/scene-runtime/farm/runtime.json'), runtime);
    if (farmPack) await json(join(root, 'public/scene-packs/farm/r34/pack.json'), {});
    if (goldenGate) {
      await json(join(root, 'public/scene-runtime/golden-gate/runtime.json'), { ...runtime, kind: 'frame', url: '/scene-runtime/golden-gate/frame.html' });
      await json(join(root, 'public/scene-packs/golden-gate/g3/pack.json'), {});
    }
    return root;
  }

  test('a scene is included only when both its runtime and its pack are staged', async () => {
    const root = await temp();
    const both = stagedScenes(await site(join(root, 'both'), { farmRuntime: true, farmPack: true }));
    expect(both.farm).toEqual({ kind: 'module', url: runtime.url, file: runtime.file, bytes: 10, gzipBytes: 5, sha256: runtime.sha256, pack: { release: null, models: {}, source: null } });
    expect(both['golden-gate']).toBeNull();
    expect(stagedScenes(await site(join(root, 'runtime-only'), { farmRuntime: true, farmPack: false })).farm).toBeNull();
    expect(stagedScenes(await site(join(root, 'pack-only'), { farmRuntime: false, farmPack: true })).farm).toBeNull();
    expect(stagedScenes(join(root, 'empty'))).toEqual({ farm: null, 'golden-gate': null, 'foundry-floor': null });
  });

  test('a frame-kind scene is served through its frame page', async () => {
    const root = await temp();
    const scenes = stagedScenes(await site(root, { farmRuntime: true, farmPack: true, goldenGate: true }));
    expect(scenes['golden-gate']).toMatchObject({ kind: 'frame', url: '/scene-runtime/golden-gate/frame.html' });
  });

  test('a staged scene carries the release, model pins and source of its served pack.json', async () => {
    const root = await temp();
    const directory = await site(root, { farmRuntime: true, farmPack: true, goldenGate: true });
    await json(join(directory, 'public/scene-packs/golden-gate/g3/pack.json'), {
      release: 'g5',
      models: [{ id: 'bridge-web', path: 'bridge/web.glb' }],
      files: [{ path: 'bridge/web.glb', bytes: 3, sha256: 'b'.repeat(64) }, { path: 'data/scene.json', bytes: 2, sha256: 'c'.repeat(64) }],
      source: { bridge: { web: 'r_1' } },
    });
    expect(stagedScenes(directory)['golden-gate']?.pack).toEqual({ release: 'g5', models: { 'bridge-web': { path: 'bridge/web.glb', bytes: 3, sha256: 'b'.repeat(64) } }, source: { bridge: { web: 'r_1' } } });
    await json(join(directory, 'public/scene-packs/golden-gate/g3/pack.json'), { models: [{ id: 'bridge-web', path: 'bridge/web.glb' }], files: [] });
    expect(() => stagedScenes(directory)).toThrow('not a sealed file');
  });

  test('the pages read what is staged through one virtual module', async () => {
    const root = await temp();
    const config = sceneSiteConfig({ site: await site(root, { farmRuntime: true, farmPack: true }) });
    expect(config.included).toEqual(['farm']);
    const flag = config.plugins.find((plugin: { name: string }) => plugin.name === 'kiln-scene-flag');
    expect(SCENE_FLAG_MODULE).toBe('virtual:kiln-scenes');
    const id = flag.resolveId(SCENE_FLAG_MODULE);
    expect(id).toBe(`\0${SCENE_FLAG_MODULE}`);
    expect(flag.resolveId('other')).toBeUndefined();
    const source = flag.load(id) as string;
    expect(JSON.parse(source.replace('export const sceneRuntimes = ', '').replace(/;$/, ''))).toEqual({ farm: config.scenes.farm, 'golden-gate': null, 'foundry-floor': null });
    expect(flag.load('other')).toBeUndefined();
  });

  test('the site graph holds no scene code: no alias, no dedupe, no scene packages', async () => {
    const root = await temp();
    const config = sceneSiteConfig({ site: await site(root, { farmRuntime: true, farmPack: true }) }) as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(['included', 'plugins', 'scenes']);
  });
});
