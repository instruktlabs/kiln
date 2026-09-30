import { expect, it } from 'bun:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { writeFakeRenderService } from './helpers/fake-render-service';

/** A port nothing is listening on right now. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function listening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

it('CLI exits promptly while its verified shared renderer survives for other clients', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'cli-service-'));
  let servicePid: number | undefined;
  try {
    const built = await Bun.build({
      entrypoints: [resolve(import.meta.dir, '../cli.ts')],
      target: 'node',
      packages: 'external',
      outdir: directory,
      naming: 'cli.mjs',
    });
    expect(built.success).toBe(true);

    const service = await writeFakeRenderService(join(directory, 'render-service'));
    const port = await freePort();
    expect(await listening(port)).toBe(false);

    // Metalness above zero is what routes a scene to the render port.
    await writeFile(
      join(directory, 'source.js'),
      "const meta={name:'LifecycleFixture',category:'prop'};function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial(0xc0c0c0,{metalness:0.9,roughness:0.3}),{parent:root});return root;}",
    );
    const env: Record<string, string | undefined> = {
      ...process.env,
      KILN_EVALUATOR_MODE: 'in-process',
      KILN_BUILD_CACHE: 'off',
      KILN_WORKSPACE: directory,
      KILN_PROGRAM_STORE: join(directory, 'programs'),
      KILN_RENDER_SERVICE_DIR: service,
      KILN_RENDER_SERVICE_PORT: String(port),
    };
    delete env['KILN_RENDER'];
    delete env['KILN_RENDER_PORT_URL'];
    const started = Date.now();
    const run = Bun.spawnSync(
      [
        'node',
        join(directory, 'cli.mjs'),
        'render',
        'source.js',
        '--render',
        'gpu',
        '--views',
        'sheet.png',
      ],
      { cwd: directory, env, stdout: 'pipe', stderr: 'pipe', timeout: 45_000 },
    );
    const elapsed = Date.now() - started;
    // The command's own work takes seconds. Hitting the timeout is the hang.
    expect({ exitCode: run.exitCode, elapsed, stderr: run.stderr.toString() }).toMatchObject({
      exitCode: 0,
    });
    expect(elapsed).toBeLessThan(40_000);
    expect(run.stdout.toString()).toContain('fake-renderer');
    expect(await readdir(directory)).toContain('sheet.png');
    expect(await listening(port)).toBe(true);
    const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
      instance: { pid: number; mode: string };
    };
    servicePid = health.instance.pid;
    expect(health.instance.mode).toBe('managed');
  } finally {
    if (servicePid) {
      try {
        process.kill(servicePid);
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);

it.skipIf(process.platform !== 'win32')(
  'a Windows shell pipeline closes while its shared renderer stays alive',
  async () => {
    const directory = await mkdtemp(
      join(resolve(import.meta.dir, '../../tmp'), "cli-pipeline O'Brien-"),
    );
    let servicePid: number | undefined;
    let child: ReturnType<typeof spawn> | undefined;
    try {
      const built = await Bun.build({
        entrypoints: [resolve(import.meta.dir, '../cli.ts')],
        target: 'node',
        packages: 'external',
        outdir: directory,
        naming: 'cli.mjs',
      });
      expect(built.success).toBe(true);
      const service = await writeFakeRenderService(join(directory, 'render-service'));
      const port = await freePort();
      await writeFile(
        join(directory, 'source.js'),
        "function build(){const root=createRoot('Root');createPart('Body',boxGeo(1,1,1),gameMaterial(0x808080,{metalness:0.8}),{parent:root});return root;}",
      );
      const literal = (s: string) => `'${s.replaceAll("'", "''")}'`;
      const command = `& node ${literal(join(directory, 'cli.mjs'))} render source.js --render gpu --views sheet.png 2>&1 | Select-Object -First 60`;
      const env: Record<string, string | undefined> = {
        ...process.env,
        KILN_EVALUATOR_MODE: 'in-process',
        KILN_BUILD_CACHE: 'off',
        KILN_WORKSPACE: directory,
        KILN_PROGRAM_STORE: join(directory, 'programs'),
        KILN_RENDER_SERVICE_DIR: service,
        KILN_RENDER_SERVICE_PORT: String(port),
      };
      delete env.KILN_RENDER;
      delete env.KILN_RENDER_PORT_URL;
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(command, 'utf16le').toString('base64'),
        ],
        { cwd: directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout!.on('data', (b) => (output += b.toString()));
      child.stderr!.on('data', (b) => (output += b.toString()));
      const exited = new Promise<number | null>((done) => child!.once('exit', done));
      const closed = new Promise<boolean>((done) => child!.once('close', () => done(true)));
      const exitDeadline = setTimeout(() => child?.kill(), 30000);
      expect(await exited).toBe(0);
      clearTimeout(exitDeadline);
      expect(output).toContain('fake-renderer');
      const health = (await (await fetch(`http://127.0.0.1:${port}/health`)).json()) as {
        instance: { pid: number; mode: string };
      };
      servicePid = health.instance.pid;
      expect(health.instance.mode).toBe('managed');
      let drainDeadline: ReturnType<typeof setTimeout> | undefined;
      const pipesClosed = await Promise.race([
        closed,
        new Promise<boolean>((done) => {
          drainDeadline = setTimeout(() => done(false), 2000);
        }),
      ]);
      clearTimeout(drainDeadline);
      expect(pipesClosed).toBe(true);
      expect(await listening(port)).toBe(true);
    } finally {
      if (servicePid)
        try {
          process.kill(servicePid);
        } catch {}
      child?.stdout?.destroy();
      child?.stderr?.destroy();
      child?.kill();
      child?.unref();
      await new Promise((done) => setTimeout(done, 100));
      await rm(directory, { recursive: true, force: true });
    }
  },
  90000,
);
