const ease=t=>t<=0?0:t>=1?1:t*t*t*(10+t*(-15+6*t));
const copy=f=>({position:[...f.position],yaw:f.yaw,...(f.normal?{normal:[...f.normal]}:{})});
// Pure consumer-side footprint sequence. World-space stance contacts never move.
// Caller supplies supported landings; this does not find collision-free routes.
export function createFootstepPlan({feet,steps,duration=.38,lift=.10,validateLanding=()=>true}){
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(lift)||lift<0)throw Error('Invalid step timing');
 const valid=f=>f&&f.position?.length===3&&f.position.every(Number.isFinite)&&Number.isFinite(f.yaw)&&(!f.normal||(f.normal.length===3&&f.normal.every(Number.isFinite)&&Math.abs(Math.hypot(...f.normal)-1)<1e-6));
 if(!valid(feet?.left)||!valid(feet?.right))throw Error('Invalid initial footprints');
 const initial={left:copy(feet.left),right:copy(feet.right)},segments=[];let current=initial;
 for(const step of steps){if(!['left','right'].includes(step.side)||!valid(step))throw Error('Invalid footprint');if(!validateLanding(step))throw Error('Unsupported footprint');const next={left:copy(current.left),right:copy(current.right)};next[step.side]=copy(step);segments.push({from:current,to:next,side:step.side});current=next;}
 function sample(time){if(!Number.isFinite(time)||time<0)throw Error('Invalid step time');if(!segments.length||time>=segments.length*duration||Math.floor(time/duration)>=segments.length)return {feet:{left:copy(current.left),right:copy(current.right)},swing:null,phase:1,complete:true,index:segments.length};
  const index=Math.floor(time/duration),segment=segments[index],phase=(time-index*duration)/duration,u=ease(phase),out={left:copy(segment.from.left),right:copy(segment.from.right)},a=segment.from[segment.side],b=segment.to[segment.side];out[segment.side]={position:a.position.map((v,i)=>v+(b.position[i]-v)*u+(i===1?lift*Math.sin(Math.PI*phase)**2:0)),yaw:a.yaw+(b.yaw-a.yaw)*u};if(a.normal||b.normal){const na=a.normal||[0,1,0],nb=b.normal||[0,1,0],n=na.map((v,i)=>v+(nb[i]-v)*u),len=Math.hypot(...n);out[segment.side].normal=n.map(v=>v/len);}return {feet:out,swing:segment.side,phase,complete:false,index};
 }
 return {sample,duration:segments.length*duration,segments};
}
