import {installFixedNodeLookup} from './fixed-node-lookup.mjs';
export function cachePrivateCrewNodes(crew){const restore=crew.actors.map(a=>installFixedNodeLookup(a.root));let disposed=false;return()=>{if(disposed)return;disposed=true;for(const fn of restore)fn();};}
