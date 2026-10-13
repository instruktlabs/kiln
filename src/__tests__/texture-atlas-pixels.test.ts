import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { admitTextureAtlasSpecV1, compileTextureAtlasSpecV1 } from '../texture-atlas-pixels';
import type {
  PinnedMaterialMapPortV1,
  VerifiedPinnedMaterialMapDescriptorV1,
} from '../pinned-material-map';

const digest = (bytes: Uint8Array) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}` as const;
const recipe = (width: number, height: number, rgba: number[]) => ({
  kind: 'procedural',
  spec: { schemaVersion: 3, width, height, background: rgba, operations: [] },
});
const pixel = (data: Uint8Array, width: number, x: number, y: number) => [
  ...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4),
];
const atlas = (size: number, regions: unknown[]) => ({
  schemaVersion: 1,
  width: size,
  height: size,
  usage: 'albedo',
  regions,
});

test('128 and 256 atlas fixtures copy exact crops and opaque edges without source mutation', async () => {
  for (const size of [128, 256]) {
    const input = atlas(size, [
      {
        name: 'red',
        content: { x: 2, y: 2, width: 4, height: 4 },
        source: recipe(4, 4, [255, 0, 0, 255]),
      },
      {
        name: 'cyan',
        content: { x: 10, y: 2, width: 4, height: 4 },
        source: recipe(4, 4, [0, 255, 255, 255]),
      },
    ]);
    const before = structuredClone(input),
      first = await compileTextureAtlasSpecV1(input),
      second = await compileTextureAtlasSpecV1(input);
    expect(first.pixels).toEqual(second.pixels);
    expect(first.manifest).toEqual(second.manifest);
    expect(pixel(first.pixels, size, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(first.pixels, size, 8, 0)).toEqual([0, 255, 255, 255]);
    expect(pixel(first.pixels, size, 16, 0)).toEqual([0, 0, 0, 0]);
    expect(input).toEqual(before);
  }
});

test('cutout dilation preserves alpha, uses stable nearest donors and cannot cross regions', async () => {
  const source = {
    kind: 'procedural',
    spec: {
      schemaVersion: 3,
      width: 4,
      height: 4,
      operations: [
        {
          op: 'paint',
          shape: { kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
          rgba: [255, 20, 10, 255],
        },
        {
          op: 'paint',
          shape: { kind: 'rectangle', x: 2, y: 0, width: 1, height: 1 },
          rgba: [10, 20, 255, 128],
        },
      ],
    },
  };
  const compiled = await compileTextureAtlasSpecV1(
    atlas(256, [
      {
        name: 'cutout',
        content: { x: 4, y: 4, width: 4, height: 4 },
        gutter: 4,
        edgeMode: 'mask-rgb-dilate',
        source,
      },
      {
        name: 'empty',
        content: { x: 16, y: 4, width: 4, height: 4 },
        gutter: 4,
        edgeMode: 'mask-rgb-dilate',
        source: recipe(4, 4, [0, 0, 0, 0]),
      },
    ]),
  );
  expect(pixel(compiled.pixels, 256, 5, 4)).toEqual([255, 20, 10, 0]); // Equal distance chooses first donor.
  expect(pixel(compiled.pixels, 256, 6, 4)).toEqual([10, 20, 255, 128]);
  expect(pixel(compiled.pixels, 256, 11, 4)).toEqual([10, 20, 255, 0]);
  expect(pixel(compiled.pixels, 256, 12, 4)).toEqual([0, 0, 0, 0]);
  expect(compiled.manifest.decodedPixelHash).toBe(digest(compiled.pixels));
  expect(compiled.manifest.atlasPixelHash).not.toBe(compiled.manifest.decodedPixelHash);
});

test('trusted pinned sources are admitted together, loaded once, hash checked and left unchanged', async () => {
  const hash = `sha256:${'a'.repeat(64)}` as const,
    pin = { resourceId: 'wood', revisionId: hash, sha256: hash };
  const data = new Uint8Array(4 * 4 * 4).fill(128);
  const descriptor: VerifiedPinnedMaterialMapDescriptorV1 = {
    materialId: 'wood',
    revisionId: hash,
    resourceId: 'exact-map',
    slot: 'baseColor',
    usage: 'albedo',
    colorSpace: 'srgb',
    width: 4,
    height: 4,
    encodedByteLength: 64,
    imageSha256: hash,
    decodedPixelHash: digest(data),
  };
  let loads = 0;
  const resources: PinnedMaterialMapPortV1 = {
    describePinnedMaterialMap: () => descriptor,
    async resolvePinnedMaterialMapPixels() {
      loads++;
      return { descriptor, pixels: data, decodedPixelHash: digest(data) };
    },
  };
  const regions = [
    {
      name: 'a',
      content: { x: 2, y: 2, width: 4, height: 4 },
      source: { kind: 'resource', resourceId: 'exact-map', pin },
    },
    {
      name: 'b',
      content: { x: 10, y: 2, width: 4, height: 4 },
      source: { kind: 'resource', resourceId: 'exact-map', pin },
    },
  ];
  const before = data.slice(),
    output = await compileTextureAtlasSpecV1(atlas(128, regions), { resources });
  expect(loads).toBe(1);
  expect(data).toEqual(before);
  output.pixels[0] = 0;
  expect(data).toEqual(before);
  loads = 0;
  await expect(
    compileTextureAtlasSpecV1(
      atlas(128, [regions[0], { ...regions[1], crop: { x: 1, y: 0, width: 4, height: 4 } }]),
      { resources },
    ),
  ).rejects.toThrow(/crop/);
  expect(loads).toBe(0);
  await expect(compileTextureAtlasSpecV1(atlas(128, regions))).rejects.toThrow(
    /pinned.library|pinned library/,
  );
  const corrupt = {
    ...resources,
    async resolvePinnedMaterialMapPixels() {
      return { descriptor, pixels: data, decodedPixelHash: hash };
    },
  };
  await expect(
    compileTextureAtlasSpecV1(atlas(128, regions), { resources: corrupt }),
  ).rejects.toThrow(/hash/);
});

test('aggregate V3 work, full source decode, encoded bytes and snapshot allocations are bounded before loads', async () => {
  const big = {
    kind: 'procedural',
    spec: {
      schemaVersion: 3,
      width: 1024,
      height: 1024,
      operations: Array.from({ length: 11 }, () => ({
        op: 'legacy-v2',
        spec: { schemaVersion: 2, size: 1024, layers: [{ op: 'solid', color: 0xffffff }] },
      })),
    },
  };
  expect(() =>
    admitTextureAtlasSpecV1(
      atlas(128, [
        {
          name: 'expensive',
          content: { x: 2, y: 2, width: 1, height: 1 },
          crop: { x: 0, y: 0, width: 1, height: 1 },
          source: big,
        },
      ]),
    ),
  ).toThrow(/aggregate work budget/);
  let loads = 0;
  const hash = `sha256:${'b'.repeat(64)}` as const;
  const descriptor = (
    id: string,
    width: number,
    bytes: number,
  ): VerifiedPinnedMaterialMapDescriptorV1 => ({
    materialId: id,
    revisionId: hash,
    resourceId: id,
    slot: 'baseColor',
    usage: 'albedo',
    colorSpace: 'srgb',
    width,
    height: width,
    encodedByteLength: bytes,
    imageSha256: hash,
  });
  for (const [label, count, width, bytes, error] of [
    ['decode', 2, 2048, 64, /source texel budget/],
    ['encoded', 3, 4, 8 * 1024 * 1024, /encoded source byte budget/],
    ['snapshot', 4, 1024, 64, /pixel allocation budget/],
  ] as const) {
    const resources: PinnedMaterialMapPortV1 = {
      describePinnedMaterialMap: (id) => descriptor(id as string, width, bytes),
      async resolvePinnedMaterialMapPixels() {
        loads++;
        throw new Error('must not decode');
      },
    };
    const regions = Array.from({ length: count }, (_, i) => ({
      name: `${label}-${i}`,
      content: { x: 2 + i * 5, y: 2, width: 1, height: 1 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      source: {
        kind: 'resource',
        resourceId: `${label}-${i}`,
        pin: { resourceId: `${label}-${i}`, revisionId: hash, sha256: hash },
      },
    }));
    await expect(compileTextureAtlasSpecV1(atlas(128, regions), { resources })).rejects.toThrow(
      error,
    );
  }
  expect(loads).toBe(0);
});

test('descriptor mismatch and stale decoded dimensions cannot allocate or publish an atlas', async () => {
  const hash = `sha256:${'c'.repeat(64)}` as const,
    source = {
      kind: 'resource',
      resourceId: 'map',
      pin: { resourceId: 'wood', revisionId: hash, sha256: hash },
      expected: { width: 4 },
    };
  const input = atlas(128, [
    { name: 'wood', content: { x: 2, y: 2, width: 4, height: 4 }, source },
  ]);
  const d: VerifiedPinnedMaterialMapDescriptorV1 = {
    materialId: 'wood',
    revisionId: hash,
    resourceId: 'map',
    slot: 'baseColor',
    usage: 'albedo',
    colorSpace: 'srgb',
    width: 4,
    height: 4,
    encodedByteLength: 64,
    imageSha256: hash,
  };
  let loads = 0;
  for (const patch of [
    { revisionId: `sha256:${'d'.repeat(64)}` },
    { width: 8 },
    { colorSpace: 'linear' },
    { usage: 'normal' },
    { encodedByteLength: 0 },
  ]) {
    const resources: PinnedMaterialMapPortV1 = {
      describePinnedMaterialMap: () =>
        ({ ...d, ...patch }) as VerifiedPinnedMaterialMapDescriptorV1,
      async resolvePinnedMaterialMapPixels() {
        loads++;
        throw new Error('must not load');
      },
    };
    await expect(compileTextureAtlasSpecV1(input, { resources })).rejects.toThrow();
  }
  expect(loads).toBe(0);
  const resources: PinnedMaterialMapPortV1 = {
    describePinnedMaterialMap: () => d,
    async resolvePinnedMaterialMapPixels() {
      return { descriptor: d, pixels: new Uint8Array(8), decodedPixelHash: hash };
    },
  };
  await expect(compileTextureAtlasSpecV1(input, { resources })).rejects.toThrow(
    /dimensions|length/,
  );
  const controller = new AbortController();
  controller.abort();
  await expect(
    compileTextureAtlasSpecV1(input, { resources, signal: controller.signal }),
  ).rejects.toThrow(/cancelled/);
});

test('transitive sources preserve two exact revisions of the same material and a callback cancellation signal', async () => {
  const oldRevision = `sha256:${'1'.repeat(64)}` as const,
    newRevision = `sha256:${'2'.repeat(64)}` as const;
  const sources = [oldRevision, newRevision].map((revisionId, i) => ({
    kind: 'resource',
    resourceId: `map-${i}`,
    pin: { resourceId: 'wood', revisionId, sha256: revisionId },
  }));
  const descriptors = sources.map(
    (source, i): VerifiedPinnedMaterialMapDescriptorV1 => ({
      materialId: 'wood',
      revisionId: source.pin.revisionId,
      resourceId: source.resourceId,
      slot: 'baseColor',
      usage: 'albedo',
      colorSpace: 'srgb',
      width: 4,
      height: 4,
      encodedByteLength: 64,
      imageSha256: source.pin.revisionId,
      decodedPixelHash: digest(new Uint8Array(64).fill(i + 1)),
    }),
  );
  const seen: AbortSignal[] = [],
    controller = new AbortController();
  const resources: PinnedMaterialMapPortV1 = {
    describePinnedMaterialMap: (id) => descriptors.find((d) => d.resourceId === id),
    async resolvePinnedMaterialMapPixels(id, _pin, context) {
      seen.push(context!.signal!);
      const i = sources.findIndex((s) => s.resourceId === id);
      return {
        descriptor: descriptors[i]!,
        pixels: new Uint8Array(64).fill(i + 1),
        decodedPixelHash: descriptors[i]!.decodedPixelHash!,
      };
    },
  };
  const output = await compileTextureAtlasSpecV1(
    atlas(
      128,
      sources.map((source, i) => ({
        name: `rev-${i}`,
        content: { x: 2 + i * 8, y: 2, width: 4, height: 4 },
        source,
      })),
    ),
    { resources, signal: controller.signal },
  );
  expect(output.manifest.sources.map((s) => s.descriptor!.revisionId).sort()).toEqual([
    oldRevision,
    newRevision,
  ]);
  expect(seen).toEqual([controller.signal, controller.signal]);
  expect(pixel(output.pixels, 128, 2, 2)).toEqual([1, 1, 1, 1]);
  expect(pixel(output.pixels, 128, 10, 2)).toEqual([2, 2, 2, 2]);
});

test('small cutout masks match exhaustive nearest donor and row-major ties with padding', async () => {
  const hash = `sha256:${'e'.repeat(64)}` as const;
  // Every 3x3 donor mask inside a valid 4x4 source; padding adds asymmetric outside queries.
  for (let mask = 0; mask < 512; mask++) {
    const pixels = new Uint8Array(64);
    for (let i = 0; i < 9; i++)
      if (mask & (1 << i)) {
        const p = ((Math.floor(i / 3) + 1) * 4 + (i % 3)) * 4;
        pixels[p] = i + 1;
        pixels[p + 3] = 255;
      }
    const descriptor: VerifiedPinnedMaterialMapDescriptorV1 = {
      materialId: 'probe',
      revisionId: hash,
      resourceId: 'map',
      slot: 'baseColor',
      usage: 'albedo',
      colorSpace: 'srgb',
      width: 4,
      height: 4,
      encodedByteLength: 64,
      imageSha256: hash,
      decodedPixelHash: digest(pixels),
    };
    const resources: PinnedMaterialMapPortV1 = {
      describePinnedMaterialMap: () => descriptor,
      async resolvePinnedMaterialMapPixels() {
        return { descriptor, pixels, decodedPixelHash: digest(pixels) };
      },
    };
    const output = await compileTextureAtlasSpecV1(
      atlas(8, [
        {
          name: 'mask',
          content: { x: 1, y: 1, width: 3, height: 3 },
          crop: { x: 0, y: 1, width: 3, height: 3 },
          gutter: 1,
          edgeMode: 'mask-rgb-dilate',
          source: {
            kind: 'resource',
            resourceId: 'map',
            pin: { resourceId: 'probe', revisionId: hash, sha256: hash },
          },
        },
      ]),
      { resources },
    );
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        let distance = Infinity,
          donor = -1;
        for (let i = 0; i < 9; i++)
          if (mask & (1 << i)) {
            const d = Math.abs(x - 1 - (i % 3)) + Math.abs(y - 1 - Math.floor(i / 3));
            if (d < distance) {
              distance = d;
              donor = i;
            }
          }
        const actual = pixel(output.pixels, 8, x, y);
        expect(actual[0]).toBe(donor + 1);
        const inside = x >= 1 && x <= 3 && y >= 1 && y <= 3;
        expect(actual[3]).toBe(inside && mask & (1 << ((y - 1) * 3 + x - 1)) ? 255 : 0);
      }
  }
});
