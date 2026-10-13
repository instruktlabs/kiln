import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { materialProceduralSpecSchema } from '../material-library';
import {
  canonicalLegacyV2FieldSchema,
  makeMaterialAuthoringSchemas,
} from '../material-authoring-schema';
import { canonicalizeProceduralTextureSpecV3 } from '../procedural-texture-v3-contract';
import { canonicalizeTextureAtlasSpecV1 } from '../texture-atlas-contract';
import { compileTextureAtlasSpecV1 } from '../texture-atlas-pixels';
import type { CanonicalProceduralTextureSpecV3 } from '../procedural-texture-v3-contract';
import type { CanonicalTextureAtlasSpecV1 } from '../texture-atlas-contract';
import type { TextureAtlasManifestV1 } from '../texture-atlas-pixels';
import type { PortableSamplerV1 } from '../portable-sampler';
import { canonicalizeProceduralTextureSpecV2 } from '../procedural-material-v2';
import type { VerifiedPinnedMaterialMapDescriptorV1 } from '../pinned-material-map';

const schemas = makeMaterialAuthoringSchemas(materialProceduralSpecSchema);
const hash = `sha256:${'a'.repeat(64)}`;
const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
} as const;
const legacy = {
  schemaVersion: 2,
  size: 8,
  usage: 'albedo',
  layers: [{ op: 'solid', color: 0x123456 }],
};
const shapes = [
  { kind: 'rectangle', x: -1, y: 0, width: 4, height: 4 },
  { kind: 'ellipse', x: 0, y: -1, width: 4, height: 4 },
  {
    kind: 'polygon',
    points: [
      [0, 0],
      [4, 0],
      [0, 4],
    ],
  },
  { kind: 'line', from: [0, 0], to: [4, 4], width: 1 },
];
const recipe = {
  schemaVersion: 3,
  width: 8,
  height: 8,
  name: 'Shape coverage',
  palette: { colors: [0, 0xffffff], dither: 'bayer4' },
  operations: [
    ...shapes.map((shape) => ({ op: 'paint', shape, rgba: [12, 34, 56, 255] })),
    { op: 'mask', shape: shapes[0], alpha: 120, invert: true },
    {
      op: 'stamps',
      shape: shapes[1],
      rgba: [255, 0, 0, 255],
      count: 2,
      seed: 0xffffffff,
      area: { x: 0, y: 0, width: 8, height: 8 },
      periodic: false,
      opacity: 200,
    },
    { op: 'legacy-v2', spec: legacy, alpha: 255, opacity: 255 },
  ],
};
const atlas = {
  schemaVersion: 1,
  width: 32,
  height: 16,
  usage: 'albedo',
  sampler,
  regions: [
    {
      name: 'inline',
      content: { x: 2, y: 2, width: 8, height: 8 },
      source: { kind: 'procedural', spec: recipe },
      edgeMode: 'mask-rgb-dilate',
    },
    {
      name: 'pinned',
      content: { x: 16, y: 2, width: 8, height: 8 },
      gutter: 1,
      crop: { x: 0, y: 0, width: 8, height: 8 },
      source: {
        kind: 'resource',
        resourceId: 'kiln.material:wood/baseColor',
        pin: { resourceId: 'wood', revisionId: hash, sha256: hash },
        expected: { width: 8, height: 8, imageSha256: hash, decodedPixelHash: hash },
      },
    },
  ],
};

test('Discovery input JSON schemas serialize every field without opaque custom nodes', () => {
  for (const [name, schema] of Object.entries(schemas)) {
    const json = z.toJSONSchema(schema, { io: 'input' });
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const obj = value as Record<string, unknown>;
      for (const [key, item] of Object.entries(obj)) {
        if (key === 'properties')
          for (const child of Object.values(item as object))
            expect(Object.keys(child as object).length, name).toBeGreaterThan(0);
        visit(item);
      }
    };
    visit(json);
  }
  const procedural = JSON.stringify(
    z.toJSONSchema(schemas.proceduralTextureSpecV3Schema, { io: 'input' }),
  );
  for (const field of [
    'paint',
    'mask',
    'stamps',
    'legacy-v2',
    'rectangle',
    'ellipse',
    'polygon',
    'line',
    'from',
    'to',
    'points',
    'periodic',
    'seed',
    'dither',
    'layers',
  ])
    expect(procedural).toContain(field);
  const manifest = JSON.stringify(
    z.toJSONSchema(schemas.textureAtlasManifestV1Schema, { io: 'input' }),
  );
  for (const field of [
    'descriptor',
    'encodedByteLength',
    'imageSha256',
    'decodedPixelHash',
    'atlasPixelHash',
    'allocation',
    'sourceId',
    'manifestHash',
  ])
    expect(manifest).toContain(field);
});

test('author shapes cover all V3 operations and both atlas source kinds without applying defaults', () => {
  expect(schemas.proceduralTextureSpecV3Schema.parse(recipe).usage).toBeUndefined();
  expect(schemas.textureAtlasSpecV1Schema.parse(atlas).regions[0]!.gutter).toBeUndefined();
  expect(schemas.portableSamplerSchema.parse(sampler)).toEqual(sampler);
  expect(schemas.portableSamplerSchema.safeParse({ ...sampler, flipY: false }).success).toBe(false);
  expect(schemas.portableSamplerSchema.safeParse({ minFilter: 'nearest' }).success).toBe(false);
  expect(
    schemas.proceduralTextureSpecV3Schema.safeParse({
      ...recipe,
      operations: [{ op: 'paint', shape: shapes[0], rgba: [1, 2, 3] }],
    }).success,
  ).toBe(false);
  expect(
    schemas.proceduralTextureSpecV3Schema.safeParse({
      ...recipe,
      operations: [{ op: 'mask', shape: shapes[0], rgba: [1, 2, 3, 4] }],
    }).success,
  ).toBe(false);
  expect(schemas.textureAtlasSpecV1Schema.safeParse({ ...atlas, rotate: true }).success).toBe(
    false,
  );
});

test('canonical shapes require filled fields and infer compiler-compatible types', async () => {
  const p: CanonicalProceduralTextureSpecV3 = schemas.canonicalProceduralTextureSpecV3Schema.parse(
    canonicalizeProceduralTextureSpecV3(recipe),
  );
  const a: CanonicalTextureAtlasSpecV1 = schemas.canonicalTextureAtlasSpecV1Schema.parse(
    canonicalizeTextureAtlasSpecV1(atlas),
  );
  const s: PortableSamplerV1 = schemas.portableSamplerSchema.parse(sampler);
  expect(p.width).toBe(8);
  expect(a.width).toBe(32);
  expect(s.wrapS).toBe('clamp-to-edge');
  expect(schemas.canonicalProceduralTextureSpecV3Schema.safeParse(recipe).success).toBe(false);
  expect(schemas.canonicalTextureAtlasSpecV1Schema.safeParse(atlas).success).toBe(false);
  const compiled = await compileTextureAtlasSpecV1({ ...atlas, regions: [atlas.regions[0]] });
  const manifest: TextureAtlasManifestV1 = schemas.textureAtlasManifestV1Schema.parse(
    compiled.manifest,
  );
  expect(manifest).toEqual(compiled.manifest);
  expect(
    schemas.textureAtlasManifestV1Schema.safeParse({ ...compiled.manifest, privateField: true })
      .success,
  ).toBe(false);
});

test('resource manifest descriptor fields serialize and parse actual pinned compile output', async () => {
  const pixels = new Uint8Array(8 * 8 * 4).fill(255);
  const decodedPixelHash = `sha256:${createHash('sha256').update(pixels).digest('hex')}` as const;
  const descriptor: VerifiedPinnedMaterialMapDescriptorV1 = {
    materialId: 'wood',
    revisionId: hash as `sha256:${string}`,
    resourceId: 'kiln.material:wood/baseColor',
    slot: 'baseColor',
    usage: 'albedo',
    colorSpace: 'srgb',
    width: 8,
    height: 8,
    encodedByteLength: 100,
    imageSha256: hash as `sha256:${string}`,
    decodedPixelHash,
  };
  const input = {
    ...atlas,
    regions: [
      {
        ...atlas.regions[1],
        source: {
          kind: 'resource',
          resourceId: descriptor.resourceId,
          pin: { resourceId: 'wood', revisionId: hash, sha256: hash },
          expected: { width: 8, height: 8, imageSha256: hash, decodedPixelHash },
        },
      },
    ],
  };
  const compiled = await compileTextureAtlasSpecV1(input, {
    resources: {
      describePinnedMaterialMap() {
        return descriptor;
      },
      async resolvePinnedMaterialMapPixels() {
        return { descriptor, pixels, decodedPixelHash };
      },
    },
  });
  const parsed: TextureAtlasManifestV1 = schemas.textureAtlasManifestV1Schema.parse(
    compiled.manifest,
  );
  expect(parsed).toEqual(compiled.manifest);
  const source = compiled.manifest.sources[0]!;
  for (const patch of [
    { encodedByteLength: 0 },
    { slot: 'height' },
    { flipY: false },
    { decodedPixelHash: 'bad' },
  ]) {
    expect(
      schemas.verifiedPinnedMaterialMapDescriptorSchema.safeParse({
        ...source.descriptor,
        ...patch,
      }).success,
    ).toBe(false);
  }
  // Shape schemas deliberately do not replicate pin-equality/layout/work algorithms.
  expect(
    schemas.materialMapPinSchema.safeParse({
      resourceId: 'wood',
      revisionId: hash,
      sha256: `sha256:${'b'.repeat(64)}`,
    }).success,
  ).toBe(true);
  expect(
    schemas.textureAtlasSpecV1Schema.safeParse({
      ...atlas,
      regions: [atlas.regions[0], { ...atlas.regions[0], name: 'overlap' }],
    }).success,
  ).toBe(true);
  expect(() =>
    canonicalizeTextureAtlasSpecV1({
      ...atlas,
      regions: [atlas.regions[0], { ...atlas.regions[0], name: 'overlap' }],
    }),
  ).toThrow('overlap');
});

test('canonical nested legacy leaves require filled fields without author V2 default normalization', () => {
  const canonical = canonicalizeProceduralTextureSpecV3(recipe);
  const omitLegacy = structuredClone(canonical);
  const last = omitLegacy.operations.at(-1)!;
  if (last.op !== 'legacy-v2') throw Error('fixture');
  Reflect.deleteProperty(last.spec.layers[0]!, 'blend');
  expect(schemas.canonicalProceduralTextureSpecV3Schema.safeParse(omitLegacy).success).toBe(false);
  const authored = schemas.proceduralTextureSpecV3Schema.parse(recipe);
  const authoredLast = authored.operations.at(-1)!;
  if (authoredLast.op !== 'legacy-v2') throw Error('fixture');
  expect(authoredLast.spec.layers[0]!.blend).toBe('normal');
  for (const schema of [
    schemas.canonicalProceduralTextureSpecV3Schema,
    schemas.canonicalTextureAtlasSpecV1Schema,
    canonicalLegacyV2FieldSchema,
  ]) {
    expect(JSON.stringify(z.toJSONSchema(schema, { io: 'input' }))).not.toContain('"default"');
  }
  const variants = [
    { op: 'solid', color: 1 },
    { op: 'checker', colorA: 1, colorB: 2 },
    { op: 'stripes', colorA: 1, colorB: 2 },
    { op: 'gradient', from: 1, to: 2 },
    { op: 'bricks', brick: 1, mortar: 2 },
    { op: 'noise', colorA: 1, colorB: 2 },
  ];
  for (const layer of variants) {
    const v2 = canonicalizeProceduralTextureSpecV2({ schemaVersion: 2, size: 8, layers: [layer] });
    expect(canonicalLegacyV2FieldSchema.parse(v2)).toEqual(v2);
    for (const field of Object.keys(v2.layers[0]!)) {
      const missing = structuredClone(v2);
      Reflect.deleteProperty(missing.layers[0]!, field);
      expect(canonicalLegacyV2FieldSchema.safeParse(missing).success).toBe(false);
    }
  }
  const explicit = makeMaterialAuthoringSchemas(
    materialProceduralSpecSchema,
    canonicalLegacyV2FieldSchema,
  );
  expect(explicit.canonicalProceduralTextureSpecV3Schema.parse(canonical)).toEqual(canonical);
  expect(explicit.canonicalProceduralTextureSpecV3Schema.safeParse(omitLegacy).success).toBe(false);
});
