// Scene-owned staging plan. Offshore ships stop outside the active landing lane;
// their future beaching/unloading routes are separate from this approach segment.
export function createFleetRosters(ships){
 return ships.filter(s=>s.state==='approaching').map((s,i)=>({id:s.id,delay:i*4,position:[s.position[0],-1.65,-185],endZ:-105,yaw:0,crew:Array.from({length:14},(_,row)=>[-1,1].map(side=>({id:`${s.id}/row-${row}/${side}`,row,side,clip:`row-${row}-${side}`}))).flat()}));
}
export function sampleFleetShip(ship,time){
 if(!Number.isFinite(time)||time<0)throw Error('Invalid fleet time');
 const t=Math.max(0,Math.min(180,time-ship.delay));let rowingTime;
 if(t<6)rowingTime=t/2-3/Math.PI*Math.sin(Math.PI*t/6);
 else if(t<174)rowingTime=t-3;
 else{const u=t-174;rowingTime=171+u/2+3/Math.PI*Math.sin(Math.PI*u/6);}
 return {position:[ship.position[0],ship.position[1],ship.position[2]+(ship.endZ-ship.position[2])*rowingTime/174],yaw:ship.yaw,rowingTime,state:t===180?'holding-offshore':t===0?'waiting-offshore':'rowing'};
}
