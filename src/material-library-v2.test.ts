import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalMaterialJson,
  materialLibraryPortableSpec,
  materialLibraryResourceId,
  validateMaterialManifestAny,
  type MaterialSourceV1,
  type MaterialRecord,
} from './material-library';
import type { PortableSamplerV1 } from './portable-sampler';
import type { DataTexture } from 'three';
import {
  createMaterialRecordV1,
  createMaterialRecordV2,
  createMaterialLibraryPayload,
  decodeMaterialLibraryPayload,
  createMaterialLibraryTextureResolver,
  FileMaterialLibrary,
  verifyMaterialRecord,
  resolveMaterialRecordClosure,
} from './material-library-node';
import { compilePortableMaterialSpecV3 } from './portable-material-runtime';
const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'repeat',
  wrapT: 'repeat',
} as const;
const source: MaterialSourceV1 = {
  id: 'authored',
  kind: 'procedural',
  provider: 'Kiln',
  creator: 'Fixture author',
  license: {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  },
  originalFiles: [],
};
const recipe = {
  schemaVersion: 3,
  width: 8,
  height: 4,
  usage: 'albedo',
  background: [20, 50, 80, 255],
  operations: [
    {
      op: 'paint',
      shape: { kind: 'rectangle', x: 2, y: 0, width: 2, height: 4 },
      rgba: [150, 80, 30, 255],
    },
  ],
} as const;
const draft = (s: PortableSamplerV1 = sampler) => ({
  schemaVersion: 2,
  materialId: 'rectangular',
  name: 'Rectangular',
  tileable: true,
  sources: [structuredClone(source)],
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'authored',
      transforms: [],
      sampler: s,
      procedural: structuredClone(recipe),
    },
  ],
});
test('new records retain exact rectangular V3 recipe/pixels/sampling under immutable identity', async () => {
  const a = await createMaterialRecordV2(draft()),
    b = await createMaterialRecordV2(draft());
  expect(a).toEqual(b);
  expect(a.manifest.schemaVersion).toBe(2);
  expect(a.manifest.maps[0]!.width).toBe(8);
  expect(a.manifest.maps[0]!.height).toBe(4);
  expect(a.manifest.maps[0]!.sampler).toEqual(sampler);
  expect(a.manifest.maps[0]!.recipe!.kind).toBe('procedural');
  await verifyMaterialRecord(a);
  const changed = await createMaterialRecordV2(draft({ ...sampler, wrapS: 'clamp-to-edge' }));
  expect(changed.manifest.revisionId).not.toBe(a.manifest.revisionId);
  expect(changed.files).toEqual(a.files);
  expect(changed.manifest.maps[0]!.pixelHash).toBe(a.manifest.maps[0]!.pixelHash);
});
test('mixed payload keeps old records exact and emits old-only envelope version1', async () => {
  const old = await createMaterialRecordV1({
    materialId: 'legacy',
    name: 'Legacy',
    tileable: true,
    sources: [structuredClone(source)],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        procedural: {
          schemaVersion: 2,
          size: 4,
          usage: 'albedo',
          layers: [{ op: 'solid', color: 0x302010 }],
        },
      },
    ],
  });
  const oldJson = canonicalMaterialJson(old.manifest);
  const oldImage = old.files['baseColor.png']!.slice();
  const legacyPayload = await createMaterialLibraryPayload([old]);
  expect(legacyPayload.schemaVersion).toBe(1);
  const modern = await createMaterialRecordV2(draft());
  const mixed = await createMaterialLibraryPayload([old, modern]);
  expect(mixed.schemaVersion).toBe(2);
  const read = await decodeMaterialLibraryPayload(mixed);
  expect(canonicalMaterialJson(read[0]!.manifest)).toBe(oldJson);
  expect(read[0]!.files['baseColor.png']).toEqual(oldImage);
  expect(read[1]).toEqual(modern);
  expect(old.manifest.schemaVersion).toBe(1);
  expect('sampler' in old.manifest.maps[0]!).toBe(false);
});
test('tampered compiler, sampler, image, dimensions and even rehashed recipe/pixel inconsistencies fail', async () => {
  const original = await createMaterialRecordV2(draft());
  for (const mutate of [
    (r: typeof original) => {
      r.manifest.maps[0]!.sampler.wrapS = 'clamp-to-edge';
    },
    (r: typeof original) => {
      r.files['baseColor.png']![40] = r.files['baseColor.png']![40]! ^ 1;
    },
    (r: typeof original) => {
      r.manifest.maps[0]!.width++;
    },
  ]) {
    const r = structuredClone(original);
    mutate(r);
    await expect(verifyMaterialRecord(r)).rejects.toThrow();
  }
  const r = structuredClone(original);
  r.manifest.maps[0]!.pixelHash = `sha256:${'0'.repeat(64)}`;
  const { revisionId: _, ...content } = r.manifest;
  r.manifest.revisionId = hash(canonicalMaterialJson(content)) as typeof r.manifest.revisionId;
  await expect(verifyMaterialRecord(r)).rejects.toThrow(/pixel|recipe/);
  const future = structuredClone(original);
  (future.manifest.maps[0]!.recipe as unknown as Record<string, unknown>).compilerId = 'future';
  expect(() => validateMaterialManifestAny(future.manifest)).toThrow();
});
test('saved V2 resolver prepares owned bytes and compiled V3 texture without mesh/project', async () => {
  const record = await createMaterialRecordV2({
    ...draft(),
    physicalSizeMeters: { width: 2, height: 1 },
  });
  const resolver = await createMaterialLibraryTextureResolver([record]);
  const portable = materialLibraryPortableSpec(record.manifest);
  expect(portable.schemaVersion).toBe(3);
  const material = await compilePortableMaterialSpecV3(portable, { resolver });
  expect((material.map as DataTexture).image.width).toBe(8);
  expect(material.map!.minFilter).toBe(1003);
  const id = materialLibraryResourceId(record.manifest, 'baseColor');
  const a = await resolver.preparePortableTexture!(id);
  expect(a.userData['kilnMaterialResource']).toHaveProperty('physicalSizeMeters', {
    width: 2,
    height: 1,
  });
  a.bytes.fill(0);
  expect((await resolver.preparePortableTexture!(id)).bytes[0]).toBe(137);
});
test('filesystem readManifest is shape/identity-only and exact V1/V2 records read/import idempotently', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kiln-material-v2-'));
  temporaryRoots.push(root);
  const library = new FileMaterialLibrary(root),
    record = await createMaterialRecordV2(draft());
  await library.import([record]);
  await library.import([record]);
  expect(
    await library.readManifest(record.manifest.materialId, record.manifest.revisionId),
  ).toEqual(record.manifest);
  expect(await library.read(record.manifest.materialId, record.manifest.revisionId)).toEqual(
    record,
  );
  expect(await library.list()).toEqual([record.manifest]);
});
test('manifest-first closure rejects aggregate before any full reads and preserves root order', async () => {
  const a = await createMaterialRecordV2(draft()),
    b = await createMaterialRecordV2({ ...draft(), materialId: 'second' });
  let reads = 0;
  const byId = new Map([
    [a.manifest.materialId, a],
    [b.manifest.materialId, b],
  ]);
  const reader = {
    readManifest: async (id: string) => byId.get(id)!.manifest,
    read: async (id: string) => {
      reads++;
      return byId.get(id)!;
    },
  };
  await expect(
    resolveMaterialRecordClosure([a.manifest, b.manifest], reader, {
      maxRecords: 1,
      maxBytes: 100000,
      maxPixels: 100000,
    }),
  ).rejects.toThrow(/count|record|limit/i);
  expect(reads).toBe(0);
  expect(
    (await resolveMaterialRecordClosure([b.manifest, a.manifest], reader)).map(
      (r) => r.manifest.materialId,
    ),
  ).toEqual(['second', 'rectangular']);
});
const atlasDraft = (child: MaterialRecord) => ({
  ...draft(),
  materialId: 'atlas',
  name: 'Atlas',
  maps: [
    {
      slot: 'baseColor',
      sourceId: 'authored',
      transforms: [],
      sampler,
      atlas: {
        schemaVersion: 1,
        width: 8,
        height: 4,
        usage: 'albedo',
        sampler,
        regions: [
          {
            name: 'source',
            content: { x: 0, y: 0, width: 8, height: 4 },
            gutter: 0,
            edgeMode: 'copy-edge',
            source: {
              kind: 'resource',
              resourceId: materialLibraryResourceId(child.manifest, 'baseColor'),
              pin: {
                resourceId: child.manifest.materialId,
                revisionId: child.manifest.revisionId,
                sha256: child.manifest.revisionId,
              },
            },
          },
        ],
      },
    },
  ],
});
test('dependent atlas pins exact revisions and roundtrips transitive mixed payload offline', async () => {
  const child = await createMaterialRecordV2(draft()),
    atlas = await createMaterialRecordV2(atlasDraft(child), { materials: [child] });
  expect(atlas.manifest.dependencies).toEqual([
    {
      resourceId: child.manifest.materialId,
      revisionId: child.manifest.revisionId,
      sha256: child.manifest.revisionId,
    },
  ]);
  expect(atlas.files['baseColor.png']).toEqual(child.files['baseColor.png']);
  await verifyMaterialRecord(atlas, { materials: [atlas, child] });
  await expect(verifyMaterialRecord(atlas)).rejects.toThrow(/pin|library|material/i);
  await expect(createMaterialLibraryPayload([atlas])).rejects.toThrow(/missing/i);
  const payload = await createMaterialLibraryPayload([atlas, child]);
  expect(await decodeMaterialLibraryPayload(payload)).toEqual([atlas, child]);
  const library = new FileMaterialLibrary(await mkdtemp(join(tmpdir(), 'kiln-atlas-library-')));
  temporaryRoots.push(library.root);
  await library.import([atlas], { materials: [atlas, child] });
  await expect(library.read(atlas.manifest.materialId, atlas.manifest.revisionId)).rejects.toThrow(
    /ENOENT|missing/i,
  );
  await library.import([child]);
  expect(await library.read(atlas.manifest.materialId, atlas.manifest.revisionId)).toEqual(atlas);
  const resolver = await createMaterialLibraryTextureResolver([atlas, child]),
    port = resolver.pinnedMaterialMaps!;
  const atlasTexture = await resolver.loadApprovedTexture(
    materialLibraryResourceId(atlas.manifest, 'baseColor'),
  );
  const atlasRecipe = atlas.manifest.maps[0]!.recipe!;
  expect(atlasTexture.userData['kilnAtlas'].manifest).toEqual(
    atlasRecipe.kind === 'atlas' ? atlasRecipe.manifest : undefined,
  );
  expect(
    (await resolver.preparePortableTexture!(materialLibraryResourceId(atlas.manifest, 'baseColor')))
      .userData['kilnAtlas'],
  ).toEqual(atlasTexture.userData['kilnAtlas']);
  const id = materialLibraryResourceId(child.manifest, 'baseColor'),
    pin = atlas.manifest.dependencies[0]!;
  const first = await port.resolvePinnedMaterialMapPixels(id, pin);
  first.pixels.fill(0);
  first.descriptor.width = 99;
  expect((await port.resolvePinnedMaterialMapPixels(id, pin)).descriptor.width).toBe(8);
  expect((await port.resolvePinnedMaterialMapPixels(id, pin)).pixels.some((x) => x !== 0)).toBe(
    true,
  );
  expect(port.describePinnedMaterialMap('kiln.texture.bark-albedo.v1', pin)).toBeUndefined();
});
test('closure metadata admits dependencies before full reads and rejects changed manifests', async () => {
  const child = await createMaterialRecordV2(draft()),
    atlas = await createMaterialRecordV2(atlasDraft(child), { materials: [child] });
  let reads = 0;
  const reader = {
    readManifest: async () => child.manifest,
    read: async (id: string) => {
      reads++;
      return id === 'atlas' ? atlas : child;
    },
  };
  await expect(
    resolveMaterialRecordClosure([atlas.manifest], reader, {
      maxRecords: 1,
      maxBytes: 100000,
      maxPixels: 100000,
    }),
  ).rejects.toThrow(/limit/);
  expect(reads).toBe(0);
  const missing = {
    ...reader,
    readManifest: async () => {
      throw new Error('missing child');
    },
  };
  await expect(resolveMaterialRecordClosure([atlas.manifest], missing)).rejects.toThrow(/missing/);
  expect(reads).toBe(0);
  const changed = { ...reader, read: async () => child };
  await expect(resolveMaterialRecordClosure([atlas.manifest], changed)).rejects.toThrow(/changed/);
});
test('V2 source closure rejects aggregate metadata before any caller byte snapshot', async () => {
  const base = await createMaterialRecordV2(draft());
  const records = Array.from({ length: 3 }, (_entry, i) => {
    const record = structuredClone(base),
      bytes = new Uint8Array(7 * 1024 * 1024);
    bytes.set(record.files['baseColor.png']!);
    record.files['baseColor.png'] = bytes;
    record.manifest.materialId = `padded${i}`;
    record.manifest.maps[0]!.bytes = bytes.length;
    record.manifest.maps[0]!.sha256 = hash(bytes);
    const { revisionId: _, ...content } = record.manifest;
    record.manifest.revisionId = hash(canonicalMaterialJson(content));
    return record;
  });
  await verifyMaterialRecord(records[0]!);
  let copies = 0;
  for (const record of records) {
    const bytes = record.files['baseColor.png']!,
      slice = bytes.slice.bind(bytes);
    bytes.slice = ((start?: number, end?: number) => {
      copies++;
      return slice(start, end);
    }) as typeof bytes.slice;
  }
  await expect(createMaterialRecordV2(draft(), { materials: records })).rejects.toThrow(
    /budget|limit/,
  );
  expect(copies).toBe(0);
});
test('persisted V3 recipe combinations share the exact64M work budget', async () => {
  const paint = {
    op: 'paint',
    shape: { kind: 'rectangle', x: 0, y: 0, width: 1024, height: 1024 },
    rgba: [30, 40, 50, 255],
  };
  const input = {
    ...draft(),
    maps: [
      {
        ...draft().maps[0],
        procedural: {
          schemaVersion: 3,
          width: 1024,
          height: 1024,
          usage: 'albedo',
          operations: Array.from({ length: 30 }, () => paint),
        },
      },
      {
        slot: 'emissive',
        sourceId: 'authored',
        transforms: [],
        sampler,
        procedural: {
          schemaVersion: 3,
          width: 256,
          height: 256,
          usage: 'emissive',
          background: [30, 40, 50, 255],
          operations: [],
        },
      },
    ],
  };
  await expect(createMaterialRecordV2(input)).rejects.toThrow(/work|aggregate|budget/i);
});
test('import deduplicates exact compound context identities and rejects conflicting selected bytes', async () => {
  const record = await createMaterialRecordV2(draft()),
    library = new FileMaterialLibrary(await mkdtemp(join(tmpdir(), 'kiln-context-library-')));
  temporaryRoots.push(library.root);
  const context = Array.from({ length: 1024 }, (_entry, i) => {
    if (i === 0) return record;
    const copy = structuredClone(record);
    copy.manifest.materialId = `context${i}`;
    const { revisionId: _, ...content } = copy.manifest;
    copy.manifest.revisionId = hash(canonicalMaterialJson(content));
    return copy;
  });
  await library.import([record], { materials: context });
  expect(await library.read(record.manifest.materialId, record.manifest.revisionId)).toEqual(
    record,
  );
  const bad = structuredClone(record);
  bad.files['baseColor.png']![40] = bad.files['baseColor.png']![40]! ^ 1;
  await expect(library.import([bad], { materials: [record] })).rejects.toThrow(
    /integrity|conflict|hash/i,
  );
  await expect(library.import([record], { materials: [bad] })).rejects.toThrow(
    /integrity|conflict|hash/i,
  );
});
