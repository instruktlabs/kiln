import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { migrateAccounts } from './database.mjs';

const origin = 'https://kiln.example.com';
let runtime;
let database;
let outboundCalls = 0;
const googleIssuer = 'https://accounts.google.com';
const googleKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const googleCodes = new Map();
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const digest = (value) => createHash('sha256').update(value).digest('base64url');
const cookies = (response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./worker.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['workerd'],
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: 'auth-fixture',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
      kvNamespaces: ['OAUTH_KV'],
      d1Databases: ['ACCOUNTS'],
      durableObjects: { TENANTS: 'TestTenant' },
      serviceBindings: { NATIVE_COMPUTE: { name: 'auth-fixture', entrypoint: 'TestCompute' } },
      bindings: {
        PUBLIC_ORIGIN: origin,
        GITHUB_CLIENT_ID: 'fixture-client',
        GITHUB_CLIENT_SECRET: 'fixture-secret-not-a-real-credential',
        GOOGLE_CLIENT_ID: 'fixture-google-client',
        GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
      },
      outboundService: async (request) => {
        outboundCalls++;
        if (request.url === `${googleIssuer}/.well-known/openid-configuration`) {
          return Response.json({
            issuer: googleIssuer,
            authorization_endpoint: `${googleIssuer}/o/oauth2/v2/auth`,
            token_endpoint: 'https://oauth2.googleapis.com/token',
            jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
            id_token_signing_alg_values_supported: ['RS256'],
            code_challenge_methods_supported: ['S256'],
          });
        }
        if (request.url === 'https://www.googleapis.com/oauth2/v3/certs') {
          return Response.json({
            keys: [
              {
                ...googleKeys.publicKey.export({ format: 'jwk' }),
                kid: 'test',
                alg: 'RS256',
                use: 'sig',
              },
            ],
          });
        }
        if (request.url === 'https://oauth2.googleapis.com/token') {
          const form = new URLSearchParams(await request.text());
          const flow = googleCodes.get(form.get('code'));
          assert.ok(flow);
          assert.equal(digest(form.get('code_verifier')), flow.challenge);
          assert.equal(form.get('client_id'), 'fixture-google-client');
          assert.equal(form.get('client_secret'), 'fixture-google-secret');
          assert.equal(form.get('redirect_uri'), `${origin}/oauth/google/callback`);
          const now = Math.floor(Date.now() / 1000);
          const input = `${encode({ alg: 'RS256', kid: 'test' })}.${encode({ iss: googleIssuer, sub: flow.user === 'alice' ? '1001' : '1002', aud: 'fixture-google-client', exp: now + 300, iat: now, nonce: flow.nonce })}`;
          return Response.json({
            access_token: 'fixture-google-token',
            token_type: 'Bearer',
            expires_in: 300,
            id_token: `${input}.${sign('RSA-SHA256', Buffer.from(input), googleKeys.privateKey).toString('base64url')}`,
          });
        }
        if (
          [
            'https://client.example/metadata.json',
            'https://client.example/choices.json',
            'https://client.example/signed-only.json',
          ].includes(request.url)
        ) {
          const choice = request.url.endsWith('/choices.json');
          const signedOnly = request.url.endsWith('/signed-only.json');
          return Response.json({
            client_id: request.url,
            client_name: 'Metadata fixture client',
            redirect_uris: ['https://client.example/callback'],
            token_endpoint_auth_method: choice || signedOnly ? 'private_key_jwt' : 'none',
            ...(choice || signedOnly
              ? {
                  token_endpoint_auth_methods_supported: signedOnly
                    ? ['private_key_jwt']
                    : ['none', 'private_key_jwt'],
                  jwks_uri: 'https://client.example/jwks.json',
                }
              : {}),
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
          });
        }
        if (request.url === 'https://github.com/login/oauth/access_token') {
          const form = new URLSearchParams(await request.text());
          assert.equal(form.get('client_id'), 'fixture-client');
          assert.equal(form.get('client_secret'), 'fixture-secret-not-a-real-credential');
          assert.equal(form.get('redirect_uri'), `${origin}/oauth/github/callback`);
          assert.match(form.get('code_verifier'), /^[A-Za-z0-9_-]{43,128}$/);
          return Response.json({
            access_token: `fixture-${form.get('code')}`,
            token_type: 'bearer',
          });
        }
        if (request.url === 'https://api.github.com/user') {
          const token = request.headers.get('authorization');
          assert.match(token, /^Bearer fixture-(alice|bob)$/);
          return Response.json({
            id: token.endsWith('alice') ? 1001 : 1002,
            login: 'not-used-as-identity',
          });
        }
        throw new Error(`Unexpected outbound URL ${new URL(request.url).origin}`);
      },
    }),
  );
  database = await runtime.getD1Database('ACCOUNTS');
  await migrateAccounts(database);
});
after(async () => runtime?.dispose());
// Each scenario owns its connections; prior scenarios must not consume its quota.
beforeEach(async () => {
  await database.prepare('DELETE FROM kiln_connections').run();
});

test('unauthenticated MCP is challenged with canonical resource metadata', async () => {
  const response = await runtime.dispatchFetch(`${origin}/mcp`, { redirect: 'manual' });
  assert.equal(response.status, 401);
  assert.match(
    response.headers.get('www-authenticate'),
    /resource_metadata="https:\/\/kiln\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/,
  );
});

async function register(name = 'Fixture client', server = runtime) {
  const response = await server.dispatchFetch(`${origin}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: name,
      redirect_uris: ['https://client.example/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()).client_id;
}

async function consent({
  clientId,
  scope = 'kiln:use offline_access',
  patch = {},
  server = runtime,
} = {}) {
  clientId ??= await register('Fixture client', server);
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    response_type: 'code',
    resource: `${origin}/mcp`,
    scope,
    state: 'client-state',
    code_challenge: digest(verifier),
    code_challenge_method: 'S256',
    ...patch,
  });
  const response = await server.dispatchFetch(`${origin}/authorize?${params}`, {
    redirect: 'manual',
  });
  const page = await response.text();
  return {
    server,
    response,
    page,
    verifier,
    clientId,
    handle: page.match(/name="handle" value="([^"]+)"/)?.[1],
    cookie: cookies(response),
  };
}

async function approve(start, { cookie = start.cookie, decision = 'github' } = {}) {
  return start.server.dispatchFetch(`${origin}/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin, cookie },
    body: new URLSearchParams({ handle: start.handle, decision }),
  });
}

async function grant(user = 'alice', options = {}) {
  const start = await consent(options);
  assert.equal(start.response.status, 200);
  const provider = options.provider ?? 'github';
  const approved = await approve(start, { decision: provider });
  assert.equal(approved.status, 302);
  const upstream = new URL(approved.headers.get('location'));
  assert.equal(upstream.origin, provider === 'github' ? 'https://github.com' : googleIssuer);
  assert.equal(upstream.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(upstream.searchParams.get('scope'), provider === 'github' ? '' : 'openid profile');
  const code = provider === 'github' ? user : randomBytes(24).toString('base64url');
  if (provider === 'google')
    googleCodes.set(code, {
      user,
      nonce: upstream.searchParams.get('nonce'),
      challenge: upstream.searchParams.get('code_challenge'),
    });
  const callback = `${origin}/oauth/${provider}/callback?${new URLSearchParams({ state: upstream.searchParams.get('state'), code })}`;
  const response = await start.server.dispatchFetch(callback, {
    headers: { cookie: cookies(approved) },
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  const redirect = new URL(response.headers.get('location'));
  assert.equal(redirect.origin, 'https://client.example');
  assert.equal(redirect.searchParams.get('state'), 'client-state');
  assert.equal(redirect.searchParams.get('iss'), origin);
  return {
    ...start,
    code: redirect.searchParams.get('code'),
    callback,
    upstreamCookie: cookies(approved),
    browserCookie: cookies(response),
    callbackHeaders: response.headers,
  };
}

async function exchange(authorization, patch = {}) {
  return authorization.server.dispatchFetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorization.code,
      client_id: authorization.clientId,
      redirect_uri: 'https://client.example/callback',
      code_verifier: authorization.verifier,
      resource: `${origin}/mcp`,
      ...patch,
    }),
  });
}

async function token(user, options) {
  const authorization = await grant(user, options);
  const response = await exchange(authorization);
  assert.equal(response.status, 200);
  return { ...(await response.json()), clientId: authorization.clientId };
}

async function mcp(credential, options = {}) {
  return runtime.dispatchFetch(`${origin}/mcp`, {
    method: 'POST',
    ...options,
    headers: {
      authorization: `Bearer ${credential.access_token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
    body:
      options.body ??
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'kiln_validate', arguments: { code: 'function build(){}' } },
      }),
  });
}

test('browser account sign-in establishes a private session for either verified provider', async () => {
  for (const provider of ['google', 'github']) {
    const authorization = await grant('alice', { provider });
    assert.match(authorization.browserCookie, /__Host-kiln-session=[a-f0-9]{64}/);
    const page = await runtime.dispatchFetch(`${origin}/account`, {
      headers: { cookie: authorization.browserCookie },
    });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const html = await page.text();
    assert.match(html, /Your Kiln account/);
    assert.match(html, provider === 'google' ? /Google/ : /GitHub/);
    assert.match(html, /name="csrf" value="[a-f0-9]{64}"/);
    assert.ok(!html.includes(authorization.browserCookie));
    assert.ok(!html.includes('fixture-secret'));
    const sessionCookie = authorization.callbackHeaders
      .getSetCookie()
      .find((value) => value.startsWith('__Host-kiln-session='));
    for (const attribute of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/'])
      assert.ok(sessionCookie.includes(attribute));
  }
});

test('browser account logout is CSRF protected and leaves MCP connections authorized', async () => {
  const authorization = await grant();
  const credential = await (await exchange(authorization)).json();
  const headers = { cookie: authorization.browserCookie };
  const page = await (await runtime.dispatchFetch(`${origin}/account`, { headers })).text();
  const csrf = page.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  const post = (body, extra = {}) =>
    runtime.dispatchFetch(`${origin}/account/logout`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        ...headers,
        origin,
        'content-type': 'application/x-www-form-urlencoded',
        ...extra,
      },
      body,
    });
  assert.equal((await runtime.dispatchFetch(`${origin}/account/logout`, { headers })).status, 405);
  for (const body of ['', `csrf=${'0'.repeat(64)}`, `csrf=${csrf}&csrf=${csrf}`])
    assert.equal((await post(body)).status, 403);
  for (const badOrigin of ['', 'https://evil.example', 'https://sibling.kiln.example.com'])
    assert.equal((await post(`csrf=${csrf}`, { origin: badOrigin })).status, 403);
  assert.equal(
    (await post(JSON.stringify({ csrf }), { 'content-type': 'application/json' })).status,
    415,
  );
  assert.equal((await runtime.dispatchFetch(`${origin}/account`, { headers })).status, 200);
  const loggedOut = await post(`csrf=${csrf}`);
  assert.equal(loggedOut.status, 303);
  assert.equal(loggedOut.headers.get('location'), '/account');
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await runtime.dispatchFetch(`${origin}/account`, { headers })).status, 401);
  assert.equal((await mcp(credential)).status, 200);
});

test('browser account sessions cannot substitute for MCP tokens or another browser CSRF', async () => {
  const alice = await grant('alice');
  const bob = await grant('bob');
  const alicePage = await (
    await runtime.dispatchFetch(`${origin}/account`, {
      headers: { cookie: alice.browserCookie },
    })
  ).text();
  const csrf = alicePage.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  assert.equal(
    (
      await runtime.dispatchFetch(`${origin}/account/logout`, {
        method: 'POST',
        headers: {
          cookie: bob.browserCookie,
          origin,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: `csrf=${csrf}`,
        redirect: 'manual',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await runtime.dispatchFetch(`${origin}/mcp`, {
        method: 'POST',
        headers: { cookie: alice.browserCookie },
        body: '{}',
      })
    ).status,
    401,
  );
  const credential = await (await exchange(alice)).json();
  assert.equal(
    (
      await runtime.dispatchFetch(`${origin}/account`, {
        headers: { authorization: `Bearer ${credential.access_token}` },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await runtime.dispatchFetch(
        `${origin}/account?cookie=${encodeURIComponent(alice.browserCookie)}`,
      )
    ).status,
    400,
  );
});

async function browserLogin(provider = 'github', user = 'alice', server = runtime, cookie = '') {
  const start = await server.dispatchFetch(`${origin}/account/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin, cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ provider }),
  });
  assert.equal(start.status, 302);
  const upstream = new URL(start.headers.get('location'));
  assert.equal(upstream.origin, provider === 'github' ? 'https://github.com' : googleIssuer);
  assert.equal(upstream.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(upstream.searchParams.get('scope'), provider === 'github' ? '' : 'openid profile');
  const code = provider === 'github' ? user : randomBytes(24).toString('base64url');
  if (provider === 'google')
    googleCodes.set(code, {
      user,
      nonce: upstream.searchParams.get('nonce'),
      challenge: upstream.searchParams.get('code_challenge'),
    });
  return {
    start,
    callback: `${origin}/oauth/${provider}/callback?${new URLSearchParams({ state: upstream.searchParams.get('state'), code })}`,
    cookie: cookies(start),
  };
}

test('direct browser login uses either provider, no MCP client and no upstream token in cookies', async () => {
  const signedOut = await runtime.dispatchFetch(`${origin}/account`);
  assert.equal(signedOut.status, 401);
  const html = await signedOut.text();
  assert.match(html, /action="\/account\/login"/);
  for (const provider of ['google', 'github']) {
    const flow = await browserLogin(provider);
    assert.match(flow.cookie, /__Host-kiln-login=[a-f0-9]{64}/);
    const callback = await runtime.dispatchFetch(flow.callback, {
      headers: { cookie: flow.cookie },
      redirect: 'manual',
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/account');
    assert.match(callback.headers.get('set-cookie'), /__Host-kiln-session=[a-f0-9]{64}/);
    assert.ok(!callback.headers.get('set-cookie').includes('fixture-'));
    assert.ok(
      callback.headers
        .getSetCookie()
        .some((value) => value.startsWith('__Host-kiln-login=;') && value.includes('Max-Age=0')),
    );
    assert.equal(
      (await runtime.dispatchFetch(`${origin}/account`, { headers: { cookie: cookies(callback) } }))
        .status,
      200,
    );
  }
});

test('direct browser login requires its browser, exact provider and one-time state before contacting a provider', async () => {
  const flow = await browserLogin();
  const count = outboundCalls;
  for (const [url, cookie] of [
    [flow.callback, ''],
    [flow.callback, `${flow.cookie}; ${flow.cookie}`],
    [flow.callback.replace('/github/', '/google/'), flow.cookie],
    [`${flow.callback}&state=kb1_invalid`, flow.cookie],
    [flow.callback.replace(/state=[^&]+/, `state=kb1_${'0'.repeat(64)}`), flow.cookie],
  ]) {
    const denied = await runtime.dispatchFetch(url, { headers: { cookie }, redirect: 'manual' });
    assert.equal(denied.status, 400);
    assert.ok(!denied.headers.get('set-cookie')?.includes('__Host-kiln-session='));
  }
  assert.equal(outboundCalls, count);
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      runtime.dispatchFetch(flow.callback, {
        headers: { cookie: flow.cookie },
        redirect: 'manual',
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [303, 400, 400, 400, 400]);
  assert.equal(outboundCalls - count, 2);
});

test('direct browser login rejects forged forms and arbitrary return URLs before outbound calls', async () => {
  const count = outboundCalls;
  const post = (body, extra = {}, method = 'POST') =>
    runtime.dispatchFetch(`${origin}/account/login`, {
      method,
      redirect: 'manual',
      headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...extra },
      ...(method === 'POST' ? { body } : {}),
    });
  assert.equal((await post('', {}, 'GET')).status, 405);
  assert.equal((await post('provider=github', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('provider=github', { origin: '' })).status, 403);
  for (const body of [
    'provider=unknown',
    'provider=github&provider=google',
    'provider=github&returnTo=https://evil.example',
    '',
  ])
    assert.equal((await post(body)).status, 400);
  assert.equal((await post('{}', { 'content-type': 'application/json' })).status, 415);
  assert.equal(outboundCalls, count);
});

test('direct browser login cancellation consumes its state and returns a safe retry page', async () => {
  const flow = await browserLogin();
  const cancellation = new URL(flow.callback);
  cancellation.searchParams.delete('code');
  cancellation.searchParams.set('error', 'access_denied');
  cancellation.searchParams.set('error_description', '<script>provider-detail</script>');
  const count = outboundCalls;
  const response = await runtime.dispatchFetch(cancellation, {
    headers: { cookie: flow.cookie },
    redirect: 'manual',
  });
  assert.equal(response.status, 400);
  assert.ok(!(await response.text()).includes('provider-detail'));
  assert.equal(
    (
      await runtime.dispatchFetch(flow.callback, {
        headers: { cookie: flow.cookie },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(outboundCalls, count);
});

test('direct browser login stores hashed state and binding and rejects expiry without provider calls', async () => {
  const flow = await browserLogin();
  const rows = await database.prepare('SELECT * FROM kiln_browser_logins').all();
  const serialized = JSON.stringify(rows.results);
  assert.ok(!serialized.includes(new URL(flow.callback).searchParams.get('state')));
  assert.ok(!serialized.includes(flow.cookie.split('=')[1]));
  await database.prepare('UPDATE kiln_browser_logins SET expires_at=0').run();
  const count = outboundCalls;
  assert.equal(
    (
      await runtime.dispatchFetch(flow.callback, {
        headers: { cookie: flow.cookie },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(outboundCalls, count);
});

test('restarting direct browser login retires the old intent and database failure rolls back that retirement', async () => {
  const first = await browserLogin();
  const second = await browserLogin('github', 'alice', runtime, first.cookie);
  const count = outboundCalls;
  assert.equal(
    (
      await runtime.dispatchFetch(first.callback, {
        headers: { cookie: first.cookie },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(outboundCalls, count);
  await database
    .prepare(`CREATE TRIGGER reject_browser_login BEFORE INSERT ON kiln_browser_logins
    BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END`)
    .run();
  try {
    const rejected = await runtime.dispatchFetch(`${origin}/account/login`, {
      method: 'POST',
      headers: {
        origin,
        cookie: second.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'provider=github',
      redirect: 'manual',
    });
    assert.equal(rejected.status, 503);
    assert.equal(rejected.headers.get('set-cookie'), null);
    assert.equal(await rejected.text(), 'Service temporarily unavailable');
  } finally {
    await database.prepare('DROP TRIGGER reject_browser_login').run();
  }
  assert.equal(
    (
      await runtime.dispatchFetch(second.callback, {
        headers: { cookie: second.cookie },
        redirect: 'manual',
      })
    ).status,
    303,
  );
});

test('direct browser login has a bounded global intent table and cleans expired reservations', async () => {
  await database
    .prepare(`WITH RECURSIVE numbers(n) AS (
    SELECT 1 UNION ALL SELECT n+1 FROM numbers WHERE n<4096)
    INSERT INTO kiln_browser_logins(state_hash,binding_hash,provider,verifier,nonce,expires_at)
    SELECT 'fixture-cap-'||n,'fixture-cap-'||n,'github','fixture','fixture',? FROM numbers
    LIMIT MAX(0, 4096-(SELECT COUNT(*) FROM kiln_browser_logins))`)
    .bind(Date.now() + 600_000)
    .run();
  try {
    const count = outboundCalls;
    const replies = await Promise.all(
      Array.from({ length: 3 }, () =>
        runtime.dispatchFetch(`${origin}/account/login`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
          body: 'provider=github',
          redirect: 'manual',
        }),
      ),
    );
    assert.deepEqual(
      replies.map((r) => r.status),
      [429, 429, 429],
    );
    assert.equal(
      (await database.prepare('SELECT COUNT(*) AS n FROM kiln_browser_logins').first()).n,
      4096,
    );
    assert.equal(outboundCalls, count);
    await database
      .prepare("UPDATE kiln_browser_logins SET expires_at=0 WHERE state_hash LIKE 'fixture-cap-%'")
      .run();
    await browserLogin();
    assert.ok(
      (await database.prepare('SELECT COUNT(*) AS n FROM kiln_browser_logins').first()).n < 4096,
    );
  } finally {
    await database
      .prepare("DELETE FROM kiln_browser_logins WHERE state_hash LIKE 'fixture-cap-%'")
      .run();
  }
});

test('metadata advertises the configured audience, scopes, issuer and S256', async () => {
  const resource = await (
    await runtime.dispatchFetch(`${origin}/.well-known/oauth-protected-resource/mcp`)
  ).json();
  assert.equal(resource.resource, `${origin}/mcp`);
  assert.deepEqual(resource.authorization_servers, [origin]);
  assert.deepEqual(resource.scopes_supported, ['kiln:use']);
  const auth = await (
    await runtime.dispatchFetch(`${origin}/.well-known/oauth-authorization-server`)
  ).json();
  assert.equal(auth.issuer, origin);
  assert.ok(auth.code_challenge_methods_supported.includes('S256'));
});

test('MCP authorization creates a durable connection and activates it only on code exchange', async () => {
  const authorization = await grant();
  const pending = await database
    .prepare('SELECT * FROM kiln_connections WHERE client_id=?')
    .bind(authorization.clientId)
    .first();
  assert.ok(pending);
  assert.match(pending.id, /^kc_[a-f0-9]{32}$/);
  assert.equal(pending.state, 'pending');
  assert.equal(pending.grant_id, null);
  const credential = await (await exchange(authorization)).json();
  const active = await database
    .prepare('SELECT * FROM kiln_connections WHERE id=?')
    .bind(pending.id)
    .first();
  assert.equal(active.state, 'active');
  assert.ok(active.grant_id);
  assert.ok(!JSON.stringify(active).includes(credential.access_token));
  assert.ok(!JSON.stringify(active).includes(credential.refresh_token));
  assert.equal((await mcp(credential)).status, 200);
});

test('edge discovery requires a scoped active connection and rejects revoked cached credentials', async () => {
  const credential = await token('alice');
  const noScope = await token('alice', { scope: 'offline_access' });
  for (const [method, params] of [
    ['tools/list', {}],
    ['tools/call', { name: 'kiln_discover', arguments: { query: 'wheel' } }],
  ]) {
    const options = {
      headers: { accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    };
    assert.equal((await mcp({ access_token: 'invalid' }, options)).status, 401);
    assert.equal((await mcp(noScope, options)).status, 403);
    const response = await mcp(credential, options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(
      (await response.text()).includes(method === 'tools/list' ? '"tools":' : '"content":'),
    );
  }
  await database
    .prepare("UPDATE kiln_connections SET state='revoked' WHERE client_id=?")
    .bind(credential.clientId)
    .run();
  assert.equal(
    (
      await mcp(credential, {
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    ).status,
    401,
  );
});

test('primary connection revocation denies cached access and refresh while preserving another connection', async () => {
  const first = await token('alice');
  const second = await token('alice');
  const own = await database
    .prepare('SELECT id FROM kiln_connections WHERE client_id=?')
    .bind(first.clientId)
    .first();
  assert.ok(own);
  // Leave every provider KV record intact: this models a remote cache seeing stale data.
  await database
    .prepare("UPDATE kiln_connections SET state='revoked' WHERE id=?")
    .bind(own.id)
    .run();
  assert.equal((await mcp(first)).status, 401);
  assert.equal((await mcp(second)).status, 200);
  const refresh = await runtime.dispatchFetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: first.refresh_token,
      client_id: first.clientId,
      resource: `${origin}/mcp`,
    }),
  });
  assert.equal(refresh.status, 400);
  assert.equal((await refresh.json()).error, 'invalid_grant');
});

test('stale provider KV cannot exchange an already consumed authorization code again', async () => {
  const authorization = await grant();
  const kv = await runtime.getKVNamespace('OAUTH_KV');
  const saved = await Promise.all(
    (await kv.list({ prefix: 'grant:' })).keys.map(async ({ name }) => [name, await kv.get(name)]),
  );
  assert.equal((await exchange(authorization)).status, 200);
  for (const [name, value] of saved) await kv.put(name, value);
  const again = await exchange(authorization);
  assert.equal(again.status, 400);
  assert.equal((await again.json()).error, 'invalid_grant');
});

async function connectionFor(authorization) {
  return database
    .prepare('SELECT * FROM kiln_connections WHERE client_id=?')
    .bind(authorization.clientId)
    .first();
}

async function startDisconnect(authorization, connectionId, provider = 'github', extra = {}) {
  const page = await (
    await runtime.dispatchFetch(`${origin}/account`, {
      headers: { cookie: authorization.browserCookie },
    })
  ).text();
  const csrf = page.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(csrf);
  return runtime.dispatchFetch(`${origin}/account/action`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin,
      cookie: authorization.browserCookie,
      'content-type': 'application/x-www-form-urlencoded',
      ...extra.headers,
    },
    body: new URLSearchParams({
      csrf,
      action: 'disconnect',
      connectionId,
      provider,
      ...extra.form,
    }),
  });
}

async function actionCallback(start, authorization, user = 'alice') {
  assert.equal(start.status, 302);
  const upstream = new URL(start.headers.get('location'));
  assert.equal(upstream.searchParams.get('prompt'), 'select_account');
  const provider = upstream.origin === googleIssuer ? 'google' : 'github';
  const code = provider === 'github' ? user : randomBytes(24).toString('base64url');
  if (provider === 'google')
    googleCodes.set(code, {
      user,
      nonce: upstream.searchParams.get('nonce'),
      challenge: upstream.searchParams.get('code_challenge'),
    });
  return {
    callback: `${origin}/oauth/${provider}/callback?${new URLSearchParams({ state: upstream.searchParams.get('state'), code })}`,
    cookie: `${authorization.browserCookie}; ${cookies(start)}`,
  };
}

test('disconnect requires fresh verification of an existing provider and preserves other connections', async () => {
  for (const provider of ['github', 'google']) {
    const second = await token('alice', { provider });
    const authorization = await grant('alice', { provider });
    const credential = await (await exchange(authorization)).json();
    const connection = await connectionFor(authorization);
    const page = await (
      await runtime.dispatchFetch(`${origin}/account`, {
        headers: { cookie: authorization.browserCookie },
      })
    ).text();
    assert.match(page, /Connected apps/);
    assert.ok(page.includes(connection.id));
    const start = await startDisconnect(authorization, connection.id, provider);
    const flow = await actionCallback(start, authorization);
    // Initiating confirmation alone must not revoke the connection.
    assert.equal((await mcp(credential)).status, 200);
    const response = await runtime.dispatchFetch(flow.callback, {
      headers: { cookie: flow.cookie },
      redirect: 'manual',
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/account');
    assert.match(response.headers.get('set-cookie'), /__Host-kiln-session=/);
    assert.equal((await mcp(credential)).status, 401);
    assert.equal((await mcp(second)).status, 200);
    assert.equal(
      (
        await runtime.dispatchFetch(`${origin}/account`, {
          headers: { cookie: authorization.browserCookie },
        })
      ).status,
      401,
    );
    assert.equal(
      (await runtime.dispatchFetch(`${origin}/account`, { headers: { cookie: cookies(response) } }))
        .status,
      200,
    );
    assert.equal(
      (
        await runtime.dispatchFetch(flow.callback, {
          headers: { cookie: flow.cookie },
          redirect: 'manual',
        })
      ).status,
      400,
    );
  }
});

test('disconnect refuses another account, unlinked provider, forged CSRF and cross-origin actions', async () => {
  const bob = await grant('bob');
  await exchange(bob);
  const alice = await grant('alice');
  const credential = await (await exchange(alice)).json();
  const aliceConnection = await connectionFor(alice);
  const bobConnection = await connectionFor(bob);
  const count = outboundCalls;
  for (const [id, provider, extra] of [
    [bobConnection.id, 'github', {}],
    [aliceConnection.id, 'google', {}],
    [aliceConnection.id, 'github', { form: { csrf: '0'.repeat(64) } }],
    [aliceConnection.id, 'github', { headers: { origin: 'https://evil.example' } }],
    [aliceConnection.id, 'github', { form: { accountId: bobConnection.account_id } }],
  ])
    assert.equal((await startDisconnect(alice, id, provider, extra)).status, 403);
  assert.equal(outboundCalls, count);
  assert.equal((await mcp(credential)).status, 200);
});

test('disconnect rejects a different provider identity and a copied action without its session', async () => {
  const authorization = await grant();
  const credential = await (await exchange(authorization)).json();
  const connection = await connectionFor(authorization);
  const start = await startDisconnect(authorization, connection.id);
  const wrong = await actionCallback(start, authorization, 'bob');
  assert.equal(
    (
      await runtime.dispatchFetch(wrong.callback, {
        headers: { cookie: cookies(start) },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await runtime.dispatchFetch(wrong.callback, {
        headers: { cookie: wrong.cookie },
        redirect: 'manual',
      })
    ).status,
    403,
  );
  assert.equal((await mcp(credential)).status, 200);
});

test('disconnect cancellation and expiry cannot revoke access or replay provider confirmation', async () => {
  const authorization = await grant();
  const credential = await (await exchange(authorization)).json();
  const connection = await connectionFor(authorization);
  const start = await startDisconnect(authorization, connection.id);
  const flow = await actionCallback(start, authorization);
  const cancelled = new URL(flow.callback);
  cancelled.searchParams.delete('code');
  cancelled.searchParams.set('error', 'access_denied');
  const beforeCalls = outboundCalls;
  const options = { headers: { cookie: flow.cookie }, redirect: 'manual' };
  assert.equal((await runtime.dispatchFetch(cancelled.href, options)).status, 400);
  assert.equal((await runtime.dispatchFetch(flow.callback, options)).status, 400);
  assert.equal(outboundCalls, beforeCalls);
  assert.equal((await mcp(credential)).status, 200);
  const next = await actionCallback(
    await startDisconnect(authorization, connection.id),
    authorization,
  );
  await database.prepare('UPDATE kiln_account_actions SET expires_at=0').run();
  assert.equal(
    (
      await runtime.dispatchFetch(next.callback, {
        headers: { cookie: next.cookie },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(outboundCalls, beforeCalls);
  assert.equal((await mcp(credential)).status, 200);
});

test('concurrent disconnect callbacks consume one confirmation and perform one provider exchange', async () => {
  const authorization = await grant();
  const credential = await (await exchange(authorization)).json();
  const connection = await connectionFor(authorization);
  const flow = await actionCallback(
    await startDisconnect(authorization, connection.id),
    authorization,
  );
  const beforeCalls = outboundCalls;
  const results = await Promise.all(
    [0, 1].map(() =>
      runtime.dispatchFetch(flow.callback, {
        headers: { cookie: flow.cookie },
        redirect: 'manual',
      }),
    ),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [303, 400]);
  assert.equal(outboundCalls - beforeCalls, 2); // One token exchange and one GitHub identity read.
  assert.equal((await mcp(credential)).status, 401);
});

test('a revoked browser session cannot finish its pending disconnect', async () => {
  const authorization = await grant();
  const credential = await (await exchange(authorization)).json();
  const connection = await connectionFor(authorization);
  const flow = await actionCallback(
    await startDisconnect(authorization, connection.id),
    authorization,
  );
  await database
    .prepare('DELETE FROM kiln_browser_sessions WHERE account_id=?')
    .bind(connection.account_id)
    .run();
  const beforeCalls = outboundCalls;
  assert.equal(
    (
      await runtime.dispatchFetch(flow.callback, {
        headers: { cookie: flow.cookie },
        redirect: 'manual',
      })
    ).status,
    400,
  );
  assert.equal(outboundCalls, beforeCalls);
  assert.equal((await mcp(credential)).status, 200);
});

test('connected app display escapes registered names and oversized action forms never contact a provider', async () => {
  const clientId = await register('<img src=x onerror="alert(1)">');
  const authorization = await grant('alice', { clientId });
  const credential = await (await exchange(authorization)).json();
  const page = await runtime.dispatchFetch(`${origin}/account`, {
    headers: { cookie: authorization.browserCookie },
  });
  const html = await page.text();
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&#60;img src=x'));
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  const beforeCalls = outboundCalls;
  const rejected = await runtime.dispatchFetch(`${origin}/account/action`, {
    method: 'POST',
    headers: {
      origin,
      cookie: authorization.browserCookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: `csrf=${'a'.repeat(4096)}`,
  });
  assert.equal(rejected.status, 413);
  assert.equal(outboundCalls, beforeCalls);
  assert.equal((await mcp(credential)).status, 200);
});

test('consent escapes client content and binds approval to its browser', async () => {
  const start = await consent({ clientId: await register('<script>bad()</script>') });
  assert.equal(start.response.status, 200);
  assert.ok(!start.page.includes('<script>bad()'));
  assert.match(start.page, /client\.example/);
  assert.match(start.response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(start.response.headers.get('set-cookie'), /HttpOnly/);
  const count = outboundCalls;
  assert.equal((await approve(start, { cookie: '' })).status, 400);
  assert.equal(outboundCalls, count);
});

test('cross-origin consent and a stolen upstream callback cannot reach GitHub', async () => {
  const start = await consent();
  const forged = await runtime.dispatchFetch(`${origin}/authorize`, {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
      cookie: start.cookie,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ handle: start.handle, decision: 'approve' }),
    redirect: 'manual',
  });
  assert.equal(forged.status, 403);
  const approved = await approve(start);
  const state = new URL(approved.headers.get('location')).searchParams.get('state');
  const count = outboundCalls;
  const callback = await runtime.dispatchFetch(
    `${origin}/oauth/github/callback?${new URLSearchParams({ state, code: 'alice' })}`,
    { redirect: 'manual' },
  );
  assert.equal(callback.status, 400);
  assert.equal(outboundCalls, count);
});

test('denial returns validated state and issuer without a GitHub redirect', async () => {
  const start = await consent();
  const denied = await approve(start, { decision: 'deny' });
  assert.equal(denied.status, 302);
  const target = new URL(denied.headers.get('location'));
  assert.equal(target.origin, 'https://client.example');
  assert.equal(target.searchParams.get('error'), 'access_denied');
  assert.equal(target.searchParams.get('state'), 'client-state');
  assert.equal(target.searchParams.get('iss'), origin);
});

test('authorization rejects unknown scopes, missing audience and missing S256', async () => {
  for (const patch of [{ scope: 'admin' }, { resource: '' }, { code_challenge_method: 'plain' }]) {
    const result = await consent({ patch });
    assert.equal(result.response.status, 400);
    assert.equal(result.handle, undefined);
  }
});

test('authorization codes and upstream browser state cannot be replayed or retargeted', async () => {
  const authorization = await grant();
  assert.equal(
    (await exchange(authorization, { resource: 'https://other.example/mcp' })).status,
    400,
  );
  assert.equal((await exchange(authorization)).status, 200);
  assert.equal((await exchange(authorization)).status, 400);
  const replay = await runtime.dispatchFetch(authorization.callback, {
    headers: { cookie: authorization.upstreamCookie },
    redirect: 'manual',
  });
  assert.equal(replay.status, 400);
});

test('wrong PKCE verifier cannot exchange a valid authorization code', async () => {
  const authorization = await grant();
  const response = await exchange(authorization, {
    code_verifier: randomBytes(32).toString('base64url'),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).access_token, undefined);
});

test('same user reconnects to one tenant; another user and forged headers cannot select it', async () => {
  const alice = await token('alice');
  const aliceAgain = await token('alice');
  const bob = await token('bob');
  const first = await (await mcp(alice)).json();
  const reconnected = await (await mcp(aliceAgain)).json();
  const other = await (
    await mcp(bob, {
      headers: {
        'x-kiln-tenant': first.tenant,
        'x-user-id': 'github:1001',
        cookie: 'session=forged',
        'cf-access-jwt-assertion': 'forged',
        'mcp-session-id': 'session-alice',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'kiln_validate',
      },
    })
  ).json();
  assert.equal(first.tenant, reconnected.tenant);
  assert.notEqual(first.tenant, other.tenant);
  for (const header of [
    'authorization',
    'cookie',
    'x-kiln-tenant',
    'x-user-id',
    'cf-access-jwt-assertion',
  ]) {
    assert.equal(other.headers[header], undefined);
  }
  assert.equal(other.headers['mcp-protocol-version'], '2026-07-28');
  assert.equal(other.headers['mcp-method'], 'tools/call');
  assert.equal(other.headers['mcp-name'], 'kiln_validate');
  assert.equal(other.headers['mcp-session-id'], 'session-alice'); // Session IDs never route a tenant.
});

test('both sign-in choices resolve permanent Kiln accounts, with no cross-provider auto-link', async () => {
  const page = (await consent()).page;
  assert.match(page, /Continue with Google/);
  assert.match(page, /Continue with GitHub/);
  const first = await token('alice', { provider: 'google' });
  const again = await token('alice', { provider: 'google' });
  const github = await token('alice');
  const googleTenant = (await (await mcp(first)).json()).tenant;
  assert.equal((await (await mcp(again)).json()).tenant, googleTenant);
  assert.notEqual((await (await mcp(github)).json()).tenant, googleTenant);
  const rows = await database
    .prepare('SELECT issuer, account_id FROM kiln_identities WHERE subject=?')
    .bind('1001')
    .all();
  assert.equal(rows.results.length, 2);
  for (const row of rows.results) assert.match(row.account_id, /^ka_[a-f0-9]{32}$/);
});

const refreshToken = (credential) =>
  runtime.dispatchFetch(`${origin}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credential.refresh_token,
      client_id: credential.clientId,
      resource: `${origin}/mcp`,
    }),
  });

test('current account state and epoch gate tools, downloads, code exchange and refresh', async () => {
  for (const mutation of ['disable', 'delete', 'epoch']) {
    const credential = await token('bob');
    const pendingCode = await grant('bob');
    const identity = await database
      .prepare('SELECT account_id FROM kiln_identities WHERE issuer=? AND subject=?')
      .bind('https://github.com', '1002')
      .first();
    const state =
      mutation === 'disable' ? 'disabled' : mutation === 'delete' ? 'deleting' : 'active';
    await database
      .prepare(
        'UPDATE kiln_accounts SET state=?, authorization_epoch=authorization_epoch+? WHERE id=?',
      )
      .bind(state, mutation === 'epoch' ? 1 : 0, identity.account_id)
      .run();
    assert.equal((await mcp(credential)).status, 401);
    assert.equal(
      (
        await runtime.dispatchFetch(`${origin}/mcp/artifacts/${'a'.repeat(32)}`, {
          headers: { authorization: `Bearer ${credential.access_token}` },
        })
      ).status,
      401,
    );
    assert.equal((await exchange(pendingCode)).status, 400);
    const refused = await refreshToken(credential);
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).error, 'invalid_grant');
    await database
      .prepare(
        'UPDATE kiln_accounts SET state=?, authorization_epoch=authorization_epoch+1 WHERE id=?',
      )
      .bind('active', identity.account_id)
      .run();
    // Re-enabling never revives old credentials; an explicit new login is required.
    assert.equal((await mcp(credential)).status, 401);
    assert.equal((await mcp(await token('bob'))).status, 200);
  }
});

test('an unavailable account authority fails closed for access and refresh', async () => {
  const credential = await token('alice');
  await database.prepare('ALTER TABLE kiln_accounts RENAME TO fixture_unavailable_accounts').run();
  try {
    const access = await mcp(credential);
    assert.equal(access.status, 503);
    assert.ok(!(await access.text()).includes('kiln_accounts'));
    assert.equal((await refreshToken(credential)).status, 503);
  } finally {
    await database
      .prepare('ALTER TABLE fixture_unavailable_accounts RENAME TO kiln_accounts')
      .run();
  }
  assert.equal((await mcp(credential)).status, 200);
});

test('a provider callback cannot be swapped onto the other provider route', async () => {
  for (const provider of ['github', 'google']) {
    const start = await consent();
    const approved = await approve(start, { decision: provider });
    assert.equal(approved.status, 302);
    const state = new URL(approved.headers.get('location')).searchParams.get('state');
    const count = outboundCalls;
    const other = provider === 'google' ? 'github' : 'google';
    const response = await runtime.dispatchFetch(
      `${origin}/oauth/${other}/callback?${new URLSearchParams({ state, code: 'alice' })}`,
      { headers: { cookie: cookies(approved) }, redirect: 'manual' },
    );
    assert.equal(response.status, 400);
    assert.equal(outboundCalls, count);
  }
});

test('stale upstream KV cannot replay consent or a completed sign-in', async () => {
  const kv = await runtime.getKVNamespace('OAUTH_KV');
  const snapshot = async () => {
    const { keys } = await kv.list();
    return Promise.all(keys.map(async ({ name }) => [name, await kv.get(name)]));
  };
  const restore = async (records) => {
    for (const [name, value] of records) if (value !== null) await kv.put(name, value);
  };
  const start = await consent();
  const beforeConsent = await snapshot();
  const approved = await approve(start);
  assert.equal(approved.status, 302);
  await restore(beforeConsent);
  const count = outboundCalls;
  assert.equal((await approve(start)).status, 400);
  assert.equal(outboundCalls, count);
  const beforeCallback = await snapshot();
  const state = new URL(approved.headers.get('location')).searchParams.get('state');
  const callback = () =>
    runtime.dispatchFetch(
      `${origin}/oauth/github/callback?${new URLSearchParams({ state, code: 'alice' })}`,
      { headers: { cookie: cookies(approved) }, redirect: 'manual' },
    );
  assert.equal((await callback()).status, 302);
  await restore(beforeCallback);
  const afterFirst = outboundCalls;
  assert.equal((await callback()).status, 400);
  assert.equal(outboundCalls, afterFirst);
});

test('MCP refuses a foreign browser Origin even with a valid token', async () => {
  const credential = await token('alice');
  assert.equal(
    (await mcp(credential, { headers: { origin: 'https://foreign.example' } })).status,
    403,
  );
  assert.equal((await mcp(credential, { headers: { origin } })).status, 200);
  assert.equal((await mcp(credential, { headers: { 'mcp-name': 'x'.repeat(4097) } })).status, 431);
});

test('a token without the tool scope cannot reach a tenant', async () => {
  const credential = await token('alice', { scope: 'offline_access' });
  const response = await mcp(credential);
  assert.equal(response.status, 403);
  assert.match(response.headers.get('www-authenticate'), /insufficient_scope/);
});

test('a client metadata document can authorize without dynamic registration', async () => {
  const clientId = 'https://client.example/metadata.json';
  const start = await consent({ clientId });
  assert.equal(start.response.status, 200);
  assert.match(start.page, /Client domain: <strong>client\.example<\/strong>/);
  const credential = await token('alice', { clientId });
  assert.equal((await mcp(credential)).status, 200);
});

test('CIMD negotiates the supported public method from current OpenAI-style choices and still requires PKCE', async () => {
  // Public metadata observed 2026-10-06: a plural offer plus a legacy signed-method
  // preference. Fixed local metadata proves negotiation, not a live OpenAI login.
  const clientId = 'https://client.example/choices.json';
  const credential = await token('alice', { clientId });
  assert.equal((await mcp(credential)).status, 200);
  const authorization = await grant('alice', { clientId });
  const missingVerifier = await exchange(authorization, { code_verifier: '' });
  assert.equal(missingVerifier.status, 400);
  assert.equal((await missingVerifier.json()).access_token, undefined);
});

test('CIMD cannot silently downgrade a client that requires signed assertions only', async () => {
  const start = await consent({ clientId: 'https://client.example/signed-only.json' });
  assert.ok([400, 503].includes(start.response.status));
  assert.equal(start.response.headers.get('location'), null);
  assert.ok(!start.page.includes('Continue with GitHub'));
});

test('refresh stays bound to its resource and revocation denies subsequent requests', async () => {
  const credential = await token('alice');
  const refresh = (resource) =>
    runtime.dispatchFetch(`${origin}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credential.refresh_token,
        client_id: credential.clientId,
        resource,
      }),
    });
  assert.equal((await refresh('https://other.example/mcp')).status, 400);
  const renewed = await refresh(`${origin}/mcp`);
  assert.equal(renewed.status, 200);
  const refreshed = await renewed.json();
  assert.equal((await mcp(refreshed)).status, 200);
  const metadata = await (
    await runtime.dispatchFetch(`${origin}/.well-known/oauth-authorization-server`)
  ).json();
  const revoke = await runtime.dispatchFetch(metadata.revocation_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: refreshed.access_token,
      token_type_hint: 'access_token',
      client_id: credential.clientId,
    }),
  });
  assert.equal(revoke.status, 200);
  assert.equal((await mcp(refreshed)).status, 401);
});

test('gateway rejects wrong origins, credential queries, unsupported paths and oversized bodies', async () => {
  assert.equal((await runtime.dispatchFetch('https://evil.example/mcp')).status, 421);
  assert.equal((await runtime.dispatchFetch(`${origin}/mcp?access_token=forged`)).status, 400);
  const credential = await token('alice');
  assert.equal((await mcp(credential, { body: 'a'.repeat(1024 * 1024 + 1) })).status, 413);
  assert.equal(
    (
      await runtime.dispatchFetch(`${origin}/mcp/unknown`, {
        headers: { authorization: `Bearer ${credential.access_token}` },
      })
    ).status,
    404,
  );
});

test('upstream tokens and MCP bearer values are absent from persisted OAuth records', async () => {
  const credential = await token('alice');
  const kv = await runtime.getKVNamespace('OAUTH_KV');
  const { keys } = await kv.list();
  for (const { name } of keys) {
    const record = await kv.get(name);
    for (const secret of [
      credential.access_token,
      credential.refresh_token,
      'fixture-alice',
      'fixture-secret-not-a-real-credential',
    ]) {
      assert.ok(
        !name.includes(secret) && !record?.includes(secret),
        'OAuth record exposes a raw credential',
      );
    }
  }
});

test('a chunked MCP body is bounded without relying on Content-Length', async () => {
  const credential = await token('alice');
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(600_000));
      controller.enqueue(new Uint8Array(600_000));
      controller.close();
    },
  });
  const response = await mcp(credential, { body, duplex: 'half' });
  assert.equal(response.status, 413);
});

test('real OAuth gateway authorizes downloads from a separate tenant Worker', async () => {
  const [gateway, storage] = await Promise.all(
    ['worker', 'tenant-worker'].map((entry) =>
      build({
        entryPoints: [fileURLToPath(new URL(`../src/${entry}.ts`, import.meta.url))],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        conditions: ['workerd'],
        external: ['cloudflare:workers'],
      }),
    ),
  );
  const server = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'gateway',
          modules: true,
          script: gateway.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          compatibilityFlags: ['global_fetch_strictly_public'],
          kvNamespaces: ['OAUTH_KV'],
          d1Databases: ['ACCOUNTS'],
          durableObjects: {
            TENANTS: { className: 'KilnTenant', scriptName: 'tenant', useSQLite: true },
          },
          bindings: {
            PUBLIC_ORIGIN: origin,
            GITHUB_CLIENT_ID: 'fixture-client',
            GITHUB_CLIENT_SECRET: 'fixture-only-secret',
            GOOGLE_CLIENT_ID: 'fixture-google-client',
            GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
          },
          outboundService: async (request) => {
            if (request.url === 'https://github.com/login/oauth/access_token') {
              const form = new URLSearchParams(await request.text());
              return Response.json({
                access_token: `fixture-${form.get('code')}`,
                token_type: 'bearer',
              });
            }
            if (request.url === 'https://api.github.com/user') {
              const credential = request.headers.get('authorization');
              assert.match(credential, /^Bearer fixture-(alice|bob)$/);
              return Response.json({ id: credential.endsWith('alice') ? 1001 : 1002 });
            }
            throw new Error('Unexpected network access');
          },
        },
        {
          name: 'tenant',
          modules: true,
          script: storage.outputFiles[0].text,
          compatibilityDate: '2026-10-06',
          r2Buckets: ['ARTIFACTS'],
          durableObjects: { TENANTS: { className: 'KilnTenant', useSQLite: true } },
          bindings: {
            STORAGE_MAX_BYTES: '1048576',
            STORAGE_MAX_OBJECTS: '32',
            STORAGE_MAX_GROUPS: '8',
          },
          outboundService: async () => {
            throw new Error('Tenant has no external network role');
          },
        },
      ],
    }),
  );
  try {
    const accounts = await server.getD1Database('ACCOUNTS', 'gateway');
    await migrateAccounts(accounts);
    const alice = await token('alice', { server });
    const bob = await token('bob', { server });
    const reconnected = await token('alice', { server });
    const namespace = await server.getDurableObjectNamespace('TENANTS', 'tenant');
    const identity = await accounts
      .prepare('SELECT account_id FROM kiln_identities WHERE issuer=? AND subject=?')
      .bind('https://github.com', '1001')
      .first();
    const name = digest(JSON.stringify(['kiln-tenant-v1', origin, identity.account_id]));
    const tenant = namespace.get(namespace.idFromName(name));
    // Seed bytes through the same private binding used by the future native host.
    const bytes = Buffer.from('private retained source');
    const uploaded = await tenant.fetch('https://tenant.internal/internal/artifacts', {
      method: 'POST',
      body: bytes,
      headers: {
        'content-type': 'application/javascript',
        'content-length': String(bytes.length),
        'x-artifact-name': 'source.kiln.js',
        'x-artifact-sha256': createHash('sha256').update(bytes).digest('hex'),
      },
    });
    assert.equal(uploaded.status, 201);
    const artifact = await uploaded.json();
    const url = `${origin}/mcp/artifacts/${artifact.id}`;
    assert.equal((await server.dispatchFetch(url)).status, 401);
    for (const credential of [alice, reconnected]) {
      const result = await server.dispatchFetch(url, {
        headers: { authorization: `Bearer ${credential.access_token}` },
      });
      assert.equal(result.status, 200);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }
    const denied = await server.dispatchFetch(url, {
      headers: {
        authorization: `Bearer ${bob.access_token}`,
        'x-tenant-id': name,
        'mcp-session-id': name,
        cookie: `tenant=${name}`,
      },
    });
    assert.equal(denied.status, 404);
    const headers = { authorization: `Bearer ${alice.access_token}` };
    assert.equal(
      (
        await server.dispatchFetch(`${origin}/internal/artifacts`, {
          method: 'POST',
          body: bytes,
          headers,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await server.dispatchFetch(`${origin}/mcp/internal/artifacts`, {
          method: 'POST',
          body: '{}',
          headers,
        })
      ).status,
      404,
    );
    assert.equal((await server.dispatchFetch(`${origin}/mcp`, { headers })).status, 405);
    assert.equal(
      (
        await server.dispatchFetch(`${origin}/mcp`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'kiln_validate', arguments: { code: 'function build(){}' } },
          }),
        })
      ).status,
      503,
    );
    const privateWorker = await server.getWorker('tenant');
    assert.equal(
      (
        await privateWorker.fetch('https://tenant.internal/internal/artifacts', {
          method: 'POST',
          body: bytes,
        })
      ).status,
      404,
    );
  } finally {
    await server.dispose();
  }
});
