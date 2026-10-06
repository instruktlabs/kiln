import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { migrateAccounts } from './database.mjs';

let runtime;
let database;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./browser-sessions-worker.ts', import.meta.url))],
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
        throw new Error('Session storage must not fetch');
      },
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
});
after(async () => runtime?.dispose());

const cookie = (issued) => issued.cookie.split(';')[0];
const issue = async (subject, previous) => {
  const response = await runtime.dispatchFetch('https://kiln.test/issue', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(previous ? { cookie: cookie(previous) } : {}),
    },
    body: JSON.stringify({ issuer: 'https://github.com', subject }),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const read = (issued, headers = {}, url = 'https://kiln.test/account') =>
  runtime.dispatchFetch(url, { headers: { cookie: cookie(issued), ...headers } });
const logout = (issued, csrf = issued.csrf, origin = 'https://kiln.test', method = 'POST') =>
  runtime.dispatchFetch('https://kiln.test/logout', {
    method,
    headers: { cookie: cookie(issued), origin, 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify({ csrf }),
  });

test('browser sessions use fresh protected cookies and store only bearer-token hashes', async () => {
  const issued = await issue('browser-storage');
  assert.match(issued.cookie, /^__Host-kiln-session=[a-f0-9]{64};/);
  for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=86400'])
    assert.ok(issued.cookie.includes(attribute));
  assert.ok(!issued.cookie.includes('Domain='));
  assert.match(issued.csrf, /^[a-f0-9]{64}$/);
  const session = await (await read(issued)).json();
  assert.equal(session.accountId, issued.account.id);
  assert.equal(session.accountEpoch, 1);
  const rows = await database.prepare('SELECT * FROM kiln_browser_sessions').all();
  const raw = cookie(issued).split('=')[1];
  assert.ok(!JSON.stringify(rows.results).includes(raw));
  const again = await issue('browser-storage');
  assert.equal(again.account.id, issued.account.id);
  assert.notEqual(cookie(again), cookie(issued));
});

test('a session cannot authenticate with a header, URL token, duplicate cookie, foreign origin or a stored hash', async () => {
  const issued = await issue('browser-cookie-admission');
  const raw = cookie(issued).split('=')[1];
  const stored = await database
    .prepare('SELECT token_hash FROM kiln_browser_sessions WHERE account_id=?')
    .bind(issued.account.id)
    .first();
  for (const headers of [
    { cookie: '', authorization: `Bearer ${raw}` },
    { cookie: `${cookie(issued)}; ${cookie(issued)}` },
    { cookie: `__Host-kiln-session=${stored.token_hash}` },
    { cookie: '__Host-kiln-session=invalid' },
    { cookie: `${cookie(issued)}; padding=${'x'.repeat(8192)}` },
  ])
    assert.equal((await read(issued, headers)).status, 401);
  assert.equal(
    (await read(issued, { cookie: '' }, `https://kiln.test/account?session=${raw}`)).status,
    401,
  );
  assert.equal((await read(issued, {}, 'https://foreign.test/account')).status, 401);
});

test('expired sessions and changed account state or epoch fail closed', async () => {
  for (const mutation of ['expired', 'epoch', 'disabled', 'deleting']) {
    const issued = await issue(`browser-${mutation}`);
    if (mutation === 'expired')
      await database
        .prepare('UPDATE kiln_browser_sessions SET expires_at=0 WHERE account_id=?')
        .bind(issued.account.id)
        .run();
    else if (mutation === 'epoch')
      await database
        .prepare('UPDATE kiln_accounts SET authorization_epoch=2 WHERE id=?')
        .bind(issued.account.id)
        .run();
    else
      await database
        .prepare('UPDATE kiln_accounts SET state=? WHERE id=?')
        .bind(mutation, issued.account.id)
        .run();
    assert.equal((await read(issued)).status, 401);
  }
});

test('logout requires a same-origin POST and matching session CSRF proof', async () => {
  const issued = await issue('browser-logout');
  const other = await issue('browser-other');
  assert.equal((await logout(issued, issued.csrf, 'https://foreign.test')).status, 403);
  assert.equal((await logout(issued, other.csrf)).status, 403);
  assert.equal((await logout(issued, issued.csrf, 'https://kiln.test', 'GET')).status, 403);
  assert.equal((await read(issued)).status, 200);
  const result = await logout(issued);
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await read(issued)).status, 401);
  assert.equal((await read(other)).status, 200);
});

test('each account retains at most eight sessions without revoking other accounts', async () => {
  const other = await issue('browser-limit-other');
  const issued = await Promise.all(
    Array.from({ length: 20 }, () => issue('browser-session-limit')),
  );
  const accountId = issued[0].account.id;
  assert.equal(new Set(issued.map((value) => value.account.id)).size, 1);
  const row = await database
    .prepare('SELECT COUNT(*) AS n FROM kiln_browser_sessions WHERE account_id=?')
    .bind(accountId)
    .first();
  assert.equal(row.n, 8);
  assert.equal((await read(other)).status, 200);
});

test('session-write failure rolls back pruning and leaves existing sessions intact', async () => {
  const issued = await issue('browser-rollback');
  await database
    .prepare(`CREATE TRIGGER reject_session BEFORE INSERT ON kiln_browser_sessions
    BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`)
    .run();
  const response = await runtime.dispatchFetch('https://kiln.test/issue', {
    method: 'POST',
    body: JSON.stringify({ issuer: 'https://github.com', subject: 'browser-rollback' }),
  });
  assert.equal(response.status, 503);
  assert.equal((await read(issued)).status, 200);
  await database.prepare('DROP TRIGGER reject_session').run();
});

test('idle sessions expire and active requests cannot extend the absolute lifetime', async () => {
  const idle = await issue('browser-idle');
  await database
    .prepare('UPDATE kiln_browser_sessions SET idle_expires_at=0 WHERE account_id=?')
    .bind(idle.account.id)
    .run();
  assert.equal((await read(idle)).status, 401);
  assert.equal((await logout(idle)).status, 403);
  const active = await issue('browser-active');
  const absolute = Date.now() + 60_000;
  await database
    .prepare('UPDATE kiln_browser_sessions SET expires_at=? WHERE account_id=?')
    .bind(absolute, active.account.id)
    .run();
  assert.equal((await read(active)).status, 200);
  const stored = await database
    .prepare('SELECT expires_at, idle_expires_at FROM kiln_browser_sessions WHERE account_id=?')
    .bind(active.account.id)
    .first();
  assert.equal(stored.expires_at, absolute);
  assert.equal(stored.idle_expires_at, absolute);
});

test('fresh browser sign-in replaces that browser session without affecting another device', async () => {
  const previous = await issue('browser-rotation');
  const other = await issue('browser-rotation');
  const current = await issue('browser-rotation', previous);
  assert.equal((await read(previous)).status, 401);
  assert.equal((await read(current)).status, 200);
  assert.equal((await read(other)).status, 200);
});

test('rotating a browser at the session limit retains the other seven devices', async () => {
  const devices = [];
  for (let index = 0; index < 8; index++) devices.push(await issue('browser-rotation-limit'));
  const current = await issue('browser-rotation-limit', devices[7]);
  assert.equal((await read(current)).status, 200);
  assert.equal((await read(devices[7])).status, 401);
  for (const device of devices.slice(0, 7)) assert.equal((await read(device)).status, 200);
});
