/**
 * The toolchain gate's own test.
 *
 * `check-toolchain.mjs` has grown three times -- the engine/CI pins, then the prose
 * every harness reads, then cross-manifest `three` parity -- and each extension was
 * verified by injecting the defect by hand, once, at the time. That is the right
 * check to make and the wrong place to keep it: nothing stops the NEXT edit from
 * leaving a rule that can no longer fail. A regex that quietly stops matching, or a
 * rule that reads the real repository instead of the tree it was handed, turns a gate
 * into decoration -- and a vacuous gate is worse than none, because it is believed.
 *
 * So every case here stages a real copy of the repository's own files, mutates exactly
 * one value, and asserts the gate names it. Staging the real files rather than a
 * synthetic fixture is deliberate: a rule whose phrasing drifts out of step with the
 * document it reads fails the baseline case immediately.
 */
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath`, never `URL#pathname`: the latter keeps a leading slash before a
// Windows drive letter ("/C:/..."), and every fs call on it is ENOENT.
const checker = fileURLToPath(new URL('./check-toolchain.mjs', import.meta.url));
const repository = fileURLToPath(new URL('..', import.meta.url));

/** Everything the gate reads. Missing one surfaces as an ENOENT, not a silent pass. */
const INSPECTED = [
  'toolchain.json',
  'src/runtime-support.mjs',
  'package.json',
  'render-service/package.json',
  'site/package.json',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'README.md',
  'docs/google.md',
  'docs/install.md',
];

async function stage() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-toolchain-'));
  for (const name of INSPECTED) {
    const destination = join(root, name);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repository, name), destination);
  }
  return root;
}

/**
 * Rewrite one staged file. `edit` receives its text and returns the replacement.
 *
 * A no-op edit is an error, not a pass: a mutation whose search string no longer
 * appears injects no defect, the gate correctly reports a clean tree, and the case
 * goes green having tested nothing. That is the exact rot this file exists to prevent,
 * so it is caught here rather than trusted.
 */
async function patch(root, name, edit) {
  const path = join(root, name);
  const before = await readFile(path, 'utf8');
  const after = edit(before);
  expect(after, `the mutation of ${name} changed nothing, so no defect was injected`).not.toBe(
    before,
  );
  await writeFile(path, after);
}

function run(root) {
  const result = spawnSync(process.execPath, [checker, '--files-only', `--root=${root}`], {
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/** Stage, mutate, run, assert -- and always clean up, including on a failed assert. */
async function rejects(name, edit, expected) {
  const root = await stage();
  try {
    await patch(root, name, edit);
    const { status, out } = run(root);
    expect(status, `expected a rejection, got:\n${out}`).toBe(1);
    expect(out).toContain(expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('the staged copy of this repository passes, so every rule below can fail', async () => {
  const root = await stage();
  try {
    const { status, out } = run(root);
    expect(status, out).toBe(0);
    expect(out.trim()).toBe('Toolchain metadata: Bun 1.4.2, Node 22.23.3, npm 12.2.0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('maintainer pins do not become consumer Bun or npm requirements', async () => {
  await rejects(
    'package.json',
    (text) => {
      const pkg = JSON.parse(text);
      pkg.engines.npm = '12.2.0';
      return JSON.stringify(pkg);
    },
    'engines must contain only the end-user Node range',
  );
});

test('a changed maintainer pin is checked against the real build configuration', async () => {
  await rejects(
    'toolchain.json',
    (text) => text.replace('"bun": "1.4.2"', '"bun": "1.4.1"'),
    'packageManager must be bun@1.4.1',
  );
});

test('a stale consumer floor is named independently of maintainer pins', async () => {
  await rejects(
    'package.json',
    (text) => {
      const pkg = JSON.parse(text);
      pkg.engines.node = '22.23.3';
      return JSON.stringify(pkg);
    },
    'engines.node must match the runtime compatibility contract',
  );
});

test('prose that tells a contributor to install the wrong Bun is named', async () => {
  await rejects(
    'AGENTS.md',
    (text) => text.replace('Bun `1.4.2`', 'Bun `1.3.14`'),
    'AGENTS.md must state the supported toolchain',
  );
});

// The exact drift that shipped: the r186 bump moved the engine and the render service
// and left the site's viewer a minor behind, on a loader whose instancing fix the
// engine's own output depends on.
test('three drifting in the site manifest is named, with the manifest', async () => {
  await rejects(
    'site/package.json',
    (text) => text.replace('"three": "0.186.1"', '"three": "0.185.1"'),
    'site/package.json=0.185.1',
  );
});

test('three drifting in the render service is named, with the manifest', async () => {
  await rejects(
    'render-service/package.json',
    (text) => text.replace('"three": "0.186.1"', '"three": "0.187.0"'),
    'render-service/package.json=0.187.0',
  );
});

test('types left a minor behind their own runtime are named', async () => {
  await rejects(
    'package.json',
    (text) => text.replace('"@types/three": "^0.186.0"', '"@types/three": "^0.185.4"'),
    '@types/three ^0.185.4 does not track three 0.186.x',
  );
});

// Generality, not symmetry: `@types/react` describes the hook and JSX surface the site
// compiles against, and the site's viewer renders through @react-three/fiber's custom
// JSX. Types a minor behind the runtime make new API invisible to tsc and removed API
// still typecheck -- the same failure `@types/three` was gated for.
test('react types left behind react are named', async () => {
  await rejects(
    'site/package.json',
    (text) => text.replace('"@types/react": "^19.3.0"', '"@types/react": "^19.2.18"'),
    '@types/react ^19.2.18 does not track react 19.3.x',
  );
});

test('react-dom types left behind react-dom are named', async () => {
  await rejects(
    'site/package.json',
    (text) => text.replace('"@types/react-dom": "^19.3.0"', '"@types/react-dom": "^19.2.7"'),
    '@types/react-dom ^19.2.7 does not track react-dom 19.3.x',
  );
});

// Supply chain: a mutable tag can be repointed at any commit after review.
test('an Action pinned to a tag rather than a commit is named', async () => {
  await rejects(
    '.github/workflows/ci.yml',
    (text) => text.replace(/uses: oven-sh\/setup-bun@[0-9a-f]{40}/u, 'uses: oven-sh/setup-bun@v2'),
    'CI Action ref must use an immutable commit SHA: oven-sh/setup-bun@v2',
  );
});

test('a Pages workflow left on an older Bun is named', async () => {
  await rejects(
    '.github/workflows/pages.yml',
    (text) => text.replace('bun-version: 1.4.2', 'bun-version: 1.3.14'),
    'Pages bun-version must be 1.4.2',
  );
});
