import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const filesOnly = process.argv.includes('--files-only');
// The tree to inspect, so the gate's own test can run it against a staged copy with
// one value mutated. Defaults to this repository, which is every real invocation.
// Every rule below reads through `at()` -- a rule that reaches for `import.meta.url`
// directly would silently pass against the real repo no matter what the test staged.
const rootFlag = process.argv.find((argument) => argument.startsWith('--root='));
const root = rootFlag
  ? pathToFileURL(`${resolve(rootFlag.slice('--root='.length))}/`)
  : new URL('../', import.meta.url);
const at = (name) => new URL(name, root);
const packageJson = JSON.parse(await readFile(at('package.json'), 'utf8'));
const workflow = await readFile(at('.github/workflows/ci.yml'), 'utf8');
const pages = await readFile(at('.github/workflows/pages.yml'), 'utf8');

const toolchain = JSON.parse(await readFile(at('toolchain.json'), 'utf8'));
for (const name of ['bun', 'node', 'npm']) {
  if (!/^\d+\.\d+\.\d+$/.test(toolchain[name] ?? ''))
    throw new Error(`toolchain.${name} must pin a stable release`);
}
const { CORE_NODE_RANGE } = await import(at('src/runtime-support.mjs').href);
const expectedPackageManager = `bun@${toolchain.bun}`;
const errors = [];

if (packageJson.packageManager !== expectedPackageManager) {
  errors.push(`packageManager must be ${expectedPackageManager}`);
}
if (Object.keys(packageJson.engines ?? {}).some((name) => name !== 'node')) {
  errors.push('engines must contain only the end-user Node range');
}
if (packageJson.engines?.node !== CORE_NODE_RANGE) {
  errors.push(`engines.node must match the runtime compatibility contract: ${CORE_NODE_RANGE}`);
}
const versionPattern = (value) => value.replaceAll('.', '\\.');
if (
  !new RegExp(`^\\s*bun-version:\\s*${versionPattern(toolchain.bun)}\\s*$`, 'mu').test(workflow)
) {
  errors.push(`CI bun-version must be ${toolchain.bun}`);
}
if (
  !new RegExp(`^\\s*node-version:\\s*${versionPattern(toolchain.node)}\\s*$`, 'mu').test(workflow)
) {
  errors.push(`CI node-version must be ${toolchain.node}`);
}
if (!workflow.includes(`npm install --global npm@${toolchain.npm}`)) {
  errors.push(`CI npm version must be ${toolchain.npm}`);
}
if (!new RegExp(`^\\s*bun-version:\\s*${toolchain.bun}\\s*$`, 'mu').test(pages)) {
  errors.push(`Pages bun-version must be ${toolchain.bun}`);
}
// The gate enforced package.json and ci.yml but never the prose, so the guide
// went on telling every harness to install Bun 1.3.14 for a day after the bump --
// the first command a new contributor runs, failing against the checker below it.
// Dated receipts under docs/evaluation/ are deliberately absent: they record the
// toolchain a run actually used, and rewriting one to match a new pin would
// falsify it.
// three ships in three manifests -- the engine, the GPU render service, and the
// site's viewer -- and they must agree. Not tidiness: kiln EMITS
// EXT_mesh_gpu_instancing, and r186 fixed that extension's custom instance
// attribute sharing in GLTFLoader, so a site one minor behind renders the gallery
// with an unfixed loader for an extension the engine writes. The r186 bump moved
// the engine and the service and missed the site, which is why this is a gate and
// not a note: the same class of drift had already been caught in the prose that
// morning, by a person, hours earlier.
// The scene workspace is the fourth: its own pin check holds every scene package to
// APPROVED_PINS in scenes/scripts/check-pins.ts, but the scenes workflow starts only
// on scenes changes, and this gate runs on every pull request. Dependabot leaves three
// alone (docs/three-upgrades.md), so a bump is one deliberate change across all four.
const manifests = [
  'package.json',
  'render-service/package.json',
  'site/package.json',
  'scenes/package.json',
];
const threePins = new Map();
/** Leading range operator off a pin, so `^19.3.0` and `19.3.0` compare the same. */
const release = (range) => String(range).replace(/^[\^~><=\s]+/u, '');
/** The release line a pin belongs to: `0.186.0` -> `0.186`, `19.3.0` -> `19.3`. */
const line = (range) => release(range).split('.').slice(0, 2).join('.');
/** `@types/react-dom` -> `react-dom`, `@types/a__b` -> `@a/b` (the DefinitelyTyped rule). */
const runtimeOf = (types) => {
  const stem = types.slice('@types/'.length);
  return stem.includes('__') ? `@${stem.replace('__', '/')}` : stem;
};
for (const name of manifests) {
  const manifest = JSON.parse(await readFile(at(name), 'utf8'));
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  if (deps.three !== undefined) threePins.set(name, deps.three);
  // Types track their runtime's release line. A caret range is fine; a DIFFERENT line
  // is the bug, because the types then describe a release the runtime is not running:
  // new API is invisible to tsc and removed API still typechecks. Stated once, over
  // every `@types/*` in the tree, rather than per package -- the rule was written for
  // `@types/three` and holds identically for `@types/react`, which the site compiles
  // its @react-three/fiber JSX against. A types package whose runtime this manifest
  // does not pin is skipped: there is nothing here to be out of step with.
  for (const types of Object.keys(deps).filter((key) => key.startsWith('@types/'))) {
    const runtime = runtimeOf(types);
    if (deps[runtime] === undefined) continue;
    const wanted = line(deps[runtime]);
    if (wanted && !release(deps[types]).startsWith(`${wanted}.`)) {
      errors.push(`${name}: ${types} ${deps[types]} does not track ${runtime} ${wanted}.x`);
    }
  }
}
{
  const distinct = new Set(threePins.values());
  if (distinct.size > 1) {
    const shown = [...threePins].map(([name, pin]) => `${name}=${pin}`).join(', ');
    errors.push(
      `three must be identical in every manifest that pins it: ${shown}. Move every tree in one change: docs/three-upgrades.md`,
    );
  }
}
const guidance = [
  ['AGENTS.md', [`Bun \`${toolchain.bun}\`; Node \`${toolchain.node}\`; npm \`${toolchain.npm}\``]],
  ['CONTRIBUTING.md', [`${toolchain.bun}, Node ${toolchain.node} and npm ${toolchain.npm}`]],
  ['docs/google.md', [`Bun ${toolchain.bun} and Node ${toolchain.node}`]],
];
for (const [name, phrases] of guidance) {
  const body = await readFile(at(name), 'utf8');
  for (const phrase of phrases) {
    if (!body.includes(phrase))
      errors.push(`${name} must state the supported toolchain: ${phrase}`);
  }
}
if (!workflow.includes('run: bun run check:toolchain')) {
  errors.push('CI must run the toolchain metadata check');
}
for (const ref of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
  if (!ref[1].startsWith('./') && !/@[0-9a-f]{40}$/i.test(ref[1]))
    errors.push(`CI Action ref must use an immutable commit SHA: ${ref[1]}`);
}
if (!filesOnly && process.versions.bun !== toolchain.bun) {
  errors.push(`runtime Bun must be ${toolchain.bun} (found ${process.versions.bun ?? 'Node'})`);
}
if (!filesOnly) {
  const revision = spawnSync('bun', ['--revision'], { encoding: 'utf8', shell: false });
  const value = String(revision.stdout || revision.stderr || '').trim();
  if (
    revision.status !== 0 ||
    !new RegExp(`^${versionPattern(toolchain.bun)}\\+[0-9a-f]+$`, 'i').test(value)
  ) {
    errors.push(`runtime Bun must be stable ${toolchain.bun} (found ${value || 'missing'})`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Toolchain metadata: Bun ${toolchain.bun}, Node ${toolchain.node}, npm ${toolchain.npm}`,
);
