import {CABIN_BOUNDS,footprintCenter,furnitureDefinitions,doorDefinitions,windowDefinitions,planPoint} from './cabin-placement.mjs';
import {createForestLayout} from './forest-layout.mjs';
/** Consuming scene placements. Units and local interfaces remain in each saved asset. */
export const CABIN=CABIN_BOUNDS;
export const START=[6.5,0,.05];
// Optional inspection starts. Moving here does not grant items or complete an interaction.
// The authored eye is ahead of the feet origin. Aim review views from that eye.
export function reviewViewPose(view,position){const dx=view.target[0]-position[0],dz=view.target[2]-position[2];return {heading:Math.atan2(dz,dx),pitch:Math.atan2(view.target[1]-1.61,Math.max(.01,Math.hypot(dx,dz)))};}
export const REVIEW_VIEWS={
 porch:{label:'Front porch',position:START,target:[0,1.6,.05]},
 entry:{label:'Front door wall dressing',position:[3.6,0,.8],target:[4.8,1.55,1.45]},
 workyardDoor:{label:'Workyard door and torch bracket',position:[2.7,0,8],target:[1.1,1.55,6]},
 living:{label:'Open living room',position:planPoint(4,5.8),target:planPoint(1,4.8,1.4)},
 dining:{label:'Dining area',position:planPoint(6.9,8.5),target:planPoint(5.3,7.5,1)},
 bedroom:{label:'Bedroom',position:planPoint(9.2,1.3),target:planPoint(10.7,3.35,.8)},
 kitchen:{label:'Kitchen',position:planPoint(9.6,8.5),target:planPoint(11.45,8.6,1)},
 tree:{label:'Harvest pine',position:[12.2,0,-8],target:[13,1.61,-8]},
 forest:{label:'Mixed forest edge',position:[12,0,-3.6],target:[22,2.6,-15]},
 chopping:{label:'Chopping block',position:planPoint(14.8,4.8),target:planPoint(14.8,5.5,.75)},
 sawing:{label:'Sawing station',position:planPoint(12.8,8.505),target:planPoint(14.1,8.505,.95)},
 storage:{label:'Supply room and wood rack',position:planPoint(10,5.65),target:planPoint(11.1075,6.585,.65)},
 hearth:{label:'Hearth',position:planPoint(1.85,4.82),target:planPoint(.67,4.82,.65)},
 television:{label:'Television',position:planPoint(1.05,7.55),target:planPoint(1.05,9.225,1.15)},
 window:{label:'Window and boards',position:planPoint(2.8,8.65),target:planPoint(2.8,9.9,1.5)},
 spider:{label:'Forest spider',position:[13.5,0,2.2],target:[15,.25,2.2]},
 shells:{label:'Forest shell pickup',position:[22.5,0,1.8],target:[24,.3,1.8]},
 nightman:{label:'Deep woods encounter',position:[34,0,-20],target:[34,1.6,-26]}
};
export const STATIONS=Object.fromEntries(furnitureDefinitions().filter(d=>d.interaction).map(d=>[d.id,footprintCenter(d)]));
export const SCENE_LAYOUT={
 ...createForestLayout(),
 // Pickups come from the footprint-qualified woodland layout: authored shells, wood and approved batteries.
 cabinBounds:CABIN,
 windows:windowDefinitions(),
 doors:doorDefinitions(),
 spiders:[{id:'spider-path',position:[15,0,2.2]},{id:'spider-tree',position:[21,0,-4]}],
 webs:[{treeId:'pine-harvest-1',position:[13.3,1.2,-7.8],rotation:[0,.3,0]},{treeId:'pine-harvest-2',position:[18.3,1.5,8.2],rotation:[0,-.7,0]}]
};
export function fixedColliders(layout=SCENE_LAYOUT){
 const trees=layout.trees.map(t=>({id:t.id,type:'circle',x:t.position[0],z:t.position[2],radius:t.colliderRadius??.26*(t.scale??1),minY:0,maxY:t.height??6.3*(t.scale??1)}));
 const rocks=(layout.rockPlacements??[]).map(r=>({id:r.id,type:'circle',x:r.position[0],z:r.position[2],radius:r.colliderRadius,minY:r.bounds.min[1],maxY:r.bounds.max[1]}));return[...trees,...rocks];
}
