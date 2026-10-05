import {solveTwoBone}from'./runtime/landing-v10/src/two-bone.mjs';
// Scene-owned equipment frames preserve the chosen sword/shield poses while
// the compact hand follows its forearm and modestly overlaps the handle.
export function createHeroGripAdapter(T,{body,get,solver}){
 const up=new T.Vector3(0,1,0),down=new T.Vector3(0,-1,0),right=get('socket_hand_right'),left=get('socket_hand_left'),shield=get('Joint_shield_frame');
 const originalSocket=right.clone(false),originalLeft=left.clone(false),shieldMount=shield.clone(false),shieldGripLocal=originalLeft.position.clone().sub(shieldMount.position).applyQuaternion(shieldMount.quaternion.clone().invert()),mount=new T.Vector3(0,-.065,.012);
 for(const node of [right,left,shield])body.add(node);
 function naturalHand(side,point,pole=side==='right'?[-1,-.15,.1]:[1,-.4,.3],handMount=mount){
  const axial=.25-handMount.y,length=Math.hypot(axial,handMount.z),shoulder=get('Joint_shoulder_'+side),elbow=get('Joint_elbow_'+side),wrist=get('Joint_wrist_'+side),origin=solver.position(shoulder),solved=solveTwoBone({origin:origin.toArray(),target:point.toArray(),pole,upper:.29,lower:length}),knee=new T.Vector3(...solved.knee),delta=point.clone().sub(knee),horizontal=Math.hypot(delta.x,delta.z),theta=Math.asin(T.MathUtils.clamp(delta.y/length,-1,1))+Math.atan2(handMount.z,axial),h=Math.cos(theta),direction=new T.Vector3(delta.x/horizontal*h,Math.sin(theta),delta.z/horizontal*h),x=direction.clone().cross(up).normalize(),y=direction.clone().negate(),z=x.clone().cross(y),q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
  if(side==='left')q.multiply(new T.Quaternion().setFromAxisAngle(up,-Math.PI/2));
  solver.setAbsolute(shoulder,new T.Quaternion().setFromUnitVectors(down,knee.clone().sub(origin).normalize()));solver.setAbsolute(elbow,new T.Quaternion().setFromUnitVectors(down,direction));solver.setAbsolute(wrist,q);
 }
 function swordPose(w,q){
  const oldHand=q.clone().multiply(originalSocket.quaternion.clone().invert()),point=w.clone().add(originalSocket.position.clone().applyQuaternion(oldHand));
  naturalHand('right',point);right.position.copy(point);right.quaternion.copy(q);body.updateMatrixWorld(true);
 }
 function shieldPose(w,q){
  const face=q.clone().multiply(shieldMount.quaternion),centre=w.clone().add(shieldMount.position.clone().applyQuaternion(q)),origin=solver.position(get('Joint_shoulder_left')),normal=new T.Vector3(0,0,1).applyQuaternion(face);
  // A turning guard must stay within the upper arm's reach in the shield's
  // normal direction, including the outward offset used by the paired duel.
  centre.addScaledVector(normal,-Math.max(0,centre.clone().sub(origin).dot(normal)-.34));
  const point=centre.clone().add(shieldGripLocal.clone().applyQuaternion(face));
  // The elbow moves on the reachable two-bone circle. Choose its intersection
  // with a plane 62 mm behind the shield, rather than pulling it into the torso
  // with a fixed inward pole. If the raised plate is beyond that circle, use
  // the closest reachable point. The forearm rests beside the inner surface.
  const handMount=new T.Vector3(0,-.045,-.009),length=Math.hypot(.25-handMount.y,handMount.z),delta=point.clone().sub(origin),distance=delta.length(),axis=delta.clone().divideScalar(distance),along=(.29**2-length**2+distance**2)/(2*distance),radius=Math.sqrt(Math.max(0,.29**2-along**2)),circle=origin.clone().addScaledVector(axis,along),toward=normal.clone().addScaledVector(axis,-normal.dot(axis)),projection=toward.length();
  toward.normalize();const across=axis.clone().cross(toward).normalize(),cos=T.MathUtils.clamp((centre.clone().sub(circle).dot(normal)-.062)/(radius*projection),-1,1),sin=Math.sqrt(Math.max(0,1-cos*cos)),base=circle.clone().addScaledVector(toward,radius*cos),a=base.clone().addScaledVector(across,radius*sin),b=base.clone().addScaledVector(across,-radius*sin),elbow=a.y<b.y?a:b;
  naturalHand('left',point,elbow.sub(circle).toArray(),handMount);
  // Use the repaired authored handle mount; its axis lies on the back plane.
  left.position.copy(point);left.quaternion.copy(face);shield.position.copy(centre);shield.quaternion.copy(face);body.updateMatrixWorld(true);
 }
 return {originalSocket,shieldMount,swordPose,shieldPose};
}
