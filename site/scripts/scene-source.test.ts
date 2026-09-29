import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SCENE_DEDUPE, duplicatePackages, exportAliases, resolveScenesDir, sceneSourceConfig } from './scene-source.mjs';

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

/** A workspace with the two source packages the site consumes. */
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
});

describe('site build settings', () => {
  async function site(root: string, staged: boolean) {
    await json(join(root, 'src/data/packs/farm.json'), { scene: { pack: { base: '/scene-packs/farm/r34/' } } });
    if (staged) await json(join(root, 'public/scene-packs/farm/r34/pack.json'), {});
    return root;
  }

  test('consumes the workspace as source when a pack is staged', async () => {
    const root = await temp();
    const scenes = await workspace(join(root, 'scenes'));
    const config = sceneSourceConfig({ site: await site(join(root, 'site'), true), env: { KILN_SITE_SCENES_DIR: scenes } });
    expect(config.included).toBe(true);
    expect(config.resolve.dedupe).toEqual(SCENE_DEDUPE);
    expect(config.define).toEqual({ 'import.meta.env.KILN_DEV': false, 'import.meta.env.KILN_TEST': false });
    expect(config.server.fs.allow).toEqual([join(root, 'site'), scenes]);
    const specifiers = ['@kiln-scenes/farm', '@kiln-scenes/scene-kit', '@kiln-scenes/scene-kit/instancing'];
    for (const specifier of specifiers) expect(config.resolve.alias.some((alias: { find: RegExp }) => alias.find.test(specifier))).toBe(true);
    expect(config.plugins.map((plugin: { name: string }) => plugin.name)).toContain('kiln-scene-single-copy');
  });

  test('falls back to the site stand-in without a workspace or without a staged pack', async () => {
    const root = await temp();
    const scenes = await workspace(join(root, 'scenes'));
    for (const [env, staged] of [[{ KILN_SITE_SCENES_DIR: 'off' }, true], [{ KILN_SITE_SCENES_DIR: scenes }, false]] as const) {
      const directory = await site(join(root, `site-${String(staged)}-${env.KILN_SITE_SCENES_DIR === 'off'}`), staged);
      const config = sceneSourceConfig({ site: directory, env });
      expect(config.included).toBe(false);
      expect(config.resolve.alias).toEqual([{ find: /^@kiln-scenes\/farm$/, replacement: resolve(directory, 'src/scenes/farm/unavailable.tsx').replaceAll('\\', '/') }]);
      expect(config.plugins.map((plugin: { name: string }) => plugin.name)).not.toContain('kiln-scene-single-copy');
    }
  });
});
