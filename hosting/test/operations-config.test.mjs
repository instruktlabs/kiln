import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operationsConfig } from '../probe/operations-config.mjs';
import { deploymentConfig } from '../scripts/deployment-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';
import { access, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

export const operationsManifest = {
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
test('operations topology has actual scheduled gateway recovery but no possible native container binding', () => {
  const c = operationsConfig(operationsManifest),
    base = deploymentConfig(operationsManifest);
  assert.deepEqual(Object.keys(c.workers).sort(), ['admission', 'gateway', 'operator', 'tenant']);
  assert.deepEqual(c.containers, {});
  assert.deepEqual(c.workers.gateway.triggers, base.workers.gateway.triggers);
  assert.equal(c.workers.gateway.triggers.length, 1);
  assert.equal(c.entries.gateway, 'worker');
  assert.equal(c.workers.admission.env.REQUESTS.exportName, 'KilnNoExecution');
  assert.equal(c.workers.admission.env.REQUESTS.worker, c.workers.admission.name);
  assert.equal(c.workers.gateway.env.TENANTS.exportName, 'KilnOperationsTenant');
  assert.equal(c.workers.operator.env.CONTROL.exportName, 'KilnComputeControl');
  assert(!c.workers.gateway.env.CONTROL);
  for (const [role, w] of Object.entries(c.workers)) {
    assert.equal(w.workersDev, false);
    assert.equal(w.previewUrls, false);
    assert.deepEqual(w.domains, []);
    assert.deepEqual(c.wrangler[role].routes, []);
    assert(!Object.values(w.env).some((b) => b.type === 'secret'));
    assert(!Object.values(w.exports).some((e) => e.container));
    assert(!c.wrangler[role].containers?.length);
    if (role !== 'gateway') assert.deepEqual(w.triggers, []);
  }
});
test('operations preparation rejects public targets, expanded quotas and altered storage', () => {
  for (const mutate of [
    (m) => {
      m.prefix = 'kiln-production';
    },
    (m) => {
      m.origin = 'https://kiln.instruktlabs.com';
    },
    (m) => {
      m.compute.globalPerMonth = 2;
    },
    (m) => {
      m.storage.maxBytes *= 2;
    },
  ]) {
    const m = structuredClone(operationsManifest);
    mutate(m);
    assert.throws(() => operationsConfig(m));
  }
});

test('offline preparation emits four hashed private Workers and no images or provider secrets', async () => {
  const cache = await realpath(fileURLToPath(new URL('../../.cache/', import.meta.url)));
  const directory = await mkdtemp(resolve(cache, 'operations-build-test-'));
  try {
    const manifest = resolve(directory, 'manifest.json'),
      output = resolve(directory, 'candidate');
    await writeFile(manifest, JSON.stringify(operationsManifest));
    const command = fileURLToPath(new URL('../scripts/prepare-deployment.mjs', import.meta.url));
    const args = [command, '--private-operations', '--manifest', manifest, '--output', output];
    const { stdout } = await promisify(execFile)(process.execPath, args);
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.mode, 'private-operations');
    assert.equal(receipt.workers.length, 4);
    assert.deepEqual(receipt.images, {});
    assert.deepEqual(receipt.requiredGatewaySecrets, []);
    assert.equal(receipt.publicHttp, false);
    assert.equal(receipt.nativeExecutionPossible, false);
    for (const file of receipt.files)
      assert.equal(
        createHash('sha256')
          .update(await readFile(resolve(output, file.path)))
          .digest('hex'),
        file.sha256,
      );
    const gateway = receipt.workers.find((w) => w.role === 'gateway');
    assert(!gateway.inputs.some((p) => p.includes('/probe/')));
    for (const worker of receipt.workers)
      assert(
        !worker.inputs.some((p) =>
          /(?:request|render|evaluation)-worker\.ts$|node:child_process/.test(p),
        ),
      );
    await assert.rejects(promisify(execFile)(process.execPath, args));
    const mixed = resolve(directory, 'mixed-modes');
    await assert.rejects(
      promisify(execFile)(process.execPath, [
        command,
        '--private-lifecycle',
        '--private-operations',
        '--manifest',
        manifest,
        '--output',
        mixed,
      ]),
    );
    await assert.rejects(access(mixed));
  } finally {
    assert((await realpath(directory)).startsWith(cache + sep));
    await rm(directory, { recursive: true });
  }
});
