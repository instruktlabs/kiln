import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  materialLibraryPortableSpec,
  materialLibraryResourceId,
  validateMaterialRecordShape,
  type MaterialRecordV1,
  type MaterialSourceV1,
} from './material-library';
import {
  createMaterialRecordV1,
  createMaterialLibraryPayload,
  createMaterialLibraryTextureResolver,
  decodeMaterialLibraryPayload,
  FileMaterialLibrary,
  verifyMaterialRecordV1,
} from './material-library-node';
import { compilePortableMaterialSpecV2 } from './portable-material-runtime';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const digest = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const source: MaterialSourceV1 = {
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
};
async function example(seed = 17): Promise<MaterialRecordV1> {
  return createMaterialRecordV1({
    materialId: 'warm-plaster',
    name: 'Warm plaster',
    tags: ['architecture'],
    tileable: true,
    physicalSizeMeters: { width: 2, height: 2 },
    sources: [source],
    parameters: { roughness: 0.85, metalness: 0 },
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: {
          schemaVersion: 2,
          usage: 'albedo',
          size: 8,
          layers: [{ op: 'noise', colorA: 0xb9a89a, colorB: 0xe5d8c9, seed, scale: 4, octaves: 2 }],
        },
      },
    ],
  });
}

describe('optional material records', () => {
  test('procedural maps retain canonical seeds and exact portable pixels with immutable identity', async () => {
    const a = await example();
    const b = await example();
    expect(a).toEqual(b);
    expect(a.manifest.revisionId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(a.manifest.maps[0]?.procedural?.spec.layers[0]).toMatchObject({ seed: 17 });
    expect(a.manifest.maps[0]?.colorSpace).toBe('srgb');
    expect(a.manifest.maps[0]?.sha256).toBe(digest(a.files['baseColor.png']!));
    expect((await example(18)).manifest.revisionId).not.toBe(a.manifest.revisionId);
    await verifyMaterialRecordV1(a);
  });

  test('external maps require explicit original hashes, license, and matching portable conventions', async () => {
    const bytes = new Uint8Array(
      await sharp({ create: { width: 4, height: 4, channels: 3, background: '#8080ff' } })
        .png()
        .toBuffer(),
    );
    const record = await createMaterialRecordV1({
      materialId: 'stone',
      name: 'Stone',
      tileable: true,
      sources: [
        {
          ...source,
          id: 'scan',
          kind: 'external',
          provider: 'Example provider',
          assetUrl: 'https://example.com/stone',
          originalFiles: [{ name: 'normal-gl.png', sha256: digest(bytes), bytes: bytes.length }],
        },
      ],
      maps: [
        {
          slot: 'normal',
          sourceId: 'scan',
          originalFile: 'normal-gl.png',
          bytes,
          normalConvention: 'opengl',
          transforms: [],
        },
      ],
    });
    expect(record.manifest.maps[0]).toMatchObject({
      normalConvention: 'opengl',
      colorSpace: 'linear',
    });
    const forged = structuredClone(record);
    forged.manifest.maps[0]!.colorSpace = 'srgb';
    expect(() => validateMaterialRecordShape(forged)).toThrow(/color|convention/i);
    const unlicensed = structuredClone(record);
    delete (unlicensed.manifest.sources[0] as unknown as Record<string, unknown>)['license'];
    expect(() => validateMaterialRecordShape(unlicensed)).toThrow();
  });

  test('tampered map bytes or metadata fail instead of silently changing an existing identity', async () => {
    const record = await example();
    record.files['baseColor.png']![40] = record.files['baseColor.png']![40]! ^ 1;
    await expect(verifyMaterialRecordV1(record)).rejects.toThrow(/integrity|hash/i);
    const metadata = await example();
    metadata.manifest.physicalSizeMeters!.width = 3;
    await expect(verifyMaterialRecordV1(metadata)).rejects.toThrow(/identity|hash/i);
  });

  test('rejects executable/accessor data without invoking it and rejects path-shaped inventory names', async () => {
    const record = await example();
    let invoked = false;
    Object.defineProperty(record.manifest, 'name', {
      get() {
        invoked = true;
        return 'unsafe';
      },
      enumerable: true,
    });
    expect(() => validateMaterialRecordShape(record)).toThrow(/data|accessor|JSON/i);
    expect(invoked).toBe(false);
    const path = await example();
    (path.manifest.maps[0] as unknown as Record<string, unknown>)['file'] = '../escape.png';
    expect(() => validateMaterialRecordShape(path)).toThrow();
  });

  test('portable payload carries complete offline bytes and rejects mutation or extra files', async () => {
    const record = await example();
    const payload = await createMaterialLibraryPayload([record]);
    const decoded = await decodeMaterialLibraryPayload(JSON.parse(JSON.stringify(payload)));
    expect(decoded).toEqual([record]);
    record.files['baseColor.png']!.fill(0);
    expect((await decodeMaterialLibraryPayload(payload))[0]!.files['baseColor.png']![0]).toBe(137);
    const extra = await example();
    extra.files['source.js'] = new Uint8Array([1]);
    await expect(createMaterialLibraryPayload([extra])).rejects.toThrow(/inventory/i);
  });

  test('host resolver loads only injected revisions and protects canonical bytes from caller mutations', async () => {
    const record = await example();
    const resolver = await createMaterialLibraryTextureResolver([record]);
    const id = materialLibraryResourceId(record.manifest, 'baseColor');
    record.files['baseColor.png']!.fill(0);
    const loaded = await resolver.loadApprovedTexture(id);
    expect(loaded.userData['kilnTexture']).toMatchObject({ usage: 'albedo' });
    expect(loaded.userData['kilnMaterialResource']).toMatchObject({
      revisionId: record.manifest.revisionId,
    });
    await expect(resolver.loadApprovedTexture('https://example.com/texture.png')).rejects.toThrow();
    await expect(
      resolver.loadApprovedTexture(
        materialLibraryResourceId((await example(18)).manifest, 'baseColor'),
      ),
    ).rejects.toThrow();
  });

  test('portable material compilation uses the injected resolver and validates slots before loading', async () => {
    const record = await example();
    const resolver = await createMaterialLibraryTextureResolver([record]);
    const spec = materialLibraryPortableSpec(record.manifest);
    const material = await compilePortableMaterialSpecV2(spec, { resolver });
    expect((material.map!.image as { width: number }).width).toBe(8);
    expect(material.roughness).toBe(0.85);
    await expect(
      compilePortableMaterialSpecV2(
        { ...spec, textures: { normal: spec.textures?.baseColor } },
        { resolver },
      ),
    ).rejects.toThrow(/slot|requires/i);
  });

  test('filesystem library round-trips idempotently and verifies persisted bytes on every read', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiln-materials-'));
    roots.push(root);
    const library = new FileMaterialLibrary(root);
    const record = await example();
    await library.import([record]);
    await library.import([record]);
    expect(await library.list()).toEqual([record.manifest]);
    expect(await library.read(record.manifest.materialId, record.manifest.revisionId)).toEqual(
      record,
    );
    await expect(library.read('../escape', record.manifest.revisionId)).rejects.toThrow();
    const file = join(
      root,
      record.manifest.materialId,
      record.manifest.revisionId.slice(7),
      'baseColor.png',
    );
    const corrupted = await readFile(file);
    corrupted[40] = corrupted[40]! ^ 1;
    await writeFile(file, corrupted);
    await expect(
      library.read(record.manifest.materialId, record.manifest.revisionId),
    ).rejects.toThrow(/integrity|hash/i);
  });
});
