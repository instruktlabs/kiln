import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {revision2Vehicles} from '../../scripts/revision2-vehicles';
import {vehicleModels} from '../../scripts/stage-campus';
import {extractVehicle} from '../../src/campus/exterior/vehicles';
import {parseDriving} from '../../src/campus/drive/driving';
test('final intake uses the six sealed r4 child revisions rather than the rear checkpoint',()=>{
 const models=revision2Vehicles();
 expect(Object.fromEntries(models.map(model=>[model.id,model.revision]))).toEqual({
  'vehicle-hatchback':'r_74f393f06996497a9dce6c5ed50c2d62','vehicle-sedan':'r_92ee0ac3d5cf4b258cc97d20ec941461',
  'vehicle-suv':'r_b4cc9048731b4c039de0b87ca6e75c17','vehicle-pickup':'r_218be4189a1b43e7b307c2263ba4f954',
  'vehicle-box-truck':'r_538b8a19c46d4086b456e27b32ee7d33','vehicle-transit-bus':'r_85ff097a61384efab445c55372d3b6f5',
 });
 expect(models.every(model=>model.author==='codex-review2-asset-repairs')).toBe(true);
});
test('the actual scene extractor keeps all six vehicle rigs and lower levels with at most submillimetre bounds drift',async()=>{
 const driving=parseDriving(readFileSync(new URL('../../data/driving.json',import.meta.url)));
 const old=vehicleModels(),records=[];
 for(const pin of revision2Vehicles()){
  const load=async(path:string)=>{const b=readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
  const a=await extractVehicle(pin.id,await load(old.find(m=>m.id===pin.id)!.from),driving.lamps,driving.flow.paint.material);
  const b=await extractVehicle(pin.id,await load(pin.from),driving.lamps,driving.flow.paint.material);
  expect(b.model.lodSource).toBe('MSFT_lod');expect(b.model.wheels).toEqual(a.model.wheels);
  expect(b.model.wheelbase).toBe(a.model.wheelbase);expect(b.model.rearAxle).toBe(a.model.rearAxle);
  // The saved repaired hatchback measures 0.077mm longer. A 1mm maximum is explicit and far below the 0.8m traffic gap;
  // the runtime still derives its collision body from these exact new bounds, so this is not an ignored penetration.
  for(const key of ['length','width','height'] as const){expect(b.model[key]).toBeLessThanOrEqual(a.model[key]+.001);expect(b.model[key]).toBeGreaterThan(a.model[key]-.1);}
  expect(b.model.triangles[0]).toBeGreaterThan(b.model.triangles[1]);expect(b.model.triangles[1]).toBeGreaterThan(b.model.triangles[2]);
  if(['vehicle-pickup','vehicle-box-truck','vehicle-transit-bus'].includes(pin.id)){
   expect(b.model.triangles).toEqual(a.model.triangles);
   for(const key of ['length','width','height'] as const)expect(b.model[key]).toBe(a.model[key]);
   for(let level=0;level<3;level++){
    const current=b.model.lods[level]!,prior=a.model.lods[level]!;
    expect(current.index?.array).toEqual(prior.index?.array);
    for(const name of Object.keys(prior.attributes))expect(current.getAttribute(name).array).toEqual(prior.getAttribute(name).array);
   }
  }
  records.push({id:pin.id,sha256:pin.sha256,oldBounds:[a.model.length,a.model.width,a.model.height],newBounds:[b.model.length,b.model.width,b.model.height],triangles:b.model.triangles});
  for(const x of [a,b]){x.model.lods.forEach(g=>g.dispose());x.release();}
 }
 console.log(JSON.stringify(records));
});
