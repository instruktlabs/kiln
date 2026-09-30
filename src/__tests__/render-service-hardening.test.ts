import { afterEach, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { inspectLocalRenderService, startLocalRenderService } from '../render-service-host';
import { captureViewPngsViaPort } from '../views/port';
import { makeRemoteRenderPort, validateRenderServiceHealth } from '../render-service-client';
import { buildRenderPort } from '../cli-render-mode';
import { fakeRenderHealth, freePort } from './helpers/fake-render-service';
import { probeCaptureIdentity } from '../render-service-client';
import { serviceMain } from '../service-cli';

const servers: Server[] = [];
const oldPort = process.env.KILN_RENDER_SERVICE_PORT;
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  if (oldPort === undefined) delete process.env.KILN_RENDER_SERVICE_PORT;
  else process.env.KILN_RENDER_SERVICE_PORT = oldPort;
});
async function serve(body?: unknown): Promise<string> {
  const server = createServer((_req, res) => {
    if (body === undefined) return;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  process.env.KILN_RENDER_SERVICE_PORT = String(port);
  return `http://127.0.0.1:${port}`;
}

test('missing renderer credentials fail before uploading an asset and status explains setup', async () => {
  let uploads = 0;
  const url = await serve({ ...fakeRenderHealth(), authRequired: true });
  const server = servers.at(-1)!;
  server.removeAllListeners('request');
  server.on('request', async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ...fakeRenderHealth(), authRequired: true }));
      return;
    }
    uploads++;
    for await (const _chunk of req) {
    }
    res.writeHead(401);
    res.end('{"ok":false}');
  });
  const previousClientToken = process.env.KILN_RENDER_TOKEN;
  const previousServiceToken = process.env.RENDER_SERVICE_TOKEN;
  try {
    delete process.env.KILN_RENDER_TOKEN;
    delete process.env.RENDER_SERVICE_TOKEN;
    await expect(
      makeRemoteRenderPort(url)({
        glb: new Uint8Array(1024 * 1024),
        viewDirs: [[1, 0, 0]],
        size: 128,
      }),
    ).rejects.toThrow(/requires authentication.*KILN_RENDER_TOKEN/);
    expect(uploads).toBe(0);
    expect(await probeCaptureIdentity(url)).toBeUndefined();
    const lines: string[] = [];
    expect(
      await serviceMain(['reprobe'], {
        log: (line) => lines.push(line),
        error: (line) => lines.push(line),
      }),
    ).toBe(1);
    expect(lines.join('\n')).toMatch(/authentication.*required.*KILN_RENDER_TOKEN/);
    expect(uploads).toBe(0);
  } finally {
    if (previousClientToken === undefined) delete process.env.KILN_RENDER_TOKEN;
    else process.env.KILN_RENDER_TOKEN = previousClientToken;
    if (previousServiceToken === undefined) delete process.env.RENDER_SERVICE_TOKEN;
    else process.env.RENDER_SERVICE_TOKEN = previousServiceToken;
  }
});

test('renderer credential rejection is actionable and matching credentials still render', async () => {
  const url = await serve({ ...fakeRenderHealth(), authRequired: true });
  const server = servers.at(-1)!;
  server.removeAllListeners('request');
  server.on('request', async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ...fakeRenderHealth(), authRequired: true }));
      return;
    }
    for await (const _chunk of req) {
    }
    if (req.headers['x-render-token'] !== 'fixture-matching-token') {
      res.writeHead(401);
      res.end('{"ok":false}');
      return;
    }
    res.end(JSON.stringify({ ok: true, rendererId: 'test-renderer', views: ['cG5n'] }));
  });
  const request = {
    glb: new Uint8Array([1]),
    viewDirs: [[1, 0, 0]] as [number, number, number][],
    size: 128,
  };
  await expect(makeRemoteRenderPort(url, 'fixture-wrong-token')(request)).rejects.toThrow(
    /authentication.*401.*KILN_RENDER_TOKEN/,
  );
  expect((await makeRemoteRenderPort(url, 'fixture-matching-token')(request)).rendererId).toBe(
    'test-renderer',
  );
});
test('an unversioned ok health response is incompatible and cannot be adopted', async () => {
  const url = await serve({ ok: true, rendererId: 'unknown' });
  expect(await inspectLocalRenderService(url)).toMatchObject({ kind: 'incompatible' });
  await expect(startLocalRenderService()).rejects.toThrow(/protocol|incompatible/);
});
test('timed out health remains unknown and start never joins that socket', async () => {
  const url = await serve();
  expect(await inspectLocalRenderService(url, undefined, 10)).toMatchObject({ kind: 'unknown' });
  await expect(startLocalRenderService()).rejects.toThrow(/unknown|timed out/);
});
test('the port deadline aborts the supplied execution signal exactly once', async () => {
  let signal: AbortSignal | undefined;
  let aborted = 0;
  const output = await captureViewPngsViaPort(
    async (_req, execution) => {
      signal = execution?.signal;
      signal?.addEventListener('abort', () => {
        aborted++;
      });
      return await new Promise(() => {});
    },
    new Uint8Array([1]),
    10,
    [[1, 0, 0]],
    1,
  );
  expect(output).toMatchObject({ ok: false, reason: 'view render port timed out after 10ms' });
  expect(signal?.aborted).toBe(true);
  expect(aborted).toBe(1);
});

test('health rejects missing or contradictory protocol, dependency, build, capability and capture evidence', () => {
  const valid = fakeRenderHealth();
  expect(validateRenderServiceHealth(valid)).toMatchObject({ kind: 'service' });
  type MutableHealth = {
    protocol?: unknown;
    authRequired?: unknown;
    instance: Record<string, unknown>;
    compatibility: { dependencies: Record<string, unknown>; fingerprint: unknown };
    capabilities: unknown;
    captureIdentity?: { instanceId: unknown };
  };
  const corruptions: ((health: MutableHealth) => void)[] = [
    (h) => {
      delete h.authRequired;
    },
    (h) => {
      h.authRequired = 'false';
    },
    (h) => {
      delete h.protocol;
    },
    (h) => {
      h.instance.version = 'kiln.render-service-instance.v1';
    },
    (h) => {
      h.instance.pid = 0;
    },
    (h) => {
      h.instance.mode = 'managed';
      h.instance.idleTimeoutMs = null;
    },
    (h) => {
      h.instance.sourceFingerprint = `sha256:${'0'.repeat(64)}`;
    },
    (h) => {
      h.compatibility.dependencies.webgpu = '0.4.0';
    },
    (h) => {
      h.compatibility.fingerprint = `sha256:${'0'.repeat(64)}`;
    },
    (h) => {
      h.capabilities = [];
    },
    (h) => {
      delete h.captureIdentity;
    },
    (h) => {
      h.captureIdentity!.instanceId = '';
    },
  ];
  for (const corrupt of corruptions) {
    const health = structuredClone(valid);
    corrupt(health as unknown as MutableHealth);
    expect(validateRenderServiceHealth(health)).toMatchObject({ kind: 'incompatible' });
  }
});

test('an explicit remote failure never starts or substitutes a local renderer', async () => {
  const url = await serve({ ok: true, rendererId: 'outdated' });
  let starts = 0;
  const start = async () => {
    starts++;
    return url;
  };
  // A URL naming the shared local socket takes the local route, which reports an
  // incompatible listener instead of replacing it.
  await expect(buildRenderPort('gpu', url, { start })).rejects.toThrow(/incompatible/);
  // Any other endpoint is remote: its failure surfaces on render and starts nothing.
  process.env.KILN_RENDER_SERVICE_PORT = String(await freePort());
  const context = await buildRenderPort('gpu', url, { start });
  await expect(context.viewRenderPort!({ glb: new Uint8Array([1]) })).rejects.toThrow(/protocol/);
  expect(starts).toBe(0);
});

test('the owner deadline aborts a dispatched HTTP render and closes the server response', async () => {
  let dispatched = false;
  let closed = false;
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(fakeRenderHealth()));
      return;
    }
    dispatched = true;
    res.on('close', () => {
      closed = true;
    });
    req.resume();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const output = await captureViewPngsViaPort(
    makeRemoteRenderPort(url),
    new Uint8Array([1]),
    100,
    [[1, 0, 0]],
    1,
  );
  expect(output).toMatchObject({ ok: false, reason: 'view render port timed out after 100ms' });
  expect(dispatched).toBe(true);
  for (let i = 0; i < 20 && !closed; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  expect(closed).toBe(true);
});
