import { test, expect } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderGLBViaProcessLaunch, sanitizedEvaluatorEnv } from './subprocess';
const result = JSON.stringify({
  version: 'kiln.evaluator.result.v2',
  requestId: 'render-1',
  ok: false,
  error: { code: 'EXECUTION_REJECTED', message: 'Generated asset execution was rejected.' },
});
/**
 * A source far larger than any OS pipe buffer, so the worker's `process.stdin.destroy()`
 * lands mid-write and the close race is real. The size is the instrument here, never the
 * subject: it stays under the transport's own source budget, which refuses an oversize
 * request before any worker launches (#299).
 */
const UNFLUSHABLE_SOURCE = `//${'x'.repeat(400_000)}`;
const launch = (output: string, exit = 0) => ({
  command: process.execPath,
  args: [
    '-e',
    `const fs=require('node:fs');process.stdin.destroy();try{fs.closeSync(0)}catch{}setTimeout(()=>{fs.writeFileSync(3,${JSON.stringify(output)});process.exit(${exit});},40);`,
  ],
  env: sanitizedEvaluatorEnv(),
});
test('a worker closing its input before a valid rejection still settles its complete fd3 envelope', async () => {
  await expect(
    renderGLBViaProcessLaunch(UNFLUSHABLE_SOURCE, {}, { deadlineMs: 5000 }, launch(result)),
  ).rejects.toMatchObject({ code: 'EXECUTION_REJECTED' });
}, 10000);
test('input-close races never accept incomplete output or a failed worker exit', async () => {
  await expect(
    renderGLBViaProcessLaunch(UNFLUSHABLE_SOURCE, {}, { deadlineMs: 5000 }, launch('{')),
  ).rejects.toMatchObject({ code: 'PROTOCOL_ERROR' });
  await expect(
    renderGLBViaProcessLaunch(UNFLUSHABLE_SOURCE, {}, { deadlineMs: 5000 }, launch(result, 1)),
  ).rejects.toMatchObject({ code: 'WORKER_FAILED' });
}, 15000);

test('input-close errors retain deadline and cancellation authority', async () => {
  const hanging = {
    command: process.execPath,
    args: ['-e', 'process.stdin.destroy();setInterval(()=>{},1000);'],
    env: sanitizedEvaluatorEnv(),
  };
  await expect(
    renderGLBViaProcessLaunch(UNFLUSHABLE_SOURCE, {}, { deadlineMs: 500 }, hanging),
  ).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300);
  try {
    await expect(
      renderGLBViaProcessLaunch(
        UNFLUSHABLE_SOURCE,
        {},
        { deadlineMs: 5000, signal: controller.signal },
        hanging,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  } finally {
    clearTimeout(timer);
  }
}, 10000);

test('a missing worker file names the rebuild, whatever size the request was', async () => {
  const missing = join(tmpdir(), 'kiln-missing-worker', 'evaluator-worker.mjs');
  for (const source of ['small', UNFLUSHABLE_SOURCE]) {
    const failure = await renderGLBViaProcessLaunch(
      source,
      {},
      { deadlineMs: 15000 },
      {
        command: process.execPath,
        args: ['-e', 'process.exit(1)'],
        env: sanitizedEvaluatorEnv(),
        workerFile: missing,
      },
    ).catch((error) => error);
    expect(failure.code).toBe('WORKER_FAILED');
    expect(failure.message).toContain('evaluator-worker.mjs is missing');
    expect(failure.message).toContain('bun run build:runtime');
    expect(failure.message).toContain('restart');
    expect(failure.message).not.toContain(tmpdir());
  }
}, 30000); // Two process launches.

test('a worker that exists keeps the plain failure', async () => {
  const failure = await renderGLBViaProcessLaunch(
    'small',
    {},
    { deadlineMs: 15000 },
    {
      command: process.execPath,
      args: ['-e', 'process.exit(1)'],
      env: sanitizedEvaluatorEnv(),
      workerFile: process.execPath,
    },
  ).catch((error) => error);
  expect(failure.code).toBe('WORKER_FAILED');
  expect(failure.message).toBe('Evaluator worker failed.');
}, 20000);
