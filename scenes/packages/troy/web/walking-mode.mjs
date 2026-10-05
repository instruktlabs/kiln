// The shared bank is checked only for packed regroup routes. Exact playback
// remains available for comparison and unsupported/near motion inside hybrid mode.
export function resolveWalkingMode(regroupMode,requested){
 const mode=requested??(regroupMode==='packed'?'hybrid':'reference');
 if(!['reference','hybrid'].includes(mode))throw Error('Invalid walking mode');
 if(mode==='hybrid'&&regroupMode!=='packed')throw Error('Shared walking requires packed regroup routes');
 return mode;
}
