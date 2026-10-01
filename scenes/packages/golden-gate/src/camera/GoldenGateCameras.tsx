import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { LAYOUT } from '../data';
import { Box3, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { OrbitRig, PathRig, SystemOrder, usePlayMode, useSceneRootRef, useSystem } from '@kiln-scenes/scene-kit';
import type { PathHandle, Pose, Vec3 } from '@kiln-scenes/scene-kit';
import { CAMERA, NAMED_CAMERAS, POSTCARD } from '../constants';
import { surfaceHeight } from '../world/heightfield';
import type { GoldenGateWorld } from '../world/build-world';
import { useGoldenGateSession } from '../state';
import type { FlightName } from '../params';
import { buildFlights } from './flights';
import { useGoldenGateWorkloads } from './workloads';

export type CameraMode = 'orbit' | 'pose' | 'flight' | 'drive';
export interface CameraControl {
  readonly mode: CameraMode;
  /** Exact review pose (named camera); the first user input hands it back to the orbit. */
  setPose(pose: { position: Vec3; target: Vec3; fov: number }): void;
  setView(name: string): void;
  playFlight(name: FlightName): boolean;
  stopFlight(): void;
  /** Hands a review pose or a flyover back to the orbit (the measurement workloads). */
  toOrbit(): void;
  readonly flights: ReturnType<typeof buildFlights>;
}

const TARGET_BOUNDS = new Box3(new Vector3(-CAMERA.orbit.targetBounds, CAMERA.orbit.targetMinY, -CAMERA.orbit.targetBounds), new Vector3(CAMERA.orbit.targetBounds, CAMERA.orbit.targetMaxY, CAMERA.orbit.targetBounds));

/** Orbit target for an arbitrary pose: along the view direction, inside the orbit's limits. */
function orbitTargetFor(position: Vector3, target: Vector3): Vec3 {
  const direction = target.clone().sub(position), distance = Math.min(Math.max(direction.length(), CAMERA.orbit.minDistance * 1.5), CAMERA.orbit.maxDistance * .6);
  const t = position.clone().addScaledVector(direction.normalize(), distance).clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max);
  return [t.x, t.y, t.z];
}

export function GoldenGateCameras({ world, initialView, initialFlight, initialFlightAt = 0 }: { world: GoldenGateWorld; initialView: string; initialFlight?: FlightName; initialFlightAt?: number }) {
  const session = useGoldenGateSession(), camera = useThree(state => state.camera) as PerspectiveCamera, root = useSceneRootRef(), { playing } = usePlayMode();
  const [mode, setModeState] = useState<CameraMode>('orbit'), modeRef = useRef<CameraMode>('orbit'), path = useRef<PathHandle | null>(null), initialized = useRef(false);
  const pose = useRef<{ position: Vec3; target: Vec3; fov: number } | null>(null);
  const setMode = (next: CameraMode) => { modeRef.current = next; setModeState(next); session.hud.set({ flight: next === 'flight' ? path.current?.playing as FlightName ?? null : null }); };
  const flights = useMemo(() => buildFlights(world.field), [world]);
  const floor = useMemo(() => (x: number, z: number) => surfaceHeight(world.field, x, z), [world]);

  const handBack = (from: Pose | { position: Vec3; target: Vec3; fov?: number }) => {
    const rig = session.orbit.current; if (!rig) return;
    const position = new Vector3().fromArray(from.position), target = new Vector3().fromArray(from.target);
    rig.controls.minDistance = CAMERA.orbit.minDistance;
    rig.setView({ position: from.position, target: orbitTargetFor(position, target), fov: from.fov ?? POSTCARD.fov, maxPolar: CAMERA.orbit.maxPolar });
  };
  const control = useMemo<CameraControl>(() => ({
    get mode() { return modeRef.current; },
    setPose(p) { path.current?.stop(); pose.current = p; setMode('pose'); },
    setView(name) {
      const view = NAMED_CAMERAS[name]; if (!view) throw new Error(`Unknown Golden Gate camera: ${name}`);
      control.setPose({ position: view.position, target: view.target, fov: view.fov });
    },
    playFlight(name) {
      const info = flights.info[name]; if (!info || !path.current) return false;
      if (info.requiresPreset && session.presets?.target !== info.requiresPreset) return false;
      session.motion.setPaused(false);
      pose.current = null; setMode('flight'); session.hud.set({ flight: name }); path.current.play(name); return true;
    },
    stopFlight() { if (modeRef.current !== 'flight') return; const current = path.current?.pose; path.current?.stop(); setMode('orbit'); if (current) handBack(current); },
    toOrbit() {
      if (modeRef.current === 'flight') control.stopFlight();
      else if (modeRef.current === 'pose') { const p = pose.current; pose.current = null; setMode('orbit'); if (p) handBack(p); }
    },
    flights,
  }), [flights, session]);
  useEffect(() => { session.camera = control; return () => { if (session.camera === control) session.camera = undefined; }; }, [control, session]);
  // Performance workloads (SPEC 20): test and dev builds only; the flags are build constants.
  if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) useGoldenGateWorkloads(control, session); // eslint-disable-line react-hooks/rules-of-hooks

  // Driving owns the camera through the VehicleRig; leaving the car returns to the orbit.
  useEffect(() => {
    if (playing) { path.current?.stop(); pose.current = null; setMode('drive'); }
    else if (modeRef.current === 'drive') { setMode('orbit'); handBack({ position: camera.position.toArray() as Vec3, target: world.focus.toArray() as Vec3, fov: camera.fov }); }
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // A review pose holds until the visitor touches the controls.
  useEffect(() => {
    const element = root.current; if (!element) return;
    const release = () => {
      if (modeRef.current !== 'pose') return;
      const p = pose.current; pose.current = null; setMode('orbit');
      if (p) handBack(p);
    };
    element.addEventListener('pointerdown', release, true); element.addEventListener('wheel', release, { capture: true, passive: true });
    return () => { element.removeEventListener('pointerdown', release, true); element.removeEventListener('wheel', release, true); };
  }, [root]); // eslint-disable-line react-hooks/exhaustive-deps

  useSystem('golden-gate-camera-start', SystemOrder.path, () => {
    if (initialized.current || !session.orbit.current || (initialFlight && !path.current)) return;
    initialized.current = true;
    const view = NAMED_CAMERAS[initialView] ?? NAMED_CAMERAS.postcard!;
    if (initialView === 'postcard' || !NAMED_CAMERAS[initialView]) handBack({ position: view.position, target: view.target, fov: view.fov });
    else control.setView(initialView);
    // Test and developer builds: a flyover from the URL, sought to `flightAt` (review captures).
    if (initialFlight && control.playFlight(initialFlight)) path.current!.seek(Math.max(0, Math.min(1, initialFlightAt)));
  });
  useSystem('golden-gate-camera-pose', SystemOrder.camera + 10, () => {
    const p = pose.current; if (modeRef.current !== 'pose' || !p) return;
    camera.position.fromArray(p.position); camera.up.set(0, 1, 0); camera.lookAt(p.target[0], p.target[1], p.target[2]);
    if (camera.fov !== p.fov) { camera.fov = p.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  });
  useSystem('golden-gate-camera-focus', SystemOrder.camera + 20, () => {
    // Shadow and LOD focus: the orbit target, a point ahead of a posed or flying camera, or the car.
    const m = modeRef.current, rig = session.orbit.current;
    if (m === 'orbit' && rig) world.focus.copy(rig.controls.target);
    else if (m !== 'drive') { camera.getWorldDirection(world.focus); world.focus.multiplyScalar(Math.min(400, Math.max(60, camera.position.y * 1.5))).add(camera.position); }
  });

  return <>
    <OrbitRig rigRef={session.orbit} active={mode === 'orbit' && !playing} target={NAMED_CAMERAS[LAYOUT.cameras.default]!.target} minDistance={CAMERA.orbit.minDistance} maxDistance={CAMERA.orbit.maxDistance}
      maxPolar={CAMERA.orbit.maxPolar} pan floor={floor} clearance={CAMERA.orbit.clearance} bounds={TARGET_BOUNDS}/>
    <PathRig paths={flights.paths} active={mode === 'flight'} interruptible pathRef={path} time={session.motion.now}
      onInterrupt={current => { setMode('orbit'); handBack(current); }}
      onDone={() => { const current = path.current?.pose; setMode('orbit'); if (current) handBack(current); }}/>
  </>;
}
