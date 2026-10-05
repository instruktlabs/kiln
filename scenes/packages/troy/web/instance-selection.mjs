// Stable source indices, compact render slots. Reject invalid patches before
// altering the selection so reverse seeks never leave partially remapped actors.
export function createInstanceSelection(capacity){
 if(!Number.isInteger(capacity)||capacity<1)throw Error('Invalid capacity');let previous=[];
 const valid=a=>Array.isArray(a)&&new Set(a).size===a.length&&a.every(i=>Number.isInteger(i)&&i>=0&&i<capacity);
 return {update(active,dirty){if(!valid(active)||!valid(dirty))throw Error('Invalid instance selection');const changed=new Set(dirty),writes=[];active.forEach((actor,slot)=>{if(previous[slot]!==actor||changed.has(actor))writes.push({slot,actor});});previous=[...active];return {count:active.length,writes};}};
}
