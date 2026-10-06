// Scene-only kinematic bend. Preserve a braced half-string length while changing
// the limb arc, without claiming an elastic-material or force simulation.
export function bowBend(draw,{limb=.585,brace=.092,travel=.775}={}){
 if(!Number.isFinite(draw)||draw<0||draw>1||![limb,brace,travel].every(Number.isFinite)||limb<=0||brace<0||travel<=0||travel>=limb*(1+2/Math.PI))throw Error('Invalid bow bend');
 const point=(y,angle)=>{const t=angle*y/limb;return Math.abs(t)<1e-5?{y:y*(1-t*t/6),z:-y*t/2*(1-t*t/12)}:{y:y*Math.sin(t)/t,z:y*(Math.cos(t)-1)/t};};
 let angle=0;if(draw>0){let lo=0,hi=Math.PI;for(let i=0;i<40;i++){const mid=(lo+hi)/2,p=point(limb,mid);if(Math.hypot(p.y,p.z+travel*draw)>limb)lo=mid;else hi=mid;}angle=(lo+hi)/2;}
 const tip=point(limb,angle);return {angle,tipY:tip.y,tipZ:tip.z-brace,point:y=>point(y,angle)};
}
