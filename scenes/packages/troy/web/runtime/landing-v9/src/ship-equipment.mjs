import {createShipArrival} from './ship-arrival.mjs';
const ease=t=>t*t*t*(10+t*(-15+6*t));
// Optional folding-plank equipment timeline. Existing arrival and walking recipes
// retain their exact poses; unfolding adds four seconds while every crew stays seated.
export function createEquipmentArrival(options){
 const arrival=createShipArrival(options),unfoldDuration=4,start=arrival.arrivalDuration;
 function sample(time){
  if(!Number.isFinite(time)||time<0)throw Error('Invalid equipment time');
  if(time<start)return {...arrival.sample(time),plankFold:Math.PI,equipmentPhase:'stowed'};
  if(time<start+unfoldDuration)return {...arrival.sample(start),plankFold:Math.PI*(1-ease((time-start)/unfoldDuration)),equipmentPhase:'unfolding'};
  return {...arrival.sample(time-unfoldDuration),plankFold:0,equipmentPhase:'deployed'};
 }
 return {sample,duration:arrival.duration+unfoldDuration,arrivalDuration:start+unfoldDuration};
}
