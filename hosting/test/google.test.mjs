import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';

const origin = 'https://kiln.example.com';
const issuer = 'https://accounts.google.com';
const clientId = 'fixture-google-client';
const state = 's'.repeat(43),
  verifier = 'v'.repeat(43),
  nonce = 'n'.repeat(43);
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = {
  ...keys.publicKey.export({ format: 'jwk' }),
  kid: 'fixture-key',
  alg: 'RS256',
  use: 'sig',
};
let runtime;
let tokenCalls = 0;
let metadataPatch = {};
let jwksUnavailable = false;
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function idToken(mode) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer,
    sub: 'immutable-google-subject',
    aud: clientId,
    iat: now,
    exp: now + 300,
    nonce,
  };
  if (mode === 'legacy-issuer') claims.iss = 'accounts.google.com';
  if (mode === 'wrong-issuer') claims.iss = 'https://foreign.example';
  if (mode === 'wrong-audience') claims.aud = 'another-client';
  if (mode === 'wrong-azp') claims.azp = 'another-client';
  if (mode === 'expired') claims.exp = now - 600;
  if (mode === 'wrong-nonce') claims.nonce = 'foreign-nonce';
  if (mode === 'missing-nonce') delete claims.nonce;
  if (mode === 'missing-subject') delete claims.sub;
  const header = { alg: mode === 'unsigned' ? 'none' : 'RS256', kid: 'fixture-key' };
  const input = `${encode(header)}.${encode(claims)}`;
  const signature =
    mode === 'unsigned'
      ? ''
      : sign(
          'RSA-SHA256',
          Buffer.from(input),
          mode === 'wrong-signature' ? wrongKeys.privateKey : keys.privateKey,
        ).toString('base64url');
  return `${input}.${signature}`;
}

before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('./google-worker.ts', import.meta.url))],
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
      bindings: {
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: 'fixture-secret-not-a-credential',
      },
      outboundService: async (request) => {
        if (request.url === `${issuer}/.well-known/openid-configuration`) {
          assert.equal(request.method, 'GET');
          assert.equal(request.headers.get('authorization'), null);
          return Response.json({
            issuer,
            authorization_endpoint: `${issuer}/o/oauth2/v2/auth`,
            token_endpoint: 'https://oauth2.googleapis.com/token',
            jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
            id_token_signing_alg_values_supported: ['RS256'],
            code_challenge_methods_supported: ['S256'],
            ...metadataPatch,
          });
        }
        if (request.url === 'https://oauth2.googleapis.com/token') {
          tokenCalls++;
          assert.equal(request.method, 'POST');
          const form = new URLSearchParams(await request.text());
          assert.equal(form.get('client_id'), clientId);
          assert.equal(form.get('client_secret'), 'fixture-secret-not-a-credential');
          assert.equal(form.get('code_verifier'), verifier);
          assert.equal(form.get('redirect_uri'), `${origin}/oauth/google/callback`);
          assert.equal(form.get('grant_type'), 'authorization_code');
          const mode = form.get('code');
          if (mode === 'outage')
            return new Response('private provider diagnostic', { status: 503 });
          if (mode === 'redirect')
            return new Response(null, {
              status: 302,
              headers: { location: 'https://foreign.example/steal' },
            });
          if (mode === 'oversize')
            return new Response('x'.repeat(70_000), {
              headers: { 'content-type': 'application/json' },
            });
          return Response.json({
            access_token: 'fixture-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            ...(mode === 'missing-token' ? {} : { id_token: idToken(mode) }),
          });
        }
        if (request.url === 'https://www.googleapis.com/oauth2/v3/certs') {
          assert.equal(request.method, 'GET');
          assert.equal(request.headers.get('authorization'), null);
          return jwksUnavailable
            ? new Response('private JWKS diagnostic', { status: 503 })
            : Response.json({ keys: [jwk] });
        }
        throw new Error('Unexpected Google fixture request');
      },
    }),
  );
});
after(async () => runtime?.dispose());
const callback = (code = 'valid', extra = '') =>
  runtime.dispatchFetch(`${origin}/oauth/google/callback?code=${code}&state=${state}${extra}`);

test('Google authorization uses minimal scopes, exact callback, state, nonce and S256', async () => {
  const response = await runtime.dispatchFetch(`${origin}/start`);
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url);
  assert.equal(url.origin + url.pathname, `${issuer}/o/oauth2/v2/auth`);
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('scope'), 'openid profile');
  assert.equal(url.searchParams.get('redirect_uri'), `${origin}/oauth/google/callback`);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), state);
  assert.equal(url.searchParams.get('nonce'), nonce);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(
    url.searchParams.get('code_challenge'),
    createHash('sha256').update(verifier).digest('base64url'),
  );
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.has('access_type'), false);
});

test('both documented Google issuer spellings verify and produce one canonical identity without tokens', async () => {
  for (const code of ['valid', 'legacy-issuer']) {
    const response = await callback(code);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { issuer, subject: 'immutable-google-subject' });
  }
});

test('invalid ID tokens fail issuer, audience, authorized-party, expiry, nonce and signature checks', async () => {
  for (const mode of [
    'wrong-issuer',
    'wrong-audience',
    'wrong-azp',
    'expired',
    'wrong-nonce',
    'missing-nonce',
    'missing-subject',
    'wrong-signature',
    'unsigned',
    'missing-token',
  ]) {
    const response = await callback(mode);
    assert.equal(response.status, 400, mode);
    assert.equal(await response.text(), 'Google sign-in failed; restart sign-in');
  }
});

test('state errors, duplicate codes, a foreign callback and provider denial stop before token exchange', async () => {
  const before = tokenCalls;
  for (const url of [
    `${origin}/oauth/google/callback?code=valid&state=foreign`,
    `${origin}/oauth/google/callback?code=valid`,
    `${origin}/oauth/google/callback?code=valid&code=other&state=${state}`,
    `${origin}/oauth/google/callback?error=access_denied&state=${state}`,
    `${origin}/oauth/github/callback?code=valid&state=${state}`,
    `https://foreign.example/oauth/google/callback?code=valid&state=${state}`,
  ])
    assert.equal((await runtime.dispatchFetch(url)).status, 400);
  assert.equal(tokenCalls, before);
});

test('discovery cannot redirect credentials or JWKS requests to a different service', async () => {
  const before = tokenCalls;
  try {
    for (const patch of [
      { issuer: 'https://foreign.example' },
      { token_endpoint: 'https://foreign.example/token' },
      { jwks_uri: 'http://127.0.0.1/keys' },
      { authorization_endpoint: 'https://foreign.example/authorize' },
    ]) {
      metadataPatch = patch;
      assert.equal((await callback()).status, 502);
    }
  } finally {
    metadataPatch = {};
  }
  assert.equal(tokenCalls, before);
});

test('provider outages, redirects and oversized responses fail without exposing diagnostic bodies', async () => {
  for (const mode of ['outage', 'redirect', 'oversize']) {
    const response = await callback(mode);
    assert.equal(response.status, 502, mode);
    assert.equal(await response.text(), 'Google sign-in provider unavailable; restart sign-in');
  }
  jwksUnavailable = true;
  try {
    assert.equal((await callback()).status, 502);
  } finally {
    jwksUnavailable = false;
  }
});
