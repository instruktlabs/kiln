import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let createNativeHttpServer;
before(async () => {
  // Keep the fixture under the private package so Node resolves its pinned adapter.
  const output = new URL(
    '../node_modules/.cache/hosted-native-http-server/host.mjs',
    import.meta.url,
  );
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-host.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
  });
  ({ createNativeHttpServer } = await import(output));
});

async function listen(t, handler, options = {}) {
  const server = createNativeHttpServer(handler, options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  });
  return server;
}
function request(server, { path = '/mcp', headers = {}, method = 'POST', body = '{}' } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        headers: { host: 'kiln-native.internal', 'content-type': 'application/json', ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('native Node adapter serves the fixed internal origin and a minimal readiness route', async (t) => {
  let calls = 0;
  const server = await listen(t, {
    fetch: async (req) => {
      calls++;
      assert.equal(req.url, 'http://kiln-native.internal/mcp');
      assert.equal(await req.text(), '{}');
      return new Response('ok');
    },
  });
  assert.equal((await request(server)).body, 'ok');
  const ready = await request(server, { path: '/_ready', method: 'GET', body: '' });
  assert.equal(ready.status, 204);
  assert.equal(ready.body, '');
  assert.equal(ready.headers['cache-control'], 'no-store');
  assert.equal(calls, 1);
});

test('native Node adapter refuses foreign Host, absolute paths and oversized inputs before MCP dispatch', async (t) => {
  let calls = 0;
  const server = await listen(t, {
    fetch: async () => {
      calls++;
      return new Response('must not be reached');
    },
  });
  for (const [options, status] of [
    [{ headers: { host: 'attacker.example' } }, 421],
    [{ path: 'http://kiln-native.internal/mcp' }, 404],
    [{ path: '/mcp?token=private' }, 404],
    [{ headers: { 'content-length': String(1024 * 1024 + 1) }, body: '' }, 413],
  ])
    assert.equal((await request(server, options)).status, status);
  // For a chunked flood the SDK exits IncomingMessage's async iterator at the
  // byte cap, which can close the Node socket before its 413 can be delivered.
  const oversized = await request(server, { body: 'x'.repeat(1024 * 1024 + 1) }).catch((error) => {
    assert.equal(error.code, 'ECONNRESET');
    return { status: 'closed' };
  });
  assert.ok(oversized.status === 413 || oversized.status === 'closed');
  assert.equal(calls, 0);
});

test('client disconnect reaches the Fetch handler without exposing its abort reason', async (t) => {
  let entered, aborted;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const cancelled = new Promise((resolve) => {
    aborted = resolve;
  });
  const server = await listen(t, {
    fetch: async (req) => {
      req.signal.addEventListener('abort', () => aborted(), { once: true });
      entered();
      await cancelled;
      return new Response('late');
    },
  });
  const req = httpRequest(
    {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: '/mcp',
      method: 'POST',
      headers: { host: 'kiln-native.internal' },
    },
    (res) => res.resume(),
  );
  req.on('error', () => {});
  req.end('{}');
  await started;
  req.destroy();
  await Promise.race([
    cancelled,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(Error('Disconnect did not reach host')), 2000);
      timer.unref();
    }),
  ]);
});

test('native Node adapter applies an upload timeout before the Fetch handler starts', async (t) => {
  let calls = 0;
  const server = await listen(
    t,
    {
      fetch: async () => {
        calls++;
        return new Response('unexpected');
      },
    },
    { requestTimeoutMs: 50 },
  );
  const result = await new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/mcp',
        method: 'POST',
        headers: { host: 'kiln-native.internal', 'content-length': '20' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', () => resolve('closed'));
    req.write('{');
  });
  assert.ok(result === 408 || result === 'closed');
  assert.equal(calls, 0);
});
