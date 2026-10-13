/** Consumer policy for saved Nightman r_3f04...; not an engine/material rule.
 * Matrices are world matrices sampled at the selected native Strike phase.
 * Root position and forward are world-space; PLAYER is feet-origin standing.
 */
export const NIGHTMAN_CONTACT=Object.freeze({playerStop:1.45,playerMaxDistance:1.6,windowStop:1.3,windowMaxDistance:1.4,facingDot:Math.cos(Math.PI/6),playerTime:.18,boardTimes:Object.freeze([.18,.12,.04])});
export const HAND_CONTACT_VOLUME=Object.freeze({min:Object.freeze([-.13,-.26,-.13]),max:Object.freeze([.13,.04,.13])});
const wristNames=['Nightman_L_Wrist','Nightman_R_Wrist'],epsilon=1e-9;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function vector(v,label){const a=v?.length===3?[...v]:[v?.x,v?.y,v?.z];if(!a.every(Number.isFinite))throw TypeError(label+' requires three finite coordinates');return a;}
function box(min,max){min=vector(min,'box minimum');max=vector(max,'box maximum');if(min.some((v,i)=>v>max[i]))throw RangeError('box minimum must not exceed maximum');return {min,max};}
function rigid(matrix,label){
 const m=matrix?.elements??matrix;if(m?.length!==16||!Array.from(m).every(Number.isFinite))throw TypeError(label+' requires a finite16element world matrix');
 if(Math.abs(m[3])+Math.abs(m[7])+Math.abs(m[11])+Math.abs(m[15]-1)>1e-8)throw RangeError(label+' requires an affine matrix');
 const columns=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]],lengths=columns.map(c=>Math.hypot(...c));
 if(lengths.some(s=>s<1e-8))throw RangeError(label+' has singular scale');
 const axes=columns.map((c,i)=>c.map(v=>v/lengths[i]));
 if(Math.abs(dot(axes[0],axes[1]))>1e-6||Math.abs(dot(axes[0],axes[2]))>1e-6||Math.abs(dot(axes[1],axes[2]))>1e-6)throw RangeError(label+' requires orthogonal axes (no shear)');
 if(lengths.some(s=>Math.abs(s-lengths[0])>lengths[0]*1e-6))throw RangeError(label+' requires uniform scale');
 if(dot(axes[0],cross(axes[1],axes[2]))<1-1e-6)throw RangeError(label+' requires a proper rigid rotation');
 const translation=[m[12],m[13],m[14]],scale=lengths[0];return {axes,translation,scale,local(p){const d=sub(p,translation);return axes.map(a=>dot(a,d)/scale);},world(p){return translation.map((v,i)=>v+columns.reduce((s,c,k)=>s+c[i]*p[k],0));}};
}
function hands(wrists){return wristNames.map(name=>rigid(wrists?.[name],name));}
function guard(root,target,maxDistance){
 const p=vector(root?.position,'root world position'),f=vector(root?.forward,'root world forward'),d=sub(target,p),distance=Math.hypot(d[0],d[2]),length=Math.hypot(f[0],f[2]);
 if(length<1e-8||Math.abs(f[1])>1e-6)throw RangeError('root forward must be nonzero and horizontal');
 return distance<=maxDistance+epsilon&&(distance<1e-8||(d[0]*f[0]+d[2]*f[2])/(distance*length)>=NIGHTMAN_CONTACT.facingDot-epsilon);
}
/** Exact convex piecewise-quadratic minimum over t in[0,1]; at most8breakpoints. */
export function segmentToAabbDistanceSquared(start,end,min,max){
 const a=vector(start,'segment start'),b=vector(end,'segment end'),bounds=box(min,max),d=sub(b,a),breaks=[0,1];
 if(!d.every(Number.isFinite))throw RangeError('segment delta must be finite');
 for(let i=0;i<3;i++)if(d[i]!==0)for(const boundary of [bounds.min[i],bounds.max[i]]){const t=(boundary-a[i])/d[i];if(t>0&&t<1)breaks.push(t);}
 breaks.sort((a,b)=>a-b);
 const distance=t=>a.reduce((sum,v,i)=>{const p=v+d[i]*t,e=p<bounds.min[i]?p-bounds.min[i]:p>bounds.max[i]?p-bounds.max[i]:0;return sum+e*e;},0);
 let best=Infinity;
 for(let j=0;j<breaks.length-1;j++){
  const lo=breaks[j],hi=breaks[j+1],mid=(lo+hi)/2;let A=0,B=0;
  for(let i=0;i<3;i++){const p=a[i]+d[i]*mid;if(p>=bounds.min[i]&&p<=bounds.max[i])continue;const boundary=p<bounds.min[i]?bounds.min[i]:bounds.max[i];A+=d[i]*d[i];B+=d[i]*(a[i]-boundary);}
  const t=A?Math.max(lo,Math.min(hi,-B/A)):lo;best=Math.min(best,distance(lo),distance(hi),distance(t));
 }
 return best;
}
export function nightmanPlayerContact({wrists,root,feet,player}){
 const frames=hands(wrists),p=vector(feet,'player feet'),radius=player?.radius,height=player?.height;
 if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(height)||height<2*radius)throw RangeError('standing capsule requires positive radius and height>=2radius');
 if(!guard(root,p,NIGHTMAN_CONTACT.playerMaxDistance))return false;
 const a=[p[0],p[1]+radius,p[2]],b=[p[0],p[1]+height-radius,p[2]];
 return frames.some(frame=>segmentToAabbDistanceSquared(frame.local(a),frame.local(b),HAND_CONTACT_VOLUME.min,HAND_CONTACT_VOLUME.max)<=((radius+epsilon)/frame.scale)**2);
}
function obbIntersectsBox(frame,bounds){
 const localCentre=HAND_CONTACT_VOLUME.min.map((v,i)=>(v+HAND_CONTACT_VOLUME.max[i])/2),centre=frame.world(localCentre),half=HAND_CONTACT_VOLUME.min.map((v,i)=>(HAND_CONTACT_VOLUME.max[i]-v)*frame.scale/2),bc=bounds.min.map((v,i)=>(v+bounds.max[i])/2),bh=bounds.min.map((v,i)=>(bounds.max[i]-v)/2),delta=sub(bc,centre),worldAxes=[[1,0,0],[0,1,0],[0,0,1]],axes=[...frame.axes,...worldAxes];
 for(const a of frame.axes)for(const b of worldAxes)axes.push(cross(a,b));
 for(const axis of axes){const length=Math.hypot(...axis);if(length<1e-10)continue;const projected=Math.abs(dot(delta,axis)),a=half.reduce((sum,h,i)=>sum+h*Math.abs(dot(frame.axes[i],axis)),0),b=bh.reduce((sum,h,i)=>sum+h*Math.abs(axis[i]),0);if(projected>a+b+epsilon*length)return false;}
 return true;
}
/** Pass the selected actual board node's world Box3; caller owns board identity. */
export function nightmanBoardContact({wrists,root,target,boardBox,boardVisible}){
 const frames=hands(wrists),p=vector(target,'window sill centre'),bounds=box(boardBox?.min,boardBox?.max);
 if(boardVisible!==true||!guard(root,p,NIGHTMAN_CONTACT.windowMaxDistance))return false;
 return frames.some(frame=>obbIntersectsBox(frame,bounds));
}
