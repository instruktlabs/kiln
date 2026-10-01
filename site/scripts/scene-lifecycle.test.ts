import { expect, test } from 'bun:test';
import { installFrameReporter } from '../src/scenes/frame-reporter.mjs';
import { createSceneWatchdog } from '../src/components/scene-watchdog';

test('the frame reports explicit readiness/errors and preserves consumed Escape', () => {
  const status = { dataset: { state: 'loading' } as Record<string, string>, textContent: 'Loading models' };
  const messages: any[] = [];
  const events: Record<string, (event: any) => void> = {};
  let changed = () => {};
  const scope = {
    document: { getElementById: () => status },
    location: { origin: 'https://example.test' },
    parent: { postMessage: (message: any, origin: string) => messages.push({ ...message, origin }) },
    addEventListener: (type: string, listener: (event: any) => void) => { events[type] = listener; },
    MutationObserver: class { constructor(callback: () => void) { changed = callback; } observe() {} },
    queueMicrotask: (callback: () => void) => callback(),
  };
  installFrameReporter(scope);
  expect(messages.map((message) => message.state)).toEqual(['started', 'progress']);
  status.textContent = '';
  changed();
  expect(messages.at(-1).state).toBe('progress');
  status.dataset.state = 'ready';
  changed();
  expect(messages.at(-1).state).toBe('ready');
  const count = messages.length;
  events.keydown!({ key: 'Escape', defaultPrevented: true });
  expect(messages.length).toBe(count);
  events.keydown!({ key: 'Escape', defaultPrevented: false });
  expect(messages.at(-1).state).toBe('exit');
  status.dataset.state = 'error';
  status.dataset.errorCode = 'renderer-init';
  status.textContent = 'Graphics are unavailable.';
  changed();
  expect(messages.at(-1)).toMatchObject({ source: 'kiln-scene', state: 'error', errorCode: 'renderer-init', origin: 'https://example.test' });
  events.unhandledrejection!({ reason: new Error('broken runtime') });
  expect(messages.at(-1).message).toBe('broken runtime');
});

test('scene startup watchdog renews on progress and stops on ready or teardown', () => {
  let callback: (() => void) | undefined;
  let failures = 0;
  let delay = 0;
  const clock = { set: (fn: () => void, ms: number) => { callback = fn; delay = ms; return 1; }, clear: () => { callback = undefined; } };
  const guard = createSceneWatchdog(() => { failures++; }, clock);
  guard.touch();
  expect(delay).toBe(20_000);
  const first = callback;
  guard.touch();
  expect(callback).not.toBe(first);
  guard.stop();
  expect(callback).toBeUndefined();
  guard.touch();
  callback!();
  expect(failures).toBe(1);
  guard.stop();
});
