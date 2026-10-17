import { afterEach, expect, spyOn, test } from 'bun:test';
import { lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import * as atomicDirectory from './atomic-directory';
import { canonicalMaterialJson } from './material-library';
import { createMaterialRecordV1, FileMaterialLibrary } from './material-library-node';

const publish = atomicDirectory.renameDirectoryAtomically;
const roots: string[] = [];
let publicationSpy:
  | ReturnType<typeof spyOn<typeof atomicDirectory, 'renameDirectoryAtomically'>>
  | undefined;
afterEach(async () => {
  publicationSpy?.mockRestore();
  publicationSpy = undefined;
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Invalid test root');
    await rm(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-publication-'));
  roots.push(root);
  const record = await createMaterialRecordV1({
    materialId: 'plaster',
    name: 'Plaster',
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
          usage: 'albedo',
          size: 8,
          layers: [
            {
              op: 'noise',
              colorA: 0xb9a89a,
              colorB: 0xe5d8c9,
              seed: 17,
              scale: 4,
              octaves: 2,
            },
          ],
        },
      },
    ],
  });
  const parent = join(root, record.manifest.materialId);
  const destination = join(parent, record.manifest.revisionId.slice(7));
  return {
    root,
    record,
    parent,
    destination,
    library: new FileMaterialLibrary(root),
  };
}

test('material publication retries transient Windows denial with intact staged bytes', async () => {
  const { record, parent, destination, library } = await fixture();
  const denied = Object.assign(new Error('sharing violation'), {
    code: 'EPERM',
  });
  let attempts = 0;
  const delays: number[] = [];
  publicationSpy = spyOn(atomicDirectory, 'renameDirectoryAtomically').mockImplementation(
    (stage, dest) =>
      publish(stage, dest, {
        platform: 'win32',
        renameOperation: async (from, to) => {
          expect(await readFile(join(stage, 'manifest.json'), 'utf8')).toBe(
            canonicalMaterialJson(record.manifest),
          );
          expect(new Uint8Array(await readFile(join(stage, 'baseColor.png')))).toEqual(
            Uint8Array.from(record.files['baseColor.png']!),
          );
          if (++attempts < 3) throw denied;
          await rename(from, to);
        },
        pause: async (milliseconds) => {
          delays.push(milliseconds);
          expect(await lstat(dest).catch(() => undefined)).toBeUndefined();
        },
      }),
  );
  expect(await library.import([record])).toEqual([record.manifest]);
  // These assertions also fail if the publisher bypasses the fault-injected helper.
  expect(attempts).toBe(3);
  expect(delays).toEqual([20, 50]);
  expect(await library.read(record.manifest.materialId, record.manifest.revisionId)).toEqual(
    record,
  );
  expect(await readdir(parent)).toEqual([record.manifest.revisionId.slice(7)]);
  expect(await readFile(join(destination, 'manifest.json'), 'utf8')).toBe(
    canonicalMaterialJson(record.manifest),
  );
});

test('persistent Windows publication denial rejects and removes only the staging directory', async () => {
  const { record, parent, destination, library } = await fixture();
  const denied = Object.assign(new Error('permission denied'), {
    code: 'EPERM',
  });
  let attempts = 0;
  let waited = 0;
  publicationSpy = spyOn(atomicDirectory, 'renameDirectoryAtomically').mockImplementation(
    (stage, dest) =>
      publish(stage, dest, {
        platform: 'win32',
        renameOperation: async () => {
          expect(new Uint8Array(await readFile(join(stage, 'baseColor.png')))).toEqual(
            Uint8Array.from(record.files['baseColor.png']!),
          );
          attempts++;
          throw denied;
        },
        pause: async (milliseconds) => {
          waited += milliseconds;
        },
      }),
  );
  await expect(library.import([record])).rejects.toBe(denied);
  expect(attempts).toBe(6);
  expect(waited).toBe(770);
  expect(await lstat(destination).catch(() => undefined)).toBeUndefined();
  expect(await readdir(parent)).toEqual([]);
});

test('a corrupted existing material revision is rejected without replacing its files', async () => {
  const { record, parent, destination, library } = await fixture();
  await library.import([record]);
  const mapPath = join(destination, 'baseColor.png');
  await writeFile(mapPath, 'corrupted existing material');
  const manifestBefore = await readFile(join(destination, 'manifest.json'));
  const collision = Object.assign(new Error('destination exists'), {
    code: 'EPERM',
  });
  let attempts = 0;
  publicationSpy = spyOn(atomicDirectory, 'renameDirectoryAtomically').mockImplementation(
    (stage, dest) =>
      publish(stage, dest, {
        platform: 'win32',
        renameOperation: async () => {
          attempts++;
          throw collision;
        },
        pause: async () => {
          throw new Error('Existing destination must not retry');
        },
      }),
  );
  await expect(library.import([record])).rejects.toBe(collision);
  expect(attempts).toBe(1);
  expect(await readFile(mapPath, 'utf8')).toBe('corrupted existing material');
  expect(await readFile(join(destination, 'manifest.json'))).toEqual(manifestBefore);
  expect(await readdir(parent)).toEqual([record.manifest.revisionId.slice(7)]);
  expect((await readdir(destination)).sort()).toEqual(['baseColor.png', 'manifest.json']);
});

test('concurrent identical material imports publish one verified revision and clean both stages', async () => {
  const { record, parent, library } = await fixture();
  let arrivals = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  publicationSpy = spyOn(atomicDirectory, 'renameDirectoryAtomically').mockImplementation(
    async (stage, dest) => {
      if (++arrivals === 2) release();
      await ready;
      await publish(stage, dest);
    },
  );
  const results = await Promise.all([library.import([record]), library.import([record])]);
  expect(arrivals).toBe(2);
  expect(results).toEqual([[record.manifest], [record.manifest]]);
  expect(await library.read(record.manifest.materialId, record.manifest.revisionId)).toEqual(
    record,
  );
  expect(await readdir(parent)).toEqual([record.manifest.revisionId.slice(7)]);
});
