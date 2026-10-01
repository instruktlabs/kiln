// SPDX-License-Identifier: MIT
// Test and dev builds only (tests/tools/drive-check.ts; fix round 2, the owner's acceptance for the
// approach roads): the car model drives its whole route, from the south end stop over the deck to the
// north end stop, turns around there and drives back, and every fixed car step (1/120 s) samples its
// wheels against the rendered road surfaces: the bridge's Roadway and expansion joints and the approach
// roads' near mesh, as world-space triangles. Across the joints at each deck end (approach road to
// anchorage at roadEndZ, anchorage to side span at the anchorage's inner face, with the side span's
// expansion joint 1 m outboard of it) and the towers' expansion joints the car's path is also
// resampled every `dense` metres; each pass through a joint window is its own sequence (the samples
// before and after it are compared in the per-step sequence). Every traffic lane is sampled the same way
// from one approach end to the other with the traffic's own pose (./traffic/config lanePose) and the
// longest-wheelbase vehicle, from half its wheelbase past the lane's entry to half a wheelbase short of
// its exit: at a lane end the vehicle is faded out in the dissolve stretch, and its outer axle would
// stand past the modelled road's end.
// Reported, per run: the largest vertical step of the body and of each wheel's surface between
// consecutive samples, the largest pitch change between consecutive samples, the largest wheel gap to
// the surface, and every wheel with no road under it.
import { Vector3 } from 'three/webgpu';
import type { BufferAttribute, Mesh, Object3D } from 'three/webgpu';
import { LANES } from '../constants';
import { LAYOUT } from '../data';
import { lanePose, laneStation, TRAFFIC_FLOW } from '../traffic/config';
import type { VehicleModel } from '../traffic/vehicle-models';
import type { Bridge } from '../world/bridge';
import { newRoutePoint } from '../world/route';
import { createCar, endStop, stepCar, turnAround } from './car';
import type { CarBody, CarInput, CarState } from './car';
import { carPose, newCarPose } from './car-pose';

/** The bridge meshes a wheel may stand on; the approach roads' near road mesh is added by name. */
export const ROAD_SURFACE_NODES = ['Roadway', 'Deck_Mesh_ExpansionJoints'] as const;
const APPROACH_ROAD = 'approaches-near-road';

/** Road triangles in world space, bucketed on a square grid in x, z; the highest one under a point is the surface. */
export class RoadSurfaces {
  private readonly cells = new Map<number, number[]>();
  private readonly tri: number[] = [];
  private readonly names: string[] = [];
  constructor(meshes: readonly Mesh[], private readonly cell = 2) {
    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const position = mesh.geometry.getAttribute('position') as BufferAttribute, index = mesh.geometry.index, count = index ? index.count : position.count;
      for (let k = 0; k + 2 < count; k += 3) {
        a.fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(mesh.matrixWorld);
        b.fromBufferAttribute(position, index ? index.getX(k + 1) : k + 1).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(position, index ? index.getX(k + 2) : k + 2).applyMatrix4(mesh.matrixWorld);
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz);
        // Walls and faces steeper than 60 degrees are not driving surfaces.
        if (!(length > 1e-12) || Math.abs(ny) / length < .5) continue;
        const t = this.names.length;
        this.tri.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); this.names.push(mesh.name);
        const x0 = Math.floor(Math.min(a.x, b.x, c.x) / cell), x1 = Math.floor(Math.max(a.x, b.x, c.x) / cell);
        const z0 = Math.floor(Math.min(a.z, b.z, c.z) / cell), z1 = Math.floor(Math.max(a.z, b.z, c.z) / cell);
        for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
          const key = this.key(i, j), list = this.cells.get(key);
          if (list) list.push(t); else this.cells.set(key, [t]);
        }
      }
    }
  }
  get triangles(): number { return this.names.length; }
  private key(i: number, j: number): number { return (i + 32768) * 65536 + (j + 32768); }
  /** The highest surface point under (x, z), or null when no road triangle covers it. */
  height(x: number, z: number): { y: number; name: string } | null {
    const list = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); if (!list) return null;
    let best: { y: number; name: string } | null = null;
    for (const t of list) {
      const p = t * 9, T = this.tri;
      const ax = T[p]!, ay = T[p + 1]!, az = T[p + 2]!, bx = T[p + 3]!, by = T[p + 4]!, bz = T[p + 5]!, cx = T[p + 6]!, cy = T[p + 7]!, cz = T[p + 8]!;
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-12) continue;
      const w1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, w2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w3 = 1 - w1 - w2;
      if (w1 < -1e-6 || w2 < -1e-6 || w3 < -1e-6) continue;
      const y = w1 * ay + w2 * by + w3 * cy;
      if (!best || y > best.y) best = { y, name: this.names[t]! };
    }
    return best;
  }
}

/** The road surfaces of the bridge's near model and the approach roads' near mesh. */
export function roadSurfaces(bridge: Bridge): RoadSurfaces {
  const meshes: Mesh[] = [], wanted = new Set<string>(ROAD_SURFACE_NODES);
  const collect = (root: Object3D, keep: (node: Object3D) => boolean) => root.traverse(node => { if ((node as Mesh).isMesh && keep(node)) meshes.push(node as Mesh); });
  collect(bridge.web, node => { for (let n: Object3D | null = node; n && n !== bridge.web; n = n.parent) if (wanted.has(n.name)) return true; return false; });
  collect(bridge.approachMeshes.near.group, node => node.name === APPROACH_ROAD);
  for (const name of [...ROAD_SURFACE_NODES, APPROACH_ROAD]) if (!meshes.some(m => m.name === name || m.parent?.name === name)) throw new Error(`No road surface mesh ${name}`);
  return new RoadSurfaces(meshes);
}

/** Contact points of a vehicle's wheels (vehicle frame: +X forward, +Y up) placed at (x, y, z) with the traffic yaw and a pitch. */
function wheelContacts(model: VehicleModel, x: number, y: number, z: number, yaw: number, pitch: number): [number, number, number][] {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return model.wheels.map(w => {
    const lx = w.offset[0], ly = w.offset[1] - model.wheelRadius, lz = w.offset[2];
    const px = lx * cp - ly * sp, py = lx * sp + ly * cp;
    return [x + px * cy + lz * sy, y + py, z + lz * cy - px * sy];
  });
}

export interface ContactLimits { step: number; pitchDeg: number; gap: number }
export const CONTACT_LIMITS: ContactLimits = { step: .03, pitchDeg: 1, gap: .05 };

interface Sample { at: number; y: number; pitch: number; wheels: [number, number, number][] }
/** Running maxima over one sequence of samples (consecutive samples are compared). */
class Tally {
  samples = 0; missing = 0;
  bodyStep = { value: 0, at: 0 }; surfaceStep = { value: 0, at: 0, wheel: '', surfaces: '' }; pitchStep = { deg: 0, at: 0 }; gap = { value: 0, at: 0, wheel: '', surface: '' };
  firstMissing: { at: number; wheel: string; x: number; z: number }[] = [];
  surfaces: Record<string, number> = {};
  range: [number, number] = [Infinity, -Infinity];
  private previous: { y: number; pitch: number; surface: ({ y: number; name: string } | null)[] } | null = null;
  constructor(private readonly roads: RoadSurfaces, private readonly model: VehicleModel) {}
  /** Starts a new sequence (after a turn-around or a new lane). */
  break(): void { this.previous = null; }
  add(s: Sample): void {
    this.samples++; this.range[0] = Math.min(this.range[0], s.at); this.range[1] = Math.max(this.range[1], s.at);
    const surface = s.wheels.map(([x, y, z], k) => {
      const hit = this.roads.height(x, z), wheel = this.model.wheels[k]!.name;
      if (!hit) { this.missing++; if (this.firstMissing.length < 8) this.firstMissing.push({ at: +s.at.toFixed(2), wheel, x: +x.toFixed(2), z: +z.toFixed(2) }); return null; }
      this.surfaces[hit.name] = (this.surfaces[hit.name] ?? 0) + 1;
      const gap = Math.abs(y - hit.y);
      if (gap > this.gap.value) this.gap = { value: gap, at: s.at, wheel, surface: hit.name };
      return hit;
    });
    const p = this.previous;
    if (p) {
      const body = Math.abs(s.y - p.y); if (body > this.bodyStep.value) this.bodyStep = { value: body, at: s.at };
      const pitch = Math.abs(s.pitch - p.pitch) * 180 / Math.PI; if (pitch > this.pitchStep.deg) this.pitchStep = { deg: pitch, at: s.at };
      surface.forEach((hit, k) => {
        const before = p.surface[k]; if (!hit || !before) return;
        const step = Math.abs(hit.y - before.y);
        if (step > this.surfaceStep.value) this.surfaceStep = { value: step, at: s.at, wheel: this.model.wheels[k]!.name, surfaces: `${before.name} > ${hit.name}` };
      });
    }
    this.previous = { y: s.y, pitch: s.pitch, surface };
  }
  report(limits: ContactLimits) {
    const r = (v: number, d = 4) => +v.toFixed(d);
    const ok = this.missing === 0 && this.bodyStep.value <= limits.step && this.surfaceStep.value <= limits.step && this.pitchStep.deg <= limits.pitchDeg && this.gap.value <= limits.gap;
    return {
      ok, samples: this.samples, missing: this.missing, firstMissing: this.firstMissing, range: [r(this.range[0], 2), r(this.range[1], 2)],
      bodyStep: { m: r(this.bodyStep.value), at: r(this.bodyStep.at, 2) },
      surfaceStep: { m: r(this.surfaceStep.value), at: r(this.surfaceStep.at, 2), wheel: this.surfaceStep.wheel, surfaces: this.surfaceStep.surfaces },
      pitchStep: { deg: r(this.pitchStep.deg), at: r(this.pitchStep.at, 2) },
      gap: { m: r(this.gap.value), at: r(this.gap.at, 2), wheel: this.gap.wheel, surface: this.gap.surface },
      surfaces: this.surfaces,
    };
  }
}

export interface ContactScanOptions {
  /** Start lane (northbound) of the car. */
  lane?: string;
  /** Half width (m of station) of the resampled window about each joint and its sample spacing (m). */
  window?: number; dense?: number;
  /** Sample spacing (m) along the traffic lanes. */
  laneStep?: number;
  limits?: ContactLimits;
}

/**
 * The joints as route stations: at both deck ends the deck's road end and the anchorage's inner face (the
 * side span's expansion joint lies 1 m outboard of it, inside the window), and the towers' expansion joints.
 */
export function deckJoints(): number[] {
  const roadEnd = LAYOUT.bridge.roadEndZ, tower = LAYOUT.bridge.towerZ;
  const inner = LAYOUT.bridge.anchorages.map(a => Math.abs(a.z0) < Math.abs(a.z1) ? a.z0 : a.z1);
  return [-roadEnd, ...inner, -tower, tower, roadEnd].sort((a, b) => a - b);
}

/**
 * Drives the car over its route both ways and samples every traffic lane end to end (see the header).
 * `car` is the driven model (its wheels and wheelbase), `traffic` the traffic vehicle whose wheels are
 * sampled along the lanes.
 */
export function scanRouteContact(bridge: Bridge, car: VehicleModel, traffic: VehicleModel, body: CarBody, o: ContactScanOptions = {}) {
  const route = bridge.route, roads = roadSurfaces(bridge), limits = o.limits ?? CONTACT_LIMITS;
  const window = o.window ?? 5, dense = o.dense ?? .01, laneStep = o.laneStep ?? .25, joints = deckJoints();
  const nearJoint = (a: number, b: number) => joints.some(j => Math.max(a, b) >= j - window && Math.min(a, b) <= j + window);
  const pose = newCarPose();
  const carSample = (c: Pick<CarState, 'x' | 'z' | 'dir' | 'offset' | 'bump'>): Sample => {
    carPose(route, c, car.wheelbase, pose);
    return { at: c.z, y: pose.y, pitch: pose.pitch, wheels: wheelContacts(car, pose.x, pose.y, pose.z, pose.yaw - Math.PI / 2, pose.pitch) };
  };
  // The car: throttle held from the south end stop to the north one, the turn-around, and back.
  const steps = new Tally(roads, car), joined = new Tally(roads, car), throttle: CarInput = { throttle: 1, reverse: 0, steer: 0, brake: 0, handbrake: false };
  const start = LANES.find(l => l.id === (o.lane ?? 'nb-middle') && l.direction === 'north');
  if (!start) throw new Error(`No northbound lane ${o.lane}`);
  const c = createCar(1, start.x, endStop(-1), 0), legs: { dir: number; from: number; to: number; steps: number }[] = [];
  for (let leg = 0; leg < 2; leg++) {
    const from = c.z; let n = 0, inWindow = false;
    steps.add(carSample(c));
    while (!c.turnRequested && n < 120 * 600) {
      const before = { x: c.x, z: c.z, dir: c.dir, offset: c.offset, bump: c.bump };
      stepCar(c, throttle, body, []); n++;
      if (nearJoint(before.z, c.z)) {
        // A new pass through a joint window starts a new dense sequence at the step's start.
        if (!inWindow) { joined.break(); joined.add(carSample(before)); inWindow = true; }
        const parts = Math.max(1, Math.ceil(Math.abs(c.z - before.z) / dense));
        for (let k = 1; k <= parts; k++) {
          const t = k / parts;
          joined.add(carSample({ x: before.x + (c.x - before.x) * t, z: before.z + (c.z - before.z) * t, dir: c.dir, offset: before.offset + (c.offset - before.offset) * t, bump: before.bump + (c.bump - before.bump) * t }));
        }
      } else inWindow = false;
      steps.add(carSample(c));
    }
    legs.push({ dir: c.dir, from: +from.toFixed(2), to: +c.z.toFixed(2), steps: n });
    if (!c.turnRequested) break;
    turnAround(c, body, []); steps.break(); joined.break();
  }
  // Traffic: each lane from its entry to its exit (less half a wheelbase at each end) with the traffic's pose and the given vehicle's wheels.
  const lanes = new Tally(roads, traffic), lanesJoined = new Tally(roads, traffic), point = newRoutePoint();
  const margin = traffic.wheelbase / 2, sampled: [number, number] = [margin, TRAFFIC_FLOW.laneLength - margin];
  const laneSample = (lane: number, s: number): Sample => {
    const { p, yaw, pitch } = lanePose(route, lane, s, point);
    return { at: laneStation(lane, s), y: p.y, pitch, wheels: wheelContacts(traffic, p.x, p.y, p.z, yaw, pitch) };
  };
  for (let lane = 0; lane < LANES.length; lane++) {
    lanes.break(); lanesJoined.break();
    let inWindow = false;
    const [first, last] = sampled;
    for (let s = first; s <= last + 1e-9; s += laneStep) {
      const s0 = Math.min(s, last), s1 = Math.min(s0 + laneStep, last);
      lanes.add(laneSample(lane, s0));
      if (s1 > s0 && nearJoint(laneStation(lane, s0), laneStation(lane, s1))) {
        if (!inWindow) { lanesJoined.break(); lanesJoined.add(laneSample(lane, s0)); inWindow = true; }
        for (let k = 1, parts = Math.ceil((s1 - s0) / dense); k <= parts; k++) lanesJoined.add(laneSample(lane, s0 + (s1 - s0) * k / parts));
      } else inWindow = false;
    }
  }
  return {
    limits, joints, window, dense, laneStep, surfaceTriangles: roads.triangles,
    car: { model: car.name, wheelbase: car.wheelbase, legs, steps: steps.report(limits), joints: joined.report(limits) },
    traffic: { model: traffic.name, wheelbase: traffic.wheelbase, lanes: LANES.length, laneLength: TRAFFIC_FLOW.laneLength, sampled, steps: lanes.report(limits), joints: lanesJoined.report(limits) },
  };
}
