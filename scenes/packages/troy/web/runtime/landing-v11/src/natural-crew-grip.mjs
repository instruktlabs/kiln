import {solveTwoBone} from './two-bone.mjs';
export function crewHandOrientation(T,direction){
 const y=direction.clone().negate(),up=new T.Vector3(0,1,0),x=direction.clone().cross(up);
 if(x.lengthSq()<1e-10)x.copy(direction).cross(new T.Vector3(0,0,1));x.normalize();
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,x.clone().cross(y)));
}
export function alignCrewWrist(T,{root,solver,side}){
 const elbow=root.getObjectByName('Joint_elbow_'+side),wrist=root.getObjectByName('Joint_wrist_'+side),direction=solver.position(wrist).sub(solver.position(elbow)).normalize();
 solver.setAbsolute(wrist,crewHandOrientation(T,direction));
}
export function solveNaturalCrewGrip(T,{root,solver,side,target,pole,gripQuaternion}){
 const shoulder=root.getObjectByName('Joint_shoulder_'+side),elbow=root.getObjectByName('Joint_elbow_'+side),wrist=root.getObjectByName('Joint_wrist_'+side),socket=root.getObjectByName('socket_hand_'+side),origin=solver.position(shoulder),solved=solveTwoBone({origin:origin.toArray(),target:target.toArray(),upper:.29,lower:.330,pole}),knee=new T.Vector3(...solved.knee),direction=target.clone().sub(knee).normalize(),down=new T.Vector3(0,-1,0),hand=crewHandOrientation(T,direction);
 solver.setAbsolute(shoulder,new T.Quaternion().setFromUnitVectors(down,knee.clone().sub(origin).normalize()));solver.setAbsolute(elbow,new T.Quaternion().setFromUnitVectors(down,direction));solver.setAbsolute(wrist,hand);
 // This scene contact lies inside the solid block. The visible hand follows
 // the forearm; the invisible contact axis follows the real oar shaft.
 socket.position.set(0,-.080,0);socket.quaternion.copy(hand).invert().multiply(gripQuaternion);root.updateMatrixWorld(true);
}
