import {createRowingCrew} from './rowing-crew.mjs';import {setHandClosure} from './crew-hands.mjs';import {createJointPoseSolver} from '../src/joint-pose.mjs';
import {alignCrewWrist} from '../src/natural-crew-grip.mjs';
const ease=v=>{if(v<=0)return 0;if(v>=1)return 1;return Math.max(0,Math.min(1,v*v*v*(10+v*(-15+6*v))));};
// One stable actor, seated oar release followed by planted-foot standing.
// Turn/step/queue is a separate next transition; this does not teleport to an aisle.
export function createCrewStand(T,{ship,root,row,side,id}){
 if(typeof id!=='string'||!id)throw Error('Actor ID required');
 const rower=createRowingCrew(T,{ship,root,row,side});rower.update(0,{park:1});
 const get=name=>{const n=root.getObjectByName(name);if(!n)throw Error('Missing crew joint '+name);return n;},solver=createJointPoseSolver(T,root);
 const hips=get('Joint_hips'),spine=get('Joint_spine'),neck=get('Joint_neck'),weapon=get('socket_hip_weapon'),grip=ship.getObjectByName(`OarGrip_${row}_${side}`);
 const startPosition=root.position.clone(),startQuaternion=root.quaternion.clone(),feet=Object.fromEntries(['right','left'].map(s=>[s,get('Joint_ankle_'+s).getWorldPosition(new T.Vector3())]));
 const endPosition=startPosition.clone().add(new T.Vector3(0,.465,.52).applyQuaternion(startQuaternion));
 const startArms={};for(const side of ['right','left'])for(const joint of ['shoulder','elbow','wrist']){const n=get(`Joint_${joint}_${side}`);startArms[joint+'_'+side]=n.quaternion.clone();}
 function sample(time){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid crew time');
  const local=Math.max(0,time-1.2),release=ease((local-.2)/.6),closure=1-ease(local/.45),stand=local>=2.4?1:ease((local-.8)/1.6);
  rower.update(0,{park:ease(time/1.2)});
  if(time<1.2)return result(time,'parking',1);
  root.position.lerpVectors(startPosition,endPosition,stand);root.quaternion.copy(startQuaternion);hips.position.set(side*.14*(1-release),.95+(.925-.95)*stand,0);
  spine.rotation.set(.16*(1-stand)+.25*Math.sin(Math.PI*stand),0,-side*.28*(1-release));neck.rotation.set(-spine.rotation.x*.6,0,0);weapon.rotation.x=Math.PI*(.52+.48*stand);root.updateMatrixWorld(true);
  for(const limb of ['right','left']){
   const sign=limb==='right'?-1:1,target=root.worldToLocal(feet[limb].clone());solver.chain(get('Joint_hip_'+limb),get('Joint_knee_'+limb),get('Joint_ankle_'+limb),target,[.42,.415],[0,0,1],new T.Quaternion());
   const shoulder=get('Joint_shoulder_'+limb),elbow=get('Joint_elbow_'+limb);
   shoulder.quaternion.copy(startArms['shoulder_'+limb]).slerp(new T.Quaternion().setFromEuler(new T.Euler(-.60+(.60-.12)*stand,0,sign*(.18-(.18-.12)*stand))),release);
   elbow.quaternion.copy(startArms['elbow_'+limb]).slerp(new T.Quaternion().setFromEuler(new T.Euler(-.90+(.90-.25)*stand,0,0)),release);root.updateMatrixWorld(true);
   alignCrewWrist(T,{root,solver,side:limb});
  }
  setHandClosure(root,closure);
  const hipAngle=(get('Joint_hip_left').rotation.x+get('Joint_hip_right').rotation.x)/2;
  for(let i=0;i<12;i++){const front=Math.sin((i+.5)/12*Math.PI*2)>0,cloth=get('Joint_cloth_'+i);cloth.rotation.set(front?(-1.48*(1-stand)+Math.min(0,hipAngle-.08)*stand):1.48*(1-stand),0,0);}
  root.updateMatrixWorld(true);
  return result(time,time>=3.6?'standing':local<.8?'releasing':'rising',closure);
 }
 function result(time,stage,closure){
  const gripPoint=grip.getWorldPosition(new T.Vector3());return {id,time,stage,handClosure:closure,hip:hips.getWorldPosition(new T.Vector3()).toArray(),maxFootDrift:Math.max(...['right','left'].map(s=>get('Joint_ankle_'+s).getWorldPosition(new T.Vector3()).distanceTo(feet[s]))),handDistanceFromOar:Math.min(...['right','left'].map(s=>get('socket_hand_'+s).getWorldPosition(new T.Vector3()).distanceTo(gripPoint)))};
 }

 return {sample,root,id,feet,endPosition};
}
