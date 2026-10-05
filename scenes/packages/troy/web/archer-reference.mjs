import {archerPhase,ARCHER} from './archer-plan.mjs';
import {createJointPoseSolver} from './runtime/landing-v10/src/joint-pose.mjs';
import {solveTwoBone} from './runtime/landing-v10/src/two-bone.mjs';
import {bowBend} from './archer-bow.mjs';
import {groundHeight} from './layout.mjs';

// Exact CPU authoring/reference controller. Preserve masters; bake a qualified
// derivative before making a 48-actor animated reference the production default.
export function createArcherReference(T,{human,hands,equipment}){
 const DRAW=ARCHER.draw,ARROW_SCALE=ARCHER.arrowScale;
 const get=(root,name)=>{const n=root.getObjectByName(name);if(!n)throw Error('Missing archer part '+name);return n;};
 const group=new T.Group(),body=human.clone(true);group.name='archer-reference';group.add(body);
 const remove=[];body.traverse(n=>{if(/sword|shield/i.test(n.name))remove.push(n);});for(const n of remove)n.removeFromParent();
 for(const side of ['left','right']){
  const wrist=get(body,'Joint_wrist_'+side),old=get(body,'Mesh_hand_'+side),oldSkin=old.material,skin=get(hands,'Mesh_palm_'+side).material;old.removeFromParent();
  // Reuse donor skin on the cloned body; source masters/materials stay immutable.
  body.traverse(n=>{if(n.isMesh&&n.material===oldSkin)n.material=skin;});
  const copy=get(hands,'hand_frame_'+side).clone(true);copy.traverse(n=>{if(n.isMesh)n.material=skin;});wrist.add(copy);
 }
 const bow=get(equipment,'Joint_Bow').clone(true);bow.position.set(0,0,0);bow.quaternion.identity();group.add(bow);get(bow,'Mesh_Bow_String').visible=false;
 // Fit the scene quiver outboard; longer equipped arrows match the adult draw.
 const quiver=get(equipment,'Joint_Quiver').clone(true);quiver.position.set(-.22,.85,-.23);quiver.quaternion.identity();body.add(quiver);
 for(let i=1;i<=3;i++){const arrow=get(quiver,'Joint_Arrow_'+i);arrow.scale.y*=ARROW_SCALE;arrow.position.y+=.365*(ARROW_SCALE-1);}
 const originalArrow=get(quiver,'Joint_Arrow_1'),heldArrow=originalArrow.clone(true),projectile=originalArrow.clone(true);
 for(const [node,name] of [[heldArrow,'held-arrow'],[projectile,'projectile']]){node.name=name;node.position.set(0,0,0);node.quaternion.identity();group.add(node);}
 const ownedGeometry=[],limbs=['Upper','Lower'].map(side=>{
  const mesh=get(bow,'Mesh_Bow_Limb_'+side);mesh.geometry=mesh.geometry.clone();ownedGeometry.push(mesh.geometry);
  // GLB attributes may share an interleaved buffer with normals and UVs. Decode
  // positions through the attribute API; the backing array is not an XYZ list.
  const p=mesh.geometry.attributes.position,base=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++)base.set([p.getX(i),p.getY(i),p.getZ(i)],i*3);
  mesh.geometry.setAttribute('position',new T.BufferAttribute(base.slice(),3));
  return {mesh,base};
 });
 const nockRest=['Top','Bottom'].map(side=>get(bow,'Mesh_Bow_Nock_'+side).quaternion.clone());
 const stringGeometry=new T.CylinderGeometry(.0016,.0016,1,5),stringMaterial=get(bow,'Mesh_Bow_String').material;
 ownedGeometry.push(stringGeometry);const strings=[new T.Mesh(stringGeometry,stringMaterial),new T.Mesh(stringGeometry,stringMaterial)];strings.forEach((n,i)=>{n.name='draw-string-'+i;bow.add(n);});
 const baseline=[];body.traverse(n=>{if(n.name.startsWith('Joint_')&&!n.name.startsWith('Joint_finger_')&&!n.name.startsWith('Joint_thumb_'))baseline.push([n,n.position.clone(),n.quaternion.clone()]);});
 const solver=createJointPoseSolver(T,body),v=a=>new T.Vector3(...a),up=v([0,1,0]),arrowNock=v([0,.365*ARROW_SCALE,0]);
 const bowQ=new T.Quaternion().setFromUnitVectors(v([0,0,1]),v([1,.015,0]).normalize());
 const arrowQ=new T.Quaternion().setFromUnitVectors(v([0,-1,0]),v([1,.015,0]).normalize()),aim=v([1,.015,0]).normalize();
 // Fit role mounts to the actual solid block surfaces, without adding a visible
 // grip ring, thumb or finger chain. Source geometry and generic sockets stay fixed.
 const gripFrame=new T.Object3D();gripFrame.name='archer_bow_grip';gripFrame.position.set(.055,-.045,0);get(body,'Joint_wrist_left').add(gripFrame);
 const drawContact=new T.Object3D();drawContact.name='archer_draw_contact';drawContact.position.set(0,-.07,.02);get(body,'Joint_wrist_right').add(drawContact);
 // Solve to the grip point using the forearm plus the block's contact offset,
 // then recover the actual forearm direction analytically. This keeps the
 // wrist straight and avoids iterative pose branches during reverse seeking.
 function naturalGrip(side,point,mount,pole){
  const shoulder=get(body,'Joint_shoulder_'+side),elbow=get(body,'Joint_elbow_'+side),wrist=get(body,'Joint_wrist_'+side),origin=solver.position(shoulder);
  const orientation=direction=>{const x=direction.clone().cross(up).normalize(),y=direction.clone().negate(),z=x.clone().cross(y);return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));};
  const axial=.25-mount.y,length=Math.hypot(axial,mount.x,mount.z),solved=solveTwoBone({origin:origin.toArray(),target:point.toArray(),pole,upper:.29,lower:length}),knee=v(solved.knee),delta=point.clone().sub(knee),horizontal=Math.hypot(delta.x,delta.z);
  let direction;
  if(side==='left'){
   const dy=delta.y/axial,h=Math.sqrt(Math.max(0,1-dy*dy)),angle=Math.atan2(mount.x,axial*h),cos=Math.cos(angle),sin=Math.sin(angle);
   direction=v([(delta.x*cos+delta.z*sin)/horizontal*h,dy,(delta.z*cos-delta.x*sin)/horizontal*h]);
  }else{
   const theta=Math.asin(T.MathUtils.clamp(delta.y/length,-1,1))+Math.atan2(mount.z,axial),h=Math.cos(theta);
   direction=v([delta.x/horizontal*h,Math.sin(theta),delta.z/horizontal*h]);
  }
  const down=v([0,-1,0]);solver.setAbsolute(shoulder,new T.Quaternion().setFromUnitVectors(down,knee.clone().sub(origin).normalize()));solver.setAbsolute(elbow,new T.Quaternion().setFromUnitVectors(down,direction));solver.setAbsolute(wrist,orientation(direction));
 }
 const smooth=(a,b,x)=>{const f=Math.max(0,Math.min(1,(x-a)/(b-a)));return f*f*(3-2*f);};
 function placeArrow(node,nock,q){node.quaternion.copy(q);node.position.copy(nock).sub(arrowNock.clone().applyQuaternion(q));}
 function deform(draw){
  const bend=bowBend(draw,{travel:DRAW,brace:ARCHER.bowBrace});
  for(const {mesh,base} of limbs){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){const y=base[i*3+1],point=bend.point(y);p.setXYZ(i,base[i*3],point.y,base[i*3+2]+point.z);}p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();}
  const centre=v([0,0,-ARCHER.bowBrace-DRAW*draw]);
  for(let i=0;i<2;i++){const tip=v([0,(i===0?1:-1)*bend.tipY,bend.tipZ]),nock=get(bow,'Mesh_Bow_Nock_'+(i===0?'Top':'Bottom'));nock.position.copy(tip);nock.quaternion.setFromAxisAngle(v([1,0,0]),(i===0?-1:1)*bend.angle).multiply(nockRest[i]);strings[i].position.copy(tip).add(centre).multiplyScalar(.5);const delta=tip.clone().sub(centre);strings[i].quaternion.setFromAxisAngle(v([1,0,0]),Math.atan2(delta.z,delta.y));strings[i].scale.set(1,delta.length(),1);}
  return centre;
 }
 function sample(time,offset=0){
  const state=archerPhase(time,offset),p=state.phase;
  for(const [n,position,q] of baseline){n.position.copy(position);n.quaternion.copy(q);}
  get(body,'Joint_spine').rotation.set(0,.12*state.raised,0);get(body,'Joint_neck').rotation.set(0,(Math.PI/2-.12*state.raised)*.85,0);get(body,'Joint_head').rotation.y=(Math.PI/2-.12*state.raised)*.15;
  // Raise first, then draw. Carry around the right shoulder before turning the shaft.
  const recovery=1-smooth(7.4,8.5,p),aimRaise=smooth(2.5,3,p)*recovery,extension=smooth(3,4,p)*recovery;
  const grip=v([.27,.93,.04]).lerp(v([.42,1.22,.22]),state.raised).add(v([0,.315,0]).multiplyScalar(aimRaise)).add(v([.31,0,-.06]).multiplyScalar(extension));
  bow.position.copy(grip);bow.quaternion.copy(bowQ);const localNock=deform(state.draw),nock=localNock.clone().applyQuaternion(bowQ).add(grip);
  body.updateMatrixWorld(true);const pickup=solver.position(get(quiver,'Mesh_Arrow_1_Nock'));
  let rightPoint=v([-.26,.95,.12]);
  if(p>=1&&p<1.5)rightPoint.lerp(pickup,smooth(1,1.5,p));
  else if(p>=1.5&&p<1.85)rightPoint.copy(pickup).lerp(v([-.34,1.75,-.12]),smooth(1.5,1.85,p));
  else if(p>=1.85&&p<2.12)rightPoint.copy(v([-.34,1.75,-.12])).lerp(v([-.32,1.53,.30]),smooth(1.85,2.12,p));
  else if(p>=2.12&&p<2.5)rightPoint.copy(v([-.32,1.53,.30])).lerp(nock,smooth(2.12,2.5,p));
  else if(p>=2.5&&p<5)rightPoint.copy(nock);
  else if(p>=5&&p<7.4)rightPoint.copy(grip).addScaledVector(aim,-ARCHER.bowBrace-DRAW).add(v([-.08,.05,-.02]).multiplyScalar(smooth(5,5.4,p))).lerp(v([-.26,.95,.12]),smooth(6.5,7.4,p));
  // The solver takes a bend direction, not a world-space elbow target.
  // Keep the drawing elbow outboard and the full-draw forearm along the arrow.
  const rightPole=v([-1,.15,-.3]).lerp(v([-1,-.25,1]),smooth(1.55,2.12,p)).lerp(v([-1,-.12,0]),smooth(3,4,p)).lerp(v([-1,.15,-.3]),smooth(7.4,8.5,p));
  for(const [side,point,mount] of [['left',grip,gripFrame.position],['right',rightPoint,drawContact.position]]){try{naturalGrip(side,point,mount,side==='left'?[1,-.4,-.5]:rightPole.toArray());}catch(e){throw Error(`archer ${side} phase ${p}: ${e.message}`);}}
  body.updateMatrixWorld(true);originalArrow.visible=!state.heldArrow&&state.flight===null;heldArrow.visible=state.heldArrow;
  const heldQ=new T.Quaternion().slerp(arrowQ,smooth(2.05,2.5,p));placeArrow(heldArrow,rightPoint,heldQ);
  projectile.visible=state.flight!==null;let impact=false;
  {
   const origin=v(ARCHER.aimGrip).addScaledVector(aim,-ARCHER.bowBrace-DRAW),dt=state.flight??0;
   const point=origin.clone().addScaledVector(aim,ARCHER.speed*dt).add(v([0,-4.905*dt*dt,0]));
   const velocity=aim.clone().multiplyScalar(ARCHER.speed).add(v([0,-9.81*dt,0]));
   placeArrow(projectile,point,new T.Quaternion().setFromUnitVectors(v([0,-1,0]),velocity.normalize()));
   group.updateMatrixWorld(true);const head=projectile.localToWorld(v([0,-.37,0]));if(projectile.visible&&head.y<=groundHeight(head.x,head.z)){projectile.visible=false;impact=true;}
  }
  group.updateMatrixWorld(true);const drawTip=drawContact.getWorldPosition(new T.Vector3());
  return {...state,impact,bowGripError:solver.position(gripFrame).distanceTo(grip),drawContactError:body.worldToLocal(drawTip).distanceTo(rightPoint),drawPoint:rightPoint.toArray(),bowPoint:grip.toArray(),projectileVisible:projectile.visible};
 }
 return {group,body,bow,quiver,heldArrow,projectile,sample,dispose(){for(const g of ownedGeometry)g.dispose();}};
}
