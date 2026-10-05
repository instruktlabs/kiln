// Greek-rig clearance adapter, applied after every sampled state so reverse
// seeking and joins use the same posture. No mesh edits or dynamic cloth solver.
export function travelClearanceWeight(time){
 // Keep the qualified release pose until the shoulders are above parked handles.
 const u=Math.max(0,Math.min(1,(time-3.15)/.45));return u*u*(3-2*u);
}
export function applyTravelClearance(T,root,weight=1,{tuck=0}={}){
 const w=Math.max(0,Math.min(1,weight));
 for(const [side,angle] of [['left',.34],['right',-.30]]){
  const shoulder=root.getObjectByName('Joint_shoulder_'+side);
  const target=angle+(Math.sign(angle)*.15-angle)*tuck;
  shoulder.rotation.z+=(target-shoulder.rotation.z)*w;
  const elbow=root.getObjectByName('Joint_elbow_'+side);
  elbow.rotation.x+=(-1.1-elbow.rotation.x)*tuck*w;
 }
 for(let i=0;i<12;i++){
  const a=(i+.5)/12*Math.PI*2,side=Math.cos(a)<0?'right':'left',hip=root.getObjectByName('Joint_hip_'+side).rotation.x;
  const front=Math.max(0,Math.sin(a)),back=Math.max(0,-Math.sin(a));
  const angle=.12+Math.max(0,-hip-.12)*front*.85+Math.max(0,hip-.07)*back*.85;
  const target=new T.Quaternion().setFromAxisAngle(new T.Vector3(-Math.sin(a),0,Math.cos(a)),angle);
  root.getObjectByName('Joint_cloth_'+i).quaternion.slerp(target,w);
 }
 root.updateMatrixWorld(true);
}

// Scene-specific exit-01 mast corridor, in the same local frame as its paths.
// Fold only while facing along the aisle, not while stepping toward a neighbor.
export function mastCorridorTuck(root){
 const smooth=v=>{const a=Math.max(0,Math.min(1,v));return a*a*(3-2*a);},q=root.quaternion,forwardZ=1-2*(q.x*q.x+q.y*q.y);
 return smooth((1.1-Math.abs(root.position.x))/.3)*smooth((root.position.z+1.5)/.5)*smooth((2.1-root.position.z)/.5)*smooth((forwardZ-.9)/.08);
}
