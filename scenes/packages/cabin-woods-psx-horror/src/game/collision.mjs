/** Kinematic feet-origin player against explicit scene proxies. No asset mutation. */
export const PLAYER={radius:.28,height:1.72,step:.22};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
/** A secured opening blocks melee across its whole aperture, including board gaps. */
export function crossesBoardedOpening(from,to,openings){
 return openings.some(w=>{
  if(!w.boards.some(h=>h>0))return false;
  const [nx,,nz]=w.normal,a=(from[0]-w.position[0])*nx+(from[2]-w.position[2])*nz,b=(to[0]-w.position[0])*nx+(to[2]-w.position[2])*nz;
  if(a*b>0||Math.abs(a-b)<1e-8)return false;
  const t=a/(a-b),x=from[0]+(to[0]-from[0])*t-w.position[0],z=from[2]+(to[2]-from[2])*t-w.position[2];
  return Math.abs(-x*nz+z*nx)<=w.halfWidth;
 });
}
export function resolvePlayer(position,delta,colliders,options={}){
 const radius=options.radius??PLAYER.radius,height=options.height??PLAYER.height;
 const out=[...position],steps=Math.max(1,Math.ceil(Math.hypot(delta[0],delta[2])/(radius*.45)));
 for(let s=0;s<steps;s++){
  out[0]+=delta[0]/steps;out[2]+=delta[2]/steps;
  for(let pass=0;pass<3;pass++)for(const c of colliders){
   if(c.disabled||out[1]+height<=c.minY||out[1]>=c.maxY)continue;
   if(c.type==='convex'){
    // Static world-space bounds reject distant hulls before visiting their edges.
    // Older unbounded proxies still use the exact narrow phase below.
    if(out[0]+radius<c.minX||out[0]-radius>c.maxX||out[2]+radius<c.minZ||out[2]-radius>c.maxZ)continue;
    let inside=true,bestD=Infinity,bestX=0,bestZ=0,bestEx=0,bestEz=0,bestLength2=0;
    for(let i=0;i<c.points.length;i++){const a=c.points[i],b=c.points[(i+1)%c.points.length],ex=b[0]-a[0],ez=b[1]-a[1],length2=ex*ex+ez*ez,t=clamp(((out[0]-a[0])*ex+(out[2]-a[1])*ez)/length2,0,1),x=a[0]+ex*t,z=a[1]+ez*t,dx=out[0]-x,dz=out[2]-z,d=Math.hypot(dx,dz);if(ex*(out[2]-a[1])-ez*(out[0]-a[0])<0)inside=false;if(d<bestD){bestX=x;bestZ=z;bestD=d;bestEx=ex;bestEz=ez;bestLength2=length2;}}
    if(inside||bestD<radius){let nx,nz;if(bestD>1e-8){nx=(inside?bestX-out[0]:out[0]-bestX)/bestD;nz=(inside?bestZ-out[2]:out[2]-bestZ)/bestD;}else{const length=Math.sqrt(bestLength2);nx=bestEz/length;nz=-bestEx/length;}const push=inside?bestD+radius:radius-bestD;out[0]+=nx*push;out[2]+=nz*push;}
   }else if(c.type==='circle'){
    const dx=out[0]-c.x,dz=out[2]-c.z,d=Math.hypot(dx,dz),r=radius+c.radius;
    if(d<r){out[0]+=d>1e-8?dx*(r-d)/d:r;out[2]+=d>1e-8?dz*(r-d)/d:0;}
   }else{
    const oriented=c.type==='obb',cos=oriented?Math.cos(c.angle):1,sin=oriented?Math.sin(c.angle):0,ox=oriented?c.x:0,oz=oriented?c.z:0;
    const x=(out[0]-ox)*cos+(out[2]-oz)*sin,z=-(out[0]-ox)*sin+(out[2]-oz)*cos;
    const minX=oriented?-c.halfX:c.minX,maxX=oriented?c.halfX:c.maxX,minZ=oriented?-c.halfZ:c.minZ,maxZ=oriented?c.halfZ:c.maxZ;
    const dx=x-clamp(x,minX,maxX),dz=z-clamp(z,minZ,maxZ),d=Math.hypot(dx,dz);let px=0,pz=0;
    if(d>1e-8&&d<radius){px=dx*(radius-d)/d;pz=dz*(radius-d)/d;}
    else if(d<=1e-8){px=minX-radius-x;let distance=Math.abs(px),candidate=maxX+radius-x;if(Math.abs(candidate)<distance){px=candidate;distance=Math.abs(candidate);}candidate=minZ-radius-z;if(Math.abs(candidate)<distance){px=0;pz=candidate;distance=Math.abs(candidate);}candidate=maxZ+radius-z;if(Math.abs(candidate)<distance){px=0;pz=candidate;}}
    out[0]+=px*cos-pz*sin;out[2]+=px*sin+pz*cos;
   }
  }
 }
 return out;
}
