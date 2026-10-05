import {solveTwoBone} from './two-bone.mjs';
// Inject the consumer's Three instance; reusable for rigid-joint hierarchies.
export function createJointPoseSolver(T,root){
 const down=new T.Vector3(0,-1,0),position=o=>root.worldToLocal(o.getWorldPosition(new T.Vector3()));
 function setAbsolute(joint,q){const parent=joint.parent.getWorldQuaternion(new T.Quaternion()),relative=root.getWorldQuaternion(new T.Quaternion()).invert().multiply(parent);joint.quaternion.copy(relative.invert().multiply(q));root.updateMatrixWorld(true);}
 function chain(upper,lower,end,target,lengths,pole,endQ){const origin=position(upper),s=solveTwoBone({origin:origin.toArray(),target:target.toArray(),pole,upper:lengths[0],lower:lengths[1]}),knee=new T.Vector3(...s.knee);setAbsolute(upper,new T.Quaternion().setFromUnitVectors(down,knee.clone().sub(origin).normalize()));setAbsolute(lower,new T.Quaternion().setFromUnitVectors(down,target.clone().sub(knee).normalize()));setAbsolute(end,endQ);}
 return {position,setAbsolute,chain};
}
