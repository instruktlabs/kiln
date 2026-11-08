import { fakeRenderHealth } from './helpers/fake-render-service';
import { test, expect } from 'bun:test';
import { buildRenderPort } from '../cli-render-mode';
import { createKilnProgramToolRegistry } from '../tools/registry';
import { encodePng } from '../views/png';
import { createHash } from 'node:crypto';
test('local service identity enables default host GPU reuse and invalidates on restart', async () => {
  let renders = 0,
    instance = 'one';
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname === '/health')
        return Response.json(
          fakeRenderHealth({
            ok: true,
            rendererId: 'gpu:test',
            captureIdentity: {
              version: 'kiln.capture-producer.v1',
              fingerprint: `sha256:${'a'.repeat(64)}`,
              instanceId: instance,
            },
          }),
        );
      renders++;
      const body = (await request.json()) as {
        glb_base64: string;
        cameras: unknown[];
        width: number;
        height: number;
      };
      const hash =
        'sha256:' +
        createHash('sha256').update(Buffer.from(body.glb_base64, 'base64')).digest('hex');
      return Response.json({
        ok: true,
        rendererId: 'gpu:test',
        cameras: body.cameras,
        width: body.width,
        height: body.height,
        views: [Buffer.from(encodePng(new Uint8Array(512 * 512 * 3), 512, 512)).toString('base64')],
        fidelity: {
          version: 'kiln.render-fidelity.v1',
          producer: 'kiln-render-service',
          delivered: 'full-material',
          materialFaithful: true,
          degraded: false,
          inputGlbSha256: hash,
          rendererId: 'gpu:test',
        },
      });
    },
  });
  try {
    const context = await buildRenderPort('gpu', server.url.toString());
    expect(context.captureCacheIdentity).toBeFunction();
    const defs = createKilnProgramToolRegistry(context);
    const inspect = defs.find((d) => d.name === 'kiln_inspect')!;
    const code =
      "const meta={name:'box',category:'prop'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});return r;}";
    const a = await inspect.run({ code });
    expect(a).toMatchObject({ ok: true });
    await inspect.run({ code });
    expect(renders).toBe(1);
    instance = 'two';
    await inspect.run({ code });
    expect(renders).toBe(2);
  } finally {
    server.stop(true);
  }
});
test('a renderer the first capture has to start still caches that capture', async () => {
  // A cold session used to have no capture identity until the first request had started the
  // service, so that request bypassed the cache and its repeat rendered again.
  let renders = 0,
    starts = 0;
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname === '/health')
        return Response.json(
          fakeRenderHealth({
            ok: true,
            rendererId: 'gpu:test',
            captureIdentity: {
              version: 'kiln.capture-producer.v1',
              fingerprint: `sha256:${'b'.repeat(64)}`,
              instanceId: 'cold-start',
            },
          }),
        );
      renders++;
      const body = (await request.json()) as {
        glb_base64: string;
        cameras: unknown[];
        width: number;
        height: number;
      };
      return Response.json({
        ok: true,
        rendererId: 'gpu:test',
        cameras: body.cameras,
        width: body.width,
        height: body.height,
        views: [Buffer.from(encodePng(new Uint8Array(512 * 512 * 3), 512, 512)).toString('base64')],
        fidelity: {
          version: 'kiln.render-fidelity.v1',
          producer: 'kiln-render-service',
          delivered: 'full-material',
          materialFaithful: true,
          degraded: false,
          inputGlbSha256:
            'sha256:' +
            createHash('sha256').update(Buffer.from(body.glb_base64, 'base64')).digest('hex'),
          rendererId: 'gpu:test',
        },
      });
    },
  });
  const nobody = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const unusedPort = nobody.port;
  nobody.stop(true);
  const previousPort = process.env.KILN_RENDER_SERVICE_PORT;
  const previousUrl = process.env.KILN_RENDER_PORT_URL;
  try {
    delete process.env.KILN_RENDER_PORT_URL;
    process.env.KILN_RENDER_SERVICE_PORT = String(unusedPort);
    const context = await buildRenderPort('auto', undefined, {
      start: async () => {
        starts++;
        return server.url.toString();
      },
    });
    expect(starts).toBe(0);
    const inspect = createKilnProgramToolRegistry(context).find((d) => d.name === 'kiln_inspect')!;
    const code =
      "const meta={name:'box',category:'prop'};function build(){const r=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial('#888888'),{parent:r});return r;}";
    expect(await inspect.run({ code })).toMatchObject({ ok: true });
    expect(await inspect.run({ code })).toMatchObject({ ok: true });
    expect(renders).toBe(1);
    expect(starts).toBe(1);
  } finally {
    if (previousPort === undefined) delete process.env.KILN_RENDER_SERVICE_PORT;
    else process.env.KILN_RENDER_SERVICE_PORT = previousPort;
    if (previousUrl === undefined) delete process.env.KILN_RENDER_PORT_URL;
    else process.env.KILN_RENDER_PORT_URL = previousUrl;
    server.stop(true);
  }
});

test('CPU mode does not probe a renderer; unknown or unreachable identity disables reuse', async () => {
  const { probeCaptureIdentity } = await import('../cli-render-mode');
  let requests = 0;
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      requests++;
      return Response.json({ ok: true, rendererId: 'legacy' });
    },
  });
  const url = server.url.toString();
  try {
    const context = await buildRenderPort('cpu', url);
    expect(context.captureCacheIdentity).toBeUndefined();
    expect(requests).toBe(0);
    expect(await probeCaptureIdentity(url)).toBeUndefined();
  } finally {
    server.stop(true);
  }
  expect(await probeCaptureIdentity(url)).toBeUndefined();
});
