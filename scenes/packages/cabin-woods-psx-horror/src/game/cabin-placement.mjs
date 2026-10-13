import {CABIN_PLAN} from './cabin-plan.mjs';
export {CABIN_PLAN};
/** Plan right is +Z; down toward the front porch is +X. */
export const planPoint=(u,v,height=0)=>[v-CABIN_PLAN.footprint.depth/2,height,u-CABIN_PLAN.footprint.width/2];
export const footprintCenter=item=>planPoint(item.u+item.w/2,item.v+item.d/2,item.height??0);
export function footprintTransform(item,bounds,rotationY=0){
 const center=bounds.min.map((v,i)=>(v+bounds.max[i])/2),size=bounds.min.map((v,i)=>bounds.max[i]-v),c=Math.cos(rotationY),s=Math.sin(rotationY);
 const target=footprintCenter(item),offsetX=c*center[0]+s*center[2],offsetZ=-s*center[0]+c*center[2];
 return {position:[target[0]-offsetX,(item.height??0)-bounds.min[1],target[2]-offsetZ],rotationY,scale:1,size:[Math.abs(c)*size[0]+Math.abs(s)*size[2],size[1],Math.abs(s)*size[0]+Math.abs(c)*size[2]]};
}
const furniture={
 H1:['hearth','fire',-Math.PI/2,'fire','Add firewood'],B1:['bench','hearth-bench',Math.PI/2],B2:['bench','tv-bench',0],T1:['table','tvStand',0],T2:['diningTable','dining-table',0],
 C1:['diningChair','chair-1',0],C2:['diningChair','chair-2',0],C3:['diningChair','chair-3',Math.PI],C4:['diningChair','chair-4',Math.PI],
 S1:['bed','bed',Math.PI/2],S2:['bedroomCabinet','bedroom-cabinet',0],K1:['kitchenWorktop','kitchen-worktop',Math.PI/2],K2:['kitchenCupboard','kitchen-cupboard',Math.PI],
 R1:['woodStorage','storage',Math.PI,'storage','Store wood / take supplies'],R2:['plankReserve','plank-reserve',Math.PI],R3:['supplyChest','supply-chest',0],R4:['tallCabinet','tall-cabinet',Math.PI/2],
 O1:['choppingBlock','chop',0,'chop','Split a log into firewood'],O2:['sawingStation','saw',Math.PI/2,'saw','Saw a log into boards'],O3:['incomingLogPile','incoming-log-pile',0]
};
export function furnitureDefinitions(){return CABIN_PLAN.items.map(item=>{const [key,id,rotationY,kind,label]=furniture[item.id],dining=['T2','C1','C2','C3','C4'].includes(item.id),deltaU=dining?-.35:item.id==='S1'?.5:0;return {...item,u:item.u+deltaU,fitAdjustment:deltaU?{deltaU,reason:dining?'Keep the occupied player capsule clear of the front doorway center route':'Clear the bedroom door leaf and occupied turning route; retain a15cm gap at the head wall'}:null,planId:item.id,key,id,rotationY,solid:true,interaction:kind?{kind,id,label}:null};});}
const quaternion=yaw=>[0,Math.sin(yaw/2),0,Math.cos(yaw/2)];
export function doorDefinitions(){return CABIN_PLAN.doors.map(d=>{
 const id={D1:'front_door_mount',D2:'bedroom_door_mount',D3:'utility_door_mount',D4:'workyard_door_mount'}[d.id],position=planPoint(d.u+(d.axis==='u'?d.w/2:0),d.v+(d.axis==='v'?d.w/2:0));
 if(d.id==='D1')position[0]-=.1;if(d.id==='D4')position[2]-=.1;
 const rotationY=d.axis==='u'?0:Math.PI/2;
 return {id,planId:d.id,position,quaternion:quaternion(rotationY),key:['D2','D3'].includes(d.id)?'interiorDoor':'door',openAngleDegrees:-95};
});}
export function windowDefinitions(){return CABIN_PLAN.windows.map(w=>{
 const position=planPoint(w.u+(w.axis==='u'?w.w/2:0),w.v+(w.axis==='v'?w.w/2:0),.95);let rotationY;
 if(w.axis==='u'){position[0]+=w.v===0?.1:-.1;rotationY=w.v===0?Math.PI:0;}
 else{position[2]+=w.u===0?.1:-.1;rotationY=w.u===0?Math.PI/2:-Math.PI/2;}
 return {id:`window_${w.id.toLowerCase()}_mount`,planId:w.id,position,quaternion:quaternion(rotationY),clearWidth:w.w};
});}
export function wallDressingDefinitions(){return CABIN_PLAN.wallDressings.map(d=>{
 const key={M1:'deerMount',M2:'deerMount',P1:'picture',P2:'picture',A1:'mapCoatHooks',A2:'toolRack'}[d.id];
 const rotationY=['M1','P1','P2'].includes(d.id)?-Math.PI/2:d.id==='A1'?Math.PI:0;
 const mountOverride=d.id==='A1'?{translation:[4.8,1.55,1.45],reason:'Owner feedback: move the map and coat hooks onto the wall beside the entrance, clear of its trim and swing'}:null;
 return {...d,key,id:`dressing-${d.id}`,position:planPoint(d.u,d.v,d.id.startsWith('M')?1.45:1.65),rotationY,mountOverride,solid:false};
});}
export const CABIN_BOUNDS={minX:-CABIN_PLAN.footprint.depth/2,maxX:CABIN_PLAN.footprint.depth/2,minZ:-CABIN_PLAN.footprint.width/2,maxZ:CABIN_PLAN.footprint.width/2,floorY:0};
const reservations=[{minX:-5.9,maxX:5.9,minZ:-6.9,maxZ:6.9},{minX:4.8,maxX:7.8,minZ:-6.8,maxZ:2.8},{minX:-1.9,maxX:7,minZ:5.8,maxZ:12.5}];
export function insideCabinReservation(position){return reservations.some(b=>position[0]>=b.minX&&position[0]<=b.maxX&&position[2]>=b.minZ&&position[2]<=b.maxZ);}
