import { type Box3, type PerspectiveCamera, Vector3 } from 'three';

export type CameraView = { position: Vector3; target: Vector3 };

export function captureCameraView(camera: PerspectiveCamera, target: Vector3): CameraView {
  return { position: camera.position.clone(), target: target.clone() };
}

export function restoreCameraView(
  camera: PerspectiveCamera,
  target: Vector3,
  view: CameraView,
  bounds: Box3,
) {
  camera.position.copy(view.position);
  target.copy(view.target);
  const extent = Math.max(bounds.getSize(new Vector3()).length(), 0.001);
  camera.near = Math.min(0.01, Math.max(extent / 100000, 0.00001));
  camera.far = Math.max(
    camera.position.distanceTo(bounds.getCenter(new Vector3())) + extent * 20,
    10,
  );
  camera.updateProjectionMatrix();
}

/** Level free movement, scoped to the focused viewport by its caller. */
export function explorationOffset(
  camera: PerspectiveCamera,
  keys: ReadonlySet<string>,
  distance: number,
) {
  const forward = camera.getWorldDirection(new Vector3());
  forward.y = 0;
  if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
  forward.normalize();
  const right = forward.clone().cross(new Vector3(0, 1, 0));
  const offset = new Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) offset.add(forward);
  if (keys.has('KeyS') || keys.has('ArrowDown')) offset.sub(forward);
  if (keys.has('KeyD') || keys.has('ArrowRight')) offset.add(right);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) offset.sub(right);
  if (keys.has('KeyE')) offset.y++;
  if (keys.has('KeyQ')) offset.y--;
  return offset.normalize().multiplyScalar(distance);
}
