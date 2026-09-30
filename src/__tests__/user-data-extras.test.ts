/**
 * Author `userData` travels as glTF `extras` (R48).
 *
 * Plain JSON on a node or a material exports as that node's or material's extras under
 * both exporters and comes back as `userData` through Kiln's review loader and three's
 * GLTFLoader. `kiln*` keys stay the engine's. A value that is not plain JSON, or an
 * object whose data is over the size limit, is left out with a named build warning, and
 * `kiln_validate` reports the literal cases before a build.
 */
import { describe, expect, test } from 'bun:test';
import type { Material as GltfMaterial, Node as GltfNode } from '@gltf-transform/core';
import type { Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGltfIO } from '../gltf-io';
import { renderGLBInProcess } from '../render';
import { MAX_USER_DATA_BYTES_PER_OBJECT, MAX_USER_DATA_BYTES_TOTAL } from '../user-data-extras';
import { validate } from '../validation';
import { loadGlbReviewScene } from '../views/glb';

const BIG = 'x'.repeat(5000);
const SOURCE = `const meta={name:'Extras'};
function build(){
  const root=createRoot('Root');
  root.userData.assetTag='movers';
  const painted=gameMaterial('#888888');
  painted.userData.finish='brushed';
  painted.userData.kilnSecret=1;
  const door=createPart('Door',boxGeo(1,2,0.1),painted,{parent:root});
  door.userData.hideable=true;
  door.userData.tags=['door','swing'];
  door.userData.hinge={axis:[0,1,0],limitDeg:95,note:null};
  door.userData.kilnInternal='engine only';
  door.userData.onOpen=function(){return 1;};
  door.userData.cleared=undefined;
  const plain=createPart('Plain',boxGeo(1,1,1),gameMaterial('#888888'),{parent:root,position:[2,0,0]});
  const big=createPart('Big',boxGeo(1,1,1),gameMaterial('#ff0000'),{parent:root,position:[4,0,0]});
  big.userData.blob='${BIG}';
  return root;
}`;

async function exported(gltfExporter: 'legacy' | 'three') {
  const result = await renderGLBInProcess(SOURCE, { gltfExporter });
  const doc = await createGltfIO().readBinary(result.glb);
  const node = (name: string) =>
    doc
      .getRoot()
      .listNodes()
      .find((n: GltfNode) => n.getName() === name)!;
  return { result, doc, node };
}

describe('userData as glTF extras', () => {
  test('the limits are the documented ones', () => {
    expect(MAX_USER_DATA_BYTES_PER_OBJECT).toBe(4096);
    expect(MAX_USER_DATA_BYTES_TOTAL).toBe(65536);
  });

  for (const exporter of ['legacy', 'three'] as const) {
    test(`plain JSON on nodes and materials exports as extras (${exporter})`, async () => {
      const { result, doc, node } = await exported(exporter);
      expect(node('Mesh_Door').getExtras()).toEqual({
        hideable: true,
        tags: ['door', 'swing'],
        hinge: { axis: [0, 1, 0], limitDeg: 95, note: null },
      });
      expect(node('Root').getExtras()).toEqual({ assetTag: 'movers' });
      expect(node('Mesh_Plain').getExtras()).toEqual({});
      expect(node('Mesh_Big').getExtras()).toEqual({});
      const materials = doc.getRoot().listMaterials();
      const brushed = materials.filter((m: GltfMaterial) => m.getExtras().finish === 'brushed');
      expect(brushed).toHaveLength(1);
      expect(brushed[0]!.getExtras()).toEqual({ finish: 'brushed' });
      // The same colour without data stays a separate material from the one with data.
      expect(node('Mesh_Plain').getMesh()!.listPrimitives()[0]!.getMaterial()).not.toBe(brushed[0]);
      const warnings = result.warnings.join('\n');
      expect(warnings).toContain('USER_DATA_NOT_SERIALIZABLE');
      expect(warnings).toContain('Mesh_Door userData.onOpen (a function)');
      expect(warnings).toContain('USER_DATA_TOO_LARGE');
      expect(warnings).toMatch(/Mesh_Big userData \(5\d{3} bytes\)/);
      expect(warnings).not.toContain('kilnInternal');
      expect(warnings).not.toContain('cleared');
    });
  }

  test('the review loader and GLTFLoader bring extras back as userData', async () => {
    const { result } = await exported('legacy');
    const review = await loadGlbReviewScene(result.glb);
    const find = (root: Object3D, name: string) => root.getObjectByName(name)!;
    expect(find(review.root, 'Mesh_Door').userData).toMatchObject({ hideable: true });
    const reviewMesh = find(review.root, 'Mesh_Door:primitive-0') as Mesh;
    expect((reviewMesh.material as { userData: object }).userData).toEqual({ finish: 'brushed' });

    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(result.glb).buffer, '');
    const door = find(gltf.scene, 'Mesh_Door') as Mesh;
    // GLTFLoader adds the node's original name as userData.name.
    expect(door.userData).toMatchObject({
      hideable: true,
      tags: ['door', 'swing'],
      hinge: { axis: [0, 1, 0], limitDeg: 95, note: null },
    });
    expect((door.material as { userData: object }).userData).toEqual({ finish: 'brushed' });
  });

  test('the asset total is bounded in scene order', async () => {
    const chunk = 'y'.repeat(4000);
    const source = `const meta={name:'Many'};function build(){const root=createRoot('Root');
for(let i=0;i<20;i++){const p=createPart('P'+i,boxGeo(.1,.1,.1),gameMaterial('#888888'),{parent:root,position:[i,0,0]});p.userData.note='${chunk}';}
return root;}`;
    const result = await renderGLBInProcess(source);
    const doc = await createGltfIO().readBinary(result.glb);
    const carried = doc
      .getRoot()
      .listNodes()
      .filter((n: GltfNode) => typeof n.getExtras().note === 'string')
      .map((n: GltfNode) => n.getName());
    // Each object carries 4,011 bytes of JSON; sixteen fit in 65,536.
    expect(carried).toEqual(Array.from({ length: 16 }, (_, i) => `Mesh_P${i}`));
    expect(result.warnings.join('\n')).toContain(
      'USER_DATA_TOTAL_LIMIT (4 objects over 65536 bytes: Mesh_P16, Mesh_P17, Mesh_P18, Mesh_P19)',
    );
  });

  test('kiln_validate reports reserved keys, non-JSON values and oversized literals', () => {
    const result = validate(SOURCE);
    expect(result.valid).toBe(true);
    const found = result.warnings.filter((w) => w.code.startsWith('USER_DATA_'));
    expect(found.map((w) => [w.code, w.line])).toEqual([
      ['USER_DATA_RESERVED_KEY', 7],
      ['USER_DATA_RESERVED_KEY', 12],
      ['USER_DATA_NOT_SERIALIZABLE', 13],
      ['USER_DATA_TOO_LARGE', 17],
    ]);
    const whole = validate(
      `const meta={name:'a'};function build(){const r=createRoot('R');r.userData={kilnX:1,ok:true,f:()=>1};Object.assign(r.userData,{when:new Date()});return r;}`,
    );
    expect(
      whole.warnings.filter((w) => w.code.startsWith('USER_DATA_')).map((w) => w.code),
    ).toEqual([
      'USER_DATA_RESERVED_KEY',
      'USER_DATA_NOT_SERIALIZABLE',
      'USER_DATA_NOT_SERIALIZABLE',
    ]);
  });
});
