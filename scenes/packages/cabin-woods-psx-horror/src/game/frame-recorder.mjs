/** Opt-in CPU/pacing diagnostics. These durations are never GPU execution time. */
export function createFrameRecorder(enabled=false,limit=512){
 if(!Number.isInteger(limit)||limit<1||limit>2048)throw new RangeError('Frame sample limit must be 1..2048.');
 const samples=[];let previous=null;
 return {record(serial,fields){if(!enabled)return;const now=fields.frameTimestamp;samples.push({serial,...fields,frameIntervalMs:previous===null?null:now-previous});previous=now;if(samples.length>limit)samples.shift();},snapshot(){return samples.slice();}};
}
