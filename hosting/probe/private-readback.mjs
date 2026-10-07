import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lifecycleConfig } from './lifecycle-config.mjs';
import { operationsConfig } from './operations-config.mjs';

const sorted = (values) => [...values].sort();
const one = (values, predicate) => {
  const found = values.filter(predicate);
  assert.equal(found.length, 1, 'Expected exactly one matching private resource');
  return found[0];
};
const identifier = (value) => assert(typeof value === 'string' && /^[a-f0-9-]{28,64}$/.test(value));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function verifyDisabledLogging(worker, settings) {
  assert(settings && Object.hasOwn(settings, 'observability'), 'Raw script settings are required');
  assert.equal(settings.logpush, false);
  assert(settings.tail_consumers === null || Array.isArray(settings.tail_consumers));
  assert.deepEqual(settings.tail_consumers ?? [], []);
  assert.equal(worker.logpush, false);
  assert.deepEqual(worker.tail_consumers, []);
  const checkDisabled = (observability) => {
    assert.equal(observability.enabled, false);
    assert.equal(observability.logs.enabled, false);
    assert.equal(observability.traces.enabled, false);
    assert.deepEqual(observability.logs.destinations ?? [], []);
    assert.deepEqual(observability.traces.destinations ?? [], []);
  };
  checkDisabled(worker.observability);
  // The script-settings API returns null when observability is disabled. The
  // CLI normalizes that into inactive defaults (including persist:true). Require
  // the independent raw readback; missing evidence must never mean disabled.
  if (settings.observability === null) return;
  checkDisabled(settings.observability);
  for (const observability of [settings.observability, worker.observability]) {
    assert.equal(observability.redact_query_string, true);
    assert.equal(observability.logs.invocation_logs, false);
    assert.equal(observability.logs.persist, false);
    assert.equal(observability.traces.persist, false);
  }
}

function verifyBindings(expected, actual = [], namespaces) {
  assert.deepEqual(sorted(actual.map((b) => b.name)), sorted(Object.keys(expected)));
  for (const [name, binding] of Object.entries(expected)) {
    const observed = one(actual, (b) => b.name === name);
    let value;
    switch (binding.type) {
      case 'text':
        value = { name, type: 'plain_text', text: binding.value };
        break;
      case 'd1':
        value = { name, type: 'd1', id: binding.id };
        if (observed.database_id !== undefined) value.database_id = binding.id;
        break;
      case 'kv':
        value = { name, type: 'kv_namespace', namespace_id: binding.id };
        break;
      case 'r2':
        value = { name, type: 'r2_bucket', bucket_name: binding.name };
        break;
      case 'rate-limit':
        value = {
          name,
          type: 'ratelimit',
          namespace_id: binding.namespace,
          simple: binding.simple,
        };
        break;
      case 'analytics-engine-dataset':
        value = { name, type: 'analytics_engine', dataset: binding.name };
        break;
      case 'worker':
        value = {
          name,
          type: 'service',
          service: binding.worker,
          ...(binding.exportName ? { entrypoint: binding.exportName } : {}),
        };
        if (observed.environment !== undefined) value.environment = 'production';
        break;
      case 'durable-object': {
        const namespace = one(
          namespaces,
          (n) => n.script === binding.worker && n.class === binding.exportName,
        );
        value = {
          name,
          type: 'durable_object_namespace',
          namespace_id: namespace.id,
          class_name: binding.exportName,
        };
        if (observed.script_name !== undefined) value.script_name = binding.worker;
        if (observed.environment !== undefined) value.environment = 'production';
        break;
      }
      default:
        assert.fail('Unsupported private binding');
    }
    assert.deepEqual(observed, value, 'Deployed private binding differs from candidate');
  }
}

/** Pure verification of CLI/API readback, not an API call or deployment. The
 * operator supplies complete, freshly collected pages and the frozen receipt. */
function verifyPrivateDeployment(manifest, receipt, snapshot, mode) {
  const operations = mode === 'private-operations';
  const c = operations ? operationsConfig(manifest) : lifecycleConfig(manifest);
  assert.equal(receipt.mode, mode);
  if (operations) {
    assert.equal(receipt.nativeExecutionPossible, false);
    assert.equal(receipt.publicHttp, false);
    assert.deepEqual(receipt.requiredGatewaySecrets, []);
  }
  assert.equal(receipt.sourceDirty, false);
  assert.match(receipt.sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(snapshot.account, manifest.account);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(receipt.images, operations ? {} : manifest.images);
  assert.deepEqual(receipt.deployOrder, c.deployOrder);
  assert.deepEqual(sorted(receipt.workers.map((w) => w.role)), sorted(c.deployOrder));
  assert.deepEqual(sorted(Object.keys(snapshot.workers)), sorted(c.deployOrder));
  assert.equal(snapshot.database.uuid, manifest.database.id);
  assert.equal(snapshot.database.name, manifest.database.name);
  assert.equal(snapshot.kv.id, manifest.oauthKv);
  assert.equal(snapshot.kv.title, `${manifest.prefix}-oauth`);
  assert.equal(snapshot.bucket.name, manifest.bucket);
  assert.equal(snapshot.managedDomain.enabled, false);
  assert.deepEqual(snapshot.customDomains.domains, []);
  assert.equal(receipt.migrations.length, 9);
  assert.deepEqual(sorted(snapshot.migrations), sorted(receipt.migrations.map((m) => m.name)));
  const namespaces = snapshot.namespaces.filter((n) => n.script.startsWith(`${manifest.prefix}-`));
  const expectedClasses = Object.values(c.workers).flatMap((w) =>
    Object.entries(w.exports)
      .filter(([, e]) => e.type === 'durable-object')
      .map(([name]) => `${w.name}:${name}`),
  );
  assert.deepEqual(
    sorted(namespaces.map((n) => `${n.script}:${n.class}`)),
    sorted(expectedClasses),
  );
  assert.equal(new Set(namespaces.map((n) => n.id)).size, namespaces.length);
  for (const namespace of namespaces) {
    identifier(namespace.id);
    assert.equal(namespace.use_sqlite, true);
  }
  const workers = [];
  const applications = [];
  for (const role of c.deployOrder) {
    const expected = c.workers[role],
      wrangler = c.wrangler[role];
    const { worker, version, deployments, routes, schedules, scriptSettings } = snapshot.workers[role];
    const prepared = one(receipt.workers, (w) => w.role === role);
    assert.equal(prepared.name, expected.name);
    identifier(worker.id);
    identifier(version.id);
    assert.equal(worker.name, expected.name);
    assert.equal(worker.subdomain.enabled, false);
    assert.equal(worker.subdomain.previews_enabled, false);
    verifyDisabledLogging(worker, scriptSettings);
    for (const key of ['domains', 'queues', 'dispatch_namespace_outbounds'])
      assert.deepEqual(worker.references[key], []);
    assert.deepEqual(routes, []);
    assert(Array.isArray(schedules));
    for (const schedule of schedules) {
      assert(Object.keys(schedule).every(key => ['cron', 'created_on', 'modified_on'].includes(key)));
      assert.equal(typeof schedule.cron, 'string');
      for (const key of ['created_on', 'modified_on'])
        if (schedule[key] !== undefined) assert.equal(typeof schedule[key], 'string');
    }
    assert.deepEqual(sorted(schedules.map(s => s.cron)), sorted(wrangler.triggers?.crons ?? []));
    assert.deepEqual(version.urls, []);
    assert.equal(version.compatibility_date, expected.compatibilityDate);
    assert.deepEqual(sorted(version.compatibility_flags), sorted(expected.compatibilityFlags));
    assert.deepEqual(version.limits, wrangler.limits);
    assert.deepEqual(version.exports ?? {}, expected.exports);
    assert.equal(version.main_module, 'worker.mjs');
    assert.equal(version.modules.length, 1);
    assert.equal(version.modules[0].name, 'worker.mjs');
    assert.equal(hash(Buffer.from(version.modules[0].content_base64, 'base64')), prepared.sha256);
    const deployment = deployments.deployments[0];
    identifier(deployment.id);
    assert.deepEqual(deployment.versions, [{ version_id: version.id, percentage: 100 }]);
    verifyBindings(expected.env, version.bindings, namespaces);
    if (c.containers[role]) {
      const container = c.containers[role];
      const className = Object.entries(expected.exports).find(
        ([, e]) => e.container === container.name,
      )[0];
      const namespace = one(namespaces, (n) => n.script === expected.name && n.class === className);
      const images = Object.fromEntries(
        Object.entries(container.images).map(([name, image]) => [name, image.reference]),
      );
      assert.deepEqual(version.containers, [
        { name: container.name, class_name: className, images },
      ]);
      const app = one(snapshot.applications, (a) => a.name === container.name);
      identifier(app.id);
      assert.equal(app.account_id, manifest.account);
      assert.equal(app.scheduling_policy, 'durable_object');
      assert.equal(app.durable_objects.namespace_id, namespace.id);
      assert.equal(app.configuration.wrangler_ssh.enabled, false);
      assert.equal(app.observability.logs.enabled, false);
      assert.equal(app.health.instances.active, 0);
      assert.equal(app.health.instances.starting, 0);
      applications.push({
        role,
        kind: role === 'request' ? 'coordinator' : role,
        id: app.id,
        name: app.name,
        className,
        namespaceId: namespace.id,
        images,
      });
    } else assert.deepEqual(version.containers ?? [], []);
    workers.push({
      role,
      name: worker.name,
      id: worker.id,
      version: version.id,
      deployment: deployment.id,
      sha256: prepared.sha256,
    });
  }
  assert.equal(new Set(workers.map((w) => w.id)).size, workers.length);
  assert.deepEqual(
    sorted(
      snapshot.applications
        .filter((a) => a.name.startsWith(`${manifest.prefix}-`))
        .map((a) => a.id),
    ),
    sorted(applications.map((a) => a.id)),
  );
  return {
    sourceCommit: receipt.sourceCommit,
    account: manifest.account,
    prefix: manifest.prefix,
    privateConfigurationVerified: true,
    nativeExecutionPossible: !operations,
    schedules: c.deployOrder.flatMap(role => (c.wrangler[role].triggers?.crons ?? []).map(cron => ({ worker: c.workers[role].name, cron }))),
    workers,
    applications,
    namespaces,
    database: { id: manifest.database.id, name: manifest.database.name },
    kv: { id: manifest.oauthKv, title: snapshot.kv.title },
    bucket: manifest.bucket,
    metrics: {
      dataset: c.workers.gateway.env.OPERATIONS.name,
      retention: 'provider-managed three months',
    },
  };
}

export const verifyLifecycleDeployment = (manifest, receipt, snapshot) =>
  verifyPrivateDeployment(manifest, receipt, snapshot, 'private-lifecycle');
export const verifyOperationsDeployment = (manifest, receipt, snapshot) =>
  verifyPrivateDeployment(manifest, receipt, snapshot, 'private-operations');
