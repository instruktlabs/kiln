import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { lifecycleConfig } from '../probe/lifecycle-config.mjs';
import { deploymentConfig } from '../scripts/deployment-config.mjs';
import { assertLifecycleBoundary } from '../probe/lifecycle-build-boundary.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';

test('private bundles reject unexpected helpers and identity code in native roles', () => {
  for (const role of ['request', 'evaluation', 'render']) {
    assert.throws(() =>
      assertLifecycleBoundary(role, [
        `hosting/probe/lifecycle-${role}-worker.ts`,
        'hosting/probe/qualification-accounts.ts',
      ]),
    );
    assert.throws(() => assertLifecycleBoundary(role, ['hosting/src/google.ts']));
  }
  for (const path of [
    'hosting/test/fixture.ts',
    'hosting/probe/unreviewed-helper.mjs',
    'hosting/probe/nested/helper.ts',
  ])
    assert.throws(() => assertLifecycleBoundary('operator', [path]));
});

test('offline private lifecycle preparation hashes eight isolated bundles and refuses overwrite', async () => {
  const cache = await realpath(fileURLToPath(new URL('../../.cache/', import.meta.url)));
  const directory = await mkdtemp(resolve(cache, 'lifecycle-candidate-test-'));
  assert((await realpath(directory)).startsWith(cache + sep));
  try {
    const manifest = resolve(directory, 'manifest.json'),
      output = resolve(directory, 'candidate');
    await writeFile(manifest, JSON.stringify(lifecycleManifest));
    const args = [
      fileURLToPath(new URL('../scripts/prepare-deployment.mjs', import.meta.url)),
      '--private-lifecycle',
      '--manifest',
      manifest,
      '--output',
      output,
    ];
    const { stdout } = await promisify(execFile)(process.execPath, args);
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.mode, 'private-lifecycle');
    assert.equal(receipt.workers.length, 8);
    assert.equal(receipt.migrations.length, 9);
    assert.deepEqual(receipt.requiredGatewaySecrets, []);
    assert.equal(receipt.deployed, false);
    assert.equal(receipt.publicHttp, false);
    for (const file of receipt.files) {
      const bytes = await readFile(resolve(output, file.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
    for (const worker of receipt.workers) {
      const inputs = worker.inputs.join('\n');
      if (worker.role !== 'operator')
        assert.doesNotMatch(inputs, /qualification-accounts|gateway-preflight|lifecycle-run/);
      if (['request', 'evaluation', 'render'].includes(worker.role))
        assert.doesNotMatch(inputs, /oauth|\/auth\.ts/);
    }
    await assert.rejects(promisify(execFile)(process.execPath, args));
    assert.deepEqual(
      JSON.parse(await readFile(resolve(output, 'deployment-receipt.json'))),
      receipt,
    );
  } finally {
    assert((await realpath(directory)).startsWith(cache + sep));
    await rm(directory, { recursive: true });
  }
});
test('private lifecycle configuration preserves production boundaries and binds only native wrappers to its allowance', () => {
  const c = lifecycleConfig(lifecycleManifest),
    base = deploymentConfig(lifecycleManifest);
  assert.equal(Object.keys(c.workers).length, 8);
  for (const role of ['tenant', 'admission']) assert.deepEqual(c.workers[role], base.workers[role]);
  for (const role of ['request', 'evaluation', 'render']) {
    const copy = structuredClone(c.workers[role]);
    assert.equal(copy.env.BUDGET.worker, c.workers.allowance.name);
    assert.equal(copy.env.BUDGET.exportName, 'KilnLifecycleBudget');
    delete copy.env.BUDGET;
    assert.deepEqual(copy, base.workers[role]);
    assert.equal(c.entries[role], `../probe/lifecycle-${role}-worker`);
    assert(!c.workers[role].env.ACCOUNTS);
  }
  assert.equal(c.workers.operator.env.GATEWAY.worker, c.workers.gateway.name);
  assert.equal(c.workers.operator.env.EXPECTED_IMAGE.value, `sha256:${'d'.repeat(64)}`);
  assert.deepEqual(c.workers.operator.env.ACCOUNTS, c.workers.gateway.env.ACCOUNTS);
  assert.deepEqual(c.workers.operator.env.ARTIFACTS, c.workers.tenant.env.ARTIFACTS);
  for (const [role, w] of Object.entries(c.workers)) {
    assert.equal(w.workersDev, false);
    assert.equal(w.previewUrls, false);
    assert.deepEqual(w.domains, []);
    assert.deepEqual(w.triggers, []);
    assert.equal(w.observability.enabled, false);
    assert(!Object.values(w.env).some((binding) => binding.type === 'secret'));
    assert.deepEqual(c.wrangler[role].routes, []);
  }
  assert.deepEqual(c.containers, base.containers);
});
test('private lifecycle configuration refuses production targets and altered execution allowances', () => {
  for (const edit of [
    (m) => {
      m.origin = 'https://kiln.instruktlabs.com';
    },
    (m) => {
      m.prefix = 'kiln-production';
    },
    (m) => {
      m.compute.globalPerDay = 15;
    },
    (m) => {
      m.compute.deadlineMs = 60000;
    },
    (m) => {
      m.storage.maxBytes *= 2;
    },
    (m) => {
      m.requestLimits.edge.perMinute = 601;
    },
  ]) {
    const m = structuredClone(lifecycleManifest);
    edit(m);
    assert.throws(() => lifecycleConfig(m));
  }
});

test('private deployment orders every cross-worker dependency before its caller', () => {
  const c = lifecycleConfig(lifecycleManifest);
  const positions = new Map(c.deployOrder.map((role, index) => [c.workers[role].name, index]));
  for (const worker of Object.values(c.workers))
    for (const binding of Object.values(worker.env))
      if (binding.worker && binding.worker !== worker.name)
        assert(
          positions.get(binding.worker) < positions.get(worker.name),
          `${worker.name} -> ${binding.worker}`,
        );
});
