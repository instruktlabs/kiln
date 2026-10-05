import {COMBAT} from './hero-combat.mjs';

// Collision runs on the same two consumer rigs that are displayed. The blade
// excludes the hilt; hurt regions are the authored torso and head/helmet meshes.
// A 3 cm hurt skin avoids driving metal through the visible body. Guard skin is
// 0.5 mm is the declared guard skin around the actual authored shield triangles.
export const HERO_CONTACT=Object.freeze({bodySkin:.03,guardSkin:.0005,bladeStart:.12});
export function createMeshContacts(T){
 const cache=new WeakMap(),triangle=new T.Triangle(),point=new T.Vector3(),ray=new T.Ray(),intersection=new T.Vector3();
 function topology(mesh,blade){
  let entries=cache.get(mesh.geometry);if(!entries){entries=new Map();cache.set(mesh.geometry,entries);}if(entries.has(blade))return entries.get(blade);
  const pos=mesh.geometry.attributes.position,index=mesh.geometry.index,points=Array.from({length:pos.count},(_,i)=>new T.Vector3().fromBufferAttribute(pos,i)),triangles=[];
  for(let k=0;k<(index?index.count:pos.count);k+=3){const ids=[0,1,2].map(j=>index?index.getX(k+j):k+j);if(!blade||ids.every(i=>points[i].y>=HERO_CONTACT.bladeStart-1e-6))triangles.push(ids);}
  if(!triangles.length)throw Error('Missing contact triangles: '+mesh.name);const result={points,triangles};entries.set(blade,result);return result;
 }
 function snapshot(mesh,blade=false){
  const local=topology(mesh,blade),matrix=mesh.matrixWorld.clone(),points=local.points.map(p=>p.clone().applyMatrix4(matrix)),bounds=new T.Box3();
  for(const ids of local.triangles)for(const i of ids)bounds.expandByPoint(points[i]);return {name:mesh.name,matrix,points,triangles:local.triangles,bounds};
 }
 function segments(a,b,c,d){
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c),A=u.dot(u),B=u.dot(v),C=v.dot(v),D=u.dot(w),E=v.dot(w),den=A*C-B*B;
  if(A<1e-20)return new T.Line3(c,d).closestPointToPoint(a,true,point).distanceTo(a);if(C<1e-20)return new T.Line3(a,b).closestPointToPoint(c,true,point).distanceTo(c);
  let s=den>1e-20?Math.max(0,Math.min(1,(B*E-C*D)/den)):0,t=(B*s+E)/C;
  if(t<0){t=0;s=Math.max(0,Math.min(1,-D/A));}else if(t>1){t=1;s=Math.max(0,Math.min(1,(B-D)/A));}
  return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
 }
 function edgeFace(a,b,face){
  const length=a.distanceTo(b);if(length>1e-12){ray.set(a,b.clone().sub(a).multiplyScalar(1/length));if(ray.intersectTriangle(...face,false,intersection)&&a.distanceTo(intersection)<=length+1e-10)return 0;}
  triangle.set(...face);let gap=Math.min(triangle.closestPointToPoint(a,point).distanceTo(a),triangle.closestPointToPoint(b,point).distanceTo(b));
  for(let j=0;j<3;j++)gap=Math.min(gap,segments(a,b,face[j],face[(j+1)%3]));return gap;
 }
 function gap(a,b){let result=Infinity;for(let j=0;j<3;j++)result=Math.min(result,edgeFace(a[j],a[(j+1)%3],b),edgeFace(b[j],b[(j+1)%3],a));return result;}
 function contact(a,b,oldA=null,oldB=null,skin=0,sweepStart=0){
  const faces=a.triangles.map(ids=>ids.map(i=>a.points[i])),swept=[];let bound=a.bounds.clone();
  if(oldA&&oldB){
   // Express the previous blade in the current target frame. Each target mesh
   // is rigid. Between 120 Hz samples vertices travel on straight segments;
   // this is a bounded linear sweep, not exact rotational collision physics.
   const relative=b.matrix.clone().multiply(oldB.matrix.clone().invert()),before=oldA.points.map((p,i)=>p.clone().applyMatrix4(relative).lerp(a.points[i],sweepStart));
   for(const ids of a.triangles)for(let j=0;j<3;j++){const i=ids[j],k=ids[(j+1)%3];swept.push([before[i],before[k],a.points[k]],[before[i],a.points[k],a.points[i]]);bound.expandByPoint(before[i]);}
  }
  if(!bound.expandByScalar(skin).intersectsBox(b.bounds))return null;
  const targets=b.triangles.map(ids=>ids.map(i=>b.points[i])),targetBounds=targets.map(f=>new T.Box3().setFromPoints(f));
  for(const [list,method]of [[faces,'posed-triangles'],[swept,'linear-vertex-sweep']])for(const face of list){const box=new T.Box3().setFromPoints(face).expandByScalar(skin);for(let i=0;i<targets.length;i++){if(!box.intersectsBox(targetBounds[i]))continue;const distance=gap(face,targets[i]);if(distance<=skin+1e-10)return {method,gap:distance,skin,weapon:a.name,hurtMesh:b.name,weaponMatrix:a.matrix.toArray(),hurtMatrix:b.matrix.toArray(),previousWeaponMatrix:oldA?.matrix.toArray()??null,previousHurtMatrix:oldB?.matrix.toArray()??null,sweepStart};}}
  return null;
 }
 return {snapshot,contact};
}

export function createHeroWeaponContacts(T,{pair,rig}){
 const detector=createMeshContacts(T),hurtNames=['Mesh_cuirass','Mesh_head','Mesh_helmet'],hurt=new Map(pair.actors.map(a=>[a.id,hurtNames.map(n=>a.get(n))]));let previous=new Map(),latest=[],previousTime=0;
 function sample(state){
  rig.render(state);const snapshots=new Map(pair.actors.map(a=>[a.id,{blade:detector.snapshot(a.get('sword'),true),shield:detector.snapshot(a.get('shield')),body:hurt.get(a.id).map(m=>detector.snapshot(m))}])),contacts=[];
  for(const f of state.actors){const spec=COMBAT.attacks[f.action?.kind],age=f.action?state.time-f.action.start:0;if(!spec||f.action.resolved||age+1e-12<spec.wind||age>spec.wind+spec.active+1e-12)continue;
   const enemy=state.actors.find(e=>e.id!==f.id),a=snapshots.get(f.id),b=snapshots.get(enemy.id),oldA=previous.get(f.id),oldB=previous.get(enemy.id),sweepStart=state.time>previousTime?Math.max(0,Math.min(1,(f.action.start+spec.wind-previousTime)/(state.time-previousTime))):1;let proof=null,type='body';
   if(enemy.blocking){proof=detector.contact(a.blade,b.shield,oldA?.blade,oldB?.shield,HERO_CONTACT.guardSkin,sweepStart);if(proof)type='guard';}
   if(!proof)for(let i=0;i<b.body.length;i++){proof=detector.contact(a.blade,b.body[i],oldA?.blade,oldB?.body[i],HERO_CONTACT.bodySkin,sweepStart);if(proof)break;}
   if(proof)contacts.push({actor:f.id,target:enemy.id,type,proof:{...proof,time:state.time,step:COMBAT.step}});
  }
  previous=snapshots;previousTime=state.time;latest=contacts;return contacts;
 }
 return {sample,reset(state){previous.clear();rig.reset();sample(state);},stats:()=>({contacts:structuredClone(latest),hurtNames,bodySkin:HERO_CONTACT.bodySkin,guardSkin:HERO_CONTACT.guardSkin,scope:'Actual posed blade/hurt triangles with relative linear vertex sweep at 120 Hz; torso/head hurt regions only'})};
}
