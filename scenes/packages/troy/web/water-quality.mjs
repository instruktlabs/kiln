export const WATER_TIERS=Object.freeze({low:{outer:8,center:48,far:8,middle:24,shore:24,ripples:0},balanced:{outer:12,center:80,far:12,middle:32,shore:40,ripples:1},high:{outer:20,center:100,far:16,middle:48,shore:48,ripples:2}});
export function initialWaterTier({cores,memory}={}){return (Number.isFinite(cores)&&cores<=4)||(Number.isFinite(memory)&&memory<=4)?'low':'balanced';}
// Frame intervals are a coarse whole-scene signal, not a GPU benchmark. Do not
// promote automatically from a refresh-limited measurement. Manual High remains available.
export class WaterQualityController{
 constructor(tier='balanced'){if(!WATER_TIERS[tier])throw Error('Unknown water tier');this.tier=tier;this.samples=[];this.lastChange=0;}
 sample(ms,elapsed){
  if(!Number.isFinite(ms)||ms<1||ms>100||elapsed<10000||elapsed-this.lastChange<10000){this.samples=[];return this.tier;}
  this.samples.push(ms);if(this.samples.length<120)return this.tier;
  const sorted=this.samples.toSorted((a,b)=>a-b);this.samples=[];
  if(sorted[Math.floor(sorted.length*.5)]>30&&sorted[Math.floor(sorted.length*.9)]>34){this.tier=this.tier==='high'?'balanced':'low';this.lastChange=elapsed;}
  return this.tier;
 }
}
