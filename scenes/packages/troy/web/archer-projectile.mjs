import {ARCHER,archerPhase} from './archer-plan.mjs';import {groundHeight} from './layout.mjs';
// Same exact ballistic contract as the CPU reference, evaluated per placement.
export function archerProjectilePose(T,time,{matrix,phase=0,height=groundHeight}){
 const state=archerPhase(time,phase),dt=state.flight??0,aim=new T.Vector3(1,.015,0).normalize();
 const nock=new T.Vector3(...ARCHER.aimGrip).addScaledVector(aim,-ARCHER.bowBrace-ARCHER.draw).addScaledVector(aim,ARCHER.speed*dt);nock.y-=4.905*dt*dt;
 const velocity=aim.multiplyScalar(ARCHER.speed);velocity.y-=9.81*dt;
 const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),velocity.normalize());
 const p=nock.clone().sub(new T.Vector3(0,.365*ARCHER.arrowScale,0).applyQuaternion(q)),local=new T.Matrix4().compose(p,q,new T.Vector3(1,ARCHER.arrowScale,1)),world=matrix.clone().multiply(local),head=new T.Vector3(0,-.37,0).applyMatrix4(world);
 const impact=state.flight!==null&&head.y<=height(head.x,head.z);
 return {matrix:world,head:head.toArray(),visible:state.flight!==null&&!impact,impact};
}
