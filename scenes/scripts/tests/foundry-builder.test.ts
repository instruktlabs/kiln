import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as builder from '../../packages/foundry-floor/tests/tools/rebuild-code';

const packageRoot = resolve(import.meta.dir, '../../packages/foundry-floor');
mkdirSync(resolve(packageRoot, 'dist'), { recursive: true });

test('Foundry code rebuild keeps its default and accepts a separate owned output directory', () => {
  const input = resolve(packageRoot, 'dist/revision2-code/standalone');
  expect(builder.codeRebuildDirectory('/sealed/input')).toBe(resolve(packageRoot, 'dist/revision2-code'));
  expect(builder.codeRebuildDirectory(input, 'packages/foundry-floor/dist/alignment-ui2')).toBe(resolve(packageRoot, 'dist/alignment-ui2'));
  for (const output of [packageRoot, resolve(packageRoot, 'dist'), resolve(packageRoot, '../farm/dist/new'), resolve(packageRoot, 'src')]) {
    expect(() => builder.codeRebuildDirectory(input, output)).toThrow(/owned output/);
  }
});

test('Foundry refuses overlapping input and output before reading or replacing the sealed input', async () => {
  const root = mkdtempSync(resolve(packageRoot, 'dist/builder-output-test-'));
  const output = resolve(root, 'candidate'), input = resolve(output, 'standalone');
  mkdirSync(input, { recursive: true });
  const sentinel = resolve(input, 'retained.txt'); writeFileSync(sentinel, 'sealed input');
  try {
    await expect(builder.rebuildCode(input, { outputDir: output })).rejects.toThrow(/overlap/);
    expect(readFileSync(sentinel, 'utf8')).toBe('sealed input');
    expect(() => builder.codeRebuildDirectory(root, output)).toThrow(/overlap/);
    const alias = resolve(root, 'input-alias'); symlinkSync(input, alias, 'junction');
    expect(() => builder.codeRebuildDirectory(alias, output)).toThrow(/overlap/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Foundry rejects a symlinked output that escapes its package dist directory', () => {
  const root = mkdtempSync(resolve(packageRoot, 'dist/builder-output-test-'));
  const alias = resolve(root, 'source-alias'); symlinkSync(resolve(packageRoot, 'src'), alias, 'junction');
  try { expect(() => builder.codeRebuildDirectory('/sealed/input', resolve(alias, 'candidate'))).toThrow(/owned output/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('Foundry output preparation preserves a separately built test sibling and the original public input', async () => {
  const root = mkdtempSync(resolve(packageRoot, 'dist/builder-output-test-'));
  const original = resolve(root, 'original'), output = resolve(root, 'new');
  for (const dir of [original, resolve(output, 'standalone'), resolve(output, 'receipt'), resolve(output, 'test')]) mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(original, 'retained.txt'), 'original public');
  writeFileSync(resolve(output, 'test/retained.txt'), 'qualified test');
  writeFileSync(resolve(output, 'standalone/stale.txt'), 'old public');
  writeFileSync(resolve(output, 'receipt/bundle-public.json'), 'old receipt');
  try {
    expect(await builder.prepareCodeRebuildDirectory(original, output)).toBe(output);
    expect(readFileSync(resolve(original, 'retained.txt'), 'utf8')).toBe('original public');
    expect(readFileSync(resolve(output, 'test/retained.txt'), 'utf8')).toBe('qualified test');
    expect(() => readFileSync(resolve(output, 'standalone/stale.txt'))).toThrow();
    expect(() => readFileSync(resolve(output, 'receipt/bundle-public.json'))).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Foundry CLI accepts only an explicit optional output directory and one sealed input', () => {
  expect(builder.codeRebuildArguments(['original', '--out-dir', 'packages/foundry-floor/dist/alignment-ui2'])).toEqual({ sealed: 'original', outputDir: 'packages/foundry-floor/dist/alignment-ui2' });
  expect(builder.codeRebuildArguments([])).toEqual({});
  for (const args of [['--out-dir'], ['--out-dir', '--quiet'], ['one', 'two'], ['--unknown'], ['--out-dir', 'one', '--out-dir', 'two']]) {
    expect(() => builder.codeRebuildArguments(args)).toThrow(/Usage/);
  }
});

test('Foundry CLI names the previous sealed pack only with --pack-from', () => {
  expect(builder.codeRebuildArguments(['swapped', '--pack-from', 'sealed', '--out-dir', 'packages/foundry-floor/dist/flush1'])).toEqual({ sealed: 'swapped', packFrom: 'sealed', outputDir: 'packages/foundry-floor/dist/flush1' });
  for (const args of [['--pack-from'], ['one', '--pack-from', 'a', '--pack-from', 'b']]) expect(() => builder.codeRebuildArguments(args)).toThrow(/Usage/);
});

// A pack changed by a model swap: the files that changed are re-measured, everything else is carried.
const file = (path: string, text: string) => ({ path, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'), text });
function packView(release: string, texts: Record<string, string>) {
  const files = Object.entries(texts).map(([path, text]) => file(path, text));
  const manifest = { release, models: [{ id: 'car', path: 'models/vehicles/car.glb' }, { id: 'tower', path: 'models/tower.glb' }, { id: 'hall', path: 'models/structures/hall.glb' }], data: { 'asset-map': 'data/assets.json' }, files: files.map(({ text, ...f }) => f) };
  return { manifest, packJsonBytes: JSON.stringify(manifest).length, read: (path: string) => Buffer.from(texts[path]!) };
}
const PREVIOUS = packView('p1', { 'models/vehicles/car.glb': 'car one', 'models/tower.glb': 'tower one', 'models/structures/hall.glb': 'hall', 'data/assets.json': '{"a":1}' });
const NEXT = packView('p2', { 'models/vehicles/car.glb': 'car two!', 'models/tower.glb': 'tower 1', 'models/structures/hall.glb': 'hall', 'data/assets.json': '{"a":12}' });
const RECEIPT = {
  release: 'p1', stagedFiles: 6, stagedBytes: 1000,
  startupFetch: { packJsonBytes: 10, data: { 'asset-map': { bytes: 7, gzipBytes: 27 } }, models: 2, modelBytes: 11, modelIds: ['car', 'hall'], groups: { interior: { staged: 1, loaded: 0, stagedBytes: 9, loadedBytes: 0 }, structures: { loaded: 1, bytes: 4 }, vehicles: { loaded: 1, bytes: 7 } } },
  deferredFetch: { trigger: 'Enter', models: 1, modelBytes: 9, modelIds: ['tower'], release: 'r' },
};

test('Foundry re-measures only the changed pack files of a swapped pack and carries the rest', () => {
  const fields = builder.changedPackFields({ receipt: RECEIPT, previous: PREVIOUS, next: NEXT });
  expect(fields.release).toBe('p2');
  expect(fields.startupFetch.packJsonBytes).toBe(NEXT.packJsonBytes);
  expect(fields.startupFetch.data['asset-map']).toEqual({ bytes: 8, gzipBytes: gzipSync(Buffer.from('{"a":12}')).length });
  expect(fields.startupFetch.modelBytes).toBe(12);
  expect(fields.startupFetch.groups.vehicles).toEqual({ loaded: 1, bytes: 8 });
  expect(fields.startupFetch.groups.structures).toEqual({ loaded: 1, bytes: 4 });
  expect(fields.startupFetch.groups.interior).toEqual({ staged: 1, loaded: 0, stagedBytes: 7, loadedBytes: 0 });
  expect(fields.deferredFetch).toEqual({ ...RECEIPT.deferredFetch, modelBytes: 7 });
  expect(fields.stagedBytesChange).toBe(1 - 2 + 1 + NEXT.packJsonBytes - PREVIOUS.packJsonBytes);
});

test('Foundry refuses a swapped pack that keeps its release or changes its file list', () => {
  expect(() => builder.changedPackFields({ receipt: RECEIPT, previous: PREVIOUS, next: { ...NEXT, manifest: { ...NEXT.manifest, release: 'p1' } } })).toThrow(/release/);
  expect(() => builder.changedPackFields({ receipt: RECEIPT, previous: PREVIOUS, next: { ...NEXT, manifest: { ...NEXT.manifest, files: NEXT.manifest.files.slice(1) } } })).toThrow(/file list/);
  expect(() => builder.changedPackFields({ receipt: { ...RECEIPT, release: 'other' }, previous: PREVIOUS, next: NEXT })).toThrow(/receipt/);
});

test('Foundry names bundled modules from the checkout root, never by a local absolute path', () => {
  expect(builder.portableModuleId('C:/work/repo/scenes/node_modules/three/build/three.module.js', 'C:\\work\\repo')).toBe('kiln/scenes/node_modules/three/build/three.module.js');
  expect(builder.portableModuleId('\u0000vite/preload-helper.js', 'C:\\work\\repo')).toBe('\u0000vite/preload-helper.js');
});

// A release build runs outside the unit suite's browser/runtime aliases. Importing
// its receipt helpers must not load React Three Fiber's CommonJS renderer.
test('Foundry code-only release builder imports in an ordinary Bun process', () => {
  const result = spawnSync(process.execPath, ['-e', "await import('./packages/foundry-floor/tests/tools/rebuild-code.ts')"], {
    cwd: resolve(import.meta.dir, '../..'), encoding: 'utf8', timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
});
