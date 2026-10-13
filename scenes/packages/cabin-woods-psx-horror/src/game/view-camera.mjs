/** Scene-owned review cameras; never part of a standalone asset's contract. */
export const OVERVIEW_CAMERA=Object.freeze({position:Object.freeze([20,16,22]),target:Object.freeze([1,1,0]),fov:50,near:.1});
export function initialCameraMode({benchmark=false,camera=null}={}){
 if(!benchmark)return 'overview';
 if(camera!==null&&!['overview','caretaker'].includes(camera))throw Error(`Unknown benchmark camera: ${camera}`);
 return camera??'caretaker';
}
export function applyOverviewCamera(camera,lighting){
 camera.position.fromArray(OVERVIEW_CAMERA.position);camera.lookAt(...OVERVIEW_CAMERA.target);
 camera.fov=OVERVIEW_CAMERA.fov;camera.near=OVERVIEW_CAMERA.near;camera.far=lighting==='game'?76:125;camera.zoom=1;camera.updateProjectionMatrix();
 return camera;
}
