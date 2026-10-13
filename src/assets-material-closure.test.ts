import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { validateAssetMaterialClosure, type AssetRecord } from './assets';
import {
  canonicalMaterialJson,
  type MaterialManifestV1,
  type MaterialManifestV2,
  type MaterialLibraryPayload,
} from './material-library';
import { compileTextureAtlasSpecV1 } from './texture-atlas-pixels';
import type { PinnedMaterialMapPortV1 } from './pinned-material-map';

const digest = (value: Uint8Array | string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;
const zero = `sha256:${'0'.repeat(64)}` as const;
const sampler = {
  minFilter: 'nearest',
  magFilter: 'nearest',
  wrapS: 'clamp-to-edge',
  wrapT: 'clamp-to-edge',
} as const;
const parameters = {
  roughness: 1,
  metalness: 0,
  emissiveIntensity: 1,
  alphaMode: 'opaque',
  alphaCutoff: 0.5,
  doubleSided: false,
} as const;
const license = {
  spdx: 'CC0-1.0',
  url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: '',
};
function identify<T extends MaterialManifestV1 | MaterialManifestV2>(manifest: T): T {
  const { revisionId: _, ...body } = manifest;
  return { ...manifest, revisionId: digest(canonicalMaterialJson(body)) };
}
async function fixture() {
  const pixels = new Uint8Array(4 * 4 * 4).fill(255);
  const image = await sharp(pixels, { raw: { width: 4, height: 4, channels: 4 } })
    .png()
    .toBuffer();
  const map = {
    slot: 'baseColor',
    file: 'baseColor.png',
    sha256: digest(image),
    bytes: image.length,
    width: 4,
    height: 4,
    usage: 'albedo',
    colorSpace: 'srgb',
    sourceId: 'source',
    transforms: [],
  } as const;
  const child = identify<MaterialManifestV1>({
    schemaVersion: 1,
    materialId: 'source',
    revisionId: zero,
    name: 'Source',
    tags: [],
    tileable: false,
    parameters,
    sources: [
      {
        id: 'source',
        kind: 'external',
        provider: 'Test',
        creator: 'Test',
        assetUrl: 'https://example.com/source',
        license,
        originalFiles: [{ name: 'source.png', bytes: image.length, sha256: digest(image) }],
      },
    ],
    maps: [{ ...map, transforms: [], originalFile: 'source.png' }],
  });
  const pin = {
    resourceId: child.materialId,
    revisionId: child.revisionId,
    sha256: child.revisionId,
  };
  const resourceId = `kiln.library.${child.materialId}.${child.revisionId.slice(7)}.baseColor`;
  const descriptor = {
    materialId: child.materialId,
    revisionId: child.revisionId as `sha256:${string}`,
    resourceId,
    slot: 'baseColor',
    usage: 'albedo',
    colorSpace: 'srgb',
    width: 4,
    height: 4,
    encodedByteLength: image.length,
    imageSha256: digest(image),
    decodedPixelHash: digest(pixels),
  } as const;
  const resources: PinnedMaterialMapPortV1 = {
    describePinnedMaterialMap: () => descriptor,
    resolvePinnedMaterialMapPixels: async () => ({
      descriptor,
      pixels: pixels.slice(),
      decodedPixelHash: digest(pixels),
    }),
  };
  const atlas = await compileTextureAtlasSpecV1(
    {
      schemaVersion: 1,
      width: 8,
      height: 8,
      usage: 'albedo',
      sampler,
      regions: [
        {
          name: 'cell',
          content: { x: 2, y: 2, width: 4, height: 4 },
          source: { kind: 'resource', resourceId, pin },
        },
      ],
    },
    { resources },
  );
  const atlasImage = await sharp(atlas.pixels, { raw: { width: 8, height: 8, channels: 4 } })
    .png()
    .toBuffer();
  const parent = identify<MaterialManifestV2>({
    schemaVersion: 2,
    materialId: 'atlas',
    revisionId: zero,
    name: 'Atlas',
    tags: [],
    tileable: false,
    parameters,
    dependencies: [pin],
    sources: [
      {
        id: 'source',
        kind: 'procedural',
        provider: 'Kiln',
        creator: 'Test',
        license,
        originalFiles: [],
      },
    ],
    maps: [
      {
        ...map,
        transforms: [],
        width: 8,
        height: 8,
        bytes: atlasImage.length,
        sha256: digest(atlasImage),
        sampler,
        pixelHash: atlas.manifest.decodedPixelHash,
        recipe: {
          kind: 'atlas',
          compilerId: atlas.manifest.compilerId,
          spec: atlas.spec,
          manifest: atlas.manifest,
          encoder: { name: 'sharp', version: sharp.versions.sharp! },
        },
      },
    ],
  });
  const payload: MaterialLibraryPayload = {
    schemaVersion: 2,
    records: [
      { manifest: parent, files: { 'baseColor.png': atlasImage.toString('base64') } },
      { manifest: child, files: { 'baseColor.png': image.toString('base64') } },
    ],
  };
  const asset: AssetRecord = {
    manifest: {
      version: 'kiln.asset.v1',
      assetId: 'card',
      revisionId: 'r_card',
      name: 'Card',
      tags: [],
      createdAt: '2026-10-11T00:00:00.000Z',
      editable: false,
      files: {},
      build: {
        engine: 'test',
        options: {},
        warnings: [],
        rebuild: 'external-dependencies-required',
        dependencies: [{ kind: 'kiln.material.v2', delivery: 'runtime', manifest: parent }],
      },
    },
    files: {},
    materialResources: payload,
  };
  return { asset, child, parent, payload };
}

test('portable asset accepts root declarations with exact transitive atlas records', async () => {
  const { asset } = await fixture();
  expect(() => validateAssetMaterialClosure(asset, true)).not.toThrow();
  const reversed = structuredClone(asset);
  reversed.materialResources!.records.reverse();
  expect(() => validateAssetMaterialClosure(reversed, true)).not.toThrow();
});

test('asset closure rejects missing children, orphans, duplicate payloads and mismatched root tags', async () => {
  const { asset, child } = await fixture();
  for (const mutate of [
    (a: AssetRecord) => {
      a.materialResources!.records.pop();
    },
    (a: AssetRecord) => {
      if (a.materialResources?.schemaVersion !== 2) throw new Error('Expected modern fixture');
      a.materialResources.records.push(structuredClone(a.materialResources.records[1]!));
    },
    (a: AssetRecord) => {
      a.materialResources!.records.push({
        manifest: identify({ ...child, materialId: 'orphan' }),
        files: { ...a.materialResources!.records[1]!.files },
      });
    },
    (a: AssetRecord) => {
      (a.manifest.build!.dependencies![0] as { kind: string }).kind = 'kiln.material.v1';
    },
  ]) {
    const changed = structuredClone(asset);
    mutate(changed);
    expect(() => validateAssetMaterialClosure(changed, true)).toThrow();
  }
});

test('conflicting same-identity declarations and unknown runtime tags fail even without a payload', async () => {
  const { asset, parent } = await fixture();
  delete asset.materialResources;
  asset.manifest.build!.dependencies!.push({
    kind: 'kiln.material.v2',
    delivery: 'runtime',
    manifest: { ...parent, name: 'Conflicting' },
  });
  expect(() => validateAssetMaterialClosure(asset)).toThrow(/conflict/i);
  asset.manifest.build!.dependencies = [{ kind: 'kiln.material.v99', delivery: 'runtime' }];
  expect(() => validateAssetMaterialClosure(asset)).toThrow(/unsupported/i);
});
