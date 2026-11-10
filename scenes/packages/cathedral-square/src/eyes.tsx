import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Vector3, type PerspectiveCamera } from 'three/webgpu';
import { OrbitRig, SystemOrder, useInput, usePlayMode, useRegisterTestHooks, useSceneRootRef, useSystem } from '@kiln-scenes/scene-kit';
import type { Vec3 } from '@kiln-scenes/scene-kit';
import { ORBIT_VIEW, lookDirection } from './layout';
import { orbitRig } from './orbit';
import { createEyeSim, eyePosition, resetEyeSim, stepEyes } from './walk';
import { squareCollision, squareLightStats, townStats } from './world';
import { colliderTriangles } from './colliders';
import { bindWalkExit } from './walk-controls';

const LOOK_SENSITIVITY = 0.0032;
const MAX_POLAR = Math.PI * 0.49;
const lookForward = new Vector3();

/** Orbit until play starts. Walk is the kit's play mode: click locks the mouse, Escape leaves. */
export function Eyes() {
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const input = useInput();
  const { playing, setPlaying } = usePlayMode();
  const root = useSceneRootRef();
  const session = useMemo(() => ({ sim: createEyeSim() }), []);
  const live = useRef(session);
  live.current = session;
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const wasPlaying = useRef(false);
  const framed = useRef(false);
  const saved = useRef<{ position: Vec3; target: Vec3; fov?: number } | null>(null);
  const pointerLook = useRef({ x: 0, y: 0 });
  const frameStats = useRef({ values: new Float64Array(120), at: 0, count: 0, last: 0, publish: 0 });

  useEffect(() => {
    const previous = scene.onAfterRender;
    const after: typeof scene.onAfterRender = function (this: typeof scene, ...args) {
      previous.apply(this, args);
      if (args[2] !== camera || !root.current) return;
      // The kit resets renderer.info before systems run; observe only the completed main camera pass.
      const render = gl.info.render as { calls: number; drawCalls?: number; triangles: number };
      root.current.dataset.renderDrawCalls = String(render.drawCalls ?? render.calls);
      root.current.dataset.renderTriangles = String(render.triangles);
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
      } catch { /* The browser can deny lock; drag look still works. */ }
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
    placeEyes: (x: number, y: number, z: number, yaw: number) => {
      const sim = live.current?.sim;
      if (!sim) return null;
      sim.mover.position.set(x, y, z);
      sim.mover.velocityY = 0;
      sim.lookYaw = yaw;
      sim.pitch = 0;
      return eyePosition(sim.mover);
    },
    eyes: () => {
      const sim = live.current?.sim;
      if (!sim) return null;
      const eye = eyePosition(sim.mover);
      return { ...eye, feetY: sim.mover.position.y, yaw: sim.lookYaw };
    },
  }), []);
  useRegisterTestHooks(hooks);

  useSystem('opening-frame', SystemOrder.path, () => {
    if (framed.current || playingRef.current) return;
    const rig = orbitRig.current;
    if (!rig) return;
    rig.setView({ position: [...ORBIT_VIEW.position], target: [...ORBIT_VIEW.target], fov: ORBIT_VIEW.fov, maxPolar: MAX_POLAR });
    framed.current = true;
  });

  useSystem('eyes', SystemOrder.camera + 1, dt => {
    const current = live.current;
    const element = root.current;
    const canvas = gl.domElement;
    const locked = canvas.ownerDocument.pointerLockElement === canvas;
    if (element) {
      const frames = frameStats.current;
      const now = performance.now();
      if (canvas.ownerDocument.visibilityState !== 'visible') {
        frames.last = 0; frames.count = 0; frames.at = 0;
      } else {
        if (frames.last) {
          frames.values[frames.at] = now - frames.last;
          frames.at = (frames.at + 1) % frames.values.length;
          frames.count = Math.min(frames.values.length, frames.count + 1);
        }
        frames.last = now;
      }
      if (++frames.publish % 30 === 0 && frames.count) {
        const values = Array.from(frames.values.slice(0, frames.count)).sort((a, b) => a - b);
        element.dataset.frameSamples = String(values.length);
        element.dataset.frameMeanMs = (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
        element.dataset.frameP95Ms = values[Math.ceil(values.length * .95) - 1]!.toFixed(2);
      }
      element.dataset.mode = playingRef.current ? 'walk' : 'orbit';
      element.dataset.locked = String(locked);
      element.dataset.houses = String(townStats.houses);
      element.dataset.streets = String(townStats.streets);
      element.dataset.blocks = String(townStats.blocks);
      element.dataset.draws = String(townStats.draws);
      element.dataset.triangles = String(Math.round(townStats.triangles));
      element.dataset.collisionTriangles = String(squareCollision ? colliderTriangles(squareCollision) : 0);
      element.dataset.lightSamples = String(squareLightStats?.samples ?? 0);
      element.dataset.lightLitSamples = String(squareLightStats?.litSamples ?? 0);
      element.dataset.lightBounds = JSON.stringify(squareLightStats?.litBounds ?? null);
      element.dataset.cx = camera.position.x.toFixed(2);
      element.dataset.cy = camera.position.y.toFixed(2);
      element.dataset.cz = camera.position.z.toFixed(2);
      const direction = lookDirection(current?.sim.lookYaw ?? 0);
      camera.getWorldDirection(lookForward);
      element.dataset.look = `${lookForward.x.toFixed(3)},${lookForward.y.toFixed(3)},${lookForward.z.toFixed(3)}`;
      element.dataset.yawLook = `${direction.x.toFixed(3)},${direction.z.toFixed(3)}`;
    }
    if (!current) return;
    if (playingRef.current && !wasPlaying.current) {
      const rig = orbitRig.current;
      if (rig) saved.current = { position: [...rig.pose.position] as Vec3, target: [...rig.pose.target] as Vec3, fov: rig.pose.fov };
      resetEyeSim(current.sim);
      pointerLook.current.x = 0;
      pointerLook.current.y = 0;
    } else if (!playingRef.current && wasPlaying.current) {
      if (canvas.ownerDocument.pointerLockElement === canvas) canvas.ownerDocument.exitPointerLock();
      if (saved.current) orbitRig.current?.setView({ ...saved.current, maxPolar: MAX_POLAR });
    }
    wasPlaying.current = playingRef.current;
    if (!playingRef.current) return;
    // +X pointer movement is to the right. Positive yaw turns this camera left, so walk look takes the opposite sign.
    const lockedLookX = -(locked ? pointerLook.current.x * LOOK_SENSITIVITY : input.state.look.x);
    const lockedLookY = locked ? -pointerLook.current.y * LOOK_SENSITIVITY : -input.state.look.y;
    pointerLook.current.x = 0;
    pointerLook.current.y = 0;
    if (input.enabled && squareCollision) stepEyes(current.sim, { move: input.state.move, run: input.state.run, lookX: lockedLookX, lookY: lockedLookY }, dt, squareCollision);
    const eye = eyePosition(current.sim.mover);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = current.sim.lookYaw;
    camera.rotation.x = current.sim.pitch;
    camera.rotation.z = 0;
    if (camera.fov !== 68) { camera.fov = 68; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  });

  return <OrbitRig
    rigRef={orbitRig}
    active={!playing}
    target={ORBIT_VIEW.target}
    minDistance={ORBIT_VIEW.minDistance}
    maxDistance={ORBIT_VIEW.maxDistance}
    maxPolar={MAX_POLAR}
  />;
}
