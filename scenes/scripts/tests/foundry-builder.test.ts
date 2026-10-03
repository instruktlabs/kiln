import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// A release build runs outside the unit suite's browser/runtime aliases. Importing
// its receipt helpers must not load React Three Fiber's CommonJS renderer.
test('Foundry code-only release builder imports in an ordinary Bun process', () => {
  const result = spawnSync(process.execPath, ['-e', "await import('./packages/foundry-floor/tests/tools/rebuild-code.ts')"], {
    cwd: resolve(import.meta.dir, '../..'), encoding: 'utf8', timeout: 15_000,
  });
  expect(result.error).toBeUndefined();
  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
});
