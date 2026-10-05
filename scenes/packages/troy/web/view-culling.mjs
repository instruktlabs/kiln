// Explicit scene contract: every shadow receiver lies at or above receiverFloorY.
// Project the caster box along directional light to that floor. Its convex sweep
// encloses any shadow on an intervening receiver; the AABB can only over-include.
export function intersectsViewOrShadow(T,frustum,bounds,{receiverFloorY,lightDirection,castsShadow=true}){
 if(!Number.isFinite(receiverFloorY)||!lightDirection?.toArray().every(Number.isFinite)||lightDirection.y>=0)throw Error('Invalid directional shadow contract');
 if(bounds.isEmpty())return true;
 if(frustum.intersectsBox(bounds))return true;
 if(!castsShadow)return false;
 if(bounds.min.y<receiverFloorY)return true;
 const swept=bounds.clone(),point=new T.Vector3();for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){point.set(x,y,z).addScaledVector(lightDirection,(receiverFloorY-y)/lightDirection.y);swept.expandByPoint(point);}
 return frustum.intersectsBox(swept);
}
export function createViewCuller(T,{receiverFloorY,lightDirection}){
 const frustum=new T.Frustum(),projection=new T.Matrix4();return {prepare(camera){camera.updateMatrixWorld(true);projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection,camera.coordinateSystem,camera.reversedDepth);},visible:bounds=>intersectsViewOrShadow(T,frustum,bounds,{receiverFloorY,lightDirection})};
}
