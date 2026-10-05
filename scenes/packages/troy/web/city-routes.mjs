// Scene infrastructure: connect the existing courtyard clearings to the main
// avenue using the pinned assets' actual extents. Saved assets stay unchanged.
export function connectCityCourtyards({layout,inputs,groundHeight}){
 if(!layout||!Array.isArray(inputs?.assets)||typeof groundHeight!=='function')throw Error('City route inputs required');
 const corridors=[{z:445,minX:-85,maxX:85},{z:529,minX:-125,maxX:125},{z:613,minX:-85,maxX:85}].map(c=>({...c,minZ:c.z-6,maxZ:c.z+6}));
 function bounds(p,foundation=false){const input=inputs.assets.find(a=>a.slug===p.asset);if(!input?.bounds)throw Error('Missing route bounds '+p.asset);const {min,max,size}=input.bounds,c=Math.cos(p.yaw),s=Math.sin(p.yaw),xs=[],zs=[];for(const x of [min[0],max[0]])for(const z of [min[2],max[2]]){xs.push(p.position[0]+p.scale*(c*x+s*z));zs.push(p.position[2]+p.scale*(-s*x+c*z));}if(foundation){xs.push(p.position[0]-size[0]*p.scale/2,p.position[0]+size[0]*p.scale/2);zs.push(p.position[2]-size[2]*p.scale/2,p.position[2]+size[2]*p.scale/2);}return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};}
 const intersects=(a,b)=>a.minX<=b.maxX&&a.maxX>=b.minX&&a.minZ<=b.maxZ&&a.maxZ>=b.minZ;
 const removedHouses=[],movedPlants=[];
 layout.buildings=layout.buildings.filter(p=>{const remove=p.asset==='house'&&corridors.some(c=>intersects(bounds(p,true),c));if(remove)removedHouses.push(p.id);return !remove;});
 for(const p of layout.plants)for(const corridor of corridors){const b=bounds(p);if(!intersects(b,corridor))continue;const before=[...p.position],north=p.position[2]>=corridor.z,shift=north?corridor.maxZ+.75-b.minZ:corridor.minZ-.75-b.maxZ;p.position[2]+=shift;p.position[1]=groundHeight(p.position[0],p.position[2]);movedPlants.push({id:p.id,from:before,to:[...p.position]});}
 return {corridors,removedHouses,movedPlants,scope:'Twelve-metre cross streets using actual house/foundation and planting extents; retained city props remain obstacles.'};
}
