import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runtimeBuildIdentity } from './build-runtime.mjs';
import { runtimeBuildProblem } from './check-runtime-build.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function put(root, path, text) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

async function checkout() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-runtime-build-'));
  roots.push(root);
  await put(root, 'package.json', JSON.stringify({ version: '1.0.0', packageManager: 'bun@1.4.2' }));
  await put(root, 'bun.lock', '{}\n');
  await put(root, 'src/cli.ts', 'export {};\n');
  await put(root, 'render-service/src/server.mjs', 'export {};\n');
  return root;
}

async function built(root) {
  const { identity } = await runtimeBuildIdentity(root);
  await put(
    root,
    'dist/build.json',
    JSON.stringify({ schemaVersion: 1, entries: { cli: { file: 'cli.mjs', identity } } }),
  );
  await put(root, 'dist/cli.mjs', 'export {};\n');
  await put(root, 'dist/viewer/app.js', 'export {};\n');
}

test('accepts a build of the current source', async () => {
  const root = await checkout();
  await built(root);
  expect(await runtimeBuildProblem(root)).toBeNull();
});

test('names a checkout that has never been built', async () => {
  expect(await runtimeBuildProblem(await checkout())).toContain('no runtime build');
});

test('names a build older than the source', async () => {
  const root = await checkout();
  await built(root);
  await put(root, 'src/cli.ts', 'export const changed = true;\n');
  expect(await runtimeBuildProblem(root)).toContain('older than the source');
});

test('names a build older than the lockfile', async () => {
  const root = await checkout();
  await built(root);
  await put(root, 'bun.lock', '{"changed":true}\n');
  expect(await runtimeBuildProblem(root)).toContain('older than the source');
});

test('ignores a test-only change, which moves no bundle', async () => {
  const root = await checkout();
  await built(root);
  await put(root, 'src/cli.test.ts', 'export {};\n');
  expect(await runtimeBuildProblem(root)).toBeNull();
});

test('names a recorded bundle that is missing', async () => {
  const root = await checkout();
  await built(root);
  await rm(join(root, 'dist/cli.mjs'));
  expect(await runtimeBuildProblem(root)).toContain('dist/cli.mjs');
});

test('names a build without the viewer, which a bare bundle build skips', async () => {
  const root = await checkout();
  await built(root);
  await rm(join(root, 'dist/viewer'), { recursive: true });
  expect(await runtimeBuildProblem(root)).toContain('dist/viewer/app.js');
});
