import {WATER_TIERS} from './water-quality.mjs';
import {groundHeight} from './layout.mjs';
export const WATER=Object.freeze({base:.065,swashBase:3,swashRange:10,swashSpeed:.65,filmLift:.018,waves:[{x:.031,z:.103,speed:1.026,amplitude:.42},{x:-.077,z:.158,speed:1.314,amplitude:.22},{x:.151,z:.097,speed:1.328,amplitude:.11},{x:-.218,z:.271,speed:1.85,amplitude:.065}]});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export const shoreFront=(x,t)=>WATER.swashBase+WATER.swashRange*(.5+.30*Math.sin(t*.57+Math.sin(x*.031)*1.8+Math.sin(x*.009)*.7)+.14*Math.sin(t*.913+x*.052+1.3)+.06*Math.sin(t*.283-x*.017+2.1));
export function shoreGround(z){const a=Math.floor(z/12.5)*12.5,f=(z-a)/12.5;return groundHeight(0,a)*(1-f)+groundHeight(0,a+12.5)*f;}
export function surfaceHeight(x,z,t){const fade=smooth(-650,-200,z)*(1-smooth(-22,0,z));return Math.max(WATER.base,shoreGround(Math.max(0,z))+WATER.filmLift)+WATER.waves.reduce((h,w)=>h+w.amplitude*Math.sin(x*w.x+z*w.z-t*w.speed),0)*fade;}
const span=(a,b,n)=>Array.from({length:n},(_,i)=>a+(b-a)*i/n);
export function waterGrid(tier='high',{extent=2600}={}){
 const q=WATER_TIERS[tier];if(!q)throw Error('Unknown water tier');
 if(!Number.isFinite(extent)||extent<2600)throw Error('Invalid ocean extent');
 const xs=[...span(-2600,-400,q.outer),...span(-400,400,q.center),...span(400,2600,q.outer),2600],zs=[...span(-3000,-400,q.far),...span(-400,-40,q.middle),...span(-40,20,q.shore),20];
 if(extent>3000){const outer=[4096,8192,extent].filter((x,i,a)=>x<extent||i===a.length-1).filter((x,i,a)=>x>3000&&(i===0||x>a[i-1]));xs.unshift(...outer.toReversed().map(x=>-x));xs.push(...outer);zs.unshift(...outer.toReversed().map(x=>-x));}
 return {xs,zs};
}
