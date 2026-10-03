import { Matrix4, Plane, Vector3, Vector4 } from 'three/webgpu';
import type { Camera, PerspectiveCamera, Scene } from 'three/webgpu';

interface Reflector { target: { matrixWorld: Matrix4 }; getVirtualCamera(camera: Camera): Camera }
/** r186's ReflectorNode replaces the near plane assuming standard depth. Correct
 * its virtual projection after Renderer updates the camera, before frustum setup.
 * Reversed WebGPU and WebGL EXT_clip_control both use the [0,1] clip interval. */
export function installReflectionDepth(scene: Scene, reflector: Reflector) {
  const previous = scene.onBeforeRender;
  const plane = new Plane(), normal = new Vector3(), point = new Vector3(), rotation = new Matrix4(), clip = new Vector4(), q = new Vector4();
  let main: PerspectiveCamera | null = null, disposed = false;
  const before: Scene['onBeforeRender'] = function(this: Scene, ...args) {
    previous.apply(this, args);
    const [renderer, , camera] = args;
    if (disposed || !(renderer as unknown as { reversedDepthBuffer?: boolean }).reversedDepthBuffer || !main || camera === main || camera !== reflector.getVirtualCamera(main)) return;
    const p = camera.projectionMatrix, e = p.elements, r = main.projectionMatrix.elements;
    p.copy(main.projectionMatrix);
    // Recover the standard zero-to-one projection, then apply its oblique plane.
    e[2] = r[3]! - r[2]!; e[6] = r[7]! - r[6]!; e[10] = r[11]! - r[10]!; e[14] = r[15]! - r[14]!;
    normal.set(0, 0, 1).applyMatrix4(rotation.extractRotation(reflector.target.matrixWorld));
    point.setFromMatrixPosition(reflector.target.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, point).applyMatrix4(camera.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    q.set((Math.sign(clip.x) + e[8]!) / e[0]!, (Math.sign(clip.y) + e[9]!) / e[5]!, -1, (1 + e[10]!) / e[14]!);
    clip.multiplyScalar(1 / clip.dot(q));
    // Reverse row three again: water is the near plane (z=w).
    e[2] = e[3]! - clip.x; e[6] = e[7]! - clip.y; e[10] = e[11]! - clip.z; e[14] = e[15]! - clip.w;
    camera.projectionMatrixInverse.copy(p).invert();
  };
  scene.onBeforeRender = before;
  return {
    setCamera(camera: PerspectiveCamera) { if (!disposed) main = camera; },
    dispose() { disposed = true; main = null; if (scene.onBeforeRender === before) scene.onBeforeRender = previous; },
  };
}
