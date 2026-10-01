import { PerspectiveCamera, Vector3, TOUCH } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyOrbitClamps, clampOrbitZoom } from './core';
import type { OrbitOptions, Pose, RigHandle } from './core';
import { createScopedControlsElement } from './scoped-controls';
function newPose(): Pose { return { position: [0, 0, 0], target: [0, 0, 0], roll: 0 }; }
function cameraPose(camera: PerspectiveCamera, controls: OrbitControls, pose: Pose): void { camera.position.toArray(pose.position); controls.target.toArray(pose.target); pose.fov = camera.fov; pose.roll = 0; }
export interface ManagedOrbit { controls: OrbitControls; handle: RigHandle; dispose(): void; sync(): void }
export function createOrbitController(camera: PerspectiveCamera, canvas: HTMLCanvasElement, root: HTMLElement, options: () => OrbitOptions): ManagedOrbit {
  const beforePosition = camera.position.clone(), beforeQuaternion = camera.quaternion.clone();
  const controls = new OrbitControls(camera, createScopedControlsElement(canvas, root));
  controls.enableDamping = false; controls.minDistance = options().minDistance ?? 3; controls.maxDistance = options().maxDistance ?? 160;
  controls.maxPolarAngle = options().maxPolar ?? Math.PI * .495; controls.enablePan = options().pan ?? true;
  controls.enabled = options().active !== false;
  controls.touches.ONE = TOUCH.ROTATE; controls.touches.TWO = controls.enablePan ? TOUCH.DOLLY_PAN : TOUCH.DOLLY_ROTATE;
  if (options().target) controls.target.fromArray(options().target!);
  if (controls.enabled) controls.update();
  else { camera.position.copy(beforePosition); camera.quaternion.copy(beforeQuaternion); }
  const pose = newPose(), home = newPose(), offset = new Vector3(), shift = new Vector3(), right = new Vector3(), up = new Vector3();
  cameraPose(camera, controls, home); const homePolar = controls.maxPolarAngle;
  const sync = () => { applyOrbitClamps(camera, controls.target, options()); camera.lookAt(controls.target); cameraPose(camera, controls, pose); };
  const start = () => options().onStart?.(); controls.addEventListener('start', start);
  const handle: RigHandle = {
    controls, pose,
    setView(view) {
      camera.position.fromArray(view.position); controls.target.fromArray(view.target); camera.up.set(0, 1, 0);
      if (view.fov !== undefined && camera.fov !== view.fov) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
      if (view.maxPolar !== undefined) controls.maxPolarAngle = view.maxPolar;
      controls.update(); sync();
    },
    zoomBy(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      start(); offset.subVectors(camera.position, controls.target); const length = offset.length();
      const distance = clampOrbitZoom(length, factor, controls.minDistance, controls.maxDistance);
      if (length > 1e-9) camera.position.copy(controls.target).addScaledVector(offset, distance / length);
      controls.update(); sync();
    },
    panBy(dx, dz) {
      if (!controls.enablePan || !Number.isFinite(dx) || !Number.isFinite(dz)) return;
      start(); camera.updateMatrixWorld(); right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
      shift.copy(right).multiplyScalar(dx).addScaledVector(up, dz).multiplyScalar(camera.position.distanceTo(controls.target) * .12);
      camera.position.add(shift); controls.target.add(shift); controls.update(); sync();
    },
    reset() { start(); handle.setView({ ...home, maxPolar: homePolar }); },
  };
  if (controls.enabled) sync(); else cameraPose(camera, controls, pose);
  return { controls, handle, sync, dispose() { controls.removeEventListener('start', start); controls.dispose(); } };
}
