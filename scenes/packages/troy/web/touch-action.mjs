// Chrome can suppress the compatibility click following a multi-touch gesture.
// Activate a discrete touch release directly, then consume its duplicate click.
// Keyboard/mouse activation and held movement/block controls keep their semantics.
const handledTouches=new WeakMap();
export function bindDiscreteAction(button,action){
 const starts=new Map(),scope=button.ownerDocument??button;
 let handled=handledTouches.get(scope);if(!handled){handled=new Set();handledTouches.set(scope,handled);}
 const mark=id=>{handled.add(id);if(handled.size>16)handled.delete(handled.values().next().value);};
 const down=e=>{if(button.disabled||!['touch','pen'].includes(e.pointerType))return;handled.delete(e.pointerId);starts.set(e.pointerId,[e.clientX,e.clientY]);};
 const cancel=e=>{if(starts.has(e.pointerId))mark(e.pointerId);starts.delete(e.pointerId);};
 const up=e=>{const start=starts.get(e.pointerId);starts.delete(e.pointerId);if(!start)return;mark(e.pointerId);if(button.disabled||Math.hypot(e.clientX-start[0],e.clientY-start[1])>10)return;e.preventDefault();action(e);};
 // Hide can reveal Show underneath the released finger. Share consumed touch
 // IDs across this document so a retargeted compatibility click is ignored too.
 const click=e=>{if(button.disabled)return;if(e.detail!==0&&((['touch','pen'].includes(e.pointerType)&&handled.has(e.pointerId))||(e.sourceCapabilities?.firesTouchEvents&&handled.size>0))){handled.delete(e.pointerId);return;}action(e);};
 const listeners={pointerdown:down,pointerup:up,pointercancel:cancel,click};
 for(const[type,fn]of Object.entries(listeners))button.addEventListener(type,fn);
 return()=>{starts.clear();for(const[type,fn]of Object.entries(listeners))button.removeEventListener(type,fn);};
}
