/** Same-origin SceneShell adapter; standalone review uses the same app. */
export function createFrameHost(scope=window){
 const post=message=>{if(scope.parent!==scope)scope.parent.postMessage({source:'kiln-scene',...message},scope.location.origin);};
 const fail=error=>post({state:'error',message:String(error?.message??error),errorCode:'runtime'});
 const exit=event=>{if(event.key==='Escape'&&!scope.document.pointerLockElement&&!event.defaultPrevented)scope.queueMicrotask(()=>{if(!event.defaultPrevented)post({state:'exit'});});};
 const rejection=event=>fail(event.reason),error=event=>fail(event.error??event.message);
 scope.addEventListener('error',error);scope.addEventListener('unhandledrejection',rejection);scope.addEventListener('keydown',exit);post({state:'started'});
 return {progress(text){post({state:'progress',text});},ready(){post({state:'ready'});},fail,dispose(){scope.removeEventListener('error',error);scope.removeEventListener('unhandledrejection',rejection);scope.removeEventListener('keydown',exit);}};
}
