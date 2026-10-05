import {createTravelFootprints,createTravelPlan} from '../src/travel-footprints.mjs';import {createCrewTravelPlayback} from './crew-travel-playback.mjs';import {createSupportedFootprints} from './supported-footprints.mjs';
export function createCrewTravelWalk(T,{root,ship,surfaces,id,staging,cachedPlan,finalHeading=Math.PI/2}){
 if(cachedPlan){const plan=createTravelPlan(cachedPlan);return {...createCrewTravelPlayback(T,{root,plan,id}),routeEnd:staging};}
 root.updateMatrixWorld(true);const up=new T.Vector3(0,1,0),heading=new T.Euler().setFromQuaternion(root.quaternion,'YXZ').y,feet=Object.fromEntries(['left','right'].map(s=>[s,{position:root.getObjectByName('Joint_ankle_'+s).getWorldPosition(new T.Vector3()).toArray(),yaw:heading,normal:[0,1,0]}])),support=createSupportedFootprints(T,{root,surfaces}),steps=[],start=root.position.clone();let current=[start.x,start.z],yaw=heading;
 const builder=createTravelFootprints({position:current,yaw,find:support.find}),turn=h=>{builder.turn(h);},move=(x,z)=>{builder.move(x,z);current=[x,z];};
 // Exact exit-01 stationary fixture path. Mast bypass for aft crew is qualified
 // separately from the fore-row path; these are not an engine navigation mesh.
 if(current[1]<1.5){if(current[1]<-.8)move(0,-.8);move(-.62,-.8);move(-.62,1.5);move(0,1.5);}
 if(current[1]<9.76)move(0,9.76);move(0,10.24);move(.4,10.55);const hinge=ship.getObjectByName('BoardingPlankPivot').getWorldPosition(new T.Vector3()),toe=ship.getObjectByName('BoardingPlankToe').getWorldPosition(new T.Vector3());move(hinge.x,10.8);move(toe.x,10.8);move(toe.x+1.4,10.8);if(staging){move(staging[0],10.8);move(staging[0],staging[1]);turn(finalHeading);}
 const plan=createTravelPlan({feet,steps:builder.steps,lift:.10,duration:.34});return {...createCrewTravelPlayback(T,{root,plan,id}),support,routeEnd:current};
}
