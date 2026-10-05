import {footprintQuaternion} from './crew-footsteps.mjs';
// Landing qualification on actual exported surfaces. This deliberately rejects
// a foot straddling an edge instead of treating one ankle ray as enough support.
export function createSupportedFootprints(T,{root,surfaces,maxY=3}){
 const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),soles={};
 for(const side of ['left','right']){const mesh=root.getObjectByName('Mesh_foot_'+side),ankle=root.getObjectByName('Joint_ankle_'+side),p=mesh.geometry.attributes.position,relative=ankle.matrixWorld.clone().invert().multiply(mesh.matrixWorld);soles[side]=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)+.085)<1e-6)soles[side].push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(relative));}
 function hit(x,z,y=maxY){ray.set(new T.Vector3(x,y,z),down);return ray.intersectObjects(surfaces,false).find(h=>h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.65);}
 function candidate(side,x,z,yaw){const h=hit(x,z);if(!h)return null;const normal=h.face.normal.clone().transformDirection(h.object.matrixWorld),position=h.point.clone().addScaledVector(normal,.085),f={side,position:position.toArray(),yaw,normal:normal.toArray()},q=footprintQuaternion(T,f);for(const local of soles[side]){const p=local.clone().applyQuaternion(q).add(position),contact=hit(p.x,p.z,p.y+.15);if(!contact||Math.abs(contact.point.y-p.y)>.0001)return null;}return f;}
 function find(side,x,z,yaw){const forward=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));for(const offset of [0,-.025,.025,-.05,.05,-.075,.075,-.1,.1,-.125,.125,-.15,.15]){const f=candidate(side,x+forward.x*offset,z+forward.z*offset,yaw);if(f)return f;}throw Error(`No supported ${side} footprint at ${x.toFixed(3)},${z.toFixed(3)} yaw ${yaw.toFixed(3)}`);}
 return {candidate,find,hit,soles};
}
