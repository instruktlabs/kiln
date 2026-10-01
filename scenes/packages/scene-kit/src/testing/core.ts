import { parseDevParams } from './params';
import type { DevParamDef, DevParamValues } from './params';
export type { DevParamDef, DevParamValues } from './params';
export function defineDevParams<D extends Record<string,DevParamDef>>(d:D):D { return d; }
export function readDevParams<D extends Record<string,DevParamDef>>(defs:D,search?:string):Partial<DevParamValues<D>> {
  if(!(import.meta.env?.KILN_TEST || import.meta.env?.KILN_DEV))return {};
  return parseDevParams(defs,search??(typeof location!=='undefined'?location.search:''));
}
export const KIT_DEV_PARAMS=defineDevParams({tier:{kind:'enum',values:['minimal','economy','balanced','high']},backend:{kind:'enum',values:['webgl2']},time:{kind:'number'},freeze:{kind:'boolean'},assetBase:{kind:'string'},dev:{kind:'boolean'}} as const);
export class FrameTimeRecorder {
  enabled=false; private data:Float64Array;private count=0;private cursor=0;
  constructor(capacity=36000){this.data=new Float64Array(capacity);}
  push(ms:number):void{if(!this.enabled||!Number.isFinite(ms)||ms<0)return;this.data[this.cursor]=ms;this.cursor=(this.cursor+1)%this.data.length;this.count=Math.min(this.count+1,this.data.length);}
  clear(){this.count=this.cursor=0;}
  values():number[]{const result:number[]=[];for(let i=0;i<this.count;i++)result.push(this.data[(this.cursor-this.count+i+this.data.length)%this.data.length]!);return result;}
  summary(){const sorted=this.values().sort((a,b)=>a-b),n=sorted.length;return{frames:n,medianMs:n?(n%2?sorted[n>>1]!:((sorted[n/2-1]!+sorted[n/2]!)/2)):0,p95Ms:n?sorted[Math.ceil(n*.95)-1]!:0,p99Ms:n?sorted[Math.ceil(n*.99)-1]!:0};}
}
