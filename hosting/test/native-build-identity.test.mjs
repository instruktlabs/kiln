import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

let NativeBuildIdentities;
const image = `sha256:${'a'.repeat(64)}`;
before(async () => {
  const output = new URL('../../.cache/native-build-identity-test.mjs', import.meta.url);
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-build-identity.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
  });
  ({ NativeBuildIdentities } = await import(output));
});

test('saved identity is bound to exact evaluated source and output, independent of caller buffers', () => {
  const records = new NativeBuildIdentities();
  const glb = new Uint8Array([1, 2, 3]);
  records.record('source', glb, image);
  const draft = { code: 'source', glb: Uint8Array.from(glb), build: { engine: 'forged' } };
  assert.equal(records.forDraft(draft), `cloudflare-container:${image}`);
  glb[0] = 9;
  assert.equal(records.forDraft(draft), `cloudflare-container:${image}`);
  for (const value of [
    { ...draft, glb },
    { ...draft, code: 'other' },
    { ...draft, code: undefined },
  ])
    assert.throws(() => records.forDraft(value), /verified evaluation/i);
  assert.throws(() => new NativeBuildIdentities().forDraft(draft), /verified evaluation/i);
});

test('missing, malformed or conflicting identities cannot be saved and retained proofs are bounded', () => {
  const records = new NativeBuildIdentities();
  for (const identity of [undefined, '', 'latest', `${image}\n`])
    assert.throws(() => records.record('a', new Uint8Array([1]), identity));
  records.record('a', new Uint8Array([1]), image);
  assert.throws(() => records.record('a', new Uint8Array([1]), `sha256:${'b'.repeat(64)}`));
  for (let i = 1; i < 16; i++) records.record(`source-${i}`, new Uint8Array([i]), image);
  assert.throws(() => records.record('overflow', new Uint8Array([100]), image));
  records.record('a', new Uint8Array([1]), image);
  assert.throws(() => records.record('x'.repeat(1024 * 1024 + 1), new Uint8Array([1]), image));
  assert.throws(() => records.record('a', new Uint8Array(4 * 1024 * 1024 + 1), image));
});
