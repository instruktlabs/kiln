import {StaticDrawUsage,type BufferGeometry,type InstancedMesh,type Mesh,type Object3D,type Scene} from 'three/webgpu';
import {DisposeRegistry} from '@kiln-scenes/scene-kit/lifecycle';
import {batchStaticMeshes,freezeTransforms,mergeRigidByMaterial,packInstancedMeshes} from '@kiln-scenes/scene-kit/instancing';
import {shadowStandIns,shadowTexelSize,smallCasterThreshold} from '@kiln-scenes/scene-kit/shadows';
import {FARM_SHADOW} from '../constants';
import type {FarmInstance} from './types';
import {countPlacementSources,farmBatchPolicy,farmInstanceOwners,isFixedFarmOwner} from './optimize-policy';
import {createFarmSun,farmHeroAnchors} from './shadows';

export interface FarmOptimizationStats {
 woodland:{packed:boolean;groups:number;instances:number;sourceMeshes:number;tangentDerivatives:number};
 batching:{groups:number;dynamicGroups:number;sourceMeshes:number;totalSourceMeshes:number;eligibleSourceMeshes:number;tangentDerivatives:number};
 frozen:{placements:number;nodes:number};
 /** Attached only after the imperative Farm root joins the outer R3F scene. */
 frameGraph:{hiddenRoots:number;dynamicRoots:number}|null;
 /** S4b anchor merge over the heroes; outside `batching`, which B-07 checks field by field. Null when ?heroMerge=0. */
 heroes:{owners:number;sourceMeshes:number;mergedMeshes:number;keptMeshes:number;groups:number}|null;
 /** S4 on tiers with shadows: hero depth stand-ins and parts they dropped, herd batches under the threshold, texel in metres. */
 shadow:{proxies:number;sourceMeshes:number;groups:number;dropped:number;triangles:number;smallCasters:number;texel:number}|null;
}
/** Tier shadow inputs: map size (the texel), stand-ins on or off, and the small-caster threshold in texels (0 = off). */
export interface FarmShadowBuild {mapSize:number;standIns:boolean;minCasterTexels:number}
/** Pack before batching and freeze last. Register restore after original owners;
 * the outer scene frame graph must register its restoration after this owner.
 * Pack geometry/materials and prepared geometry are borrowed throughout.
 * Heroes (non-fixed owners with no batch source: the policy-excluded placements and the windmill) are merged per anchor and
 * material after batching, so every B-07 count is taken first, then given shadow stand-ins before freezing (stand-ins copy
 * their anchor's matrix flags). Merged geometry is shared per asset, anchor path and group through one cache (the gates).
 */
export function optimizeFarmWorld(root:Scene,instances:readonly FarmInstance[],woodland:{meshes:InstancedMesh[];derivatives:number},options:{packWoodland:boolean;heroMerge?:boolean;shadow?:FarmShadowBuild|null}){
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
  const sources=new Set<Object3D>(batches.batches.flatMap(b=>b.sources.map(s=>s.o))),batched=(o:Object3D)=>{let found=false;o.traverse(n=>{found||=sources.has(n);});return found;};
  const heroes=instances.filter((h,i)=>!isFixedFarmOwner(owners[i]!)&&!batched(h.object)),anchors=new Map(heroes.map(h=>[h,farmHeroAnchors(h)]));
  const sum=<K extends string>(into:Record<K,number>,from:Record<K,number>,keys:readonly K[])=>{for(const k of keys)into[k]+=from[k];};
  let heroStats:FarmOptimizationStats['heroes']=null,shadow:FarmOptimizationStats['shadow']=null;
  if(options.heroMerge!==false){
   const cache=new Map<string,BufferGeometry>();registry.add(()=>{for(const g of cache.values())g.dispose();cache.clear();});
   heroStats={owners:heroes.length,sourceMeshes:0,mergedMeshes:0,keptMeshes:0,groups:0};
   for(const hero of heroes){
    const keep=anchors.get(hero)!,path=(n:Object3D)=>{const names:string[]=[];for(let x:Object3D|null=n;x&&x!==hero.object;x=x.parent)names.push(x.name);return hero.asset.id+':'+names.reverse().join('/');};
    const merge=mergeRigidByMaterial(hero.object,{isAnchor:n=>keep.has(n),cache,cacheKey:path});registry.add(()=>merge.restore());
    sum(heroStats,merge.stats,['sourceMeshes','mergedMeshes','keptMeshes','groups']);
   }
  }
  if(options.shadow){
   const sun=createFarmSun(options.shadow.mapSize),texel=shadowTexelSize(sun.shadow),minTexels=options.shadow.minCasterTexels;
   shadow={proxies:0,sourceMeshes:0,groups:0,dropped:0,triangles:0,smallCasters:0,texel};
   if(options.shadow.standIns)for(const hero of heroes){
    const keep=anchors.get(hero)!,s=shadowStandIns(hero.object,{layer:FARM_SHADOW.standInLayer,isAnchor:n=>keep.has(n),texel,minCasterTexels:minTexels});registry.add(()=>s.restore());
    sum(shadow,s.stats,['proxies','sourceMeshes','groups','dropped','triangles']);
   }
   if(minTexels>0){const herd=new Set<Mesh>(batches.batches.filter(b=>b.dynamic).map(b=>b.mesh)),t=smallCasterThreshold(root,sun,{minTexels,include:m=>herd.has(m)});registry.add(()=>t.restore());shadow.smallCasters=t.stats.dropped;}
  }
  const frozen=freezeTransforms(owners,isFixedFarmOwner);registry.add(()=>frozen.restore());
  const stats:FarmOptimizationStats={
   woodland:{packed:!!packed,groups:packed?.groups??0,instances:woodland.meshes.reduce((n,mesh)=>n+mesh.count,0),sourceMeshes:woodland.meshes.length,tangentDerivatives:woodland.derivatives},
   batching:{...batches.stats,...observed,tangentDerivatives:derived.size},frozen:{placements:frozen.placements,nodes:frozen.nodes},frameGraph:null,heroes:heroStats,shadow,
  };
  return{owners,batches,isFixed:isFixedFarmOwner,heroes,stats,restore};
 }catch(error){registry.disposeAll();if(registry.errors.length)throw new AggregateError([error,...registry.errors],'Farm optimization construction and restoration failed');throw error;}
}
export type FarmOptimization=ReturnType<typeof optimizeFarmWorld>;
