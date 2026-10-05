import {createCrewTravelPlayback} from '../crew-v2/crew-travel-playback.mjs';import {createTravelPlan} from '../landing-v10/src/travel-footprints.mjs';import {applyTravelClearance} from '../landing-v10/web/crew-travel-clearance.mjs';
// The caller supplies the supported completed shore stance before construction.
export function createCrewMarch(T,{root,id,plan,travelPlan}){const travel=createCrewTravelPlayback(T,{root,id,plan:travelPlan??createTravelPlan(plan)});return {...travel,sample(time){const state=travel.sample(time);applyTravelClearance(T,root,1);return state;}};}
