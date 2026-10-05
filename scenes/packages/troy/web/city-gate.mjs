// Consumer animation of the saved hinges. The clone is a transform source;
// rendering retains the existing one-instance batches and borrowed resources.
export function createCityGate(T,{model,placement,batches}){
 if(!model||placement?.scale!==3||!(batches instanceof Map))throw Error('Invalid city gate inputs');
 const root=new T.Group(),body=model.clone(true);root.name='city-gate-transform-source';root.add(body);root.position.fromArray(placement.position);root.rotation.y=placement.yaw;root.scale.setScalar(placement.scale);
 const left=body.getObjectByName('door_left'),right=body.getObjectByName('door_right');if(!left||!right)throw Error('Original gate hinges required');
 const baseline=[left.quaternion.clone(),right.quaternion.clone()],axis=new T.Vector3(0,1,0),rotation=new T.Quaternion(),meshes=[];
 body.traverse(n=>{if(n.isMesh){const b=batches.get(n.name);if(!b||b.count!==1)throw Error('Missing gate batch '+n.name);meshes.push([n,b]);}});
 if(meshes.length!==batches.size)throw Error('Unexpected gate batch');
 let openness=0,target=0,disposed=false,last=-1,occupancy=null,blockedByOccupant=false;const swingBounds=new T.Box3();
 const alive=()=>{if(disposed)throw Error('City gate disposed');};
 function sample(value){
  alive();if(!Number.isFinite(value)||value<0||value>1)throw Error('Invalid gate openness');openness=value;
  if(value===last)return stats();last=value;const angle=(value*value*(3-2*value))*Math.PI/2;
  left.quaternion.copy(baseline[0]).multiply(rotation.setFromAxisAngle(axis,angle));right.quaternion.copy(baseline[1]).multiply(rotation.setFromAxisAngle(axis,-angle));root.updateMatrixWorld(true);
  for(const [n,b]of meshes){b.setMatrixAt(0,n.matrixWorld);b.instanceMatrix.needsUpdate=true;b.computeBoundingBox();b.computeBoundingSphere();}
  return stats();
 }
 function stats(){return {openness,targetOpen:target===1,moving:openness!==target,batches:meshes.length,blockedByOccupant,disposed};}
 sample(0);
 // A full horizontal circle around each saved hinge conservatively encloses
 // every intermediate leaf angle. A waiting door never sweeps through an
 // occupant between endpoint samples, even with a large fixture time step.
 for(const hinge of [left,right]){const pivot=hinge.getWorldPosition(new T.Vector3());let radius=0,lo=Infinity,hi=-Infinity;hinge.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld);radius=Math.max(radius,Math.hypot(v.x-pivot.x,v.z-pivot.z));lo=Math.min(lo,v.y);hi=Math.max(hi,v.y);}});swingBounds.union(new T.Box3(new T.Vector3(pivot.x-radius,lo,pivot.z-radius),new T.Vector3(pivot.x+radius,hi,pivot.z+radius)));}
 return {root,sample,stats,setOccupancy(box){alive();if(box!==null&&(!box||box.isEmpty()||![...box.min.toArray(),...box.max.toArray()].every(Number.isFinite)))throw Error('Finite gate occupant bounds required');occupancy=box?.clone()??null;blockedByOccupant=Boolean(occupancy?.intersectsBox(swingBounds));},setOpen(value){alive();if(typeof value!=='boolean')throw Error('Boolean gate command required');target=Number(value);},update(dt){alive();if(!Number.isFinite(dt)||dt<0)throw Error('Invalid gate delta');blockedByOccupant=Boolean(occupancy?.intersectsBox(swingBounds));if(openness!==target&&!blockedByOccupant)sample(target>openness?Math.min(target,openness+dt/1.8):Math.max(target,openness-dt/1.8));return stats();},dispose(){if(disposed)return;disposed=true;occupancy=null;root.removeFromParent();}};
}
