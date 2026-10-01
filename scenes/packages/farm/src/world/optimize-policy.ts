import type {Mesh} from 'three/webgpu';
import type {BatchPolicy,InstanceOwner} from '@kiln-scenes/scene-kit/instancing';
import type {FarmInstance} from './types';

const excludedAssets=['farmer','tractor','trailer','farmhouse','barn','watermill','fence-gate'] as const;
const fixedAssets=new Set(['fence-straight','fence-corner','barrel','hay-bale','cabbage-stage-1','cabbage-stage-2','cabbage-stage-3','cabbage-stage-4','wheat','pumpkin-plant','faceted-tree','rock-cluster']);

/** Sealed r33 wide-cell policy. Each build receives its own exclusion set. */
export function farmBatchPolicy():BatchPolicy{return{cellSize:96,cellOffset:48,excludeAssets:new Set(excludedAssets)};}
export function farmInstanceOwners(instances:readonly FarmInstance[]):InstanceOwner[]{
 return instances.map(instance=>({id:instance.id,object:instance.object,assetId:instance.asset.id,dynamic:instance.clips.length>0||instance.asset.id==='tractor'||instance.asset.id==='farmer'}));
}
export function isFixedFarmOwner(owner:InstanceOwner):boolean{return fixedAssets.has(owner.assetId)&&!owner.dynamic;}

/** Observe original visible placements before batch construction hides sources.
 * Eligible includes singleton groups; total includes policy-excluded buildings.
 * Neither is the historical 24m count of 1,967 represented sources (R3-08).
 */
export function countPlacementSources(owners:readonly InstanceOwner[],policy:BatchPolicy):{totalSourceMeshes:number;eligibleSourceMeshes:number}{
 let totalSourceMeshes=0,eligibleSourceMeshes=0;
 for(const owner of owners)owner.object.traverseVisible(object=>{
  const mesh=object as Mesh&{isSkinnedMesh?:boolean};if(!mesh.isMesh)return;totalSourceMeshes++;
  if(!policy.excludeAssets.has(owner.assetId)&&!mesh.isSkinnedMesh&&!Array.isArray(mesh.material)&&!mesh.material.transparent&&!mesh.morphTargetInfluences?.length&&mesh.matrixWorld.determinant()>0)eligibleSourceMeshes++;
 });
 return{totalSourceMeshes,eligibleSourceMeshes};
}
