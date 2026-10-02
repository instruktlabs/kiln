import { useEffect, useRef, useId } from 'react';
import type { JSX, Ref } from 'react';
import { useBuilt, useSystem, SystemOrder } from '../lifecycle';
import { useQuality } from '../quality';
import { buildInstanceSet } from './instances';
import { assertInstancingSafe } from './core';
import type { InstanceSet, InstanceHandle } from './instances';
import { createCellStreamer, createZoneVisibility } from './streaming';
import type { CellStreamerOptions, Zone } from './streaming';
import type { Object3D, Vector3 } from 'three/webgpu';
import { useRuntime } from '../internal/runtime';
export * from './core';export * from './instances';export * from './streaming';
export * from './rigid-merge';
function assignRef<T>(ref:Ref<T>|undefined,value:T|null){if(typeof ref==='function')ref(value);else if(ref)ref.current=value;}
export function InstancedGroup(p:{set:InstanceSet;drawDistance?:number;handleRef?:Ref<InstanceHandle>;maxCellsPerFrame?:number}):JSX.Element{
 const quality=useQuality(),built=useBuilt(()=>{const value=buildInstanceSet(p.set);if(import.meta.env.KILN_DEV){const offenders=assertInstancingSafe(value.root);if(offenders.length){value.dispose();throw new Error(`Unsafe instanced geometry: ${offenders.join(', ')}`);}}return value;},value=>value.dispose(),[p.set]);
 useEffect(()=>{assignRef(p.handleRef,built?.handle??null);return()=>assignRef(p.handleRef,null);},[built,p.handleRef]);
 useEffect(()=>{const apply=()=>built?.setDensity(p.set.density==='none'?1:p.set.density==='vegetation'?quality.live.vegetationDensity:quality.live.instanceDensity);apply();return quality.onLiveChange(apply);},[built,p.set.density,quality]);
 useSystem('instances-'+p.set.key,SystemOrder.frameGraph+1,(_dt,_elapsed,state)=>{if(!built)return;built.update(state.camera.position,p.drawDistance??Infinity,quality.live.lodBias,p.maxCellsPerFrame);});
 return <>{built&&<primitive object={built.root} dispose={null}/>}</>;
}
export function useCellStreamer<C>(o:CellStreamerOptions<C>):{stats:()=>{resident:number;loading:number;queued:number;attachedLastFrame:number;evicted:number}}{
 const quality=useQuality(),runtime=useRuntime(),id=useId(),elapsed=useRef(0);
 const core=useBuilt(()=>{
  const diagnostic:{stats:()=>unknown;lastError?:string}={stats:()=>null};
  const value=createCellStreamer({...o,onCellError(cell,error){
   if(import.meta.env.KILN_DEV||import.meta.env.KILN_TEST){diagnostic.lastError=`${cell.x},${cell.y},${cell.z}: ${error instanceof Error?error.message:String(error)}`;runtime.notify();}
   o.onCellError?.(cell,error);
  }});
  if(import.meta.env.KILN_DEV||import.meta.env.KILN_TEST){let records=runtime.data.get('streamerDiagnostics') as Map<string,typeof diagnostic>|undefined;if(!records){records=new Map();runtime.data.set('streamerDiagnostics',records);}diagnostic.stats=value.stats;records.set(id,diagnostic);}
  return value;
 },value=>{value.dispose();if(import.meta.env.KILN_DEV||import.meta.env.KILN_TEST)(runtime.data.get('streamerDiagnostics') as Map<string,unknown>|undefined)?.delete(id);},[o,runtime,id]);
 useSystem('cell-streamer',SystemOrder.frameGraph+2,dt=>{elapsed.current+=dt*1000;core?.update(elapsed.current,quality.live.streamRadiusScale);});
 return{stats:()=>core?.stats()??{resident:0,loading:0,queued:0,attachedLastFrame:0,evicted:0}};
}
export function useZoneVisibility(zones:Zone[],roots:Map<string,Object3D>,viewpoint:()=>Vector3,hops:()=>number):{current:()=>string|null}{const core=useBuilt(()=>createZoneVisibility(zones,roots,viewpoint,hops),value=>value.dispose(),[zones,roots,viewpoint,hops]),elapsed=useRef(0);useSystem('zone-visibility',SystemOrder.frameGraph+3,dt=>{elapsed.current+=dt*1000;core?.update(elapsed.current);});return{current:()=>core?.current()??null};}
