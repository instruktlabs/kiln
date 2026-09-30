import { expect, test } from 'bun:test';
import { createMaterialRecordV1, createMaterialLibraryPayload } from '../material-library-node';
import { materialLibraryPortableSpec } from '../material-library';
import { createEvaluatorRequestV2, decodeEvaluatorRequestV2 } from './protocol';
import { renderGLBViaSubprocess } from './subprocess';
import { renderGLBInProcess } from '../render';
import { createCachedEvaluatorPort, MemoryBuildCache } from '../build-cache';
import { buildSandboxGlobals } from '../primitives';

async function fixture(seed = 3) {
  const record = await createMaterialRecordV1({
    materialId: 'portable-plaster',
    name: 'Portable plaster',
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
          usage: 'albedo',
          size: 8,
          layers: [{ op: 'noise', colorA: 0xbbaaaa, colorB: 0xeeeedd, seed }],
        },
      },
    ],
  });
  const materialResources = await createMaterialLibraryPayload([record]);
  const code = `const meta = { name: 'Library box', category: 'prop' };
    async function build() { const root = createRoot('Root');
      const material = await compilePortableMaterialSpecV2(${JSON.stringify(materialLibraryPortableSpec(record.manifest))});
      createPart('Box', boxGeo(1, 1, 1), material, { parent: root }); return root; }`;
  return { record, materialResources, code };
}
test('evaluator transports complete pinned material records as data', async () => {
  const { materialResources, code } = await fixture();
  const request = createEvaluatorRequestV2({
    requestId: 'materials',
    code,
    options: { materialResources },
  });
  expect(decodeEvaluatorRequestV2(request.json).options.materialResources).toEqual(
    materialResources,
  );
});
test('default subprocess produces embedded GLB texture from library data without host paths or callbacks', async () => {
  const { materialResources, code } = await fixture();
  const result = await renderGLBViaSubprocess(code, { materialResources, optimize: 'off' });
  expect(result.materialLibraryDependencies).toEqual(
    materialResources.records.map((record) => record.manifest),
  );
  const bytes = result.glb;
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    12,
    true,
  );
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  expect(json.images.length).toBe(1);
  expect(json.images[0].uri).toBeUndefined();
  expect(json.images[0].bufferView).toBeNumber();
  expect(json.materials[0].pbrMetallicRoughness.baseColorTexture.index).toBeNumber();
  await expect(renderGLBViaSubprocess(code, { optimize: 'off' })).rejects.toThrow();
});
test('material payload participates in exact build cache identity', async () => {
  const a = await fixture();
  const b = await fixture(4);
  const result = await renderGLBInProcess(a.code, {
    materialResources: a.materialResources,
    optimize: 'off',
  });
  let calls = 0;
  const cached = createCachedEvaluatorPort(
    {
      render: async () => {
        calls++;
        return result;
      },
    },
    { cache: new MemoryBuildCache(), identity: () => 'material-test' },
  );
  await cached.render(a.code, { materialResources: a.materialResources });
  await cached.render(a.code, { materialResources: a.materialResources });
  await cached.render(a.code, { materialResources: b.materialResources });
  expect(calls).toBe(2);
});
test('authored code cannot replace the portable material resolver capability', async () => {
  const compile = buildSandboxGlobals()['compilePortableMaterialSpecV2'] as (
    ...args: unknown[]
  ) => Promise<unknown>;
  await expect(
    compile({ schemaVersion: 2, model: 'pbrMetallicRoughness' }, { resolver: {} }),
  ).rejects.toThrow(/exactly one/);
});
