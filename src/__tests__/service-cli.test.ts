/** Local renderer status, explicit start and stop; retired prune never mutates shared lifetime. */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { serviceMain } from '../service-cli';
import { inspectLocalRenderService, renderServiceSourceFingerprint } from '../render-service-host';
import {
  deadPid,
  exited,
  freePort,
  removeDirectory,
  spawnFakeRenderService,
  writeFakeRenderService,
} from './helpers/fake-render-service';

const children: ChildProcess[] = [];
/** Services `kiln service start` launched detached; the test kills them by pid. */
const ownedPids: number[] = [];
const servers: Server[] = [];
const directories: string[] = [];
const saved = {
  port: process.env['KILN_RENDER_SERVICE_PORT'],
  dir: process.env['KILN_RENDER_SERVICE_DIR'],
};

afterEach(async () => {
  for (const pid of ownedPids.splice(0)) {
    try {
      process.kill(pid);
    } catch {}
  }
  await Promise.all(
    children.splice(0).map(async (child) => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited(child);
    }),
  );
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((done) => {
          s.closeAllConnections();
          s.close(() => done());
        }),
    ),
  );
  await Promise.all(directories.splice(0).map((d) => removeDirectory(d)));
  for (const [key, value] of [
    ['KILN_RENDER_SERVICE_PORT', saved.port],
    ['KILN_RENDER_SERVICE_DIR', saved.dir],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function installation(): Promise<{ dir: string; port: number }> {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const dir = await writeFakeRenderService(await mkdtemp(join(base, 'service-cli-')));
  directories.push(dir);
  const port = await freePort();
  process.env['KILN_RENDER_SERVICE_PORT'] = String(port);
  process.env['KILN_RENDER_SERVICE_DIR'] = dir;
  return { dir, port };
}

async function run(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await serviceMain(argv, {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

/** A listener on a fresh loopback port, configured as the shared local socket. */
async function occupy(handler: Parameters<typeof createServer>[1]): Promise<number> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as AddressInfo).port;
  process.env['KILN_RENDER_SERVICE_PORT'] = String(port);
  return port;
}

async function alive(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1_000) }))
      .ok;
  } catch {
    return false;
  }
}

describe('kiln service', () => {
  it('prints usage without a command and refuses one it does not know', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run([])).out).toContain('kiln service status');
    const unknown = await run(['restart']);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain('unknown service command');
  });

  it('status says nothing is listening, and where it looked', async () => {
    const { port } = await installation();
    const { code, out } = await run(['status']);
    expect(code).toBe(0);
    expect(out).toContain(`http://127.0.0.1:${port}`);
    expect(out).toContain('listening        no');
    expect(out).toContain('installation     ready');
  });

  it('status --json prints the same facts as one receipt; start and stop refuse --json', async () => {
    const { dir, port } = await installation();
    for (const command of ['status', 'reprobe']) {
      const { code, out, err } = await run([command, '--json']);
      // Exit codes are unchanged: reprobe still fails while nothing is listening.
      expect(code).toBe(command === 'status' ? 0 : 1);
      expect(err).toBe('');
      expect(JSON.parse(out)).toEqual({
        url: `http://127.0.0.1:${port}`,
        installation: { state: 'ready', directory: dir },
        listener: { kind: 'absent' },
      });
    }
    for (const command of ['start', 'stop']) {
      const refused = await run([command, '--json']);
      expect(refused.code).toBe(2);
      expect(refused.err).toContain('service status|reprobe');
      expect(refused.err).toContain('export');
    }
  });

  it('status names the process, its owner and whether its source is current', async () => {
    const { dir, port } = await installation();
    const child = await spawnFakeRenderService(dir, port, {
      FAKE_SOURCE_FINGERPRINT: renderServiceSourceFingerprint(dir)!,
    });
    children.push(child);
    const { out } = await run(['status']);
    expect(out).toContain('listening        yes  fake-renderer');
    expect(out).toContain(`pid ${child.pid}, started by hand`);
    expect(out).toContain('source           current');
    const receipt = JSON.parse((await run(['status', '--json'])).out);
    expect(receipt.listener).toMatchObject({
      kind: 'service',
      rendererId: 'fake-renderer',
      pid: child.pid,
      ownerPid: null,
      source: 'current',
    });
  }, 30_000);

  it('retired prune reports its replacement while explicit stop stops a verified local process', async () => {
    const { dir, port } = await installation();
    const current = await spawnFakeRenderService(dir, port, {
      FAKE_SOURCE_FINGERPRINT: renderServiceSourceFingerprint(dir)!,
    });
    children.push(current);
    const kept = await run(['prune']);
    expect(kept.code).toBe(2);
    expect(kept.err).toContain('was removed');
    expect(await alive(port)).toBe(true);

    const stopped = await run(['stop']);
    expect(stopped.code).toBe(0);
    expect(stopped.out).toContain(`pid ${current.pid}`);
    expect(await alive(port)).toBe(false);

    const owned = await spawnFakeRenderService(dir, port, {
      RENDER_SERVICE_OWNER_PID: String(process.pid),
      FAKE_SOURCE_FINGERPRINT: `sha256:${'0'.repeat(64)}`,
    });
    children.push(owned);
    const keptOwned = await run(['prune']);
    expect(keptOwned.code).toBe(2);
    expect(keptOwned.err).toContain('was removed');
    expect(keptOwned.err).toContain('shared renderer');
    expect(await alive(port)).toBe(true);
  }, 30_000);

  it('retired prune never stops a shared renderer after its initiating host exits', async () => {
    const { dir, port } = await installation();
    const orphan = await spawnFakeRenderService(dir, port, {
      RENDER_SERVICE_OWNER_PID: String(deadPid()),
      FAKE_SOURCE_FINGERPRINT: `sha256:${'0'.repeat(64)}`,
    });
    children.push(orphan);
    const { code, err } = await run(['prune']);
    expect(code).toBe(2);
    expect(err).toContain('was removed');
    expect(await alive(port)).toBe(true);
  }, 30_000);

  it('refuses to stop something that is not a render service', async () => {
    await installation();
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>');
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as AddressInfo).port;
    process.env['KILN_RENDER_SERVICE_PORT'] = String(port);
    const { code, err } = await run(['stop']);
    expect(code).toBe(1);
    expect(err).toContain('not a render service');
    expect(err).toContain('KILN_RENDER_SERVICE_PORT');
    expect(server.listening).toBe(true);
  });

  it('start launches a managed renderer, reports its identity, and joins a current one', async () => {
    const { port } = await installation();
    const url = `http://127.0.0.1:${port}`;
    const started = await run(['start']);
    const probe = await inspectLocalRenderService(url);
    if (probe.kind === 'service') ownedPids.push(probe.instance.pid);
    expect(started.err).toBe('');
    expect(started.code).toBe(0);
    if (probe.kind !== 'service') throw new Error(`nothing is listening on ${url}`);
    expect(probe.stale).toBe(false);
    const { pid } = probe.instance;
    expect(started.out).toContain(`render service   ${url}`);
    expect(started.out).toContain(`port             ${port}`);
    expect(started.out).toContain(`started          managed renderer, pid ${pid}`);
    expect(started.out).toContain('listening        yes  fake-renderer');
    expect(started.out).toContain(`process          pid ${pid}, started by session ${process.pid}`);
    expect(started.out).toContain('lifetime         managed, idle timeout 300000ms');
    expect(started.out).toContain(`build            ${probe.health.compatibility.fingerprint}`);

    const joined = await run(['start']);
    expect(joined.err).toBe('');
    expect(joined.code).toBe(0);
    expect(joined.out).toContain(`already running  pid ${pid}; nothing was started`);
    const after = await inspectLocalRenderService(url);
    expect(after.kind === 'service' && after.instance.pid).toBe(pid);
  });

  it('start never replaces a listener it cannot join, and needs a ready installation', async () => {
    const { dir, port } = await installation();
    const stale = await spawnFakeRenderService(dir, port, {
      FAKE_SOURCE_FINGERPRINT: `sha256:${'0'.repeat(64)}`,
    });
    children.push(stale);
    const refusedStale = await run(['start']);
    expect(refusedStale.code).toBe(1);
    expect(refusedStale.err).toContain(`pid ${stale.pid}`);
    expect(refusedStale.err).toContain('runs different source');
    expect(refusedStale.err).toContain('nothing was started');
    expect(stale.exitCode).toBeNull();
    expect(await alive(port)).toBe(true);

    const foreignPort = await occupy((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>');
    });
    const refusedForeign = await run(['start']);
    expect(refusedForeign.code).toBe(1);
    expect(refusedForeign.err).toContain(`port ${foreignPort} is in use`);
    expect(refusedForeign.err).toContain('nothing was started');

    // A listener that never answers is unknown, not a busy renderer to replace.
    await occupy(() => {});
    const refusedUnknown = await run(['start']);
    expect(refusedUnknown.code).toBe(1);
    expect(refusedUnknown.err).toContain('is unknown');
    expect(refusedUnknown.err).toContain('nothing was started');
    expect(servers.every((server) => server.listening)).toBe(true);

    const empty = join(dir, 'not-an-installation');
    await mkdir(empty);
    process.env['KILN_RENDER_SERVICE_DIR'] = empty;
    const freshPort = await freePort();
    process.env['KILN_RENDER_SERVICE_PORT'] = String(freshPort);
    const refusedSetup = await run(['start']);
    expect(refusedSetup.code).toBe(1);
    expect(refusedSetup.err).toContain(`does not ship ${empty}`);
    expect(refusedSetup.err).toContain('nothing was started');
    expect(await alive(freshPort)).toBe(false);
  });
});
