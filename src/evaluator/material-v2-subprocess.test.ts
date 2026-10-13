import { expect, test } from 'bun:test';
import { createMaterialRecordV2, createMaterialLibraryPayload } from '../material-library-node';
import { materialLibraryPortableSpec, materialLibraryResourceId } from '../material-library';
import { renderGLBInProcess } from '../render';
import { renderGLBViaSubprocess } from './subprocess';
import { NodeIO } from '@gltf-transform/core';

async function fixture() {
  const source = {
    id: 'authored',
    kind: 'procedural',
    provider: 'Kiln',
    creator: 'Subprocess fixture',
    license: {
      spdx: 'CC0-1.0',
      url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      attribution: '',
    },
    originalFiles: [],
  };
  const sampler = {
    minFilter: 'nearest',
    magFilter: 'nearest',
    wrapS: 'clamp-to-edge',
    wrapT: 'clamp-to-edge',
  };
  const child = await createMaterialRecordV2({
    schemaVersion: 2,
    materialId: 'subprocess-source',
    name: 'Source',
    tileable: false,
    sources: [source],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        sampler,
        procedural: {
          schemaVersion: 3,
          width: 4,
          height: 8,
          background: [80, 100, 40, 255],
          operations: [],
        },
      },
    ],
  });
  const pin = {
    resourceId: child.manifest.materialId,
    revisionId: child.manifest.revisionId,
    sha256: child.manifest.revisionId,
  };
  const atlas = await createMaterialRecordV2(
    {
      schemaVersion: 2,
      materialId: 'subprocess-atlas',
      name: 'Atlas',
      tileable: false,
      sources: [source],
      maps: [
        {
          slot: 'baseColor',
          sourceId: 'authored',
          transforms: [],
          sampler,
          atlas: {
            schemaVersion: 1,
            width: 16,
            height: 16,
            usage: 'albedo',
            sampler,
            regions: [
              {
                name: 'patch',
                content: { x: 2, y: 2, width: 4, height: 8 },
                source: {
                  kind: 'resource',
                  resourceId: materialLibraryResourceId(child.manifest, 'baseColor'),
                  pin,
                },
              },
            ],
          },
        },
      ],
    },
    { materials: [child] },
  );
  const resources = await createMaterialLibraryPayload([atlas, child]);
  if (resources.schemaVersion !== 2) throw Error('Fixture must carry the V2 payload');
  const code = `async function build(){const root=createRoot('SubprocessAtlas');const material=await compilePortableMaterialSpecV3(${JSON.stringify(materialLibraryPortableSpec(atlas.manifest))});const geometry=remapUVToAtlas(planeGeo(.5,1),material.map,'patch',{inputOrigin:'bottom-left',mode:'texel-center'});createPart('Card',geometry,material,{parent:root});return root;}`;
  return { child, atlas, resources, code };
}

for (const gltfExporter of ['legacy', 'three'] as const)
  test(`actual subprocess admits V2 material and pinned atlas closure with exact ${gltfExporter} output`, async () => {
    const { resources, code } = await fixture();
    expect(resources.schemaVersion).toBe(2);
    // The isolated worker intentionally does not inherit exporter environment switches.
    // Match both sides explicitly, as the public renderGLB entrypoint does.
    const options = { materialResources: resources, optimize: 'off' as const, gltfExporter };
    const direct = await renderGLBInProcess(code, options);
    const contained = await renderGLBViaSubprocess(code, options);
    expect(contained.glb).toEqual(direct.glb);
    expect(contained.artifactGlbSha256).toBe(direct.artifactGlbSha256);
    expect(contained.materialLibraryDependencies).toEqual(resources.records.map((r) => r.manifest));
    const doc = await new NodeIO().readBinary(contained.glb);
    expect(doc.getRoot().listMaterials()[0]!.getBaseColorTextureInfo()!.getMinFilter()).toBe(9728);
    expect(
      doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getExtras().kilnAtlasBinding,
    ).toEqual(expect.objectContaining({ region: 'patch' }));
  });

test('V2 subprocess material admission retains count limits and rejects changed encoded map bytes', async () => {
  const { resources, code } = await fixture();
  const oversized = {
    ...resources,
    records: Array.from({ length: 17 }, () => resources.records[0]!),
  };
  await expect(renderGLBViaSubprocess(code, { materialResources: oversized })).rejects.toThrow();
  const tampered = structuredClone(resources);
  const record = tampered.records[0]!,
    file = Object.keys(record.files)[0]!;
  const bytes = Buffer.from(record.files[file]!, 'base64');
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
  record.files[file] = bytes.toString('base64');
  await expect(renderGLBViaSubprocess(code, { materialResources: tampered })).rejects.toThrow();
});
