// Read-only topology/registration measurements on the preserved structure GLB.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { meshTriangles, parseGlb, sceneTree, transformPoint, worldMatrices } from '../../scripts/glb';
import { PACKAGE_ROOT, writeJson } from './owned';
const file=parseGlb(readFileSync(resolve(PACKAGE_ROOT,'staged/ff3/models/structures/s1-head-W.glb'))),tree=sceneTree(file),world=worldMatrices(tree);
const add=(a:number[],b:number[])=>a.map((v,i)=>v+b[i]!);
const sub=(a:number[],b:number[])=>a.map((v,i)=>v-b[i]!);
const dot=(a:number[],b:number[])=>a.reduce((v,x,i)=>v+x*b[i]!,0);
const cross=(a:number[],b:number[])=>[a[1]!*b[2]!-a[2]!*b[1]!,a[2]!*b[0]!-a[0]!*b[2]!,a[0]!*b[1]!-a[1]!*b[0]!];
const meshes=tree.nodes.filter(n=>n.mesh!==null).map(n=>({name:n.name,triangles:[...meshTriangles(file,n.mesh!)].flatMap(g=>Array.from({length:g.count},(_,i)=>[0,1,2].map(k=>transformPoint(world[n.index]!,g.positions[(i*3+k)*3]!,g.positions[(i*3+k)*3+1]!,g.positions[(i*3+k)*3+2]!))))}));
function crossings(from:number[],to:number[]){const dir=sub(to,from),hits:any[]=[];for(const mesh of meshes)for(const [a,b,c]of mesh.triangles){const e1=sub(b!,a!),e2=sub(c!,a!),p=cross(dir,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)continue;const q0=sub(from,a!),u=dot(q0,p)/det;if(u< -1e-7||u>1+1e-7)continue;const q=cross(q0,e1),v=dot(dir,q)/det;if(v< -1e-7||u+v>1+1e-7)continue;const t=dot(e2,q)/det;if(t>=0&&t<=1)hits.push({part:mesh.name,t,at:add(from,dir.map(v=>v*t))});}return hits.sort((a,b)=>a.t-b.t).filter((h,i,a)=>i===0||h.part!==a[i-1].part||Math.abs(h.t-a[i-1].t)>1e-6);}
const paths=[
 {name:'entrance-centre-at-eye',from:[-955,1.6,170],to:[-920,1.6,170]},
 {name:'entrance-centre-low',from:[-955,.8,170],to:[-920,.8,170]},
 {name:'entrance-centre-tall',from:[-955,2.8,170],to:[-920,2.8,170]},
 {name:'entrance-to-atrium',from:[-920,1.6,170],to:[-870,1.6,115]},
 {name:'level1-from-twin-to-road-facing-window',from:[-760,9.6,115],to:[-760,9.6,220]},
 {name:'level1-eye-upward',from:[-760,9.6,115],to:[-760,75,115]},
];
const report={schema:1,model:'s1-head-W',triangles:meshes.reduce((n,m)=>n+m.triangles.length,0),materials:file.json.materials,
 paths:paths.map(p=>({...p,hits:crossings(p.from,p.to)})),parts:meshes.map(m=>({name:m.name,triangles:m.triangles.length})),note:'All probe coordinates are in the original SW head model frame. Segment/triangle intersections are two-sided; these are topology checks, not a walkable route qualification.'};
writeJson(resolve(PACKAGE_ROOT,'evidence/revision2/diagnosis/embedding-topology.json'),report);console.log(JSON.stringify({triangles:report.triangles,paths:report.paths,glazing:report.materials?.filter(m=>m.name?.includes('glazing'))},null,2));
