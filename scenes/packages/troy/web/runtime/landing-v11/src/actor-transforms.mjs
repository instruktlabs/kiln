import {validateActors} from './bake-intake.mjs';
// Adapter-owned records isolate caller mutations. A patch batch is atomic at intake.
export function createActorTransformState(input){
 validateActors(input);const actors=input.map(a=>({...a,matrix:a.matrix.clone()})),index=new Map(actors.map((a,i)=>[a.id,i]));
 return {actors,update(patches){
  if(!Array.isArray(patches)||patches.length>actors.length)throw Error('Invalid actor identity patch batch');
  if(!patches.length)return [];
  const next=patches.map(p=>{const i=index.get(p.id);if(i===undefined)throw Error('Unknown actor identity');return {...actors[i],matrix:p.matrix};});
  validateActors(next);const owned=next.map(a=>({...a,matrix:a.matrix.clone()})),indices=owned.map(a=>index.get(a.id));
  owned.forEach((a,j)=>actors[indices[j]].matrix.copy(a.matrix));return indices;
 }};
}
