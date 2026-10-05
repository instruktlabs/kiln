import {groundHeight} from './layout.mjs';
export const DEFAULT_ENVIRONMENT='continuous';
// Finite geometry beyond the admitted orbit and fog envelope looks continuous.
// Dense contact ground and shoreline stay fixed in world coordinates.
export const COVERAGE=Object.freeze({extent:16384,joinZ:1850,targetLimit:6000,orbitDistance:1800,cameraFar:6000,fogFar:5600});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const peaks=[[-910,2200,210,390,270],[-430,2310,290,310,320],[130,2150,230,290,230],[590,2350,260,300,320],[1100,2190,230,430,280]];
export function continuousHeight(x,z){
 if(![x,z].every(Number.isFinite))throw Error('Terrain coordinates must be finite');
 const base=groundHeight(x,z);if(z<=COVERAGE.joinZ)return base;
 let mountains=0;
 for(const [cx,cz,height,sx,sz] of peaks){const r=Math.hypot((x-cx)/sx,(z-cz)/sz);mountains+=height*Math.max(0,1-r*.6)*(1+.035*Math.sin(x*.006+z*.005));}
 // Broad surrounding ridges extend the setting, rather than ending at peak bases.
 const outer=80+70*(.5+.5*Math.sin(x*.0017+Math.sin(z*.0011)*1.3))+110*(.5+.5*Math.cos(z*.0023+x*.0007));
 return base+mountains*smooth(COVERAGE.joinZ,2070,z)+outer*smooth(2450,3200,z);
}
const outerX=[1280,1536,1792,2048,2560,3072,4096,6144,8192,12288,16384];
const xs=[...outerX.toReversed().map(x=>-x),...Array.from({length:193},(_,i)=>-1200+i*12.5),...outerX];
function grid(x,z,height){
 const positions=new Float32Array(x.length*z.length*3),indices=new Uint32Array((x.length-1)*(z.length-1)*6);
 for(let j=0;j<z.length;j++)for(let i=0;i<x.length;i++){const p=(j*x.length+i)*3;positions[p]=x[i];positions[p+1]=height(x[i],z[j]);positions[p+2]=z[j];}
 for(let j=0;j<z.length-1;j++)for(let i=0;i<x.length-1;i++){const a=j*x.length+i,b=a+1,c=a+x.length,d=c+1,p=(j*(x.length-1)+i)*6;indices.set([a,c,b,b,c,d],p);}
 return {positions,indices,xs:x.slice(),zs:z.slice()};
}
export function createTerrainCoverage(){
 const sandZ=[-16384,-8192,-4096,-2048,-1024,...Array.from({length:193},(_,i)=>-550+i*12.5)];
 const rockZ=[...Array.from({length:33},(_,i)=>1850+i*25),2900,3200,3600,4100,4700,5500,6500,8000,10000,13000,16384];
 return {sand:grid(xs,sandZ,continuousHeight),rock:grid(xs,rockZ,continuousHeight)};
}
export function limitOrbitEnvelope(position,target){
 for(const [key,min,max] of [['x',-COVERAGE.targetLimit,COVERAGE.targetLimit],['z',-COVERAGE.targetLimit,COVERAGE.targetLimit],['y',-16,600]]){
  const value=Math.max(min,Math.min(max,target[key]));position[key]+=value-target[key];target[key]=value;
 }
}
