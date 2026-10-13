/** A scene-owned blend mask joins trails without overlapping coplanar meshes.
 * Saved grass/path resources are unchanged; this is placement, not asset art. */
export function createTerrainPathMask(paths,{size=1024,span=180}={}){
 if(!Number.isInteger(size)||size<32||size>2048)throw new RangeError('Mask size must be 32..2048.');
 if(!Number.isFinite(span)||span<=0)throw new RangeError('Mask span must be positive.');
 const segments=[];
 for(const path of paths){
  if(!Number.isFinite(path.halfWidth)||path.halfWidth<=0)throw new TypeError('Trail width must be positive.');
  if(!Array.isArray(path.points)||path.points.length<2||path.points.some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw new TypeError('Trail points must be finite XYZ coordinates.');
  for(let i=1;i<path.points.length;i++)segments.push({a:path.points[i-1],b:path.points[i],width:path.halfWidth});
 }
 const data=new Uint8Array(size*size*4),pixel=span/size;
 for(let i=3;i<data.length;i+=4)data[i]=255;
 for(const {a,b,width} of segments){
  const dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz;
  const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-width+span/2)/pixel)),x1=Math.min(size-1,Math.ceil((Math.max(a[0],b[0])+width+span/2)/pixel));
  const y0=Math.max(0,Math.floor((span/2-Math.max(a[2],b[2])-width)/pixel)),y1=Math.min(size-1,Math.ceil((span/2-Math.min(a[2],b[2])+width)/pixel));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const px=(x+.5)*pixel-span/2,pz=span/2-(y+.5)*pixel,t=length?Math.max(0,Math.min(1,((px-a[0])*dx+(pz-a[2])*dz)/length)):0;
   const distance=Math.hypot(px-a[0]-dx*t,pz-a[2]-dz*t),edge=Math.max(0,Math.min(1,(distance-width*.6)/(width*.4)));
   const value=Math.round((1-edge*edge*(3-2*edge))*255),index=(y*size+x)*4;
   if(value>data[index])data[index]=data[index+1]=data[index+2]=value;
  }
 }
 return {data,size,span};
}

export function sampleTerrainMask(mask,x,z){
 const u=Math.floor((x/mask.span+.5)*mask.size),v=Math.floor((.5-z/mask.span)*mask.size);
 return u<0||v<0||u>=mask.size||v>=mask.size?0:mask.data[(v*mask.size+u)*4]/255;
}
