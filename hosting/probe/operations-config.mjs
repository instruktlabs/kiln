import assert from 'node:assert/strict';
import { OutputWorkerSchema, convertToWranglerConfig } from '@cloudflare/config';
import { deploymentConfig } from '../scripts/deployment-config.mjs';

/** Private storage/recovery qualification. No container binding or native image
 * is deployed, so this topology cannot spend a VM-start allowance. */
export function operationsConfig(manifest) {
  const c = deploymentConfig(manifest);
  assert.equal(manifest.prefix, 'kiln-private-operations-v1');
  assert.equal(manifest.origin, 'https://kiln-private-qualification.invalid');
  assert.deepEqual(manifest.compute, { maxConcurrent: 1, tenantPerMinute: 1, tenantPerDay: 1,
    globalPerDay: 1, globalPerMonth: 1, deadlineMs: 120000 });
  assert.deepEqual(manifest.storage, { maxBytes: 67108864, maxObjects: 256, maxGroups: 64 });
  assert.equal(manifest.requestLimits.edge.perMinute, 600);
  assert.equal(manifest.requestLimits.account.perMinute, 120);
  c.containers = {};
  for(const role of ['request', 'evaluation', 'render']) {
    delete c.workers[role]; delete c.entries[role]; delete c.wrangler[role];
  }
  const gateway = c.workers.gateway, tenant = c.workers.tenant, admission = c.workers.admission;
  for(const [name,binding] of Object.entries(gateway.env))
    if(binding.type === 'secret') delete gateway.env[name];
  tenant.exports = { KilnOperationsTenant: { type:'durable-object', storage:'sqlite' } };
  tenant.env.OPERATIONS_MODE = { type:'text', value:'isolated-storage-v1' };
  c.entries.tenant = '../probe/operations-tenant';
  gateway.env.TENANTS.exportName = 'KilnOperationsTenant';
  admission.env.REQUESTS = { type:'durable-object', worker:admission.name, exportName:'KilnNoExecution' };
  admission.exports.KilnNoExecution = { type:'durable-object', storage:'sqlite' };
  c.entries.admission = '../probe/operations-admission';
  const operatorName = `${manifest.prefix}-operator`;
  c.workers.operator = OutputWorkerSchema.parse({
    ...gateway, name:operatorName, triggers:[],
    env: {
      PUBLIC_ORIGIN: {...gateway.env.PUBLIC_ORIGIN},
      QUALIFICATION_MODE: {type:'text',value:'isolated-synthetic-v1'},
      ACCOUNTS:{...gateway.env.ACCOUNTS}, OAUTH_KV:{...gateway.env.OAUTH_KV},
      TENANTS:{...gateway.env.TENANTS}, ARTIFACTS:{...tenant.env.ARTIFACTS},
      GATEWAY:{type:'worker',worker:gateway.name},
      COMPUTE:{...gateway.env.NATIVE_COMPUTE},
      CONTROL:{type:'worker',worker:admission.name,exportName:'KilnComputeControl'},
      RUN:{type:'durable-object',worker:operatorName,exportName:'KilnOperationsRun'},
    },
    exports: {KilnOperationsRun:{type:'durable-object',storage:'sqlite'},KilnOperationsControl:{type:'worker'}},
  });
  c.entries.operator='../probe/operations-worker';
  for(const [role,worker] of Object.entries(c.workers)) {
    c.workers[role] = OutputWorkerSchema.parse(worker);
    const config = convertToWranglerConfig({accountId:manifest.account,
      worker:{...worker,entrypoint:`./.cloudflare/output/v0/workers/${role}/bundle/worker.mjs`},containers:[]});
    for(const binding of config.durable_objects?.bindings ?? [])
      if(binding.script_name===worker.name) delete binding.script_name;
    config.routes=[];
    if(config.d1_databases?.length) config.d1_databases[0].migrations_dir='./migrations';
    c.wrangler[role]=config;
  }
  c.deployOrder=['tenant','admission','gateway','operator'];
  return c;
}
