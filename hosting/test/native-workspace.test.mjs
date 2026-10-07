import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { before, test } from 'node:test';
import { build } from 'esbuild';
import { createMaterialRecordV1 } from '../../lib/material-library-node.js';

let NativeMaterialWorkspace, first, second;
before(async () => {
  const output = new URL('../../.cache/native-workspace-test/workspace.mjs', import.meta.url);
  await mkdir(fileURLToPath(new URL('./', output)), { recursive: true });
  await build({
    entryPoints: [fileURLToPath(new URL('../src/native-workspace.ts', import.meta.url))],
    outfile: fileURLToPath(output),
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    alias: Object.fromEntries(
      [
        ['workspace', 'workspace'],
        ['material-library', 'material-library'],
        ['material-library/node', 'material-library-node'],
      ].map(([name, file]) => [
        `@instruktlabs/kiln/${name}`,
        fileURLToPath(new URL(`../../lib/${file}.js`, import.meta.url)),
      ]),
    ),
  });
  ({ NativeMaterialWorkspace } = await import(output));
  const create = (seed) =>
    createMaterialRecordV1({
      materialId: 'stone',
      name: 'Stone',
      tileable: true,
      sources: [
        {
          id: 'authored',
          kind: 'procedural',
          provider: 'Kiln',
          creator: 'Test author',
          license: {
            spdx: 'CC0-1.0',
            url: 'https://creativecommons.org/publicdomain/zero/1.0/',
            attribution: '',
          },
          originalFiles: [],
        },
      ],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'authored',
          transforms: [],
          procedural: {
            schemaVersion: 2,
            size: 8,
            usage: 'albedo',
            layers: [
              { op: 'noise', colorA: 0x779944, colorB: 0xeeeecc, seed, scale: 4, octaves: 2 },
            ],
          },
        },
      ],
    });
  [first, second] = await Promise.all([create(17), create(18)]);
});
const pin = (record) => ({
  resourceId: record.manifest.materialId,
  revisionId: record.manifest.revisionId,
  sha256: record.manifest.revisionId,
});
const library = {
  read: async (id, rev) => {
    const record = [first, second].find(
      (r) => r.manifest.materialId === id && r.manifest.revisionId === rev,
    );
    if (!record) throw Error('not found');
    return structuredClone(record);
  },
};
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('material binding stays isolated across overlapping operations and disappears outside them', async () => {
  const workspace = new NativeMaterialWorkspace(library);
  const firstReady = deferred(),
    secondReady = deferred();
  const run = (record, ready, other) =>
    workspace.run({ materialDependencies: [pin(record)] }, async () => {
      ready.resolve();
      await other.promise;
      assert.deepEqual(workspace.current().materialDependencies, [pin(record)]);
      assert.deepEqual(workspace.current().materialResources.records[0].manifest, record.manifest);
      assert.equal(workspace.current().project, undefined);
      return record.manifest.revisionId;
    });
  assert.equal(workspace.current(), undefined);
  const results = await Promise.all([
    run(first, firstReady, secondReady),
    run(second, secondReady, firstReady),
  ]);
  assert.deepEqual(results, [first.manifest.revisionId, second.manifest.revisionId]);
  assert.equal(workspace.current(), undefined);
});

test('nested operations inherit pins, explicitly replace revisions and can select standalone without inherited pins', async () => {
  const workspace = new NativeMaterialWorkspace(library);
  await workspace.run({ materialDependencies: [pin(first)] }, async () => {
    const binding = workspace.current();
    await workspace.run({}, async () => assert.equal(workspace.current(), binding));
    await workspace.run({ materialDependencies: [pin(second)] }, async () => {
      assert.deepEqual(workspace.current().materialDependencies, [pin(second)]);
    });
    await workspace.run({ projectId: null }, async () => {
      assert.deepEqual(workspace.current().materialDependencies, []);
      assert.deepEqual(workspace.current().materialResources.records, []);
    });
    assert.equal(workspace.current(), binding);
  });
});

test('invalid identities, hashes, oversized pin sets and unsupported projects fail before loading material bytes', async () => {
  let reads = 0,
    executions = 0;
  const workspace = new NativeMaterialWorkspace({
    read: async (...args) => {
      reads++;
      return library.read(...args);
    },
  });
  for (const selection of [
    { projectId: 'local-only' },
    { projectRevision: `r_0000000001_${'a'.repeat(64)}` },
    { materialDependencies: [{ ...pin(first), resourceId: '../escape' }] },
    { materialDependencies: [{ ...pin(first), revisionId: `${first.manifest.revisionId}\n` }] },
    {
      materialDependencies: [
        pin(first),
        { ...pin(second), resourceId: 'other', sha256: first.manifest.revisionId },
      ],
    },
    {
      materialDependencies: Array.from({ length: 17 }, (_, i) => ({
        ...pin(first),
        resourceId: `resource-${i}`,
      })),
    },
  ])
    await assert.rejects(
      workspace.run(selection, async () => {
        executions++;
      }),
    );
  assert.equal(reads, 0);
  assert.equal(executions, 0);
});

test('missing and identity-swapped library records cannot enter an evaluation binding', async () => {
  const missing = new NativeMaterialWorkspace({
    read: async () => {
      throw Error('private transport detail');
    },
  });
  await assert.rejects(
    missing.run({ materialDependencies: [pin(first)] }, async () =>
      assert.fail('must not execute'),
    ),
    (error) =>
      /Locked material unavailable/.test(error.message) &&
      !error.message.includes('private transport detail'),
  );
  const swapped = new NativeMaterialWorkspace({ read: async () => second });
  await assert.rejects(
    swapped.run({ materialDependencies: [pin(first)] }, async () =>
      assert.fail('must not execute'),
    ),
    /identity/,
  );
});
