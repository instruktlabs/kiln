import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { migrateAccounts } from './database.mjs';

let runtime, database;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./login-intents-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      d1Databases: ['ACCOUNTS'],
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
});
after(async () => runtime?.dispose());
const intent = () => ({
  id: randomUUID(),
  state: randomUUID(),
  provider: 'google',
  purpose: 'sign-in',
});
const call = (action, input, origin = 'https://kiln.test') =>
  runtime.dispatchFetch(`${origin}/${action}`, { method: 'POST', body: JSON.stringify(input) });

test('only one simultaneous use of a browser-validated consent handle succeeds', async () => {
  const input = { handle: randomUUID() };
  const results = await Promise.all(Array.from({ length: 24 }, () => call('consent', input)));
  assert.equal(results.filter((r) => r.status === 204).length, 1);
  assert.equal(results.filter((r) => r.status === 400).length, 23);
  assert.equal((await call('consent', input, 'https://other.test')).status, 204);
});

test('only one simultaneous callback can consume an intent, even with stale upstream KV', async () => {
  const input = intent();
  assert.equal((await call('create', input)).status, 204);
  const stored = await database
    .prepare('SELECT * FROM kiln_login_intents WHERE id=?')
    .bind(input.id)
    .first();
  assert.ok(!JSON.stringify(stored).includes(input.state));
  const results = await Promise.all(Array.from({ length: 24 }, () => call('consume', input)));
  assert.equal(results.filter((r) => r.status === 204).length, 1);
  assert.equal(results.filter((r) => r.status === 400).length, 23);
});

test('provider, purpose, origin and state must all match without burning the valid intent', async () => {
  const input = intent();
  assert.equal((await call('create', input)).status, 204);
  for (const patch of [
    { provider: 'github' },
    { purpose: 'link' },
    { state: randomUUID() },
    { id: randomUUID() },
  ]) {
    assert.equal((await call('consume', { ...input, ...patch })).status, 400);
  }
  assert.equal((await call('consume', input, 'https://other.test')).status, 400);
  assert.equal((await call('consume', input)).status, 204);
});

test('expired intents fail closed; malformed input cannot reach storage', async () => {
  const input = intent();
  assert.equal((await call('create', input)).status, 204);
  await database
    .prepare('UPDATE kiln_login_intents SET expires_at=0 WHERE id=?')
    .bind(input.id)
    .run();
  assert.equal((await call('consume', input)).status, 400);
  for (const patch of [
    { id: '' },
    { state: '' },
    { state: 'x'.repeat(4097) },
    { provider: 'foreign' },
    { purpose: 'link' },
  ]) {
    assert.equal((await call('create', { ...intent(), ...patch })).status, 400);
  }
  assert.equal((await call('consent', { handle: '' })).status, 400);
});
