import {solveTwoBone} from '../landing-v11/src/two-bone.mjs';
// Derived scene solver: callers synchronize the full pose before solving limbs.
// Parent/root world queries refresh ancestors; only the rotated joint and its
// descendants become dirty here. Sibling edits must be synchronized by callers.
export function createJointPoseSolver(T,root,{deferChildren=false}={}){
 const down=new T.Vector3(0,-1,0),position=o=>root.worldToLocal(o.getWorldPosition(new T.Vector3()));
 function setAbsolute(joint,q){const parent=joint.parent.getWorldQuaternion(new T.Quaternion()),relative=root.getWorldQuaternion(new T.Quaternion()).invert().multiply(parent);joint.quaternion.copy(relative.invert().multiply(q));if(deferChildren)joint.updateWorldMatrix(true,false);else joint.updateMatrixWorld(true);}
 function chain(upper,lower,end,target,lengths,pole,endQ){const origin=position(upper),s=solveTwoBone({origin:origin.toArray(),target:target.toArray(),pole,upper:lengths[0],lower:lengths[1]}),knee=new T.Vector3(...s.knee);setAbsolute(upper,new T.Quaternion().setFromUnitVectors(down,knee.clone().sub(origin).normalize()));setAbsolute(lower,new T.Quaternion().setFromUnitVectors(down,target.clone().sub(knee).normalize()));setAbsolute(end,endQ);}
 return {position,setAbsolute,chain};
}
