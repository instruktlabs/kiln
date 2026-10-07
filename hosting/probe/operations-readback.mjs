import assert from 'node:assert/strict';
import { operationsConfig } from './operations-config.mjs';
export { verifyOperationsDeployment } from './private-readback.mjs';

/** Offline target plan only. The operator must freshly verify the deployment,
 * stop the run, disable Cron, recheck each resource ID and verify absence after
 * removal. This function neither authorizes nor performs a cloud mutation. */
export function planOperationsCleanup(manifest, verified, status) {
  const c = operationsConfig(manifest);
  assert.equal(verified.account, manifest.account);
  assert.equal(verified.prefix, manifest.prefix);
  assert.equal(verified.privateConfigurationVerified, true);
  assert.equal(verified.nativeExecutionPossible, false);
  assert.match(verified.sourceCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(verified.database, { id: manifest.database.id, name: manifest.database.name });
  assert.deepEqual(verified.kv, { id: manifest.oauthKv, title: `${manifest.prefix}-oauth` });
  assert.equal(verified.bucket, manifest.bucket);
  assert.deepEqual(verified.applications, []);
  assert.deepEqual(verified.schedules, [{ worker: c.workers.gateway.name, cron: '* * * * *' }]);
  assert.deepEqual(verified.workers.map(w => w.role), c.deployOrder);
  assert.equal(new Set(verified.workers.map(w => w.id)).size, 4);
  for (const w of verified.workers) {
    assert.equal(w.name, c.workers[w.role].name);
    for (const field of ['id', 'version', 'deployment']) assert.match(w[field], /^[a-f0-9-]{28,64}$/);
    assert.match(w.sha256, /^[a-f0-9]{64}$/);
  }
  const expectedClasses = Object.values(c.workers).flatMap(w => Object.entries(w.exports)
    .filter(([, e]) => e.type === 'durable-object').map(([name]) => `${w.name}:${name}`));
  assert.deepEqual(verified.namespaces.map(n => `${n.script}:${n.class}`).sort(), expectedClasses.sort());
  assert.equal(new Set(verified.namespaces.map(n => n.id)).size, 4);
  for (const n of verified.namespaces) {
    assert.match(n.id, /^[a-f0-9-]{28,64}$/);
    assert.equal(n.use_sqlite, true);
  }
  assert(status.record && ['finished', 'failed', 'stopped'].includes(status.record.state));
  assert.equal(status.record.nativeExecutionPossible, false);
  assert.equal(status.alarmAt, null);
  assert.equal(status.privateStatePresent, false);
  assert.equal(status.admission.paused, true);
  assert.equal(status.admission.activeRequests, 0);
  assert.equal(status.admission.pendingCleanup, 0);
  return {
    sourceCommit: verified.sourceCommit,
    account: manifest.account,
    disableSchedules: [c.workers.gateway.name],
    workers: verified.workers.toReversed(),
    applications: [],
    namespaces: verified.namespaces,
    database: verified.database,
    kv: verified.kv,
    bucket: verified.bucket,
    metrics: { ...verified.metrics, deletionVerified: false },
    executed: false,
  };
}
