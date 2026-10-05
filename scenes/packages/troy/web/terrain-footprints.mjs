import {footprintQuaternion} from './runtime/crew-v2/crew-footsteps.mjs';
// Landing qualification on actual exported surfaces. This deliberately rejects
// a foot straddling an edge instead of treating one ankle ray as enough support.
export function createTerrainFootprints(T,{root,heightfield,tolerance=.0001}){
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>.002)throw Error('Invalid terrain contact tolerance');const soles={};let rejected=null,maxAcceptedSoleError=0,acceptedFootprints=0;
 for(const side of ['left','right']){const mesh=root.getObjectByName('Mesh_foot_'+side),ankle=root.getObjectByName('Joint_ankle_'+side),p=mesh.geometry.attributes.position,relative=ankle.matrixWorld.clone().invert().multiply(mesh.matrixWorld);soles[side]=[];for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)+.085)<1e-6)soles[side].push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(relative));}
 function hit(x,z){const h=heightfield.hit(x,z);return h?{point:new T.Vector3(x,h.height,z),normal:new T.Vector3(...h.normal)}:null;}
 function candidate(side,x,z,yaw){const h=hit(x,z);if(!h)return null;const normal=h.normal.clone(),position=h.point.clone().addScaledVector(normal,.085),f={side,position:position.toArray(),yaw,normal:normal.toArray()},q=footprintQuaternion(T,f);let worst=0;for(const local of soles[side]){const p=local.clone().applyQuaternion(q).add(position),contact=hit(p.x,p.z,p.y+.15);if(contact)worst=Math.max(worst,Math.abs(contact.point.y-p.y));if(!contact||Math.abs(contact.point.y-p.y)>tolerance){rejected={side,x,z,yaw,soleError:contact?contact.point.y-p.y:null};return null;}}maxAcceptedSoleError=Math.max(maxAcceptedSoleError,worst);acceptedFootprints++;return f;}
 function find(side,x,z,yaw){const forward=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));for(const offset of [0,-.025,.025,-.05,.05,-.075,.075,-.1,.1,-.125,.125,-.15,.15]){const f=candidate(side,x+forward.x*offset,z+forward.z*offset,yaw);if(f)return f;}throw Error(`No supported ${side} footprint at ${x.toFixed(3)},${z.toFixed(3)} yaw ${yaw.toFixed(3)}: ${JSON.stringify(rejected)}`);}
 return {candidate,find,hit,soles,metrics:()=>({maxAcceptedSoleError,acceptedFootprints,tolerance})};
}
