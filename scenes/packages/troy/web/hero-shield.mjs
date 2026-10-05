// Consumer target policy. The original shield/grip/frame geometry stays immutable.
// +Z is each hero's forward direction. Align the shield face first, then derive
// the wrist transform from its actual authored mounting frame.
export function heroShieldPose(T,actor,blocking=false){
 const frame=actor.shieldMount;
 const weight=typeof blocking==='boolean'?Number(blocking):Math.max(0,Math.min(1,blocking));
 if(!Number.isFinite(weight))throw Error('Invalid shield guard weight');
 const face=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),(1-weight)*Math.PI/2);
 const hand=face.clone().multiply(frame.quaternion.clone().invert());
 // Forearm crosses the shield horizontally, with the elbow outside the chest.
 // Carry beside the body; turn and raise the plate in front only for guard.
 const origin=actor.solver.position(actor.get('Joint_shoulder_left')),drop=.13-.05*weight,outward=.14,forward=Math.sqrt(.29**2-drop**2-outward**2),across=Math.sqrt(.295**2+.009**2-.012**2);
 const offset=new T.Vector3(outward-across+.17,0,forward+.062).applyQuaternion(face);
 const centre=origin.clone().add(offset).add(new T.Vector3(0,-drop,0));
 return {w:centre.sub(frame.position.clone().applyQuaternion(hand)),q:hand};
}
