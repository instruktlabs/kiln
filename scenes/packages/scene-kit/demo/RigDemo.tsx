import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, CapsuleGeometry, Color, Group, Mesh, MeshStandardNodeMaterial, Vector3 } from 'three/webgpu';
import { CameraButtons, FollowRig, OrbitRig, PathRig, VehicleRig } from '../src/camera';
import type { PathDef, PathHandle, Pose, RigHandle } from '../src/camera';
import { createCollisionWorld, fixedStep, stepCapsule } from '../src/collision';
import type { CollisionWorld, MoverRules, MoverState } from '../src/collision';
import { useBuilt, useSystem, SystemOrder, disposeObject3D } from '../src/lifecycle';
import { usePresets } from '../src/look';
import { useRuntime } from '../src/internal/runtime';
import type { SceneRuntime } from '../src/internal/runtime';
import { VirtualJoystick } from '../src/input';
import { HudButton, HudPanel, HudSegmented, StatusLine, useFade, useHud } from '../src/ui';
import { DEMO_CAR_COLLIDER } from './rig-constants';

const PRESETS = { Day: { exposure: 1, background: [.57, .72, .84] }, Sunset: { exposure: .8, background: [.52, .25, .13] } };
const PATHS: readonly PathDef[] = [{ name: 'Forecourt flyover', seconds: 8, interpolation: 'catmull-rom', easing: 'smoothstep', keys: [
  { position: [15, 15, 25], target: [0, 1, 0], fov: 40 }, { position: [-14, 7, 12], target: [1, 1, -3], fov: 40 }, { position: [12, 9, -12], target: [0, 1, 0], fov: 40 },
] }];
type Mode = 'orbit' | 'walk' | 'drive' | 'fly';
interface RigDemoApi {
  mode: Mode; doorOpen: boolean; preset: string; carSpeed: number; carYaw: number; pathInterrupts: number; handoffError: number; chaseRays: number;
  orbit: { current: RigHandle | null }; path: { current: PathHandle | null };
  player: { current: Group | null }; car: { current: Group | null };
  setMode(mode: Mode): void; toggleDoor(): void; setPreset(name: string): void;
}
function apiFor(runtime: SceneRuntime): RigDemoApi {
  let api = runtime.data.get('demoRigs') as RigDemoApi | undefined;
  if (!api) {
    api = { mode: 'orbit', doorOpen: false, preset: 'Day', carSpeed: 0, carYaw: 0, pathInterrupts: 0, handoffError: 0, chaseRays: 0, orbit: { current: null }, path: { current: null }, player: { current: null }, car: { current: null }, setMode() {}, toggleDoor() {}, setPreset() {} };
    runtime.data.set('demoRigs', api);
  }
  return api;
}
const RULES: MoverRules = { radius: .3, height: 1.8, pace: 3, runPace: 5, gravity: 18, terminal: -10, stepUp: .22, stepProbe: .25, clampX: 18, clampZ: 18 };
interface BuiltRigDemo { group: Group; player: Group; car: Group; door: Group; world: CollisionWorld; mover: MoverState; front: Vector3; previousCar: Vector3; accumulator: { t: number }; doorAmount: number; walkStep(h: number): void }
function buildDemo(): BuiltRigDemo {
  const group = new Group(); group.name = 'Kit demo interaction rigs';
  const world = createCollisionWorld();
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color = 0x84929c) => {
    const mesh = new Mesh(new BoxGeometry(sx, sy, sz), new MeshStandardNodeMaterial({ color })); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; return mesh;
  };
  const groundProxy = box(0, -.2, 0, 40, .4, 40, 0xdddddd); world.addStatic('demo-floor', groundProxy); groundProxy.geometry.dispose(); (groundProxy.material as MeshStandardNodeMaterial).dispose();
  const walls = new Group(); walls.name = 'Demo collision boxes'; walls.add(box(4, 1.5, -6, 2, 3, .5), box(8, 1.5, -6, 2, 3, .5), box(6, 3, -6, 2, .25, .5));
  // A slim rear obstacle exercises the five-ray chase pull-in, including off-center rays.
  walls.add(box(8, 1.5, -2, .3, 3, .3, 0x668499)); group.add(walls); world.addStatic('demo-wall', walls);
  const door = new Group(); door.name = 'Demo opening door'; door.position.set(5, 0, -6); door.add(box(1, 1.4, 0, 2, 2.8, .2, 0xb26935)); group.add(door); world.add(door, { dynamic: true, key: 'demo-door' });
  const player = new Group(); player.name = 'Demo walking capsule'; player.position.set(0, .02, 0);
  const body = new Mesh(new CapsuleGeometry(.3, 1.2, 4, 8), new MeshStandardNodeMaterial({ color: 0xf4ba52 })); body.position.y = .9; body.castShadow = true; player.add(body); group.add(player);
  const car = new Group(); car.name = 'Demo chase vehicle'; car.position.set(8, 0, 3); car.add(box(0, .5, 0, 1.6, .7, 2.8, 0x386ead), box(0, 1.05, -.2, 1.25, .55, 1.4, 0x92bfd0)); group.add(car);
  return { group, player, car, door, world, mover: { position: player.position, velocityY: 0, yaw: 0, speedXZ: 0, status: '' }, front: new Vector3(), previousCar: new Vector3(), accumulator: { t: 0 }, doorAmount: 0, walkStep() {} };
}
// Default colour is only needed by the structural wall boxes.
function setHud(runtime: SceneRuntime, api: RigDemoApi): void { runtime.hud.set({ demoMode: api.mode, demoPreset: api.preset, demoDoor: api.doorOpen ? 'Open' : 'Closed' }); runtime.notify(); }
export function RigDemo() {
  const runtime = useRuntime(), r3f = useThree(), api = apiFor(runtime), presets = usePresets(PRESETS, 'Day');
  const built = useBuilt(buildDemo, value => { value.world.dispose(); disposeObject3D(value.group); }, []);
  useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const handBack = (pose: Pose) => {
    api.pathInterrupts++; api.mode = 'orbit'; api.orbit.current?.setView(pose);
    const actual = api.orbit.current?.pose; api.handoffError = actual ? Math.hypot(...pose.position.map((value, i) => value - actual.position[i])) : Infinity;
    runtime.setPlaying(false); setHud(runtime, api);
  };
  useEffect(() => {
    if (!built) return;
    api.player.current = built.player; api.car.current = built.car;
    built.walkStep = h => stepCapsule(built.mover, runtime.input.state.move, runtime.input.state.run, built.front, h, built.world, RULES);
    runtime.data.set('demoRigsBuilt', true);
    api.setMode = mode => {
      api.mode = mode; api.path.current?.stop(); runtime.setPlaying(mode === 'walk' || mode === 'drive');
      if (mode === 'fly') api.path.current?.play(PATHS[0].name);
      if (mode === 'orbit') api.orbit.current?.setView({ position: [15, 15, 25], target: [0, 1, 0], fov: 40 });
      runtime.rootRef.current?.focus(); setHud(runtime, api);
    };
    api.toggleDoor = () => { api.doorOpen = !api.doorOpen; setHud(runtime, api); };
    api.setPreset = name => presets.set(name);
    const unsubscribe = presets.onChange(name => { api.preset = name; setHud(runtime, api); });
    if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) {
      runtime.testHooks.demoRigState = () => ({ mode: api.mode, player: built.player.position.toArray(), car: built.car.position.toArray(), door: built.door.rotation.y, pathInterrupts: api.pathInterrupts, handoffError: api.handoffError, preset: api.preset, presetValues: presets.current, camera: r3f.camera.position.toArray(), colliders: built.world.colliders.length, chaseRays: api.chaseRays, chaseNominalDistance: Math.hypot(6, 2), chaseAppliedDistance: Math.hypot(r3f.camera.position.x - built.car.position.x - Math.sin(api.carYaw), r3f.camera.position.y - built.car.position.y - 1, r3f.camera.position.z - built.car.position.z - Math.cos(api.carYaw)) });
      runtime.testHooks.demoSetMode = (mode: Mode) => api.setMode(mode);
      runtime.testHooks.demoSeek = (u: number) => { api.path.current?.seek(u); return api.path.current?.pose; };
      runtime.testHooks.demoDoor = () => api.toggleDoor();
      runtime.testHooks.demoPreset = (name: string, immediate = false) => presets.set(name, { immediate });
      runtime.testHooks.demoMove = (x: number, y: number) => runtime.input.setMove(x, y, false);
      runtime.testHooks.demoChaseFixture = () => { api.setMode('drive'); runtime.input.clear(); api.carSpeed = api.carYaw = api.chaseRays = 0; built.car.position.set(8, 0, 3); built.car.rotation.y = 0; };
    }
    setHud(runtime, api);
    return () => {
      unsubscribe(); runtime.data.set('demoRigsBuilt', false); api.player.current = api.car.current = null;
      if (import.meta.env.KILN_TEST || import.meta.env.KILN_DEV) for (const key of ['demoRigState', 'demoSetMode', 'demoSeek', 'demoDoor', 'demoPreset', 'demoMove', 'demoChaseFixture']) delete runtime.testHooks[key];
      api.setMode = () => {}; api.toggleDoor = () => {}; api.setPreset = () => {};
    };
  }, [built, runtime, api, presets, r3f.camera]);
  useSystem('demo-input-simulation', SystemOrder.sim, dt => {
    if (!built) return; const input = runtime.input.state;
    if (runtime.playing && api.mode !== 'walk' && api.mode !== 'drive') api.setMode('walk');
    else if (!runtime.playing && (api.mode === 'walk' || api.mode === 'drive')) api.setMode('orbit');
    if (input.cancel && (api.mode === 'walk' || api.mode === 'drive')) api.setMode('orbit');
    if (input.interact) api.toggleDoor();
    const target = api.doorOpen ? -Math.PI * .5 : 0;
    built.doorAmount = runtime.motion.reduced ? target : target + (built.doorAmount - target) * Math.exp(-7 * dt); built.door.rotation.y = built.doorAmount;
    if (api.mode === 'walk') {
      r3f.camera.getWorldDirection(built.front);
      fixedStep(built.accumulator, dt, 1 / 120, .1, built.walkStep);
      built.player.rotation.y = built.mover.yaw;
    } else if (api.mode === 'drive') {
      api.carSpeed += (input.move.y * 5 - api.carSpeed) * (1 - Math.exp(-4 * dt)); api.carYaw -= input.move.x * api.carSpeed * .2 * dt;
      built.previousCar.copy(built.car.position); built.car.position.x += Math.sin(api.carYaw) * api.carSpeed * dt; built.car.position.z += Math.cos(api.carYaw) * api.carSpeed * dt;
      if (built.world.intersects(built.car.position, DEMO_CAR_COLLIDER.radius, DEMO_CAR_COLLIDER.height)) { built.car.position.copy(built.previousCar); api.carSpeed = 0; }
      built.car.rotation.y = api.carYaw;
    }
    built.group.updateMatrixWorld(true);
  });
  useSystem('demo-look', SystemOrder.path + 60, () => {
    if (!runtime.renderer) return; runtime.renderer.toneMappingExposure = presets.current.exposure;
    const color = r3f.scene.background as Color | null; if (color?.isColor) color.fromArray(presets.current.background);
  });
  const collisionRay = useRef((from: Vector3, to: Vector3) => from.distanceTo(to));
  collisionRay.current = (from, to) => { if (api.mode === 'drive') api.chaseRays++; return built?.world.rayDistance(from, to) ?? from.distanceTo(to); };
  const ray = useRef((from: Vector3, to: Vector3) => collisionRay.current(from, to));
  return <>
    {built && <primitive object={built.group} dispose={null} />}
    <OrbitRig active={api.mode === 'orbit'} target={[0, 1, 0]} minDistance={3} maxDistance={160} floor={() => 0} clearance={.3} rigRef={api.orbit} />
    <FollowRig active={api.mode === 'walk'} subject={api.player} targetHeight={1.6} offset={() => [0, 1.4, 4.8]} fov={58} maxPolar={Math.PI * .54} minDistance={1.6} maxDistance={10} obstruction={{ ray: ray.current, pad: .14, minDistance: .22, hideSubjectBelow: 1.25, onSubjectVisible: v => { if (api.player.current) api.player.current.visible = v; } }} />
    <VehicleRig active={api.mode === 'drive'} subject={api.car} yaw={() => api.carYaw} speed={() => api.carSpeed} distance={5} height={3} targetHeight={1} lookAhead={1} fov={50} fovAtTopSpeed={60} topSpeed={5} positionLag={.15} yawLag={.15} orbitOffset obstruction={{ ray: ray.current, castRadius: .25, pad: .14, minDistance: .3, relaxPerSecond: 2, hideSubjectBelow: 1, onSubjectVisible: v => { if (api.car.current) api.car.current.visible = v; } }} />
    <PathRig paths={PATHS} active={api.mode === 'fly'} pathRef={api.path} onInterrupt={handBack} onDone={() => { const pose = api.path.current?.pose; if (pose) handBack(pose); }} />
  </>;
}
export function RigDemoHud() {
  const runtime = useRuntime(), api = apiFor(runtime), fade = useFade(); useHud(); useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  return <>
    <HudPanel aria-label="Explore the demo" style={{ position: 'absolute', left: 12, top: 12, maxWidth: 370 }}>
      <HudSegmented label="Explore" value={api.mode} options={[{ value: 'orbit', label: 'Overview' }, { value: 'walk', label: 'Walk' }, { value: 'drive', label: 'Drive' }, { value: 'fly', label: 'Flyover' }]} onChange={value => api.setMode(value as Mode)} />
      <HudSegmented label="Lighting" value={api.preset} options={[{ value: 'Day', label: 'Day' }, { value: 'Sunset', label: 'Sunset' }]} onChange={api.setPreset} />
      <HudButton onClick={api.toggleDoor}>{api.doorOpen ? 'Close door' : 'Open door'}</HudButton>
      <HudButton onClick={() => { void fade.to(1, 180).then(() => fade.to(0, 180)); }}>Fade</HudButton>
      {api.mode === 'orbit' && <CameraButtons rig={api.orbit} />}
    </HudPanel>
    <StatusLine text={`${api.mode === 'walk' ? 'Walking: WASD / arrows, drag to look, E opens the door' : api.mode === 'drive' ? 'Driving: WASD / arrows, drag to look behind' : 'Drag to orbit · Wheel or pinch to zoom'} · Door ${api.doorOpen ? 'open' : 'closed'}`} />
    {(api.mode === 'walk' || api.mode === 'drive') && runtime.input.state.lastPointer === 'touch' && <VirtualJoystick label={api.mode === 'walk' ? 'Walk direction' : 'Drive and steer'} />}
  </>;
}
