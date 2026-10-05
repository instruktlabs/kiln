import {createFootstepPlan} from '../landing-v11/src/footstep-plan.mjs';import {createCrewFootstepPlayback} from './crew-footsteps.mjs';
// Stationary ship fixture. The source actor must already be standing. Footprints
// are in world coordinates; terrain/ship motion must be supplied by a future owner.
export function createCrewAisleStep(T,{root,ship,id}){
 const get=n=>{const x=root.getObjectByName(n);if(!x)throw Error('Missing joint '+n);return x;},up=new T.Vector3(0,1,0),initialQ=root.quaternion.clone(),start=root.position.clone(),yaw=new T.Euler().setFromQuaternion(initialQ,'YXZ').y;
 const feet=Object.fromEntries(['left','right'].map(s=>[s,{position:get('Joint_ankle_'+s).getWorldPosition(new T.Vector3()).toArray(),yaw}])),steps=[],ray=new T.Raycaster(),support=ship.getObjectByName('Mesh_TimberMastOarsAndRigging');
 function floor(x,z){ray.set(new T.Vector3(x,start.y+.25,z),new T.Vector3(0,-1,0));const h=ray.intersectObject(support,false).find(h=>h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.9);if(!h||Math.abs(h.point.y-start.y)>.12)throw Error('Unsupported seat-bay step');return h.point.y;}
 function pair(x,z,heading){const q=new T.Quaternion().setFromAxisAngle(up,heading),order=start.x>0?['left','right']:['right','left'];for(const side of order){const p=new T.Vector3(side==='left'?.095:-.095,0,0).applyQuaternion(q).add(new T.Vector3(x,0,z));steps.push({side,position:[p.x,floor(p.x,p.z)+.085,p.z],yaw:heading});}}
 let current=[start.x,start.z];
 function moveTo(x,z){const from=current,count=Math.ceil(Math.hypot(x-from[0],z-from[1])/.16);for(let i=1;i<=count;i++)pair(from[0]+(x-from[0])*i/count,from[1]+(z-from[1])*i/count,yaw);current=[x,z];}
 // Exact exit-01 fixture mast is centred at world Z .56. The seventh bay
 // must approach beside it, move aft, then join the centre aisle.
 if(Math.abs(start.z-.56)<.6){moveTo(Math.sign(start.x)*.62,start.z);moveTo(Math.sign(start.x)*.62,start.z-.6);}
 moveTo(0,current[1]);if(Math.abs(start.z-.56)<.6)moveTo(0,start.z-.8);
 // Turn on lifted feet in four paired increments; no planted-foot yaw changes.
 for(let i=1;i<=4;i++)pair(0,current[1],yaw*(1-i/4));
 const plan=createFootstepPlan({feet,steps,validateLanding:s=>Math.abs(floor(s.position[0],s.position[2])+.085-s.position[1])<.002});
 return createCrewFootstepPlayback(T,{root,plan,id});
}
