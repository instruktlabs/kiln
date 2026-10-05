// Scene-owned translations of pinned beach paths. This does not authorize
// different terrain, headings, height offsets or arbitrary navigation.
const recipes=[['ship-0-0','ship-2-0',-234,-120],['ship-0-1','ship-1-0',-174,-120],['ship-0-2','ship-2-3',126,120],['ship-0-3','ship-1-3',186,120]];
export function createLateRegroupRecord(record,rosters){
 if(record?.schema!=='troy.packed-regroup/1'||!Array.isArray(record.units)||record.units.length!==8||new Set(record.units.map(u=>u.id)).size!==8||!Array.isArray(rosters)||rosters.length!==4||new Set(rosters.map(r=>r.id)).size!==4)throw Error('Late regroup requires the pinned early routes and four later ships');
 const units=recipes.map(([id,sourceUnitId,sourceX,dx],i)=>{
  const source=record.units.find(u=>u.id===sourceUnitId),roster=rosters.find(r=>r.id===id),frameValid=(f,x)=>f?.yaw===-.65&&f.position?.length===3&&f.position[0]===x&&f.position[1]===0&&f.position[2]===3;
  if(!source||!roster||!frameValid(source.frame,sourceX)||!frameValid(roster.frame,sourceX+dx)||roster.initialTime!==-i*6||source.routes?.length!==28||new Set(source.routes.map(r=>r.id)).size!==28||new Set(Object.values(roster.actorIds??{})).size!==28||source.routes.some(r=>!roster.actorIds[r.id]||typeof r.planId!=='string'||!r.planId.startsWith(sourceUnitId+'/')||r.targetWorld?.length!==3||!r.targetWorld.every(Number.isFinite)))throw Error('Late regroup frame, clock or actor provenance mismatch');
  const unit=structuredClone(source);unit.id=id;unit.sourceUnitId=sourceUnitId;unit.frame=structuredClone(roster.frame);unit.initialTime=roster.initialTime;unit.targetCenter=[source.targetCenter[0]+dx,source.targetCenter[1]];unit.derivation={kind:'world-x-translation-on-qualified-beach',worldTranslation:[dx,0,0],sourceUnitId};
  for(const route of unit.routes)route.targetWorld[0]+=dx;
  return unit;
 });
 return {...structuredClone(record),units,scope:'Four later112-crew flank reserves reuse unchanged local packed footprints at +/-120m world-X translations, with original offshore identities and delayed landing clocks. Current terrain, spacing, gait, runtime and owner qualification are separate checks.'};
}
