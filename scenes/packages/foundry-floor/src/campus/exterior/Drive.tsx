// SPDX-License-Identifier: MIT
// Driving the sedan on the campus roads (FF-C1 item 5), Golden Gate's pattern (packages/golden-gate/src/play/
// Driving.tsx, copied, not imported): the pure car model (../drive/car) stepped at SystemOrder.sim from the kit's input,
// drawn with the traffic at full detail, followed by the kit's VehicleRig chase camera (a pinch or the wheel moves it in
// or out within the data's zoom range, a drag swings it around the car), and turned around at a road end behind a fade.
// The kit's play mode is the drive: Enter or E (or Drive the sedan) takes the car at its start, E or Escape (or Leave
// the car) hands the camera back to the orbit above the car. Touch uses separate steering, throttle, brake/reverse
// and boost. Persistent Enter the fab parks the car where it is; Exit restores that car at rest.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Object3D } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { registerWorkload, SystemOrder, useFade, useInput, usePlayMode, useRegisterTestHooks, useSceneRootRef, useSystem, VehicleRig } from '@kiln-scenes/scene-kit';
import type { CampusData } from '../data';
import { useCampusSession } from '../session';
import { advanceCar, createCar, footprintCentre, inEnterZone, placeCar, startCar, turnAround } from '../drive/car';
import type { CarInput, CarState, TrafficBox } from '../drive/car';
import { paintLinear } from '../drive/driving';
import type { CarObstacle } from '../drive/traffic-sim';
import type { DriveWorld } from './drive-world';
import type { DrivenVehicle } from './traffic';
import { DRIVE_ACTIONS, drivingTrafficRange, readDriveInput } from '../drive/input';

const TEST = !!(import.meta.env.KILN_TEST || import.meta.env.KILN_DEV);
/** Keyboard actions beyond the kit's movement axes (keys in data/driving.json). Touch has only the joystick (D-22). */
export { DRIVE_ACTIONS } from '../drive/input';
const IDLE: CarInput = { throttle: 0, reverse: 0, steer: 0, brake: 0, handbrake: false };
const HUD_INTERVAL_MS = 200;
/** Traffic within this distance of the car's mirror spot is considered when it turns around (m). */
const TURN_RANGE = 200;
/** The orbit takes over this far from the car when the viewer leaves it (m), looking at it from where the chase camera was. */
const HANDBACK = { distance: 42, height: 16, fov: 50 };
const DEG = 180 / Math.PI;

export function CampusDrive({ drive, data }: { drive: DriveWorld; data: CampusData }) {
  const campus = useCampusSession(), input = useInput(), fade = useFade(), { playing, setPlaying } = usePlayMode(), root = useSceneRootRef();
  const camera = useThree(state => state.camera) as PerspectiveCamera;
  const D = drive.driving, CHASE = D.chase, body = drive.body, roads = drive.roads, traffic = drive.traffic, y0 = data.roads.gradeY;
  const subject = useMemo(() => ({ current: new Object3D() }), []);
  const car = useRef<CarState | null>(null), acc = useRef({ t: 0 }), boxes = useRef<TrafficBox[]>([]);
  const turning = useRef(false), override = useRef<Partial<CarInput> | null>(null), hudAt = useRef(-Infinity);
  const [rigKey, setRigKey] = useState(0);
  const centre = useMemo<[number, number]>(() => [0, 0], []);
  const obstacle = useMemo<CarObstacle>(() => ({ u: 0, v: 0, heading: 0, halfLength: body.length / 2, halfWidth: body.width / 2, speed: 0 }), [body]);
  const driven = useMemo<DrivenVehicle>(() => ({ type: D.vehicle, x: 0, y: y0, z: 0, yaw: 0, pitch: 0, spin: 0, steer: 0, brake: 0, paint: paintLinear(D, D.paint), obstacle: null }), [D, y0]);
  const zoom = useMemo(() => ({ min: CHASE.zoom[0], max: CHASE.zoom[1], rate: CHASE.zoomRate }), [CHASE]);

  useEffect(() => {
    input.configureActions([
      { id: DRIVE_ACTIONS.brake, keys: D.controls.brake, mode: 'hold' }, { id: DRIVE_ACTIONS.handbrake, keys: D.controls.handbrake, mode: 'hold' },
      { id: DRIVE_ACTIONS.turnAround, keys: D.controls.turnAround, mode: 'edge' },
      ...[DRIVE_ACTIONS.throttle,DRIVE_ACTIONS.reverse,DRIVE_ACTIONS.boost].map(id=>({id,keys:[],mode:'hold' as const})),
    ]);
  }, [input, D]);

  // E takes the car from the orbit (the kit's Enter does too); while driving E and Escape leave it.
  useEffect(() => {
    const element = root.current; if (!element || playing) return;
    const key = (event: KeyboardEvent) => {
      if (event.target !== element || event.repeat || !D.controls.enterOrLeave.includes(event.code) || campus.hud.getSnapshot().moving) return;
      event.preventDefault(); event.stopImmediatePropagation(); setPlaying(true);
    };
    element.addEventListener('keydown', key); return () => element.removeEventListener('keydown', key);
  }, [root, playing, setPlaying, D, campus]);

  // Back from the interior after entering from the car (World sets resumeDrive at Exit): the drive takes the camera
  // again, with the car at rest where it stopped; the exterior fades up once it has.
  useEffect(() => { if (campus.resumeDrive && !playing) setPlaying(true); }, [campus, playing, setPlaying]);

  /** Writes the car into the traffic's driven instance, the lanes' obstacle and the chase subject. */
  const publish = (c: CarState) => {
    driven.x = c.u; driven.y = y0; driven.z = c.v; driven.yaw = -c.heading; driven.pitch = c.bump;
    driven.spin = c.spin; driven.steer = c.wheel; driven.brake = c.brakeLight;
    footprintCentre(c, body, centre);
    obstacle.u = centre[0]; obstacle.v = centre[1]; obstacle.heading = c.heading; obstacle.speed = c.speed;
    driven.obstacle = obstacle;
    subject.current.position.set(centre[0], y0, centre[1]); subject.current.updateMatrixWorld();
  };
  /** The orbit above the car, looking at it from the chase camera's side. */
  const handBack = (c: CarState) => {
    const rig = campus.orbit.current; if (!rig) return;
    const [cu, cv] = footprintCentre(c, body);
    let du = camera.position.x - cu, dv = camera.position.z - cv;
    const flat = Math.hypot(du, dv);
    if (flat < 1) { du = -Math.cos(c.heading); dv = -Math.sin(c.heading); } else { du /= flat; dv /= flat; }
    rig.setView({ position: [cu + du * HANDBACK.distance, y0 + HANDBACK.height, cv + dv * HANDBACK.distance], target: [cu, y0 + CHASE.targetHeight, cv], fov: HANDBACK.fov, maxPolar: data.orbit.maxPolar });
  };
  const turn = async () => {
    const c = car.current; if (!c || turning.current) return;
    turning.current = true;
    await fade.to(1, D.roadEnd.fadeSeconds * 1000);
    if (car.current === c) {
      footprintCentre(c, body, centre);
      turnAround(c, body, roads, traffic.boxes(centre[0], centre[1], TURN_RANGE));
      acc.current.t = 0; publish(c); setRigKey(key => key + 1);
    }
    await fade.to(0, D.roadEnd.fadeSeconds * 1000);
    turning.current = false;
  };

  // Taking the car places it at its start (a free spot near the data's start, rolling), or, back from the interior, at
  // rest where it stopped; leaving remembers it and hands the camera back to the orbit.
  useEffect(() => {
    if (!playing) return;
    if (campus.hud.getSnapshot().moving && !campus.resumeDrive) { setPlaying(false); return; }
    if (!campus.resumeDrive) campus.setPaused(false);
    const memory = campus.resumeDrive ? campus.car : null;
    campus.resumeDrive = false; campus.car = null;
    const [w0, w1] = D.start.window;
    const c = memory ? createCar(memory.u, memory.v, memory.heading, 0)
      : startCar(roads, body, traffic.boxes((w0 + w1) / 2, 0, (w1 - w0) / 2 + D.traffic.range));
    car.current = c; acc.current.t = 0; turning.current = false; override.current = null; hudAt.current = -Infinity;
    traffic.driven = driven; publish(c); setRigKey(key => key + 1);
    campus.hud.set({ camera: 'drive', speedKmh: Math.round(Math.abs(c.speed) * 3.6), atRoadEnd: false, canEnter: false, status: '' });
    return () => {
      const last = car.current;
      if (last) campus.car = { u: last.u, v: last.v, heading: last.heading };
      car.current = null; driven.obstacle = null;
      if (traffic.driven === driven) traffic.driven = null;
      if (turning.current) { turning.current = false; void fade.to(0, 150); }
      const moving = campus.hud.getSnapshot().moving;
      campus.hud.set({ camera: 'orbit', speedKmh: 0, atRoadEnd: false, canEnter: false, ...(moving ? {} : { status: '' }) });
      if (last && !moving) handBack(last);
    };
  }, [playing, drive]); // eslint-disable-line react-hooks/exhaustive-deps

  useSystem('campus-drive', SystemOrder.sim, dt => {
    const c = car.current; if (!c) return;
    const state = input.state, actions = state.actions, forced = override.current;
    if (state.interact && !turning.current) { setPlaying(false); return; }
    if (campus.hud.getSnapshot().paused) dt = 0;
    const controls: CarInput = turning.current ? IDLE : forced ? { ...IDLE, ...forced } : readDriveInput(state);
    footprintCentre(c, body, centre);
    advanceCar(c, controls, body, roads, traffic.boxes(centre[0], centre[1], drivingTrafficRange(D,c.speed), boxes.current), dt, acc.current);
    const asked = !campus.hud.getSnapshot().paused && (c.turnRequested || ((actions[DRIVE_ACTIONS.turnAround] ?? 0) > 0 && c.end !== null));
    c.turnRequested = false;
    if (asked && !turning.current) void turn();
    if (state.interact && !turning.current) { setPlaying(false); return; }
    publish(c);
    // The HUD store coalesces notifications; the speed reads in whole km/h a few times a second.
    const now = performance.now(), hud = campus.hud.getSnapshot();
    const atRoadEnd = c.end !== null && !turning.current, canEnter = !turning.current && inEnterZone(roads, c, body);
    if (atRoadEnd !== hud.atRoadEnd || canEnter !== hud.canEnter || now - hudAt.current >= HUD_INTERVAL_MS) {
      hudAt.current = now;
      const z = roads.enterZone, [cu, cv] = centre;
      const underCanopy = !canEnter && cu >= z.u[0] && cu <= z.u[1] && cv >= z.v[0] && cv <= z.v[1];
      campus.hud.set({ speedKmh: Math.round(Math.abs(c.speed) * 3.6), atRoadEnd, canEnter, status: hud.moving ? hud.status : underCanopy ? 'Stop under the arrival canopy to enter the fab' : '' });
    }
  });

  // Performance plan workload (SPEC 20): a deterministic drive north along the split road with gentle weaving.
  useEffect(() => registerWorkload('drive', time => {
    if (!car.current) { setPlaying(true); return; }
    override.current = { throttle: .8, steer: Math.sin(time * .3) > .95 ? .4 : Math.sin(time * .3) < -.95 ? -.4 : 0 };
  }), [setPlaying]);

  const hooks = useMemo((): Record<string, (...args: any[]) => unknown> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!TEST) return {};
    const read = () => {
      const c = car.current; if (!c) return null;
      const [cu, cv] = footprintCentre(c, body);
      return { u: c.u, v: c.v, centre: [cu, cv], headingDeg: c.heading * DEG, speed: c.speed, kmh: Math.abs(c.speed) * 3.6, wheelDeg: c.wheel * DEG,
        brakeLight: c.brakeLight, end: c.end, toEnd: Number.isFinite(c.toEnd) ? c.toEnd : null, contact: c.contact, turning: turning.current,
        canEnter: inEnterZone(roads, c, body), controls:readDriveInput(input.state), camera: { position: camera.position.toArray(), fov: camera.fov, near: camera.near, far: camera.far } };
    };
    return {
      /** The driven car (model origin, footprint centre, heading, speed, wheel, lamps, road end, contact) and the camera; null when not driving. */
      driveState: read,
      /** Replaces the controls until called with null (captures and scripted checks). */
      setDriveInput: (value: Partial<CarInput> | null) => { override.current = value; return value; },
      /** Moves the car's footprint centre to (u, v) at a heading (degrees, 0 north, 90 east) and speed; the chase camera starts over behind it. */
      placeCar: (u: number, v: number, headingDeg: number, speed = 0) => {
        const c = car.current; if (!c) return null;
        Object.assign(c, placeCar(u, v, headingDeg / DEG, speed, body)); acc.current.t = 0; publish(c); setRigKey(key => key + 1);
        return read();
      },
      turnAround: () => { void turn(); return !!car.current; },
      /** Advances the car (with the controls given, else the current ones) and the traffic by fixed 1/60 s steps without
       *  drawing; a turn-around the car asks for (held against a road end's stop) starts as the live drive starts it, and
       *  the chase camera starts over behind the car. */
      driveAdvance: (seconds: number, controls?: Partial<CarInput>) => {
        const c = car.current; if (!c) return null;
        const use: CarInput = { ...IDLE, ...(controls ?? override.current ?? {}) };
        for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
          footprintCentre(c, body, centre);
          advanceCar(c, use, body, roads, traffic.boxes(centre[0], centre[1], drivingTrafficRange(D,c.speed), boxes.current), 1 / 60, acc.current);
          publish(c); traffic.step(1 / 60);
          if (c.turnRequested) { c.turnRequested = false; void turn(); break; }
        }
        acc.current.t = 0; setRigKey(key => key + 1);
        return read();
      },
    };
  }, [camera, body, roads, traffic, D]); // eslint-disable-line react-hooks/exhaustive-deps
  useRegisterTestHooks(hooks);

  return playing ? <VehicleRig key={rigKey} subject={subject} yaw={() => car.current ? Math.PI / 2 - car.current.heading : 0} speed={() => car.current?.speed ?? 0}
    distance={CHASE.distance} height={CHASE.height} targetHeight={CHASE.targetHeight} lookAhead={CHASE.lookAhead} fov={CHASE.fov}
    fovAtTopSpeed={CHASE.fovAtTopSpeed} topSpeed={D.topSpeed} positionLag={CHASE.positionLag} yawLag={CHASE.yawLag}
    orbitOffset zoom={zoom} active={playing}/> : null;
}
