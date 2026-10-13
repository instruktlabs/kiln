import { expect, test } from 'bun:test';
import { NodeIO } from '@gltf-transform/core';
import { buildSandboxGlobals } from '../primitives';
import { evaluateEvaluatorRequestV2 } from './handler';
import { createEvaluatorRequestV2, decodeEvaluatorResultV2 } from './protocol';

test('atlas sandbox closes host capabilities and counts authored use', async () => {
  const usage: Record<string, number> = {};
  const globals = buildSandboxGlobals(usage);
  const atlas = globals['textureAtlas'] as (...args: unknown[]) => Promise<unknown>;
  expect(typeof atlas).toBe('function');
  expect(typeof globals['remapUVToAtlas']).toBe('function');
  await expect(atlas({}, { resources: 'PRIVATE_HOST_PORT' })).rejects.toThrow(/exactly one/);
  await expect(atlas()).rejects.toThrow(/exactly one/);
  expect(usage['textureAtlas']).toBe(2);
});

test('atlas validation gives closed authoring advice without echoing source fields', async () => {
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'atlas-invalid',
      code: `async function build(){await textureAtlas({schemaVersion:1,PRIVATE_FIELD:'PRIVATE_VALUE'});return createRoot('Root');}`,
    }).json,
  );
  expect(decodeEvaluatorResultV2(wire, 1024 * 1024, 'atlas-invalid')).toMatchObject({
    ok: false,
    error: { code: 'EXECUTION_REJECTED', diagnostic: 'TEXTURE_ATLAS_CONTRACT' },
  });
  expect(wire).not.toContain('PRIVATE_');
});

test('authored named atlas and explicit UV orientation export together through evaluator', async () => {
  const code = `async function build() {
    const root = createRoot('AtlasCard');
    const atlas = await textureAtlas({schemaVersion:1,width:8,height:8,usage:'albedo',
      sampler:{minFilter:'nearest',magFilter:'nearest',wrapS:'clamp-to-edge',wrapT:'clamp-to-edge'},
      regions:[{name:'leaf',content:{x:2,y:2,width:4,height:4},source:{kind:'procedural',spec:{
        schemaVersion:3,width:4,height:4,background:[120,70,30,255],operations:[]}}}]});
    const geometry = remapUVToAtlas(planeGeo(1,1),atlas,'leaf',{inputOrigin:'bottom-left',mode:'texel-center'});
    createPart('Card',geometry,pbrMaterial({albedo:atlas,alphaMode:'mask',doubleSided:true}),{parent:root});
    return root;
  }`;
  const wire = await evaluateEvaluatorRequestV2(
    createEvaluatorRequestV2({
      requestId: 'atlas-valid',
      code,
      options: { optimize: 'off' },
    }).json,
  );
  const result = decodeEvaluatorResultV2(wire, 16 * 1024 * 1024, 'atlas-valid');
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error('Atlas evaluator failed');
  const doc = await new NodeIO().readBinary(result.render.glb);
  const material = doc.getRoot().listMaterials()[0]!;
  expect(material.getBaseColorTexture()!.getSize()).toEqual([8, 8]);
  expect(material.getBaseColorTextureInfo()!.getMinFilter()).toBe(9728);
  expect(material.getDoubleSided()).toBe(true);
  const uv = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute('TEXCOORD_0')!;
  const values = Array.from(uv.getArray()!);
  expect(Math.min(...values)).toBe(2.5 / 8);
  expect(Math.max(...values)).toBe(5.5 / 8);
});
