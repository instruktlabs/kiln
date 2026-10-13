/** Optional review diagnostics: count actual renderer submissions, including post passes. */
export function installFrameProfile(info){
 const original=info.update,costs=new Map();
 info.update=function(object,count,instances){
  original.call(this,object,count,instances);
  let key='post / other';for(let n=object;n;n=n.parent)if(n.userData?.assetKey){key=n.userData.assetKey;break;}
  const entry=costs.get(key)??{asset:key,draws:0,triangles:0};entry.draws++;
  entry.triangles+=((object?.isMesh||object?.isSprite)?count/3:0)*(instances??1);costs.set(key,entry);
 };
 return {begin(){for(const row of costs.values()){row.draws=0;row.triangles=0;}info.reset();},snapshot(){return [...costs.values()].filter(row=>row.draws>0).map(row=>({...row})).sort((a,b)=>b.draws-a.draws);},dispose(){info.update=original;}};
}
