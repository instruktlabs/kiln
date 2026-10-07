import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { migrateAccounts } from './database.mjs';

let limitIngress, limitAccount, runtime;
const origin = 'https://kiln.example.com';
const request = (path, options) => new Request(`${origin}${path}`, options);
const account = `ka_${'a'.repeat(32)}`;
function fixture(outcome = { success: true }) {
  const keys = [];
  const binding = {
    async limit({ key }) {
      keys.push(key);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return { keys, env: { EDGE_REQUEST_LIMIT: binding, ACCOUNT_REQUEST_LIMIT: binding } };
}
before(async () => {
  const output = new URL('../../.cache/request-limit-tests/limits.mjs', import.meta.url);
  await mkdir(fileURLToPath(new URL('.', output)), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/request-limits.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: fileURLToPath(output),
  });
  ({ limitIngress, limitAccount } = await import(output));
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./request-limits-worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
      bindings: { PUBLIC_ORIGIN: origin },
      d1Databases: ['ACCOUNTS'],
      kvNamespaces: ['OAUTH_KV'],
      ratelimits: {
        EDGE_REQUEST_LIMIT: { namespace_id: '1001', simple: { limit: 2, period: 60 } },
        ACCOUNT_REQUEST_LIMIT: { namespace_id: '1002', simple: { limit: 2, period: 60 } },
      },
      outboundService: () => {
        throw new Error('External I/O forbidden');
      },
    }),
  );
  await migrateAccounts(await runtime.getD1Database('ACCOUNTS'));
});
after(async () => runtime?.dispose());

test('all caller variations of one route share a bounded ingress bucket without private data', async () => {
  const f = fixture();
  for (const path of ['/register', '/register?client_id=private-name&code=private-code']) {
    assert.equal(
      await limitIngress(
        request(path, {
          method: 'POST',
          headers: {
            authorization: 'Bearer private-token',
            cookie: 'private-cookie',
            'x-tenant': 'arbitrary',
            'cf-connecting-ip': '192.0.2.1',
          },
          body: 'private-source',
        }),
        f.env,
        origin,
      ),
      undefined,
    );
  }
  assert.equal(f.keys.length, 2);
  assert.equal(f.keys[0], f.keys[1]);
  assert(!f.keys.some((key) => /private-|192\.0|arbitrary/.test(key)));
  for (const path of ['/mcp', '/mcp/artifacts/a', '/mcp/artifacts/b?code=secret'])
    await limitIngress(request(path), f.env, origin);
  assert.equal(new Set(f.keys.slice(2)).size, 1);
  assert.notEqual(f.keys[0], f.keys[2]);
  for (const path of ['/oauth/google/callback?state=a', '/oauth/github/callback?state=b'])
    await limitIngress(request(path), f.env, origin);
  assert.equal(f.keys[5], f.keys[6]);
  for (const path of ['/arbitrary-one', '/arbitrary-two', '/oauth/token/anything'])
    await limitIngress(request(path), f.env, origin);
  assert.equal(f.keys[7], f.keys[8]);
  assert.notEqual(f.keys[7], f.keys[9]);
});

test('a stalled limiter fails closed at the real one-second deadline', async () => {
  const f = fixture();
  f.env.EDGE_REQUEST_LIMIT = { limit: () => new Promise(() => {}) };
  const result = await limitIngress(request('/mcp'), f.env, origin);
  assert.equal(result.status, 503);
  assert.equal(await result.text(), 'Service temporarily unavailable');
});

test('gateway refuses exhausted or missing limits before OAuth, database or provider I/O', async () => {
  await runtime.dispatchFetch(`${origin}/fixture/reset`);
  for (const mode of ['deny', 'missing']) {
    for (const path of [
      '/register',
      '/oauth/token',
      '/authorize',
      '/oauth/google/callback',
      '/oauth/github/callback',
      '/account',
      '/account/delete',
      '/downloads/private/file.glb',
      '/mcp',
      '/mcp/artifacts/private',
      '/.well-known/oauth-authorization-server',
    ]) {
      const response = await runtime.dispatchFetch(`${origin}${path}`, {
        headers: {
          'x-fixture-ingress': mode,
          authorization: 'Bearer private-token',
          cookie: 'private-cookie',
        },
      });
      assert.equal(response.status, mode === 'deny' ? 429 : 503, `${mode} ${path}`);
    }
  }
  assert.deepEqual(await (await runtime.dispatchFetch(`${origin}/fixture/stats`)).json(), {
    auth: 0,
    storage: 0,
    compute: 0,
  });
});

test('real local edge binding exhausts a route bucket without unbounded caller keys', async () => {
  // No auth/storage access for unknown paths; 404 confirms the admitted branch.
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const response = await runtime.dispatchFetch(`${origin}/unknown-${i}?ignored=${i}`);
    statuses.push(response.status);
    await response.text();
  }
  assert.deepEqual(statuses, [404, 404, 429]);
  const discovery = await runtime.dispatchFetch(`${origin}/.well-known/oauth-authorization-server`);
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).issuer, origin);
});

test('real account binding shares MCP and browser attempts while isolating another account', async () => {
  await runtime.dispatchFetch(`${origin}/fixture/reset`);
  const session = async (subject) => {
    const response = await runtime.dispatchFetch(`${origin}/fixture/session`, {
      method: 'POST',
      body: subject,
    });
    return { ...(await response.json()), cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  const alice = await session('rate-alice'),
    bob = await session('rate-bob');
  const invoke = async (identity, method) =>
    runtime.dispatchFetch(`${origin}/fixture/mcp`, {
      method: 'POST',
      headers: {
        'x-fixture-account': identity.accountId,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params:
          method === 'tools/call'
            ? { name: 'kiln_validate', arguments: { code: 'function build(){}' } }
            : {},
      }),
    });
  assert.equal((await invoke(alice, 'tools/list')).status, 200);
  const download = (identity) =>
    runtime.dispatchFetch(`${origin}/downloads/${'a'.repeat(64)}/asset.glb`, {
      headers: { cookie: identity.cookie },
    });
  assert.equal((await download(alice)).status, 200);
  const blocked = await invoke(alice, 'tools/call');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal((await download(alice)).status, 429);
  assert.equal((await download(bob)).status, 200);
  assert.deepEqual(await (await runtime.dispatchFetch(`${origin}/fixture/stats`)).json(), {
    auth: 0,
    storage: 2,
    compute: 0,
  });
});

test('ingress rejection cancels the unread body and returns a retryable private response', async () => {
  const f = fixture({ success: false });
  let cancelled = false;
  const body = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });
  const response = await limitIngress(
    request('/register', { method: 'POST', body, duplex: 'half' }),
    f.env,
    origin,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(cancelled, true);
});

test('missing, broken and malformed limiter results fail closed without exposing their data', async () => {
  for (const outcome of [new Error('private-provider-secret'), {}, { success: 'true' }, null]) {
    const f = fixture(outcome);
    const result = await limitIngress(request('/oauth/token'), f.env, origin);
    assert.equal(result.status, 503);
    assert(!/secret|provider/.test(await result.text()));
  }
  for (const env of [{}, { EDGE_REQUEST_LIMIT: fixture().env.EDGE_REQUEST_LIMIT }])
    assert.equal((await limitIngress(request('/mcp'), env, origin)).status, 503);
});

test('account limits use verified permanent ownership across tokens, apps and network addresses', async () => {
  const f = fixture();
  for (const [path, token, ip] of [
    ['/mcp', 'one', '192.0.2.1'],
    ['/downloads/two/file.glb', 'two', '192.0.2.2'],
  ])
    assert.equal(
      await limitAccount(
        request(path, { headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': ip } }),
        f.env,
        origin,
        account,
      ),
      undefined,
    );
  assert.equal(f.keys.length, 2);
  assert.equal(f.keys[0], f.keys[1]);
  assert(!f.keys[0].includes(account));
  await limitAccount(request('/mcp'), f.env, origin, `ka_${'b'.repeat(32)}`);
  assert.notEqual(f.keys[0], f.keys[2]);
  await limitAccount(request('/mcp'), f.env, 'https://other.example.com', account);
  assert.notEqual(f.keys[0], f.keys[3]);
  const denied = fixture({ success: false });
  assert.equal((await limitAccount(request('/mcp'), denied.env, origin, account)).status, 429);
  assert.equal(
    (await limitAccount(request('/mcp'), denied.env, origin, 'caller-selected-user')).status,
    401,
  );
  assert.equal(denied.keys.length, 1);
});
