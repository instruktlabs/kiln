import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PerspectiveCamera } from 'three/webgpu';
import { parseCampus } from '../../src/campus/data';
import { buildCampusVegetation } from '../../src/campus/exterior/vegetation';
import { campusPlantings } from '../../src/campus/exterior/planting';
import { campusModels } from '../../scripts/campus-assets';

// Both paths: the per-material one (plantingShared=false: every planting mesh an InstancedMesh) and the shared one (the
// default: one plain instanced mesh per type and level on one material). Same rows, so the same visible and triangle counts.
for(const shared of [false,true])test(`saved plants draw as shared instances with real near and far GLB levels (${shared?'shared material':'per material'})`, async () => {
  const data=parseCampus(readFileSync(new URL('../../data/campus.json',import.meta.url),'utf8'));
  const models=new Map();
  for(const model of campusModels().filter(m=>m.kind==='vegetation')){
    const bytes=readFileSync(model.from);
    models.set(model.id,await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'') );
  }
  const planting=await buildCampusVegetation(data,models,campusPlantings(data),{shared}); expect(planting).not.toBeNull();
  const camera=new PerspectiveCamera(50,1,.1,20000);camera.position.set(0,50,110);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  planting!.update(camera,1); const near=planting!.stats();
  expect(near.placed).toBeGreaterThan(500);expect(near.visible).toBeGreaterThan(10);expect(near.draws).toBeLessThanOrEqual(shared?24:81);
  expect(near.perLevel[0]).toBeGreaterThan(0);
  camera.position.set(0,2200,2800);camera.lookAt(0,0,0);camera.updateMatrixWorld();planting!.update(camera,1);
  const far=planting!.stats();expect(far.perLevel[0]).toBe(0);expect(far.perLevel[2]).toBeGreaterThan(100);
  expect(far.triangles).toBeLessThan(near.triangles+far.visible*80);
  expect(planting!.root.children.every(mesh=>!!(mesh as any).isInstancedMesh===!shared)).toBe(true);
  planting!.dispose(); expect(planting!.root.children.length).toBe(0);
});
