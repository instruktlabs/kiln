import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { FileAssetLibrary } from './assets-node';
import { ASSET_MATERIAL_BYTES, decodeAssetBundle, encodeAssetBundle } from './assets';
import { zipSync } from 'three/addons/libs/fflate.module.js';
import { readAssetResource } from './assets-resources';
import {
  FileMaterialLibrary,
  createMaterialRecordV1,
  createMaterialLibraryPayload,
} from './material-library-node';
import {
  canonicalMaterialJson,
  materialLibraryPortableSpec,
  type MaterialManifestV1,
} from './material-library';
import { resolveSavedAssetMaterials } from './asset-materials-node';
import { renderGLBInProcess } from './render';
import { resolveAssetMaterialPayload } from './project-bundle-node';
import { FileWorkspace } from './workspace-node';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function library() {
  const root = await mkdtemp(join(tmpdir(), 'kiln-standalone-material-'));
  roots.push(root);
  const materials = new FileMaterialLibrary(join(root, '.kiln/materials'));
  return {
    root,
    materials,
    assets: new FileAssetLibrary({ local: join(root, 'assets') }, materials),
  };
}
async function fixture() {
  const host = await library();
  const material = await createMaterialRecordV1({
    materialId: 'standalone-plaster',
    name: 'Standalone plaster',
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
            { op: 'noise', colorA: 0x779944, colorB: 0xeeeecc, seed: 17, scale: 4, octaves: 2 },
          ],
        },
      },
    ],
  });
  await host.materials.import([material]);
  const code = `const meta={name:'Standalone cube'};async function build(){const root=createRoot('Root');const material=await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(material.manifest))});createPart('Body',boxGeo(1,1,1),material,{parent:root});return root;}`;
  const rendered = await renderGLBInProcess(code, {
    materialResources: await createMaterialLibraryPayload([material]),
  });
  const manifest = await host.assets.save('local', {
    name: 'Standalone cube',
    code,
    glb: rendered.glb,
    build: {
      engine: 'test',
      options: rendered.rebuildOptions!,
      warnings: [],
      dependencies: [
        { kind: 'kiln.material.v1', delivery: 'runtime', manifest: material.manifest },
      ],
      rebuild: 'external-dependencies-required',
    },
  });
  return { ...host, material, code, rendered, manifest };
}

test('standalone editable ZIP preserves exact material closure through browser roundtrip and offline import/rebuild', async () => {
  const source = await fixture();
  const uri = `kiln://assets/local/${source.manifest.assetId}/${source.manifest.revisionId}/editable.zip`;
  const bundle = await readAssetResource(source.assets, uri);
  const decoded = decodeAssetBundle(bundle.bytes);
  expect(decoded[0]!.materialResources?.records).toHaveLength(1);
  const browserRoundtrip = decodeAssetBundle(encodeAssetBundle(decoded));
  expect(browserRoundtrip[0]!.manifest).toEqual(source.manifest);
  const target = await library();
  await target.assets.import('local', browserRoundtrip);
  expect(
    (
      await target.materials.read(
        source.material.manifest.materialId,
        source.material.manifest.revisionId,
      )
    ).manifest,
  ).toEqual(source.material.manifest);
  const imported = await target.assets.read(
    'local',
    source.manifest.assetId,
    source.manifest.revisionId,
  );
  expect(imported.files['source.kiln.js']).toEqual(new TextEncoder().encode(source.code));
  // A durable collection remains editable even when opened from a different workspace.
  const isolatedWorkspace = new FileWorkspace((await library()).root);
  const resources = await resolveAssetMaterialPayload(isolatedWorkspace, imported);
  const rebuilt = await renderGLBInProcess(source.code, { materialResources: resources });
  expect(rebuilt.artifactGlbSha256).toBe(source.rendered.artifactGlbSha256);
  expect(await isolatedWorkspace.projects.list()).toEqual([]);
});

test('missing editable material closure rejects ZIP export but embedded GLB stays readable', async () => {
  const source = await fixture();
  const record = await source.assets.read(
    'local',
    source.manifest.assetId,
    source.manifest.revisionId,
  );
  delete record.materialResources;
  const legacy = new FileAssetLibrary({ local: join((await library()).root, 'legacy') });
  await legacy.import('local', [record]);
  const read = await legacy.read('local', record.manifest.assetId, record.manifest.revisionId);
  expect(read.files['asset.glb']).toEqual(record.files['asset.glb']);
  await expect(legacy.exportBundle([read])).rejects.toThrow('material');
});

test('tampered or extra material payload rejects before publishing maps or asset revisions', async () => {
  const source = await fixture();
  const record = decodeAssetBundle(
    await source.assets.exportBundle([
      await source.assets.read('local', source.manifest.assetId, source.manifest.revisionId),
    ]),
  )[0]!;
  const target = await library();
  const tampered = structuredClone(record);
  const wire = tampered.materialResources!.records[0]!;
  const name = Object.keys(wire.files)[0]!;
  const bytes = Buffer.from(wire.files[name]!, 'base64');
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
  wire.files[name] = bytes.toString('base64');
  await expect(target.assets.import('local', [tampered])).rejects.toThrow();
  expect(await target.materials.list()).toEqual([]);
  expect(await target.assets.list('local')).toEqual([]);
  const extra = structuredClone(record);
  extra.manifest.build!.dependencies = [];
  extra.manifest.build!.rebuild = 'engine-required';
  await expect(target.assets.import('local', [extra])).rejects.toThrow('closure');
  expect(await target.materials.list()).toEqual([]);
});

test('ZIP material allocation limit is checked against declared size before decompression', () => {
  const bytes = zipSync({ 'asset/r_one/materials.kiln.json': new Uint8Array([0]) }, { level: 0 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Advertise an oversized resource in both ZIP headers without allocating that payload.
  view.setUint32(22, ASSET_MATERIAL_BYTES + 1, true);
  for (let offset = 0; offset < bytes.length - 24; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint32(offset + 24, ASSET_MATERIAL_BYTES + 1, true);
      break;
    }
  }
  expect(() => decodeAssetBundle(bytes)).toThrow('oversized');
});

test('reimport of a legacy identical revision atomically adds its missing editable closure', async () => {
  const source = await fixture();
  const record = await source.assets.read(
    'local',
    source.manifest.assetId,
    source.manifest.revisionId,
  );
  const target = new FileAssetLibrary({ local: join((await library()).root, 'legacy') });
  const legacy = { manifest: record.manifest, files: record.files };
  await target.import('local', [legacy]);
  expect(
    (await target.read('local', record.manifest.assetId, record.manifest.revisionId))
      .materialResources,
  ).toBeUndefined();
  await target.import('local', [record]);
  const enriched = await target.read('local', record.manifest.assetId, record.manifest.revisionId);
  expect(enriched.manifest).toEqual(record.manifest);
  expect(enriched.materialResources).toEqual(record.materialResources);
});

test('declared dependency count and aggregate map bytes reject before any material library reads', async () => {
  const source = await fixture();
  const original = await source.assets.read(
    'local',
    source.manifest.assetId,
    source.manifest.revisionId,
  );
  delete original.materialResources;
  function declaration(id: string, bytes: number): MaterialManifestV1 {
    const manifest = structuredClone(source.material.manifest);
    manifest.materialId = id;
    manifest.maps[0]!.bytes = bytes;
    const { revisionId: _, ...content } = manifest;
    manifest.revisionId = `sha256:${createHash('sha256').update(canonicalMaterialJson(content)).digest('hex')}`;
    return manifest;
  }
  let reads = 0;
  const materials = {
    async list() {
      return [];
    },
    async read(): Promise<never> {
      reads++;
      throw new Error('Must reject before read');
    },
    async import() {
      return [];
    },
  };
  const oversized = Array.from({ length: 9 }, (_, index) => ({
    ...original,
    manifest: {
      ...original.manifest,
      assetId: `asset-${index}`,
      build: {
        ...original.manifest.build!,
        dependencies: [
          {
            kind: 'kiln.material.v1',
            delivery: 'runtime',
            manifest: declaration(`material-${index}`, 8 * 1024 * 1024),
          },
        ],
      },
    },
  }));
  const store = new FileAssetLibrary({ local: join((await library()).root, 'bounded') }, materials);
  await expect(store.exportBundle(oversized)).rejects.toThrow('allocation');
  await expect(store.import('local', oversized)).rejects.toThrow('allocation');
  expect(reads).toBe(0);
  const tooMany = {
    ...original,
    manifest: {
      ...original.manifest,
      build: {
        ...original.manifest.build!,
        dependencies: Array.from({ length: 17 }, (_, index) => ({
          kind: 'kiln.material.v1',
          delivery: 'runtime',
          manifest: declaration(`small-${index}`, source.material.manifest.maps[0]!.bytes),
        })),
      },
    },
  };
  await expect(resolveSavedAssetMaterials(tooMany, materials)).rejects.toThrow('limit');
  expect(reads).toBe(0);
});
