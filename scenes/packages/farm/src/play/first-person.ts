import { Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';

/** A walking eye has no orbit radius. Avatar yaw only seeds the initial heading. */
export function createFirstPersonPose() {
  let yaw = 0, pitch = 0;
  const target = new Vector3();
  return {
    reset(heading: number) { yaw = heading; pitch = 0; },
    update(camera: PerspectiveCamera, position: Vector3, look: { x: number; y: number }) {
      yaw -= look.x; pitch = Math.max(-Math.PI / 2 + .05, Math.min(Math.PI / 2 - .05, pitch - look.y));
      camera.position.copy(position); camera.position.y += 1.72;
      target.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.sin(yaw) * Math.cos(pitch)).add(camera.position);
      camera.up.set(0, 1, 0); camera.lookAt(target);
      if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); }
    },
  };
}

/** Own only this canvas's lock; native Escape releases it even when no key event is delivered. */
export function bindWalkCapture(canvas: HTMLCanvasElement, options: {
  active(): boolean; look: { x: number; y: number }; onCaptured(value: boolean): void; onExit(): void;
}) {
  const doc = canvas.ownerDocument;
  let captured = false, releasing = false, disposed = false;
  const changed = () => {
    const next = doc.pointerLockElement === canvas, previous = captured;
    captured = next; options.onCaptured(next);
    if (previous && !next && !releasing && options.active()) options.onExit();
  };
  const mouse = (event: MouseEvent) => {
    if (!captured || !options.active()) return;
    options.look.x += event.movementX * .0025; options.look.y += event.movementY * .0025;
  };
  const request = async () => {
    if (disposed || !options.active() || !canvas.requestPointerLock) return;
    try { await canvas.requestPointerLock(); } catch { options.onCaptured(false); }
  };
  const down = (event: PointerEvent) => { if (event.pointerType === 'mouse' && event.button === 0) void request(); };
  const wheel = (event: WheelEvent) => { if (options.active()) { event.preventDefault(); event.stopPropagation(); } };
  const release = () => { releasing = true; if (doc.pointerLockElement === canvas) doc.exitPointerLock(); releasing = false; };
  doc.addEventListener('pointerlockchange', changed); doc.addEventListener('mousemove', mouse);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('wheel', wheel, { passive: false });
  return { request, release, dispose() {
    disposed = true; doc.removeEventListener('pointerlockchange', changed); doc.removeEventListener('mousemove', mouse);
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('wheel', wheel); release(); options.onCaptured(false);
  } };
}
