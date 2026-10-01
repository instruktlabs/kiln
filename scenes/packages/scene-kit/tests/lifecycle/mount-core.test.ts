import { expect, test } from 'bun:test';
import { SceneError } from '../../src/contract/core';
import { notifySafely, safeMount, type SafeMountCallbacks, type SafeMountOptions } from '../../src/contract/mount-core';

function fixture(overrides: Partial<SafeMountOptions<object, object>> = {}) {
  const calls: string[] = [], errors: Error[] = [];
  const host = {}, root = {};
  let callbacks!: SafeMountCallbacks;
  const options: SafeMountOptions<object, object> = {
    createHost() { calls.push('create'); return host; },
    appendHost(value) { expect(value).toBe(host); calls.push('append'); },
    removeHost(value) { expect(value).toBe(host); calls.push('remove'); },
    createRoot(value) { expect(value).toBe(host); calls.push('root'); return root; },
    render(value, next) { expect(value).toBe(root); calls.push('render'); callbacks = next; },
    unmountRoot(value) { expect(value).toBe(root); calls.push('unmount'); },
    onError(error) { calls.push('error'); errors.push(error); },
    onReady() { calls.push('ready'); },
    ...overrides,
  };
  return { options, calls, errors, get callbacks() { return callbacks; } };
}

for (const stage of ['createHost', 'appendHost', 'createRoot', 'render'] as const) {
  test(`mount catches synchronous ${stage} failure and cleans every acquired resource`, () => {
    const f = fixture({ [stage]: () => { throw new Error(stage); } });
    const handle = safeMount(f.options);
    expect(handle.disposed).toBe(true);
    expect(f.errors).toHaveLength(1);
    expect(f.errors[0]).toBeInstanceOf(SceneError);
    expect(f.errors[0]?.message).toBe(stage);
    expect(f.calls.filter(value => value === 'remove')).toHaveLength(stage === 'createHost' ? 0 : 1);
    expect(f.calls.filter(value => value === 'unmount')).toHaveLength(stage === 'render' ? 1 : 0);
    const before = [...f.calls]; handle.unmount(); expect(f.calls).toEqual(before);
  });
}

test('unmount marks disposed before cleanup, removes host despite cleanup failure, and is idempotent', () => {
  let handle!: ReturnType<typeof safeMount>;
  const f = fixture({ unmountRoot() {
    f.calls.push('unmount'); expect(handle.disposed).toBe(true);
    f.callbacks.onReady(); f.callbacks.onError(new Error('late cleanup error'));
    throw new Error('cleanup fixture');
  } });
  handle = safeMount(f.options);
  expect(() => handle.unmount()).not.toThrow();
  expect(f.calls.slice(-2)).toEqual(['unmount', 'remove']);
  expect(f.errors).toHaveLength(0);
  const before = [...f.calls]; handle.unmount(); expect(f.calls).toEqual(before);
});

test('host removal errors cannot escape and are not retried', () => {
  let removals = 0;
  const f = fixture({ removeHost() { removals++; throw new Error('remove fixture'); } });
  const handle = safeMount(f.options);
  expect(() => handle.unmount()).not.toThrow(); handle.unmount();
  expect(removals).toBe(1); expect(handle.disposed).toBe(true); expect(f.errors).toHaveLength(0);
});

test('ready is once only and fatal error suppresses all later callbacks', () => {
  const f = fixture(), handle = safeMount(f.options);
  f.callbacks.onReady(); f.callbacks.onReady();
  f.callbacks.onError(new Error('fatal')); f.callbacks.onError(new Error('second')); f.callbacks.onReady();
  expect(f.calls.filter(value => value === 'ready')).toHaveLength(1);
  expect(f.errors).toHaveLength(1); expect(handle.disposed).toBe(true);
  expect(f.calls.slice(-3)).toEqual(['error', 'unmount', 'remove']);
});

test('ready callback failure becomes one SceneError and throwing error callback is contained', () => {
  let errors = 0;
  const f = fixture({ onReady() { throw new Error('ready fixture'); }, onError(error) {
    errors++; expect(error).toBeInstanceOf(SceneError); throw new Error('error callback fixture');
  } });
  const handle = safeMount(f.options);
  expect(() => f.callbacks.onReady()).not.toThrow();
  f.callbacks.onReady(); f.callbacks.onError(new Error('late'));
  expect(errors).toBe(1); expect(handle.disposed).toBe(true); expect(f.calls.slice(-2)).toEqual(['unmount', 'remove']);
});

test('a root returned after synchronous error is still disposed and never rendered', () => {
  const f = fixture({ createRoot(_host, report) { f.calls.push('root'); report(new Error('root callback fixture')); return {}; },
    unmountRoot() { f.calls.push('unmount'); } });
  const handle = safeMount(f.options);
  expect(handle.disposed).toBe(true); expect(f.errors).toHaveLength(1);
  expect(f.calls).toEqual(['create', 'append', 'root', 'error', 'unmount', 'remove']);
  handle.unmount(); expect(f.calls.filter(value => value === 'unmount')).toHaveLength(1);
});

test('scheduled failure cleanup closes callbacks immediately and releases root then host together once', () => {
  const queued: (() => void)[] = [];
  const f = fixture({ scheduleFailureCleanup(cleanup) { queued.push(cleanup); } });
  const handle = safeMount(f.options);
  f.callbacks.onError(new Error('fatal'));
  expect(handle.disposed).toBe(true); expect(queued).toHaveLength(1);
  expect(f.calls).toEqual(['create', 'append', 'root', 'render', 'error']);
  f.callbacks.onReady(); f.callbacks.onError(new Error('late'));
  expect(f.errors).toHaveLength(1); expect(f.calls.includes('ready')).toBe(false);
  queued[0]!(); queued[0]!(); handle.unmount();
  expect(f.calls.slice(-2)).toEqual(['unmount', 'remove']);
  expect(f.calls.filter(value => value === 'unmount')).toHaveLength(1);
  expect(f.calls.filter(value => value === 'remove')).toHaveLength(1);
});

test('a synchronous root error waits for queued cleanup and releases the returned root', () => {
  const queued: (() => void)[] = [];
  const f = fixture({ scheduleFailureCleanup(cleanup) { queued.push(cleanup); },
    createRoot(_host, report) { report(new Error('root failure')); return {}; },
    unmountRoot() { f.calls.push('unmount'); } });
  const handle = safeMount(f.options);
  expect(handle.disposed).toBe(true); expect(f.calls).toEqual(['create', 'append', 'error']);
  queued[0]!(); expect(f.calls.slice(-2)).toEqual(['unmount', 'remove']);
});

test('explicit unmount before queued failure cleanup still releases resources only once', () => {
  const queued: (() => void)[] = [];
  const f = fixture({ scheduleFailureCleanup(cleanup) { queued.push(cleanup); } });
  const handle = safeMount(f.options); f.callbacks.onError(new Error('fatal'));
  handle.unmount(); queued[0]!();
  expect(f.calls.filter(value => value === 'unmount')).toHaveLength(1);
  expect(f.calls.filter(value => value === 'remove')).toHaveLength(1);
});

test('a throwing failure scheduler falls back to immediate contained cleanup', () => {
  const f = fixture({ scheduleFailureCleanup() { throw new Error('scheduler failure'); } });
  const handle = safeMount(f.options);
  expect(() => f.callbacks.onError(new Error('fatal'))).not.toThrow();
  expect(handle.disposed).toBe(true); expect(f.calls.slice(-2)).toEqual(['unmount', 'remove']);
});

test('notification errors reach the collector without stopping later subscribers or cleanup', () => {
  const calls: string[] = [], errors: unknown[] = [];
  const listeners = new Set([
    () => { calls.push('first'); throw new Error('first failure'); },
    () => { calls.push('second'); throw new Error('second failure'); },
    () => { calls.push('third'); },
  ]);
  expect(() => {
    notifySafely(listeners, error => { errors.push(error); throw new Error('collector failure'); });
    calls.push('cleanup');
  }).not.toThrow();
  expect(calls).toEqual(['first', 'second', 'third', 'cleanup']);
  expect(errors).toHaveLength(2);
});
