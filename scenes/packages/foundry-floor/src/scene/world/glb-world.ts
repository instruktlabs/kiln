// SPDX-License-Identifier: MIT
// The fab drawn from the accepted GLBs (D-21). data/assets.json arrives as pack data `asset-map`; each entity with a
// pinned GLB is baked once (bake.ts: anchors, forms, merged groups) and drawn as an EntitySet. Static entities are
// placed from the layout (placements.ts); moving parts are posed each frame from the twin's state only:
//   tools        productive loops while the tool (or its litho cell) is PRODUCTIVE, service lids and doors and the
//                prober head open while it is down and close from the clip log, the CMP carousel at lot start, the
//                furnace boat loaded while PRODUCTIVE and unloaded from the clip log; drawn detailed while a down clip
//                is off its rest pose (the review's clearance rule)
//   load ports   Dock, DoorOpen, DoorClose and Undock from the port state; the FOUP rides the stage
//   FOUPs        foup-poses.ts: tinted by lot class, door removed and wafers shown while the port is open
//   vehicles     the analytic plan (vehiclePose); hoist and belts by the HoistDown table inverted at the twin's hoist
//                extension, fingers by the handoff phase; synthetic traffic in slate; pulses while moving from 60x
//   stockers     crane mast and carriage translated to the twin's crane position; the tower green while it moves
//   towers       the E10 state as the variant (a litho cell's track and scanner show the cell state)
//   pump kits    FanSpin looped
//   people       each people class of sim-config movers on the service-visit kinds it names (people.ts): FF3's
//                humanoid work robot on the repair and PM visits, the technician on the qualifications; the fab door
//                opens as they pass
// One-shots use oneShotTime and loops loopPhase (sim-spec 7); nothing here feeds the twin.
import { BoxGeometry, Color, DirectionalLight, Frustum, Group, HemisphereLight, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Camera } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { drawAsPulse, loopPhase, oneShotTime } from '../../sim/clock';
import type { PresentationClock } from '../../sim/clock';
import type { FabData, HandoffTiming } from '../../sim/data';
import type { E10State, FabSim } from '../../sim/fab';
import { lodRule } from '../assets/asset-map';
import type { AssetClip, AssetMap } from '../assets/asset-map';
import { foupPoseContext, foupPoses } from '../foup-poses';
import type { FoupPose } from '../foup-poses';
import { bakeModel } from '../glb/bake';
import type { BakedModel, PoseInput } from '../glb/bake';
import { EntitySet } from '../glb/entity-set';
import { floorRig } from './floor-rig';
import type { EntityStats } from '../glb/entity-set';
import { createGlbMaterials } from '../glb/materials';
import { entityBake } from '../glb/options';
import type { EntityBake } from '../glb/options';
import { ServiceWalkers } from '../people';
import type { PersonPose } from '../people';
import { staticPlacements } from './placements';
import type { Placed, Placements } from './placements';
import { buildProxyMesh, proxyBoxes } from './proxies';

export interface WorldStats {
  instances: number; drawn: number; draws: number; triangles: number; lod1: number;
  sets: Record<string, EntityStats>; pulses: number; people: number; proxies: number;
}
export interface GlbWorld {
  root: Group;
  /** Poses every moving part at the clock's sim time. */
  update(sim: FabSim, clock: PresentationClock): void;
  /** Culls, picks LOD sides and fills the instance buffers for this camera. */
  draw(camera: Camera): void;
  stats(): WorldStats;
  /** The last drawn FOUP poses (for follow-a-wafer). */
  foups(): readonly FoupPose[];
  /** Writes the drawn base position of lot `lot`'s FOUP into out ([x, y, z]); false when it is not drawn (in a stocker slot or a furnace). */
  foupOf(lot: number, out: number[]): boolean;
  /** The last drawn people of each people class (its sim-config id and entity), in draw order: tests and captures. */
  people(): readonly { id: string; entity: string; poses: readonly PersonPose[] }[];
  dispose(): void;
}
/** `data`: the twin's data (the pack's, config.ts fabDataFromPack; tests pass FAB_DATA). */
export interface GlbWorldOptions { phone: boolean; data: FabData }

type Clip = { name: string; s: number; ms: number };
const DOWN: ReadonlySet<E10State> = new Set(['SCHEDULED_DOWN', 'UNSCHEDULED_DOWN']);

/** A reusable clip list; `same` tells whether the last `commit` changed anything. */
class Poser {
  readonly clips: [string, number][] = [];
  private n = 0;
  private prev: [string, number][] = [];
  private prevN = -1;
  readonly input: PoseInput = { clips: this.clips };
  reset(): this { this.n = 0; return this; }
  add(name: string, t: number): void { const c = this.clips[this.n] ?? (this.clips[this.n] = ['', 0]); c[0] = name; c[1] = t; this.n++; }
  get size(): number { return this.n; }
  /** Truncates to the added clips; returns false when they equal the previous commit. */
  commit(): boolean {
    this.clips.length = this.n;
    let same = this.n === this.prevN;
    for (let i = 0; same && i < this.n; i++) { const a = this.clips[i] as [string, number], b = this.prev[i] as [string, number]; same = a[0] === b[0] && a[1] === b[1]; }
    if (same) return false;
    this.prevN = this.n;
    for (let i = 0; i < this.n; i++) { const a = this.clips[i] as [string, number]; const b = this.prev[i] ?? (this.prev[i] = ['', 0]); b[0] = a[0]; b[1] = a[1]; }
    return true;
  }
}

function linear(hex: string): [number, number, number] { const c = new Color(hex); return [c.r, c.g, c.b]; }

/** The vehicle's HoistDown clip is eased and the twin's hoist is linear in time: this samples the clip's `hoist`
 *  extension at 201 times and inverts it, giving the clip time at which the hoist has extended `h` metres, so the hoist
 *  and belts (sampled at the same time) sit exactly at the twin's extension. Sim-spec 12 test 4 checks every seat
 *  through this function. */
export function hoistClipTime(model: BakedModel, clip: string, seconds: number): (h: number) => number {
  const rest = model.trackValue(clip, 'hoist', 'position', 0)[1] as number, T: number[] = [];
  for (let k = 0; k <= 200; k++) T.push(rest - (model.trackValue(clip, 'hoist', 'position', (seconds * k) / 200)[1] as number));
  const n = T.length - 1;
  return (h: number): number => {
    if (h <= (T[0] as number)) return 0;
    if (h >= (T[n] as number)) return seconds;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if ((T[mid] as number) < h) lo = mid; else hi = mid; }
    const a = T[lo] as number, b = T[hi] as number, f = b > a ? (h - a) / (b - a) : 0;
    return ((lo + f) / n) * seconds;
  };
}

export function buildGlbWorld(models: ReadonlyMap<string, GLTF>, map: AssetMap, sim: FabSim, options: GlbWorldOptions): GlbWorld {
  const data = options.data, { layout, config } = data, rules = config.scales;
  const root = new Group();
  root.name = 'foundry-floor-world';
  const materials = createGlbMaterials();
  const placements: Placements = staticPlacements(data);
  const sets = new Map<string, EntitySet>(), bakes = new Map<string, EntityBake>(), baked: BakedModel[] = [];
  const extras: Record<string, { anchors?: string[]; driven?: string[] }> = {
    gallerySegment: { anchors: ['ceilingPanel', 'ceilingLight'] },
    stocker: { driven: ['craneMast', 'craneCarriage'] },
  };
  // People classes (sim-config movers of kind people) that draw service visits; each entity's capacity is its
  // asset-map instance count. A class with no visits (FF2's humanoid) or no entity with a people row draws nothing.
  const peopleClasses = config.movers.classes.filter(c => c.kind === 'people' && (c.visits?.length ?? 0) > 0 && map.entities[c.entity]?.people);
  const dynamicCapacity: Record<string, number> = {
    foup: config.modes.megafab.foupInstances, vehicle: config.modes.megafab.maxVehicles,
    ...Object.fromEntries(peopleClasses.map(c => { const n = map.entities[c.entity]!.instances; return [c.entity, options.phone ? n.phone : n.pilot]; })),
  };

  for (const [id, e] of Object.entries(map.entities)) {
    if (!e.glb || !e.pins) continue;
    // Only what draws needs its model: the pack's `models` are the entities with instances (stage.ts).
    const capacity = dynamicCapacity[id] ?? (placements[id]?.length ?? 0);
    if (capacity === 0) continue;
    const gltf = models.get(id);
    if (!gltf) throw new Error(`The scene pack has no model ${id} (data/assets.json names ${e.glb})`);
    const bake = entityBake(map, id, { ...extras[id], floorMoves: config.floorTransport?.enabled && (id === 'toolFrontRobotArm' || id === 'amrFloorRobot') });
    const model = bakeModel(id, gltf, bake.options);
    baked.push(model);
    let hidden = 0;
    for (const name of e.hideByDefault ?? []) hidden |= 1 << model.anchorIndex(name);
    const set = new EntitySet(id, model, materials, capacity, root, lodRule(map, e), hidden);
    sets.set(id, set);
    bakes.set(id, bake);
  }

  // ---- static placements
  const indexOf = new Map<string, number>();
  for (const [id, list] of Object.entries(placements)) {
    const set = sets.get(id), bake = bakes.get(id);
    if (!set || !bake) continue;
    const e = map.entities[id]!, k = e.scale?.value ?? 1;
    list.forEach((p: Placed, i) => {
      const form = p.variant !== undefined ? bake.variantForm[p.variant] : 0;
      if (form === undefined) throw new Error(`${id}: ${p.id} names variant ${p.variant}, which the asset map does not define`);
      set.place(i, p.x, p.y, p.z, p.yaw, form, (p.scale?.[0] ?? 1) * k, (p.scale?.[1] ?? 1) * k, (p.scale?.[2] ?? 1) * k);
      indexOf.set(`${id}|${p.id}`, i);
    });
  }
  // The floor and ceiling modules along the cut always draw detailed, so their pedestals and FFU housings show in it.
  const cutX = layout.sectionCut.x - layout.floorModules.moduleSize;
  for (const id of ['floorModule', 'ceilingModule']) {
    const set = sets.get(id);
    (placements[id] ?? []).forEach((p, i) => { if (p.x > cutX && set) set.setForce(i, true); });
  }

  // ---- proxies, pulses, lights
  const proxies = buildProxyMesh(proxyBoxes(map, placements, data), materials.proxy, root);
  const pulseGeometry = new BoxGeometry(1, 1, 1);
  const pulses = new InstancedMesh(pulseGeometry, materials.pulse, config.modes.megafab.maxVehicles);
  pulses.name = 'foundry-floor-pulses';
  pulses.frustumCulled = false;
  pulses.count = 0;
  root.add(pulses);
  const hemi = new HemisphereLight('#ffffff', '#b8bfc4', 1.3), sun = new DirectionalLight('#ffffff', 1.2);
  sun.position.set(-20, 40, 30);
  root.add(hemi, sun);

  // ---- clip log: the latest event per entity and clip at or before now
  const lastEvent = new Map<string, number>();
  const eventAt = (entity: string, clip: string): number | undefined => lastEvent.get(`${entity}|${clip}`);
  let now = 0, scale = 1;
  const clipOf = (model: BakedModel, name: string): Clip => { const s = model.clipSeconds(name); return { name, s, ms: s * 1000 }; };
  const oneShot = (start: number, c: Clip, twinMs = c.ms) => (oneShotTime(now, start, twinMs, scale, rules) / twinMs) * c.s;

  // ---- tools
  type ToolDriver = {
    set: EntitySet; i: number; id: string; ri: number; down: boolean; poser: Poser;
    loops: Clip[]; open: Clip[]; close: Clip[]; lotStart: Clip[]; batchStart: Clip[]; batchEnd: Clip[];
  };
  const tools: ToolDriver[] = layout.tools.flatMap(tool => {
    const set = sets.get(tool.entity), bake = bakes.get(tool.entity);
    const i = indexOf.get(`${tool.entity}|${tool.id}`);
    if (!set || !bake || i === undefined) return [];
    const ri = sim.resIndex.get(tool.cell ?? tool.id);
    if (ri === undefined) throw new Error(`The twin has no resource for ${tool.id}`);
    const by = (play: AssetClip['play']) => Object.values(bake.played).filter(c => c.play === play).map(c => clipOf(set.model, c.name));
    return [{
      set, i, id: tool.id, ri, down: sim.resourceInfo(ri).downEntity === tool.id, poser: new Poser(),
      loops: by('productive-loop'), open: by('down-open'), close: by('down-close'), lotStart: by('lot-start'), batchStart: by('batch-start'), batchEnd: by('batch-end'),
    }];
  });
  const recent = (entity: string, c: Clip): number | undefined => { const te = eventAt(entity, c.name); return te !== undefined && now - te < c.ms ? te : undefined; };
  function driveTools(clock: PresentationClock): void {
    for (const d of tools) {
      const st = sim.toolState(d.ri), since = sim.toolSince(d.ri), p = d.poser.reset();
      let force = false;
      if (st === 'PRODUCTIVE') for (const c of d.loops) p.add(c.name, loopPhase(clock, since, c.ms, rules) * c.s);
      if (d.down) {
        if (DOWN.has(st)) { for (const c of d.open) p.add(c.name, oneShot(since, c)); force = d.open.length > 0; }
        else for (const c of d.close) { const te = recent(d.id, c); if (te !== undefined) { p.add(c.name, oneShot(te, c)); force = true; } }
      }
      for (const c of d.lotStart) { const te = recent(d.id, c); if (te !== undefined) p.add(c.name, oneShot(te, c)); }
      if (st === 'PRODUCTIVE') for (const c of d.batchStart) p.add(c.name, oneShot(since, c));
      else for (const c of d.batchEnd) { const te = recent(d.id, c); if (te !== undefined) p.add(c.name, oneShot(te, c)); }
      if (p.commit()) d.set.setPose(d.i, p.size ? p.input : null);
      d.set.setForce(d.i, force);
    }
  }

  // ---- load ports (and the stage offset the FOUP rides)
  const portSet = sets.get('loadPort');
  const portModel = portSet?.model;
  const portClips = portModel ? { dock: clipOf(portModel, 'Dock'), undock: clipOf(portModel, 'Undock'), open: clipOf(portModel, 'DoorOpen'), close: clipOf(portModel, 'DoorClose') } : null;
  const P_ = config.ports;
  type PortDriver = { i: number; pi: number; fx: number; fz: number; poser: Poser };
  const ports: PortDriver[] = [];
  const stageDx = new Float64Array(sim.places.length);
  const portFacing = new Float64Array(sim.places.length * 2);
  for (const tool of layout.tools) for (const port of tool.ports) {
    const i = indexOf.get(`loadPort|${port.id}`), pi = sim.placeIndex.get(port.id);
    if (i === undefined || pi === undefined) continue;
    const f = port.facing ?? [1, 0, 0];
    ports.push({ i, pi, fx: f[0], fz: f[2], poser: new Poser() });
    portFacing[pi * 2] = f[0]; portFacing[pi * 2 + 1] = f[2];
  }
  function drivePorts(): void {
    if (!portSet || !portModel || !portClips) return;
    const { dock, undock, open, close } = portClips;
    for (const d of ports) {
      const P = sim.placeState(d.pi), p = d.poser.reset();
      let dx = 0;
      switch (P.st) {
        case 'DOCKING': { const t = oneShot(P.t0, dock, P_.dockMs); p.add(dock.name, t); dx = portModel.trackValue(dock.name, 'stage', 'position', t)[0] as number; break; }
        case 'OPENING': p.add(dock.name, dock.s); p.add(open.name, oneShot(P.t0, open, P_.openMs)); dx = portModel.trackValue(dock.name, 'stage', 'position', dock.s)[0] as number; break;
        case 'OPEN': p.add(dock.name, dock.s); p.add(open.name, open.s); dx = portModel.trackValue(dock.name, 'stage', 'position', dock.s)[0] as number; break;
        case 'CLOSING': p.add(dock.name, dock.s); p.add(close.name, oneShot(P.t0, close, P_.closeMs)); dx = portModel.trackValue(dock.name, 'stage', 'position', dock.s)[0] as number; break;
        case 'UNDOCKING': { const t = oneShot(P.t0, undock, P_.undockMs); p.add(undock.name, t); dx = portModel.trackValue(undock.name, 'stage', 'position', t)[0] as number; break; }
        default: break;
      }
      stageDx[d.pi] = dx;
      if (p.commit()) portSet.setPose(d.i, p.size ? p.input : null);
    }
  }

  // ---- FOUPs
  const foupSet = sets.get('foup');
  const foupModel = foupSet?.model;
  const foupClips = foupModel ? { remove: clipOf(foupModel, 'DoorRemove'), replace: clipOf(foupModel, 'DoorReplace') } : null;
  const foupHidden = foupSet ? (map.entities.foup?.hideByDefault ?? []).reduce((m, n) => m | foupSet.bit(n), 0) : 0;
  const tintColours = map.entities.foup?.tint?.colours ?? {};
  const foupTint = ['normal', 'hot', 'engineering', 'synthetic'].map(k => { const hex = tintColours[k]; return hex ? [...linear(hex), 1] : [0, 0, 0, 0]; });
  const poseCtx = foupPoseContext(sim, data), foupOut: FoupPose[] = [], scratch = new Float64Array(8);
  const floor = config.floorTransport?.enabled ? floorRig(models, map, data) : null;
  let floorSample: ReturnType<NonNullable<typeof floor>['sample']> | null = null;
  poseCtx.floorPose = () => floorSample?.foup ?? null;
  function driveFloor(): void {
    const armSet = sets.get('toolFrontRobotArm'), amrSet = sets.get('amrFloorRobot');
    if (!floor || !armSet || !amrSet) return;
    for (const [id, set] of [['toolFrontRobotArm', armSet], ['amrFloorRobot', amrSet]] as const) {
      (placements[id] ?? []).forEach((p, i) => { set.move(i, p.x, p.y, p.z, p.yaw); set.setPose(i, null); set.setForce(i, false); });
    }
    const active = sim.S.floor.active;
    floorSample = active ? floor.sample(active, now) : null;
    if (!active || !floorSample) return;
    const station = layout.floorRobots.stations[active.station]!;
    const ci = indexOf.get(`amrFloorRobot|${station.amr.id}`);
    if (ci === undefined) throw new Error(`Missing floor carrier ${station.amr.id}`);
    const c = floorSample.carrier;
    amrSet.move(ci, ...c.position, c.yaw); amrSet.setPose(ci, c.input); amrSet.setForce(ci, true);
    const a = floorSample.arm;
    if (a) {
      const ai = indexOf.get(`toolFrontRobotArm|${a.stocker ? `floor-stocker-arm-${a.index}` : station.arm.id}`);
      if (ai === undefined) throw new Error('Missing floor transfer arm');
      armSet.setPose(ai, a.input); armSet.setForce(ai, true);
    }
  }
  let foupCount = 0;
  const foupPosers: Poser[] = [];
  function driveFoups(): void {
    foupCount = foupPoses(poseCtx, now, foupOut, scratch);
    if (!foupSet || !foupClips) return;
    const n = Math.min(foupCount, foupSet.capacity);
    for (let i = 0; i < n; i++) {
      const f = foupOut[i] as FoupPose, p = (foupPosers[i] ??= new Poser()).reset();
      let x = f.x, z = f.z, open = false;
      if (f.place >= 0 && sim.placeInfo(f.place).kind === 'load') {
        const dx = stageDx[f.place] as number;
        x += dx * (portFacing[f.place * 2] as number); z += dx * (portFacing[f.place * 2 + 1] as number);
        const P = sim.placeState(f.place);
        if (P.st === 'OPENING') { p.add(foupClips.remove.name, oneShot(P.t0, foupClips.remove, P_.openMs)); open = true; }
        else if (P.st === 'OPEN') { p.add(foupClips.remove.name, foupClips.remove.s); open = true; }
        else if (P.st === 'CLOSING') { p.add(foupClips.replace.name, oneShot(P.t0, foupClips.replace, P_.closeMs)); open = true; }
      }
      foupSet.move(i, x, f.y, z, f.yaw);
      if (p.commit()) foupSet.setPose(i, p.size ? p.input : null);
      foupSet.setHidden(i, open ? 0 : foupHidden);
      const tint = foupTint[f.cls] as number[];
      foupSet.setTint(i, tint[0] as number, tint[1] as number, tint[2] as number, tint[3] as number);
    }
    foupSet.setCount(n);
  }

  // ---- vehicles
  const vehSet = sets.get('vehicle');
  const vehModel = vehSet?.model;
  const vehClips = vehModel ? { hoist: clipOf(vehModel, 'HoistDown'), close: clipOf(vehModel, 'GripClose'), open: clipOf(vehModel, 'GripOpen') } : null;
  const hoistClipS = vehModel && vehClips ? hoistClipTime(vehModel, vehClips.hoist.name, vehClips.hoist.s) : () => 0;
  const synthTint = map.entities.vehicle?.tint?.colours.synthetic;
  const vehTint = synthTint ? [...linear(synthTint), 1] : [0, 0, 0, 0];
  const vehPosers: Poser[] = [];
  const pulseColour = { pilot: new Color(map.palette.amhs), synthetic: new Color(synthTint ?? '#71849A') };
  const pm = new Matrix4(), pq = new Quaternion(), pp = new Vector3(), ps = new Vector3(2.6, 0.45, 0.5), yAxis = new Vector3(0, 1, 0);
  let pulseCount = 0;
  function driveVehicles(): void {
    if (!vehSet || !vehClips) return;
    let k = 0, np = 0;
    const V = sim.S.vehicles;
    for (let vi = 0; vi < V.length; vi++) {
      const v = V[vi]!;
      if (!v.alive || !sim.vehiclePose(vi, now, scratch)) continue;
      const x = scratch[0] as number, y = scratch[1] as number, z = scratch[2] as number, yaw = Math.atan2(-(scratch[4] as number), scratch[3] as number);
      const speed = scratch[5] as number, hoist = scratch[6] as number;
      if (drawAsPulse(scale, speed > 0.05, rules)) {
        if (np < pulses.instanceMatrix.count) {
          pp.set(x, y - 0.3, z);
          pulses.setMatrixAt(np, pm.compose(pp, pq.setFromAxisAngle(yAxis, yaw), ps));
          pulses.setColorAt(np, v.syn ? pulseColour.synthetic : pulseColour.pilot);
          np++;
        }
        continue;
      }
      if (k >= vehSet.capacity) continue;
      const p = (vehPosers[k] ??= new Poser()).reset();
      if (hoist > 1e-6) p.add(vehClips.hoist.name, hoistClipS(hoist));
      // Fingers: closed at rest. Open while empty; during a handoff they close on the pick and open on the drop.
      if (v.ho) {
        const tm: HandoffTiming = sim.placeInfo(v.ho.place).kind === 'uts' ? config.vehicle.utsHandoff : config.vehicle.handoff;
        const grip0 = v.ho.t0 + tm.e84Ms + tm.hoistDownMs, pick = v.ho.kind === 'pick';
        const g = pick ? vehClips.close : vehClips.open;
        if (now < grip0) { if (pick) p.add(vehClips.close.name, 0); }
        else p.add(g.name, oneShot(grip0, g, tm.gripMs));
      } else if (!v.syn && v.lot < 0) p.add(vehClips.close.name, 0);
      vehSet.move(k, x, y, z, yaw);
      if (p.commit()) vehSet.setPose(k, p.size ? p.input : null);
      vehSet.setForce(k, hoist > 1e-6);
      if (v.syn) vehSet.setTint(k, vehTint[0] as number, vehTint[1] as number, vehTint[2] as number, vehTint[3] as number);
      else vehSet.setTint(k, 0, 0, 0, 0);
      k++;
    }
    vehSet.setCount(k);
    pulses.count = np;
    if (np > 0) { pulses.instanceMatrix.needsUpdate = true; if (pulses.instanceColor) pulses.instanceColor.needsUpdate = true; }
    pulseCount = np;
  }

  // ---- stockers and towers
  const stockerSet = sets.get('stocker');
  const stockers = layout.stockers.map((st, si) => {
    if (sim.stockerInfo[si]?.id !== st.id) throw new Error(`Stocker ${si} is ${sim.stockerInfo[si]?.id} in the twin and ${st.id} in the layout`);
    return { i: indexOf.get(`stocker|${st.id}`) ?? -1, tower: indexOf.get(`signalTower|${st.id}.tower`) ?? -1, input: { translate: [['craneMast', 0, 0, 0], ['craneCarriage', 0, 0, 0]] as [string, number, number, number][] }, z: NaN, y: NaN };
  });
  const towerSet = sets.get('signalTower'), towerBake = bakes.get('signalTower');
  const toolTowers = layout.tools.map(tool => ({ i: indexOf.get(`signalTower|${tool.id}.tower`) ?? -1, ri: sim.resIndex.get(tool.cell ?? tool.id) ?? -1 }));
  const towerForm = (state: E10State): number => towerBake?.variantForm[state] ?? 0;
  function driveStockers(): void {
    stockers.forEach((s, si) => {
      const [z, y] = sim.cranePose(si, now);
      if (stockerSet && s.i >= 0 && (z !== s.z || y !== s.y)) {
        s.z = z; s.y = y;
        const mast = s.input.translate[0]!, carriage = s.input.translate[1]!;
        mast[3] = z; carriage[2] = y;
        stockerSet.setPose(s.i, s.input);
      }
      if (towerSet && s.tower >= 0) towerSet.setForm(s.tower, towerForm(sim.S.stockers[si]!.crane.st !== 'IDLE' ? 'PRODUCTIVE' : 'STANDBY'));
    });
    if (towerSet) for (const t of toolTowers) if (t.i >= 0 && t.ri >= 0) towerSet.setForm(t.i, towerForm(sim.toolState(t.ri)));
  }

  // ---- subfab pump kits
  const kitSet = sets.get('subfabKit');
  const fan = kitSet && bakes.get('subfabKit')?.played.FanSpin ? clipOf(kitSet.model, 'FanSpin') : null;
  const kitInput: PoseInput = { clips: [['FanSpin', 0]] };
  function driveKits(clock: PresentationClock): void {
    if (!kitSet || !fan) return;
    (kitInput.clips as [string, number][])[0]![1] = loopPhase(clock, 0, fan.ms, rules) * fan.s;
    for (let i = 0; i < kitSet.n; i++) kitSet.setPose(i, kitInput);
  }

  // ---- people and the fab door: one ServiceWalkers per people class, each drawing the visit kinds its class names
  const walkerGroups = peopleClasses.flatMap(c => {
    const set = sets.get(c.entity), people = map.entities[c.entity]?.people;
    if (!set || !people) return [];
    const walkers = new ServiceWalkers(c.id, layout.people, {
      speedMps: people.walkSpeedMps, designSpeedMps: people.walkDesignSpeedMps, walkS: set.model.clipSeconds(people.activities.walk),
      idleS: set.model.clipSeconds(people.activities.idle), serviceS: set.model.clipSeconds(people.activities.service),
    }, set.capacity, new Set(c.visits));
    return [{ id: c.id, entity: c.entity, set, activities: people.activities, walkers, out: [] as PersonPose[], n: 0, posers: [] as Poser[] }];
  });
  const wallSet = sets.get('wallKit'), doorIndex = indexOf.get(`wallKit|${layout.people.door.panel}`) ?? -1;
  const doorClip = wallSet && bakes.get('wallKit')?.played.DoorOpen ? clipOf(wallSet.model, 'DoorOpen') : null;
  const doorPoser = new Poser();
  const endedAt = (tool: string) => { const ri = sim.resIndex.get(tool); return ri === undefined ? now : sim.toolSince(ri); };
  let personCount = 0;
  function drivePeople(clock: PresentationClock): void {
    if (walkerGroups.length === 0) return;
    const visits = sim.serviceVisits();
    const loop = (start: number, s: number) => loopPhase(clock, start, s * 1000, rules) * s;
    const [dx, , dz] = layout.people.door.position;
    let nearest = Infinity;
    personCount = 0;
    for (const g of walkerGroups) {
      g.walkers.update(now, visits, endedAt);
      const n = g.walkers.poses(now, g.out, loop), A = g.activities;
      for (let i = 0; i < n; i++) {
        const pose = g.out[i] as PersonPose, p = (g.posers[i] ??= new Poser()).reset();
        p.add(pose.activity === 'walk' ? A.walk : pose.activity === 'idle' ? A.idle : A.service, pose.clipS);
        g.set.move(i, pose.x, 0, pose.z, pose.yaw);
        if (p.commit()) g.set.setPose(i, p.input);
        nearest = Math.min(nearest, Math.hypot(pose.x - dx, pose.z - dz));
      }
      g.set.setCount(n);
      g.n = n;
      personCount += n;
    }
    if (wallSet && doorClip && doorIndex >= 0) {
      const f = Math.min(1, Math.max(0, (3 - nearest) / 2.4));
      doorPoser.reset();
      if (f > 0) doorPoser.add(doorClip.name, f * doorClip.s);
      if (doorPoser.commit()) wallSet.setPose(doorIndex, doorPoser.size ? doorPoser.input : null);
    }
  }

  // ---- visibility rules and drawing
  const gallerySet = sets.get('gallerySegment'), ceilingSet = sets.get('ceilingModule');
  const galleryCeiling = gallerySet ? gallerySet.bit('ceilingPanel') | gallerySet.bit('ceilingLight') : 0;
  const frustum = new Frustum(), viewProj = new Matrix4(), eye = new Vector3(), lastView = new Float64Array(32);
  let firstDraw = true;

  function update(fab: FabSim, clock: PresentationClock): void {
    if (fab !== sim) throw new Error('The world was built for another twin');
    now = Math.max(clock.simMs, sim.S.t); scale = clock.scale;
    lastEvent.clear();
    for (const e of sim.clipEvents(now - 10_000)) {
      if (e.t > now) continue;
      const key = `${e.entity}|${e.clip}`, prev = lastEvent.get(key);
      if (prev === undefined || e.t > prev) lastEvent.set(key, e.t);
    }
    driveTools(clock);
    drivePorts();
    driveFloor();
    driveFoups();
    driveVehicles();
    driveStockers();
    driveKits(clock);
    drivePeople(clock);
  }

  function draw(camera: Camera): void {
    camera.updateMatrixWorld();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProj, camera.coordinateSystem, (camera as Camera & { reversedDepth?: boolean }).reversedDepth);
    eye.setFromMatrixPosition(camera.matrixWorld);
    let moved = firstDraw;
    const a = viewProj.elements;
    for (let k = 0; k < 16; k++) if (lastView[k] !== a[k]) { moved = true; lastView[k] = a[k] as number; }
    firstDraw = false;
    if (gallerySet) { const hide = eye.y > layout.gallery.top ? galleryCeiling : 0; for (let i = 0; i < gallerySet.n; i++) gallerySet.setHidden(i, hide); }
    if (ceilingSet) ceilingSet.visible = eye.y <= layout.ceilingModules.ffuFaceY;
    for (const set of sets.values()) set.draw(frustum, eye, moved);
  }

  function stats(): WorldStats {
    const out: WorldStats = { instances: 0, drawn: 0, draws: 0, triangles: 0, lod1: 0, sets: {}, pulses: pulseCount, people: personCount, proxies: proxies.mesh.count };
    for (const [id, set] of sets) {
      const s = set.stats();
      out.sets[id] = s;
      out.instances += s.instances; out.drawn += s.drawn; out.draws += s.draws; out.triangles += s.triangles; out.lod1 += s.lod1;
    }
    out.draws += 1 + (pulseCount > 0 ? 1 : 0);
    out.triangles += proxies.mesh.count * 12 + pulseCount * 12;
    return out;
  }

  return {
    root, update, draw, stats,
    foups: () => foupOut.slice(0, foupCount),
    foupOf(lot, out) {
      for (let i = 0; i < foupCount; i++) {
        const f = foupOut[i] as FoupPose;
        if (f.lot === lot) { out[0] = f.x; out[1] = f.y; out[2] = f.z; return true; }
      }
      return false;
    },
    people: () => walkerGroups.map(g => ({ id: g.id, entity: g.entity, poses: g.out.slice(0, g.n).map(p => ({ ...p })) })),
    dispose() {
      root.removeFromParent();
      for (const set of sets.values()) set.dispose();
      for (const model of baked) model.dispose();
      floor?.dispose();
      proxies.dispose();
      pulses.dispose();
      pulseGeometry.dispose();
      materials.dispose();
    },
  };
}
