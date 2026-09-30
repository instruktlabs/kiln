/**
 * A stand-in for `render-service/`: what `localRenderServiceState` needs to
 * call it ready, plus a server that answers `/health` like the real one and
 * `/render` with one flat PNG per requested view. Tests that need a render
 * service they can spawn, kill and inspect as a real process share this file,
 * so the health contract the host reads is written down once.
 *
 * The PNG passes the port's validation; the pixels do not matter, the process
 * does. `/health` reports the same `instance` block the real service does, with
 * the source fingerprint taken from `FAKE_SOURCE_FINGERPRINT` so a test can
 * make the process look current or stale without editing files.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  compatibilityFingerprint,
  RENDER_SERVICE_DEPENDENCIES,
  RENDER_SERVICE_PROTOCOL,
  REQUIRED_RENDER_CAPABILITIES,
} from '../../../render-service/src/build-identity.mjs';
import {
  packagedRendererSourceFingerprint,
  type RenderServiceHealth,
} from '../../render-service-client';

/** One current protocol fixture for every host transport test. */
export function fakeRenderHealth(
  overrides: Partial<RenderServiceHealth> = {},
): RenderServiceHealth {
  const sourceFingerprint =
    overrides.instance?.sourceFingerprint ?? packagedRendererSourceFingerprint()!;
  const compatibility = {
    version: 'kiln.render-service-build.v1' as const,
    sourceFingerprint,
    dependencies: { ...RENDER_SERVICE_DEPENDENCIES },
    fingerprint: compatibilityFingerprint({
      sourceFingerprint,
      dependencies: RENDER_SERVICE_DEPENDENCIES,
    }),
  };
  return {
    ok: true,
    authRequired: false,
    protocol: RENDER_SERVICE_PROTOCOL,
    rendererId: 'test-renderer',
    instance: {
      version: 'kiln.render-service-instance.v2',
      pid: process.pid,
      ownerPid: null,
      startedAt: '2026-09-21T00:00:00.000Z',
      sourceDir: '/fixture/render-service',
      sourceFingerprint,
      mode: 'manual',
      idleTimeoutMs: null,
    },
    compatibility,
    capabilities: [...REQUIRED_RENDER_CAPABILITIES],
    captureIdentity: {
      version: 'kiln.capture-producer.v1',
      fingerprint: compatibility.fingerprint,
      instanceId: 'fixture-one',
    },
    ...overrides,
  };
}

export const FAKE_RENDERER_ID = 'fake-renderer';

export const FAKE_SERVER = `
import { createServer } from 'node:http';
import { crc32, deflateSync } from 'node:zlib';
import { appendFileSync, existsSync } from 'node:fs';
import { compatibilityFingerprint, RENDER_SERVICE_DEPENDENCIES, RENDER_SERVICE_PROTOCOL, REQUIRED_RENDER_CAPABILITIES } from ${JSON.stringify(pathToFileURL(join(import.meta.dir, '../../../render-service/src/build-identity.mjs')).href)};
import { fingerprintSourceDir } from ${JSON.stringify(pathToFileURL(join(import.meta.dir, '../../../render-service/src/instance.mjs')).href)};
import { join } from 'node:path';
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};
const png = (size) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(size * (1 + size * 3), 0x80);
  for (let y = 0; y < size; y++) raw[y * (1 + size * 3)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
const ownerPid = Number(process.env.RENDER_SERVICE_OWNER_PID);
const instance = {
  version: 'kiln.render-service-instance.v2',
  pid: process.pid,
  ownerPid: Number.isInteger(ownerPid) && ownerPid > 0 ? ownerPid : null,
  startedAt: new Date().toISOString(),
  sourceDir: process.env.FAKE_SOURCE_DIR ?? process.cwd(),
  sourceFingerprint: process.env.FAKE_SOURCE_FINGERPRINT ?? fingerprintSourceDir(join(process.cwd(), 'src')),
  mode: process.env.RENDER_SERVICE_MODE ?? (ownerPid ? 'managed' : 'manual'),
  idleTimeoutMs: (process.env.RENDER_SERVICE_MODE === 'managed' || ownerPid) ? 300000 : null,
};
const compatibility = { version: 'kiln.render-service-build.v1', sourceFingerprint: instance.sourceFingerprint, dependencies: RENDER_SERVICE_DEPENDENCIES,
  fingerprint: compatibilityFingerprint({ sourceFingerprint: instance.sourceFingerprint, dependencies: RENDER_SERVICE_DEPENDENCIES }) };
// A test-owned gate lets concurrent launchers all become observable before any
// health reply can satisfy both hosts. It is never a production service registry.
if (process.env.FAKE_STARTUP_JOURNAL) appendFileSync(process.env.FAKE_STARTUP_JOURNAL,
  JSON.stringify({pid:process.pid,startedAt:instance.startedAt})+'\\n');
if (process.env.FAKE_STARTUP_BARRIER) {
  const deadline=Date.now()+10000;
  while (!existsSync(process.env.FAKE_STARTUP_BARRIER)) {
    if (Date.now()>=deadline) process.exit(91);
    await new Promise(done=>setTimeout(done,10));
  }
}
createServer((req, res) => {
  let body = '';
  req.on('data', (piece) => {
    body += piece;
  });
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, authRequired: false, rendererId: '${FAKE_RENDERER_ID}', instance, protocol: RENDER_SERVICE_PROTOCOL,
        compatibility, capabilities: REQUIRED_RENDER_CAPABILITIES, captureIdentity: { version: 'kiln.capture-producer.v1', fingerprint: compatibility.fingerprint, instanceId: String(process.pid) } }));
      return;
    }
    const request = body ? JSON.parse(body) : {};
    const count = (request.views ?? request.cameras ?? []).length;
    const size = request.size ?? request.width ?? 384;
    const views = Array.from({ length: count }, () => png(size).toString('base64'));
    res.end(JSON.stringify({ ok: true, rendererId: '${FAKE_RENDERER_ID}', views }));
  });
}).listen(Number(process.env.PORT), process.env.HOST ?? '127.0.0.1', () => {
  if (process.env.FAKE_ANNOUNCE) console.log('listening');
});
`;

/** A port nothing is listening on right now. */
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

/** A pid that belonged to a process which has already exited. */
export function deadPid(): number {
  const gone = spawnSync('node', ['-e', '']);
  if (!gone.pid) throw new Error('could not spawn a throwaway process');
  return gone.pid;
}

/**
 * Spawn the fake service under `dir` as a real process on `port`, resolved once
 * it is listening. The caller owns the child and kills it in its afterEach.
 */
export async function spawnFakeRenderService(
  dir: string,
  port: number,
  env: Record<string, string> = {},
): Promise<ChildProcess> {
  const child = spawn('node', [join(dir, 'src/server.mjs')], {
    cwd: dir,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', FAKE_ANNOUNCE: '1', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((done, fail) => {
    child.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening')) done();
    });
    child.once('exit', (code) => fail(new Error(`fake service exited with ${code}`)));
  });
  return child;
}

/** Resolve once `child` has exited: a kill is synchronous, the exit event is not. */
export function exited(child: ChildProcess, timeoutMs = 5_000): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((done) => {
    const timer = setTimeout(() => done(false), timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      done(true);
    });
  });
}

/** Lay the fake service out under `dir` so the host reads it as installed. */
export async function writeFakeRenderService(dir: string): Promise<string> {
  await mkdir(join(dir, 'src'), { recursive: true });
  for (const [name, version] of Object.entries(RENDER_SERVICE_DEPENDENCIES)) {
    const pkg = join(dir, 'node_modules', name);
    await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
    await writeFile(join(pkg, 'index.js'), 'module.exports = {};');
  }
  await writeFile(join(dir, 'package.json'), '{"name":"fake-render-service"}');
  await writeFile(join(dir, 'src/register-hooks.mjs'), 'export {};');
  await writeFile(join(dir, 'src/server.mjs'), FAKE_SERVER);
  return dir;
}

/**
 * Remove a directory a fake service ran in. On Windows the directory stays
 * locked (EBUSY) until the process that had it as its cwd has fully exited,
 * which happens some milliseconds after `kill()` returns; so retry for a while
 * instead of failing the teardown of a test that already passed.
 */
export async function removeDirectory(dir: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
      if (!retryable || Date.now() >= deadline) throw error;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
