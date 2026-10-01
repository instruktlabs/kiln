// SPDX-License-Identifier: MIT
// The running twin is fetched only when Enter the fab is chosen. The initial campus does not need its controllers,
// simulation or GLB animation drivers. Pack integrity is still checked by the shared loader before initial readiness.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three/webgpu';
import { SystemOrder, useFade, useLoadedPack, usePackReader, useSystem } from '@kiln-scenes/scene-kit';
import { foundryFloorDefinition } from '../definition';
import { FoundryContext } from '../scene/session';
import type { FoundrySession } from '../scene/session';
import { FoundryWorld } from '../scene/World';
import { FoundryHud } from '../scene/Hud';
import { useCampusSession } from './session';
import { parseCampus } from './data';
import { buildInteriorContext } from './interior-context';
import { loadInteriorModels } from './loading';
export { createFoundrySession } from '../scene/session';

export function InteriorPlace({ session }: { session: FoundrySession }) {
  const campus = useCampusSession(), fade = useFade(), camera = useThree(state => state.camera) as PerspectiveCamera;
  const pack=useLoadedPack(),reader=usePackReader(),scene=useThree(state=>state.scene);
  const [modelsReady,setModelsReady]=useState(false),[failure,setFailure]=useState<unknown>(null);
  const arrived = useRef(false);
  useEffect(()=>{
    const controller=new AbortController();let release:(()=>void)|undefined;
    loadInteriorModels(pack,reader,controller.signal).then(dispose=>{
      if(controller.signal.aborted){dispose();return;}release=dispose;setModelsReady(true);
    },error=>{if(!controller.signal.aborted)setFailure(error);});
    return()=>{controller.abort();release?.();};
  },[pack,reader]);
  useEffect(()=>{
    const data=parseCampus(pack.data.get('campus')!),placement=data.placements.find(p=>p.id===data.interior.placement)!;
    const model=pack.models.get(placement.model);if(!model)throw new Error('Missing registered SW head');
    const context=buildInteriorContext(data,model);scene.add(context.root);return()=>context.dispose();
  },[pack,scene]);
  useLayoutEffect(() => {
    const c = foundryFloorDefinition.camera!;
    camera.near = c.near!; camera.far = c.far!; camera.updateProjectionMatrix();
  }, [camera]);
  useEffect(() => () => {
    if (campus.interior === session) campus.interior = null;
    session.dispose();
  }, [campus, session]);
  useSystem('campus-interior-arrival', SystemOrder.camera + 60, () => {
    if (arrived.current || !session.viewReady) return;
    arrived.current = true;
    void fade.to(0, 350);
    campus.hud.set({ moving: false, status: 'South-west building, level 1: registered floor with a bounded context cutaway' });
  });
  if(failure)throw failure;
  return <FoundryContext.Provider value={session}>{modelsReady&&<FoundryWorld/>}</FoundryContext.Provider>;
}

export function InteriorHud({ session, leading }: { session: FoundrySession; leading?: ReactNode }) {
  return <FoundryContext.Provider value={session}><FoundryHud leading={leading}/></FoundryContext.Provider>;
}
