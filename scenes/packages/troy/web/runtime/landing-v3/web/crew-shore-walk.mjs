import {createFootstepPlan} from '../src/footstep-plan.mjs';import {createCrewFootstepPlayback} from './crew-footsteps.mjs';import {createSupportedFootprints} from './supported-footprints.mjs';
export function createCrewShoreWalk(T,{root,ship,surfaces,id,staging,cachedPlan,finalHeading=Math.PI/2}){
 if(cachedPlan){const plan=createFootstepPlan(cachedPlan);return {...createCrewFootstepPlayback(T,{root,plan,id}),routeEnd:staging};}
 root.updateMatrixWorld(true);const up=new T.Vector3(0,1,0),heading=new T.Euler().setFromQuaternion(root.quaternion,'YXZ').y,feet=Object.fromEntries(['left','right'].map(s=>[s,{position:root.getObjectByName('Joint_ankle_'+s).getWorldPosition(new T.Vector3()).toArray(),yaw:heading,normal:[0,1,0]}])),support=createSupportedFootprints(T,{root,surfaces}),steps=[],start=root.position.clone();let current=[start.x,start.z],yaw=heading;
 function pair(x,z,h){const q=new T.Quaternion().setFromAxisAngle(up,h);for(const side of ['left','right']){const p=new T.Vector3(side==='left'?.095:-.095,0,0).applyQuaternion(q).add(new T.Vector3(x,0,z));steps.push(support.find(side,p.x,p.z,h));}}
 function turn(h){let delta=h-yaw;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;const n=Math.ceil(Math.abs(delta)/(Math.PI/6)),from=yaw;for(let i=1;i<=n;i++)pair(...current,from+delta*i/n);yaw=from+delta;}
 function move(x,z){const from=current,h=Math.atan2(x-from[0],z-from[1]);turn(h);const n=Math.ceil(Math.hypot(x-from[0],z-from[1])/.24);for(let i=1;i<=n;i++)pair(from[0]+(x-from[0])*i/n,from[1]+(z-from[1])*i/n,yaw);current=[x,z];}
 // Exact exit-01 stationary fixture path. Mast bypass for aft crew is qualified
 // separately from the fore-row path; these are not an engine navigation mesh.
 if(current[1]<1.5){if(current[1]<-.8)move(0,-.8);move(-.62,-.8);move(-.62,1.5);move(0,1.5);}
 if(current[1]<9.76)move(0,9.76);move(0,10.24);move(.4,10.55);const hinge=ship.getObjectByName('BoardingPlankPivot').getWorldPosition(new T.Vector3()),toe=ship.getObjectByName('BoardingPlankToe').getWorldPosition(new T.Vector3());move(hinge.x,10.8);move(toe.x,10.8);move(toe.x+1.4,10.8);if(staging){move(staging[0],10.8);move(staging[0],staging[1]);turn(finalHeading);}
 const plan=createFootstepPlan({feet,steps,lift:.15,duration:.34});return {...createCrewFootstepPlayback(T,{root,plan,id}),support,routeEnd:current};
}
