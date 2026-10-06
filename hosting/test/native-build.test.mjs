import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';

test('native-only build works without checkout engine bundles or SDK files', async () => {
  const cache = fileURLToPath(new URL('../../.cache/', import.meta.url));
  await mkdir(cache, { recursive: true });
  const fixture = await mkdtemp(join(cache, 'native-build-'));
  try {
    const hosting = join(fixture, 'hosting');
    await mkdir(join(hosting, 'scripts'), { recursive: true });
    await cp(new URL('../src/', import.meta.url), join(hosting, 'src'), { recursive: true });
    // The private storage adapter bundles this pure source-reference contract.
    // Neither dist/ nor lib/ exists in the isolated checkout.
    await mkdir(join(fixture, 'src'));
    await cp(
      new URL('../../src/program-store.ts', import.meta.url),
      join(fixture, 'src', 'program-store.ts'),
    );
    for (const name of ['build.mjs', 'build-boundary.mjs', 'edge-manifest.mjs'])
      await cp(new URL(`../scripts/${name}`, import.meta.url), join(hosting, 'scripts', name));
    await symlink(
      fileURLToPath(new URL('../node_modules/', import.meta.url)),
      join(hosting, 'node_modules'),
      'junction',
    );
    const result = spawnSync(
      process.execPath,
      [join(hosting, 'scripts', 'build.mjs'), '--native-only'],
      { encoding: 'utf8', timeout: 20000 },
    );
    assert.equal(result.status, 0, result.stderr);
    const output = join(fixture, '.cache', 'hosted-worker');
    const entries = await readdir(output);
    assert.equal(entries.filter((name) => name.endsWith('.mjs')).length, 5);
    assert.ok(entries.every((name) => name.startsWith('native-')));
    for (const name of entries.filter((name) => name.endsWith('-build.json'))) {
      const manifest = JSON.parse(await readFile(join(output, name), 'utf8'));
      assert.ok(!manifest.inputs.some((path) => /edge-mcp|mcp-engine|\/lib\//.test(path)));
    }
  } finally {
    assert.ok(resolve(fixture).startsWith(`${resolve(cache)}${sep}native-build-`));
    await rm(fixture, { recursive: true, force: true });
  }
});
