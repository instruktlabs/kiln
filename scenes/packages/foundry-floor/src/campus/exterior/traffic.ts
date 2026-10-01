// SPDX-License-Identifier: MIT
// Campus traffic on the six approved vehicles (FF-C1 item 5), drawn the way Golden Gate draws its traffic (packages/
// golden-gate/src/traffic/traffic.ts, the pattern copied, not imported): one draw per vehicle type and level of
// detail, one shared node material. Positions, headings, wheel spin and steer, paint, brake lights and fades are
// per-instance attributes written on the CPU each frame from the simulation (../drive/traffic-sim); the vertex stage
// places the vehicle, spins and steers its wheels about their pivots. The roads are flat at grade, so no pitch but the
// driven car's curb bump. Levels switch by distance (the tier's trafficLod, scaled by the camera's field of view) with
// hysteresis; wheels exist on LOD0/LOD1 only. Vehicles dither in and out at the lane ends (inside the split road's
// dissolve stretch) and near the far limit, and dissolve rather than pass through a camera standing in a lane. One more
// draw lays a soft contact shadow under each vehicle at LOD0/LOD1 (the exterior has no shadow map). The viewer's car
// draws with the traffic, always at full detail.
import { BufferAttribute, DoubleSide, FrontSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Sphere, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { abs, attribute, cameraViewMatrix, cos, float, max, mix, sin, smoothstep, step, uniform, varying, vec3, vec4 } from 'three/tsl';
import { selectCellLod } from '@kiln-scenes/scene-kit';
import type { CampusLane, CampusTier } from '../data';
import type { DrivingData, LampData, VehicleType } from '../drive/driving';
import { VEHICLE_TYPES } from '../drive/driving';
import { TrafficSim, checkLaneFade, trafficClasses } from '../drive/traffic-sim';
import type { CarObstacle } from '../drive/traffic-sim';
import type { VehicleModel } from './vehicles';
import { articulateFreight, freightFleet, FREIGHT_TYPES, parkedFreight } from './freight';
import type { TrafficBox } from '../drive/car';

type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Per-instance layout: iA (x, y, z, yaw), iB (pitch, wheel spin, steer, fade), iC (paint rgb linear, brake). */
const INSTANCE_ATTRIBUTES = ['iA', 'iB', 'iC'] as const;
/** The MSFT_lod screen-coverage thresholds were computed for a 50 degree vertical field of view (Golden Gate's rule). */
const REFERENCE_HALF_FOV = Math.tan(25 * Math.PI / 180);
const LOD_HYSTERESIS = .06;
/** Contact shadows, per instance: sA (x, y, z, yaw) and sB (half length, half width, pitch, opacity), metres. */
const SHADOW_ATTRIBUTES = ['sA', 'sB'] as const;
const SHADOW_MARGIN = .45, SHADOW_INNER = .6, SHADOW_LIFT = .04, SHADOW_FADE = .2;

/** The viewer's car as the traffic draws it (the drive owns its state): model origin, three.js yaw, pitch, wheels, paint, brake. */
export interface DrivenVehicle {
  type: VehicleType; x: number; y: number; z: number; yaw: number; pitch: number;
  spin: number; steer: number; brake: number; paint: readonly [number, number, number];
  /** What the lanes see: traffic brakes for it. */
  obstacle: CarObstacle | null;
}
export interface TrafficStats {
  parked: number;
  vehicles: number; spawned: number; removed: number; drawn: number; draws: number; triangles: number;
  perLevel: [number, number, number]; perType: Record<string, number>; braking: number; fading: number; contactShadows: number;
}
export interface CampusTraffic {
  root: Group; sim: TrafficSim; models: ReadonlyMap<string, VehicleModel>;
  driven: DrivenVehicle | null;
  /** Advances the flow by `dt` (the car, when driven, is its obstacle). */
  step(dt: number): void;
  /** Writes this frame's instances for `camera`. */
  draw(camera: PerspectiveCamera): void;
  /** Advances the flow by fixed steps without drawing (deterministic review sequences). */
  advance(seconds: number): void;
  stats(): TrafficStats;
  /** Actual rigid bodies, including separate articulated tractor/trailer footprints. */
  boxes(u: number, v: number, range: number, out?: TrafficBox[]): TrafficBox[];
  sample(limit?: number): { id: number; type: string; lane: string; u: number; v: number; heading: number; s: number; speed: number; lod: number; paint: string; fade: number; brake: number }[];
  dispose(): void;
}

/** The shared vehicle material: vertex placement, wheel spin and steer, paint tint, lamps and fade. `level` is the preset's vehicle-light level. */
export function createVehicleMaterial(level: N, lamps: LampData): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'campus-vehicles'; material.side = FrontSide; material.alphaHash = true;
  const a = attribute('iA', 'vec4') as N, b = attribute('iB', 'vec4') as N, c = attribute('iC', 'vec4') as N;
  const wheel = attribute('wheel', 'vec4') as N, surface = attribute('surface', 'vec4') as N;
  const position = attribute('position', 'vec3') as N, normal = attribute('normal', 'vec3') as N;
  const rotZ = (v: N, cz: N, sz: N) => vec3(v.x.mul(cz).sub(v.y.mul(sz)), v.x.mul(sz).add(v.y.mul(cz)), v.z);
  const rotY = (v: N, cy: N, sy: N) => vec3(v.x.mul(cy).add(v.z.mul(sy)), v.y, v.z.mul(cy).sub(v.x.mul(sy)));
  const isWheel = step(.5, wheel.w), isFront = step(1.5, wheel.w);
  // Wheels roll about their axle (vehicle Z, forward rolling is a negative angle) and front wheels steer about Y.
  const spin = (b.y as N).negate(), steer = (b.z as N).mul(isFront);
  const cs = cos(spin), ss = sin(spin), ct = cos(steer), st = sin(steer);
  const cp = cos(b.x), sp = sin(b.x), cy = cos(a.w), sy = sin(a.w);
  const wheeled = (wheel.xyz as N).add(rotY(rotZ(position.sub(wheel.xyz), cs, ss), ct, st));
  const local = mix(position, wheeled, isWheel), localNormal = mix(normal, rotY(rotZ(normal, cs, ss), ct, st), isWheel);
  // Vehicle frame: pitch about Z, then heading about Y, then the plan position.
  material.positionNode = (rotY(rotZ(local, cp, sp), cy, sy) as N).add(a.xyz);
  const worldNormal = varying(rotY(rotZ(localNormal, cp, sp), cy, sy), 'v_vehicleNormal') as N;
  material.normalNode = (cameraViewMatrix as N).mul(vec4(worldNormal, 0)).xyz.normalize();
  material.colorNode = vec4(mix(attribute('albedo', 'vec3'), c.xyz, surface.z), 1);
  material.roughnessNode = surface.x; material.metalnessNode = surface.y;
  // Lamps: head and tail lamps brighten with the preset's vehicle-light level; brake lamps switch per vehicle.
  const kind = surface.w, gain = (k: 'head' | 'tail' | 'brake') => mix(float(lamps.gain[k][0]), float(lamps.gain[k][1]), level);
  const head = step(.5, kind).mul(step(kind, 1.5)), tail = step(1.5, kind).mul(step(kind, 2.5)), brake = step(2.5, kind);
  const brakeK = mix(float(lamps.brakeOff), float(1), max(c.w, 0)).mul(gain('brake'));
  material.emissiveNode = (attribute('glow', 'vec3') as N).mul(head.mul(gain('head')).add(tail.mul(gain('tail'))).add(brake.mul(brakeK)));
  material.opacityNode = b.w;
  return material;
}

/** The contact-shadow material: a soft dark rectangle in the vehicle's footprint, blended over the road. */
function createContactShadowMaterial(strength: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = 'campus-contact-shadows'; material.side = DoubleSide; material.transparent = true; material.depthWrite = false;
  const a = attribute('sA', 'vec4') as N, b = attribute('sB', 'vec4') as N, position = attribute('position', 'vec3') as N;
  const x = position.x.mul(b.x), z = position.z.mul(b.y), cp = cos(b.z), sp = sin(b.z), cy = cos(a.w), sy = sin(a.w);
  const px = x.mul(cp), py = x.mul(sp);
  material.positionNode = vec3(px.mul(cy).add(z.mul(sy)), py, z.mul(cy).sub(px.mul(sy))).add(a.xyz);
  const edge = (half: N, at: N) => float(1).sub(smoothstep(half.sub(SHADOW_MARGIN + SHADOW_INNER), half, abs(at).mul(half)));
  material.colorNode = vec4(0, 0, 0, 1);
  material.opacityNode = edge(b.x, position.x).mul(edge(b.y, position.z)).mul(b.w).mul(strength);
  return material;
}

interface Bucket { type: string; lod: number; mesh: Mesh; geometry: InstancedBufferGeometry; attributes: InstancedBufferAttribute[]; count: number; triangles: number }

export interface CampusTrafficOptions {
  models: ReadonlyMap<string, VehicleModel>;
  lanes: readonly CampusLane[];
  driving: DrivingData;
  tier: CampusTier;
  /** The split road's dissolve stretch: the lane fade must fit inside it. */
  dissolve: number;
  /** Half a lane's width (m). */
  halfLane: number;
  /** Road surface height. */
  gradeY: number;
}

export function createCampusTraffic(o: CampusTrafficOptions): CampusTraffic {
  const types = [...o.models.keys()], flow = o.driving.flow;
  if (!types.length) throw new Error('Traffic needs at least one vehicle model');
  checkLaneFade(flow, o.dissolve);
  const hasFreight = FREIGHT_TYPES.some(type => o.models.has(type));
  if (hasFreight && !flow.freight?.length) throw new Error('Freight models require explicit flow.freight data');
  const fleet = freightFleet(o.models, hasFreight ? flow.freight! : []);
  const parking = hasFreight ? o.driving.freightParking ?? [] : [];
  const parked = parking.flatMap(row => {
    const coupling = fleet.couplings.get(row.name);
    if (coupling) {
      const pose = parkedFreight(row.x, row.z, row.heading, coupling);
      return [{ type: coupling.tractor, ...pose.tractor, lod: 0 }, { type: coupling.trailer, ...pose.trailer, lod: 0 }];
    }
    const model = o.models.get(row.name);
    if (!model) throw new Error(`Parked freight ${row.name} has no model`);
    const c = Math.cos(row.heading), s = Math.sin(row.heading), [cx, , cz] = model.boxCentre;
    return [{ type: row.name, x: row.x-cx*c+cz*s, y: 0, z: row.z-cx*s-cz*c, heading: row.heading, lod: 0 }];
  });
  const classes = [...trafficClasses(flow, VEHICLE_TYPES.filter(type => o.models.has(type)), type => o.models.get(type)!), ...fleet.classes];
  const sim = new TrafficSim({ lanes: o.lanes, flow, classes, meanHeadway: o.tier.trafficHeadway, perLaneMax: o.tier.trafficPerLane, halfLane: o.halfLane });
  sim.populate();
  const capacity = 2 * o.lanes.length * o.tier.trafficPerLane + parked.length + 1;
  const lights = uniform(o.driving.lamps.day), material = createVehicleMaterial(lights, o.driving.lamps);
  const root = new Group(); root.name = 'campus-traffic';
  const buckets = new Map<string, Bucket>();
  for (const type of types) for (let lod = 0; lod < 3; lod++) {
    const geometry = o.models.get(type)!.lods[lod]!;
    const attributes = INSTANCE_ATTRIBUTES.map(name => { const attr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4); geometry.setAttribute(name, attr); return attr; });
    const mesh = new Mesh(geometry, material);
    mesh.name = `traffic-${type}-lod${lod}`; mesh.frustumCulled = false; mesh.visible = false;
    root.add(mesh);
    buckets.set(`${type}/${lod}`, { type, lod, mesh, geometry, attributes, count: 0, triangles: geometry.index!.count / 3 });
  }
  const shadowStrength = flow.contactShadow;
  const shadowGeometry = new InstancedBufferGeometry();
  shadowGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  shadowGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const shadowAttributes = SHADOW_ATTRIBUTES.map(name => { const attr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4); shadowGeometry.setAttribute(name, attr); return attr; }) as [InstancedBufferAttribute, InstancedBufferAttribute];
  const shadowMaterial = createContactShadowMaterial(shadowStrength);
  const shadowMesh = new Mesh(shadowGeometry, shadowMaterial);
  shadowMesh.name = 'traffic-contact-shadows'; shadowMesh.frustumCulled = false; shadowMesh.visible = false;
  // After the ground layers (drawn first without depth), before the vehicles.
  shadowMesh.renderOrder = -5;
  if (shadowStrength > 0) root.add(shadowMesh);
  let shadowCount = 0;
  const frustum = new Frustum(), projection = new Matrix4(), sphere = new Sphere(), eye = new Vector3();
  let braking = 0, fading = 0;
  const perLevel: [number, number, number] = [0, 0, 0], lod = o.tier.trafficLod, y0 = o.gradeY;

  /** Writes one vehicle into its bucket (model origin at x, z; three.js yaw); returns the level used. */
  function place(type: string, x: number, y: number, z: number, yaw: number, pitch: number, spin: number, steer: number, fade: number,
    tint: readonly number[], brake: number, level: number, fovScale: number, solid = false): number {
    const model = o.models.get(type)!;
    const distance = Math.hypot(x - eye.x, y + model.height / 2 - eye.y, z - eye.z);
    if (distance > lod[2]) return 2;
    const next = solid ? 0 : selectCellLod(distance * fovScale, [lod[0], lod[1], Infinity], level, LOD_HYSTERESIS);
    // Dither out near the far limit, and dissolve instead of passing through a camera standing in the lane.
    let alpha = solid ? 1 : Math.min(fade, (lod[2] - distance) / (lod[2] * .12));
    const dx = x - eye.x, dz = z - eye.z, hx = Math.cos(yaw), hz = -Math.sin(yaw);
    const along = Math.abs(dx * hx + dz * hz), across = Math.abs(dx * hz - dz * hx);
    if (!solid && across < model.width / 2 + .6 && eye.y - y < model.height + .5 && eye.y > y - .5) alpha = Math.min(alpha, (along - model.length / 2 - .5) / 4);
    if (alpha <= .01) return next;
    sphere.center.set(x, y + model.bounds.centre[1], z); sphere.radius = model.bounds.radius + Math.abs(model.bounds.centre[0]) + .5;
    if (!frustum.intersectsSphere(sphere)) return next;
    const bucket = buckets.get(`${type}/${next}`)!, i = bucket.count++;
    const [ia, ib, ic] = bucket.attributes as [InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute];
    (ia.array as Float32Array).set([x, y, z, yaw], i * 4);
    (ib.array as Float32Array).set([pitch, spin, steer, Math.min(1, alpha)], i * 4);
    (ic.array as Float32Array).set([tint[0]!, tint[1]!, tint[2]!, brake], i * 4);
    perLevel[next]!++; if (brake > .5) braking++; if (alpha < 1) fading++;
    if (shadowStrength > 0 && next < 2) {
      const opacity = Math.min(1, alpha) * (solid ? 1 : Math.min(1, (lod[1] - distance * fovScale) / (lod[1] * SHADOW_FADE)));
      if (opacity > .01) {
        const [cx, , cz] = model.boxCentre, c = Math.cos(yaw), s = Math.sin(yaw), j = shadowCount++;
        (shadowAttributes[0].array as Float32Array).set([x + cx * c + cz * s, y + SHADOW_LIFT + Math.sin(pitch) * cx, z + cz * c - cx * s, yaw], j * 4);
        (shadowAttributes[1].array as Float32Array).set([model.length / 2 + SHADOW_MARGIN, model.width / 2 + SHADOW_MARGIN, pitch, opacity], j * 4);
      }
    }
    return next;
  }

  const traffic: CampusTraffic = {
    root, sim, models: o.models, driven: null,
    step(dt) { sim.step(dt, traffic.driven?.obstacle ?? null); },
    draw(camera) {
      camera.updateMatrixWorld(); eye.setFromMatrixPosition(camera.matrixWorld);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const fovScale = Math.tan(camera.fov * Math.PI / 360) / REFERENCE_HALF_FOV;
      for (const bucket of buckets.values()) bucket.count = 0;
      perLevel.fill(0); braking = 0; fading = 0; shadowCount = 0;
      for (const list of sim.lanes) for (const car of list) {
        const coupling = fleet.couplings.get(classes[car.cls]!.name);
        if (coupling) {
          const pose = articulateFreight(o.lanes[car.lane]!, car.s, coupling), a = pose.tractor, b = pose.trailer;
          car.lod = place(coupling.tractor, a.x, y0+a.y, a.z, -a.heading, 0, car.spin, 0, car.fade, car.tint, car.brake, car.lod, fovScale);
          place(coupling.trailer, b.x, y0+b.y, b.z, -b.heading, 0, car.spin*coupling.trailerSpinScale, 0, car.fade, car.tint, car.brake, car.lod, fovScale);
          continue;
        }
        const cls = classes[car.cls]!, model = o.models.get(cls.name)!, c = Math.cos(car.heading), s = Math.sin(car.heading);
        // The simulation's position is the footprint centre: the model origin sits back from it by the box centre.
        const x = car.pu - model.boxCentre[0] * c + model.boxCentre[2] * s, z = car.pv - model.boxCentre[0] * s - model.boxCentre[2] * c;
        car.lod = place(cls.name, x, y0, z, -car.heading, 0, car.spin, 0, car.fade, car.tint, car.brake, car.lod, fovScale);
      }
      const driven = traffic.driven;
      for (const part of parked) part.lod = place(part.type, part.x, y0+part.y, part.z, -part.heading, 0, 0, 0, 1, [.72,.75,.77], 0, part.lod, fovScale);
      if (driven) place(driven.type, driven.x, driven.y, driven.z, driven.yaw, driven.pitch, driven.spin, driven.steer, 1, driven.paint, driven.brake, 0, 0, true);
      for (const bucket of buckets.values()) {
        bucket.mesh.visible = bucket.count > 0;
        bucket.geometry.instanceCount = bucket.count;
        if (!bucket.count) continue;
        for (const attr of bucket.attributes) { attr.clearUpdateRanges(); attr.addUpdateRange(0, bucket.count * 4); attr.needsUpdate = true; }
      }
      shadowMesh.visible = shadowCount > 0; shadowGeometry.instanceCount = shadowCount;
      if (shadowCount) for (const attr of shadowAttributes) { attr.clearUpdateRanges(); attr.addUpdateRange(0, shadowCount * 4); attr.needsUpdate = true; }
    },
    advance(seconds) { const h = 1 / flow.stepsPerSecond; for (let t = 0; t < seconds - 1e-9; t += h) sim.step(h, traffic.driven?.obstacle ?? null); },
    boxes(u, v, range, out = []) {
      let count = 0;
      const put = (x: number, z: number, heading: number, length: number, width: number, speed: number) => {
        const box = out[count] ?? (out[count] = { u: 0, v: 0, heading: 0, halfLength: 0, halfWidth: 0, speed: 0 });
        Object.assign(box, { u: x, v: z, heading, halfLength: length / 2, halfWidth: width / 2, speed }); count++;
      };
      for (const list of sim.lanes) for (const car of list) {
        const cls = classes[car.cls]!;
        if (Math.abs(car.pu-u)>range+cls.length || Math.abs(car.pv-v)>range+cls.length) continue;
        const coupling = fleet.couplings.get(cls.name);
        if (!coupling) { put(car.pu, car.pv, car.heading, cls.length, cls.width, car.v); continue; }
        const pose = articulateFreight(o.lanes[car.lane]!, car.s, coupling);
        for (const [type, part] of [[coupling.tractor, pose.tractor], [coupling.trailer, pose.trailer]] as const) {
          const model = o.models.get(type)!, [cx, , cz] = model.boxCentre, c = Math.cos(part.heading), s = Math.sin(part.heading);
          put(part.x+cx*c-cz*s, part.z+cx*s+cz*c, part.heading, model.length, model.width, car.v);
        }
      }
      for (const part of parked) {
        const model = o.models.get(part.type)!;
        if (Math.abs(part.x-u)>range+model.length || Math.abs(part.z-v)>range+model.length) continue;
        const [cx, , cz] = model.boxCentre, c = Math.cos(part.heading), s = Math.sin(part.heading);
        put(part.x+cx*c-cz*s, part.z+cx*s+cz*c, part.heading, model.length, model.width, 0);
      }
      out.length = count; return out;
    },
    stats() {
      const perType: Record<string, number> = {};
      let drawn = 0, draws = 0, triangles = 0;
      for (const bucket of buckets.values()) { if (!bucket.count) continue; drawn += bucket.count; draws++; triangles += bucket.count * bucket.triangles; perType[bucket.type] = (perType[bucket.type] ?? 0) + bucket.count; }
      if (shadowCount) { draws++; triangles += shadowCount * 2; }
      return { vehicles: sim.count, parked: parking.length, spawned: sim.spawned, removed: sim.removed, drawn, draws, triangles, perLevel: [...perLevel] as [number, number, number], perType, braking, fading, contactShadows: shadowCount };
    },
    sample(limit = 12) {
      const out: ReturnType<CampusTraffic['sample']> = [];
      for (const list of sim.lanes) for (const car of list) {
        if (out.length >= limit) return out;
        out.push({ id: car.id, type: classes[car.cls]!.name, lane: o.lanes[car.lane]!.id, u: car.pu, v: car.pv, heading: car.heading, s: car.s, speed: car.v, lod: car.lod,
          paint: flow.palette[car.paint]!.name, fade: car.fade, brake: car.brake });
      }
      return out;
    },
    dispose() {
      root.removeFromParent(); material.dispose(); shadowMaterial.dispose(); shadowGeometry.dispose();
      for (const bucket of buckets.values()) for (const name of INSTANCE_ATTRIBUTES) bucket.geometry.deleteAttribute(name);
      for (const model of o.models.values()) for (const geometry of model.lods) geometry.dispose();
    },
  };
  return traffic;
}
