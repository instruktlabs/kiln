/**
 * #196: `maxLod` on the three runtime target keeps LOD0..LODn of every `MSFT_lod` chain and
 * drops the rest, so a loader that never selects a level does not download it. Thresholds are
 * trimmed with the levels, budget tiers that no longer describe the file are left out of the
 * shipped declaration, and the sidecar names what was dropped. The default is unchanged.
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { deliverThreeRuntimeGlb, exportAssetGlb } from '../asset-export';
import type { AssetRecord } from '../assets';
import { Document } from '@gltf-transform/core';
import { createGltfIO, MSFT_LOD, MSFTLod } from '../gltf-io';
import { renderGLBInProcess, inspectGlbIntegration } from '../render';

const PROGRAM = `const meta={name:'Tiered Lamp'};
function build(){
  const root=createRoot('Root');
  const m=gameMaterial('#777777');
  const glow=gameMaterial('#ffcc66');
  createPart('Base',boxGeo(1,0.2,1),m,{parent:root});
  const tiers=['Lamp_LOD0','Lamp_LOD1','Lamp_LOD2'].map((name)=>{const g=new THREE.Group();g.name=name;root.add(g);return g;});
  createPart('Hi',sphereGeo(0.5,24,16),m,{parent:tiers[0],position:[0,1,0]});
  createPart('Mid',sphereGeo(0.5,10,8),m,{parent:tiers[1],position:[0,1,0]});
  createPart('Card',planeGeo(1,1),glow,{parent:tiers[2],position:[0,1,0]});
  defineLod(tiers,{screenCoverage:[0.4,0.1,0],impostor:true});
  defineBudget({ triangles: { LOD0: 2000, LOD1: 400, LOD2: 40 }, draws: 3 });
  return root;
}`;

let source: Uint8Array;
beforeAll(async () => {
  source = new Uint8Array((await renderGLBInProcess(PROGRAM)).glb);
});

const json = async (glb: Uint8Array) => (await createGltfIO().binaryToJSON(glb)).json;
const sha = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const plain = (options: Record<string, unknown> = {}) =>
  deliverThreeRuntimeGlb(source, { compression: 'none', ...options });

describe('three runtime maxLod', () => {
  test('maxLod 1 keeps LOD0 and LOD1, trims thresholds and omits the LOD2 budget tier', async () => {
    const full = await plain();
    const trimmed = await plain({ maxLod: 1 });
    expect(trimmed.glb.byteLength).toBeLessThan(full.glb.byteLength);
    const names = (await json(trimmed.glb)).nodes!.map((node) => node.name);
    expect(names).toContain('Lamp_LOD1');
    expect(names).not.toContain('Lamp_LOD2');
    expect(names).not.toContain('Card');
    expect((await json(trimmed.glb)).materials!.map((m) => m.name)).toHaveLength(
      (await json(full.glb)).materials!.length - 1,
    );
    const manifest = (await inspectGlbIntegration(trimmed.glb))!;
    expect(manifest.levelsOfDetail).toHaveLength(1);
    const chain = manifest.levelsOfDetail![0]!;
    expect(chain.screenCoverage).toEqual([0.4, 0.1]);
    expect(chain.levels.map((level) => level.name)).toEqual(['Lamp_LOD0', 'Lamp_LOD1']);
    expect(manifest.budget!.tiers.map((tier) => tier.tier)).toEqual(['LOD0', 'LOD1']);
    expect(trimmed.delivery.lod).toEqual({
      maxLod: 1,
      chains: [{ path: chain.path, levels: 2, dropped: ['Lamp_LOD2'] }],
      budgetTiersOmitted: ['LOD2'],
    });
  });

  test('maxLod 0 removes the chain and every lower level', async () => {
    const trimmed = await plain({ maxLod: 0 });
    const document = await json(trimmed.glb);
    expect(document.extensionsUsed ?? []).not.toContain('MSFT_lod');
    const names = document.nodes!.map((node) => node.name);
    expect(names).not.toContain('Lamp_LOD1');
    expect(names).not.toContain('Lamp_LOD2');
    const lod0 = document.nodes!.find((node) => node.name === 'Lamp_LOD0')!;
    expect(lod0.extensions?.['MSFT_lod']).toBeUndefined();
    expect((lod0.extras as Record<string, unknown> | undefined)?.['MSFT_screencoverage']).toBe(
      undefined,
    );
    const manifest = (await inspectGlbIntegration(trimmed.glb))!;
    expect(manifest.levelsOfDetail ?? []).toEqual([]);
    expect(manifest.budget!.tiers.map((tier) => tier.tier)).toEqual(['LOD0']);
    expect(manifest.budget!.tiers[0]!.measured.triangles).toBe(
      (await inspectGlbIntegration(source))!.budget!.tiers[0]!.measured.triangles,
    );
    expect(trimmed.delivery.lod).toMatchObject({
      maxLod: 0,
      chains: [{ levels: 1, dropped: ['Lamp_LOD1', 'Lamp_LOD2'] }],
      budgetTiersOmitted: ['LOD1', 'LOD2'],
    });
  });

  test('a maxLod at or above every chain changes nothing but the record', async () => {
    const full = await plain();
    const kept = await plain({ maxLod: 2 });
    expect(sha(kept.glb)).toBe(sha(full.glb));
    expect(kept.delivery.lod).toMatchObject({ maxLod: 2, budgetTiersOmitted: [] });
    expect(kept.delivery.lod!.chains[0]).toMatchObject({ levels: 3, dropped: [] });
    expect(full.delivery.lod).toBeUndefined();
  });

  test('a dropped level that an animation targets is refused', async () => {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const accessor = (array: Float32Array<ArrayBuffer>, type: 'SCALAR' | 'VEC3') =>
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
    const mesh = doc
      .createMesh('Tri')
      .addPrimitive(
        doc
          .createPrimitive()
          .setAttribute(
            'POSITION',
            accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3'),
          ),
      );
    const lod0 = doc.createNode('Prop_LOD0').setMesh(mesh);
    const lod1 = doc.createNode('Prop_LOD1').setMesh(mesh);
    lod0.setExtension(MSFT_LOD, doc.createExtension(MSFTLod).createLod().addLevel(lod1));
    doc.createScene('Scene').addChild(lod0);
    const sampler = doc
      .createAnimationSampler()
      .setInput(accessor(new Float32Array([0, 1]), 'SCALAR'))
      .setOutput(accessor(new Float32Array([0, 0, 0, 0, 1, 0]), 'VEC3'));
    doc
      .createAnimation('Bob')
      .addSampler(sampler)
      .addChannel(
        doc
          .createAnimationChannel()
          .setTargetNode(lod1)
          .setTargetPath('translation')
          .setSampler(sampler),
      );
    const bytes = await createGltfIO().writeBinary(doc);
    await expect(deliverThreeRuntimeGlb(bytes, { maxLod: 0 })).rejects.toThrow(
      'which animation "Bob" targets',
    );
    expect((await deliverThreeRuntimeGlb(bytes, { maxLod: 1 })).delivery.lod!.chains).toEqual([
      { path: '/Scene[0]/Prop_LOD0[0]', levels: 2, dropped: [] },
    ]);
  });

  test('maxLod is a non-negative integer and needs the three target', async () => {
    for (const bad of [-1, 1.5, Number.NaN, '1'])
      await expect(plain({ maxLod: bad })).rejects.toThrow('maxLod');
    const record: AssetRecord = {
      manifest: {
        version: 'kiln.asset.v1',
        assetId: 'a_lod',
        revisionId: 'r_lod',
        name: 'Tiered Lamp',
        tags: [],
        createdAt: '2026-10-23T00:00:00.000Z',
        editable: false,
        files: {
          'asset.glb': { bytes: source.length, sha256: sha(source) as `sha256:${string}` },
        },
      },
      files: { 'asset.glb': source },
    };
    await expect(exportAssetGlb(record, { profile: 'runtime', maxLod: 0 })).rejects.toThrow(
      'requires the three runtime target',
    );
    const output = await exportAssetGlb(record, {
      profile: 'runtime',
      target: 'three',
      compression: 'none',
      maxLod: 0,
    });
    expect(output.profile).toBe('runtime');
  });
});
