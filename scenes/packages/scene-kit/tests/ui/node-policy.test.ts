import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_PORT_RANGE, assertOwnedUrl, assertTeardownListenerAudit, contrastRatio, isExpectedCallbackFailureDiagnostic, isExpectedLifecycleDiagnostic, runPerformance, runSceneContractTests, serveOwned, workspacePath } from '../../src/testing/node';

test('browser helper refuses unowned listeners and credential-bearing URLs', () => {
  const owned = new Set([4400]);
  expect(() => assertOwnedUrl('http://127.0.0.1:4400/index.html', owned)).not.toThrow();
  for (const url of ['http://127.0.0.1:8011/', 'http://127.0.0.1:4401/', 'https://example.com/', 'http://localhost:4400/', 'http://user:password@127.0.0.1:4400/']) expect(() => assertOwnedUrl(url, owned)).toThrow();
});
// GG-001 / FF-001: each builder serves only in its own port range. None of these tests binds a port: the checks run
// before any server exists, so they cannot collide with another runner's listeners.
test('an optional owned port range narrows the loopback check; without one it stays 4400–4499', () => {
  expect(DEFAULT_PORT_RANGE).toEqual({ first: 4400, last: 4499 });
  expect(Object.isFrozen(DEFAULT_PORT_RANGE)).toBe(true);
  expect(() => assertOwnedUrl('http://127.0.0.1:4700/', new Set([4700]))).toThrow('ports 4400–4499');
  const range = { first: 4700, last: 4749 };
  expect(() => assertOwnedUrl('http://127.0.0.1:4700/index.html', new Set([4700]), range)).not.toThrow();
  expect(() => assertOwnedUrl('http://127.0.0.1:4749/', new Set([4749]), range)).not.toThrow();
  for (const port of [4699, 4750, 4400]) expect(() => assertOwnedUrl(`http://127.0.0.1:${port}/`, new Set([port]), range)).toThrow('ports 4700–4749');
  // Inside the range only a listener this runner started is accepted, still loopback http without credentials.
  for (const url of ['http://127.0.0.1:4701/', 'http://localhost:4700/', 'https://127.0.0.1:4700/', 'http://user:password@127.0.0.1:4700/']) expect(() => assertOwnedUrl(url, new Set([4700]), range)).toThrow();
});
test('an invalid port range is refused before any server, output or browser exists', async () => {
  const invalid = [{ first: 4749, last: 4700 }, { first: 4700.5, last: 4749 }, { first: 80, last: 90 }, { first: 65530, last: 65536 }, { first: Number.NaN, last: 4749 }];
  for (const ports of invalid) {
    expect(() => assertOwnedUrl('http://127.0.0.1:4700/', new Set([4700]), ports)).toThrow('Invalid owned port range');
    await expect(serveOwned(process.cwd(), ports)).rejects.toThrow('Invalid owned port range');
  }
  const outDir = `.tmp/node-policy-${process.pid}-never-created`;
  await expect(runSceneContractTests({ testRoot: '.', publicRoot: '.', devRoot: '.', outDir, ports: invalid[0]! })).rejects.toThrow('Invalid owned port range');
  expect(existsSync(resolve(process.cwd(), outDir))).toBe(false);
});
test('the performance runner checks its URL against the given range before it launches a browser', async () => {
  const base = { ownedPorts: new Set([4700]), tier: 'high', backend: 'webgpu' as const, workload: 'idle', seconds: 4, smoke: true, url: 'http://127.0.0.1:4700/' };
  await expect(runPerformance(base)).rejects.toThrow('ports 4400–4499');
  // With the range the URL passes, and the next check (a smoke run lasts exactly five seconds) refuses the run.
  await expect(runPerformance({ ...base, ports: { first: 4700, last: 4749 } })).rejects.toThrow('exactly five seconds');
});
test('browser output confinement and public HUD contrast calculation', () => {
  expect(() => workspacePath(process.cwd(), '../outside')).toThrow();
  expect(workspacePath(process.cwd(), 'evidence/demo')).toContain('evidence');
  expect(contrastRatio('rgb(255, 255, 255)', 'rgb(20, 37, 34)')).toBeGreaterThan(4.5);
  expect(contrastRatio('rgb(255, 255, 255)', 'rgb(255, 255, 255)')).toBe(1);
});

test('C-03 permits only the marked single React document listener after teardown', () => {
  const listener = { type: 'selectionchange', useCapture: false, passive: false, once: false };
  const audit = () => ({ listeners: { window: [], document: [{ ...listener }], 'window.__kilnDetachedRoot': [] }, reactDocumentMarkers: [{ name: '_reactListeningabc123', value: true }] });
  expect(() => assertTeardownListenerAudit(audit())).not.toThrow();
  const missing = audit(); missing.listeners.document = [];
  expect(() => assertTeardownListenerAudit(missing)).toThrow();
  const duplicate = audit(); duplicate.listeners.document.push({ ...listener });
  expect(() => assertTeardownListenerAudit(duplicate)).toThrow();
  const additional = audit(); additional.listeners.document.push({ ...listener, type: 'visibilitychange' });
  expect(() => assertTeardownListenerAudit(additional)).toThrow();
  const passive = audit(); passive.listeners.document[0]!.passive = true;
  expect(() => assertTeardownListenerAudit(passive)).toThrow();
  const unmarked = audit(); unmarked.reactDocumentMarkers = [];
  expect(() => assertTeardownListenerAudit(unmarked)).toThrow();
  const unsetMarker = audit(); unsetMarker.reactDocumentMarkers[0]!.value = false;
  expect(() => assertTeardownListenerAudit(unsetMarker)).toThrow();
  expect(() => assertTeardownListenerAudit({ ...audit(), listeners: { ...audit().listeners, window: [listener] } })).toThrow();
  expect(() => assertTeardownListenerAudit({ ...audit(), listeners: { ...audit().listeners, 'window.__kilnDetachedRoot': [listener] } })).toThrow();
});

test('intentional error teardown may abort only its exact held pack request', () => {
  const url = 'http://127.0.0.1:4400/b05-after-error/pack.json';
  const aborted = { kind: 'requestfailed' as const, url, text: 'net::ERR_ABORTED' };
  expect(isExpectedLifecycleDiagnostic(aborted, 'after-error', url)).toBe(true);
  expect(isExpectedLifecycleDiagnostic(aborted, 'loading', url)).toBe(true);
  expect(isExpectedLifecycleDiagnostic({ ...aborted, url: url + '?unrelated=1' }, 'after-error', url)).toBe(false);
  expect(isExpectedLifecycleDiagnostic({ ...aborted, url: 'http://127.0.0.1:4400/assets/pack.json' }, 'after-error', url)).toBe(false);
  expect(isExpectedLifecycleDiagnostic({ ...aborted, text: 'net::ERR_FAILED' }, 'after-error', url)).toBe(false);
  expect(isExpectedLifecycleDiagnostic({ ...aborted, kind: 'pageerror' }, 'after-error', url)).toBe(false);
  const http404 = { kind: 'console' as const, type: 'error', url, text: 'Failed to load resource: the server responded with a status of 404 (Not Found)' };
  expect(isExpectedLifecycleDiagnostic(http404, 'after-error', url)).toBe(true);
  expect(isExpectedLifecycleDiagnostic(http404, 'loading', url)).toBe(false);
  expect(isExpectedLifecycleDiagnostic({ ...http404, type: 'warn' }, 'after-error', url)).toBe(false);
  expect(isExpectedLifecycleDiagnostic({ ...http404, text: 'Uncaught error in scene' }, 'after-error', url)).toBe(false);
});

test('callback-failure fixture classifies only an exact pack-request abort', () => {
  const packUrl = 'http://127.0.0.1:4400/assets/pack.json';
  const expected = { kind: 'requestfailed' as const, text: 'net::ERR_ABORTED', url: packUrl };
  expect(isExpectedCallbackFailureDiagnostic(expected, packUrl)).toBe(true);
  for (const url of [packUrl + '?other=1', packUrl + '#other', 'http://127.0.0.1:4401/assets/pack.json', 'http://127.0.0.1:4400/assets/models/amber.glb']) {
    expect(isExpectedCallbackFailureDiagnostic({ ...expected, url }, packUrl)).toBe(false);
  }
  for (const text of ['net::ERR_FAILED', 'net::ERR_CONNECTION_RESET']) {
    expect(isExpectedCallbackFailureDiagnostic({ ...expected, text }, packUrl)).toBe(false);
  }
  expect(isExpectedCallbackFailureDiagnostic({ ...expected, kind: 'pageerror' }, packUrl)).toBe(false);
  for (const type of ['warn', 'error']) {
    expect(isExpectedCallbackFailureDiagnostic({ ...expected, kind: 'console', type }, packUrl)).toBe(false);
  }
  expect(isExpectedCallbackFailureDiagnostic({ kind: 'console', type: 'error', url: packUrl, text: 'Failed to load resource: the server responded with a status of 404 (Not Found)' }, packUrl)).toBe(false);
});

test('callback-failure fixture can classify aborted manifest members, but never unrelated requests or errors', () => {
  const member = 'http://127.0.0.1:4400/assets/data/layout.json';
  const allowed = new Set(['http://127.0.0.1:4400/assets/pack.json', member]);
  const message = { kind: 'requestfailed' as const, text: 'net::ERR_ABORTED', url: member };
  expect(isExpectedCallbackFailureDiagnostic(message, allowed)).toBe(true);
  expect(isExpectedCallbackFailureDiagnostic({ ...message, url: member + '?other=1' }, allowed)).toBe(false);
  expect(isExpectedCallbackFailureDiagnostic({ ...message, url: member.replace('layout', 'unlisted') }, allowed)).toBe(false);
  expect(isExpectedCallbackFailureDiagnostic({ ...message, text: 'net::ERR_FAILED' }, allowed)).toBe(false);
  expect(isExpectedCallbackFailureDiagnostic({ ...message, kind: 'pageerror' }, allowed)).toBe(false);
});
