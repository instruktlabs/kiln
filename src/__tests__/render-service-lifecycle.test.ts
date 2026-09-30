import type { ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'bun:test';
import {
  inspectLocalRenderService,
  renderServiceSourceFingerprint,
  startLocalRenderService,
  terminateRenderService,
} from '../render-service-host';
import { buildRenderPort, describeRenderMode, makeLazyRenderPort } from '../cli-render-mode';
import {
  FAKE_RENDERER_ID,
  fakeRenderHealth,
  deadPid,
  exited,
  freePort,
  removeDirectory,
  spawnFakeRenderService,
  writeFakeRenderService,
} from './helpers/fake-render-service';
const servers: Server[] = [];
const children: ChildProcess[] = [];
const ownedPids: number[] = [];
const directories: string[] = [];
const oldPort = process.env.KILN_RENDER_SERVICE_PORT;
afterEach(async () => {
  for (const pid of ownedPids.splice(0)) {
    try {
      process.kill(pid);
    } catch {}
  }
  await Promise.all(
    children.splice(0).map(async (child) => {
      child.kill();
      await exited(child);
    }),
  );
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
  await Promise.all(directories.splice(0).map((dir) => removeDirectory(dir)));
  if (oldPort === undefined) delete process.env.KILN_RENDER_SERVICE_PORT;
  else process.env.KILN_RENDER_SERVICE_PORT = oldPort;
});
async function scratch(): Promise<string> {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(join(base, 'renderer-lifecycle-'));
  directories.push(dir);
  return dir;
}
async function installation() {
  const dir = await writeFakeRenderService(await scratch());
  const port = await freePort();
  process.env.KILN_RENDER_SERVICE_PORT = String(port);
  return { dir, port, url: `http://127.0.0.1:${port}` };
}
test('a host keeps its selected local socket when startup occurs after environment changes', async () => {
  const { dir, url } = await installation();
  const context = await buildRenderPort('auto', undefined, { serviceDir: dir });
  const other = `http://127.0.0.1:${await freePort()}`;
  process.env.KILN_RENDER_SERVICE_PORT = new URL(other).port;
  try {
    await context.viewRenderPort!({ glb: new Uint8Array([1]), viewDirs: [[1, 0, 0]], size: 128 });
    expect((await inspectLocalRenderService(url, dir)).kind).toBe('service');
    expect((await inspectLocalRenderService(other, dir)).kind).toBe('absent');
  } finally {
    for (const candidate of [url, other]) {
      const probe = await inspectLocalRenderService(candidate, dir);
      if (probe.kind === 'service') ownedPids.push(probe.instance.pid);
    }
  }
});
async function serve(value: unknown): Promise<string> {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify(
        req.url === '/health' ? value : { ok: true, rendererId: FAKE_RENDERER_ID, views: [] },
      ),
    );
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
test('source identity uses the exact service walk and ignores nested dependencies', async () => {
  const { fingerprintSourceDir } = await import('../../render-service/src/instance.mjs');
  const dir = await writeFakeRenderService(await scratch());
  expect(renderServiceSourceFingerprint(dir)).toBe(fingerprintSourceDir(join(dir, 'src')));
  const before = renderServiceSourceFingerprint(dir);
  await mkdir(join(dir, 'src/node_modules/ignored'), { recursive: true });
  await writeFile(join(dir, 'src/node_modules/ignored/index.js'), 'changed');
  expect(renderServiceSourceFingerprint(dir)).toBe(before);
  await writeFile(join(dir, 'src/extra.mjs'), 'export {};');
  expect(renderServiceSourceFingerprint(dir)).not.toBe(before);
  expect(renderServiceSourceFingerprint(join(dir, 'absent'))).toBeUndefined();
});
test('current services are shared regardless of initiating process lifetime', async () => {
  const { dir, port, url } = await installation();
  const child = await spawnFakeRenderService(dir, port, {
    RENDER_SERVICE_OWNER_PID: String(deadPid()),
  });
  children.push(child);
  expect(await inspectLocalRenderService(url, dir)).toMatchObject({
    kind: 'service',
    stale: false,
    instance: { mode: 'managed' },
  });
  expect(await startLocalRenderService(dir)).toBe(url);
  expect(child.exitCode).toBeNull();
});
test('stale services survive owner exit and both auto and gpu explicitly report incompatibility', async () => {
  const { dir, port, url } = await installation();
  const child = await spawnFakeRenderService(dir, port, {
    RENDER_SERVICE_OWNER_PID: String(deadPid()),
    FAKE_SOURCE_FINGERPRINT: `sha256:${'0'.repeat(64)}`,
  });
  children.push(child);
  await expect(startLocalRenderService(dir)).rejects.toThrow(/different source/);
  const context = await buildRenderPort('auto', undefined, { serviceDir: dir });
  expect(context.viewRenderPort).toBeUndefined();
  expect(describeRenderMode(context)).toContain('kiln service stop');
  await expect(buildRenderPort('gpu', undefined, { serviceDir: dir })).rejects.toThrow(
    /kiln service stop/,
  );
  expect((await inspectLocalRenderService(url, dir)).kind).toBe('service');
  expect(child.exitCode).toBeNull();
});
test('concurrent cold starts join one verified managed service on the shared socket', async () => {
  const { dir, url } = await installation();
  const journal = join(dir, 'startup.jsonl');
  const barrier = join(dir, 'release-startup');
  const environment = {
    ...process.env,
    FAKE_STARTUP_JOURNAL: journal,
    FAKE_STARTUP_BARRIER: barrier,
  };
  const pending = Promise.allSettled([
    startLocalRenderService(dir, environment),
    startLocalRenderService(dir, environment),
  ]);
  // Windows Start-Process may still be launching the second child when both
  // host calls return from the first child's health. Own both children first,
  // then release their listeners; teardown cannot leave a late launcher alive.
  const deadline = Date.now() + 10000;
  let starts: Array<{ pid: number }> = [];
  while (starts.length < 2 && Date.now() < deadline) {
    starts = await readFile(journal, 'utf8')
      .then((text) =>
        text
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line)),
      )
      .catch(() => []);
    if (starts.length < 2) await new Promise((done) => setTimeout(done, 20));
  }
  ownedPids.push(...starts.map((start) => start.pid));
  await writeFile(barrier, 'release');
  const outcomes = await pending;
  expect(starts).toHaveLength(2);
  const [one, two] = outcomes.map((outcome) => {
    if (outcome.status === 'rejected') throw outcome.reason;
    return outcome.value;
  });
  expect(one).toBe(url);
  expect(two).toBe(url);
  const probe = await inspectLocalRenderService(url, dir);
  expect(probe).toMatchObject({
    kind: 'service',
    stale: false,
    instance: { mode: 'managed', ownerPid: process.pid },
  });
});

test('a renderer that exits before health is reported as startup failure', async () => {
  const { dir } = await installation();
  await writeFile(join(dir, 'src/server.mjs'), 'process.exit(9);');
  const oldBudget = process.env.KILN_RENDER_SERVICE_STARTUP_MS;
  process.env.KILN_RENDER_SERVICE_STARTUP_MS = '10000';
  try {
    // A successful Windows launcher exit does not mean its renderer is alive.
    // Detect the native process exit instead of consuming the whole health budget.
    await expect(startLocalRenderService(dir)).rejects.toThrow(
      'render service exited during startup',
    );
  } finally {
    if (oldBudget === undefined) delete process.env.KILN_RENDER_SERVICE_STARTUP_MS;
    else process.env.KILN_RENDER_SERVICE_STARTUP_MS = oldBudget;
  }
});
test('explicit local stop rechecks identity and never signals a remote-reported pid', async () => {
  const { dir, port, url } = await installation();
  const child = await spawnFakeRenderService(dir, port);
  children.push(child);
  const probe = await inspectLocalRenderService(url, dir);
  expect(await terminateRenderService('http://remote.example:8000', probe, 20)).toBe(false);
  expect(child.exitCode).toBeNull();
  if (probe.kind !== 'service') throw new Error('fixture must be verified');
  expect(
    await terminateRenderService(
      url,
      { ...probe, instance: { ...probe.instance, startedAt: '2000-01-01T00:00:00.000Z' } },
      20,
    ),
  ).toBe(false);
  expect(await terminateRenderService(url, probe)).toBe(true);
  expect(await exited(child)).toBe(true);
});
test('local lazy clients restart after a refused socket without retrying a render failure', async () => {
  let starts = 0;
  const port = makeLazyRenderPort(async () => {
    starts++;
    return serve(fakeRenderHealth({ rendererId: FAKE_RENDERER_ID }));
  });
  expect((await port({ glb: new Uint8Array([1]) })).ok).toBe(true);
  await new Promise<void>((done) => servers[0]!.close(() => done()));
  expect((await port({ glb: new Uint8Array([1]) })).ok).toBe(true);
  expect(starts).toBe(2);
});
