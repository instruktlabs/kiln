import * as THREE from 'three/webgpu';
/** Exact authored marker closure; tool geometry stays in its own asset frame. */
export function attachAtSocket(socket,toolRoot,toolGrip){
 if(!socket||!toolRoot||!toolGrip)throw Error('Tool attachment requires both declared grip frames.');
 toolRoot.updateWorldMatrix(true,true);
 const localGrip=new THREE.Matrix4().copy(toolRoot.matrixWorld).invert().multiply(toolGrip.matrixWorld),placement=localGrip.invert();
 socket.add(toolRoot);placement.decompose(toolRoot.position,toolRoot.quaternion,toolRoot.scale);toolRoot.updateMatrix();
}
