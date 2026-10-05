import {ARCHER} from './archer-config.mjs';
export {ARCHER} from './archer-config.mjs';
export {archerPlacements} from './layout.mjs';
export function resolveArcherMode(value){const mode=value||'packed';if(!['off','reference','cpu','packed'].includes(mode))throw Error('Invalid archer mode');return mode;}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function archerPhase(time,offset=0){
 if(![time,offset].every(Number.isFinite))throw Error('Finite archer time required');
 const phase=((time+offset)%ARCHER.duration+ARCHER.duration)%ARCHER.duration;
 const raised=smooth(1.5,2.5,phase)*(1-smooth(7.4,8.5,phase)),draw=smooth(3,4,phase)*(1-smooth(5,5.18,phase));
 const stage=phase<1?'idle':phase<1.5?'retrieve':phase<2.5?'nock':phase<4?'draw':phase<5?'aim':phase<7.4?'release':'recover';
 return {phase,stage,raised,draw,flight:phase>=ARCHER.release?phase-ARCHER.release:null,heldArrow:phase>=1.5&&phase<ARCHER.release};
}
export function wallCoverMatrix(T,node,placement){
 const p=new T.Vector3(...placement.position),q=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),placement.yaw),scale=new T.Vector3(placement.scale,placement.scale,placement.scale);
 const isCover=/Mesh_(ParapetBase|Merlon_|InnerCurb)/.test(node.name);
 if(!isCover)return new T.Matrix4().compose(p,q,scale).multiply(node.matrixWorld);
 // Scale cover around the exact walkway, rather than tripling human cover height.
 const local=node.matrixWorld.clone(),pivot=new T.Matrix4().makeTranslation(0,6.6,0),unpivot=new T.Matrix4().makeTranslation(0,-6.6,0),vertical=new T.Matrix4().makeScale(1,ARCHER.coverScaleY/placement.scale,1);
 return new T.Matrix4().compose(p,q,scale).multiply(pivot).multiply(vertical).multiply(unpivot).multiply(local);
}
