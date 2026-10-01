// Preserve a qualified revision2 delivery; --final-intake selects a new final scene candidate snapshot.
// This is a new immutable local snapshot; it never writes the initial candidate or an existing snapshot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { PACKAGE_ROOT, SCENES_ROOT } from './owned';

const finalIntake = process.argv.includes('--final-intake');
const output = resolve(SCENES_ROOT, '../engine-work/local-v09-review/revision2-20260930', finalIntake ? 'foundry-runtime-final' : 'foundry-runtime-rear-checkpoint');
const built = resolve(PACKAGE_ROOT, 'dist/revision2/standalone');
const evidence = resolve(PACKAGE_ROOT, finalIntake ? 'evidence/revision2/final-intake' : 'evidence/revision2');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const slash = (path: string) => path.replaceAll('\\', '/');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
function files(root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const path = resolve(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  }).sort();
}
function record(base: string, path: string) {
  const bytes = readFileSync(path);
  return { path: slash(relative(base, path)), bytes: bytes.length, sha256: digest(bytes) };
}
function write(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const prepared = existsSync(output);
if (prepared) {
  assert(finalIntake, `Snapshot already exists; preserve it: ${output}`);
  // The coordinator may stage these stable bytes while qualification runs. Accept only
  // this exact unsealed runtime shape; never reopen a previously qualified snapshot.
  assert.deepEqual(readdirSync(output).sort(), ['bundle-public.json', 'standalone']);
}
const receiptPath = resolve(evidence, 'build/bundle-public.json'), receipt = json(receiptPath);
assert.equal(receipt.release, 'ff3-review2');
assert.equal(receipt.withinCeiling, true);
assert.equal(receipt.packSha256, digest(readFileSync(resolve(built, 'assets/pack.json'))));
if (finalIntake) assert.equal(digest(readFileSync(resolve(built, 'bundle-public.json'))), digest(readFileSync(receiptPath)), 'Standalone intake receipt must equal its evidence copy');
const checks: Record<string, unknown> = { initialPayload: { passed: receipt.withinCeiling, ...receipt.startupAndExterior } };
for (const backend of ['ff3-review2', 'ff3-review2-webgl2']) {
  const summary = json(resolve(evidence, 'contract', backend, 'summary.json'));
  assert.equal(summary.passed, true);
  assert.equal(Object.keys(summary.final).length, 8);
  assert(Object.values(summary.final).every(value => value === 'pass'));
  assert.equal(summary.ledger.browserClosed, true);
  assert.equal(summary.ledger.serversClosed, true);
  checks[backend] = { passed: true, final: summary.final, browser: summary.browser, resourcesClosed: true };
}
const controls = json(resolve(evidence, 'browser-final/controls.json'));
const localReview = json(resolve(evidence, 'contract/local-review.json'));
assert.equal(controls.ok, true);
assert.equal(localReview.ok, true);
checks.controls = { passed: true, cases: controls.results.map((r: {name: string;ok: boolean}) => ({name:r.name,passed:r.ok})) };
checks.localReview = { passed: true, results: localReview.results };
for (const path of ['cpu.log', 'scene-kit.log', 'vehicle-intake.log']) {
  const log = readFileSync(resolve(evidence, path), 'utf8');
  assert.match(log, /\b0 fail\b/);
  assert.match(log, /\b\d+ pass\b/);
  checks[path] = { passed: true, tests: Number(/\b(\d+) pass\b/.exec(log)![1]), assertions: Number(/\b(\d+) expect\(\) calls/.exec(log)?.[1] ?? 0) };
}
const typecheck = readFileSync(resolve(evidence, 'typecheck.log'), 'utf8');
assert.match(typecheck, /tsc --noEmit/); assert.doesNotMatch(typecheck, /error TS|exited with code [1-9]/);
const lint = readFileSync(resolve(evidence, 'lint.log'), 'utf8');
assert.match(lint, /"findings":0/); assert.match(lint, /"advisoryFindings":0/); assert.match(lint, /"ok":true/);
checks.typecheck = { passed: true }; checks.lint = { passed: true, findings: 0, advisoryFindings: 0 };
const standalone = files(built).map(path => record(built, path));
assert.equal(standalone.length, receipt.outputFiles);
assert.equal(standalone.reduce((sum, file) => sum + file.bytes, 0), receipt.outputBytes);
for (const chunk of receipt.chunks) {
  const file = standalone.find(item => item.path === chunk.name);
  assert(file && file.sha256 === chunk.sha256 && file.bytes === chunk.bytes);
}
mkdirSync(output, { recursive: true });
if (!prepared) cpSync(built, resolve(output, 'standalone'), { recursive: true, errorOnExist: true, force: false });
assert.deepEqual(files(resolve(output, 'standalone')).map(path => record(resolve(output, 'standalone'), path)), standalone);
if (prepared) assert.equal(digest(readFileSync(resolve(output, 'bundle-public.json'))), digest(readFileSync(receiptPath)));
else cpSync(receiptPath, resolve(output, 'bundle-public.json'));
const sourceRoots = [
  'packages/foundry-floor/src', 'packages/foundry-floor/data', 'packages/foundry-floor/scripts',
  'packages/foundry-floor/standalone-campus', 'packages/foundry-floor/tests', 'packages/scene-kit/src',
  'packages/scene-kit/tests/assets', 'packages/foundry-floor/package.json', 'packages/scene-kit/package.json',
  'package.json', 'bun.lock', 'toolchain.json', 'tsconfig.json', 'tsconfig.base.json',
];
const sources = [...new Set(sourceRoots.flatMap(path => {
  const full = resolve(SCENES_ROOT, path);
  return statSync(full).isDirectory() ? files(full) : [full];
}))].sort().map(path => record(SCENES_ROOT, path));
for (const file of sources) {
  const target = resolve(output, 'source', file.path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(SCENES_ROOT, file.path), target);
  assert.equal(digest(readFileSync(target)), file.sha256);
}
write(resolve(output, 'source-files.json'), { schema: 1, base: SCENES_ROOT, files: sources });
const qualificationPaths = [
  'cpu.log', 'scene-kit.log', 'vehicle-intake.log', 'typecheck.log', 'lint.log',
  'contract/ff3-review2/summary.json', 'contract/ff3-review2-webgl2/summary.json',
  'contract/local-review.json', 'browser-final/controls.json', 'captures-final/captures.json',
  ...['browser-final', 'captures-final'].flatMap(dir => files(resolve(evidence, dir)).filter(path => path.endsWith('.png')).map(path => slash(relative(evidence, path)))),
  ...(!finalIntake ? ['diagnosis/context-occlusion-green.log', 'diagnosis/lod-path-before.json', 'diagnosis/lod-path-after.json'] : []),
];
const qualification = qualificationPaths.map(path => record(evidence, resolve(evidence, path)));
for (const file of qualification) {
  const target = resolve(output, 'qualification', file.path);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(resolve(evidence, file.path), target);
  assert.equal(digest(readFileSync(target)), file.sha256);
}
write(resolve(output, 'qualification/receipt.json'), {
  schema: 'kiln.foundry-review2.qualification/1', qualificationPassed: true, ownerAccepted: false,
  packSha256: receipt.packSha256, bundleReceiptSha256: digest(readFileSync(resolve(output, 'bundle-public.json'))),
  sourceManifestSha256: digest(readFileSync(resolve(output, 'source-files.json'))),
  checks, files: qualification,
});
write(resolve(output, 'freeze.json'), {
  schema: 1, kind: finalIntake ? 'Foundry review 2 scene candidate after six-vehicle final intake' : 'Foundry review 2 controller/context checkpoint before approved front-headlight repairs',
  createdAt: new Date().toISOString(), source: built,
  ownerAccepted: false, finalReviewPacket: false,
  finalSceneCandidate: finalIntake,
  pending: finalIntake ? ['Final combined site intake/qualification and owner appearance/device review.'] : ['Intake the separately authored front-headlight child revisions, then repeat affected vehicle/pack/browser checks and freeze a new candidate.'],
  packSha256: receipt.packSha256,
  bundleReceiptSha256: digest(readFileSync(resolve(output, 'bundle-public.json'))),
  sourceManifestSha256: digest(readFileSync(resolve(output, 'source-files.json'))),
  qualificationReceipt: record(output, resolve(output, 'qualification/receipt.json')),
  standalone, qualification,
  limits: ['Chromium functional checks only; no physical mobile or shared-PC performance acceptance.', 'Exterior models stay cached while inside; the exterior scene is not drawn. Interior models/code load only after Enter; interior geometry/materials are released on Exit.'],
});
console.log(JSON.stringify({ output, packSha256: receipt.packSha256, files: standalone.length, bytes: receipt.outputBytes,
  freezeSha256: digest(readFileSync(resolve(output, 'freeze.json'))),
  bundleReceiptSha256: digest(readFileSync(resolve(output, 'bundle-public.json'))),
  sourceManifestSha256: digest(readFileSync(resolve(output, 'source-files.json'))) }, null, 2));
