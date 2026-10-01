// Deterministic application of the actual vegetation selector to the measured sedan camera path.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Box3, PerspectiveCamera, Vector3 } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildCampusVegetation } from '../../src/campus/exterior/vegetation';
import { parseCampusPlantings } from '../../src/campus/exterior/planting';
import { parseCampus } from '../../src/campus/data';
import { campusModels } from '../../scripts/campus-assets';
import { PACKAGE_ROOT, writeJson } from './owned';
const campus=parseCampus(readFileSync(resolve(PACKAGE_ROOT,'data/campus.json'),'utf8'));
const placements=parseCampusPlantings(readFileSync(resolve(PACKAGE_ROOT,'staged/ff3/data/campus-assets.json')),campus);
const models=new Map(),heights=new Map<string,number>();
for(const m of campusModels().filter(m=>m.kind==='vegetation')){const bytes=readFileSync(m.from),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');models.set(m.id,gltf);heights.set(m.id.slice(6),new Box3().setFromObject(gltf.scene).getSize(new Vector3()).y);}
const plants=await buildCampusVegetation(campus,models,placements);if(!plants)throw new Error('Missing plants');
const camera=new PerspectiveCamera(60,1280/720,.3,40000),seen=new Map<string,number>(),events:any[]=[];
for(let eye=-3900;eye<=-3100;eye+=.5){camera.position.set(eye,3.1,7.25);camera.lookAt(eye+13.5,1.35,7.25);camera.updateMatrixWorld();plants.update(camera,1);
  const levels=new Map<string,{level:number,model:string,x:number,z:number}>();
  for(const m of plants.root.children as any[]){const match=/^(.+)-lod([0-2])-/.exec(m.name);if(!match||!m.visible)continue;for(let i=0;i<m.count;i++){const a=m.instanceMatrix.array,x=a[i*16+12],z=a[i*16+14];levels.set(`${match[1]}:${x}:${z}`,{model:match[1]!,level:Number(match[2]),x,z});}}
  for(const [id,row]of levels){const previous=seen.get(id);if(previous!==undefined&&previous!==row.level){const low=new Vector3(row.x,0,row.z).project(camera),high=new Vector3(row.x,heights.get(row.model)!,row.z).project(camera);events.push({eye,id,from:previous,to:row.level,projectedHeightPx:Math.abs(high.y-low.y)*360,centreX:(high.x+1)*640,forwardDistance:row.x-eye});}seen.set(id,row.level);}
}
plants.dispose();const result={camera:{fov:60,aspect:1280/720,height:3.1,lateral:7.25},path:[-3900,-3100],stepM:.5,events,note:'CPU actual selector trace at the sedan chase height/FOV. Shared-machine timings are not evidence. Pixel heights are geometric projection, not screenshot measurements.'};
const label=process.argv.includes('--after')?'after':'before';writeJson(resolve(PACKAGE_ROOT,`evidence/revision2/diagnosis/lod-path-${label}.json`),result);console.log(JSON.stringify({label,changes:events.length,first:events.slice(0,12)},null,2));
