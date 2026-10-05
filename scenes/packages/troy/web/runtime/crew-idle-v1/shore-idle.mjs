// Scene-specific upper-body idle. Capture a completed, supported standing pose.
// Root, hips, legs, fingers and the hip weapon stay at their qualified transforms.
export function createCrewShoreIdle(T,{root}){
 const duration=6,names=['Joint_spine','Joint_neck','Joint_shoulder_left','Joint_shoulder_right','Joint_elbow_left','Joint_elbow_right'],joints=names.map(name=>{const node=root.getObjectByName(name);if(!node)throw Error('Missing idle joint '+name);return {node,base:node.quaternion.clone()};}),rotation=new T.Quaternion(),euler=new T.Euler();
 function sample(time){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid shore idle time');
  const phase=time%duration/duration*Math.PI*2,envelope=(1-Math.cos(phase))*.5,breath=Math.sin(phase*2)*envelope,look=Math.sin(phase)*envelope;
  const angles=[[.012*breath,0,.006*look],[-.007*breath,.09*look,-.006*look],[.014*breath,0,.008*look],[-.010*breath,0,.008*look],[.016*breath,0,0],[-.012*breath,0,0]];
  joints.forEach(({node,base},i)=>{rotation.setFromEuler(euler.set(...angles[i]));node.quaternion.copy(base).multiply(rotation);});root.updateMatrixWorld(true);return {time};
 }
 return {sample,duration};
}
