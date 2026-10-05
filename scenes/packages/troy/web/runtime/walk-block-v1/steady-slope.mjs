// Experimental planar donor for shared walking cycles. Coordinates follow the
// rig's local +Z travel direction; slopes are rise per horizontal metre.
export function planarWalkFootprint(side,z,{cross=0,forward=0}={}) {
 if(!['left','right'].includes(side)||![z,cross,forward].every(Number.isFinite))throw Error('Invalid planar walk contact');
 const x=side==='left'?.095:-.095,length=Math.hypot(cross,1,forward);
 return {side,position:[x,.085+cross*x+forward*z,z],yaw:0,normal:[-cross/length,1/length,-forward/length]};
}
export function localWalkSlope(normal,yaw) {
 if(normal?.length!==3||!normal.every(Number.isFinite)||Math.abs(Math.hypot(...normal)-1)>1e-6||normal[1]<=0||!Number.isFinite(yaw))throw Error('Invalid walk normal');
 const x=-normal[0]/normal[1],z=-normal[2]/normal[1],c=Math.cos(yaw),s=Math.sin(yaw);
 return {cross:x*c-z*s,forward:x*s+z*c};
}
