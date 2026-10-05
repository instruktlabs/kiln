// Bind matching rigid hierarchies without changing actor or part identity.
export function createPoseBindings(roots){
 if(!Array.isArray(roots)||!roots.length)throw Error('Pose roots required');const parts=[];roots[0].traverse(n=>{if(n.isMesh){if(!n.name||parts.some(p=>p.name===n.name))throw Error('Unique mesh names required');parts.push({name:n.name,node:n});}});if(!parts.length)throw Error('No rigid mesh parts');
 const actors=roots.map(root=>parts.map(p=>{const node=root.getObjectByName(p.name);if(!node?.isMesh||node.geometry!==p.node.geometry||node.material!==p.node.material)throw Error('Actor topology/material mismatch: '+p.name);return node;}));return {parts,actors};
}
