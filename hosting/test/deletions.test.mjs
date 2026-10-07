import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { before, after, beforeEach, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { migrateAccounts } from './database.mjs';

let runtime, database;
let now;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./deletions-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      d1Databases: ['ACCOUNTS'],
      outboundService: () => {
        throw new Error('Unexpected network');
      },
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
  await database.exec(
    'CREATE TABLE fixture_calls (phase TEXT, account TEXT); CREATE TABLE fixture_faults (name TEXT PRIMARY KEY)',
  );
});
after(async () => runtime?.dispose());
beforeEach(async () => {
  now = Date.now();
  await database.exec(
    'DELETE FROM fixture_calls; DELETE FROM fixture_faults; DELETE FROM kiln_deletions; DELETE FROM kiln_browser_sessions; DELETE FROM kiln_connections; DELETE FROM kiln_account_events; DELETE FROM kiln_identities; DELETE FROM kiln_accounts',
  );
});
const random = () => randomBytes(32).toString('hex');
const send = (path, init = {}) =>
  runtime.dispatchFetch(`https://fixture.internal${path}`, {
    ...init,
    headers: { 'x-fixture-now': String(now), ...init.headers },
  });
async function owner() {
  const accountId = `ka_${randomBytes(16).toString('hex')}`;
  const identity = { issuer: 'https://github.com', subject: random() };
  const proof = {
    binding: random(),
    accountId,
    accountEpoch: 1,
    authenticatedAt: now,
    expiresAt: now + 100_000,
    csrf: random(),
  };
  await database.batch([
    database.prepare('INSERT INTO kiln_accounts(id,created_at) VALUES (?,?)').bind(accountId, now),
    database
      .prepare('INSERT INTO kiln_identities VALUES (?,?,?,?)')
      .bind(identity.issuer, identity.subject, accountId, now),
    database
      .prepare('INSERT INTO kiln_browser_sessions VALUES (?,?,?,?,?,?,?)')
      .bind(proof.binding, accountId, 1, now, proof.expiresAt, proof.expiresAt, proof.csrf),
  ]);
  return { proof, identity, receipt: random() };
}
const begin = (value) => send('/request', { method: 'POST', body: JSON.stringify(value) });
const status = async (value) =>
  (await send('/status', { headers: { 'x-fixture-receipt': value.receipt } })).json();
const row = (value) =>
  database
    .prepare('SELECT * FROM kiln_deletions WHERE receipt_hash IS NOT NULL AND account_id=?')
    .bind(value.proof.accountId)
    .first();
const account = (value) =>
  database.prepare('SELECT * FROM kiln_accounts WHERE id=?').bind(value.proof.accountId).first();
const calls = async () => (await database.prepare('SELECT * FROM fixture_calls').all()).results;
async function recover() {
  assert.equal((await send('/recover')).status, 200);
}

test('deletion atomically revokes access and persists a private recovery receipt before external work', async () => {
  const a = await owner(),
    b = await owner();
  assert.equal((await begin(a)).status, 200);
  assert.equal((await account(a)).state, 'deleting');
  assert.equal((await account(a)).authorization_epoch, 2);
  assert.equal(
    await database
      .prepare('SELECT 1 FROM kiln_browser_sessions WHERE account_id=?')
      .bind(a.proof.accountId)
      .first(),
    null,
  );
  assert.equal((await account(b)).state, 'active');
  assert.deepEqual(await calls(), []);
  assert.equal((await status(a)).state, 'pending');
  assert.equal((await status(a)).phase, 'compute');
  assert.notEqual((await row(a)).receipt_hash, a.receipt);
  assert.equal((await begin(a)).status, 403);
  assert.equal((await send('/status', { headers: { 'x-fixture-receipt': random() } })).status, 404);
});

test('revocation and recovery intent roll back together on a storage failure', async () => {
  const a = await owner();
  await database.exec(
    "CREATE TRIGGER fail_deletion BEFORE INSERT ON kiln_deletions BEGIN SELECT RAISE(ABORT,'fixture'); END",
  );
  try {
    assert.equal((await begin(a)).status, 503);
    assert.equal((await account(a)).state, 'active');
    assert.equal((await account(a)).authorization_epoch, 1);
    assert.ok(
      await database
        .prepare('SELECT 1 FROM kiln_browser_sessions WHERE account_id=?')
        .bind(a.proof.accountId)
        .first(),
    );
    assert.equal(await row(a), null);
  } finally {
    await database.exec('DROP TRIGGER fail_deletion');
  }
});

test('only an unexpired current browser proof and its freshly verified identity may request deletion', async () => {
  const a = await owner(),
    b = await owner();
  for (const invalid of [
    { ...a, identity: b.identity },
    { ...a, proof: { ...a.proof, accountEpoch: 2 } },
    { ...a, proof: { ...a.proof, binding: b.proof.binding } },
    { ...a, receipt: 'invalid' },
  ])
    assert.equal((await begin(invalid)).status, 403);
  now += 100_001;
  assert.equal((await begin(a)).status, 403);
  assert.equal((await account(a)).state, 'active');
});

test('recovery preserves strict cleanup order, then removes identity records without reactivating the old account', async () => {
  const a = await owner(),
    b = await owner();
  await begin(a);
  await recover();
  assert.equal((await status(a)).state, 'complete');
  assert.equal(await account(a), null);
  assert.equal((await account(b)).state, 'active');
  assert.deepEqual(
    (await calls()).map(({ phase }) => phase),
    ['compute', 'storage', 'grants'],
  );
  assert((await calls()).every(({ account }) => account === a.proof.accountId));
  assert.equal(
    await database
      .prepare('SELECT 1 FROM kiln_identities WHERE account_id=?')
      .bind(a.proof.accountId)
      .first(),
    null,
  );
  const receipt = await database
    .prepare("SELECT * FROM kiln_deletions WHERE phase='complete'")
    .first();
  assert.equal(receipt.account_id, null);
  assert.equal(receipt.lease_token, null);
  await recover();
  assert.equal((await calls()).length, 3);
  now += 7 * 86400_000 + 1;
  await recover();
  assert.equal(
    (await send('/status', { headers: { 'x-fixture-receipt': a.receipt } })).status,
    404,
  );
});

test('unconfirmed compute cleanup prevents storage removal and survives a recovery restart', async () => {
  const a = await owner();
  await begin(a);
  await database.exec("INSERT INTO fixture_faults VALUES ('compute')");
  await recover();
  assert.equal((await status(a)).phase, 'compute');
  assert.deepEqual(
    (await calls()).map(({ phase }) => phase),
    ['compute'],
  );
  assert.equal((await account(a)).state, 'deleting');
  await recover();
  assert.equal((await calls()).length, 1, 'backoff prevents immediate retry storms');
  await database.exec('DELETE FROM fixture_faults');
  now += 60_001;
  await recover();
  assert.equal((await status(a)).state, 'complete');
});

test('incomplete storage or token cleanup never clears identities or claims completion', async () => {
  for (const fault of ['storage-pending', 'storage-error', 'grants-pending']) {
    const a = await owner();
    await begin(a);
    await database.prepare('INSERT INTO fixture_faults VALUES (?)').bind(fault).run();
    await recover();
    assert.equal((await status(a)).state, 'pending');
    assert.equal((await account(a)).state, 'deleting');
    assert.ok(
      await database
        .prepare('SELECT 1 FROM kiln_identities WHERE account_id=?')
        .bind(a.proof.accountId)
        .first(),
    );
    await database.exec('DELETE FROM fixture_faults');
    now += 60_001;
    await recover();
    assert.equal((await status(a)).state, 'complete');
  }
});

test('concurrent recovery claims do not double-run a phase and expired leases are recoverable', async () => {
  const a = await owner();
  await begin(a);
  await database
    .prepare('UPDATE kiln_deletions SET lease_token=?,lease_until=?')
    .bind('crashed-worker', now + 60_000)
    .run();
  await recover();
  assert.deepEqual(await calls(), []);
  now += 60_001;
  await Promise.all([recover(), recover(), recover()]);
  assert.equal((await status(a)).state, 'complete');
  assert.deepEqual(
    (await calls()).map(({ phase }) => phase),
    ['compute', 'storage', 'grants'],
  );
});

test('a replaced recovery lease cannot advance or finalize another worker claim', async () => {
  const a = await owner();
  await begin(a);
  await database.exec("INSERT INTO fixture_faults VALUES ('lease-takeover')");
  await recover();
  assert.equal((await status(a)).phase, 'compute');
  assert.equal((await row(a)).lease_token, 'replacement');
  assert.deepEqual(
    (await calls()).map(({ phase }) => phase),
    ['compute'],
  );
  await database.exec('DELETE FROM fixture_faults');
  now += 60_001;
  await recover();
  assert.equal((await status(a)).state, 'complete');
});

test('a timed-out cleanup keeps the deletion pending and its late completion cannot advance it', async () => {
  const a = await owner();
  await begin(a);
  await database.exec("INSERT INTO fixture_faults VALUES ('held-compute')");
  // Exercise the real 20-second production deadline, not a shortened fixture.
  const started = Date.now();
  await recover();
  assert(Date.now() - started < 26_000);
  assert.equal((await status(a)).phase, 'compute');
  assert.equal((await account(a)).state, 'deleting');
  const releasedBy = Date.now() + 2000;
  while (
    !(await calls()).some(({ phase }) => phase === 'compute-returned') &&
    Date.now() < releasedBy
  )
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(
    (await calls()).map(({ phase }) => phase),
    ['compute', 'compute-returned'],
  );
  assert.equal((await status(a)).phase, 'compute');
  await database.exec('DELETE FROM fixture_faults');
  now += 60_001;
  await recover();
  assert.equal((await status(a)).state, 'complete');
});

test('failed final erasure rolls back identity removal and cannot claim completion', async () => {
  const a = await owner();
  await begin(a);
  await database.exec(
    "CREATE TRIGGER prevent_account_delete BEFORE DELETE ON kiln_accounts BEGIN SELECT RAISE(ABORT,'fixture'); END",
  );
  try {
    await recover();
    assert.equal((await status(a)).phase, 'identity');
    assert.equal((await status(a)).state, 'pending');
    assert.equal((await account(a)).state, 'deleting');
    assert.ok(
      await database
        .prepare('SELECT 1 FROM kiln_identities WHERE account_id=?')
        .bind(a.proof.accountId)
        .first(),
    );
  } finally {
    await database.exec('DROP TRIGGER prevent_account_delete');
  }
  now += 60_001;
  await recover();
  assert.equal((await status(a)).state, 'complete');
});
