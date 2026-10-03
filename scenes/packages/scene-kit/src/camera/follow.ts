import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import type { FollowOptions, Pose, RigHandle } from './core';
import { createOrbitController } from './orbit';

export interface ManagedFollow { handle: RigHandle; update(): void; dispose(): void }
export function createFollowController(camera: PerspectiveCamera, canvas: HTMLCanvasElement, root: HTMLElement, current: () => FollowOptions & { active: boolean }): ManagedFollow {
  // OrbitControls reads its camera before every pointer/wheel update. Keep that desired pose
  // separate: feeding it the collision-shortened view turns an ordinary drag into a zoom-in.
  const desiredCamera = new PerspectiveCamera().copy(camera, false);
  const orbit = createOrbitController(desiredCamera, canvas, root, () => ({ active: current().active, minDistance: current().minDistance, maxDistance: current().maxDistance, maxPolar: current().maxPolar, pan: false }));
  const target = new Vector3(), previous = new Vector3(), delta = new Vector3(), offset = new Vector3();
  const pose: Pose = { position: camera.position.toArray(), target: orbit.controls.target.toArray(), fov: camera.fov, roll: 0 };
  let initialized = false, visible = true, subject: Object3D | null = null, targetHeight = current().targetHeight;
  function update() {
    const options = current(), nextSubject = options.subject.current;
    orbit.controls.enabled = options.active;
    if (!options.active || !nextSubject) { initialized = false; if (!visible) { visible = true; options.obstruction?.onSubjectVisible(true); } return; }
    orbit.controls.minDistance = options.minDistance; orbit.controls.maxDistance = options.maxDistance;
    nextSubject.getWorldPosition(target); target.y += options.targetHeight;
    if (!initialized || subject !== nextSubject || targetHeight !== options.targetHeight) {
      desiredCamera.position.copy(target).add(offset.fromArray(options.offset()));
      desiredCamera.fov = options.fov; desiredCamera.updateProjectionMatrix(); orbit.controls.maxPolarAngle = options.maxPolar;
      initialized = true; subject = nextSubject; targetHeight = options.targetHeight;
    } else desiredCamera.position.add(delta.subVectors(target, previous));
    previous.copy(target); orbit.controls.target.copy(target);
    // User distance and polar bounds apply to the intended orbit, before collision pull-in.
    orbit.controls.update(); orbit.sync(); offset.subVectors(desiredCamera.position, target);
    const length = offset.length();
    let distance = length;
    if (options.obstruction) distance = Math.min(length, Math.max(options.obstruction.minDistance, options.obstruction.ray(target, desiredCamera.position) - options.obstruction.pad));
    camera.position.copy(target).addScaledVector(offset, distance / Math.max(1e-9, length));
    camera.quaternion.copy(desiredCamera.quaternion);
    if (camera.fov !== desiredCamera.fov) { camera.fov = desiredCamera.fov; camera.updateProjectionMatrix(); }
    camera.position.toArray(pose.position); target.toArray(pose.target); pose.fov = camera.fov;
    const nextVisible = distance >= (options.obstruction?.hideSubjectBelow ?? 0);
    if (visible !== nextVisible) { visible = nextVisible; options.obstruction?.onSubjectVisible(visible); }
  }
  const handle: RigHandle = {
    controls: orbit.controls, pose,
    setView(view) { orbit.handle.setView(view); update(); },
    zoomBy(factor) { orbit.handle.zoomBy(factor); update(); },
    panBy(dx, dz) { orbit.handle.panBy(dx, dz); update(); },
    reset() { orbit.handle.reset(); update(); },
  };
  return { handle, update, dispose() { orbit.dispose(); current().obstruction?.onSubjectVisible(true); } };
}
