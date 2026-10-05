import {createFootstepPlan} from './footstep-plan.mjs';

// Experimental consumer planner. The injected finder owns surface support;
// this builder only places alternating contacts along supplied route segments.
export function createTravelFootprints({position,yaw,find,stepLength=.28,width=.19}){
 if(!position?.every(Number.isFinite)||position.length!==2||!Number.isFinite(yaw)||typeof find!=='function'||!Number.isFinite(stepLength)||stepLength<=0||!Number.isFinite(width)||width<=0)throw Error('Invalid travel footprints');
 let current=[...position],heading=yaw,next='left';const steps=[];
 const foot=(side,x,z,h)=>{const offset=(side==='left'?1:-1)*width/2;steps.push(find(side,x+Math.cos(h)*offset,z-Math.sin(h)*offset,h));};
 function pair(x,z,h){foot(next,x,z,h);next=next==='left'?'right':'left';foot(next,x,z,h);next=next==='left'?'right':'left';}
 function turn(h){if(!Number.isFinite(h))throw Error('Invalid heading');let delta=h-heading;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;const n=Math.ceil(Math.abs(delta)/(Math.PI/6)),from=heading;for(let i=1;i<=n;i++)pair(...current,from+delta*i/n);heading=from+delta;}
 function move(x,z){if(![x,z].every(Number.isFinite))throw Error('Invalid destination');const from=current,d=Math.hypot(x-from[0],z-from[1]);if(d<1e-8)return;turn(Math.atan2(x-from[0],z-from[1]));const n=Math.ceil(d/stepLength-1e-10);for(let i=1;i<=n;i++){foot(next,from[0]+(x-from[0])*i/n,from[1]+(z-from[1])*i/n,heading);next=next==='left'?'right':'left';}foot(next,x,z,heading);next=next==='left'?'right':'left';current=[x,z];}
 return {steps,move,turn,get position(){return [...current];}};
}

// Monotone cubic centre motion keeps forward velocity through foot exchanges.
// Extrema/corners and the ends have zero tangents to avoid route overshoot.
export function createTravelPlan(options){
 const plan=createFootstepPlan(options),duration=options.duration??.38,mean=f=>f.left.position.map((v,i)=>(v+f.right.position[i])/2),points=plan.segments.length?[mean(plan.segments[0].from),...plan.segments.map(s=>mean(s.to))]:[mean(options.feet)];
 const tangents=points.map((p,i)=>p.map((v,a)=>{if(i===0||i===points.length-1)return 0;const before=v-points[i-1][a],after=points[i+1][a]-v;return before*after>0?2*before*after/(before+after):0;}));
 return {...plan,sample(time){const s=plan.sample(time);if(s.complete)return {...s,bodyCenter:[...points.at(-1)]};const i=s.index,u=s.phase,u2=u*u,u3=u2*u;return {...s,bodyCenter:points[i].map((v,a)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*tangents[i][a]+(-2*u3+3*u2)*points[i+1][a]+(u3-u2)*tangents[i+1][a])};},stepDuration:duration};
}
