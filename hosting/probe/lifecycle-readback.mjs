import assert from 'node:assert/strict';
import { lifecycleConfig } from './lifecycle-config.mjs';

const sorted = (values) => [...values].sort();
const one = (values, predicate) => {
  const found = values.filter(predicate);
  assert.equal(found.length, 1, 'Expected exactly one matching private resource');
  return found[0];
};
const identifier = (value) => assert(typeof value === 'string' && /^[a-f0-9-]{28,64}$/.test(value));

export { verifyLifecycleDeployment } from './private-readback.mjs';

/** Produces targets only. Re-read this exact deployment immediately before
 * executing, check the IDs again, retain evidence, and verify absence afterward.
 * This does not grant permission, perform deletion, or claim it succeeded. */
export function planLifecycleCleanup(manifest, verified, status, instances) {
  const c = lifecycleConfig(manifest);
  assert.equal(verified.account, manifest.account);
  assert.equal(verified.prefix, manifest.prefix);
  assert.equal(verified.privateConfigurationVerified, true);
  assert.deepEqual(verified.database, { id: manifest.database.id, name: manifest.database.name });
  assert.deepEqual(verified.kv, { id: manifest.oauthKv, title: `${manifest.prefix}-oauth` });
  assert.equal(verified.bucket, manifest.bucket);
  assert.deepEqual(
    verified.workers.map((w) => w.role),
    c.deployOrder,
  );
  for (const w of verified.workers) {
    assert.equal(w.name, c.workers[w.role].name);
    identifier(w.id);
  }
  for (const a of verified.applications) {
    assert.equal(a.name, c.containers[a.role].name);
    identifier(a.id);
    assert.equal(a.kind, a.role === 'request' ? 'coordinator' : a.role);
    assert.deepEqual(
      a.images,
      Object.fromEntries(
        Object.entries(c.containers[a.role].images).map(([key, v]) => [key, v.reference]),
      ),
    );
  }
  assert.deepEqual(sorted(verified.applications.map((a) => a.role)), [
    'evaluation',
    'render',
    'request',
  ]);
  assert.equal(status.operatorStopped, true);
  assert.equal(status.alarmAt, null);
  assert(status.record === null || ['finished', 'stopped'].includes(status.record.state));
  assert.equal(status.budget.state, 'closed');
  assert.equal(status.admission.paused, true);
  assert.equal(status.admission.activeRequests, 0);
  assert.equal(status.admission.pendingCleanup, 0);
  const claims = status.budget.claims;
  const limits = { coordinator: 14, evaluation: 4, render: 4 };
  assert(claims.length <= 22);
  assert.equal(new Set(claims.map((x) => `${x.kind}:${x.id}`)).size, claims.length);
  for (const claim of claims) {
    assert(Object.hasOwn(limits, claim.kind));
    assert.match(claim.id, /^[a-f0-9]{64}$/);
  }
  for (const [kind, limit] of Object.entries(limits))
    assert(claims.filter((c) => c.kind === kind).length <= limit);
  assert(instances.length <= claims.length);
  assert.equal(new Set(instances.map((i) => `${i.application_id}:${i.id}`)).size, instances.length);
  for (const instance of instances) {
    const app = one(verified.applications, (a) => a.id === instance.application_id);
    assert.equal(instance.status.state, 'stopped');
    assert(Object.values(app.images).includes(instance.image));
    assert(claims.some((c) => c.kind === app.kind && c.id === instance.id));
  }
  return {
    sourceCommit: verified.sourceCommit,
    account: manifest.account,
    workers: verified.workers.toReversed(),
    applications: verified.applications,
    namespaces: verified.namespaces,
    database: verified.database,
    kv: verified.kv,
    bucket: verified.bucket,
    registryImages: 'preserve',
    claims: claims.length,
    verifiedStoppedInstances: instances.length,
    metrics: { ...verified.metrics, deletionVerified: false },
    executed: false,
  };
}
