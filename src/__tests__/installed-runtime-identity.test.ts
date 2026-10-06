import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { installedRuntimeIdentity } from '../runtime-identity';

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
async function directory(prefix: string) {
  const base = resolve(import.meta.dir, '../../tmp');
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, prefix));
}
async function fixture(root: string) {
  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'geometry-runtime', 'data'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@instruktlabs/kiln',
      version: '1.0.0',
      dependencies: { 'geometry-runtime': '^1' },
    }),
  );
  await writeFile(join(root, 'dist', 'evaluator-worker.mjs'), 'worker-v1');
  await writeFile(
    join(root, 'dist', 'build.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: {
        worker: {
          file: 'evaluator-worker.mjs',
          bundleHash: sha('worker-v1'),
          identity: sha('source-v1'),
        },
      },
    }),
  );
  await writeFile(
    join(root, 'node_modules', 'geometry-runtime', 'package.json'),
    JSON.stringify({ name: 'geometry-runtime', version: '1.0.0', main: 'index.js' }),
  );
  await writeFile(
    join(root, 'node_modules', 'geometry-runtime', 'index.js'),
    'export const value = 1;',
  );
  await writeFile(
    join(root, 'node_modules', 'geometry-runtime', 'data', 'kernel.wasm'),
    'kernel-v1',
  );
}

it('fingerprints installed code and native assets, not dependency ranges or installation paths', async () => {
  const a = await directory('kiln-runtime-a-');
  const b = await directory('kiln-runtime-b-');
  try {
    await fixture(a);
    await fixture(b);
    const first = await installedRuntimeIdentity(a);
    expect(first.identity).toMatch(/^sha256:/);
    expect(first.files).toBeGreaterThanOrEqual(3);
    expect((await installedRuntimeIdentity(b)).identity).toBe(first.identity);
    await writeFile(
      join(b, 'node_modules', 'geometry-runtime', 'data', 'kernel.wasm'),
      'kernel-v2',
    );
    expect((await installedRuntimeIdentity(b)).identity).not.toBe(first.identity);
    await writeFile(join(a, 'dist', 'evaluator-worker.mjs'), 'tampered-worker');
    expect((await installedRuntimeIdentity(a)).identity).toBeUndefined();
  } finally {
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  }
});

it('fails closed for missing dependencies and bounded scan overflow', async () => {
  const root = await directory('kiln-runtime-limits-');
  try {
    await fixture(root);
    expect((await installedRuntimeIdentity(root, { maxBytes: 1 })).identity).toBeUndefined();
    expect((await installedRuntimeIdentity(root, { maxFiles: 1 })).identity).toBeUndefined();
    await writeFile(
      join(root, 'node_modules', 'geometry-runtime', 'package.json'),
      JSON.stringify({
        name: 'geometry-runtime',
        version: '1.0.0',
        main: 'index.js',
        dependencies: { missing: '1' },
      }),
    );
    const missing = await installedRuntimeIdentity(root);
    expect(missing.identity).toBeUndefined();
    expect(missing.reason).toContain('missing');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('records absent transitive peers separately and fingerprints their installed presence', async () => {
  const root = await directory('kiln-runtime-peers-');
  try {
    await fixture(root);
    await writeFile(
      join(root, 'node_modules/geometry-runtime/package.json'),
      JSON.stringify({
        name: 'geometry-runtime',
        version: '1.0.0',
        main: 'index.js',
        peerDependencies: { 'kiln-fixture-compiler': '^1', 'kiln-fixture-adapter': '^1' },
        peerDependenciesMeta: { 'kiln-fixture-adapter': { optional: true } },
        optionalDependencies: { 'kiln-fixture-native': '^1' },
      }),
    );
    const absent = await installedRuntimeIdentity(root);
    expect(absent.identity).toMatch(/^sha256:/);
    expect(absent.absentPackages).toEqual([
      { path: 'dependencies/geometry-runtime/kiln-fixture-adapter', kind: 'peer-absent' },
      { path: 'dependencies/geometry-runtime/kiln-fixture-compiler', kind: 'peer-absent' },
      { path: 'dependencies/geometry-runtime/kiln-fixture-native', kind: 'optional-absent' },
    ]);
    await mkdir(join(root, 'node_modules/kiln-fixture-compiler'));
    await writeFile(
      join(root, 'node_modules/kiln-fixture-compiler/package.json'),
      JSON.stringify({
        name: 'kiln-fixture-compiler',
        version: '1.0.0',
        main: 'index.js',
      }),
    );
    await writeFile(
      join(root, 'node_modules/kiln-fixture-compiler/index.js'),
      'export const compiler = 1;',
    );
    const present = await installedRuntimeIdentity(root);
    expect(present.identity).toMatch(/^sha256:/);
    expect(present.identity).not.toBe(absent.identity);
    expect(present.absentPackages).toHaveLength(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('does not relabel a missing regular dependency as an absent peer', async () => {
  const root = await directory('kiln-runtime-required-');
  try {
    await fixture(root);
    await writeFile(
      join(root, 'node_modules/geometry-runtime/package.json'),
      JSON.stringify({
        name: 'geometry-runtime',
        version: '1.0.0',
        main: 'index.js',
        dependencies: { 'kiln-fixture-required': '^1' },
        peerDependencies: { 'kiln-fixture-required': '^1' },
        peerDependenciesMeta: { 'kiln-fixture-required': { optional: true } },
      }),
    );
    const result = await installedRuntimeIdentity(root);
    expect(result.identity).toBeUndefined();
    expect(result.reason).toContain('kiln-fixture-required');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const declaration of ['peerDependencies', 'optionalDependencies']) {
  it(`fails closed for an installed but unidentified ${declaration} entry`, async () => {
    const root = await directory('kiln-runtime-unidentified-');
    try {
      await fixture(root);
      await writeFile(
        join(root, 'node_modules/geometry-runtime/package.json'),
        JSON.stringify({
          name: 'geometry-runtime',
          version: '1.0.0',
          main: 'index.js',
          [declaration]: { 'kiln-fixture-broken': '^1' },
        }),
      );
      await mkdir(join(root, 'node_modules/kiln-fixture-broken'));
      await writeFile(join(root, 'node_modules/kiln-fixture-broken/package.json'), '{broken json');
      const result = await installedRuntimeIdentity(root);
      expect(result.identity).toBeUndefined();
      expect(result.reason).toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

it('keeps engine-owned generation peers outside the worker closure', async () => {
  const root = await directory('kiln-runtime-generation-peers-');
  try {
    await fixture(root);
    const original = await installedRuntimeIdentity(root);
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({
        name: '@instruktlabs/kiln',
        version: '1.0.0',
        dependencies: { 'geometry-runtime': '^1' },
        peerDependencies: { 'kiln-fixture-generation': '^1' },
        peerDependenciesMeta: { 'kiln-fixture-generation': { optional: true } },
      }),
    );
    expect((await installedRuntimeIdentity(root)).identity).toBe(original.identity);
    await mkdir(join(root, 'node_modules/kiln-fixture-generation'));
    await writeFile(
      join(root, 'node_modules/kiln-fixture-generation/package.json'),
      '{not fingerprintable',
    );
    expect((await installedRuntimeIdentity(root)).identity).toBe(original.identity);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('does not treat inherited object keys as optional dependency declarations', async () => {
  const root = await directory('kiln-runtime-own-declarations-');
  try {
    await fixture(root);
    await writeFile(
      join(root, 'node_modules/geometry-runtime/package.json'),
      JSON.stringify({
        name: 'geometry-runtime',
        version: '1.0.0',
        dependencies: { constructor: '^1' },
      }),
    );
    const result = await installedRuntimeIdentity(root);
    expect(result.identity).toBeUndefined();
    expect(result.reason).toContain('constructor');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
