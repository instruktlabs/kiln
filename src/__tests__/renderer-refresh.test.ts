import { afterEach, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { buildRenderPort } from '../cli-render-mode';
import { createLocalToolContext } from '../local-runtime';
import type { RenderCapabilities } from '../render-capabilities';
import { nextRenderRoute } from '../render-route';
import { createKilnProgramToolRegistry, type KilnRenderViewsResult } from '../tools/registry';
import { MemoryProgramStore } from '../program-store';
import { fakeRenderHealth } from './helpers/fake-render-service';

const previous = { ...process.env };
const servers: Server[] = [];
afterEach(async () => {
  for (const key of ['KILN_RENDER_PORT_URL', 'KILN_RENDER_SERVICE_PORT']) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function service() {
  const state = {
    healthy: false,
    renders: 0,
    healthReads: 0,
    beforeReply: undefined as (() => Promise<void>) | undefined,
  };
  const server = createServer(async (req, res) => {
    if (req.url === '/health') {
      state.healthReads++;
      res.writeHead(state.healthy ? 200 : 503, {
        'content-type': 'application/json',
      });
      return res.end(JSON.stringify(fakeRenderHealth()));
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    state.renders++;
    await state.beforeReply?.();
    const png = await sharp({
      create: {
        width: input.size,
        height: input.size,
        channels: 3,
        background: '#448899',
      },
    })
      .png()
      .toBuffer();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        rendererId: 'test-renderer',
        ok: true,
        views: input.views.map(() => png.toString('base64')),
        fidelity: {
          version: 'kiln.render-fidelity.v1',
          producer: 'kiln-render-service',
          materialFaithful: true,
          delivered: 'full-material',
          degraded: false,
          inputGlbSha256: input.input_glb_sha256,
          rendererId: 'test-renderer',
        },
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, url };
}
const code = `function build() { const root = createRoot('Refresh'); createPart('Body', boxGeo(1,1,1), pbrMaterial({color:0x448899,metalness:0.6}), {parent:root,position:[0,0.5,0]}); return root; }`;

test('existing registry refreshes a recovered renderer and never reuses its CPU image as GPU evidence', async () => {
  const { state, url } = await service();
  delete process.env.KILN_RENDER_PORT_URL;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(url).port;
  const selected = await buildRenderPort('auto', undefined);
  const tools = createKilnProgramToolRegistry(
    createLocalToolContext(
      { ...selected, programStore: new MemoryProgramStore() },
      { KILN_EVALUATOR_MODE: 'in-process' },
    ),
  );
  const render = tools.find((t) => t.name === 'kiln_render')!;
  const before = (await render.run({
    code,
    capture: { preset: '1x1' },
  })) as KilnRenderViewsResult & { programRef: string };
  expect(before.ok).toBe(true);
  expect(before.viewFidelity?.materialFaithful).toBe(false);
  state.healthy = true;
  const refresh = tools.find((t) => t.name === 'kiln_renderer');
  expect(refresh).toBeDefined();
  expect(refresh!.annotations?.readOnlyHint).toBe(false);
  expect(await refresh!.run({ action: 'status' })).toMatchObject({
    ok: true,
    renderer: { configured: false, reprobeRequired: true },
  });
  // #206: the read-only status names what the next render uses without reading prose.
  const status = tools.find((t) => t.name === 'kiln_renderer_status')!;
  expect(status.annotations?.readOnlyHint).toBe(true);
  expect(await status.run({})).toMatchObject({
    ok: true,
    renderer: {
      configured: false,
      reprobeRequired: true,
      ready: true,
      activeRoute: 'cpu',
      fallback: {
        active: true,
        materialFaithful: false,
        reason: expect.stringContaining('reprobe'),
      },
    },
  });
  expect(await refresh!.run({ action: 'reprobe' })).toMatchObject({
    ok: true,
    renderer: { configured: true, status: 'available' },
  });
  expect(await status.run({})).toMatchObject({
    ok: true,
    renderer: { ready: true, activeRoute: 'gpu', fallback: { active: false } },
  });
  expect(state.renders).toBe(0);
  const after = (await render.run({
    programRef: before.programRef,
    capture: { preset: '1x1' },
  })) as KilnRenderViewsResult & { programRef: string };
  expect(after.ok).toBe(true);
  expect(after.viewFidelity?.materialFaithful).toBe(true);
  expect(after.programRef).toBe(before.programRef);
  expect(state.renders).toBe(1);
  const cached = (await render.run({
    programRef: before.programRef,
    capture: { preset: '1x1' },
  })) as KilnRenderViewsResult;
  expect(cached.viewFidelity?.materialFaithful).toBe(true);
  expect(state.renders).toBe(1);
});

test('remote reprobe preserves the selected endpoint and does not adopt later environment changes', async () => {
  const first = await service();
  const second = await service();
  first.state.healthy = true;
  second.state.healthy = true;
  let starts = 0;
  const context = await buildRenderPort('auto', first.url, {
    start: async () => {
      starts++;
      return second.url;
    },
  });
  process.env.KILN_RENDER_PORT_URL = second.url;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(second.url).port;
  const refresh = createKilnProgramToolRegistry(context).find((t) => t.name === 'kiln_renderer')!;
  expect(await refresh.run({ action: 'reprobe' })).toMatchObject({
    ok: true,
    renderer: { endpoint: first.url, target: 'remote', configured: true },
  });
  expect(first.state.healthReads).toBe(1);
  expect(second.state.healthReads).toBe(0);
  expect(starts).toBe(0);
});

test('refresh preserves an in-flight image while later captures use the new CPU connection', async () => {
  const { state, url } = await service();
  state.healthy = true;
  delete process.env.KILN_RENDER_PORT_URL;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(url).port;
  const tools = createKilnProgramToolRegistry(await buildRenderPort('auto', undefined));
  let release!: () => void;
  let started!: () => void;
  const rendering = new Promise<void>((r) => {
    started = r;
  });
  const pending = new Promise<void>((r) => {
    release = r;
  });
  state.beforeReply = async () => {
    started();
    await pending;
  };
  const render = tools.find((t) => t.name === 'kiln_render')!;
  const operation = render.run({ code, capture: { preset: '1x1' } });
  try {
    await rendering;
    state.healthy = false;
    const refresh = tools.find((t) => t.name === 'kiln_renderer')!;
    expect(await refresh.run({ action: 'reprobe' })).toMatchObject({
      ok: true,
      renderer: { configured: false, status: 'unknown' },
    });
  } finally {
    // The in-flight connection must still verify the same service at completion.
    // Recovery does not undo the CPU connection selected by the failed reprobe.
    state.healthy = true;
    release();
  }
  const old = (await operation) as KilnRenderViewsResult & { programRef: string };
  expect(old.viewFidelity?.materialFaithful).toBe(true);
  const next = (await render.run({
    programRef: old.programRef,
    capture: { preset: '1x1' },
  })) as KilnRenderViewsResult;
  expect(next.ok).toBe(true);
  expect(next.viewFidelity?.materialFaithful).toBe(false);
  expect(state.renders).toBe(1);
});

test('reprobe resets a failed lazy start without starting the service itself', async () => {
  const { state, url } = await service();
  await new Promise<void>((r) => servers.at(-1)!.close(() => r()));
  delete process.env.KILN_RENDER_PORT_URL;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(url).port;
  let starts = 0;
  const context = await buildRenderPort('auto', undefined, {
    start: async () => {
      starts++;
      throw new Error('GPU temporarily unavailable');
    },
  });
  const request = {
    glb: new Uint8Array([1]),
    viewDirs: [[1, 0, 0]] as [number, number, number][],
    size: 128,
  };
  await expect(context.viewRenderPort!(request)).rejects.toThrow('temporarily unavailable');
  await expect(context.viewRenderPort!(request)).rejects.toThrow('temporarily unavailable');
  expect(starts).toBe(1);
  const tools = createKilnProgramToolRegistry(context);
  const refresh = tools.find((t) => t.name === 'kiln_renderer');
  expect(refresh).toBeDefined();
  expect(await refresh!.run({ action: 'reprobe' })).toMatchObject({
    ok: true,
    renderer: { status: 'on-demand' },
  });
  expect(starts).toBe(1);
  await expect(context.viewRenderPort!(request)).rejects.toThrow('temporarily unavailable');
  expect(starts).toBe(2);
  expect(state.renders).toBe(0);
});

test('status never reprobes, starts or renders, and names the on-demand GPU route', async () => {
  const { state, url } = await service();
  await new Promise<void>((r) => servers.at(-1)!.close(() => r()));
  delete process.env.KILN_RENDER_PORT_URL;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(url).port;
  let starts = 0;
  const context = await buildRenderPort('auto', undefined, {
    start: async () => {
      starts++;
      return url;
    },
  });
  let reprobes = 0;
  const reprobe = context.reprobeRenderer!;
  context.reprobeRenderer = () => {
    reprobes++;
    return reprobe();
  };
  const tools = createKilnProgramToolRegistry(context);
  const expected = {
    ok: true,
    renderer: {
      status: 'on-demand',
      ready: true,
      activeRoute: 'gpu',
      fallback: { active: false },
    },
  };
  expect(await tools.find((t) => t.name === 'kiln_renderer_status')!.run({})).toMatchObject(
    expected,
  );
  expect(
    await tools.find((t) => t.name === 'kiln_renderer')!.run({ action: 'status' }),
  ).toMatchObject(expected);
  expect({ reprobes, starts, renders: state.renders, healthReads: state.healthReads }).toEqual({
    reprobes: 0,
    starts: 0,
    renders: 0,
    healthReads: 0,
  });
});

test('a CPU-only host reports the CPU route as an active, non-material fallback', async () => {
  const status = createKilnProgramToolRegistry(await buildRenderPort('cpu', undefined)).find(
    (t) => t.name === 'kiln_renderer_status',
  )!;
  expect(await status.run({})).toMatchObject({
    ok: true,
    renderer: {
      status: 'disabled',
      ready: true,
      activeRoute: 'cpu',
      fallback: { active: true, materialFaithful: false, reason: expect.stringContaining('CPU') },
    },
  });
});

test('an attached GPU that stopped answering degrades, unless the host requires it', () => {
  const attached: RenderCapabilities = {
    mode: 'auto',
    target: 'local',
    configured: true,
    required: false,
    status: 'unavailable',
    reason: 'No local service is listening and automatic startup is disabled.',
    evidence: 'health-only',
  };
  expect(nextRenderRoute(attached)).toEqual({
    ready: false,
    activeRoute: 'gpu',
    fallback: {
      active: true,
      materialFaithful: false,
      reason: expect.stringContaining('No local service is listening'),
    },
  });
  expect(nextRenderRoute({ ...attached, mode: 'gpu', required: true })).toEqual({
    ready: false,
    activeRoute: 'gpu',
    fallback: { active: false },
  });
});

test('CPU refresh stays CPU; opaque injected hosts reject unsupported reprobe', async () => {
  const { state, url } = await service();
  const cpu = createKilnProgramToolRegistry(await buildRenderPort('cpu', url));
  const refresh = cpu.find((t) => t.name === 'kiln_renderer');
  expect(refresh).toBeDefined();
  expect(await refresh!.run({ action: 'reprobe' })).toMatchObject({
    ok: true,
    renderer: { status: 'disabled', configured: false },
  });
  expect(state.healthReads).toBe(0);
  const opaque = createKilnProgramToolRegistry({
    viewRenderPort: async () => {
      throw new Error('must not render');
    },
  });
  expect(
    await opaque.find((t) => t.name === 'kiln_renderer')!.run({ action: 'reprobe' }),
  ).toMatchObject({ ok: false, error: expect.stringContaining('host') });
});
