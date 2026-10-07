import assert from 'node:assert/strict';
import { OutputWorkerSchema, convertToWranglerConfig } from '@cloudflare/config';
import { deploymentConfig, workerOutputPath } from '../scripts/deployment-config.mjs';

/** Offline diagnostic topology, derived from production with no public route. */
export function lifecycleConfig(manifest) {
  const c = deploymentConfig(manifest);
  assert.equal(manifest.prefix, 'kiln-private-lifecycle-v1');
  assert.equal(manifest.origin, 'https://kiln-private-qualification.invalid');
  assert.deepEqual(manifest.compute, {
    maxConcurrent: 1, tenantPerMinute: 14, tenantPerDay: 14,
    globalPerDay: 14, globalPerMonth: 14, deadlineMs: 120000,
  });
  assert.deepEqual(manifest.storage, { maxBytes: 67108864, maxObjects: 256, maxGroups: 64 });
  assert.equal(manifest.requestLimits.edge.perMinute, 600);
  assert.equal(manifest.requestLimits.account.perMinute, 120);
  const operatorName = `${manifest.prefix}-operator`;
  const allowanceName = `${manifest.prefix}-allowance`;
  const budget = { type: 'durable-object', worker: allowanceName, exportName: 'KilnLifecycleBudget' };
  for (const role of ['request', 'evaluation', 'render']) {
    c.workers[role].env.BUDGET = { ...budget };
    c.entries[role] = `../probe/lifecycle-${role}-worker`;
  }
  const gateway = c.workers.gateway;
  // This fixed private test uses synthetic identities only, never live providers.
  for (const [name, binding] of Object.entries(gateway.env))
    if (binding.type === 'secret') delete gateway.env[name];
  gateway.triggers = [];
  c.workers.allowance = OutputWorkerSchema.parse({
    ...gateway, name: allowanceName, env: {},
    exports: { KilnLifecycleBudget: { type: 'durable-object', storage: 'sqlite' } },
  });
  c.workers.operator = OutputWorkerSchema.parse({
    ...gateway,
    name: operatorName,
    env: {
      PUBLIC_ORIGIN: { type: 'text', value: manifest.origin },
      QUALIFICATION_MODE: { type: 'text', value: 'isolated-synthetic-v1' },
      EXPECTED_IMAGE: { type: 'text', value: manifest.images.software.split('@')[1] },
      ACCOUNTS: { ...gateway.env.ACCOUNTS }, OAUTH_KV: { ...gateway.env.OAUTH_KV },
      TENANTS: { ...gateway.env.TENANTS }, ARTIFACTS: { ...c.workers.tenant.env.ARTIFACTS },
      GATEWAY: { type: 'worker', worker: gateway.name },
      COMPUTE: { ...gateway.env.NATIVE_COMPUTE },
      CONTROL: { type: 'worker', worker: c.workers.admission.name, exportName: 'KilnComputeControl' },
      BUDGET: budget,
      RUN: { type: 'durable-object', worker: operatorName, exportName: 'KilnLifecycleRun' },
    },
    exports: {
      KilnLifecycleRun: { type: 'durable-object', storage: 'sqlite' },
      KilnLifecycleControl: { type: 'worker' },
    },
  });
  c.entries.operator = '../probe/lifecycle-worker';
  c.entries.allowance = '../probe/lifecycle-allowance-worker';
  for (const [role, worker] of Object.entries(c.workers)) {
    c.workers[role] = OutputWorkerSchema.parse(worker);
    const config = convertToWranglerConfig({
      accountId: manifest.account,
      worker: { ...worker, entrypoint: `./${workerOutputPath(role)}/bundle/worker.mjs` },
      containers: c.containers[role] ? [c.containers[role]] : [],
    });
    for (const binding of config.durable_objects?.bindings ?? [])
      if (binding.script_name === worker.name) delete binding.script_name;
    config.routes = [];
    if (config.d1_databases?.length) config.d1_databases[0].migrations_dir = './migrations';
    c.wrangler[role] = config;
  }
  c.deployOrder = ['tenant', 'allowance', 'evaluation', 'render', 'request', 'admission', 'gateway', 'operator'];
  return c;
}
