// Stable source slots; a unit's clock continues independently after its march.
export function createFormationIdleRoster(units,clips){
 const ids=units.flatMap(u=>u.actors),clipById=new Map(clips.map(a=>[a.id,a.clip])),unitIds=new Set(units.map(u=>u.id));
 if(!ids.length||new Set(ids).size!==ids.length||unitIds.size!==units.length||clipById.size!==ids.length||ids.some(id=>!clipById.has(id))||clips.some(c=>typeof c.clip!=='string'||!c.clip))throw Error('Formation actor roster mismatch');
 const index=new Map(ids.map((id,i)=>[id,i]));
 function sample(states){if(!Array.isArray(states)||states.length!==units.length||new Set(states.map(s=>s.id)).size!==units.length||states.some(s=>!unitIds.has(s.id)||!['waiting','preparing','marching','formed'].includes(s.phase)||!Number.isFinite(s.localTime)||s.localTime<0))throw Error('Invalid formation state');const byId=new Map(states.map(s=>[s.id,s])),active=[],poses=[];
  for(const unit of units){const state=byId.get(unit.id);if(state.phase!=='formed')continue;for(const id of unit.actors){active.push(index.get(id));poses.push({id,clip:clipById.get(id),time:state.localTime,loop:true});}}
  return {active,poses};
 }
 return {sample};
}
