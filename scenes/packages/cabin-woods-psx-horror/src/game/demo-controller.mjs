/** The review camera follows the feet origin, never an animated bone or target. */
export function applyStableDemoCamera(camera,{position,heading,pitch}){
 camera.position.set(position[0],position[1]+1.61,position[2]);
 camera.rotation.set(pitch,-heading-Math.PI/2,0,'YXZ');
 return camera;
}

/** One trusted request owner. Canceled requests cannot authorize a later grant. */
export function installDemoControls({element,document,window,controls,getPlayer,canPlay=()=>true}){
 let keyboardMode=false,locked=false,authorized=false,lockTime=-Infinity,pending=null,disposed=false,settlementAttached=true,lastError=null;
 const reportError=error=>{lastError={name:typeof error?.name==='string'?error.name:'PointerLockError',message:typeof error?.message==='string'?error.message.slice(0,300):'The browser rejected pointer lock.'};};
 const clear=()=>{controls.keys.clear();controls.commands.length=0;getPlayer().reviewTravel=0;};
 const releaseOwned=()=>{if(document.pointerLockElement===element)document.exitPointerLock();};
 const detachSettlement=()=>{if(!settlementAttached)return;settlementAttached=false;document.removeEventListener('pointerlockchange',lockchange);document.removeEventListener('pointerlockerror',lockerror);};
 const settle=ticket=>{if(ticket.timer)clearTimeout(ticket.timer);ticket.finished=true;if(pending===ticket)pending=null;if(disposed)detachSettlement();};
 const pause=()=>{keyboardMode=false;if(pending)pending.canceled=true;authorized=false;locked=false;clear();controls.active=false;releaseOwned();};
 const lockchange=e=>{
  clear();const own=document.pointerLockElement===element,ticket=pending;
  if(own){
   const allowed=!disposed&&canPlay()&&(ticket?!ticket.canceled:authorized);
   if(!allowed){authorized=false;locked=false;controls.active=false;if(ticket)settle(ticket);releaseOwned();return;}
   authorized=true;locked=true;controls.active=true;lockTime=Number.isFinite(e.timeStamp)?e.timeStamp:-Infinity;if(ticket)settle(ticket);
  }else{const wasLocked=locked;locked=false;controls.active=false;if(wasLocked){authorized=false;if(ticket)ticket.canceled=true;}}
 };
 const lockerror=()=>{const ticket=pending;if(!ticket||ticket.promise)return;reportError(null);settle(ticket);pause();};
 const requestPlay=()=>{
  if(disposed||pending||!canPlay())return false;
  if(typeof element.requestPointerLock!=='function'){reportError({name:'NotSupportedError',message:'Mouse capture is unavailable in this browser.'});return false;}
  keyboardMode=false;
  if(document.pointerLockElement===element&&authorized){controls.active=true;return true;}
  const ticket={canceled:false,finished:false,promise:false,timer:null};pending=ticket;authorized=false;locked=false;controls.active=false;lastError=null;clear();
  try{
   const result=element.requestPointerLock();ticket.promise=!!result&&typeof result.then==='function';
   if(ticket.promise)result.then(()=>{if(ticket.finished)return;const allowed=!disposed&&!ticket.canceled&&canPlay();if(allowed&&document.pointerLockElement===element)lockchange({timeStamp:performance.now()});else{settle(ticket);if(!allowed)releaseOwned();}},error=>{if(ticket.finished)return;reportError(error);settle(ticket);if(!disposed)pause();});

   return true;
  }catch(error){reportError(error);settle(ticket);pause();return false;}
 };
 const requestKeyboardPlay=()=>{if(disposed||pending||!canPlay()||document.pointerLockElement)return false;clear();authorized=false;locked=false;keyboardMode=true;controls.active=true;return true;};
 const keydown=e=>{
  if(e.code==='Escape'){if(controls.active||pending||document.pointerLockElement===element)e.preventDefault();pause();return;}
  if(disposed||!canPlay()||!controls.active||/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target?.tagName??''))return;
  const key=e.code;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Space'].includes(key))e.preventDefault();controls.keys.add(key);if(e.repeat)return;
  const command={KeyE:'use',KeyF:'flashlight',KeyR:'reload',KeyB:'battery',Digit1:'unarmed',Digit2:'axe',Digit3:'shotgun',Space:'attack'}[key];if(command)controls.commands.push(command);
 };
 const keyup=e=>controls.keys.delete(e.code);
 const mousemove=e=>{
  if(disposed||!canPlay()||!controls.active||!locked||document.pointerLockElement!==element||e.timeStamp<lockTime||!Number.isFinite(e.movementX)||!Number.isFinite(e.movementY))return;
  const player=getPlayer();player.heading+=e.movementX*.002;player.pitch=Math.max(-1.35,Math.min(1.2,player.pitch-e.movementY*.002));
 };
 const mousedown=e=>{if(disposed||e.button!==0||!canPlay())return;if(keyboardMode&&controls.active)controls.commands.push('attack');else if(document.pointerLockElement!==element)requestPlay();else if(controls.active)controls.commands.push('attack');};
 window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',pause);
 document.addEventListener('mousemove',mousemove);document.addEventListener('pointerlockchange',lockchange);document.addEventListener('pointerlockerror',lockerror);element.addEventListener('mousedown',mousedown);
 // A void API has no request promise. On disposal only, retain settlement
 // listeners up to30s so a delayed grant can be released without orphaning
 // global listeners. Grants beyond that legacy disposal lease are unobservable.
 return {requestPlay,requestKeyboardPlay,pause,getRequestStatus(){return {keyboardMode,pending:!!pending,canceled:pending?.canceled??false,authorized,locked,hasOwnLock:document.pointerLockElement===element,active:controls.active,disposed,canPlay:canPlay(),lastError:lastError?{...lastError}:null,context:{focused:typeof document.hasFocus==='function'?document.hasFocus():null,visibility:document.visibilityState??null,secure:window.isSecureContext??null}};},dispose(){if(disposed)return;disposed=true;pause();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',pause);document.removeEventListener('mousemove',mousemove);element.removeEventListener('mousedown',mousedown);if(!pending||pending.promise)detachSettlement();else{const ticket=pending;ticket.timer=setTimeout(()=>settle(ticket),30000);ticket.timer.unref?.();}}};
}
