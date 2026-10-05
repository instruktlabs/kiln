// Contact against the actual indexed, axis-aligned grid. Construction curves
// and interpolated vertex normals are not the rendered triangle surface.
export function createGridGround(geometry){
 const p=geometry.attributes?.position,ix=geometry.index;
 if(!p||!ix||p.itemSize!==3||p.count<4)throw Error('Indexed ground grid required');
 let nx=1;while(nx<p.count&&p.getZ(nx)===p.getZ(0))nx++;
 const nz=p.count/nx;
 if(nx<2||!Number.isInteger(nz)||nz<2||ix.count!==6*(nx-1)*(nz-1))throw Error('Invalid ground grid dimensions');
 const xs=Array.from({length:nx},(_,i)=>p.getX(i)),zs=Array.from({length:nz},(_,i)=>p.getZ(i*nx));
 for(const values of [xs,zs])if(values.some((v,i)=>!Number.isFinite(v)||(i>0&&v<=values[i-1])))throw Error('Ground grid axes must increase');
 for(let r=0;r<nz;r++)for(let c=0;c<nx;c++){const i=r*nx+c;if(p.getX(i)!==xs[c]||p.getZ(i)!==zs[r]||!Number.isFinite(p.getY(i)))throw Error('Invalid ground grid vertex');}
 for(let r=0;r<nz-1;r++)for(let c=0;c<nx-1;c++){
  const a=r*nx+c,b=a+1,d=a+nx+1,cc=a+nx,k=(r*(nx-1)+c)*6,ids=Array.from({length:6},(_,i)=>ix.getX(k+i)),corners=[a,b,cc,d];
  if(ids.some(i=>!corners.includes(i))||new Set(ids.slice(0,3)).size!==3||new Set(ids.slice(3)).size!==3||new Set(ids).size!==4)throw Error('Invalid ground grid cell');
  const shared=ids.slice(0,3).filter(i=>ids.slice(3).includes(i));
  if(shared.length!==2||!((shared.includes(a)&&shared.includes(d))||(shared.includes(b)&&shared.includes(cc))))throw Error('Invalid ground grid cell diagonal');
 }
 const bounds=Object.freeze({minX:xs[0],maxX:xs.at(-1),minZ:zs[0],maxZ:zs.at(-1)});
 function cell(values,value){let lo=0,hi=values.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(values[mid]<value)lo=mid+1;else hi=mid;}return Math.max(0,lo-1);}
 function hit(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))throw Error('Ground coordinates must be finite');
  if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ)return null;
  const c=cell(xs,x),r=cell(zs,z);let result=null;
  // Shared grid edges can admit both neighbours. Keep source triangle order
  // and choose the highest accepted surface, including floating point ties.
  for(let rr=r;rr<=Math.min(r+1,nz-2);rr++)for(let col=c;col<=Math.min(c+1,nx-2);col++){
   const k=(rr*(nx-1)+col)*6;
   for(let t=0;t<6;t+=3){
    const ai=ix.getX(k+t),bi=ix.getX(k+t+1),ci=ix.getX(k+t+2),ax=p.getX(ai),ay=p.getY(ai),az=p.getZ(ai),ex=p.getX(bi)-ax,ey=p.getY(bi)-ay,ez=p.getZ(bi)-az,fx=p.getX(ci)-ax,fy=p.getY(ci)-ay,fz=p.getZ(ci)-az,det=ex*fz-ez*fx;
    const u=((x-ax)*fz-(z-az)*fx)/det,v=(ex*(z-az)-ez*(x-ax))/det;
    if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8){const height=ay+u*ey+v*fy;if(!result||height>result.height){let normal=[ey*fz-ez*fy,-det,ex*fy-ey*fx];const scale=(normal[1]<0?-1:1)/Math.hypot(...normal);normal=normal.map(n=>n*scale);result={height,normal};}}
   }
  }
  return result;
 }
 return {bounds,hit,heightAt(x,z){const contact=hit(x,z);if(!contact)throw Error('Ground coordinates outside grid');return contact.height;}};
}
