import * as THREE from 'three/webgpu';

/** The fixed camera is the horizontal eye datum, not the pelvis origin.
 * Capture the authored rest eye once; following an animated head would add sway.
 * Only the consuming local body moves. Canonical geometry and camera stay intact.
 */
export function createFirstPersonBodyPlacement(root){
 const restEye=new THREE.Vector3(),offset=new THREE.Vector3(),eye=root.getObjectByName('camera_eye');
 root.updateWorldMatrix(true,true);if(eye){eye.getWorldPosition(restEye);root.worldToLocal(restEye);}restEye.y=0;
 return {place(position,heading){root.rotation.y=-heading;offset.copy(restEye).multiply(root.scale).applyQuaternion(root.quaternion);root.position.fromArray(position).sub(offset);}};
}
