// Uses the same authored pivots and stroke as the qualified rowing rig, without
// evaluating any character joints. Kept external to the core asset toolchain.
export function createOarPlayback(T,{ship,rows}){
 const get=name=>{const part=ship.getObjectByName(name);if(!part)throw Error('Missing oar part '+name);return part;};
 const oars=rows.map(({row,side})=>{const grip=get(`OarGrip_${row}_${side}`);return {side,pivot:get(`OarPivot_${row}_${side}`),grip,oar:get(`Mesh_ArticulatedOar_${row}_${side}`),base:grip.position.clone(),shaft:grip.position.clone().negate().normalize()};});
 return {update(time,{park=0}={}){
  if(!Number.isFinite(time)||time<0||!Number.isFinite(park)||park<0||park>1)throw Error('Invalid oar time/park');
  const phase=time/3*Math.PI*2,stroke=Math.sin(phase),feather=.5*(1-Math.cos(phase))*Math.PI/2;
  for(const {side,pivot,grip,oar,base,shaft}of oars){pivot.rotation.set(side*(.005-.055*Math.cos(phase)),side*.22*stroke,0);const slide=shaft.clone().multiplyScalar(park*.5/pivot.getWorldScale(new T.Vector3()).x);oar.position.copy(slide);grip.position.copy(base).add(slide);oar.quaternion.setFromAxisAngle(shaft,feather);}
  ship.updateMatrixWorld(true);
 }};
}
