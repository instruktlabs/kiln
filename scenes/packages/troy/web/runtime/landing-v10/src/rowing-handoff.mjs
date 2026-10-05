// Renderer ownership is separate from actor identity. Invalidate CPU caches when
// returning from a bake: the shared oars may have changed while CPU actors slept.
export function createRowingHandoff({actors,updateCpu,updateOars,updateGpu}){
 let owner=null;
 return {update(sequence){
  const next=['rowing','coasting','settling'].includes(sequence.phase)?'gpu':'cpu';
  if(next==='gpu'){
   updateOars(sequence.rowingTime);
   updateGpu(actors.map(a=>({id:a.entry.id,clip:`row-${a.entry.row}-${a.entry.side}`,time:sequence.rowingTime,loop:true})));
   owner=next;return {owner,dirty:[],rigEvaluations:0,counts:{rowing:sequence.phase==='rowing'?actors.length:0,waiting:sequence.phase==='rowing'?0:actors.length,standing:0,aisle:0,walking:0,ashore:0}};
  }
  if(owner!=='cpu')for(const a of actors)a.last=null;
  owner=next;const result=updateCpu(sequence);return {...result,owner,rigEvaluations:result.dirty.length};
 }};
}
