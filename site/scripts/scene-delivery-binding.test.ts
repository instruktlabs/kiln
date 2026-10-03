import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { verifySceneDeliveryBinding } from './scene-delivery-binding.mjs';
import { verifyRuntimePayload } from './served-runtime.mjs';

function fixture() {
  const id = 'golden-gate', file = 'index-current.js', base = '/scene-packs/golden-gate/g9-code5/';
  const pin = { kind: 'frame', file, bytes: 42, gzipBytes: 33, gzipMethod: 'bun-zlib', sha256: 'a'.repeat(64), modulesSha256: 'b'.repeat(64) };
  const record = { id, release: 'g9-code5', base, runtime: pin };
  const runtime = { schema: 'kiln.scene-runtime/1', id, ...pin, url: `/scene-runtime/${id}/frame.html`, chunk: `/scene-runtime/${id}/${file}` };
  const shellHtml = `<scene-shell data-scene="${id}" data-kind="frame" data-runtime-url="${runtime.url}" data-asset-base="${base}"></scene-shell>`;
  const frameHtml = `<meta name="kiln-asset-base" content="${base}"><script type="module" src="./${file}"></script>`;
  return { id, record, runtime, shellHtml, frameHtml };
}
test('binds the catalog, scene shell, frame pack metadata and actual module reference', () => {
  expect(verifySceneDeliveryBinding(fixture())).toMatchObject({ id: 'golden-gate' });
});
test('rejects a self-consistent stale payload that still passes its own byte checks', async () => {
  const f = fixture(), bytes = Buffer.from('export const stale = true'), digest = createHash('sha256').update(bytes).digest('hex');
  f.runtime.file = 'index-old.js'; f.runtime.bytes = bytes.length; f.runtime.gzipBytes = gzipSync(bytes).length; f.runtime.sha256 = digest;
  const served = { ...f.runtime, kind: 'module' };
  expect(await verifyRuntimePayload(served, async () => bytes)).toMatchObject({ bytes: bytes.length });
  expect(() => verifySceneDeliveryBinding(f)).toThrow(/catalog runtime/);
});
test.each(['sha256', 'modulesSha256', 'bytes', 'gzipBytes', 'chunks', 'initialLoad'])('rejects catalog %s drift even if runtime.json is internally consistent', field => {
  const f = fixture(); (f.runtime as any)[field] = field.includes('Bytes') || field === 'bytes' ? 1 : 'changed';
  expect(() => verifySceneDeliveryBinding(f)).toThrow(/catalog runtime/);
});
test.each([
  ['stale frame asset base', (f: ReturnType<typeof fixture>) => { f.frameHtml = f.frameHtml.replaceAll('g9-code5', 'g9-code3'); }],
  ['wrong frame entry', (f: ReturnType<typeof fixture>) => { f.frameHtml = f.frameHtml.replace('index-current.js', 'index-old.js'); }],
  ['extra frame module', (f: ReturnType<typeof fixture>) => { f.frameHtml += '<script type="module" src="./extra.js"></script>'; }],
  ['duplicate frame pack metadata', (f: ReturnType<typeof fixture>) => { f.frameHtml += '<meta name="kiln-asset-base" content="/other/">'; }],
  ['external frame entry', (f: ReturnType<typeof fixture>) => { f.frameHtml = f.frameHtml.replace('./index-current.js', 'https://elsewhere.test/index-current.js'); }],
  ['stale shell asset base', (f: ReturnType<typeof fixture>) => { f.shellHtml = f.shellHtml.replaceAll('g9-code5', 'g9-code3'); }],
  ['wrong shell runtime URL', (f: ReturnType<typeof fixture>) => { f.shellHtml = f.shellHtml.replace('/frame.html', '/old.html'); }],
  ['wrong shell scene', (f: ReturnType<typeof fixture>) => { f.shellHtml = f.shellHtml.replace('data-scene="golden-gate"', 'data-scene="farm"'); }],
  ['duplicate shell', (f: ReturnType<typeof fixture>) => { f.shellHtml += f.shellHtml; }],
  ['wrong runtime id', (f: ReturnType<typeof fixture>) => { f.runtime.id = 'foundry-floor'; }],
  ['wrong runtime entry URL', (f: ReturnType<typeof fixture>) => { f.runtime.chunk = '/scene-runtime/golden-gate/index-other.js'; }],
] as const)('rejects %s', (_name, mutate) => {
  const f = fixture(); mutate(f); expect(() => verifySceneDeliveryBinding(f)).toThrow();
});
test('Farm module mode binds the actual shell to its exact emitted entry and selected pack', () => {
  const runtime = { schema: 'kiln.scene-runtime/1', id: 'farm', kind: 'module', file: 'farm-current.js', url: '/scene-runtime/farm/farm-current.js' };
  const record = { id: 'farm', base: '/scene-packs/farm/r36-local-review/' };
  const shellHtml = `<scene-shell data-scene="farm" data-kind="module" data-runtime-url="${runtime.url}" data-asset-base="${record.base}"></scene-shell>`;
  expect(verifySceneDeliveryBinding({ id: 'farm', record, runtime, shellHtml })).toMatchObject({ id: 'farm' });
  expect(() => verifySceneDeliveryBinding({ id: 'farm', record, runtime, shellHtml: shellHtml.replace('farm-current.js', 'farm-old.js') })).toThrow();
});
