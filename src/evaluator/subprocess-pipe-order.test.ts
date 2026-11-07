import { expect, test, spyOn } from 'bun:test';
import * as childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { renderGLBViaProcessLaunch } from './subprocess';

const envelope = JSON.stringify({
  version: 'kiln.evaluator.result.v2',
  requestId: 'render-1',
  ok: false,
  error: { code: 'EXECUTION_REJECTED', message: 'Generated asset execution was rejected.' },
});

async function exercise(
  opts: {
    stream?: 'stdin' | 'fd3' | 'stderr';
    errno?: string;
    response?: string;
    exit?: number | null;
    cancel?: boolean;
    limit?: number;
    platform?: string;
    bun?: boolean;
  } = {},
) {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    killed: boolean;
    kill: () => void;
    stdin: EventEmitter & { end: () => void };
    stderr: EventEmitter;
    stdio: Array<EventEmitter | null>;
  };
  child.pid = 999999;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  child.stdin = Object.assign(new EventEmitter(), { end: () => {} });
  child.stderr = new EventEmitter();
  const fd3 = new EventEmitter();
  child.stdio = [child.stdin, null, child.stderr, fd3];
  const controller = new AbortController();
  child.stdin.end = () =>
    queueMicrotask(() => {
      fd3.emit('data', Buffer.from(opts.response ?? envelope));
      (opts.stream === 'stdin' ? child.stdin : opts.stream === 'stderr' ? child.stderr : fd3).emit(
        'error',
        Object.assign(new Error('private pipe detail'), { code: opts.errno ?? 'EBADF' }),
      );
      if (opts.cancel) controller.abort();
      else if (opts.exit !== null) queueMicrotask(() => child.emit('close', opts.exit ?? 0));
    });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  const bun = Object.getOwnPropertyDescriptor(process.versions, 'bun');
  Object.defineProperty(process, 'platform', { ...platform, value: opts.platform ?? 'win32' });
  if (opts.bun === false) Reflect.deleteProperty(process.versions, 'bun');
  const spawn = spyOn(childProcess, 'spawn').mockImplementation(
    (() => child) as unknown as typeof childProcess.spawn,
  );
  try {
    const result = await renderGLBViaProcessLaunch(
      'source stays private',
      {},
      { deadlineMs: 20, signal: controller.signal, maxResponseBytes: opts.limit },
      { command: 'fake-worker', args: [], env: {} },
    ).catch((error) => error);
    return { result, killed: child.killed };
  } finally {
    spawn.mockRestore();
    Object.defineProperty(process, 'platform', platform);
    if (bun) Object.defineProperty(process.versions, 'bun', bun);
  }
}

test('Windows Bun fd3 EBADF after a complete reply waits for strict decoding and successful exit', async () => {
  expect(Buffer.byteLength(envelope)).toBe(162);
  const { result, killed } = await exercise();
  expect(result).toMatchObject({ code: 'EXECUTION_REJECTED' });
  expect(killed).toBe(false);
});

test('deferred response pipe errors never bypass protocol, exit, cancellation, deadline or size checks', async () => {
  for (const [options, code] of [
    [{ response: envelope.slice(0, -1) }, 'PROTOCOL_ERROR'],
    [{ response: 'not JSON' }, 'PROTOCOL_ERROR'],
    [{ exit: 1 }, 'WORKER_FAILED'],
    [{ cancel: true, exit: null }, 'CANCELLED'],
    [{ exit: null }, 'DEADLINE_EXCEEDED'],
    [{ limit: 10 }, 'OUTPUT_LIMIT_EXCEEDED'],
  ] as const) {
    expect((await exercise(options)).result).toMatchObject({ code });
  }
});

test('stdin, stderr, unknown errors and non-Windows-Bun runtimes keep failing closed', async () => {
  for (const options of [
    { stream: 'stdin' },
    { stream: 'stderr' },
    { errno: 'ENOENT' },
    { errno: 'EACCES' },
    { platform: 'linux' },
    { bun: false },
  ] as const) {
    const { result, killed } = await exercise(options);
    expect(result).toMatchObject({ code: 'WORKER_FAILED' });
    expect(killed).toBe(true);
    expect(String(result)).not.toContain('private pipe detail');
  }
});

test('Windows Node reports a dead worker stdin as EOF, which waits for the worker close like EPIPE', async () => {
  for (const stream of ['stdin', 'stderr', 'fd3'] as const) {
    const { result, killed } = await exercise({ stream, errno: 'EOF', bun: false });
    expect(result).toMatchObject({ code: 'EXECUTION_REJECTED' });
    expect(killed).toBe(false);
  }
  expect((await exercise({ stream: 'stdin', errno: 'EOF', exit: 1 })).result).toMatchObject({
    code: 'WORKER_FAILED',
  });
});
