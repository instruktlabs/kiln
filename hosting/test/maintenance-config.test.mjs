import assert from 'node:assert/strict';
import { test } from 'node:test';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { deploymentConfig } from '../scripts/deployment-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';

test('maintenance preparation emits only the gateway, preserving recovery bindings without storage migrations', async () => {
  const cache = await realpath(fileURLToPath(new URL('../../.cache/', import.meta.url)));
  const directory = await mkdtemp(resolve(cache, 'maintenance-build-test-'));
  try {
    const manifest = resolve(directory, 'manifest.json'),
      output = resolve(directory, 'candidate');
    await writeFile(manifest, JSON.stringify(lifecycleManifest));
    const command = fileURLToPath(new URL('../scripts/prepare-deployment.mjs', import.meta.url));
    const args = [command, '--maintenance', '--manifest', manifest, '--output', output];
    const { stdout } = await promisify(execFile)(process.execPath, args);
    const receipt = JSON.parse(stdout),
      base = deploymentConfig(lifecycleManifest);
    assert.equal(receipt.mode, 'maintenance-candidate');
    assert.equal(receipt.deployed, false);
    assert.equal(receipt.resourcesCreated, false);
    assert.equal(receipt.publicHttp, false);
    assert.equal(receipt.nativeExecutionPossible, false);
    assert.deepEqual(receipt.deployOrder, ['gateway']);
    assert.deepEqual(receipt.images, {});
    assert.deepEqual(receipt.migrations, []);
    assert.equal(receipt.workers.length, 1);
    assert.equal(receipt.workers[0].entry, 'maintenance-worker');
    assert.equal(receipt.requiredGatewaySecrets.length, 4);
    assert(!receipt.workers[0].inputs.some((p) => /(?:^|\/)(test|probe)\//.test(p)));
    assert(!receipt.files.some((f) => /\/containers\/|^migrations\//.test(f.path)));
    const worker = JSON.parse(
      await readFile(resolve(output, '.cloudflare/output/v0/workers/gateway/worker.config.json')),
    );
    assert.deepEqual(worker, base.workers.gateway);
    const wrangler = JSON.parse(await readFile(resolve(output, 'gateway.wrangler.json')));
    delete base.wrangler.gateway.d1_databases[0].migrations_dir;
    assert.deepEqual(wrangler, base.wrangler.gateway);
    for (const file of receipt.files) {
      const bytes = await readFile(resolve(output, file.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.equal(bytes.length, file.bytes);
    }
    await assert.rejects(promisify(execFile)(process.execPath, args));
    for (const mode of ['--private-lifecycle', '--private-operations']) {
      const mixed = resolve(directory, mode.slice(2));
      await assert.rejects(
        promisify(execFile)(process.execPath, [
          command,
          '--maintenance',
          mode,
          '--manifest',
          manifest,
          '--output',
          mixed,
        ]),
      );
      await assert.rejects(access(mixed));
    }
  } finally {
    assert((await realpath(directory)).startsWith(cache + sep));
    await rm(directory, { recursive: true });
  }
});
