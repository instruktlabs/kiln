import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { PerspectiveCamera } from 'three/webgpu';
import { OrbitRig, SystemOrder, useInput, usePlayMode, useRegisterTestHooks, useSceneRootRef, useSystem } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import { colliderTriangles } from './collision';
import type { TownSession } from './session';
import { createEyeSim, eyePosition, resetEyeSim, stepEyes, walkRules } from './walk';
import { bindWalkExit } from './walk-controls';

const LOOK_SENSITIVITY = 0.0032;
const MAX_POLAR = Math.PI * 0.49;
const WALK_FOV = 68;

/**
 * Dev pages only: when `window.__seedTownShot` names a picture, post the next finished frame to the dev server as a PNG.
 * The read happens in the animation frame after this one, once the kit has drawn it, while the canvas still holds it.
 */
function captureFrame(canvas: HTMLCanvasElement, element: HTMLElement): void {
  const page = window as unknown as { __seedTownShot?: string | null };
  const name = page.__seedTownShot;
  if (!name) return;
  page.__seedTownShot = null;
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.toBlob(blob => {
    if (!blob) { element.dataset.shot = `${name}: no image`; return; }
    void fetch(`/__capture?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob })
      .then(response => { element.dataset.shot = response.ok ? `${name}: ${canvas.width}x${canvas.height}` : `${name}: ${response.status}`; });
  }, 'image/png')));
}

/** Orbit until play starts. Walking is the kit's play mode: a click captures the mouse, Escape leaves. */
export function Eyes({ session }: { session: TownSession }) {
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const input = useInput();
  const { playing, setPlaying } = usePlayMode();
  const root = useSceneRootRef();
  const sim = useMemo(() => createEyeSim(), []);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const wasPlaying = useRef(false);
  const framed = useRef(-1), walked = useRef(-1);
  const saved = useRef<{ position: Vec3; target: Vec3; fov?: number } | null>(null);
  const pointerLook = useRef({ x: 0, y: 0 });
  const frames = useRef({ values: new Float64Array(120), at: 0, count: 0, last: 0, publish: 0 });

  useEffect(() => {
    const previous = scene.onAfterRender;
    const after: typeof scene.onAfterRender = function (this: typeof scene, ...args) {
      previous.apply(this, args);
      if (args[2] !== camera || !root.current) return;
      // The kit resets renderer.info before systems run; read only the finished main camera pass.
      const render = gl.info.render as { calls: number; drawCalls?: number; triangles: number };
      root.current.dataset.renderDrawCalls = String(render.drawCalls ?? render.calls);
      root.current.dataset.renderTriangles = String(render.triangles);
      if (import.meta.env.KILN_DEV) captureFrame(gl.domElement, root.current);
    };
    scene.onAfterRender = after;
    return () => { if (scene.onAfterRender === after) scene.onAfterRender = previous; };
  }, [scene, gl, camera, root]);

  useEffect(() => {
    const canvas = gl.domElement;
    const doc = canvas.ownerDocument;
    const element = root.current;
    const unbindExit = element ? bindWalkExit(element, canvas, () => playingRef.current, () => setPlaying(false)) : () => {};
    const down = (event: PointerEvent) => {
      if (!playingRef.current || event.button !== 0) return;
      if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
      if ((event.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      if (doc.pointerLockElement === canvas) return;
      try {
        const result = canvas.requestPointerLock() as void | Promise<void>;
        if (result && typeof (result as Promise<void>).catch === 'function') void (result as Promise<void>).catch(() => {});
      } catch { /* The browser can deny the lock; dragging still looks. */ }
    };
    const move = (event: MouseEvent) => {
      if (doc.pointerLockElement !== canvas) return;
      pointerLook.current.x += event.movementX;
      pointerLook.current.y += event.movementY;
    };
    element?.addEventListener('pointerdown', down);
    doc.addEventListener('mousemove', move);
    return () => {
      element?.removeEventListener('pointerdown', down);
      doc.removeEventListener('mousemove', move);
      unbindExit();
      if (doc.pointerLockElement === canvas) doc.exitPointerLock();
    };
  }, [gl, root, setPlaying]);

  const hooks = useMemo(() => ({
    placeEyes: (x: number, y: number, z: number, yaw: number, pitch = 0) => {
      sim.mover.position.set(x, y, z);
      sim.mover.velocityY = 0;
      sim.lookYaw = yaw;
      sim.pitch = pitch;
      return eyePosition(sim.mover);
    },
    eyes: () => ({ ...eyePosition(sim.mover), feetY: sim.mover.position.y, yaw: sim.lookYaw }),
    setTown: (seed: string, dusk?: boolean) => { session.set({ seed, ...(dusk === undefined ? {} : { dusk }) }); return session.getState(); },
    town: () => ({ state: session.getState(), info: session.getInfo(), revision: session.revision, frame: session.frame }),
    walk: (on: boolean) => { setPlaying(on); return on; },
    view: (id: string) => {
      const view = session.frame?.views.find(item => item.id === id);
      if (view) session.orbit.current?.setView({ position: [...view.position], target: [...view.target], fov: view.fov, maxPolar: Math.PI * .99 });
      return !!view;
    },
  }), [sim, session, setPlaying]);
  useRegisterTestHooks(hooks);

  // Each new town is first shown whole, from the planner's own overview camera.
  useSystem('seed-town-opening-frame', SystemOrder.path, () => {
    const frame = session.frame, rig = session.orbit.current;
    if (!frame || !rig || framed.current === session.revision || playingRef.current) return;
    rig.setView({ position: [...frame.orbit.position], target: [...frame.orbit.target], fov: frame.orbit.fov, maxPolar: MAX_POLAR });
    framed.current = session.revision;
  });

  useSystem('seed-town-eyes', SystemOrder.camera + 1, dt => {
    const element = root.current;
    const canvas = gl.domElement;
    const locked = canvas.ownerDocument.pointerLockElement === canvas;
    if (element) {
      const stats = frames.current, now = performance.now();
      if (canvas.ownerDocument.visibilityState !== 'visible') {
        stats.last = 0; stats.count = 0; stats.at = 0;
      } else {
        if (stats.last) {
          stats.values[stats.at] = now - stats.last;
          stats.at = (stats.at + 1) % stats.values.length;
          stats.count = Math.min(stats.values.length, stats.count + 1);
        }
        stats.last = now;
      }
      if (++stats.publish % 30 === 0 && stats.count) {
        const values = Array.from(stats.values.slice(0, stats.count)).sort((a, b) => a - b);
        element.dataset.frameSamples = String(values.length);
        element.dataset.frameMeanMs = (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
        element.dataset.frameP95Ms = values[Math.ceil(values.length * .95) - 1]!.toFixed(2);
      }
      const info = session.getInfo();
      element.dataset.mode = playingRef.current ? 'walk' : 'orbit';
      element.dataset.locked = String(locked);
      element.dataset.seed = session.getState().seed;
      element.dataset.dusk = String(session.getState().dusk);
      element.dataset.buildings = String(info?.buildings ?? 0);
      element.dataset.placements = String(info?.placements ?? 0);
      element.dataset.draws = String(info?.draws ?? 0);
      element.dataset.triangles = String(info?.triangles ?? 0);
      element.dataset.buildMs = (info?.buildMs ?? 0).toFixed(1);
      element.dataset.collisionTriangles = String(session.collision ? colliderTriangles(session.collision) : 0);
      element.dataset.cx = camera.position.x.toFixed(2);
      element.dataset.cy = camera.position.y.toFixed(2);
      element.dataset.cz = camera.position.z.toFixed(2);
    }
    const frame = session.frame, collision = session.collision;
    if (!frame || !collision) return;
    const entering = playingRef.current && !wasPlaying.current;
    if (entering) {
      const rig = session.orbit.current;
      if (rig) saved.current = { position: [...rig.pose.position] as Vec3, target: [...rig.pose.target] as Vec3, fov: rig.pose.fov };
    } else if (!playingRef.current && wasPlaying.current) {
      if (canvas.ownerDocument.pointerLockElement === canvas) canvas.ownerDocument.exitPointerLock();
      // A town that changed while walking is framed afresh by the opening system instead.
      if (saved.current && framed.current === session.revision) session.orbit.current?.setView({ ...saved.current, maxPolar: MAX_POLAR });
    }
    wasPlaying.current = playingRef.current;
    if (!playingRef.current) return;
    // Start at the town's gate on entering, and again when a new town stands up under the walker.
    if (entering || walked.current !== session.revision) {
      resetEyeSim(sim, frame);
      pointerLook.current.x = 0;
      pointerLook.current.y = 0;
      walked.current = session.revision;
      framed.current = -1;
    }
    // Pointer movement to the right turns right; a positive yaw turns this camera left.
    const lookX = -(locked ? pointerLook.current.x * LOOK_SENSITIVITY : input.state.look.x);
    const lookY = locked ? -pointerLook.current.y * LOOK_SENSITIVITY : -input.state.look.y;
    pointerLook.current.x = 0;
    pointerLook.current.y = 0;
    if (input.enabled) stepEyes(sim, { move: input.state.move, run: input.state.run, lookX, lookY }, dt, collision, walkRules(frame));
    const eye = eyePosition(sim.mover);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = sim.lookYaw;
    camera.rotation.x = sim.pitch;
    camera.rotation.z = 0;
    if (camera.fov !== WALK_FOV) { camera.fov = WALK_FOV; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  });

  return <OrbitRig rigRef={session.orbit} active={!playing} target={[0, 2, 0]} minDistance={12} maxDistance={420} maxPolar={MAX_POLAR} />;
}
