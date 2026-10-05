// Consumer owns phase selection and sampling. Only a stopped startup loop may
// call this; the draw owns its offscreen target and awaited GPU completion.
export async function warmProductionPhase({sample,time,restoreTime,draw}){
 if(typeof sample!=='function'||typeof draw!=='function'||![time,restoreTime].every(t=>Number.isFinite(t)&&t>=0))throw Error('Invalid production phase warmup');
 try{sample(time);return {...await draw(),phaseTime:time,restoredTime:restoreTime};}finally{sample(restoreTime);}
}
