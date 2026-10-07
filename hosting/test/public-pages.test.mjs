import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { rateLimitBindings } from './rate-limit-bindings.mjs';

const origin = 'https://kiln.example.com';
let runtime;
let outgoing = 0;
before(async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/worker.ts', import.meta.url))],
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
      ratelimits: rateLimitBindings,
      bindings: { PUBLIC_ORIGIN: origin },
      // Deliberately no accounts, OAuth KV, provider credentials, storage or compute.
      outboundService: async () => {
        outgoing++;
        throw new Error('Public information must not contact another service');
      },
    }),
  );
});
after(async () => runtime?.dispose());

test('home and policy pages are available before sign-in without credentials or storage', async () => {
  for (const path of ['/', '/privacy', '/support', '/terms']) {
    const response = await runtime.dispatchFetch(origin + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text();
    const nonce = html.match(/<style nonce="([a-f0-9]+)">/)[1];
    const csp = response.headers.get('content-security-policy');
    assert.ok(csp.includes(`style-src 'nonce-${nonce}'`));
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.doesNotMatch(html, /<script|<iframe|<link[^>]+href="https?:/i);
    for (const link of ['/privacy', '/support', '/terms', '/account'])
      assert.ok(html.includes(`href="${link}"`));
  }
  assert.equal(outgoing, 0);
});

test('public content explains hosted data access, retention, notices and private support', async () => {
  const home = await (await runtime.dispatchFetch(`${origin}/`)).text();
  assert.match(home, /JavaScript/);
  assert.match(home, /free within/i);
  assert.ok(home.includes(`${origin}/mcp`));
  const privacy = await (await runtime.dispatchFetch(`${origin}/privacy`)).text();
  for (const fact of [
    'Google',
    'GitHub',
    'Cloudflare',
    'seven days',
    '30 days',
    'three months',
    'in-app',
    'retirement records',
  ])
    assert.ok(privacy.includes(fact), fact);
  assert.match(privacy, /support@instruktlabs\.com/);
  const support = await (await runtime.dispatchFetch(`${origin}/support`)).text();
  assert.match(support, /mailto:support@instruktlabs\.com/);
  assert.match(support, /public issues/i);
  assert.match(support, /passwords|tokens/);
});

test('information pages allow HEAD but reject mutation methods and query reflection', async () => {
  for (const path of ['/', '/privacy', '/support', '/terms']) {
    const head = await runtime.dispatchFetch(origin + path, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await runtime.dispatchFetch(origin + path, {
      method: 'POST',
      body: 'private-value',
    });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
    const query = await runtime.dispatchFetch(`${origin}${path}?private-value=%3Cscript%3E`);
    assert.equal(query.status, 400);
    assert.doesNotMatch(await query.text(), /private-value|<script>/);
  }
  assert.equal((await runtime.dispatchFetch('https://foreign.example/privacy')).status, 421);
  assert.equal(outgoing, 0);
});
