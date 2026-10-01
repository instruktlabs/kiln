import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import scenePacks from '../src/data/scene-packs.json';
import { hashBytes } from './mirror-core.mjs';
import { CEILINGS, FRAME_FILE, RUNTIME_SCHEMA, checkCeiling, frameDocument, gzipMeasure, main, measureFrameRuntime, packageCopies, runtimeManifest, runtimeViteConfig, singleCopyGuard, stageFrameRuntime, stagedRuntimeDirectory, verifyStagedRuntime } from './scene-runtime.mjs';
import { SCENE_DEDUPE, resolveScenesDir, threeFacade } from './scene-source.mjs';

const SITE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
const temp = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kiln-scene-runtime-'));
  directories.push(directory);
  return directory;
};
const json = (path: string, value: unknown) => mkdir(join(path, '..'), { recursive: true }).then(() => writeFile(path, JSON.stringify(value)));

const FACADE = 'C:/scenes/packages/scene-kit/src/renderer/three-runtime.ts';
const oneCopy = [FACADE, 'C:/scenes/node_modules/.bun/three@0.186.0/node_modules/three/build/three.core.js', 'C:/scenes/node_modules/react/index.js', 'C:/scenes/node_modules/@react-three/fiber/dist/x.js'];

/** A standalone build as the scene kit leaves it: the public chunk beside its module list. */
async function standalone(root: string, { chunk = 'export const scene = 1;\n', modules = oneCopy, name = 'index-abc123.js' } = {}) {
  const source = join(root, 'standalone');
  await mkdir(join(source, 'assets'), { recursive: true });
  await writeFile(join(source, 'assets', name), chunk);
  await writeFile(join(source, 'bundle-modules.json'), JSON.stringify({ modules }));
  return source;
}

describe('per-scene ceilings', () => {
  test('carry the D-15 figures the scenes froze', () => {
    expect(CEILINGS.farm).toEqual({ bytes: 1_732_040, gzipBytes: 506_143 });
    expect(CEILINGS['golden-gate']).toEqual({ bytes: 1_796_415, gzipBytes: 530_691 });
    expect(CEILINGS['foundry-floor']).toEqual({ bytes: 1_750_625, gzipBytes: 490_730 });
  });

  test('a measurement is within a ceiling only when both figures are', () => {
    expect(checkCeiling('farm', { bytes: 1_582_844, gzipBytes: 462_811 })).toMatchObject({ within: true, percent: { bytes: 91.4, gzipBytes: 91.4 } });
    expect(checkCeiling('farm', { bytes: 1_936_544, gzipBytes: 547_238 })).toMatchObject({ within: false, percent: { bytes: 111.8, gzipBytes: 108.1 } });
    expect(checkCeiling('farm', { bytes: 1_732_040, gzipBytes: 506_144 }).within).toBe(false);
    expect(checkCeiling('farm', { bytes: 1_732_041, gzipBytes: 506_143 }).within).toBe(false);
    expect(checkCeiling('other', { bytes: 1, gzipBytes: 1 })).toEqual({ within: null, ceiling: null });
  });

  test.each(['golden-gate', 'foundry-floor'] as const)('the recorded %s standalone runtime sits inside its ceiling', (id) => {
    const runtime = scenePacks[id].runtime;
    expect(checkCeiling(id, runtime).within).toBe(true);
    expect(runtime.gzipMethod).toBe('bun-zlib');
    expect(runtime.file).toMatch(/^index-[A-Za-z0-9_-]+\.js$/);
  });
});

describe('gzip as the ceilings measure it', () => {
  const bytes = Buffer.from(Array.from({ length: 20_000 }, (_, index) => `line ${index} of the scene chunk ${(index * 2654435761) % 977}\n`).join(''));

  test('is Bun zlib at its default level under Bun', () => {
    expect(gzipMeasure(bytes)).toEqual({ bytes: gzipSync(bytes).length, method: 'bun-zlib' });
  });

  const node = Bun.which('node');
  test.skipIf(!node)('a run under Node asks Bun, whose zlib differs from Node zlib', async () => {
    const sample = join(await temp(), 'sample.bin');
    await writeFile(sample, bytes);
    const script = `import { readFileSync } from 'node:fs'; const { gzipMeasure } = await import(${JSON.stringify(pathToFileURL(join(SITE, 'scripts/scene-runtime.mjs')).href)}); console.log(JSON.stringify(gzipMeasure(readFileSync(${JSON.stringify(sample)}))));`;
    const result = spawnSync(node as string, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ bytes: gzipSync(bytes).length, method: 'bun-zlib' });
  });
});

describe('runtime build settings', () => {
  async function workspace(root: string) {
    await json(join(root, 'packages/farm/package.json'), { exports: { '.': './src/index.ts' } });
    await json(join(root, 'packages/scene-kit/package.json'), { exports: { '.': { browser: './src/index.browser.ts', default: './src/index.ts' } } });
    return root;
  }
  const config = (scenesDir: string, alias = true) => runtimeViteConfig({ react: () => ({ name: 'react' }), scenesDir, packages: ['farm', 'scene-kit'], entry: 'src/scenes/runtime/farm.ts', outDir: 'out', name: 'farm', alias, site: SITE });

  test('resolve bare three to the kit facade, one copy of the shared packages, public constants', async () => {
    const scenes = await workspace(await temp());
    const built = config(scenes);
    expect(built.resolve.dedupe).toEqual(SCENE_DEDUPE);
    expect(built.resolve.alias[0]).toEqual({ find: /^three$/, replacement: threeFacade(scenes) });
    expect(built.resolve.alias.map((alias: { find: RegExp }) => alias.find.source)).toEqual(['^three$', '^@kiln-scenes\\/farm$', '^@kiln-scenes\\/scene-kit$']);
    expect(built.define).toEqual({ 'import.meta.env.KILN_DEV': false, 'import.meta.env.KILN_TEST': false });
  });

  test('a measurement without the facade drops only that alias', async () => {
    const scenes = await workspace(await temp());
    const built = config(scenes, false);
    expect(built.resolve.alias.some((alias: { find: RegExp }) => alias.find.test('three'))).toBe(false);
    expect(built.resolve.alias).toHaveLength(2);
    expect(built.resolve.dedupe).toEqual(SCENE_DEDUPE);
  });

  test('builds one application chunk apart from the site config, without public files or sourcemaps', async () => {
    const scenes = await workspace(await temp());
    const built = config(scenes);
    expect(built.configFile).toBe(false);
    expect(built.publicDir).toBe(false);
    expect(built.build.sourcemap).toBe(false);
    expect(built.build.rollupOptions.output).toMatchObject({ entryFileNames: 'farm-[hash].js', codeSplitting: false });
    expect(String(built.build.rollupOptions.input.farm).replaceAll('\\', '/')).toEndWith('/src/scenes/runtime/farm.ts');
    expect(built.build.modulePreload).toBe(false);
  });
});

describe('one copy of the shared packages in a runtime build', () => {
  test('the guard passes one copy and names a second', () => {
    const plugin = singleCopyGuard();
    const context = { error: (message: string) => { throw new Error(message); } };
    const bundle = (ids: string[]) => ({ 'farm.js': { type: 'chunk', modules: Object.fromEntries(ids.map((id) => [id, {}])) } });
    expect(() => plugin.generateBundle.call(context, {}, bundle(oneCopy))).not.toThrow();
    expect(() => plugin.generateBundle.call(context, {}, bundle([...oneCopy, 'C:/site/node_modules/three/build/three.core.js']))).toThrow('three');
    let seen: string[] = [];
    singleCopyGuard((ids: string[]) => { seen = ids; }).generateBundle.call(context, {}, bundle(oneCopy));
    expect(seen).toEqual(oneCopy);
  });

  test('lists the package roots a bundle used', () => {
    expect(packageCopies(oneCopy)).toEqual({
      three: ['C:/scenes/node_modules/.bun/three@0.186.0/node_modules/three'],
      react: ['C:/scenes/node_modules/react'],
      'react-dom': [],
      '@react-three/fiber': ['C:/scenes/node_modules/@react-three/fiber'],
    });
  });
});

describe('a standalone runtime staged as built', () => {
  test('measures the public chunk, its module list and its ceiling', async () => {
    const root = await temp();
    const source = await standalone(root);
    const { measurement, record } = await measureFrameRuntime({ id: 'golden-gate', source });
    expect(measurement).toMatchObject({ id: 'golden-gate', file: 'index-abc123.js', bytes: 24, facade: true });
    expect(measurement.copies.three).toHaveLength(1);
    expect(measurement.sha256).toBe(hashBytes(Buffer.from('export const scene = 1;\n')));
    expect(record).toMatchObject({ kind: 'frame', file: 'index-abc123.js', bytes: 24, sha256: measurement.sha256 });
    expect(record.modulesSha256).toBe(hashBytes(await readFile(join(source, 'bundle-modules.json'))));
  });

  test('refuses a second entry, a second three, a missing facade and a bundle over its ceiling', async () => {
    const two = await standalone(await temp());
    await writeFile(join(two, 'assets', 'index-other.js'), 'x');
    await expect(measureFrameRuntime({ id: 'golden-gate', source: two })).rejects.toThrow('one public entry');

    const duplicated = await standalone(await temp(), { modules: [...oneCopy, 'C:/site/node_modules/three/build/three.core.js'] });
    await expect(measureFrameRuntime({ id: 'golden-gate', source: duplicated })).rejects.toThrow('more than one copy');

    const noFacade = await standalone(await temp(), { modules: oneCopy.slice(1) });
    await expect(measureFrameRuntime({ id: 'golden-gate', source: noFacade })).rejects.toThrow('facade');

    const heavy = await standalone(await temp(), { chunk: 'a'.repeat(CEILINGS['golden-gate'].bytes + 1) });
    await expect(measureFrameRuntime({ id: 'golden-gate', source: heavy })).rejects.toThrow('D-15 ceiling');
  });

  test('stages every split chunk and applies the frozen ceiling to the aggregate payload', async () => {
    const root = await temp();
    const source = await standalone(root, { chunk: 'import "./renderer-def456.js";\n' });
    const dependency = 'export const renderer = true;\n';
    await writeFile(join(source, 'assets/renderer-def456.js'), dependency);
    const measured = await measureFrameRuntime({ id: 'foundry-floor', source });
    expect(measured.record.chunks).toHaveLength(2);
    expect(measured.measurement.bytes).toBe(61);
    expect(measured.measurement.gzipBytes).toBe(gzipMeasure(Buffer.from('import "./renderer-def456.js";\n')).bytes + gzipMeasure(Buffer.from(dependency)).bytes);
    const site = join(root, 'site');
    await stageFrameRuntime({ id: 'foundry-floor', source, measurement: measured, packBase: '/scene-packs/foundry-floor/ff3/', site });
    const target = stagedRuntimeDirectory('foundry-floor', site);
    expect(await readFile(join(target, 'renderer-def456.js'), 'utf8')).toBe(dependency);
    expect((await verifyStagedRuntime(target)).chunks).toHaveLength(2);
    await writeFile(join(target, 'renderer-def456.js'), 'corrupt');
    await expect(verifyStagedRuntime(target)).rejects.toThrow('does not match');
    await writeFile(join(source, 'assets/renderer-def456.js'), 'x'.repeat(CEILINGS['foundry-floor'].bytes));
    await expect(measureFrameRuntime({ id: 'foundry-floor', source })).rejects.toThrow('D-15 ceiling');
  });

  test('stages the chunk byte for byte with a frame page and a manifest that carries no local path', async () => {
    const root = await temp();
    const source = await standalone(root);
    const site = join(root, 'site');
    const measured = await measureFrameRuntime({ id: 'golden-gate', source });
    const manifest = await stageFrameRuntime({ id: 'golden-gate', source, measurement: measured, packBase: '/scene-packs/golden-gate/g3/', site });
    const target = stagedRuntimeDirectory('golden-gate', site);
    expect(await readFile(join(target, 'index-abc123.js'), 'utf8')).toBe('export const scene = 1;\n');
    expect(manifest).toMatchObject({ schema: RUNTIME_SCHEMA, kind: 'frame', url: `/scene-runtime/golden-gate/${FRAME_FILE}`, chunk: '/scene-runtime/golden-gate/index-abc123.js', sha256: measured.measurement.sha256 });
    expect(manifest.frameSha256).toBe(hashBytes(await readFile(join(target, FRAME_FILE))));
    expect(JSON.stringify(manifest)).not.toMatch(/[A-Za-z]:[\\/]|\/Users\//);
    expect(await verifyStagedRuntime(target)).toMatchObject({ file: 'index-abc123.js', bytes: 24 });
    await writeFile(join(target, 'index-abc123.js'), 'export const scene = 2;\n');
    await expect(verifyStagedRuntime(target)).rejects.toThrow('does not match');
  });

  test('the frame page is unindexed, loads the chunk as built and reports through postMessage', () => {
    const page = frameDocument({ id: 'golden-gate', file: 'index-abc123.js', packBase: '/scene-packs/golden-gate/g3/' });
    // The same doctype spelling as every page Astro emits, so the HTML validator treats the frame like the site.
    expect(page.startsWith('<!DOCTYPE html>\n<html lang="en">')).toBe(true);
    expect(page).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(page).toContain('<meta name="kiln-asset-base" content="/scene-packs/golden-gate/g3/">');
    expect(page).toContain('<script type="module" src="./index-abc123.js"></script>');
    expect(page).toContain('id="golden-gate"');
    expect(page).toMatch(/source: ['"]kiln-scene['"]/);
    expect(page).toContain('location.origin');
  });
});

describe('a runtime manifest', () => {
  test('records the measurement, the ceiling it was held to and the three it carries', () => {
    const measurement = { file: 'farm-abc.js', bytes: 1_582_844, gzipBytes: 462_811, gzipMethod: 'bun-zlib', sha256: 'a'.repeat(64), facade: true, copies: { three: ['C:/scenes/node_modules/.bun/three@0.186.0/node_modules/three'], react: [], 'react-dom': [], '@react-three/fiber': [] } };
    const manifest = runtimeManifest('farm', measurement, { site: SITE });
    expect(manifest).toMatchObject({ schema: RUNTIME_SCHEMA, id: 'farm', kind: 'module', url: '/scene-runtime/farm/farm-abc.js', bytes: 1_582_844 });
    expect(manifest.ceiling).toMatchObject({ bytes: 1_732_040, gzipBytes: 506_143, decision: 'D-15', withinCeiling: true });
    expect(manifest.three).toMatchObject({ facade: true, copies: { three: ['node_modules/three'] } });
    expect(manifest.build.dedupe).toEqual(SCENE_DEDUPE);
  });
});

describe('without a scenes workspace', () => {
  test('keeps the fallback and removes a runtime staged earlier', async () => {
    const root = await temp();
    spyOn(console, 'log').mockImplementation(() => {});
    await json(join(root, 'public/scene-runtime/farm/runtime.json'), {});
    expect(await main(['--scene', 'farm'], { KILN_SITE_SCENES_DIR: 'off' }, root)).toBeNull();
    expect(existsSync(join(root, 'public/scene-runtime/farm'))).toBe(false);
  });
});

/**
 * Drift against the kit: the build settings here restate the kit's `sceneSourceConfig('public')`, which
 * lives in the sibling workspace. Where that workspace exists the two are compared, so a change to the kit's
 * alias, dedupe list or constants fails here rather than shipping a runtime the kit would not build.
 */
describe('agreement with the scene kit build', () => {
  const scenes = (() => {
    try {
      return resolveScenesDir({ env: process.env, site: SITE });
    } catch {
      return null;
    }
  })();

  test.skipIf(!scenes)('the alias, the dedupe list and the public constants are the kit\'s', async () => {
    const kit = await import(pathToFileURL(join(scenes as string, 'packages/scene-kit/src/build/index.ts')).href);
    expect(kit.SCENE_DEDUPE).toEqual(SCENE_DEDUPE);
    expect(String(kit.THREE_RUNTIME_FACADE).replaceAll('\\', '/')).toBe(threeFacade(scenes as string));
    const config = kit.sceneSourceConfig('public');
    expect(config.resolve.dedupe).toEqual(SCENE_DEDUPE);
    expect(config.resolve.alias).toEqual([{ find: /^three$/, replacement: kit.THREE_RUNTIME_FACADE }]);
    const ours = runtimeViteConfig({ react: () => ({ name: 'react' }), scenesDir: scenes as string, packages: [], entry: 'x.ts', outDir: 'out', name: 'x', site: SITE });
    expect(ours.define).toEqual(config.define);
    expect(ours.resolve.alias[0].find.source).toBe(config.resolve.alias[0].find.source);
  });

  test.skipIf(!scenes)('the Farm ceiling is the figure the scenes decision log records', async () => {
    const decisions = await readFile(join(scenes as string, 'DECISIONS.md'), 'utf8');
    expect(decisions).toContain(CEILINGS.farm.bytes.toLocaleString('en-US'));
    expect(decisions).toContain(CEILINGS.farm.gzipBytes.toLocaleString('en-US'));
  });

  // The Golden Gate and Foundry Floor ceilings are frozen in each scene's own build tool.
  test.skipIf(!scenes).each(['golden-gate', 'foundry-floor'] as const)('the %s ceiling is the figure its build tool freezes', async (id) => {
    const build = await readFile(join(scenes as string, 'packages', id, 'tests/tools/build.ts'), 'utf8');
    const frozen = /bytes: (\d+), gzipBytes: (\d+),?\s*\}? as const;|bytes: (\d+), gzipBytes: (\d+),\s*\n\s*\} as const;/.exec(build);
    const [bytes, gzipBytes] = (frozen?.slice(1).filter(Boolean) ?? []).map(Number);
    expect({ bytes, gzipBytes }).toEqual(CEILINGS[id]);
  });
});
