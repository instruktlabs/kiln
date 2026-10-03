// SPDX-License-Identifier: MIT
import { disposeLoadedModels } from '@kiln-scenes/scene-kit';
import type { LoadedPack, PackReader } from '@kiln-scenes/scene-kit';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { campusStartupModel } from './loading-plan';
export { campusStartupModel } from './loading-plan';

/** Atomically attach a complete interior; failed/cancelled loads never leak a partial cell into the pack. */
export async function loadInteriorModels(pack:LoadedPack,reader:PackReader,signal:AbortSignal){
  const local=new AbortController(),cancel=()=>local.abort(signal.reason),models=new Map<string,GLTF>();
  if(signal.aborted)cancel();else signal.addEventListener('abort',cancel,{once:true});
  const tasks=pack.manifest.models.filter(m=>!campusStartupModel(m));let cursor=0,failure:unknown;
  try {
    await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{
      while(cursor<tasks.length&&!local.signal.aborted){const item=tasks[cursor++]!;
        try{const model=await reader.loadGlb(item.path,local.signal);models.set(item.id,model);}catch(error){failure??=error;local.abort(error);}
      }
    }));
    if(local.signal.aborted)throw failure??local.signal.reason;
    for(const [id,model]of models)pack.models.set(id,model);
    let released=false;return()=>{if(released)return;released=true;for(const [id,model]of models)if(pack.models.get(id)===model)pack.models.delete(id);disposeLoadedModels(models.values());models.clear();};
  }catch(error){disposeLoadedModels(models.values());throw error;}
  finally{signal.removeEventListener('abort',cancel);}
}
