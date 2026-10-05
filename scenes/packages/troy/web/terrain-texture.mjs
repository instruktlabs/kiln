// Generate once. Runtime sampling uses a mipmapped packed texture rather than
// recomputing procedural octaves in every fragment. R: sand, G: grain, B: rock.
export const DEFAULT_TERRAIN_SURFACE='lod';
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const hash=(x,z,seed)=>{
 let h=Math.imul(x+1,374761393)^Math.imul(z+1,668265263)^Math.imul(seed,1442695041);
 h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
};
export function periodicNoise(u,v,cells,seed){
 const x=(u-Math.floor(u))*cells,z=(v-Math.floor(v))*cells,ix=Math.floor(x),iz=Math.floor(z),a=smooth(x-ix),b=smooth(z-iz);
 const h=(dx,dz)=>hash((ix+dx)%cells,(iz+dz)%cells,seed);
 return lerp(lerp(h(0,0),h(1,0),a),lerp(h(0,1),h(1,1),a),b);
}
export function makeTerrainTexture({size=256,seed=1307}={}){
 if(![128,256].includes(size))throw Error('Terrain texture size must be 128 or 256');
 if(!Number.isSafeInteger(seed))throw Error('Terrain texture seed must be an integer');
 const bytes=new Uint8Array(size*size*4),byte=x=>Math.round(Math.max(0,Math.min(1,x))*255);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const u=(x+.5)/size,v=(z+.5)/size,i=(z*size+x)*4;
  const low=periodicNoise(u,v,4,seed),middle=periodicNoise(u,v,16,seed+1),fine=periodicNoise(u,v,32,seed+2),grain=hash(x,z,seed+3);
  bytes[i]=byte(.30*grain+.45*fine+.25*middle);
  bytes[i+1]=byte(.50*grain+.50*middle);
  bytes[i+2]=byte(.55*low+.30*middle+.15*(.5+.5*Math.sin(v*Math.PI*16+low*4)));
  bytes[i+3]=255;
 }
 return bytes;
}
export function bakeTerrainTint(positions,kind,{joinStart=null}={}){
 if(!['sand','rock'].includes(kind))throw Error('Invalid terrain tint kind');
 if(positions.length%3)throw Error('Terrain positions need xyz triples');
 const colors=new Float32Array(positions.length);
 for(let i=0;i<positions.length;i+=3){
  const x=positions[i],y=positions[i+1],z=positions[i+2];if(![x,y,z].every(Number.isFinite))throw Error('Terrain positions must be finite');
  let shade;
  if(kind==='sand')shade=.92+.12*periodicNoise(x/160,z/160,8,1307);
  else{
   const u=x*.014+z*.010,v=y*.032+z*.006,low=periodicNoise(u,v,4,1307),middle=periodicNoise(u,v,16,1308);
   shade=.80+.27*(.6*low+.25*middle+.15*(.5+.5*Math.sin(v*Math.PI*16+low*4)));
  }
  if(kind==='rock'&&joinStart!==null){let t=Math.max(0,Math.min(1,(z-joinStart)/250));t=t*t*(3-2*t);const macro=.90+.16*periodicNoise(x/640,z/640,4,1307);shade=(.92+.12*periodicNoise(x/160,z/160,8,1307))*(1-t)+macro*t;}
  colors[i]=colors[i+1]=colors[i+2]=shade;
 }
 return colors;
}
export function terrainDetailPolicy(distance){
 if(!Number.isFinite(distance)||distance<0)throw Error('Terrain detail distance must be finite and non-negative');
 const t=Math.max(0,Math.min(1,(distance-160)/60));
 return {near:distance<220,blend:1-t*t*(3-2*t)};
}
