import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { lifecycleConfig } from '../probe/lifecycle-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';
import { verifyLifecycleDeployment, planLifecycleCleanup } from '../probe/lifecycle-readback.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const id = (value) => hash(value).slice(0, 32);
function fixture() {
  const manifest = structuredClone(lifecycleManifest),
    config = lifecycleConfig(manifest);
  const namespaces = Object.values(config.workers).flatMap((w) =>
    Object.entries(w.exports)
      .filter(([, e]) => e.type === 'durable-object')
      .map(([name]) => ({
        id: id(w.name + name),
        script: w.name,
        class: name,
        use_sqlite: true,
      })),
  );
  const ns = (worker, name) => namespaces.find((n) => n.script === worker && n.class === name);
  const bindings = (w) =>
    Object.entries(w.env).map(([name, b]) => {
      switch (b.type) {
        case 'text':
          return { name, type: 'plain_text', text: b.value };
        case 'worker':
          return {
            name,
            type: 'service',
            service: b.worker,
            ...(b.exportName ? { entrypoint: b.exportName } : {}),
          };
        case 'durable-object':
          return {
            name,
            type: 'durable_object_namespace',
            namespace_id: ns(b.worker, b.exportName).id,
            class_name: b.exportName,
          };
        case 'd1':
          return { name, type: 'd1', id: b.id };
        case 'kv':
          return { name, type: 'kv_namespace', namespace_id: b.id };
        case 'r2':
          return { name, type: 'r2_bucket', bucket_name: b.name };
        case 'rate-limit':
          return { name, type: 'ratelimit', namespace_id: b.namespace, simple: b.simple };
        case 'analytics-engine-dataset':
          return { name, type: 'analytics_engine', dataset: b.name };
        default:
          throw new Error('Unexpected fixture binding');
      }
    });
  const workers = Object.fromEntries(
    Object.entries(config.workers).map(([role, w]) => {
      const bytes = Buffer.from(`fixture ${role}`),
        versionId = id(`${role}version`);
      return [
        role,
        {
          worker: {
            id: id(w.name),
            name: w.name,
            subdomain: { enabled: false, previews_enabled: false },
            observability: config.wrangler[role].observability,
            logpush: false,
            tail_consumers: [],
            references: { domains: [], queues: [], dispatch_namespace_outbounds: [] },
          },
          version: {
            id: versionId,
            main_module: 'worker.mjs',
            modules: [{ name: 'worker.mjs', content_base64: bytes.toString('base64') }],
            bindings: bindings(w),
            exports: w.exports,
            urls: [],
            compatibility_date: w.compatibilityDate,
            compatibility_flags: w.compatibilityFlags,
            limits: config.wrangler[role].limits,
            containers: Object.values(config.containers)
              .filter((c) => Object.values(w.exports).some((e) => e.container === c.name))
              .map((c) => ({
                name: c.name,
                class_name: Object.entries(w.exports).find(([, e]) => e.container === c.name)[0],
                images: Object.fromEntries(
                  Object.entries(c.images).map(([k, v]) => [k, v.reference]),
                ),
              })),
          },
          deployments: {
            deployments: [
              {
                id: id(`${role}deployment`),
                versions: [{ version_id: versionId, percentage: 100 }],
              },
            ],
          },
          routes: [],
          schedules: [],
        },
      ];
    }),
  );
  const applications = Object.entries(config.containers).map(([role, c]) => ({
    id: id(c.name),
    account_id: manifest.account,
    name: c.name,
    scheduling_policy: 'durable_object',
    durable_objects: {
      namespace_id: ns(config.workers[role].name, Object.keys(config.workers[role].exports)[0]).id,
    },
    configuration: { wrangler_ssh: { enabled: false } },
    observability: { logs: { enabled: false } },
    health: { instances: { active: 0, starting: 0 } },
  }));
  const migrations = Array.from(
    { length: 9 },
    (_, i) => `${String(i + 1).padStart(4, '0')}_fixture.sql`,
  );
  const receipt = {
    mode: 'private-lifecycle',
    sourceDirty: false,
    sourceCommit: 'e'.repeat(40),
    deployOrder: config.deployOrder,
    images: manifest.images,
    workers: Object.entries(workers).map(([role, w]) => ({
      role,
      name: w.worker.name,
      sha256: hash(Buffer.from(w.version.modules[0].content_base64, 'base64')),
    })),
    migrations: migrations.map((name) => ({ name, sha256: 'f'.repeat(64) })),
  };
  const snapshot = {
    account: manifest.account,
    complete: true,
    workers,
    namespaces,
    applications,
    database: { uuid: manifest.database.id, name: manifest.database.name },
    kv: { id: manifest.oauthKv, title: `${manifest.prefix}-oauth` },
    bucket: { name: manifest.bucket },
    managedDomain: { enabled: false },
    customDomains: { domains: [] },
    migrations,
  };
  return { manifest, receipt, snapshot };
}
function deployed() {
  const f = fixture();
  return { ...f, verified: verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot) };
}
function stopped() {
  const f = deployed();
  const claims = f.verified.applications.map((a) => ({ kind: a.kind, id: hash(a.name) }));
  const instances = f.verified.applications.map((a, i) => ({
    id: claims[i].id,
    application_id: a.id,
    image: Object.values(a.images)[0],
    status: { state: 'stopped' },
  }));
  const status = {
    record: { state: 'finished', passed: true },
    budget: { state: 'closed', claims },
    admission: { paused: true, activeRequests: 0, pendingCleanup: 0 },
    operatorStopped: true,
    alarmAt: null,
  };
  return { ...f, status, instances };
}

test('private deployment readback binds exact deployed code, versions, resources and images', () => {
  const f = deployed();
  assert.equal(f.verified.workers.length, 8);
  assert.equal(f.verified.applications.length, 3);
  assert.equal(f.verified.namespaces.length, 7);
  assert.equal(f.verified.privateConfigurationVerified, true);
  assert.equal(f.verified.sourceCommit, f.receipt.sourceCommit);
  assert.equal(f.verified.database.id, f.manifest.database.id);
});

test('readback rejects code, public surfaces, stored logs and inactive-version discrepancies', () => {
  for (const edit of [
    (s) => {
      s.workers.gateway.version.modules[0].content_base64 =
        Buffer.from('altered').toString('base64');
    },
    (s) => {
      s.workers.gateway.version.urls.push('https://public.example');
    },
    (s) => {
      s.workers.gateway.worker.subdomain.enabled = true;
    },
    (s) => {
      s.workers.gateway.worker.subdomain.previews_enabled = true;
    },
    (s) => {
      s.workers.gateway.worker.observability.logs.persist = true;
    },
    (s) => {
      s.workers.gateway.worker.observability.enabled = true;
    },
    (s) => {
      s.workers.gateway.worker.tail_consumers.push({ service: 'external' });
    },
    (s) => {
      s.workers.gateway.routes.push({ pattern: '*.example/*' });
    },
    (s) => {
      s.workers.gateway.schedules.push({ cron: '* * * * *' });
    },
    (s) => {
      s.workers.gateway.deployments.deployments[0].versions.push({
        version_id: 'unreviewed',
        percentage: 1,
      });
    },
    (s) => {
      s.workers.gateway.version.limits.cpu_ms = 300000;
    },
    (s) => {
      s.managedDomain.enabled = true;
    },
    (s) => {
      s.customDomains.domains.push({ domain: 'assets.example' });
    },
    (s) => {
      s.complete = false;
    },
  ]) {
    const f = fixture();
    edit(f.snapshot);
    assert.throws(() => verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot));
  }
});

test('readback rejects changed tenancy, unexpected secrets, image drift and incomplete migrations', () => {
  for (const edit of [
    (s) => {
      s.workers.gateway.version.bindings.find((b) => b.name === 'ACCOUNTS').id = 'other';
    },
    (s) => {
      s.workers.request.version.bindings.find((b) => b.name === 'TENANTS').namespace_id = 'other';
    },
    (s) => {
      s.workers.operator.version.bindings.find((b) => b.name === 'GATEWAY').service =
        'another-worker';
    },
    (s) => {
      s.workers.gateway.version.bindings.push({ name: 'SECRET', type: 'secret_text' });
    },
    (s) => {
      s.workers.gateway.version.bindings.find((b) => b.type === 'ratelimit').simple.limit = 100000;
    },
    (s) => {
      s.workers.render.version.containers[0].images.renderer += '0';
    },
    (s) => {
      s.namespaces[0].script = 'other-owner';
    },
    (s) => {
      s.applications[0].account_id = 'other';
    },
    (s) => {
      s.applications[0].configuration.wrangler_ssh.enabled = true;
    },
    (s) => {
      s.applications[0].health.instances.active = 1;
    },
    (s) => {
      s.bucket.name = 'production';
    },
    (s) => {
      s.kv.id = 'other';
    },
    (s) => {
      s.migrations = [];
    },
  ]) {
    const f = fixture();
    edit(f.snapshot);
    assert.throws(() => verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot));
  }
});

test('cleanup plans only recorded trial resources in reverse dependency order after verified stop', () => {
  const f = stopped();
  const plan = planLifecycleCleanup(f.manifest, f.verified, f.status, f.instances);
  assert.deepEqual(
    plan.workers.map((w) => w.role),
    f.receipt.deployOrder.toReversed(),
  );
  assert.deepEqual(
    plan.applications.map((a) => a.id).sort(),
    f.verified.applications.map((a) => a.id).sort(),
  );
  assert.equal(plan.database.id, f.manifest.database.id);
  assert.equal(plan.kv.id, f.manifest.oauthKv);
  assert.equal(plan.bucket, f.manifest.bucket);
  assert.equal(plan.registryImages, 'preserve');
  assert.equal(plan.verifiedStoppedInstances, 3);
});

test('cleanup refuses active, unclaimed, foreign or excessive VM records and uncertain stop', () => {
  for (const edit of [
    (f) => {
      f.status.budget.state = 'open';
    },
    (f) => {
      f.status.operatorStopped = false;
    },
    (f) => {
      f.status.alarmAt = Date.now();
    },
    (f) => {
      f.status.record.state = 'running';
    },
    (f) => {
      f.status.admission.pendingCleanup = 1;
    },
    (f) => {
      f.status.admission.activeRequests = 1;
    },
    (f) => {
      f.status.admission.paused = false;
    },
    (f) => {
      f.instances[0].status.state = 'running';
    },
    (f) => {
      f.instances[0].application_id = 'other';
    },
    (f) => {
      f.instances[0].image = 'other';
    },
    (f) => {
      f.instances[0].id = hash('unclaimed');
    },
    (f) => {
      f.instances.push({ ...f.instances[0] });
    },
    (f) => {
      f.status.budget.claims.push(
        ...Array.from({ length: 5 }, (_, i) => ({ kind: 'render', id: hash(String(i)) })),
      );
    },
    (f) => {
      f.verified.database.id = 'production';
    },
    (f) => {
      f.verified.workers[0].name = 'production';
    },
  ]) {
    const f = stopped();
    edit(f);
    assert.throws(() => planLifecycleCleanup(f.manifest, f.verified, f.status, f.instances));
  }
});

test('failed starts need no running VM and failed qualification still permits verified cleanup', () => {
  const f = stopped();
  f.status.record.passed = false;
  f.instances.pop();
  const plan = planLifecycleCleanup(f.manifest, f.verified, f.status, f.instances);
  assert.equal(plan.verifiedStoppedInstances, 2);
  assert.equal(plan.claims, 3);
});
