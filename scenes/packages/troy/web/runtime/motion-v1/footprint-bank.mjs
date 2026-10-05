// Experimental consumer format, independent of rigs, scenes and Three.js.
// IEEE-754 doubles preserve supplied contacts exactly; shared orientations reduce
// repeated data. No quantization, navigation, collision or arbitrary clip claim.
const MAGIC=0x31424650,VERSION=1,HEADER=16,ORIENTATION=40,RECORD=28,MAX_RECORDS=2_000_000;
const finite3=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
const validFoot=f=>f&&finite3(f.position)&&Number.isFinite(f.yaw)&&(f.normal===undefined||(finite3(f.normal)&&Math.abs(Math.hypot(...f.normal)-1)<1e-6));
const timing=p=>Number.isFinite(p.duration)&&p.duration>0&&Number.isFinite(p.lift)&&p.lift>=0;
const ease=t=>t<=0?0:t>=1?1:t*t*t*(10+t*(-15+6*t));
export function encodeFootprintBank(input){
 if(!Array.isArray(input)||!input.length)throw Error('Footprint plans required');
 const ids=new Set(),orientations=[],lookup=new Map(),records=[],plans=[];
 function add(foot,side){
  if(!validFoot(foot))throw Error('Invalid footprint');
  const values=[foot.yaw,...(foot.normal??[])],key=values.map(v=>Object.is(v,-0)?'-0':String(v)).join(',');
  let orientation=lookup.get(key);if(orientation===undefined){orientation=orientations.length;orientations.push(values);lookup.set(key,orientation);}
  records.push({position:foot.position,orientation,side});if(records.length>MAX_RECORDS)throw Error('Footprint bank exceeds record limit');
 }
 for(const p of input){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error('Invalid footprint plan ID');ids.add(p.id);
  const duration=p.duration??.38,lift=p.lift??.1;if(!timing({duration,lift})||!Array.isArray(p.steps))throw Error('Invalid footprint plan');
  const offset=records.length;add(p.feet?.left,0);add(p.feet?.right,1);
  for(const step of p.steps){if(!['left','right'].includes(step.side))throw Error('Invalid footprint side');add(step,step.side==='left'?0:1);}
  plans.push({id:p.id,offset,count:p.steps.length+2,duration,lift});
 }
 const recordsOffset=HEADER+orientations.length*ORIENTATION,bytes=new Uint8Array(recordsOffset+records.length*RECORD),view=new DataView(bytes.buffer);
 view.setUint32(0,MAGIC,true);view.setUint32(4,VERSION,true);view.setUint32(8,orientations.length,true);view.setUint32(12,records.length,true);
 orientations.forEach((values,i)=>{const offset=HEADER+i*ORIENTATION;view.setUint32(offset,values.length===4?1:0,true);values.forEach((v,j)=>view.setFloat64(offset+8+j*8,v,true));});
 records.forEach((r,i)=>{const offset=recordsOffset+i*RECORD;r.position.forEach((v,j)=>view.setFloat64(offset+j*8,v,true));view.setUint32(offset+24,r.orientation*2+r.side,true);});
 return {manifest:{schema:'footprint-bank/1',byteLength:bytes.byteLength,orientationCount:orientations.length,recordCount:records.length,recordsOffset,plans},bytes};
}
export function openFootprintBank(manifest,bytes){
 if(!(bytes instanceof Uint8Array))throw Error('Invalid footprint bank payload');
 if(!manifest||manifest.schema!=='footprint-bank/1'||manifest.byteLength!==bytes.byteLength||bytes.byteLength<HEADER)throw Error('Invalid footprint bank size/schema');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),orientationCount=view.getUint32(8,true),recordCount=view.getUint32(12,true),recordsOffset=HEADER+orientationCount*ORIENTATION;
 if(view.getUint32(0,true)!==MAGIC||view.getUint32(4,true)!==VERSION||recordCount>MAX_RECORDS||!recordCount||!orientationCount||orientationCount>recordCount||manifest.orientationCount!==orientationCount||manifest.recordCount!==recordCount||manifest.recordsOffset!==recordsOffset||recordsOffset+recordCount*RECORD!==bytes.byteLength)throw Error('Invalid footprint bank header');
 const orientations=[];
 for(let i=0;i<orientationCount;i++){const offset=HEADER+i*ORIENTATION,flags=view.getUint32(offset,true),yaw=view.getFloat64(offset+8,true),normal=flags===1?[0,1,2].map(j=>view.getFloat64(offset+16+j*8,true)):undefined;if(flags>1||view.getUint32(offset+4,true)!==0||!validFoot({position:[0,0,0],yaw,normal}))throw Error('Invalid footprint orientation');orientations.push({yaw,normal});}
 const side=i=>view.getUint32(recordsOffset+i*RECORD+24,true)%2;
 for(let i=0;i<recordCount;i++){const offset=recordsOffset+i*RECORD;if(Math.floor(view.getUint32(offset+24,true)/2)>=orientationCount)throw Error('Invalid footprint orientation index');for(let j=0;j<3;j++)if(!Number.isFinite(view.getFloat64(offset+j*8,true)))throw Error('Invalid footprint position');}
 if(!Array.isArray(manifest.plans)||!manifest.plans.length)throw Error('Invalid footprint plans');
 const plans=new Map();let end=0;
 for(const p of manifest.plans){if(typeof p.id!=='string'||!p.id||plans.has(p.id)||!Number.isInteger(p.offset)||p.offset!==end||!Number.isInteger(p.count)||p.count<2||p.offset+p.count>recordCount||!timing(p)||side(p.offset)!==0||side(p.offset+1)!==1)throw Error('Invalid footprint plan range/ID');plans.set(p.id,{...p});end+=p.count;}
 if(end!==recordCount)throw Error('Invalid footprint plan coverage');
 const footprint=i=>{const offset=recordsOffset+i*RECORD,o=orientations[Math.floor(view.getUint32(offset+24,true)/2)];return {position:[0,1,2].map(j=>view.getFloat64(offset+j*8,true)),yaw:o.yaw,...(o.normal?{normal:[...o.normal]}:{})};};
 const cache=new Map();let indexBytes=0;
 function plan(id){
  if(cache.has(id))return cache.get(id);const p=plans.get(id);if(!p)throw Error('Unknown footprint plan');
  const steps=p.count-2,states=new Uint32Array((steps+1)*2),points=new Float64Array((steps+1)*3),tangents=new Float64Array(points.length);let left=p.offset,right=p.offset+1;
  for(let i=0;i<=steps;i++){if(i>0){const record=p.offset+1+i;if(side(record)===0)left=record;else right=record;}states[i*2]=left;states[i*2+1]=right;for(let a=0;a<3;a++)points[i*3+a]=(view.getFloat64(recordsOffset+left*RECORD+a*8,true)+view.getFloat64(recordsOffset+right*RECORD+a*8,true))/2;}
  for(let i=1;i<steps;i++)for(let a=0;a<3;a++){const v=points[i*3+a],before=v-points[(i-1)*3+a],after=points[(i+1)*3+a]-v;tangents[i*3+a]=before*after>0?2*before*after/(before+after):0;}
  indexBytes+=states.byteLength+points.byteLength+tangents.byteLength;
  function sample(time){
   if(!Number.isFinite(time)||time<0)throw Error('Invalid step time');
   const complete=!steps||time>=steps*p.duration||Math.floor(time/p.duration)>=steps,index=complete?steps:Math.floor(time/p.duration),feet={left:footprint(states[index*2]),right:footprint(states[index*2+1])};
   if(complete)return {feet,swing:null,phase:1,complete:true,index:steps,bodyCenter:Array.from(points.subarray(steps*3,steps*3+3))};
   const phase=(time-index*p.duration)/p.duration,u=ease(phase),swing=side(p.offset+2+index)===0?'left':'right',a=feet[swing],b=footprint(p.offset+2+index);
   feet[swing]={position:a.position.map((v,i)=>v+(b.position[i]-v)*u+(i===1?p.lift*Math.sin(Math.PI*phase)**2:0)),yaw:a.yaw+(b.yaw-a.yaw)*u};
   if(a.normal||b.normal){const na=a.normal||[0,1,0],nb=b.normal||[0,1,0],n=na.map((v,i)=>v+(nb[i]-v)*u),len=Math.hypot(...n);feet[swing].normal=n.map(v=>v/len);}
   const u2=phase*phase,u3=u2*phase,bodyCenter=[0,1,2].map(a=>(2*u3-3*u2+1)*points[index*3+a]+(u3-2*u2+phase)*tangents[index*3+a]+(-2*u3+3*u2)*points[(index+1)*3+a]+(u3-u2)*tangents[(index+1)*3+a]);
   return {feet,swing,phase,complete:false,index,bodyCenter};
  }
  const result={sample,duration:steps*p.duration,stepDuration:p.duration};cache.set(id,result);return result;
 }
 // Payload is borrowed, not copied. The caller must keep it immutable.
 return {plan,stats:()=>({plans:plans.size,compiledPlans:cache.size,payloadBytes:bytes.byteLength,indexBytes,orientationCount,recordCount})};
}
