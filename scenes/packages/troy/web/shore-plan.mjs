// These lateral copies require the qualified, X-invariant beach triangles.
// Do not reuse this route on arbitrary terrain without rebuilding foot plans.
export function createShoreRosters(ships){
 const recipes=[['ship-2-0',-234,Infinity],['ship-1-0',-174,210],['ship-2-1',-114,Infinity],['ship-1-1',-54,135],['ship-2-2',6,Infinity],['ship-1-2',66,0],['ship-2-3',126,Infinity],['ship-1-3',186,70]];
 return recipes.map(([id,x,initialTime])=>{if(!ships.some(s=>s.id===id))throw Error('Missing shore ship '+id);return {id,frame:{position:[x,0,3],yaw:-.65},initialTime};});
}
export function shoreTime(roster,time,duration){if(!Number.isFinite(time)||time<0||!Number.isFinite(duration)||duration<=0)throw Error('Invalid shore time');return Math.max(0,Math.min(duration,time+roster.initialTime));}
