export async function compileSceneVariants({renderer,scene,camera,targetScene=scene,renderPass=null}) {
 if(typeof renderer?.compileAsync!=='function'||typeof scene?.traverse!=='function'||!camera?.isCamera||(renderPass!==null&&typeof renderPass!=='function'))throw Error('Invalid scene variant compiler');
 const result=await withVisibleSceneVariants({scene,run:async()=>{await renderer.compileAsync(scene,camera,targetScene);if(renderPass)await renderPass(scene,camera);}});return {...result,status:'compiled'};
}
// Startup admission is shared by async compilation and direct offscreen draws.
// The callback owns its target; temporary variants never reach the live loop.
export async function withVisibleSceneVariants({scene,run}){
 if(typeof scene?.traverse!=='function'||typeof run!=='function')throw Error('Invalid scene variant admission');
 const states=[],geometries=new Map();let hiddenObjects=0,zeroCountMeshes=0,frustumExcludedMeshes=0;
 scene.traverse(node=>{states.push({node,visible:node.visible,frustumCulled:node.frustumCulled,count:node.isInstancedMesh?node.count:undefined});if(node.isMesh&&!node.isInstancedMesh&&node.geometry?.isInstancedBufferGeometry&&!geometries.has(node.geometry))geometries.set(node.geometry,node.geometry.instanceCount);});
 try {
  for(const {node,visible}of states){if(!visible)hiddenObjects++;node.visible=true;if(node.isMesh){if(node.frustumCulled)frustumExcludedMeshes++;node.frustumCulled=false;if(node.isInstancedMesh&&node.count===0&&node.instanceMatrix.count>0){node.count=1;zeroCountMeshes++;}}}
  // Plain meshes can also issue instanced draws. Admit one initialized instance
  // per owned geometry, without manufacturing capacity for an empty buffer.
  for(const [geometry,count]of geometries)if(count===0){const capacities=Object.values(geometry.attributes).flatMap(a=>a.isInstancedBufferAttribute?[a.count*a.meshPerAttribute]:a.data?.isInstancedInterleavedBuffer?[a.count*a.data.meshPerAttribute]:[]);if(capacities.length&&capacities.every(n=>Number.isFinite(n)&&n>=1)){geometry.instanceCount=1;zeroCountMeshes++;}}
  await run();
  return {status:'admitted',objects:states.length,hiddenObjects,zeroCountMeshes,frustumExcludedMeshes};
 } finally {
  for(const {node,visible,frustumCulled,count}of states){node.visible=visible;node.frustumCulled=frustumCulled;if(count!==undefined)node.count=count;}
  for(const [geometry,count]of geometries)geometry.instanceCount=count;
 }
}
