// Conservative geometric eligibility for this experimental shared gait approximation.
// Turns, endpoint acceleration, shortened steps and steeper ground keep exact poses.
export function steadyStepMask(plan,{stride=.34,strideTolerance=.006,maxSlope=.07,yawTolerance=1e-6}={}){
 if(!Array.isArray(plan?.steps)||![stride,strideTolerance,maxSlope,yawTolerance].every(Number.isFinite)||stride<=0||strideTolerance<0||maxSlope<0||yawTolerance<0)throw Error('Invalid steady step policy');
 const mask=new Uint8Array(plan.steps.length),valid=s=>s&&['left','right'].includes(s.side)&&s.position?.length===3&&s.position.every(Number.isFinite)&&Number.isFinite(s.yaw)&&s.normal?.length===3&&s.normal.every(Number.isFinite)&&Math.abs(Math.hypot(...s.normal)-1)<1e-6;
 for(let i=3;i<plan.steps.length-3;i++){const window=plan.steps.slice(i-3,i+3),yaw=window[0].yaw;if(!window.every(s=>valid(s)&&Math.abs(s.yaw-yaw)<=yawTolerance&&s.normal[1]>=Math.cos(maxSlope)))continue;let eligible=true;
  for(let j=1;j<window.length;j++){const a=window[j-1],b=window[j],forward=(b.position[0]-a.position[0])*Math.sin(yaw)+(b.position[2]-a.position[2])*Math.cos(yaw);if(a.side===b.side||Math.abs(forward-stride)>strideTolerance)eligible=false;}
  if(eligible)mask[i]=1;
 }
 return mask;
}
// A division at an exact step boundary can yield phase=1+one ULP. Preserve
// the continuous endpoint without accepting a genuinely out-of-range phase.
export function steadyCycleTime({swing,phase},stepDuration=.34){
 if(!['left','right'].includes(swing)||!Number.isFinite(phase)||phase< -1e-12||phase>1+1e-12||!Number.isFinite(stepDuration)||stepDuration<=0)throw Error('Invalid steady cycle phase');
 return ((swing==='right'?1:0)+Math.max(0,Math.min(1,phase)))*stepDuration;
}
