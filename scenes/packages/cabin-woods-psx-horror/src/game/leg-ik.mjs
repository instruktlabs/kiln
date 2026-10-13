const add=(a,b)=>a.map((x,i)=>x+b[i]);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const scale=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a);
const unit=(a,fallback)=>length(a)>1e-8?scale(a,1/length(a)):fallback;

/** Solve in the authored root frame, preserving its bend plane and segment lengths. */
export function solveLeg(hip,restKnee,restFoot,target){
 for(const value of [...hip,...restKnee,...restFoot,...target])if(!Number.isFinite(value))throw Error('Finite leg coordinates required');
 const upper=sub(restKnee,hip),lower=sub(restFoot,restKnee),a=length(upper),b=length(lower);
 if(a<1e-5||b<1e-5)throw Error('Nonzero leg segments required');
 const requested=sub(target,hip),requestedDistance=length(requested),direction=unit(requested,unit(sub(restFoot,hip),[1,0,0]));
 const distance=Math.max(Math.abs(a-b)+1e-6,Math.min(a+b-1e-6,requestedDistance));
 const normal=unit(cross(upper,lower),unit(cross(direction,[0,1,0]),[0,0,1]));
 const bend=unit(cross(direction,normal),unit(sub(upper,scale(direction,dot(upper,direction))),[0,1,0]));
 const along=(a*a+distance*distance-b*b)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 const knee=add(hip,add(scale(direction,along),scale(bend,height))),foot=add(hip,scale(direction,distance));
 return {knee,foot,reachable:Math.abs(distance-requestedDistance)<1e-5,error:Math.abs(distance-requestedDistance),upperLength:a,lowerLength:b};
}

/** Alternating support sets; a planted half-cycle stays fixed while the other lifts. */
export function stepTarget(restFoot,phase,stride=.1,lift=.055){
 const t=((phase%1)+1)%1;
 if(t<.5)return [restFoot[0]+stride*(.5-2*t),restFoot[1],restFoot[2]];
 const swing=(t-.5)*2;return [restFoot[0]+stride*(-.5+swing),restFoot[1]+Math.sin(swing*Math.PI)*lift,restFoot[2]];
}
