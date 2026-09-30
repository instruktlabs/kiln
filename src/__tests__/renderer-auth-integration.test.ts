import { expect, test } from 'bun:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildRenderPort } from '../cli-render-mode';
import { makeRemoteRenderPort, readRenderServiceHealth } from '../render-service-client';
import { fakeRenderHealth } from './helpers/fake-render-service';

test('the shared host authenticates locally while explicit clients preserve remote credential isolation', async () => {
  const token = 'fixture-only-local-token';
  const health = fakeRenderHealth({ authRequired: true });
  let uploads = 0;
  let authorizedUploads = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify(health));
      return;
    }
    uploads++;
    for await (const _chunk of req) {
      // Consume the fixture request without involving a GPU or a native parser.
    }
    if (req.headers['x-render-token'] !== token) {
      res.writeHead(401);
      res.end('{"ok":false}');
      return;
    }
    authorizedUploads++;
    res.end(JSON.stringify({ ok: true, rendererId: health.rendererId, views: [] }));
  });
  const keys = [
    'KILN_RENDER_TOKEN',
    'RENDER_SERVICE_TOKEN',
    'KILN_RENDER_PORT_URL',
    'KILN_RENDER_SERVICE_PORT',
    'KILN_RENDER_SERVICE_DIR',
  ] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    delete process.env.KILN_RENDER_TOKEN;
    delete process.env.KILN_RENDER_PORT_URL;
    delete process.env.KILN_RENDER_SERVICE_DIR;
    process.env.RENDER_SERVICE_TOKEN = token;
    process.env.KILN_RENDER_SERVICE_PORT = new URL(url).port;
    const request = { glb: new Uint8Array([1]) };
    const before = await readRenderServiceHealth(url);

    // This reproduces the qualification-script mistake against the same live identity.
    await expect(makeRemoteRenderPort(url, process.env.KILN_RENDER_TOKEN)(request)).rejects.toThrow(
      /requires authentication/,
    );
    expect(uploads).toBe(0);

    const shared = await buildRenderPort('auto', undefined, { autoSpawn: false });
    expect(await shared.renderCapabilities!()).toMatchObject({
      target: 'local',
      authentication: 'configured-unverified',
      evidence: 'health-only',
    });
    expect((await shared.viewRenderPort!(request)).ok).toBe(true);
    expect(authorizedUploads).toBe(1);

    // An explicit endpoint is a remote route even when its URL happens to be loopback.
    const remote = await buildRenderPort('auto', url, { autoSpawn: false });
    expect(await remote.renderCapabilities!()).toMatchObject({
      target: 'remote',
      authentication: 'missing',
    });
    await expect(remote.viewRenderPort!(request)).rejects.toThrow(/requires authentication/);
    expect(uploads).toBe(1);
    expect(await readRenderServiceHealth(url)).toEqual(before);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
