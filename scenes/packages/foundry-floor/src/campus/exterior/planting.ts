// SPDX-License-Identifier: MIT
// Deterministic scene placements. Authored plant geometry and scale stay in the saved GLBs.
import type { CampusData } from '../data';

export const PLANT_SIZES = {
  'tree-broad-l': [8,20], 'tree-broad-m': [6,15], 'tree-broad-s': [4,10],
  'tree-conifer-l': [3.5,18], 'tree-conifer-m': [2.25,11], 'tree-ornamental': [2.5,6],
  'shrub-mound': [.8,.8], 'hedge-4m': [2.05,1],
} as const;
export type PlantType = keyof typeof PLANT_SIZES;
export interface PlantPlacement { model: PlantType; x: number; z: number; yaw: number; zone: 'avenue'|'windbreak'|'parking'|'island'|'arrival' }

/** Placements belong to the delivered scene data, so scene rebuilds cannot silently rearrange a reviewed pack. */
export function parseCampusPlantings(input: string | Uint8Array | ArrayBuffer, campus: CampusData): PlantPlacement[] {
  const value=JSON.parse(typeof input==='string'?input:new TextDecoder().decode(input)) as {
    schema?:string;models?:Record<string,{kind?:string;path?:string}>;vegetation?:{placements?:unknown};
  };
  if(value.schema!=='foundry-floor.campus-assets/1')throw new Error('Unsupported campus assets schema');
  for(const model of Object.keys(PLANT_SIZES)){
    const entry=value.models?.[`plant-${model}`];
    if(entry?.kind!=='vegetation'||entry.path!==`models/vegetation/${model}.glb`)throw new Error(`Missing or invalid campus model ${model}`);
  }
  const rows=value.vegetation?.placements;
  if(!Array.isArray(rows)||rows.length===0||rows.length>5000)throw new Error('Invalid campus vegetation placements');
  const seen=new Set<string>();
  return rows.map((row:PlantPlacement,index)=>{
    if(!row||!Object.hasOwn(PLANT_SIZES,row.model)||![row.x,row.z,row.yaw].every(Number.isFinite)||
      !['avenue','windbreak','parking','island','arrival'].includes(row.zone))throw new Error(`Invalid campus placement ${index}`);
    if(!clearPlantSpot(campus,row.model,row.x,row.z))throw new Error(`Campus placement ${index} fails clearance`);
    const key=`${row.x},${row.z}`;if(seen.has(key))throw new Error(`Duplicate campus placement ${index}`);seen.add(key);
    return {model:row.model,x:row.x,z:row.z,yaw:row.yaw,zone:row.zone};
  });
}

const segmentDistance = (x:number,z:number,ax:number,az:number,bx:number,bz:number) => {
  const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-ax-t*dx,z-az-t*dz);
};
function parkingPoint(curve: CampusData['parking']['loops'][number]['curve'], t:number): [number,number] {
  const u=1-t;return [u*u*curve[0][0]+2*u*t*curve[1][0]+t*t*curve[2][0],u*u*curve[0][1]+2*u*t*curve[1][1]+t*t*curve[2][1]];
}
const parkingCache = new WeakMap<CampusData, {a:[number,number];b:[number,number];half:number}[]>();
function parkingBands(data:CampusData) {
  let bands=parkingCache.get(data);if(bands)return bands;
  bands=[];
  for(const loop of data.parking.loops)for(let k=0;k<32;k++)bands.push({a:parkingPoint(loop.curve,loop.t[0]+(loop.t[1]-loop.t[0])*k/32),b:parkingPoint(loop.curve,loop.t[0]+(loop.t[1]-loop.t[0])*(k+1)/32),half:loop.aisle/2+loop.depth});
  parkingCache.set(data,bands);return bands;
}
/** Conservative whole-crown clearance, including traffic, parking and structures at the plant's height. */
export function clearPlantSpot(data:CampusData,model:PlantType,x:number,z:number):boolean {
  const [radius,height]=PLANT_SIZES[model],r=radius+1,roads=data.roads,radial=Math.hypot(x,z);
  const inIsland=radial+r<roads.roundabout.island-1;
  if(!inIsland) {
    if(radial<roads.roundabout.radius+r+2)return false;
    if(x>=roads.split.u[0]-r&&x<=roads.split.u[1]+r&&Math.abs(z)<roads.split.halfWidth+r)return false;
    if(Math.abs(x)<roads.cross.halfWidth+r&&Math.abs(z)<roads.cross.v+r)return false;
  }
  for(const bay of roads.dropOff)if(x+r>=bay.u[0]&&x-r<=bay.u[1]&&z+r>=bay.v[0]&&z-r<=bay.v[1])return false;
  for(const solid of data.solids)if(solid.min[1]<height+.5&&solid.max[1]>0&&x+r>=solid.min[0]&&x-r<=solid.max[0]&&z+r>=solid.min[2]&&z-r<=solid.max[2])return false;
  for(const [u,v] of data.satellites.centres)if(Math.abs(x-u)<data.satellites.size[0]/2+r&&Math.abs(z-v)<data.satellites.size[1]/2+r)return false;
  for(const band of parkingBands(data))if(segmentDistance(x,z,...band.a,...band.b)<band.half+r+1)return false;
  for(const pole of data.lights.poles)if(Math.hypot(x-pole.at[0],z-pole.at[1])<r+1)return false;
  return true;
}

export function campusPlantings(data:CampusData):PlantPlacement[] {
  const out:PlantPlacement[]=[];
  const add=(model:PlantType,x:number,z:number,zone:PlantPlacement['zone'],yaw=out.length*2.399963229728653)=>{
    if(clearPlantSpot(data,model,x,z))out.push({model,x,z,yaw,zone});
  };
  for(let x=-3870,k=0;x<=3870;x+=45,k++)for(const sign of [-1,1])add(k%3===0?'tree-broad-l':'tree-broad-m',x,sign*63,'avenue');
  for(const sx of [-1,1])for(const sz of [-1,1])for(let x=700,k=0;x<=2940;x+=26,k++)add(k%3===0?'tree-conifer-m':'tree-conifer-l',sx*x,sz*802,'windbreak');
  for(const loop of data.parking.loops)for(let k=1;k<9;k++){
    const t=loop.t[0]+(loop.t[1]-loop.t[0])*k/9,p=parkingPoint(loop.curve,t),q=parkingPoint(loop.curve,Math.min(1,t+.001));
    const dx=q[0]-p[0],dz=q[1]-p[1],l=Math.hypot(dx,dz);
    for(const side of [-1,1])add(k%2?'tree-broad-s':'tree-ornamental',p[0]-side*dz/l*23,p[1]+side*dx/l*23,'parking');
  }
  const ring=(model:PlantType,r:number,n:number,zone:PlantPlacement['zone'])=>{for(let i=0;i<n;i++){const a=i*Math.PI*2/n;add(model,Math.cos(a)*r,Math.sin(a)*r,zone,-a-Math.PI/2);}};
  add('tree-broad-l',0,0,'island');ring('tree-conifer-m',15,8,'island');ring('tree-ornamental',24,14,'island');ring('shrub-mound',34,70,'island');
  for(const plaza of data.roads.plazas){
    const z=(plaza.v[0]+plaza.v[1])/2;
    for(let x=plaza.u[0]+12,k=0;x<plaza.u[1]-8;x+=18,k++){
      add('tree-ornamental',x,z,'arrival');add('shrub-mound',x,z+12,'arrival');add('shrub-mound',x,z-12,'arrival');
    }
    // A low, tiled border on the plaza's outer edge; leave the entrance and drop-off clear.
    const edge=Math.abs(plaza.v[0])>Math.abs(plaza.v[1])?plaza.v[0]+5:plaza.v[1]-5;
    for(let x=plaza.u[0]+8;x<plaza.u[1]-8;x+=4)add('hedge-4m',x,edge,'arrival',0);
  }
  return out;
}
