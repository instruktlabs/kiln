import {createLandingTimeline} from './landing-timeline.mjs';
const ease=t=>t*t*t*(10+t*(-15+6*t));
// Smooth conservative max(value,0), easing the first hull-ground contact.
const positive=(value,band=.06)=>value<=-band?0:value>=band?value:(value+band)**2/(4*band);
export function createShipArrival({profile,queueDuration,landedAngle}){
 const {samples,contactPad,finalRaise}=profile;
 if(!Array.isArray(samples)||samples.length<2||!Number.isFinite(contactPad)||contactPad<0||!Number.isFinite(finalRaise)||finalRaise<=.06||samples.at(-1)[0]!==0||samples.some((p,i)=>p.length!==2||!p.every(Number.isFinite)||(i&&p[0]<=samples[i-1][0])))throw Error('Invalid arrival profile');
 const landing=createLandingTimeline({queueDuration,landedAngle}),arrivalDuration=42,duration=arrivalDuration+landing.duration;
 function height(z){let lo=0,hi=samples.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(samples[mid][0]<=z)lo=mid;else hi=mid;}const a=samples[lo],b=samples[hi],u=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return positive(a[1]+(b[1]-a[1])*u)+contactPad-finalRaise;}
 function sample(time){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid arrival time');
  const u=Math.max(0,Math.min(1,(time-12)/6)),rowingTime=time<=12?time:time<18?12+6*(u-u*u*u+.5*u*u*u*u):15;
  if(time<40){const z=samples[0][0]*(1-ease(time/40));return {phase:time<18?'rowing':'coasting',rowingTime,queueTime:0,plankAngle:Math.PI/2,offset:[0,height(z),z]};}
  if(time<42)return {phase:'settling',rowingTime,queueTime:0,plankAngle:Math.PI/2,offset:[0,contactPad*(1-ease((time-40)/2)),0]};
  return {...landing.sample(time-arrivalDuration),rowingTime,offset:[0,0,0]};
 }
 return {sample,duration,arrivalDuration};
}
