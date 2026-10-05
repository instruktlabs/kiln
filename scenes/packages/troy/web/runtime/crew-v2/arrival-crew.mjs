import {createRowingCrew} from '../landing-v10/web/rowing-crew.mjs';
import {createCrewTravelUnload} from './crew-travel-unload.mjs';

// One pose owner per persistent actor. The rendering parent owns ship travel;
// all contact solving stays in the already-qualified local landing frame.
export function createArrivalCrew(T,{ship,human,data}){
 const actors=data.actors.map(entry=>{
  const root=human.clone(true),actor=createCrewTravelUnload(T,{root,ship,surfaces:[],row:entry.row,side:entry.side,id:entry.id,staging:entry.staging,cachedPlan:entry.plan,finalHeading:data.finalHeading??0});
  if(Math.abs(actor.duration-entry.duration)>1e-6)throw Error('Arrival actor duration mismatch');
  const rower=createRowingCrew(T,{ship,root,row:entry.row,side:entry.side});
  return {entry,root,actor,rower,last:null,state:null};
 });
 function update(sequence){
  const arriving=['rowing','coasting','settling'].includes(sequence.phase),counts={rowing:0,waiting:0,standing:0,aisle:0,walking:0,ashore:0},dirty=[];
  for(let i=0;i<actors.length;i++){
   const a=actors[i],local=Math.max(0,Math.min(a.actor.duration,sequence.queueTime-a.entry.start)),key=arriving?'rowing:'+sequence.rowingTime:'unload:'+local;
   if(key!==a.last){a.state=arriving?a.rower.update(sequence.rowingTime):a.actor.sample(local);a.last=key;dirty.push(i);}
   const stage=arriving?(sequence.phase==='rowing'?'rowing':'waiting'):sequence.phase==='lowering'||sequence.queueTime<a.entry.start?'waiting':local<=3.6?'standing':local<a.actor.walkStart?'aisle':local<a.actor.duration?'walking':'ashore';counts[stage]++;
  }
  return {dirty,counts};
 }
 return {actors,update};
}
