// Private fixed-topology rig clones only. Restore before changing names/topology.
// Preserve Object3D's first preorder match, including duplicate and empty names.
export function installFixedNodeLookup(root){const nodes=new Map(),original=root.getObjectByName,owned=Object.hasOwn(root,'getObjectByName');root.traverse(n=>{if(!nodes.has(n.name))nodes.set(n.name,n);});root.getObjectByName=name=>nodes.get(name);let restored=false;return()=>{if(restored)return;restored=true;if(owned)root.getObjectByName=original;else delete root.getObjectByName;nodes.clear();};}
