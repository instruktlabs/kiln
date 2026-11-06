import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { materialSourceSchema } from './material-library';
import {
  createMaterialLibraryPayload,
  createMaterialRecordV1,
  createMaterialRecordV2,
  decodeMaterialLibraryPayload,
  FileMaterialLibrary,
} from './material-library-node';
import { exportMaterialMaps } from './material-map-export-node';

const digest = (bytes: Uint8Array | string) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;

const generator = {
  program: { name: 'stone-maps.py', version: '3.1.0', sha256: digest('program') },
  toolkit: [{ name: 'cellular.py', sha256: digest('toolkit') }],
  seed: 41,
  runtimes: [
    { name: 'Python', version: '3.12.4' },
    { name: 'NumPy', version: '2.1.0' },
  ],
};
const license = {
  spdx: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: '',
};

let png: Uint8Array;
let root: string;
beforeAll(async () => {
  png = new Uint8Array(
    await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 90, g: 80, b: 70, alpha: 1 } },
    })
      .png()
      .toBuffer(),
  );
  root = await mkdtemp(join(tmpdir(), 'kiln-material-generated-'));
});
afterAll(() => rm(root, { recursive: true, force: true }));

const source = (overrides: Record<string, unknown> = {}) => ({
  id: 'script',
  kind: 'generated' as const,
  provider: 'Castle project',
  creator: 'Test author',
  license,
  generator,
  originalFiles: [{ name: 'rock.base.png', sha256: digest(png), bytes: png.length }],
  ...overrides,
});
const draftV1 = (src: unknown = source(), originalFile = 'rock.base.png') =>
  ({
    materialId: 'rock',
    name: 'Rock',
    tileable: true,
    sources: [src],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'script',
        transforms: [],
        bytes: png,
        originalFile,
      },
    ],
  }) as never;
const draftV2 = (src: unknown = source(), originalFile = 'rock.base.png') => ({
  schemaVersion: 2,
  materialId: 'rock',
  name: 'Rock',
  tileable: true,
  sources: [src],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'script',
      transforms: [],
      sampler: { minFilter: 'linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' },
      bytes: png,
      originalFile,
    },
  ],
});
const recipeMap = {
  slot: 'baseColor',
  sourceId: 'script',
  transforms: [],
  procedural: {
    schemaVersion: 2,
    size: 4,
    usage: 'albedo',
    layers: [{ op: 'solid', color: 0x808080 }],
  },
};

describe.each([
  ['V1', (src?: unknown, file?: string) => createMaterialRecordV1(draftV1(src, file))],
  ['V2', (src?: unknown, file?: string) => createMaterialRecordV2(draftV2(src, file))],
])('%s generated material source (#311)', (name, create) => {
  test('supplied maps create a record that verifies, imports and round-trips', async () => {
    const record = await create();
    const library = new FileMaterialLibrary(join(root, `first-${name}`));
    const [saved] = await library.import([record]);
    expect(saved!.sources[0]).toMatchObject({ kind: 'generated', generator });

    const payload = await createMaterialLibraryPayload([
      await library.read('rock', saved!.revisionId),
    ]);
    const receiving = new FileMaterialLibrary(join(root, `second-${name}`));
    const [imported] = await receiving.import(
      await decodeMaterialLibraryPayload(JSON.parse(JSON.stringify(payload))),
    );
    expect(imported!.revisionId).toBe(saved!.revisionId);
  });

  test('the map export sidecar carries the generator record', async () => {
    const outDir = join(root, `maps-${name}`);
    await exportMaterialMaps(await create(), { outDir, size: 4, repeatMeters: 1 });
    const sidecar = JSON.parse(await readFile(join(outDir, 'rock.maps.json'), 'utf8'));
    expect(sidecar.material.sources[0].generator).toEqual(generator);
  });

  test('a map naming a file the source does not list is refused by name', async () => {
    await expect(create(source(), 'missing.png')).rejects.toThrow(/original.*file/i);
  });

  test('the generator is covered by the revision hash', async () => {
    const other = await create(source({ generator: { ...generator, seed: 42 } }));
    expect(other.manifest.revisionId).not.toBe((await create()).manifest.revisionId);
  });
});

describe('generated source rules (#311)', () => {
  const issues = (value: unknown) => {
    const parsed = materialSourceSchema.safeParse(value);
    return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  };

  test('a generated source needs no URL, and may still state one', () => {
    expect(issues(source())).toEqual([]);
    expect(issues(source({ assetUrl: 'https://example.com/rock' }))).toEqual([]);
  });

  test('a generated source without a generator is refused by name', () => {
    expect(issues(source({ generator: undefined })).join()).toMatch(/generator/i);
  });

  test('a generated source without original files is refused by name', () => {
    expect(issues(source({ originalFiles: [] })).join()).toMatch(/original file/i);
  });

  test('a generator on any other kind is refused by name', () => {
    expect(
      issues(
        source({
          kind: 'external',
          assetUrl: 'https://example.com/rock',
        }),
      ).join(),
    ).toMatch(/generator/i);
    expect(issues(source({ kind: 'procedural', originalFiles: [] })).join()).toMatch(/generator/i);
  });

  test.each([
    ['a program without a hash', { ...generator, program: { name: 'x', version: '1' } }],
    ['an unknown generator field', { ...generator, command: 'python x.py' }],
    ['a fractional seed', { ...generator, seed: 1.5 }],
    ['no runtimes', { ...generator, runtimes: [] }],
  ])('refuses %s', (_name, value) => {
    expect(issues(source({ generator: value })).length).toBeGreaterThan(0);
  });

  test('external still requires an HTTP(S) URL', () => {
    const external = {
      id: 'scan',
      kind: 'external',
      provider: 'P',
      creator: 'C',
      license,
      originalFiles: [{ name: 'a.png', sha256: digest('a'), bytes: 1 }],
    };
    expect(issues(external).join()).toMatch(/source URL/);
    expect(issues({ ...external, assetUrl: 'file:///tmp/a.png' }).join()).toMatch(/HTTP\(S\)/);
    expect(issues({ ...external, assetUrl: 'https://example.com/a' })).toEqual([]);
  });

  test('a recipe map on a generated source is refused by name', async () => {
    const draft = { ...(draftV1() as object), maps: [recipeMap] };
    await expect(createMaterialRecordV1(draft as never)).rejects.toThrow(/recipe.*generated/i);
    const v2 = {
      ...draftV2(),
      maps: [
        {
          ...recipeMap,
          sampler: { minFilter: 'linear', magFilter: 'linear', wrapS: 'repeat', wrapT: 'repeat' },
        },
      ],
    };
    await expect(createMaterialRecordV2(v2)).rejects.toThrow(/recipe.*generated/i);
  });
});
