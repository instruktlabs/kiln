// Screen-space policy for an injected world-error budget. This does not certify
// that a particular derivative meets that budget; qualification owns that claim.
export function projectedMotionError(T,{camera,bounds,errorMetres,width,height,receiverFloorY,lightDirection}){
 if(!camera?.isPerspectiveCamera||bounds?.isEmpty()||![errorMetres,width,height,receiverFloorY].every(Number.isFinite)||errorMetres<0||width<=0||height<=0||!lightDirection?.toArray().every(Number.isFinite)||lightDirection.y>=0)throw Error('Invalid projected motion policy');
 if(errorMetres===0)return 0;if(bounds.min.y<receiverFloorY)return Infinity;
 let nearest=Infinity,maxRadius=0;const point=new T.Vector3(),shadow=new T.Vector3(),amplification=lightDirection.length()/Math.abs(lightDirection.y),error=errorMetres*amplification;
 const include=p=>{p.applyMatrix4(camera.matrixWorldInverse);const depth=-p.z;if(depth<=camera.near+error){nearest=-Infinity;return;}nearest=Math.min(nearest,depth);maxRadius=Math.max(maxRadius,Math.hypot(p.x,p.y)/depth);};
 for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){point.set(x,y,z);shadow.copy(point).addScaledVector(lightDirection,(receiverFloorY-y)/lightDirection.y);include(point);include(shadow);}
 if(nearest<=0)return Infinity;
 const focal=Math.max(width*Math.abs(camera.projectionMatrix.elements[0]),height*Math.abs(camera.projectionMatrix.elements[5]))/2;
 return focal*error*(1+maxRadius)/(nearest-error);
}
export function selectSharedMotion(errorPixels,previous,{enter=.5,exit=.75}={}){
 if(Number.isNaN(errorPixels)||errorPixels<0||![enter,exit].every(Number.isFinite)||enter<0||exit<=enter||typeof previous!=='boolean')throw Error('Invalid motion hysteresis');
 return errorPixels<=(previous?exit:enter);
}
