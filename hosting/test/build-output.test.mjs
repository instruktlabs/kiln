import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBuildOutput } from '@cloudflare/build-output-utils';
import { lifecycleManifest } from './lifecycle-fixture.mjs';

const operationsManifest = {
  ...lifecycleManifest,
  prefix: 'kiln-private-operations-v1',
  database: { ...lifecycleManifest.database, name: 'kiln-private-operations-v1-accounts' },
  bucket: 'kiln-private-operations-v1-artifacts',
  compute: {
    maxConcurrent: 1,
    tenantPerMinute: 1,
    tenantPerDay: 1,
    globalPerDay: 1,
    globalPerMonth: 1,
    deadlineMs: 120000,
  },
};

for (const [mode, manifest, count] of [
  ['', lifecycleManifest, 6],
  ['--maintenance', lifecycleManifest, 1],
  ['--private-lifecycle', lifecycleManifest, 8],
  ['--private-operations', operationsManifest, 4],
]) {
  test(`Cloudflare's build-output reader accepts ${mode || 'production'} with one default gateway`, async () => {
    const cache = await realpath(fileURLToPath(new URL('../../.cache/', import.meta.url)));
    const directory = await mkdtemp(resolve(cache, 'build-output-test-'));
    try {
      const input = resolve(directory, 'manifest.json'),
        output = resolve(directory, 'candidate');
      await writeFile(input, JSON.stringify(manifest));
      const command = fileURLToPath(new URL('../scripts/prepare-deployment.mjs', import.meta.url));
      const { stdout } = await promisify(execFile)(process.execPath, [
        command,
        ...(mode ? [mode] : []),
        '--manifest',
        input,
        '--output',
        output,
      ]);
      const receipt = JSON.parse(stdout);
      // This is the actual reader cf uses, not a second implementation of its layout.
      const built = await readBuildOutput(output);
      assert.equal(Object.keys(built.workers).length, count);
      assert.equal(built.workers.default.config.name, `${manifest.prefix}-gateway`);
      assert.equal(built.workers.gateway, undefined);
      assert.equal(new Set(Object.values(built.workers).map((w) => w.config.name)).size, count);
      for (const w of receipt.workers) {
        const loaded = Object.values(built.workers).find((b) => b.config.name === w.name);
        assert(loaded);
        assert.equal(resolve(loaded.bundleDir, 'worker.mjs'), resolve(output, w.bundle));
        const wrangler = JSON.parse(await readFile(resolve(output, `${w.role}.wrangler.json`)));
        assert.equal(resolve(output, wrangler.main), resolve(output, w.bundle));
        assert.equal(loaded.config.workersDev, false);
        assert.equal(loaded.config.previewUrls, false);
        assert.deepEqual(loaded.config.domains, []);
      }
      assert.equal(receipt.deployed, false);
      assert.equal(receipt.resourcesCreated, false);
      assert.equal(receipt.publicHttp, false);
    } finally {
      assert((await realpath(directory)).startsWith(cache + sep));
      await rm(directory, { recursive: true });
    }
  });
}
