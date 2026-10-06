import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const origin = 'https://kiln.example.com';
let runtime;
let outboundCalls = 0;
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
    external: ['cloudflare:workers'],
  });
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-10-06',
      compatibilityFlags: ['global_fetch_strictly_public'],
      kvNamespaces: ['OAUTH_KV'],
      durableObjects: { TENANTS: 'TestTenant' },
      bindings: {
        PUBLIC_ORIGIN: origin,
        GITHUB_CLIENT_ID: 'fixture-client',
        GITHUB_CLIENT_SECRET: 'fixture-secret-not-a-real-credential',
      },
      outboundService: async (request) => {
        outboundCalls++;
        if (request.url === 'https://client.example/metadata.json') {
          return Response.json({
            client_id: request.url,
            client_name: 'Metadata fixture client',
            redirect_uris: ['https://client.example/callback'],
            token_endpoint_auth_method: 'none',
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
});
after(async () => runtime?.dispose());

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

async function approve(start, { cookie = start.cookie, decision = 'approve' } = {}) {
  return start.server.dispatchFetch(`${origin}/authorize`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin, cookie },
    body: new URLSearchParams({ handle: start.handle, decision }),
  });
}

async function grant(user = 'alice', options) {
  const start = await consent(options);
  assert.equal(start.response.status, 200);
  const approved = await approve(start);
  assert.equal(approved.status, 302);
  const upstream = new URL(approved.headers.get('location'));
  assert.equal(upstream.origin, 'https://github.com');
  assert.equal(upstream.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(upstream.searchParams.get('scope'), '');
  const callback = `${origin}/oauth/github/callback?${new URLSearchParams({ state: upstream.searchParams.get('state'), code: user })}`;
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
    body: options.body ?? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

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
  assert.equal(other.headers['mcp-session-id'], 'session-alice'); // Session IDs never route a tenant.
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
          durableObjects: {
            TENANTS: { className: 'KilnTenant', scriptName: 'tenant', useSQLite: true },
          },
          bindings: {
            PUBLIC_ORIGIN: origin,
            GITHUB_CLIENT_ID: 'fixture-client',
            GITHUB_CLIENT_SECRET: 'fixture-only-secret',
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
    const alice = await token('alice', { server });
    const bob = await token('bob', { server });
    const reconnected = await token('alice', { server });
    const namespace = await server.getDurableObjectNamespace('TENANTS', 'tenant');
    const name = digest(JSON.stringify(['kiln-tenant-v1', origin, 'github-1001']));
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
    assert.equal((await server.dispatchFetch(`${origin}/mcp`, { headers })).status, 503);
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
