import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// These retained author-workspace qualification suites require historical GLBs,
// saved asset revisions or capture receipts. They remain runnable via test:integration.
// The portable gate covers source-only contracts on a fresh checkout; it does not
// claim to replace the exact-asset and browser qualification of a released scene.
const authoredInputs = new Set([
  'packages/farm/tests/unit/hand-clearance.test.ts',
  ...['campus-assets', 'campus-drive', 'campus-freight', 'campus-vegetation', 'campus',
    'determinism', 'ff3-pack', 'ff3-replacements', 'floor-rig', 'revision2-context',
    'revision2-drive', 'revision2-pack', 'revision2-vehicle-intake', 'sanity'].map(name =>
    `packages/foundry-floor/tests/unit/${name}.test.ts`),
  ...['data', 'flights', 'review2-vehicles', 'workloads'].map(name =>
    `packages/golden-gate/tests/unit/${name}.test.ts`),
]);
const root = resolve(import.meta.dir, '..');
const files: string[] = [];
function walk(directory: string) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) walk(path);
    else if (/\.test\.tsx?$/.test(path) && !authoredInputs.has(path)) files.push(`./${path}`);
  }
}
for (const directory of ['packages/scene-kit/tests', 'packages/farm/tests/unit',
  'packages/golden-gate/tests/unit', 'packages/foundry-floor/tests/unit']) walk(directory);
console.log(`Portable source contracts: ${files.length} files; ${authoredInputs.size} author-input suites remain in test:integration.`);
const run = Bun.spawnSync([process.execPath, 'test', ...files.sort(), '--timeout', '20000'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
process.exitCode = run.exitCode;
