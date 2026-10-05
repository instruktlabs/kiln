// Scene-owned blockout in metres; saved asset geometry remains untouched.
import {ARCHER} from './archer-config.mjs';
export const WALL_Z=360, CITY_HALF_WIDTH=189, HERO_Z=250;
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function groundHeight(x,z){
 if(z<0)return Math.max(-16,z*.085);
 const beach=15*smooth(0,WALL_Z,z);
 const city=48*smooth(400,690,z)*Math.exp(-Math.pow(x/240,2));
 return beach+city;
}
export const views={
 arrival:{label:'Sea approach',position:[-210,155,-300],target:[0,25,285]},
 shoreline:{label:'Shoreline',position:[210,6,-14],target:[225,0,7]},
 beach:{label:'Beach',position:[-92,7,35],target:[0,30,365]},
 heroes:{label:'Face-off',position:[15,19,233],target:[0,17,253]},
 wall:{label:'Wall walk',position:[-58,40,357],target:[0,6,115]},
 city:{label:'Inside Troy',position:[-65,88,485],target:[18,50,600]},
 aerial:{label:'Aerial layout',position:[-395,440,450],target:[0,12,335]},
 courtyard:{label:'Courtyard',position:[76,19.5,430],target:[64,20,445]},
};
export function createLayout({archers=false}={}){
 const walls=[],buildings=[],plants=[],actors=[],ships=[],heroes=[];
 const put=(into,id,asset,x,z,extra={})=>{const p={id,asset,position:[x,groundHeight(x,z),z],yaw:0,scale:1,...extra};into.push(p);return p;};
 for(let x=-180;x<=180;x+=18)if(x!==0)put(walls,`front-${x}`,'wall-section',x,WALL_Z,{scale:3,yaw:archers?Math.PI:0});
 put(walls,'gate','city-gate',0,WALL_Z,{scale:3});
 for(let z=369;z<=693;z+=18)for(const side of [-1,1])put(walls,`side-${side}-${z}`,'wall-section',side*CITY_HALF_WIDTH,z,{scale:3,yaw:side*Math.PI/2});
 for(let x=-180;x<=180;x+=18)put(walls,`rear-${x}`,'wall-section',x,702,{scale:3,yaw:Math.PI});
 const courtyards=[[-65,445],[65,445],[-105,529],[105,529],[-65,613],[65,613]];
 for(let row=0;row<24;row++)for(let col=0;col<28;col++){
  const x=(col-13.5)*12,z=393+row*12;
  if(Math.abs(x)<15||(Math.abs(x)<43&&z>590))continue;
  if(courtyards.some(([cx,cz])=>Math.abs(x-cx)<17&&Math.abs(z-cz)<17))continue;
  put(buildings,`house-${row}-${col}`,'house',x,z,{scale:1.18+((row*7+col*3)%5)*.035,yaw:(row+col)%2?Math.PI:0});
 }
 put(buildings,'citadel','temple-hall',0,650,{scale:3,yaw:Math.PI});
 courtyards.forEach(([x,z],i)=>{for(let n=0;n<5;n++)put(plants,`courtyard-${i}-${n}`,['olive','fig','cypress','shrub','shrub'][n],x+[-5,6,-6,5,0][n],z+[-3,3,7,-7,0][n]);});
 for(let row=0;row<22;row++)for(const side of [-1,1])put(plants,`avenue-${row}-${side}`,row%3===0?'cypress':'shrub',side*12,405+row*9);
 for(const [faction,rows,width,zs] of [['greek',4,8,[147,181]],['trojan',4,6,[302,326]]]){
  for(const z of zs)for(const x of [-64,0,64])for(let r=0;r<rows;r++)for(let c=0;c<width;c++)put(actors,`${faction}-${z}-${x}-${r}-${c}`,`${faction}-soldier`,x+(c-(width-1)/2)*1.8,z+r*2.1,{faction,state:'formation',yaw:faction==='greek'?0:Math.PI});
 }
 for(let group=0;group<6;group++)for(let i=0;i<8;i++)put(actors,`staging-${group}-${i}`,'greek-soldier',[-132,-106,-80,80,106,132][group]+(i%4)*1.8,71+Math.floor(i/4)*2,{faction:'greek',state:'staging'});
 for(let stage=0;stage<3;stage++)for(let i=0;i<4;i++){
  const x=[-117,-39,39,117][i]+(stage===1?15:0),z=[-105,-7,28][stage];
  const ship=put(ships,`ship-${stage}-${i}`,'war-galley',x,z,{position:[x,stage===2?groundHeight(x,z)-.5:-1.65,z],scale:1.6,state:['approaching','unloading','beached'][stage],yaw:stage===2?.12:0});
  if(stage===0)for(let n=0;n<6;n++)put(actors,`aboard-${i}-${n}`,'greek-soldier',x+(n%2?1:-1),z+Math.floor(n/2)*2-2,{position:[x+(n%2?1:-1),1.5,z+Math.floor(n/2)*2-2],faction:'greek',state:'aboard',shipId:ship.id});
  if(stage===1)for(let n=0;n<6;n++)put(actors,`unloading-${i}-${n}`,'greek-soldier',x+7+(n%2)*1.8,27+Math.floor(n/2)*2,{faction:'greek',state:'unloading',shipId:ship.id});
 }
 if(archers)actors.push(...archerPlacements());else for(let i=0;i<48;i++){
  const x=i<24?-178+i*6.7:24+(i-24)*6.7;
  put(actors,`wall-guard-${i}`,'trojan-soldier',x,WALL_Z+.7,{position:[x,groundHeight(x,WALL_Z)+6.6*3,WALL_Z+.7],yaw:Math.PI,faction:'trojan',state:'archer-placeholder'});
 }
 put(heroes,'achilles','achilles',0,HERO_Z-5);
 put(heroes,'hector','hector',0,HERO_Z+5,{yaw:Math.PI});
 return {walls,buildings,plants,actors,ships,heroes};
}
export function archerPlacements(){
 const out=[];
 for(const side of [-1,1]){
  const modules=Array.from({length:10},(_,i)=>side*(18+i*18)).sort((a,b)=>a-b),slots=modules.flatMap(x=>[-6,0,6].map(dx=>({x:x+dx,module:x,offset:dx})));
  for(let i=0;i<24;i++){const slot=slots[Math.floor((i+.5)*slots.length/24)],index=(side<0?0:24)+i;out.push({id:`wall-guard-${index}`,asset:'trojan-soldier',faction:'trojan',state:'archer',position:[slot.x,groundHeight(slot.x,WALL_Z)+ARCHER.wallWalkHeight,WALL_Z-.8],yaw:Math.PI/2,scale:1,phaseOffset:(index%8)*ARCHER.duration/8,module:slot.module,gapOffset:slot.offset});}
 }
 return out;
}
