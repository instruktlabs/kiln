import { expect, test } from 'bun:test';
import {
  canonicalizeTextureAtlasSpecV1,
  hashTextureAtlasSpecV1,
  TextureAtlasError,
  validateTextureAtlasManifestV1,
  canonicalAtlasMetadataJsonV1,
} from '../texture-atlas-contract';
import { compileTextureAtlasSpecV1 } from '../texture-atlas-pixels';

const source = {
  kind: 'procedural',
  spec: { schemaVersion: 3, width: 4, height: 4, operations: [] },
};
const region = { name: 'leaf', content: { x: 2, y: 2, width: 4, height: 4 }, source };
const basic = { schemaVersion: 1, width: 128, height: 128, usage: 'albedo', regions: [region] };

test('atlas canonical defaults, source canonicalization and stable identities are explicit', () => {
  const spec = canonicalizeTextureAtlasSpecV1(basic);
  expect(spec).toMatchObject({
    schemaVersion: 1,
    sampler: {
      minFilter: 'linear-mipmap-linear',
      magFilter: 'linear',
      wrapS: 'clamp-to-edge',
      wrapT: 'clamp-to-edge',
    },
    regions: [
      { name: 'leaf', gutter: 2, edgeMode: 'copy-edge', crop: { x: 0, y: 0, width: 4, height: 4 } },
    ],
  });
  expect(hashTextureAtlasSpecV1(spec)).toBe(hashTextureAtlasSpecV1(basic));
  expect(hashTextureAtlasSpecV1({ ...basic, regions: [{ ...region, gutter: 1 }] })).not.toBe(
    hashTextureAtlasSpecV1(basic),
  );
});

test('touching allocations and reused source crops pass; true padded overlap fails', () => {
  const next = { ...region, name: 'other', content: { ...region.content, x: 10 } };
  expect(() => canonicalizeTextureAtlasSpecV1({ ...basic, regions: [region, next] })).not.toThrow();
  expect(hashTextureAtlasSpecV1({ ...basic, regions: [next, region] })).toBe(
    hashTextureAtlasSpecV1({ ...basic, regions: [region, next] }),
  );
  expect(() =>
    canonicalizeTextureAtlasSpecV1({
      ...basic,
      regions: [region, { ...next, content: { ...next.content, x: 9 } }],
    }),
  ).toThrow(/overlap/);
});

test('all descriptor-safe static errors fail before field reads', () => {
  let reads = 0;
  const getter = { ...basic };
  Object.defineProperty(getter, 'width', {
    enumerable: true,
    get() {
      reads++;
      return 128;
    },
  });
  const bad = [
    getter,
    Object.create(basic),
    { ...basic, rotate: true },
    { ...basic, regions: [region, region] },
    { ...basic, regions: [{ ...region, content: { ...region.content, x: 0 } }] },
    { ...basic, regions: [{ ...region, crop: { x: 1, y: 0, width: 4, height: 4 } }] },
    { ...basic, regions: [{ ...region, content: { ...region.content, width: 3 } }] },
    { ...basic, usage: 'normal', regions: [{ ...region, edgeMode: 'mask-rgb-dilate' }] },
    { ...basic, regions: Array(65).fill(region) },
    { ...basic, width: 1025 },
    {
      ...basic,
      regions: [
        {
          ...region,
          source: {
            kind: 'resource',
            resourceId: 'kiln.texture.approved',
            pin: { resourceId: 'wood', revisionId: 'latest', sha256: 'latest' },
          },
        },
      ],
    },
  ];
  for (const value of bad)
    expect(() => canonicalizeTextureAtlasSpecV1(value)).toThrow(/textureAtlas/);
  expect(reads).toBe(0);
});

test('explicit nulls, sparse arrays, inherited entries and incomplete samplers are rejected', () => {
  const sparse = Array(1),
    symbol = { ...basic, [Symbol('hidden')]: true };
  for (const value of [
    symbol,
    { ...basic, regions: sparse },
    { ...basic, sampler: null },
    { ...basic, sampler: { magFilter: 'nearest' } },
    { ...basic, regions: [{ ...region, edgeMode: null }] },
    { ...basic, regions: [{ ...region, source: Object.create(source) }] },
  ]) {
    expect(() => canonicalizeTextureAtlasSpecV1(value)).toThrow(TextureAtlasError);
  }
});

test('portable atlas manifests bind exact recipe, regions, source and declared hash identities', async () => {
  const compiled = await compileTextureAtlasSpecV1(basic);
  expect(validateTextureAtlasManifestV1(compiled.manifest, compiled.spec)).toEqual(
    compiled.manifest,
  );
  const reverse = Object.fromEntries(Object.entries(compiled.manifest).reverse());
  expect(validateTextureAtlasManifestV1(reverse, compiled.spec)).toEqual(compiled.manifest);
  for (const patch of [
    { width: 256 },
    { origin: 'bottom-left' },
    { extra: true },
    { decodedPixelHash: 'latest' },
    { regions: [] },
    { sources: [] },
    { sampler: { ...compiled.manifest.sampler, magFilter: 'nearest' } },
  ]) {
    expect(() =>
      validateTextureAtlasManifestV1({ ...compiled.manifest, ...patch }, compiled.spec),
    ).toThrow(/textureAtlas/);
  }
});

test('UTF-8 metadata admission rejects oversized strings before canonical object copying', () => {
  expect(() => {
    canonicalAtlasMetadataJsonV1({ chunks: Array(128).fill('é'.repeat(2000)) });
  }).toThrow(/byte budget/);
});
