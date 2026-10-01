import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dir, '..'), out = resolve(root, '../engine-work/local-v09-review/revision2-golden-farm');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function entry(path: string) { const bytes = await readFile(path); return { path: relative(root, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: digest(bytes) }; }
async function inventory(directory: string): Promise<Awaited<ReturnType<typeof entry>>[]> {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    assert(!item.isSymbolicLink(), 'Unexpected symlink ' + item.name);
    const path = resolve(directory, item.name);
    if (item.isDirectory()) files.push(...await inventory(path)); else if (item.isFile()) files.push(await entry(path));
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const controls = JSON.parse(await readFile(resolve(out, 'controls/controls.json'), 'utf8'));
assert.equal(controls.length, 4); assert(controls.every((c: any) => c.passed));
for (const cell of controls) for (const input of cell.candidate) {
  const current = await entry(resolve(root, `packages/${cell.scene}/dist/review-r2/test`, input.path));
  assert.equal(current.sha256, input.sha256, `${cell.scene} tested candidate changed`);
}
const source = [];
for (const name of ['farm', 'golden-gate', 'scene-kit']) source.push(...await inventory(resolve(root, 'packages', name, 'src')));
source.push(...await inventory(resolve(root, 'packages/golden-gate/data')));
for (const path of ['package.json', 'bun.lock', 'packages/farm/scripts/stage-review2.ts', 'scripts/build-farm.ts', 'packages/golden-gate/scripts/stage.ts', 'packages/golden-gate/scripts/release.ts', 'packages/golden-gate/tests/tools/build.ts', 'scripts/review-r2-controls.ts', 'scripts/review-r2-repro.ts', 'scripts/seal-golden-farm-r2.ts', 'packages/farm/tests/unit/first-person.test.ts', 'packages/farm/tests/unit/hand-clearance.test.ts', 'packages/golden-gate/tests/unit/boost.test.ts', 'packages/golden-gate/tests/unit/arrival.test.ts', 'packages/golden-gate/tests/unit/review2-vehicles.test.ts', 'packages/golden-gate/tests/unit/vehicle-models.test.ts']) source.push(await entry(resolve(root, path)));
const scenes = [];
for (const [id, release] of [['farm', 'r35-local-review'], ['golden-gate', 'g8']]) {
  const base = resolve(root, 'packages', id!);
  scenes.push({ id, release, stage: await inventory(resolve(base, 'staged', release!)), public: await inventory(resolve(base, 'dist/review-r2/standalone')), test: await inventory(resolve(base, 'dist/review-r2/test')) });
}
const evidence = [await entry(resolve(out, 'unit-final.log')), await entry(resolve(out, 'typecheck-final.log')), await entry(resolve(out, 'lint-final.log')), ...await inventory(resolve(out, 'controls'))];
const seal = { schema: 'kiln.scene-review2-freeze/1', scope: 'Golden Gate and Farm local owner-review revisions', ownerAccepted: false,
  qualification: { sourceTests: 169, skippedOptInOracle: 1, sourceAssertions: 2477548, browser: 'WebGPU and WebGL2 desktop plus emulated touch controls; functional evidence, no physical mobile or performance claim' },
  source, scenes, evidence };
const bytes = Buffer.from(JSON.stringify(seal, null, 2) + '\n'); await writeFile(resolve(out, 'freeze.json'), bytes);
console.log(JSON.stringify({ path: resolve(out, 'freeze.json'), bytes: bytes.length, sha256: digest(bytes), sourceFiles: source.length, scenes: scenes.map(s => ({ id: s.id, release: s.release, publicFiles: s.public.length, testFiles: s.test.length, stageFiles: s.stage.length })) }));
