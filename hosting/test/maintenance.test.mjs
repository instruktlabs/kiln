import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
let bundle;
before(async () => {
  bundle = (
    await build({
      entryPoints: [fileURLToPath(new URL('../src/maintenance-worker.ts', import.meta.url))],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text;
});

test('the actual maintenance Worker rejects every HTTP path without storage, identity or compute access', async () => {
  let networkCalls = 0;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle,
      compatibilityDate: '2026-10-06',
      outboundService: () => {
        networkCalls++;
        throw new Error('Unexpected outbound request');
      },
    }),
  );
  try {
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS', 'DELETE']) {
      for (const path of [
        '/',
        '/account',
        '/account/delete',
        '/oauth/google/callback?code=private-code',
        '/oauth/github/callback',
        '/authorize',
        '/token',
        '/oauth/token',
        '/register',
        '/mcp',
        '/.well-known/oauth-authorization-server',
        '/download/private-ticket',
        '/downloads/private-ticket',
        '/unknown',
      ]) {
        const response = await runtime.dispatchFetch(`https://kiln.example${path}`, {
          method,
          headers: { authorization: 'Bearer private-token', cookie: 'private-cookie' },
          ...(['POST', 'DELETE'].includes(method) ? { body: 'private-source' } : {}),
        });
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('retry-after'), '60');
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('set-cookie'), null);
        assert.equal(response.headers.get('location'), null);
        const text = await response.text();
        assert.doesNotMatch(
          text,
          /private-code|private-token|private-cookie|private-source|private-ticket/,
        );
        if (method === 'HEAD') assert.equal(text, '');
        else assert.match(text, /temporarily unavailable/);
      }
    }
    assert.equal(networkCalls, 0);
  } finally {
    await runtime.dispose();
  }
});

test('maintenance retains the exact production scheduled recovery handler', async () => {
  const script = (
    await build({
      stdin: {
        contents: `import maintenance from '../src/maintenance-worker';
      import gateway from '../src/worker';
      export default {fetch(){return Response.json(maintenance.scheduled === gateway.scheduled);}};`,
        resolveDir: fileURLToPath(new URL('.', import.meta.url)),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({ modules: true, script, compatibilityDate: '2026-10-06' }),
  );
  try {
    assert.equal(await (await runtime.dispatchFetch('https://local.invalid')).json(), true);
  } finally {
    await runtime.dispose();
  }
});
