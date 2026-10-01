import {StaticDrawUsage,type InstancedMesh,type Scene} from 'three/webgpu';
import {DisposeRegistry} from '@kiln-scenes/scene-kit/lifecycle';
import {batchStaticMeshes,freezeTransforms,packInstancedMeshes} from '@kiln-scenes/scene-kit/instancing';
import type {FarmInstance} from './types';
import {countPlacementSources,farmBatchPolicy,farmInstanceOwners,isFixedFarmOwner} from './optimize-policy';

export interface FarmOptimizationStats {
 woodland:{packed:boolean;groups:number;instances:number;sourceMeshes:number;tangentDerivatives:number};
 batching:{groups:number;dynamicGroups:number;sourceMeshes:number;totalSourceMeshes:number;eligibleSourceMeshes:number;tangentDerivatives:number};
 frozen:{placements:number;nodes:number};
 /** Attached only after the imperative Farm root joins the outer R3F scene. */
 frameGraph:{hiddenRoots:number;dynamicRoots:number}|null;
}
/** Pack before batching and freeze last. Register restore after original owners;
 * the outer scene frame graph must register its restoration after this owner.
 * Pack geometry/materials and prepared geometry are borrowed throughout.
 */
export function optimizeFarmWorld(root:Scene,instances:readonly FarmInstance[],woodland:{meshes:InstancedMesh[];derivatives:number},options:{packWoodland:boolean}){
 const owners=farmInstanceOwners(instances),policy=farmBatchPolicy(),registry=new DisposeRegistry();
 // Fail before mutation: a misplaced wrapper otherwise escapes frame-graph ownership.
 for(const owner of owners)if(owner.object.parent!==root)throw new Error(`Farm owner ${owner.id} must be a direct world-root child`);
 const restore=()=>{registry.disposeAll();if(registry.errors.length)throw new AggregateError(registry.errors,'Farm optimization restoration failed');};
 try{
  const packed=options.packWoodland?packInstancedMeshes(root,woodland.meshes):null;
  if(packed)registry.add(()=>packed.restore());
  root.updateMatrixWorld(true);const observed=countPlacementSources(owners,policy);
  const batches=batchStaticMeshes(root,owners,policy);registry.add(()=>batches.restore());
  // M4 item 1: three's renderer uploads a DynamicDrawUsage buffer every frame, changed or not. The Farm's dynamic batches
  // are rewritten only by the kit's frame graph, which marks a batch for upload when one of its matrices changes
  // (FARM-006), so static usage uploads exactly the batches that moved (none on minimal, where nothing moves).
  for(const batch of batches.batches)if(batch.dynamic)batch.mesh.instanceMatrix.setUsage(StaticDrawUsage);
  const derived=new Set(batches.batches.filter(batch=>batch.mesh.geometry!==batch.sources[0]!.o.geometry).map(batch=>batch.mesh.geometry));
  const frozen=freezeTransforms(owners,isFixedFarmOwner);registry.add(()=>frozen.restore());
  const stats:FarmOptimizationStats={
   woodland:{packed:!!packed,groups:packed?.groups??0,instances:woodland.meshes.reduce((n,mesh)=>n+mesh.count,0),sourceMeshes:woodland.meshes.length,tangentDerivatives:woodland.derivatives},
   batching:{...batches.stats,...observed,tangentDerivatives:derived.size},frozen:{placements:frozen.placements,nodes:frozen.nodes},frameGraph:null,
  };
  return{owners,batches,isFixed:isFixedFarmOwner,stats,restore};
 }catch(error){registry.disposeAll();if(registry.errors.length)throw new AggregateError([error,...registry.errors],'Farm optimization construction and restoration failed');throw error;}
}
export type FarmOptimization=ReturnType<typeof optimizeFarmWorld>;
