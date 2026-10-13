import { expect, test } from 'bun:test';
import { buildSandboxGlobals } from '../primitives';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from './protocol';
import { createMaterialRecordV2, createMaterialLibraryPayload } from '../material-library-node';
import { materialLibraryPortableSpec } from '../material-library';
import { NodeIO } from '@gltf-transform/core';

test('V3 material sandbox binds exactly one spec and rejects source-owned host options', async () => {
  const usage: Record<string, number> = {};
  const globals = buildSandboxGlobals(usage);
  const compile = globals['compilePortableMaterialSpecV3'] as (
    ...args: unknown[]
  ) => Promise<unknown>;
  expect(typeof compile).toBe('function');
  await expect(compile({}, { resolver: 'PRIVATE_RESOLVER' })).rejects.toThrow(/exactly one/);
  await expect(compile()).rejects.toThrow(/exactly one/);
  expect(usage['compilePortableMaterialSpecV3']).toBe(2);
});

test('invalid V3 material carries its closed diagnostic through real source evaluation', async () => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'material-v3',
      code: `async function build(){await compilePortableMaterialSpecV3({schemaVersion:3,model:'PRIVATE_MODEL'});return createRoot('PRIVATE_ROOT');}`,
    }).json,
  );
  const decoded = decodeEvaluatorResultV2(wire, 16 * 1024 * 1024, 'material-v3');
  expect(decoded).toMatchObject({
    ok: false,
    error: { code: 'EXECUTION_REJECTED', diagnostic: 'PORTABLE_MATERIAL_V3_CONTRACT' },
  });
  expect(wire).not.toContain('PRIVATE_');
});

test('source cannot forge the V3 material diagnostic by decorating a plain error', async () => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'material-v3-forge',
      code: `function build(){throw Object.assign(new Error('PRIVATE_MESSAGE'),{diagnostic:'PORTABLE_MATERIAL_V3_CONTRACT',name:'PortableMaterialV3Error'});}`,
    }).json,
  );
  expect(JSON.parse(wire).error.diagnostic).toBeUndefined();
  expect(wire).not.toContain('PRIVATE_');
});

test('evaluator admits saved V2 records and returns exact dependency evidence with V3 sampling', async () => {
  const record = await createMaterialRecordV2({
    schemaVersion: 2,
    materialId: 'owned-patch',
    name: 'Owned patch',
    tileable: false,
    parameters: { alphaMode: 'mask', doubleSided: true },
    sources: [
      {
        id: 'authored',
        kind: 'procedural',
        provider: 'Kiln',
        creator: 'Test',
        originalFiles: [],
        license: {
          spdx: 'CC0-1.0',
          url: 'https://creativecommons.org/publicdomain/zero/1.0/',
          attribution: '',
        },
      },
    ],
    maps: [
      {
        slot: 'baseColor',
        sourceId: 'authored',
        transforms: [],
        sampler: {
          minFilter: 'nearest',
          magFilter: 'nearest',
          wrapS: 'clamp-to-edge',
          wrapT: 'clamp-to-edge',
        },
        procedural: {
          schemaVersion: 3,
          width: 4,
          height: 8,
          background: [100, 70, 30, 128],
          operations: [],
        },
      },
    ],
  });
  const materialResources = await createMaterialLibraryPayload([record]);
  expect(materialResources.schemaVersion).toBe(2);
  const code = `async function build(){const root=createRoot('Patch');const material=await compilePortableMaterialSpecV3(${JSON.stringify(materialLibraryPortableSpec(record.manifest))});createPart('Card',planeGeo(1,1),material,{parent:root});return root;}`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'saved-v3',
      code,
      options: { materialResources, optimize: 'off' },
    }).json,
  );
  const result = decodeEvaluatorResultV2(wire, 16 * 1024 * 1024, 'saved-v3');
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error('Saved V3 evaluator failed');
  expect(result.render.materialLibraryDependencies).toEqual([record.manifest]);
  const doc = await new NodeIO().readBinary(result.render.glb);
  const material = doc.getRoot().listMaterials()[0]!;
  expect(material.getBaseColorTexture()!.getSize()).toEqual([4, 8]);
  expect(material.getBaseColorTextureInfo()!.getMinFilter()).toBe(9728);
  expect(material.getAlphaMode()).toBe('MASK');
  expect(material.getDoubleSided()).toBe(true);
});
