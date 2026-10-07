import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operationsConfig } from '../probe/operations-config.mjs';
import { lifecycleManifest } from './lifecycle-fixture.mjs';
import { readbackFixture } from './private-readback-fixture.mjs';
import {
  verifyOperationsDeployment,
  planOperationsCleanup,
} from '../probe/operations-readback.mjs';

function fixture() {
  const manifest = structuredClone(lifecycleManifest);
  manifest.prefix = 'kiln-private-operations-v1';
  manifest.database.name = `${manifest.prefix}-accounts`;
  manifest.bucket = `${manifest.prefix}-artifacts`;
  for (const key of ['tenantPerMinute', 'tenantPerDay', 'globalPerDay', 'globalPerMonth'])
    manifest.compute[key] = 1;
  return readbackFixture(manifest, operationsConfig(manifest), 'private-operations');
}
function verified() {
  const f = fixture();
  return { ...f, verified: verifyOperationsDeployment(f.manifest, f.receipt, f.snapshot) };
}
function stopped() {
  return {
    ...verified(),
    status: {
      record: { state: 'finished', passed: true, nativeExecutionPossible: false },
      alarmAt: null,
      privateStatePresent: false,
      admission: { paused: true, activeRequests: 0, pendingCleanup: 0 },
    },
  };
}

test('operations readback verifies four private Workers, real Cron and no native capability', () => {
  const f = verified();
  assert.equal(f.verified.workers.length, 4);
  assert.equal(f.verified.namespaces.length, 4);
  assert.deepEqual(f.verified.applications, []);
  assert.equal(f.verified.nativeExecutionPossible, false);
  assert.deepEqual(f.verified.schedules, [
    { worker: `${f.manifest.prefix}-gateway`, cron: '* * * * *' },
  ]);
});

test('operations readback rejects missing, extra or altered schedules and native capability', () => {
  for (const mutate of [
    (f) => {
      f.snapshot.workers.gateway.schedules = [];
    },
    (f) => {
      f.snapshot.workers.gateway.schedules[0].cron = '*/2 * * * *';
    },
    (f) => {
      f.snapshot.workers.gateway.schedules.push({ cron: '* * * * *' });
    },
    (f) => {
      f.snapshot.workers.tenant.schedules.push({ cron: '* * * * *' });
    },
    (f) => {
      f.snapshot.workers.gateway.schedules[0].enabled = false;
    },
    (f) => {
      f.snapshot.workers.admission.version.containers = [{ name: 'unexpected' }];
    },
    (f) => {
      f.snapshot.applications.push({ name: `${f.manifest.prefix}-unexpected`, id: 'a'.repeat(32) });
    },
    (f) => {
      f.snapshot.workers.admission.version.bindings.find((b) => b.name === 'REQUESTS').class_name =
        'KilnNativeRequest';
    },
    (f) => {
      f.receipt.mode = 'private-lifecycle';
    },
    (f) => {
      f.receipt.nativeExecutionPossible = true;
    },
    (f) => {
      f.receipt.images = f.manifest.images;
    },
    (f) => {
      f.receipt.requiredGatewaySecrets = ['GITHUB_CLIENT_SECRET'];
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => verifyOperationsDeployment(f.manifest, f.receipt, f.snapshot));
  }
});

test('operations readback requires exact code, storage, active version and private surfaces', () => {
  for (const mutate of [
    (f) => {
      f.snapshot.complete = false;
    },
    (f) => {
      f.snapshot.account = 'b'.repeat(32);
    },
    (f) => {
      f.snapshot.workers.gateway.version.modules[0].content_base64 =
        Buffer.from('changed').toString('base64');
    },
    (f) => {
      f.snapshot.workers.gateway.deployments.deployments[0].versions[0].percentage = 99;
    },
    (f) => {
      f.snapshot.workers.gateway.worker.subdomain.enabled = true;
    },
    (f) => {
      f.snapshot.workers.gateway.routes = [{ pattern: 'kiln.example/*' }];
    },
    (f) => {
      f.snapshot.workers.gateway.version.bindings.push({ name: 'SECRET', type: 'secret_text' });
    },
    (f) => {
      delete f.snapshot.workers.gateway.scriptSettings;
    },
    (f) => {
      f.snapshot.workers.gateway.scriptSettings.logpush = true;
    },
    (f) => {
      f.snapshot.namespaces[0].use_sqlite = false;
    },
    (f) => {
      f.snapshot.database.uuid = 'other';
    },
    (f) => {
      f.snapshot.bucket.name = 'production';
    },
    (f) => {
      f.snapshot.customDomains.domains = [{ domain: 'public.example' }];
    },
    (f) => {
      f.snapshot.migrations.pop();
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => verifyOperationsDeployment(f.manifest, f.receipt, f.snapshot));
  }
});

test('operations cleanup scopes exact disposable resources and disables Cron before deleting dependencies', () => {
  const f = stopped();
  const plan = planOperationsCleanup(f.manifest, f.verified, f.status);
  assert.deepEqual(
    plan.workers.map((w) => w.role),
    ['operator', 'gateway', 'admission', 'tenant'],
  );
  assert.deepEqual(plan.disableSchedules, [`${f.manifest.prefix}-gateway`]);
  assert.equal(plan.namespaces.length, 4);
  assert.deepEqual(plan.applications, []);
  assert.equal(plan.database.id, f.manifest.database.id);
  assert.equal(plan.executed, false);
  for (const state of ['stopped', 'failed']) {
    f.status.record.state = state;
    f.status.record.passed = false;
    assert.equal(planOperationsCleanup(f.manifest, f.verified, f.status).executed, false);
  }
});

test('operations cleanup refuses active alarms, credentials, work or changed resource identity', () => {
  for (const mutate of [
    (f) => {
      f.status.record.state = 'waiting';
    },
    (f) => {
      f.status.record = null;
    },
    (f) => {
      f.status.alarmAt = 1234;
    },
    (f) => {
      delete f.status.alarmAt;
    },
    (f) => {
      f.status.privateStatePresent = true;
    },
    (f) => {
      f.status.admission.paused = false;
    },
    (f) => {
      f.status.admission.activeRequests = 1;
    },
    (f) => {
      f.status.admission.pendingCleanup = 1;
    },
    (f) => {
      f.verified.workers[0].name = 'production';
    },
    (f) => {
      f.verified.workers.push(f.verified.workers[0]);
    },
    (f) => {
      f.verified.namespaces[0].script = 'production';
    },
    (f) => {
      f.verified.namespaces[0].id = f.verified.namespaces[1].id;
    },
    (f) => {
      f.verified.database.id = 'other';
    },
    (f) => {
      f.verified.nativeExecutionPossible = true;
    },
  ]) {
    const f = stopped();
    mutate(f);
    assert.throws(() => planOperationsCleanup(f.manifest, f.verified, f.status));
  }
});
