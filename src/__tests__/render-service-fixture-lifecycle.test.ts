import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  freePort,
  writeFakeRenderService,
  exited,
  removeDirectory,
} from './helpers/fake-render-service';
import { inspectLocalRenderService } from '../render-service-host';

test('a gated fake renderer announces its owned PID before exposing a health listener', async () => {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  const dir = await writeFakeRenderService(await mkdtemp(join(base, 'renderer-gated-fixture-')));
  const port = await freePort();
  const journal = join(dir, 'starts.jsonl');
  const barrier = join(dir, 'release-startup');
  const child = spawn('node', [join(dir, 'src/server.mjs')], {
    cwd: dir,
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      FAKE_STARTUP_JOURNAL: journal,
      FAKE_STARTUP_BARRIER: barrier,
    },
    stdio: 'ignore',
  });
  try {
    const deadline = Date.now() + 5000;
    let starts: { pid: number }[] = [];
    let probe = await inspectLocalRenderService(`http://127.0.0.1:${port}`, dir);
    while (!starts.length && probe.kind === 'absent' && Date.now() < deadline) {
      starts = await readFile(journal, 'utf8')
        .then((text) =>
          text
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line)),
        )
        .catch(() => []);
      probe = await inspectLocalRenderService(`http://127.0.0.1:${port}`, dir);
      if (!starts.length && probe.kind === 'absent')
        await new Promise((done) => setTimeout(done, 20));
    }
    expect(probe.kind).toBe('absent');
    expect(starts).toHaveLength(1);
    expect(starts[0]!.pid).toBe(child.pid!);
    await writeFile(barrier, 'release');
    while (probe.kind === 'absent' && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 20));
      probe = await inspectLocalRenderService(`http://127.0.0.1:${port}`, dir);
    }
    expect(probe.kind).toBe('service');
  } finally {
    child.kill();
    await exited(child);
    await removeDirectory(dir);
  }
});
