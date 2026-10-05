import {createJointPoseSolver} from '../src/joint-pose.mjs';
export function footprintQuaternion(T,{yaw,normal=[0,1,0]}){const y=new T.Vector3(...normal),z=new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));z.addScaledVector(y,-z.dot(y)).normalize();const x=y.clone().cross(z).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));}
// Scene rig adapter; the generic footprint plan is independent of anatomy.
export function createCrewTravelPlayback(T,{root,plan,id}){
 const get=n=>{const x=root.getObjectByName(n);if(!x)throw Error('Missing joint '+n);return x;},solver=createJointPoseSolver(T,root),up=new T.Vector3(0,1,0),hips=get('Joint_hips'),pose=[];root.traverse(n=>{if(n.name.startsWith('Joint_')||n.name==='socket_hip_weapon')pose.push([n,n.position.clone(),n.quaternion.clone()]);});
 function sample(time){const state=plan.sample(time);for(const [n,p,q] of pose){n.position.copy(p);n.quaternion.copy(q);}const left=new T.Vector3(...state.feet.left.position),right=new T.Vector3(...state.feet.right.position),heading=(state.feet.left.yaw+state.feet.right.yaw)/2;root.position.fromArray(state.bodyCenter);root.position.y=Math.min(left.y,right.y)-.085-.025*Math.sin(Math.PI*state.phase)**2;root.quaternion.setFromAxisAngle(up,heading);hips.position.y=.925;root.updateMatrixWorld(true);
  for(const side of ['right','left']){const f=state.feet[side],q=root.quaternion.clone().invert().multiply(footprintQuaternion(T,f)),target=root.worldToLocal(new T.Vector3(...f.position));solver.chain(get('Joint_hip_'+side),get('Joint_knee_'+side),get('Joint_ankle_'+side),target,[.42,.415],[0,0,1],q);}
  const angle=(get('Joint_hip_left').rotation.x+get('Joint_hip_right').rotation.x)/2;for(let i=0;i<12;i++)get('Joint_cloth_'+i).rotation.x=Math.sin((i+.5)/12*Math.PI*2)>0?Math.min(0,angle-.08):0;
  const forward=new T.Vector3(Math.sin(heading),0,Math.cos(heading)),stride=left.clone().sub(right).dot(forward),swing=Math.max(-.18,Math.min(.18,stride*.64));
  get('Joint_shoulder_left').rotateX(swing);get('Joint_shoulder_right').rotateX(-swing);
  get('Joint_spine').rotateY(-swing*.15);get('Joint_neck').rotateY(swing*.15);
  root.updateMatrixWorld(true);return {id,...state,maxFootError:Math.max(...['left','right'].map(s=>get('Joint_ankle_'+s).getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(...state.feet[s].position))))};
 }
 return {sample,duration:plan.duration,plan,id};
}
