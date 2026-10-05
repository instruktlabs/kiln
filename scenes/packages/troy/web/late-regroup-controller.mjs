import {createRegroupController} from './runtime/regroup-block-v1/controller.mjs';
// Keep the pinned generator/controller intact. Its non-negative clocks express
// later queues as extended holds; posing still reads the real signed ship clock.
export function createLateRegroupController(T,args){
 const {ships,record}=args;
 if(ships.length!==record.units.length||ships.some(s=>{const u=record.units.find(u=>u.id===s.roster.id);return !u||!Number.isFinite(u.initialTime)||u.initialTime>0||s.roster.initialTime!==u.initialTime;}))throw Error('Late regroup landing clock mismatch');
 const normalized={...record,units:record.units.map(u=>({...u,initialTime:0,holdDuration:u.holdDuration-u.initialTime}))};
 return createRegroupController(T,{...args,record:normalized,ships:ships.map(s=>({...s,roster:{...s.roster,initialTime:0}}))});
}
