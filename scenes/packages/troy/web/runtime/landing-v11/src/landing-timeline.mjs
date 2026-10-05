// Kinematic timing only: equipment handling/rope forces are separate work.
export function createLandingTimeline({queueDuration,landedAngle,loweringDuration=6}){
 if(!Number.isFinite(queueDuration)||queueDuration<=0||!Number.isFinite(landedAngle)||!Number.isFinite(loweringDuration)||loweringDuration<=0)throw Error('Invalid landing timeline');
 const duration=queueDuration+loweringDuration;
 return {duration,sample(time){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid landing time');
  if(time<loweringDuration){const u=time/loweringDuration,s=u*u*(3-2*u);return {phase:'lowering',queueTime:0,plankAngle:Math.PI/2+(landedAngle-Math.PI/2)*s};}
  return {phase:time>=duration?'ashore':'unloading',queueTime:Math.min(time-loweringDuration,queueDuration),plankAngle:landedAngle};
 }};
}
