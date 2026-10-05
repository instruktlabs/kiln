// Kept byte-equivalent to the checked bake helper's lookup for this trial.
// Pure runtime copy avoids importing the CPU baker into the browser bundle.
export function createSampleTimeLookup(input){
 const times=Array.from(input??[]);if(times.length<2||times[0]!==0||times.some((t,i)=>!Number.isFinite(t)||(i&&t<=times[i-1])))throw Error('Invalid sample times');
 return time=>{if(!Number.isFinite(time)||time<0||time>times.at(-1))throw Error('Invalid sample time');if(time===times.at(-1))return times.length-1;let lo=0,hi=times.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(times[mid]<=time)lo=mid;else hi=mid;}return lo+(time-times[lo])/(times[hi]-times[lo]);};
}
