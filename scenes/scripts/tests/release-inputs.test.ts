import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { stageFiles } from '../../packages/scene-kit/src/staging';
import { findSceneFixture, RELEASE_SCENES, releasedAssetRoot, verifyReleasedSceneInputs, type ReleasePins } from '../release-inputs';
import { runReleaseInputGate } from '../test-release-inputs';

const roots: string[] = [], sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'kiln release inputs ')); roots.push(root);
  const source = resolve(root, 'source.glb'); writeFileSync(source, 'synthetic asset bytes');
  const pins = {} as ReleasePins;
  for (const scene of RELEASE_SCENES) {
    const out = releasedAssetRoot(root, scene);
    stageFiles({ id: scene, release: 'test-release', three: '0.186.1', out,
      models: [{ id: 'example', to: 'models/example.glb' }], data: {}, files: [{ from: source, to: 'models/example.glb' }] });
    pins[scene] = { id: scene, release: 'test-release', three: '0.186.1',
      packJsonSha256: sha(readFileSync(resolve(out, 'pack.json'))), sha256sumsSha256: sha(readFileSync(resolve(out, 'SHA256SUMS'))) };
  }
  return { root, pins, source };
}

test('released inputs require every scene and the exact externally pinned pack, sums and members', () => {
  const { root, pins } = fixture();
  expect(verifyReleasedSceneInputs({ root, pins }).map(r => [r.scene, r.release, r.models, r.files])).toEqual(RELEASE_SCENES.map(s => [s, 'test-release', 1, 1]));
  const assets = releasedAssetRoot(root, 'foundry-floor'), model = resolve(assets, 'models/example.glb');
  const original = readFileSync(model); writeFileSync(model, 'changed');
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('models/example.glb');
  writeFileSync(model, original); rmSync(model);
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('models/example.glb');
  writeFileSync(model, original);
  const pack = resolve(assets, 'pack.json'), saved = readFileSync(pack);
  writeFileSync(pack, Buffer.concat([saved, Buffer.from('\n')]));
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('pack.json pin');
  writeFileSync(pack, saved); writeFileSync(resolve(assets, 'SHA256SUMS'), 'changed');
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('SHA256SUMS pin');
  rmSync(releasedAssetRoot(root, 'farm'), { recursive: true });
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('Restore');
});

test('a manifest and member edited together cannot replace the pinned release, and unexpected asset files fail', () => {
  const { root, pins } = fixture(), assets = releasedAssetRoot(root, 'golden-gate');
  writeFileSync(resolve(assets, 'extra.glb'), 'unlisted');
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('extra.glb');
  rmSync(resolve(assets, 'extra.glb'));
  const pack = JSON.parse(readFileSync(resolve(assets, 'pack.json'), 'utf8'));
  writeFileSync(resolve(assets, 'models/example.glb'), 'replacement');
  pack.files[0].bytes = 11; pack.files[0].sha256 = sha(Buffer.from('replacement'));
  writeFileSync(resolve(assets, 'pack.json'), JSON.stringify(pack));
  expect(() => verifyReleasedSceneInputs({ root, pins })).toThrow('pack.json pin');
});

test('Foundry fixtures prefer restored release bytes; required mode never falls back to staged or author inputs', () => {
  const { root, source } = fixture(), path = 'models/example.glb', bytes = readFileSync(source);
  const staged = resolve(root, 'packages/foundry-floor/staged/revision2', path);
  mkdirSync(resolve(staged, '..'), { recursive: true }); writeFileSync(staged, bytes);
  const input = { scene: 'foundry-floor' as const, path, sha256: sha(bytes), bytes: bytes.length };
  const options = { root, fallback: [staged], required: true };
  expect(findSceneFixture(input, options)).toBe(resolve(releasedAssetRoot(root, 'foundry-floor'), path));
  rmSync(releasedAssetRoot(root, 'foundry-floor'), { recursive: true });
  expect(() => findSceneFixture(input, options)).toThrow('Required released fixture');
  expect(findSceneFixture(input, { ...options, required: false })).toBe(staged);
  writeFileSync(staged, 'other revision');
  expect(findSceneFixture(input, { ...options, required: false })).toBeUndefined();
  expect(() => findSceneFixture({ ...input, path: '../escape.glb' }, options)).toThrow();
});

test('the release gate refuses absent inputs before tests and runs its selected suites in required-input mode', () => {
  const { root, pins } = fixture(); let runs = 0;
  const run: Parameters<typeof runReleaseInputGate>[0]['run'] = (command, options) => {
    runs++; expect(command).toContain('./packages/foundry-floor/tests/unit/glb-world.test.ts');
    expect(command).toContain('./packages/golden-gate/tests/unit/vehicle-models.test.ts');
    expect(options.env.KILN_SCENE_RELEASE_INPUTS).toBe('1'); expect(options.cwd).toBe(root);
    return 7;
  };
  expect(runReleaseInputGate({ root, pins, run })).toBe(7); expect(runs).toBe(1);
  rmSync(releasedAssetRoot(root, 'farm'), { recursive: true });
  expect(() => runReleaseInputGate({ root, pins, run })).toThrow('Restore'); expect(runs).toBe(1);
});
