import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { lifecycleConfig } from '../probe/lifecycle-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';
import { verifyLifecycleDeployment, planLifecycleCleanup } from '../probe/lifecycle-readback.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
import { readbackFixture } from './private-readback-fixture.mjs';
function fixture() {
  const manifest = structuredClone(lifecycleManifest);
  return readbackFixture(manifest, lifecycleConfig(manifest));
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

function disabledProviderSettings(snapshot) {
  for (const entry of Object.values(snapshot.workers)) {
    entry.scriptSettings = { logpush: false, tail_consumers: null, observability: null };
    entry.worker.observability = {
      enabled: false,
      head_sampling_rate: 1,
      redact_query_string: false,
      logs: {
        enabled: false,
        head_sampling_rate: 1,
        invocation_logs: true,
        persist: true,
        destinations: [],
      },
      traces: { enabled: false, head_sampling_rate: 1, persist: true, destinations: [] },
    };
  }
}

test('readback accepts provider-disabled raw observability with inactive CLI defaults', () => {
  const f = fixture();
  disabledProviderSettings(f.snapshot);
  assert.equal(
    verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot).privateConfigurationVerified,
    true,
  );
});

test('readback handles omitted empty collections and the D1 database_id alias', () => {
  const f = fixture();
  delete f.snapshot.workers.allowance.version.bindings;
  delete f.snapshot.workers.gateway.version.exports;
  for (const role of ['gateway', 'operator']) {
    const binding = f.snapshot.workers[role].version.bindings.find((b) => b.type === 'd1');
    binding.database_id = binding.id;
  }
  assert.equal(
    verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot).privateConfigurationVerified,
    true,
  );
  f.snapshot.workers.gateway.version.bindings.find((b) => b.type === 'd1').database_id = 'other';
  assert.throws(() => verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot));
});

test('omitted bindings or exports still fail when the candidate requires them', () => {
  for (const field of ['bindings', 'exports']) {
    const f = fixture();
    delete f.snapshot.workers.request.version[field];
    assert.throws(() => verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot));
  }
});

test('disabled readback requires explicit raw evidence and rejects active or contradictory logging', () => {
  for (const edit of [
    (e) => {
      delete e.scriptSettings;
    },
    (e) => {
      delete e.scriptSettings.observability;
    },
    (e) => {
      delete e.scriptSettings.logpush;
    },
    (e) => {
      delete e.scriptSettings.tail_consumers;
    },
    (e) => {
      e.scriptSettings.logpush = true;
    },
    (e) => {
      e.scriptSettings.tail_consumers = [{ service: 'external' }];
    },
    (e) => {
      e.scriptSettings.observability = { enabled: true };
    },
    (e) => {
      e.worker.observability.enabled = true;
    },
    (e) => {
      e.worker.observability.logs.enabled = true;
    },
    (e) => {
      e.worker.observability.traces.enabled = true;
    },
    (e) => {
      e.worker.observability.logs.destinations = ['external'];
    },
    (e) => {
      e.worker.observability.traces.destinations = ['external'];
    },
  ]) {
    const f = fixture();
    disabledProviderSettings(f.snapshot);
    edit(f.snapshot.workers.gateway);
    assert.throws(() => verifyLifecycleDeployment(f.manifest, f.receipt, f.snapshot));
  }
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
