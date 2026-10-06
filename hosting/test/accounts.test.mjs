import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

let runtime;
let database;
const google = 'https://accounts.google.com';
const github = 'https://github.com';
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./accounts-worker.ts', import.meta.url))],
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
      outboundService: async () => {
        throw new Error('Accounts must not fetch');
      },
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  const schema = await readFile(
    new URL('../migrations/0001_accounts.sql', import.meta.url),
    'utf8',
  );
  await database.batch(
    schema
      .split(';')
      .filter((sql) => sql.trim())
      .map((sql) => database.prepare(sql)),
  );
});
after(async () => runtime?.dispose());

const resolve = (issuer, subject, extra = {}) =>
  runtime.dispatchFetch('https://accounts.test/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issuer, subject, ...extra }),
  });
const count = async () =>
  (await database.prepare('SELECT COUNT(*) AS n FROM kiln_accounts').first()).n;

test('verified identities get stable independent Kiln IDs without storing contact data or tokens', async () => {
  const response = await resolve(github, '1001', {
    email: 'shared@example.test',
    access_token: 'fixture-only',
  });
  assert.equal(response.status, 200);
  const account = await response.json();
  assert.match(account.id, /^ka_[a-f0-9]{32}$/);
  assert.equal(account.state, 'active');
  assert.equal(account.authorizationEpoch, 1);
  assert.deepEqual(
    await (await resolve(github, '1001', { email: 'changed@example.test' })).json(),
    account,
  );
  assert.deepEqual(
    await (await runtime.dispatchFetch(`https://accounts.test/${account.id}`)).json(),
    account,
  );
  const identity = await database
    .prepare('SELECT * FROM kiln_identities WHERE issuer=? AND subject=?')
    .bind(github, '1001')
    .first();
  assert.deepEqual(Object.keys(identity).sort(), ['account_id', 'created_at', 'issuer', 'subject']);
  assert.equal(identity.account_id, account.id);
});

test('the same email or subject at different issuers never automatically merges accounts', async () => {
  const a = await (await resolve(github, '2002', { email: 'same@example.test' })).json();
  const b = await (await resolve(google, '2002', { email: 'same@example.test' })).json();
  assert.notEqual(a.id, b.id);
});

test('concurrent first sign-ins create exactly one identity and one account with no orphan rows', async () => {
  const before = await count();
  const responses = await Promise.all(
    Array.from({ length: 24 }, () => resolve(google, 'concurrent-subject')),
  );
  const accounts = await Promise.all(
    responses.map(async (response) => {
      assert.equal(response.status, 200);
      return response.json();
    }),
  );
  assert.equal(new Set(accounts.map((account) => account.id)).size, 1);
  assert.equal(await count(), before + 1);
  const identities = await database
    .prepare('SELECT COUNT(*) AS n FROM kiln_identities WHERE issuer=? AND subject=?')
    .bind(google, 'concurrent-subject')
    .first();
  assert.equal(identities.n, 1);
});

test('identity-write failure rolls back its new account as one transaction', async () => {
  await database
    .prepare(`CREATE TRIGGER reject_fixture_identity BEFORE INSERT ON kiln_identities
    WHEN NEW.subject = 'rollback-subject' BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`)
    .run();
  const before = await count();
  assert.equal((await resolve(google, 'rollback-subject')).status, 503);
  assert.equal(await count(), before);
  await database.prepare('DROP TRIGGER reject_fixture_identity').run();
  assert.equal((await resolve(google, 'rollback-subject')).status, 200);
  assert.equal(await count(), before + 1);
});

test('disabled and deleting accounts cannot sign in or acquire a replacement account', async () => {
  for (const state of ['disabled', 'deleting']) {
    const account = await (await resolve(google, `state-${state}`)).json();
    await database
      .prepare('UPDATE kiln_accounts SET state=?, authorization_epoch=2 WHERE id=?')
      .bind(state, account.id)
      .run();
    const before = await count();
    assert.equal((await resolve(google, `state-${state}`)).status, 403);
    assert.equal(await count(), before);
    assert.deepEqual(
      await (await runtime.dispatchFetch(`https://accounts.test/${account.id}`)).json(),
      { ...account, state, authorizationEpoch: 2 },
    );
  }
});

test('identity keys are bounded, exact and restricted to configured issuers', async () => {
  const before = await count();
  for (const [issuer, subject] of [
    [google, ''],
    [google, 'a'.repeat(256)],
    [google, 'bad\nsubject'],
    [google, 123],
    ['https://foreign.example', '1001'],
    [`${google}/`, '1001'],
  ]) {
    assert.equal((await resolve(issuer, subject)).status, 400);
  }
  assert.equal(await count(), before);
  const a = await (await resolve(google, 'CaseSensitive')).json();
  const b = await (await resolve(google, 'casesensitive')).json();
  assert.notEqual(a.id, b.id);
  assert.equal((await runtime.dispatchFetch('https://accounts.test/not-an-account')).status, 400);
  assert.equal(
    await (
      await runtime.dispatchFetch('https://accounts.test/ka_00000000000000000000000000000000')
    ).json(),
    null,
  );
});
