// Traffic on the six approved vehicles: one draw per vehicle type and level of detail, one shared
// node material. Positions, headings, wheel spin and steer, paint, brake lights and fades are
// per-instance attributes written on the CPU each frame from the simulation (sim.ts); the vertex
// stage places the vehicle, spins and steers its wheels about their pivots and pitches it with the
// road. The lanes run the whole route (fix round 2): each vehicle's lane position is a route station
// placed on the deck or an approach road by ../world/route, heading along the road and pitched with its
// grade. Levels switch by distance (the contract's LOD1 from about 60 m and LOD2 from about 250 m,
// scaled per tier and by the camera's field of view) with hysteresis; wheels exist on LOD0/LOD1
// only. Vehicles dither in and out at the approach roads' ends (inside their dissolve stretches) and
// near the far limit, and dissolve rather than pass through a camera that sits in a lane. On tiers without a shadow map, one more draw lays a
// soft contact shadow under each vehicle at LOD0/LOD1. Traffic is on the dynamic layer (never reflected).
// Parked vehicles (Vista Point, fix round 3) draw with the lanes' vehicles, static and with their lamps off.
import { BufferAttribute, DoubleSide, FrontSide, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, Sphere, Vector3 } from 'three/webgpu';
import type { PerspectiveCamera } from 'three/webgpu';
import { abs, attribute, cameraViewMatrix, cos, float, max, mix, sin, smoothstep, step, uniform, varying, vec3, vec4 } from 'three/tsl';
import { selectCellLod } from '@kiln-scenes/scene-kit';
import { LAYERS, LANE_WIDTH, laneX } from '../constants';
import type { TrafficDensity } from '../tiers';
import { newRoutePoint } from '../world/route';
import type { Route } from '../world/route';
import { BOOTSTRAP as LAYOUT } from '../layout-bootstrap';
import { DENSITY_HEADWAY, PALETTE, TRAFFIC_FLOW, lanePose, laneStation, trafficClasses } from './config';
import { TrafficSim, srgbToLinear } from './sim';
import type { SimObstacle } from './sim';
import type { VehicleModel, VehicleType } from './vehicle-models';

type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Per-instance layout: iA (x, y, z, yaw), iB (pitch, wheel spin, steer, fade), iC (paint rgb linear, brake; PARKED for a parked vehicle, lamps off). */
const INSTANCE_ATTRIBUTES = ['iA', 'iB', 'iC'] as const;
const PARKED = -1;
/** The MSFT_lod screen-coverage thresholds were computed for a 50 degree vertical field of view. */
const REFERENCE_HALF_FOV = Math.tan(25 * Math.PI / 180);
const LOD_HYSTERESIS = .06;
/** Contact shadows, per instance: sA (x, y, z, yaw) and sB (half length, half width, pitch, opacity), metres. */
const SHADOW_ATTRIBUTES = ['sA', 'sB'] as const;
/** A contact shadow reaches SHADOW_MARGIN beyond the body, is full SHADOW_INNER inside it, lies SHADOW_LIFT above the road and fades out over the last 20 % before LOD2. */
const SHADOW_MARGIN = .45, SHADOW_INNER = .6, SHADOW_LIFT = .04, SHADOW_FADE = .2;

export interface TrafficOptions {
  models: ReadonlyMap<VehicleType, VehicleModel>;
  /** The drivable route (deck and approach roads) the lanes follow. */
  route: Route;
  density: TrafficDensity;
  perLaneMax: number;
  /** LOD1 distance, LOD2 distance, far limit (m), at a 50 degree field of view. */
  lod: readonly [number, number, number];
  shadows: boolean;
  /** Peak opacity of the contact shadow under each vehicle at LOD0/LOD1 (0 = none; tiers without a shadow map). */
  contactShadow?: number;
  seed?: number;
  /** Static parked vehicles (layout.json dressing, ../world/dressing parkedVehicles), drawn whether or not the lanes carry traffic. */
  parked?: readonly ParkedCar[];
}
/** A parked vehicle: its body's centre on the ground (scene x, y, z), heading (local +X is (cos yaw, -sin yaw) in x, z) and linear paint. */
export interface ParkedCar { type: VehicleType; x: number; y: number; z: number; yaw: number; paint: readonly [number, number, number] }
/** A driven vehicle drawn with the traffic (the player's sedan); the driving code owns its state. */
export interface DrivenVehicle {
  type: VehicleType; x: number; y: number; z: number; yaw: number; pitch: number;
  spin: number; steer: number; brake: number; paint: readonly [number, number, number];
  /** What the lanes see: traffic brakes for it. */
  obstacle: SimObstacle | null;
}
export interface TrafficStats {
  vehicles: number; spawned: number; removed: number; drawn: number; draws: number; triangles: number;
  perLevel: [number, number, number]; perType: Record<string, number>; braking: number; fading: number; density: TrafficDensity;
  /** Contact shadows drawn this frame (0 on tiers with a shadow map). */
  contactShadows: number;
}
export interface Traffic {
  root: Group; sim: TrafficSim; readonly density: TrafficDensity;
  driven: DrivenVehicle | null;
  update(camera: PerspectiveCamera, dt: number, lights: number): void;
  /** Advances the flow by fixed steps without drawing (deterministic review sequences). */
  advance(seconds: number): void;
  setDensity(density: TrafficDensity): void;
  stats(): TrafficStats;
  /** Vehicle states for tests: world position, route station, lane, speed, level and paint. */
  sample(limit?: number): { id: number; type: string; lane: number; x: number; y: number; z: number; sigma: number; v: number; lod: number; paint: string; fade: number; brake: number }[];
  dispose(): void;
}

/** The shared vehicle material: vertex placement, wheel spin and steer, paint tint, lamps and fade. `lights` is the preset's vehicle-light level. */
export function createVehicleMaterial(lights: N): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = 'golden-gate-vehicles'; material.side = FrontSide; material.alphaHash = true;
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
  // Vehicle frame: pitch with the deck about Z, then heading about Y, then the deck position.
  material.positionNode = (rotY(rotZ(local, cp, sp), cy, sy) as N).add(a.xyz);
  const worldNormal = varying(rotY(rotZ(localNormal, cp, sp), cy, sy), 'v_vehicleNormal') as N;
  material.normalNode = (cameraViewMatrix as N).mul(vec4(worldNormal, 0)).xyz.normalize();
  material.colorNode = vec4(mix(attribute('albedo', 'vec3'), c.xyz, surface.z), 1);
  material.roughnessNode = surface.x; material.metalnessNode = surface.y;
  // Lamps (layout.json lights.vehicleLamps): headlights and taillights brighten with the preset's
  // vehicle lights; brake lamps switch per vehicle; a parked vehicle's lamps are off.
  const kind = surface.w, level = lights, lamp = LAYOUT.lights.vehicleLamps, gain = (k: 'head' | 'tail' | 'brake') => mix(float(lamp.gain[k][0]), float(lamp.gain[k][1]), level);
  const head = step(.5, kind).mul(step(kind, 1.5)), tail = step(1.5, kind).mul(step(kind, 2.5)), brake = step(2.5, kind);
  const headK = gain('head'), tailK = gain('tail'), brakeK = mix(float(lamp.brakeOff), float(1), max(c.w, 0)).mul(gain('brake')), lit = step(0, c.w);
  material.emissiveNode = (attribute('glow', 'vec3') as N).mul(head.mul(headK).add(tail.mul(tailK)).add(brake.mul(brakeK))).mul(lit);
  material.opacityNode = b.w;
  return material;
}

/** The contact-shadow material: a soft dark rectangle in the vehicle's footprint, pitched with the deck, blended over the road. */
export function createContactShadowMaterial(strength: number): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = 'golden-gate-contact-shadows'; material.side = DoubleSide; material.transparent = true; material.depthWrite = false;
  const a = attribute('sA', 'vec4') as N, b = attribute('sB', 'vec4') as N, position = attribute('position', 'vec3') as N;
  const x = position.x.mul(b.x), z = position.z.mul(b.y), cp = cos(b.z), sp = sin(b.z), cy = cos(a.w), sy = sin(a.w);
  const px = x.mul(cp), py = x.mul(sp);
  material.positionNode = vec3(px.mul(cy).add(z.mul(sy)), py, z.mul(cy).sub(px.mul(sy))).add(a.xyz);
  // Metres from the centre (the quad's corners are at +-1), full inside the body less SHADOW_INNER, none at the edge.
  const edge = (half: N, at: N) => float(1).sub(smoothstep(half.sub(SHADOW_MARGIN + SHADOW_INNER), half, abs(at).mul(half)));
  material.colorNode = vec4(0, 0, 0, 1);
  material.opacityNode = edge(b.x, position.x).mul(edge(b.y, position.z)).mul(b.w).mul(strength);
  return material;
}

interface Bucket { type: VehicleType; lod: number; mesh: Mesh; geometry: InstancedBufferGeometry; attributes: InstancedBufferAttribute[]; count: number; triangles: number }

export function createTraffic(o: TrafficOptions): Traffic {
  const types = [...o.models.keys()];
  if (!types.length) throw new Error('Traffic needs at least one vehicle model');
  const classes = trafficClasses(types, type => o.models.get(type)!);
  const sim = new TrafficSim({ seed: o.seed ?? TRAFFIC_FLOW.seed, laneLength: TRAFFIC_FLOW.laneLength, laneSpeeds: TRAFFIC_FLOW.laneSpeeds, meanHeadway: DENSITY_HEADWAY[o.density],
    minHeadway: TRAFFIC_FLOW.minHeadway, perLaneMax: o.perLaneMax, fade: TRAFFIC_FLOW.fade, classes, palette: PALETTE, halfLane: LANE_WIDTH / 2 });
  sim.populate();
  // Parked vehicles: the model's origin from the body's centre (the contact shadow's offset, inverted).
  const parked = (o.parked ?? []).map(p => {
    const [cx, , cz] = o.models.get(p.type)!.boxCentre, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    return { ...p, x: p.x - (cx * c + cz * s), z: p.z - (cz * c - cx * s), lod: 0 };
  });
  const capacity = sim.lanes.length * o.perLaneMax + 1 + parked.length; // every lane full, the driven car and the parked ones
  const lights = uniform(0), material = createVehicleMaterial(lights);
  const root = new Group(); root.name = 'traffic';
  const buckets = new Map<string, Bucket>();
  for (const type of types) for (let lod = 0; lod < 3; lod++) {
    const geometry = o.models.get(type)!.lods[lod]!;
    const attributes = INSTANCE_ATTRIBUTES.map(name => { const attr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4); geometry.setAttribute(name, attr); return attr; });
    const mesh = new Mesh(geometry, material);
    mesh.name = `traffic-${type}-lod${lod}`; mesh.frustumCulled = false; mesh.visible = false;
    mesh.layers.set(LAYERS.dynamic); mesh.castShadow = o.shadows && lod < 2; mesh.receiveShadow = o.shadows;
    root.add(mesh);
    buckets.set(`${type}/${lod}`, { type, lod, mesh, geometry, attributes, count: 0, triangles: geometry.index!.count / 3 });
  }
  // Contact shadows: one instanced quad for every vehicle drawn at LOD0/LOD1.
  const shadowStrength = o.shadows ? 0 : o.contactShadow ?? 0;
  const shadowGeometry = new InstancedBufferGeometry();
  shadowGeometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]), 3));
  shadowGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const shadowAttributes = SHADOW_ATTRIBUTES.map(name => { const attr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4); shadowGeometry.setAttribute(name, attr); return attr; }) as [InstancedBufferAttribute, InstancedBufferAttribute];
  const shadowMaterial = createContactShadowMaterial(shadowStrength);
  const shadowMesh = new Mesh(shadowGeometry, shadowMaterial);
  shadowMesh.name = 'traffic-contact-shadows'; shadowMesh.frustumCulled = false; shadowMesh.visible = false; shadowMesh.castShadow = shadowMesh.receiveShadow = false;
  shadowMesh.layers.set(LAYERS.dynamic);
  if (shadowStrength > 0) root.add(shadowMesh);
  let shadowCount = 0;
  const zAt = laneStation, point = newRoutePoint();
  const onRoute = (lane: number, s: number) => lanePose(o.route, lane, s, point);
  const frustum = new Frustum(), projection = new Matrix4(), sphere = new Sphere(), eye = new Vector3();
  let density = o.density, braking = 0, fading = 0;
  const perLevel: [number, number, number] = [0, 0, 0];

  /** Writes one vehicle into its bucket; returns the level used (or the previous one when not drawn). */
  function place(type: VehicleType, x: number, y: number, z: number, yaw: number, pitch: number, spin: number, steer: number, fade: number,
    tint: readonly number[], brake: number, level: number, fovScale: number, solid = false): number {
    const model = o.models.get(type)!, lodDistances = o.lod;
    const distance = Math.hypot(x - eye.x, y + model.height / 2 - eye.y, z - eye.z);
    if (distance > lodDistances[2]) return 2;
    const lod = selectCellLod(distance * fovScale, [lodDistances[0], lodDistances[1], Infinity], level, LOD_HYSTERESIS);
    // Dither out near the far limit, and dissolve instead of passing through a camera standing in the lane.
    let alpha = Math.min(fade, (lodDistances[2] - distance) / (lodDistances[2] * .12));
    // Along and across the vehicle's heading (local +X is (cos yaw, -sin yaw) in x, z).
    const dx = x - eye.x, dz = z - eye.z, hx = Math.cos(yaw), hz = -Math.sin(yaw);
    const along = Math.abs(dx * hx + dz * hz), across = Math.abs(dx * hz - dz * hx);
    if (!solid && across < model.width / 2 + .6 && eye.y - y < model.height + .5 && eye.y > y - .5) alpha = Math.min(alpha, (along - model.length / 2 - .5) / 4);
    if (alpha <= .01) return lod;
    sphere.center.set(x, y + model.bounds.centre[1], z); sphere.radius = model.bounds.radius + Math.abs(model.bounds.centre[0]) + .5;
    if (!frustum.intersectsSphere(sphere)) return lod;
    const bucket = buckets.get(`${type}/${lod}`)!, i = bucket.count++;
    const [ia, ib, ic] = bucket.attributes as [InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute];
    (ia.array as Float32Array).set([x, y, z, yaw], i * 4);
    (ib.array as Float32Array).set([pitch, spin, steer, Math.min(1, alpha)], i * 4);
    (ic.array as Float32Array).set([tint[0]!, tint[1]!, tint[2]!, brake], i * 4);
    perLevel[lod]!++; if (brake > .5) braking++; if (alpha < 1) fading++;
    if (shadowStrength > 0 && lod < 2) {
      // Under the body's centre, faded out before the switch to LOD2 so it never pops.
      const opacity = Math.min(1, alpha) * Math.min(1, (lodDistances[1] - distance * fovScale) / (lodDistances[1] * SHADOW_FADE));
      if (opacity > .01) {
        const [cx, , cz] = model.boxCentre, c = Math.cos(yaw), s = Math.sin(yaw), j = shadowCount++;
        (shadowAttributes[0].array as Float32Array).set([x + cx * c + cz * s, y + SHADOW_LIFT + Math.sin(pitch) * cx, z + cz * c - cx * s, yaw], j * 4);
        (shadowAttributes[1].array as Float32Array).set([model.length / 2 + SHADOW_MARGIN, model.width / 2 + SHADOW_MARGIN, pitch, opacity], j * 4);
      }
    }
    return lod;
  }

  const traffic: Traffic = {
    root, sim, driven: null,
    get density() { return density; },
    update(camera, dt, lightLevel) {
      lights.value = lightLevel;
      const driven = traffic.driven;
      sim.step(dt, driven?.obstacle ?? null, laneX, zAt);
      camera.updateMatrixWorld(); eye.setFromMatrixPosition(camera.matrixWorld);
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const fovScale = Math.tan(camera.fov * Math.PI / 360) / REFERENCE_HALF_FOV;
      for (const bucket of buckets.values()) bucket.count = 0;
      perLevel.fill(0); braking = 0; fading = 0; shadowCount = 0;
      for (const lane of sim.lanes) for (const car of lane) {
        const { p, yaw, pitch } = onRoute(car.lane, car.s);
        car.lod = place(classes[car.cls]!.name as VehicleType, p.x, p.y, p.z, yaw, pitch, car.spin, 0, car.fade, car.tint, car.brake, car.lod, fovScale);
      }
      for (const car of parked) car.lod = place(car.type, car.x, car.y, car.z, car.yaw, 0, 0, 0, 1, car.paint, PARKED, car.lod, fovScale);
      // The driven car is always at full detail and never dissolves.
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
    advance(seconds) { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) sim.step(1 / 30, traffic.driven?.obstacle ?? null, laneX, zAt); },
    setDensity(next) { density = next; sim.setMeanHeadway(DENSITY_HEADWAY[next]); },
    stats() {
      const perType: Record<string, number> = {};
      let drawn = 0, draws = 0, triangles = 0;
      for (const bucket of buckets.values()) { if (!bucket.count) continue; drawn += bucket.count; draws++; triangles += bucket.count * bucket.triangles; perType[bucket.type] = (perType[bucket.type] ?? 0) + bucket.count; }
      if (shadowCount) { draws++; triangles += shadowCount * 2; }
      return { vehicles: sim.count, spawned: sim.spawned, removed: sim.removed, drawn, draws, triangles, perLevel: [...perLevel] as [number, number, number], perType, braking, fading, density, contactShadows: shadowCount };
    },
    sample(limit = 12) {
      const out: ReturnType<Traffic['sample']> = [];
      for (const lane of sim.lanes) for (const car of lane) {
        if (out.length >= limit) return out;
        const { p } = onRoute(car.lane, car.s);
        out.push({ id: car.id, type: classes[car.cls]!.name, lane: car.lane, x: p.x, y: p.y, z: p.z, sigma: zAt(car.lane, car.s), v: car.v, lod: car.lod, paint: PALETTE[car.paint]!.name, fade: car.fade, brake: car.brake });
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

/** Linear paint for a palette entry by name (the driven car uses a fixed colour). */
export function paintLinear(name: string): [number, number, number] {
  const entry = PALETTE.find(p => p.name === name) ?? PALETTE[0]!;
  return [srgbToLinear(entry.srgb[0]), srgbToLinear(entry.srgb[1]), srgbToLinear(entry.srgb[2])];
}
