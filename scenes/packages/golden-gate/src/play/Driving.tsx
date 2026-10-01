// Driving the sedan inside the canvas: the pure car model (./car.ts) stepped at SystemOrder.sim from
// the kit's input, drawn with the traffic at full detail, followed by the kit's VehicleRig chase
// camera (obstruction rays against the bridge's towers, cables, suspenders, lamps and railings; a pinch
// or the wheel moves it in or out, a drag swings it around the car), and turned around at a road end
// behind a fade. The car drives the route (fix round 2): its route coordinates are drawn on the deck or
// an approach road (./car-pose), and its road ends are on the approach roads, where traffic drives on. On touch the kit joystick is the only driving input (D-22). Leaving the car hands the
// camera back to the orbit.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Object3D, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { SystemOrder, VehicleRig, registerWorkload, useFade, useInput, usePlayMode, useRegisterTestHooks, useSceneRootRef, useSystem } from '@kiln-scenes/scene-kit';
import { CAMERA, LANES, laneX } from '../constants';
import { DRIVING_DATA, LAYOUT } from '../data';
import { laneStation } from '../traffic/config';
import { paintLinear } from '../traffic/traffic';
import type { DrivenVehicle } from '../traffic/traffic';
import type { SimObstacle } from '../traffic/sim';
import type { VehicleType } from '../traffic/vehicle-models';
import { newRoutePoint, routePoint, routeProject } from '../world/route';
import type { GoldenGateWorld } from '../world/build-world';
import { useGoldenGateSession } from '../state';
import { advanceCar, carExtents, createCar, endStop, nearRoadEnd, roadEnd, startCar, turnAround } from './car';
import type { CarBody, CarInput, CarState, TrafficBox } from './car';
import { carPose, newCarPose } from './car-pose';
import { DRIVE_ACTIONS } from './actions';
export { DRIVE_ACTIONS } from './actions';

const D = DRIVING_DATA, CHASE = CAMERA.chase;
const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
/** Keyboard actions beyond the kit's movement axes (keys in data/driving.json). Touch has only the joystick (D-22). */
const IDLE: CarInput = { throttle: 0, reverse: 0, steer: 0, brake: 0, handbrake: false };
/** Traffic further than this along the route cannot interact with the car within one frame (m of station). */
const BOX_RANGE = 200;

export function Driving({ world }: { world: GoldenGateWorld }) {
  const session = useGoldenGateSession(), input = useInput(), fade = useFade(), { playing, setPlaying } = usePlayMode(), root = useSceneRootRef();
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const model = world.models.get(D.vehicle as VehicleType);
  if (!model) throw new Error(`data/driving.json vehicle ${D.vehicle} is not a loaded vehicle`);
  const body = useMemo<CarBody>(() => ({ length: model.length, width: model.width, wheelRadius: model.wheelRadius }), [model]);
  const subject = useMemo(() => ({ current: new Object3D() }), []);
  const car = useRef<CarState | null>(null), acc = useRef({ t: 0 }), boxes = useRef<TrafficBox[]>([]);
  const turning = useRef(false), override = useRef<Partial<CarInput> | null>(null), hudTimer = useRef(0);
  const [rigKey, setRigKey] = useState(0), [zoom, setZoom] = useState(1), zoomRef = useRef(1);
  const obstacle = useMemo<SimObstacle>(() => ({ x: 0, z: 0, halfWidth: 0, halfLength: 0, speed: 0, heading: 1 }), []);
  const driven = useMemo<DrivenVehicle>(() => ({ type: D.vehicle as VehicleType, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, spin: 0, steer: 0, brake: 0, paint: paintLinear(D.paint), obstacle: null }), []);
  const aim = useMemo(() => new Vector3(), []), pose = useMemo(() => newCarPose(), []), clampPoint = useMemo(() => newRoutePoint(), []);
  const obstruction = useMemo(() => ({ ray: (from: Vector3, to: Vector3) => world.bridge.colliders.rayDistance(from, to),
    castRadius: CHASE.castRadius, pad: CHASE.pad, minDistance: CHASE.minDistance, relaxPerSecond: CHASE.relax }), [world]);

  useEffect(() => {
    input.configureActions([
      { id: DRIVE_ACTIONS.brake, keys: D.controls.brake, mode: 'hold' }, { id: DRIVE_ACTIONS.handbrake, keys: D.controls.handbrake, mode: 'hold' },
      { id: DRIVE_ACTIONS.turnAround, keys: D.controls.turnAround, mode: 'edge' },
      { id: DRIVE_ACTIONS.boost, keys: D.controls.boost, mode: 'hold' },
    ]);
  }, [input]);

  // E enters the car from the overview (the kit's Enter does too); while driving E and Escape leave.
  useEffect(() => {
    const element = root.current; if (!element || playing) return;
    const key = (event: KeyboardEvent) => {
      if (event.target !== element || event.repeat || !D.controls.enterOrLeave.includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation(); setPlaying(true);
    };
    element.addEventListener('keydown', key); return () => element.removeEventListener('keydown', key);
  }, [root, playing, setPlaying]);

  /** Writes the car into the traffic's driven instance, the lanes' obstacle (route coordinates), the chase subject and the focus (world). */
  const publish = (c: CarState) => {
    const p = carPose(world.bridge.route, c, model.wheelbase, pose);
    driven.x = p.x; driven.y = p.y; driven.z = p.z; driven.yaw = p.yaw - Math.PI / 2; driven.pitch = p.pitch;
    driven.spin = c.spin; driven.steer = c.wheel; driven.brake = c.brakeLight;
    const { ex, ez } = carExtents(c, body);
    obstacle.x = c.x; obstacle.z = c.z; obstacle.halfWidth = ex; obstacle.halfLength = ez; obstacle.speed = c.speed; obstacle.heading = c.dir;
    driven.obstacle = obstacle;
    subject.current.position.set(p.x, p.y, p.z); subject.current.updateMatrixWorld();
    world.focus.set(p.x, p.y, p.z);
  };
  const turn = async () => {
    const c = car.current; if (!c || turning.current) return;
    turning.current = true;
    await fade.to(1, D.roadEnd.fadeSeconds * 1000);
    if (car.current === c) {
      turnAround(c, body, world.traffic.sim.boxes(-c.dir as 1 | -1, c.z, BOX_RANGE, laneX, laneStation));
      acc.current.t = 0; publish(c); setRigKey(key => key + 1);
    }
    await fade.to(0, D.roadEnd.fadeSeconds * 1000);
    turning.current = false;
  };

  // Entering places the car at its start (a free spot in the start lane, rolling); leaving removes it.
  useEffect(() => {
    if (!playing) return;
    session.motion.setPaused(false);
    const traffic = world.traffic, lane = LANES.find(l => l.id === D.start.lane)!, dir = lane.direction === 'north' ? 1 : -1;
    const c = startCar(body, traffic.sim.boxes(dir, D.start.z, BOX_RANGE, laneX, laneStation));
    car.current = c; acc.current.t = 0; turning.current = false; override.current = null; zoomRef.current = 1; setZoom(1);
    traffic.driven = driven; publish(c); setRigKey(key => key + 1);
    session.hud.set({ driving: true, speedKmh: Math.round(Math.abs(c.speed) * 3.6), atRoadEnd: false });
    return () => {
      car.current = null; driven.obstacle = null;
      if (traffic.driven === driven) traffic.driven = null;
      session.hud.set({ driving: false, speedKmh: 0, atRoadEnd: false });
      if (turning.current) { turning.current = false; void fade.to(0, 150); }
    };
  }, [playing, world, body]); // eslint-disable-line react-hooks/exhaustive-deps

  useSystem('golden-gate-drive', SystemOrder.sim, dt => {
    const c = car.current; if (!c) return;
    const state = input.state, actions = state.actions, forced = override.current;
    if (state.interact && !turning.current) { setPlaying(false); return; }
    dt = session.motion.delta;
    const controls: CarInput = turning.current ? IDLE : forced ? { ...IDLE, ...forced } : {
      throttle: Math.max(0, state.move.y), reverse: Math.max(0, -state.move.y),
      steer: state.move.x, brake: actions[DRIVE_ACTIONS.brake] ?? 0, handbrake: (actions[DRIVE_ACTIONS.handbrake] ?? 0) > 0,
      boost: (actions[DRIVE_ACTIONS.boost] ?? 0) > 0,
    };
    advanceCar(c, controls, body, world.traffic.sim.boxes(c.dir, c.z, BOX_RANGE, laneX, laneStation, boxes.current), dt, acc.current);
    const asked = !session.motion.paused && (c.turnRequested || ((actions[DRIVE_ACTIONS.turnAround] ?? 0) > 0 && nearRoadEnd(c)));
    c.turnRequested = false;
    if (asked && !turning.current) void turn();
    if (state.interact && !turning.current) { setPlaying(false); return; }
    // A pinch or the wheel (the kit's zoom input) moves the chase camera in or out.
    if (state.zoom) {
      const next = Math.min(CHASE.zoom[1], Math.max(CHASE.zoom[0], zoomRef.current * Math.exp(state.zoom * CHASE.zoomRate)));
      if (next !== zoomRef.current) { zoomRef.current = next; setZoom(next); }
    }
    publish(c);
    // The HUD store coalesces notifications; the speed reads in whole km/h a few times a second.
    hudTimer.current += dt;
    const atRoadEnd = nearRoadEnd(c) && !turning.current;
    if (atRoadEnd !== session.hud.getSnapshot().atRoadEnd || hudTimer.current >= .2) {
      hudTimer.current = 0; session.hud.set({ speedKmh: Math.round(Math.abs(c.speed) * 3.6), atRoadEnd });
    }
  });

  // Over the road: the chase camera never leaves |lateral offset| <= maxAbsX of the route (on the deck
  // |x|, inside the suspender planes, since the cables and suspenders stand outside the roadway; on the
  // approach roads inside the barriers); when held there it still aims at the chase target.
  useSystem('golden-gate-drive-camera', SystemOrder.camera + 5, () => {
    const c = car.current; if (!c) return;
    const route = world.bridge.route, at = routeProject(route, camera.position.x, camera.position.z);
    if (!at || Math.abs(at.d) <= CHASE.maxAbsX) return;
    const q = routePoint(route, at.sigma, Math.sign(at.d) * CHASE.maxAbsX, clampPoint);
    aim.set(driven.x + Math.sin(pose.yaw) * CHASE.lookAhead, driven.y + CHASE.targetHeight, driven.z + Math.cos(pose.yaw) * CHASE.lookAhead);
    camera.position.x = q.x; camera.position.z = q.z; camera.lookAt(aim); camera.updateMatrixWorld();
  });

  // Performance plan workload (SPEC 20): a deterministic drive with lane changes across the deck.
  useEffect(() => registerWorkload('drive', time => {
    if (!car.current) { setPlaying(true); return; }
    override.current = { throttle: 1, steer: Math.sin(time * .35) > .93 ? 1 : Math.sin(time * .35) < -.93 ? -1 : 0 };
  }), [setPlaying]);

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!TEST) return {};
    return {
      /** The driven car (world position, route station and lateral offset), its camera (with its route offset) and the HUD fields (null when not driving). */
      driveState: () => {
        const c = car.current; if (!c) return null;
        const at = routeProject(world.bridge.route, camera.position.x, camera.position.z);
        return { dir: c.dir, x: driven.x, y: driven.y, z: driven.z, sigma: c.z, d: c.x, speed: c.speed, kmh: Math.abs(c.speed) * 3.6, headingDeg: c.offset * 180 / Math.PI, wheelDeg: c.wheel * 180 / Math.PI,
          input: { boost: input.state.actions[DRIVE_ACTIONS.boost] ?? 0, brake: input.state.actions[DRIVE_ACTIONS.brake] ?? 0, throttle: input.state.move.y, steer: input.state.move.x },
          brakeLight: c.brakeLight, toEnd: c.toEnd, atRoadEnd: nearRoadEnd(c), contact: c.contact, turning: turning.current, zoom: zoomRef.current,
          camera: { position: camera.position.toArray(), fov: camera.fov, distance: camera.position.distanceTo(subject.current.position), d: at?.d ?? null, sigma: at?.sigma ?? null } };
      },
      /** The car's road ends and end stops (route stations), the approaches' dissolve stretches and lengths, and the road centre where each dissolve starts. */
      driveRoute: () => {
        const route = world.bridge.route, ends = LAYOUT.approaches, at = (sigma: number) => { const p = routePoint(route, sigma, 0); return [p.x, p.y, p.z]; };
        return { roadEnd: { south: roadEnd(-1), north: roadEnd(1) }, endStop: { south: endStop(-1), north: endStop(1) }, roadEndZ: route.roadEndZ,
          dissolve: { south: ends.south.ends.dissolve, north: ends.north.ends.dissolve }, length: { south: route.south.length, north: route.north.length },
          dissolveStart: { south: at(-(route.roadEndZ + ends.south.ends.dissolve[0])), north: at(route.roadEndZ + ends.north.ends.dissolve[0]) } };
      },
      /** Drives the car model over its route both ways and samples every traffic lane against the rendered road surfaces (./route-contact). */
      routeContact: async (options?: Record<string, unknown>) => {
        if (!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV)) return null;
        const { scanRouteContact } = await import('./route-contact');
        const longest = [...world.models.values()].sort((a, b) => b.wheelbase - a.wheelbase)[0]!;
        return scanRouteContact(world.bridge, model, longest, body, options ?? {});
      },
      /** Replaces the controls until called with null (captures and scripted checks). */
      setDriveInput: (value: Partial<CarInput> | null) => { override.current = value; return value; },
      /** Moves the car to a lane (id) at route station z and speed; the chase camera starts over behind it. */
      placeCar: (laneId: string, z: number, speed = 0) => {
        const c = car.current, lane = LANES.find(l => l.id === laneId); if (!c || !lane) return null;
        Object.assign(c, createCar(lane.direction === 'north' ? 1 : -1, lane.x, z, speed)); acc.current.t = 0; publish(c); setRigKey(key => key + 1);
        return { x: c.x, z: c.z, dir: c.dir };
      },
      turnAround: () => { void turn(); return !!car.current; },
    };
  }, [camera, driven, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  useRegisterTestHooks(hooks);

  return playing ? <VehicleRig key={rigKey} subject={subject} yaw={() => car.current ? pose.yaw : 0} speed={() => car.current?.speed ?? 0}
    distance={CHASE.distance * zoom} height={CHASE.height * zoom} targetHeight={CHASE.targetHeight} lookAhead={CHASE.lookAhead} fov={CHASE.fov}
    fovAtTopSpeed={CHASE.fovAtTopSpeed} topSpeed={D.topSpeed} positionLag={CHASE.positionLag} yawLag={CHASE.yawLag}
    obstruction={obstruction} orbitOffset active={playing}/> : null;
}
