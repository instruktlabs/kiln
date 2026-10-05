// Small deterministic seamless data texture, generated once per material. R/G
// encode height derivatives; B contains foam breakup. No downloaded image asset.
export function makeWaterNoise(size=128){
 if(size!==128)throw Error('Water data texture is fixed at 128');
 const height=new Float32Array(size*size),data=new Uint8Array(size*size*4);
 const hash=(x,y)=>{let n=Math.imul(x+71,374761393)^Math.imul(y+193,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const smooth=t=>t*t*(3-2*t),lerp=(a,b,t)=>a+(b-a)*t;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let h=0,total=0;for(const [cells,weight] of [[4,.5],[8,.27],[16,.15],[32,.08]]){
   const px=x/size*cells,py=y/size*cells,ix=Math.floor(px),iy=Math.floor(py),fx=smooth(px-ix),fy=smooth(py-iy);
   h+=weight*lerp(lerp(hash(ix,iy),hash((ix+1)%cells,iy),fx),lerp(hash(ix,(iy+1)%cells),hash((ix+1)%cells,(iy+1)%cells),fx),fy);total+=weight;
  }height[y*size+x]=h/total;
 }
 const at=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;data[i]=Math.round(255*Math.max(0,Math.min(1,.5+(at(x+1,y)-at(x-1,y))*6)));data[i+1]=Math.round(255*Math.max(0,Math.min(1,.5+(at(x,y+1)-at(x,y-1))*6)));data[i+2]=Math.round(at(x,y)*255);data[i+3]=255;}
 return data;
}
