import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createLocalToolContext } from '../local-runtime';
import {
  type EvaluatorProcessLaunch,
  renderGLBViaProcessLaunch,
  sanitizedEvaluatorEnv,
} from './subprocess';

const repo = resolve(import.meta.dir, '../..');
const BOX = `const meta = { name: 'DeadlineBox' };
function build() {
  const root = createRoot('DeadlineBox');
  createPart('Body', boxGeo(1, 1, 1), gameMaterial('#808080'), { parent: root });
  return root;
}`;
const NEVER = 'async function build(){ await new Promise(() => {}); }';

/**
 * The fault needs a build still running over a minute in, and a minute per run is too dear for
 * this suite, so the real worker starts with that time already gone: its preload takes this much
 * off every timer it arms. A box's export yields to the event loop within milliseconds, so the
 * worker's own deadline gets its turn exactly as it does when a long build first yields.
 */
const WORKER_CLOCK_AHEAD_MS = 90_000;
/** How soon the host's limit fires once a test has found the timer that carries it. */
const LIMIT_FIRES_AFTER_MS = 1_000;

let root: string;
let preload: string;

beforeAll(async () => {
  await mkdir(join(repo, 'tmp'), { recursive: true });
  root = await mkdtemp(join(repo, 'tmp/worker-clock-'));
  preload = join(root, 'clock-ahead.mjs');
  await writeFile(
    preload,
    `const setTimeoutOnRealClock = globalThis.setTimeout;
globalThis.setTimeout = (callback, ms = 0, ...args) =>
  setTimeoutOnRealClock(callback, Math.max(0, ms - ${WORKER_CLOCK_AHEAD_MS}), ...args);`,
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const sourceWorker = (): EvaluatorProcessLaunch => ({
  command: process.execPath,
  args: ['--preload', preload, join(import.meta.dir, 'worker.ts')],
  env: sanitizedEvaluatorEnv(),
});
// What the CLI and MCP server start. `bun run test` refuses a stale dist/.
const packagedWorker = (): EvaluatorProcessLaunch => ({
  command: 'node',
  args: ['--import', pathToFileURL(preload).href, join(repo, 'dist/evaluator-worker.mjs')],
  env: sanitizedEvaluatorEnv(),
});

/**
 * Runs `work` with the host's timer for `limitMs` shortened and every other timer left alone. A
 * host that armed any other delay is left waiting on the worker, and runs out the test's budget.
 */
async function endsAtLimit(limitMs: number, work: () => Promise<unknown>): Promise<void> {
  const setTimeoutOnRealClock = globalThis.setTimeout;
  const clock = spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) =>
    setTimeoutOnRealClock(
      callback,
      ms === limitMs ? LIMIT_FIRES_AFTER_MS : ms,
      ...args,
    )) as unknown as typeof setTimeout);
  const started = performance.now();
  try {
    await expect(work()).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
  } finally {
    clock.mockRestore();
  }
  // Sooner would mean the worker's own clock ended the build, not the limit that was set.
  expect(performance.now() - started).toBeGreaterThanOrEqual(LIMIT_FIRES_AFTER_MS - 50);
}

describe('the host owns the evaluator deadline', () => {
  // About 1 s per worker on a quiet machine; the worker's own timer leaves 30 s of real time.
  test.each([
    ['the source worker on Bun', sourceWorker],
    ['the packaged worker on Node', packagedWorker],
  ])(
    '%s finishes a build past the default deadline under a raised limit',
    async (_name, launch) => {
      const rendered = await renderGLBViaProcessLaunch(BOX, {}, { deadlineMs: 120_000 }, launch());
      expect(rendered.glb.byteLength).toBeGreaterThan(0);
    },
    30_000,
  );

  test('a raised limit still ends the worker at that limit', async () => {
    await endsAtLimit(90_000, () =>
      renderGLBViaProcessLaunch(NEVER, {}, { deadlineMs: 90_000 }, packagedWorker()),
    );
  });

  test('a host naming no limit still ends the worker at the default', async () => {
    await endsAtLimit(60_000, () => renderGLBViaProcessLaunch(NEVER, {}, {}, packagedWorker()));
  });

  test('KILN_EVALUATOR_TIMEOUT_MS reaches the timer that ends the worker', async () => {
    const local = createLocalToolContext({}, { KILN_EVALUATOR_TIMEOUT_MS: '90000' });
    await endsAtLimit(90_000, () => local.evaluatorPort!.render(NEVER));
  });
});
