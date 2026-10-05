const sub=(a,b)=>a.map((v,i)=>v-b[i]),add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),length=a=>Math.hypot(...a);
export function solveTwoBone({origin,target,pole,upper,lower}){
 if(![origin,target,pole].every(a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite))||![upper,lower].every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid two-bone input');
 const delta=sub(target,origin),distance=length(delta);if(distance<=Math.abs(upper-lower)+1e-8||distance>=upper+lower-1e-8)throw Error('Target outside reachable limb range');
 const axis=mul(delta,1/distance);let bend=sub(pole,mul(axis,dot(pole,axis)));
 if(length(bend)<1e-8){const fallback=Math.abs(axis[2])<.9?[0,0,1]:[1,0,0];bend=sub(fallback,mul(axis,dot(fallback,axis)));}bend=mul(bend,1/length(bend));
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 return {knee:add(origin,add(mul(axis,along),mul(bend,height))),distance};
}
