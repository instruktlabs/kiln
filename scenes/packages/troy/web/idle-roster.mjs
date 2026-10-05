// Ship sequence time is clamped for equipment. Idle time keeps advancing after
// completion, and already-landed rosters begin at the end of their own sequence.
export function idleRoster(rosters,entries,time,sequenceDuration,queueDuration){
 if(!Number.isFinite(time)||time<0)throw Error('Invalid idle scene time');const start=sequenceDuration-queueDuration,active=[],poses=[];
 rosters.forEach((roster,ship)=>{const clock=(roster.initialTime===Infinity?sequenceDuration:roster.initialTime)+time;entries.forEach((entry,row)=>{const elapsed=clock-(start+entry.start+entry.duration);if(elapsed>=0){active.push(ship*entries.length+row);poses.push({id:roster.actorIds?.[entry.id]??roster.id+'/'+entry.id,clip:`idle-${entry.row}-${entry.side}`,time:elapsed,loop:true});}});});
 return {active,poses};
}
