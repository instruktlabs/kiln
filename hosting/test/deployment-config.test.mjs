import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { deploymentConfig } from '../scripts/deployment-config.mjs';

function fixture() {
  return {
    account: 'a'.repeat(32),
    prefix: 'kiln-qualification-v1',
    origin: 'https://kiln.instruktlabs.com',
    database: {
      id: '12345678-1234-4234-8234-123456789abc',
      name: 'kiln-qualification-v1-accounts',
    },
    oauthKv: 'b'.repeat(32),
    bucket: 'kiln-qualification-v1-artifacts',
    images: {
      coordinator: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-coordinator@sha256:${'c'.repeat(64)}`,
      software: `registry.cloudflare.com/${'a'.repeat(32)}/kiln-software@sha256:${'d'.repeat(64)}`,
    },
    compute: {
      maxConcurrent: 1,
      tenantPerMinute: 9,
      tenantPerDay: 9,
      globalPerDay: 9,
      globalPerMonth: 9,
      deadlineMs: 120000,
    },
    storage: { maxBytes: 67108864, maxObjects: 256, maxGroups: 64 },
  };
}

test('the complete deployment has separate gateway, storage, admission and three native services', () => {
  const result = deploymentConfig(fixture());
  assert.deepEqual(Object.keys(result.workers).sort(), [
    'admission',
    'evaluation',
    'gateway',
    'render',
    'request',
    'tenant',
  ]);
  const { gateway, tenant, admission, request, evaluation, render } = result.workers;
  assert.deepEqual(gateway.env.ACCOUNTS, { type: 'd1', ...fixture().database });
  assert.deepEqual(gateway.env.OAUTH_KV, { type: 'kv', id: fixture().oauthKv });
  assert.deepEqual(gateway.env.NATIVE_COMPUTE, {
    type: 'worker',
    worker: admission.name,
    exportName: 'KilnCompute',
  });
  assert.deepEqual(gateway.env.TENANTS, {
    type: 'durable-object',
    worker: tenant.name,
    exportName: 'KilnTenant',
  });
  assert.deepEqual(admission.env.REQUESTS, {
    type: 'durable-object',
    worker: request.name,
    exportName: 'KilnNativeRequest',
  });
  assert.deepEqual(request.env.EVALUATIONS, {
    type: 'durable-object',
    worker: evaluation.name,
    exportName: 'KilnEvaluationJob',
  });
  assert.deepEqual(request.env.RENDERS, {
    type: 'durable-object',
    worker: render.name,
    exportName: 'KilnRenderJob',
  });
  assert.deepEqual(request.env.TENANTS, gateway.env.TENANTS);
  assert.deepEqual(tenant.env.ARTIFACTS, { type: 'r2', name: fixture().bucket });
  assert.deepEqual(gateway.triggers, [{ type: 'scheduled', schedule: '* * * * *' }]);
  assert.equal(gateway.env.PUBLIC_ORIGIN.value, fixture().origin);
  assert.equal(request.env.PUBLIC_ORIGIN.value, fixture().origin);
  assert.equal(admission.env.COMPUTE_GLOBAL_PER_MONTH.value, '9');
  assert.equal(tenant.env.STORAGE_MAX_BYTES.value, '67108864');
});

test('configuration contains secret names only and exposes no operator, native or HTTP access', () => {
  const result = deploymentConfig(fixture());
  for (const [role, worker] of Object.entries(result.workers)) {
    assert.equal(worker.workersDev, false);
    assert.equal(worker.previewUrls, false);
    assert.deepEqual(worker.domains, []);
    assert(worker.compatibilityFlags.includes('global_fetch_strictly_public'));
    assert.equal(worker.observability.logs.invocationLogs, false);
    assert.equal(worker.observability.logs.enabled, false);
    assert.equal(worker.observability.traces.enabled, false);
    if (role !== 'gateway') {
      assert.deepEqual(worker.triggers, []);
      for (const name of Object.keys(worker.env))
        assert(!/ACCOUNTS|OAUTH|GOOGLE|GITHUB/.test(name));
    }
    for (const value of Object.values(worker.env))
      assert.notEqual(value.exportName, 'KilnComputeControl');
  }
  for (const name of [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
  ])
    assert.deepEqual(result.workers.gateway.env[name], { type: 'secret' });
  for (const container of Object.values(result.containers)) {
    assert.equal(container.ssh.enabled, false);
    assert.equal(container.observability.logs.enabled, false);
    assert.equal(container.schedulingPolicy, 'durable-object');
    for (const image of Object.values(container.images))
      assert.match(image.reference, /@sha256:[a-f0-9]{64}$/);
  }
});

test('offline preparation builds actual role-specific bundles and migrations without overwriting evidence', async () => {
  const cache = fileURLToPath(new URL('../../.cache/', import.meta.url));
  const directory = await mkdtemp(resolve(cache, 'deployment-config-test-'));
  assert(directory.startsWith(resolve(cache) + sep));
  try {
    const manifest = resolve(directory, 'manifest.json'),
      output = resolve(directory, 'candidate');
    await writeFile(manifest, JSON.stringify(fixture()));
    const args = [
      fileURLToPath(new URL('../scripts/prepare-deployment.mjs', import.meta.url)),
      '--manifest',
      manifest,
      '--output',
      output,
    ];
    const { stdout } = await promisify(execFile)(process.execPath, args);
    const receipt = JSON.parse(stdout);
    assert.equal(receipt.deployed, false);
    assert.equal(receipt.publicHttp, false);
    assert.equal(receipt.resourcesCreated, false);
    assert.equal(receipt.workers.length, 6);
    assert.equal(receipt.migrations.length, 9);
    assert.equal(new Set(receipt.files.map((file) => file.path)).size, receipt.files.length);
    for (const file of receipt.files) {
      const bytes = await readFile(resolve(output, file.path));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
      assert.equal(bytes.length, file.bytes);
    }
    for (const role of ['gateway', 'tenant', 'admission', 'request', 'evaluation', 'render'])
      assert(receipt.files.some((file) => file.path === `${role}.wrangler.json`));
    for (const worker of receipt.workers) {
      const bytes = await readFile(resolve(output, worker.bundle));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), worker.sha256);
      assert(
        worker.inputs.every(
          (input) => !/(?:^|\/)(?:test|probe)\//.test(input.replaceAll('\\', '/')),
        ),
      );
      if (worker.role !== 'gateway')
        assert(
          !worker.inputs.some((input) => /oauth|\/auth\.ts/.test(input.replaceAll('\\', '/'))),
        );
      const config = JSON.parse(await readFile(resolve(output, `${worker.role}.wrangler.json`)));
      assert.equal(resolve(output, config.main), resolve(output, worker.bundle));
    }
    for (const migration of receipt.migrations)
      assert.equal(
        createHash('sha256')
          .update(await readFile(resolve(output, 'migrations', migration.name)))
          .digest('hex'),
        migration.sha256,
      );
    assert.deepEqual(
      JSON.parse(await readFile(resolve(output, 'deployment-receipt.json'))),
      receipt,
    );
    await assert.rejects(promisify(execFile)(process.execPath, args));
    assert.deepEqual(
      JSON.parse(await readFile(resolve(output, 'deployment-receipt.json'))),
      receipt,
    );
    await writeFile(
      manifest,
      JSON.stringify({ ...fixture(), secret: 'unintended-sensitive-input' }),
    );
    await assert.rejects(
      promisify(execFile)(process.execPath, [...args.slice(0, -1), resolve(directory, 'invalid')]),
      (error) => !`${error.stdout}${error.stderr}`.includes('unintended-sensitive-input'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Wrangler conversion keeps self bindings local and external bindings explicit', () => {
  const result = deploymentConfig(fixture());
  for (const [role, config] of Object.entries(result.wrangler)) {
    const worker = result.workers[role];
    assert.equal(config.account_id, fixture().account);
    assert.deepEqual(config.routes, []);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    for (const binding of config.durable_objects?.bindings ?? []) {
      const target = worker.env[binding.name];
      assert.equal(binding.class_name, target.exportName);
      assert.equal(binding.script_name, target.worker === worker.name ? undefined : target.worker);
    }
    for (const binding of config.services ?? []) {
      assert.equal(binding.service, worker.env[binding.binding].worker);
      assert.equal(binding.entrypoint, worker.env[binding.binding].exportName);
    }
  }
  assert.deepEqual(result.wrangler.gateway.triggers, { crons: ['* * * * *'] });
  assert.equal(result.wrangler.gateway.d1_databases[0].database_id, fixture().database.id);
  assert.equal(result.wrangler.gateway.kv_namespaces[0].id, fixture().oauthKv);
  for (const [role, image] of [
    ['request', 'coordinator'],
    ['evaluation', 'kiln'],
    ['render', 'renderer'],
  ])
    assert.equal(
      result.wrangler[role].containers[0].images[image].image,
      fixture().images[role === 'request' ? 'coordinator' : 'software'],
    );
});

test('unknown fields, secret values, unbounded policies and mutable or foreign images are rejected', () => {
  for (const mutate of [
    (x) => {
      x.secret = 'must-not-be-serialized';
    },
    (x) => {
      x.routes = ['*'];
    },
    (x) => {
      x.compute.unlimited = true;
    },
    (x) => {
      x.database.secret = 'must-not-be-serialized';
    },
    (x) => {
      x.origin += '/';
    },
    (x) => {
      x.origin = 'http://kiln.instruktlabs.com';
    },
    (x) => {
      x.prefix = '../foreign';
    },
    (x) => {
      x.bucket = 'unrelated-assets';
    },
    (x) => {
      x.database.id = '';
    },
    (x) => {
      x.oauthKv = '';
    },
    (x) => {
      x.compute.maxConcurrent = 17;
    },
    (x) => {
      x.compute.deadlineMs = 120001;
    },
    (x) => {
      x.compute.globalPerMonth = Infinity;
    },
    (x) => {
      x.compute.tenantPerDay = 0;
    },
    (x) => {
      x.storage.maxBytes = -1;
    },
    (x) => {
      x.images.coordinator = `${x.images.coordinator.split('@')[0]}:latest`;
    },
    (x) => {
      x.images.software = x.images.software.replace(x.account, '0'.repeat(32));
    },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => deploymentConfig(input), /Invalid deployment/);
  }
});
