/** Offline installation resolution and lazy verified transport behavior. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  localRenderServiceState,
  renderServiceNodeArguments,
  startLocalRenderService,
} from '../render-service-host';
import { buildRenderPort, makeLazyRenderPort } from '../cli-render-mode';
import { fakeRenderHealth, freePort, writeFakeRenderService } from './helpers/fake-render-service';

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((done) => s.close(() => done()))),
  );
  await Promise.all(directories.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

/** A stand-in render service that answers `/health` and `/render`. */
function serve(): Promise<string> {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/health') {
      res.end(JSON.stringify(fakeRenderHealth()));
      return;
    }
    res.end(JSON.stringify({ ok: true, rendererId: 'test-renderer', views: [] }));
  });
  servers.push(server);
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () =>
      done(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
    );
  });
}

async function scratch(): Promise<string> {
  // An installation fixture must not inherit this checkout's hoisted renderer packages.
  const dir = await mkdtemp(join(tmpdir(), 'kiln-render-service-'));
  directories.push(dir);
  return dir;
}

describe('localRenderServiceState', () => {
  it('separates "not shipped" from "shipped but not installed"', async () => {
    const absent = join(await scratch(), 'nothing-here');
    expect(localRenderServiceState(absent)).toBe('not-packaged');

    const shipped = await scratch();
    await mkdir(join(shipped, 'src'), { recursive: true });
    await writeFile(join(shipped, 'src/server.mjs'), '// server\n');
    await writeFile(join(shipped, 'package.json'), '{"name":"kiln-render-service"}\n');
    // Missing optional native dependencies are distinct from an incompatible install.
    expect(localRenderServiceState(shipped)).toBe('dependencies-missing');

    await writeFakeRenderService(shipped);
    expect(localRenderServiceState(shipped)).toBe('ready');
  });

  it('finds hoisted packages and rejects their actual installed version after a change', async () => {
    const installation = await scratch();
    await writeFakeRenderService(installation);
    const nested = join(installation, 'renderer');
    await mkdir(join(nested, 'src'), { recursive: true });
    await writeFile(join(nested, 'src/server.mjs'), '// fixture');
    await writeFile(join(nested, 'package.json'), '{}');
    expect(localRenderServiceState(nested)).toBe('ready');
    await writeFile(
      join(installation, 'node_modules/webgpu/package.json'),
      JSON.stringify({ name: 'webgpu', version: '0.4.0', main: 'index.js' }),
    );
    expect(localRenderServiceState(nested)).toBe('dependencies-incompatible');
    await writeFile(
      join(installation, 'node_modules/webgpu/package.json'),
      JSON.stringify({ name: 'webgpu', version: '0.6.2', main: 'index.js' }),
    );
    expect(localRenderServiceState(nested)).toBe('ready');
  });
});

it('passes the Node import hook as a file URL on every platform', () => {
  const [flag, hook, server] = renderServiceNodeArguments(resolve('render-service'));
  expect(flag).toBe('--import');
  expect(hook).toStartWith('file:');
  expect(hook).toEndWith('/src/register-hooks.mjs');
  expect(server).toEndWith(join('render-service', 'src', 'server.mjs'));
});

describe('buildRenderPort with autoSpawn', () => {
  it('attaches nothing when the renderer is not installed, so a CPU-only machine reads as ordinary', async () => {
    // Pin a dead port: the host joins a listening service before it looks at the
    // install, so this test would attach one that happens to be running on 8000.
    const previous = process.env['KILN_RENDER_SERVICE_PORT'];
    process.env['KILN_RENDER_SERVICE_PORT'] = String(await freePort());
    try {
      const context = await buildRenderPort('auto', undefined, {
        autoSpawn: true,
        serviceDir: join(await scratch(), 'nothing-here'),
      });
      // Not merely "renders on the CPU" -- `viewRenderPort` must be ABSENT, because
      // that absence is what `describeDrawnBy` reads to call a CPU view ordinary.
      expect(context.viewRenderPort).toBeUndefined();
    } finally {
      if (previous === undefined) delete process.env['KILN_RENDER_SERVICE_PORT'];
      else process.env['KILN_RENDER_SERVICE_PORT'] = previous;
    }
  });

  it('leaves an explicit URL alone rather than starting anything', async () => {
    const url = await serve();
    let started = 0;
    const context = await buildRenderPort('auto', url, {
      autoSpawn: true,
      start: async () => {
        started += 1;
        return url;
      },
    });
    expect(context.viewRenderPort).toBeDefined();
    expect(started).toBe(0);
  });
});

describe('makeLazyRenderPort', () => {
  it('starts the service once, however many renders arrive', async () => {
    const url = await serve();
    let starts = 0;
    const port = makeLazyRenderPort(async () => {
      starts += 1;
      return url;
    });
    const glb = new Uint8Array([1, 2, 3]);
    await Promise.all([port({ glb }), port({ glb })]);
    await port({ glb });
    expect(starts).toBe(1);
  });

  it('says the renderer could not start, rather than failing silently', async () => {
    const port = makeLazyRenderPort(async () => {
      throw new Error('webgpu: no adapter');
    });
    // `captureViewsViaPort` turns a thrown port into `{ok:false, reason}` and
    // degrades to the CPU rasterizer, so the message here is what a model reads
    // as `degradeReason`. It has to name the renderer, not just the error.
    expect(port({ glb: new Uint8Array([1]) })).rejects.toThrow(/render service/i);
    expect(port({ glb: new Uint8Array([1]) })).rejects.toThrow(/no adapter/);
  });

  it('does not retry a start that already failed', async () => {
    let starts = 0;
    const port = makeLazyRenderPort(async () => {
      starts += 1;
      throw new Error('webgpu: no adapter');
    });
    const glb = new Uint8Array([1]);
    await port({ glb }).catch(() => undefined);
    await port({ glb }).catch(() => undefined);
    // A renderer that cannot start will not start on the next view either, and
    // paying a spawn per render would stall the loop it is meant to serve.
    expect(starts).toBe(1);
  });
});

describe('startLocalRenderService', () => {
  it('joins a renderer that is already listening, and does not take it down on the way out', async () => {
    // The documented way to drive a batch of agents is one shared GPU service.
    // If starting meant "start MY renderer" and stopping meant "stop whatever is
    // on the port", the second agent to finish would pull the renderer out from
    // under the others -- with no error anywhere, just flat-white materials.
    const url = await serve();
    const port = new URL(url).port;
    const previous = process.env['KILN_RENDER_SERVICE_PORT'];
    process.env['KILN_RENDER_SERVICE_PORT'] = port;
    try {
      // A directory with no renderer in it: if this returns, it joined rather
      // than started, because starting from here is impossible.
      const empty = resolve(import.meta.dir, '../../render-service');
      expect(await startLocalRenderService(empty)).toBe(`http://127.0.0.1:${port}`);

      const after = await fetch(new URL('/health', url));
      expect(((await after.json()) as { ok?: boolean }).ok).toBe(true);
    } finally {
      if (previous === undefined) delete process.env['KILN_RENDER_SERVICE_PORT'];
      else process.env['KILN_RENDER_SERVICE_PORT'] = previous;
    }
  });

  it('refuses to start what this installation cannot run, and says which of the two it is', async () => {
    const previous = process.env['KILN_RENDER_SERVICE_PORT'];
    // A port nothing is on, so the join probe fails and the install check decides.
    process.env['KILN_RENDER_SERVICE_PORT'] = String(await freePort());
    try {
      const shipped = await scratch();
      await mkdir(join(shipped, 'src'), { recursive: true });
      await writeFile(join(shipped, 'src/server.mjs'), '// server\n');
      await writeFile(join(shipped, 'package.json'), '{}\n');
      expect(startLocalRenderService(shipped)).rejects.toThrow(
        /reinstall the official Kiln package/,
      );
      expect(startLocalRenderService(join(shipped, 'absent'))).rejects.toThrow(/does not ship/);
    } finally {
      if (previous === undefined) delete process.env['KILN_RENDER_SERVICE_PORT'];
      else process.env['KILN_RENDER_SERVICE_PORT'] = previous;
    }
  });
});
