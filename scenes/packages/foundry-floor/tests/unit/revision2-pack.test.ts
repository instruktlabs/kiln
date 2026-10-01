import { expect,test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stageFf3 } from '../../scripts/stage-ff3';
import { revision2Vehicles } from '../../scripts/revision2-vehicles';
import { PACKAGE_ROOT } from '../../scripts/stage';
test('revision2 pack seals the six explicit vehicle children and preserves all other model pins',()=>{
 const stage=stageFf3({out:resolve(PACKAGE_ROOT,'staged/revision2'),generated:resolve(PACKAGE_ROOT,'staged/generated-revision2'),force:true,release:'ff3-review2',revision2:true});
 const pack=JSON.parse(readFileSync(resolve(stage.out,'pack.json'),'utf8'));
 expect(stage.verification.ok).toBe(true);expect(pack.models).toHaveLength(62);
 const old=JSON.parse(readFileSync(resolve(PACKAGE_ROOT,'staged/ff3/pack.json'),'utf8'));
 const permitted=new Set(['sedan','hatchback','suv','pickup','box-truck','transit-bus'].map(type=>`models/vehicles/${type}.glb`));
 for(const model of old.models){const prior=old.files.find((f:any)=>f.path===model.path),now=pack.files.find((f:any)=>f.path===model.path);if(!permitted.has(model.path))expect(now).toEqual(prior);}
 for(const vehicle of revision2Vehicles())expect(pack.files.find((f:any)=>f.path===vehicle.to)).toMatchObject({bytes:vehicle.bytes,sha256:vehicle.sha256});
 for(const type of ['sedan','hatchback','suv','pickup','box-truck','transit-bus'])expect(pack.source.models[`vehicle-${type}`]).toMatchObject({requestedModel:'gpt-6-astra',recordedModel:'gpt-6-astra',requestedEffort:'ultra',confirmedEffort:null});
});
