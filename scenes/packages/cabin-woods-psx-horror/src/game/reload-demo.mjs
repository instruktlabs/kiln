/** Minimal timed reload demonstration; inventory.shells includes loaded rounds. */
export function beginReload(state,{duration=2.4}={}){
 if(state.weapon!=='shotgun'||state.inventory.shells<=0||!Number.isFinite(duration)||duration<=0)return null;
 state.flashlight=false;state.message='Flashlight stowed. Reloading the shotgun.';
 return {time:0,duration,done:false};
}
export function advanceReload(action,state,dt){
 if(!action||action.done)return;
 action.time=Math.min(action.duration,action.time+Math.max(0,dt));
 if(action.time>=action.duration){action.done=true;state.loadedShells=Math.min(2,state.inventory.shells);state.message='Shotgun reloaded. Press F to take out the flashlight.';}
}
