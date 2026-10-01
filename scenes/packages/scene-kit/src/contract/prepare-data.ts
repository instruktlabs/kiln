import {asSceneError} from './core';
import type {SceneDefinition,SceneDataPreparationContext} from './types';
function checkAbort(signal:AbortSignal):void{if(signal.aborted)throw signal.reason??new DOMException('Scene preparation aborted','AbortError');}
/** Internal bridge: no new page callbacks, error codes or asynchronous readiness dependency. */
export function prepareSceneData(prepare:NonNullable<SceneDefinition['prepareData']>,data:ReadonlyMap<string,ArrayBuffer>,context:SceneDataPreparationContext):void{
 checkAbort(context.signal);
 try{prepare(data,context);}catch(error){throw asSceneError(error);}
 checkAbort(context.signal);
}
