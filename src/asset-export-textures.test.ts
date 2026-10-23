/**
 * Runtime texture manifest and content-addressed external textures (#213).
 *
 * The fixture GLB is built with glTF-Transform from two fixed PNGs, so its bytes depend only
 * on pinned packages, never on Kiln's renderer.
 */
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Document, WebIO } from '@gltf-transform/core';
import { validateBytes } from 'gltf-validator';
import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { exportAssetGlb } from './asset-export';
import type { AssetRecord } from './assets';
import { canonicalMaterialJson, type MaterialManifestV1 } from './material-library';

const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const BASE_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGM4oaGhcUKDQUPjxJ07dwAhpgXd58qIBQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const NORMAL_PNG = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNoaPjf0PCfAUIBADX2B/1D9pjhAAAAAElFTkSuQmCC',
    'base64',
  ),
);

/** One textured triangle: base colour then normal map, in that image order. */
async function texturedGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
    .setBuffer(buffer);
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
    .setBuffer(buffer);
  const base = doc.createTexture('base').setImage(BASE_PNG).setMimeType('image/png');
  const normal = doc.createTexture('normal').setImage(NORMAL_PNG).setMimeType('image/png');
  const material = doc.createMaterial('Brick').setBaseColorTexture(base).setNormalTexture(normal);
  const primitive = doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('TEXCOORD_0', uv)
    .setMaterial(material);
  const node = doc.createNode('Tri').setMesh(doc.createMesh('Tri').addPrimitive(primitive));
  doc.createScene('Scene').addChild(node);
  return new WebIO().writeBinary(doc);
}

function texturedRecord(assetId: string, glb: Uint8Array): AssetRecord {
  return {
    manifest: {
      version: 'kiln.asset.v1',
      assetId,
      revisionId: `r_${assetId}`,
      name: assetId,
      tags: [],
      createdAt: '2026-10-22T00:00:00.000Z',
      editable: false,
      files: { 'asset.glb': { bytes: glb.length, sha256: sha(glb) as `sha256:${string}` } },
    },
    files: { 'asset.glb': glb },
  };
}

test('without a texture option, runtime and three exports keep their pre-manifest bytes', async () => {
  const record = texturedRecord('a_tex', await texturedGlb());
  const plain = await exportAssetGlb(record, { profile: 'runtime' });
  const three = await exportAssetGlb(record, { profile: 'runtime', target: 'three' });
  if (plain.profile !== 'runtime' || three.profile !== 'runtime') throw new Error('runtime');
  // Recorded on main before the manifest existed (2026-10-22): the default stays byte-identical.
  expect({
    plainGlb: sha(plain.glb),
    plainMetadata: sha(plain.metadata.bytes),
    threeGlb: sha(three.glb),
    threeMetadata: sha(three.metadata.bytes),
  }).toEqual({
    plainGlb: 'sha256:975e9ee4580d90ea61948ee28da42494c78b89e61ced4c79c6ebc4f4fea961e3',
    plainMetadata: 'sha256:cb34dde89a001478c04fa165c2eb64197b9cd490de2f50266425b9dc8cd1a44b',
    threeGlb: 'sha256:159cf047413a6501ed0e4dd75e418bc78c961b6022ef38ccb8ac2e8381fde09f',
    threeMetadata: 'sha256:9f8a384e00f85511c3a7f7ce70951943722cf35aa96e2b9c9854a32975233385',
  });
});

/** A library material whose two maps are exactly the fixture PNGs. */
function brickMaterial(): MaterialManifestV1 {
  const license = {
    spdx: 'CC0-1.0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: '',
  };
  const map = (slot: 'baseColor' | 'normal', png: Uint8Array) =>
    ({
      slot,
      file: `${slot}.png`,
      sha256: sha(png),
      bytes: png.length,
      width: 2,
      height: 2,
      usage: slot === 'baseColor' ? 'albedo' : 'normal',
      colorSpace: slot === 'baseColor' ? 'srgb' : 'linear',
      ...(slot === 'normal' ? { normalConvention: 'opengl' } : {}),
      sourceId: 'scan',
      originalFile: `${slot}.png`,
      transforms: [],
    }) as MaterialManifestV1['maps'][number];
  const body = {
    schemaVersion: 1 as const,
    materialId: 'brick',
    name: 'Brick',
    tags: [],
    tileable: true,
    parameters: {
      roughness: 1,
      metalness: 0,
      emissiveIntensity: 1,
      alphaMode: 'opaque' as const,
      alphaCutoff: 0.5,
      doubleSided: false,
    },
    sources: [
      {
        id: 'scan',
        kind: 'external' as const,
        provider: 'Test',
        creator: 'Test',
        assetUrl: 'https://example.com/brick',
        license,
        originalFiles: [
          { name: 'baseColor.png', bytes: BASE_PNG.length, sha256: sha(BASE_PNG) },
          { name: 'normal.png', bytes: NORMAL_PNG.length, sha256: sha(NORMAL_PNG) },
        ],
      },
    ],
    maps: [map('baseColor', BASE_PNG), map('normal', NORMAL_PNG)],
  };
  return { ...body, revisionId: sha(new TextEncoder().encode(canonicalMaterialJson(body))) };
}

function withMaterial(record: AssetRecord, manifest: MaterialManifestV1): AssetRecord {
  record.manifest.build = {
    engine: 'test',
    options: {},
    warnings: [],
    rebuild: 'external-dependencies-required',
    dependencies: [{ kind: 'kiln.material.v1', delivery: 'runtime', manifest }],
  };
  record.materialResources = {
    schemaVersion: 1,
    records: [
      {
        manifest,
        files: {
          'baseColor.png': Buffer.from(BASE_PNG).toString('base64'),
          'normal.png': Buffer.from(NORMAL_PNG).toString('base64'),
        },
      },
    ],
  };
  return record;
}

const sidecar = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes));

for (const target of [undefined, 'three'] as const)
  test(`texture manifest names exact image bytes and library pins (${target ?? 'plain'} runtime)`, async () => {
    const glb = await texturedGlb();
    const material = brickMaterial();
    const pin = {
      resourceId: 'brick',
      revisionId: material.revisionId,
      sha256: material.revisionId,
    };
    const manifests = [];
    for (const assetId of ['a_wall', 'a_floor']) {
      const output = await exportAssetGlb(withMaterial(texturedRecord(assetId, glb), material), {
        profile: 'runtime',
        textures: 'manifest',
        ...(target ? { target } : {}),
      });
      if (output.profile !== 'runtime') throw new Error('runtime');
      const metadata = sidecar(output.metadata.bytes);
      // The provenance hash binds the GLB to the sidecar that carries the manifest.
      const stamped = JSON.parse(
        new TextDecoder().decode(
          output.glb.subarray(
            20,
            20 + new DataView(output.glb.buffer, output.glb.byteOffset).getUint32(12, true),
          ),
        ),
      ).asset.extras.kilnProvenanceV1;
      expect(stamped.metadata.sha256).toBe(sha(output.metadata.bytes));
      manifests.push(metadata.textures);
    }
    expect(manifests[0]).toEqual([
      {
        image: 0,
        sha256: sha(BASE_PNG),
        bytes: BASE_PNG.length,
        mimeType: 'image/png',
        width: 2,
        height: 2,
        colorSpace: 'srgb',
        material: { pin, slot: 'baseColor' },
      },
      {
        image: 1,
        sha256: sha(NORMAL_PNG),
        bytes: NORMAL_PNG.length,
        mimeType: 'image/png',
        width: 2,
        height: 2,
        colorSpace: 'linear',
        material: { pin, slot: 'normal' },
      },
    ]);
    // Two assets that use one library material share one identity per image.
    expect(manifests[1]).toEqual(manifests[0]);
  });

test('texture manifest without a material closure carries no pin, and options are validated', async () => {
  const record = texturedRecord('a_bare', await texturedGlb());
  const output = await exportAssetGlb(record, { profile: 'runtime', textures: 'manifest' });
  if (output.profile !== 'runtime') throw new Error('runtime');
  expect(
    sidecar(output.metadata.bytes).textures.map((entry: { material?: unknown }) => entry.material),
  ).toEqual([undefined, undefined]);
  await expect(exportAssetGlb(record, { textures: 'manifest' })).rejects.toThrow(/runtime/);
  await expect(
    exportAssetGlb(record, { profile: 'runtime', textures: 'external' }),
  ).rejects.toThrow(/target three/);
  await expect(
    exportAssetGlb(record, { profile: 'runtime', textures: 'embedded' as never }),
  ).rejects.toThrow(/texture/i);
});

test('external textures write JSON glTF with content-addressed images that validators and GLTFLoader resolve', async () => {
  const record = withMaterial(texturedRecord('a_ext', await texturedGlb()), brickMaterial());
  const names = { metadataFileName: 'wall.kiln-metadata.json' };
  const output = await exportAssetGlb(record, {
    profile: 'runtime',
    target: 'three',
    textures: 'external',
    gltfFileName: 'wall.gltf',
    ...names,
  });
  if (output.profile !== 'runtime' || output.layout !== 'gltf') throw new Error('gltf layout');
  const uris = [BASE_PNG, NORMAL_PNG].map((png) => `textures/${sha(png).slice(7)}.png`);
  const metadata = sidecar(output.metadata.bytes);
  expect(metadata.textures.map((entry: { uri: string }) => entry.uri)).toEqual(uris);
  expect(output.textures.map(({ uri }) => uri)).toEqual(uris);
  expect(output.textures.map(({ bytes }) => sha(bytes))).toEqual([sha(BASE_PNG), sha(NORMAL_PNG)]);
  expect(output.buffers.map(({ uri }) => uri)).toEqual(['wall.bin']);
  const json = JSON.parse(new TextDecoder().decode(output.gltf.bytes));
  expect(output.gltf.name).toBe('wall.gltf');
  expect(json.images.map((image: { uri: string }) => image.uri)).toEqual(uris);
  expect(json.images.some((image: object) => 'bufferView' in image)).toBe(false);
  expect(json.asset.extras.kilnProvenanceV1).toEqual({
    version: 'kiln.provenance.v1',
    profile: 'runtime',
    target: 'three',
    metadata: { uri: 'wall.kiln-metadata.json', sha256: sha(output.metadata.bytes) },
  });
  // The embedded form names the same images; only the content addresses are added.
  const embedded = await exportAssetGlb(record, {
    profile: 'runtime',
    target: 'three',
    textures: 'manifest',
    ...names,
  });
  if (embedded.profile !== 'runtime') throw new Error('runtime');
  expect(sidecar(embedded.metadata.bytes).textures).toEqual(
    metadata.textures.map(({ uri: _uri, ...entry }: { uri: string }) => entry),
  );
  // Deterministic for the same input.
  const again = await exportAssetGlb(record, {
    profile: 'runtime',
    target: 'three',
    textures: 'external',
    gltfFileName: 'wall.gltf',
    ...names,
  });
  if (again.profile !== 'runtime' || again.layout !== 'gltf') throw new Error('gltf layout');
  expect(again.gltf.bytes).toEqual(output.gltf.bytes);
  expect(again.metadata.bytes).toEqual(output.metadata.bytes);

  const files = new Map(
    [...output.buffers, ...output.textures].map(({ uri, bytes }) => [uri, bytes] as const),
  );
  const resource = async (uri: string) => {
    const bytes = files.get(decodeURIComponent(uri));
    if (!bytes) throw new Error(`missing ${uri}`);
    return bytes;
  };
  const report = (await validateBytes(output.gltf.bytes, {
    uri: 'wall.gltf',
    externalResourceFunction: resource,
  })) as { issues: { numErrors: number }; info: { resources: { uri?: string }[] } };
  expect(report.issues.numErrors).toBe(0);
  // The validator read the buffer and both images through their relative URIs.
  expect(report.info.resources.map(({ uri }) => uri).filter(Boolean)).toEqual(
    expect.arrayContaining(['wall.bin', ...uris]),
  );

  await MeshoptDecoder.ready;
  const requested: string[] = [];
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    const path = url.replace(/^\.\//, '');
    requested.push(path);
    const bytes = files.get(path);
    if (!bytes) throw new Error(`Unexpected resource request ${url}`);
    return `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`;
  });
  // Node has no image decoder: GLTFLoader reports each texture and loads the geometry.
  // FileLoader reports progress with the DOM ProgressEvent, which Bun does not define.
  const errors = console.error;
  const scope = globalThis as { ProgressEvent?: unknown };
  const progress = scope.ProgressEvent;
  scope.ProgressEvent ??= class extends Event {};
  console.error = () => {};
  try {
    const loaded = await new GLTFLoader(manager)
      .setMeshoptDecoder(MeshoptDecoder)
      .parseAsync(new TextDecoder().decode(output.gltf.bytes), './');
    expect(loaded.scene.getObjectByName('Tri')).toBeDefined();
  } finally {
    console.error = errors;
    scope.ProgressEvent = progress;
  }
  expect([...new Set(requested)].sort()).toEqual(['wall.bin', ...uris].sort());
});

test('external textures combine with compression none: plain buffers, same content-addressed images', async () => {
  const record = withMaterial(texturedRecord('a_plain', await texturedGlb()), brickMaterial());
  const output = await exportAssetGlb(record, {
    profile: 'runtime',
    target: 'three',
    compression: 'none',
    textures: 'external',
    gltfFileName: 'wall.gltf',
    metadataFileName: 'wall.kiln-metadata.json',
  });
  if (output.profile !== 'runtime' || output.layout !== 'gltf') throw new Error('gltf layout');
  const json = JSON.parse(new TextDecoder().decode(output.gltf.bytes));
  expect(json.extensionsUsed ?? []).not.toContain('EXT_meshopt_compression');
  expect(sidecar(output.metadata.bytes).delivery.compression).toEqual({ extension: 'none' });
  expect(output.textures.map(({ bytes }) => sha(bytes))).toEqual([sha(BASE_PNG), sha(NORMAL_PNG)]);
  const files = new Map(
    [...output.buffers, ...output.textures].map(({ uri, bytes }) => [uri, bytes] as const),
  );
  const report = (await validateBytes(output.gltf.bytes, {
    uri: 'wall.gltf',
    externalResourceFunction: async (uri: string) => files.get(decodeURIComponent(uri))!,
  })) as { issues: { numErrors: number } };
  expect(report.issues.numErrors).toBe(0);
});
