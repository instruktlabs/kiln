import {createJointPoseSolver} from '../src/joint-pose.mjs';import {setHandClosure} from './crew-hands.mjs';
import {solveNaturalCrewGrip} from '../src/natural-crew-grip.mjs';
// Scene-specific contact prototype. No mixer runs alongside the solved pose.
// Physical metres for people; vessel retains its 1.6 authored-scene scale.
export function createRowingCrew(T,{ship,root,row,side}){
 const get=(r,n)=>{const o=r.getObjectByName(n);if(!o)throw Error('Missing rowing part '+n);return o;};
 const pivot=get(ship,`OarPivot_${row}_${side}`),grip=get(ship,`OarGrip_${row}_${side}`),seat=get(ship,`CrewSeat_${row}_${side}`),hips=get(root,'Joint_hips'),spine=get(root,'Joint_spine'),weapon=get(root,'socket_hip_weapon');
 const baseGrip=grip.position.clone();
 const v=a=>new T.Vector3(...a);
 const solver=createJointPoseSolver(T,root),{position:localPosition,chain}=solver;
 function update(time,{park=0}={}){
  if(!Number.isFinite(time)||!Number.isFinite(park)||park<0||park>1)throw Error('Invalid rowing time/park');
  const phase=time/3*Math.PI*2,stroke=Math.sin(phase);
  // Handle/arm motion is derived from the same oar pivot, never a separate hand curve.
  const feather=.5*(1-Math.cos(phase))*Math.PI/2;
  pivot.rotation.set(side*(.005-.055*Math.cos(phase)),side*.22*stroke,0);
  const oar=get(ship,`Mesh_ArticulatedOar_${row}_${side}`);
  const shaft=baseGrip.clone().negate().normalize(),slide=shaft.clone().multiplyScalar(park*.5/pivot.getWorldScale(new T.Vector3()).x);oar.position.copy(slide);grip.position.copy(baseGrip).add(slide);
  oar.quaternion.setFromAxisAngle(shaft,feather);
  ship.updateMatrixWorld(true);
  const seatWorld=seat.getWorldPosition(new T.Vector3()),shipQ=ship.getWorldQuaternion(new T.Quaternion()),up=v([0,1,0]).applyQuaternion(shipQ);
  root.position.copy(seatWorld).addScaledVector(up,.075-.95);root.quaternion.copy(shipQ).multiply(new T.Quaternion().setFromAxisAngle(v([0,1,0]),Math.PI));root.scale.setScalar(1);
  root.traverse(n=>{if(n.name.startsWith('Joint_'))n.quaternion.identity();});hips.position.set(side*.14*park,.95,0);spine.rotation.x=.16+.40*stroke;spine.rotation.z=-side*.28*park;get(root,'Joint_neck').rotation.x=-spine.rotation.x*.6;
  weapon.rotation.x=Math.PI*.52;setHandClosure(root,1);root.updateMatrixWorld(true);
  const footTargets=[];
  for(const limb of ['right','left']){
   const sign=limb==='right'?-1:1,target=v([sign*.095,.55,.52]);
   chain(get(root,'Joint_hip_'+limb),get(root,'Joint_knee_'+limb),get(root,'Joint_ankle_'+limb),target,[.42,.415],[0,0,1],new T.Quaternion());footTargets.push([limb,target]);
  }
  for(let i=0;i<12;i++){const a=(i+.5)/12*Math.PI*2,joint=get(root,'Joint_cloth_'+i);joint.rotation.x=Math.sin(a)>.1?-1.48:1.48;}
  root.updateMatrixWorld(true);
  const centre=localPosition(grip);
  // Preserve the shaft's real slope as well as its yaw in both closed palms.
  const stem=grip.position.clone().negate().normalize().applyQuaternion(pivot.getWorldQuaternion(new T.Quaternion())).applyQuaternion(root.getWorldQuaternion(new T.Quaternion()).invert());
  const y=stem.normalize(),z=v([0,1,0]).addScaledVector(y,-y.y).normalize(),x=y.clone().cross(z).normalize(),gripQ=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));gripQ.multiply(new T.Quaternion().setFromAxisAngle(v([0,1,0]),feather));
  const targets=[];
  for(const limb of ['right','left']){
   const sign=limb==='right'?-1:1;
   // Right/left target follows actor-local X, irrespective of vessel side.
   const target=centre.clone().addScaledVector(y,sign*.072*(y.x<0?-1:1));
   try{solveNaturalCrewGrip(T,{root,solver,side:limb,target,pole:[sign*.6,-1,-.1],gripQuaternion:gripQ});}catch(e){throw Error(`row ${row} side ${side} ${limb} time ${time}: ${e.message}`);}
   targets.push([limb,target]);
  }
  root.updateMatrixWorld(true);
  return {time,row,side,maxGripError:Math.max(...targets.map(([s,t])=>localPosition(get(root,'socket_hand_'+s)).distanceTo(t))),maxFootError:Math.max(...footTargets.map(([s,t])=>localPosition(get(root,'Joint_ankle_'+s)).distanceTo(t))),seatOffset:hips.getWorldPosition(new T.Vector3()).sub(seatWorld).dot(up),weaponParent:weapon.parent.name};
 }
 return {update,root,pivot,seat,row,side};
}
