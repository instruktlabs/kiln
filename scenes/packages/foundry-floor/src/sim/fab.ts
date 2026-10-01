// SPDX-License-Identifier: MIT
// The Foundry Floor twin (sim-spec 3, 4, 6, 7 and 8): a lot-level discrete-event model of a generic pilot
// line. Plain TypeScript with no three, React or DOM imports; it runs in Node, Bun and the browser alike.
//
// Time is integer ms. Events wait in a (t, seq) heap. Randomness comes from named seeded streams through fixed
// inverse-CDF tables. All state lives in one JSON object (`S`), so a snapshot is JSON.stringify(S) and a
// restore is JSON.parse; the runtime tables (graph, places, resources) are rebuilt from data/.
//
// Vehicles hold analytic constant-acceleration plans. Traffic uses block reservation: every edge is a block,
// every switch one exclusive block; a vehicle reserves ahead to its stopping distance at line speed plus the
// 1.5 m gap plus a chunk, and a block behind it frees once its tail has passed the block's end (evaluated
// lazily from the holder's plan at event times only). Rendering reads state and never mutates it.
import type { FabData, GraphPortData, HandoffTiming, PlaceKind, Reliability, SimConfig, Vec3 } from './data';
import { DAY_MS, HOUR_MS } from './data';
import { edgePoint, runtimeGraph } from './graph';
import type { RuntimeGraph } from './graph';
import { brakeStart, evalPlan, planEnd, planStop, stopDistance, timeAt } from './motion';
import type { Piece, Segment } from './motion';
import { heapPop, heapPush, heapSorted } from './queue';
import type { SimEvent } from './queue';
import { drawExponentialMs, drawLognormalMs, drawUniform, fnv1a } from './rng';
import { serviceVisits, STUB_SERVICE } from './service';
import type { ServiceProvider, ServiceVisit } from './service';
import { emptyFloorState, floorRoute } from './floor-transport';
import type { FloorActive, FloorJob, FloorPhase, FloorState } from './floor-transport';

export type E10State = 'PRODUCTIVE' | 'STANDBY' | 'ENGINEERING' | 'SCHEDULED_DOWN' | 'UNSCHEDULED_DOWN' | 'NON_SCHEDULED';
export const E10_STATES: readonly E10State[] = ['PRODUCTIVE', 'STANDBY', 'ENGINEERING', 'SCHEDULED_DOWN', 'UNSCHEDULED_DOWN', 'NON_SCHEDULED'];
export type LotState = 'WAIT_MOVE' | 'IN_TRANSIT' | 'QUEUED' | 'AT_PORT' | 'PROCESSING' | 'DONE_AT_TOOL' | 'COMPLETE';
export type PlaceState = 'EMPTY' | 'RESERVED' | 'LOADING' | 'DOCKING' | 'OPENING' | 'OPEN' | 'CLOSING' | 'UNDOCKING' | 'READY_TO_UNLOAD' | 'UNLOADING' | 'OCCUPIED' | 'PASS_IN' | 'WAIT_CRANE' | 'PASS_OUT';
export type VehicleJobState = 'IDLE' | 'TO_PICKUP' | 'HANDOFF_PICK' | 'TO_DROP' | 'HANDOFF_DROP';
export type VehicleState = VehicleJobState | 'WAIT_BLOCK';
export type FabMode = 'pilot' | 'megafab';
export type DispatchRule = 'leastWork' | 'fifo' | 'criticalRatio';
export type LotClass = 'normal' | 'hot' | 'engineering';
const LOT_CLASSES: readonly LotClass[] = ['normal', 'hot', 'engineering'];

// ---------------------------------------------------------------- state (plain JSON)

interface LotRec {
  id: number; cls: 0 | 1 | 2; step: number; st: LotState; rel: number;
  /** Where the FOUP is: a place (port or seat), a vehicle, a stocker slot, the crane, a furnace buffer or a manual port. */
  loc: 'place' | 'vehicle' | 'floor' | 'slot' | 'crane' | 'buffer' | 'manual'; li: number; slot: number;
  tool: number; dest: number; qt: number; ship: boolean;
}
interface PlaceRec { st: PlaceState; lot: number; res: number; t0: number; out: boolean }
interface ToolRec {
  st: E10State; t0: number; lot: number; end: number; left: number; ver: number;
  ready: number[]; queue: number[]; assigned: number[]; batch: number[]; done: number[];
  xin: number; xout: number; waitIn: number[];
  pm: boolean; pmNext: number; downUntil: number; failT: number; redraw: boolean;
  stateMs: number[];
}
interface JobRec { id: number; lot: number; from: number; to: number; hot: boolean; t: number }
interface VehRec {
  alive: boolean; syn: boolean; st: VehicleJobState; lot: number; job: JobRec | null;
  route: number[]; rs: number[]; h0: number; h1: number;
  plan: Piece[]; rest: number; ver: number;
  goals: number[]; gs: number[]; gi: number;
  /** Waiting: the block, the edge that needs it, since when, whether that edge is a main line, the wake token and
   *  the earliest valid wake already scheduled (-1 for none). */
  wb: number; we: number; wt: number; wm: number; wtok: number; wk: number;
  ho: { kind: 'pick' | 'drop'; place: number; t0: number } | null;
  bs: number; busy: number;
}
interface CraneJobRec { kind: 'store' | 'retrieve' | 'floor' | 'release' | 'ship'; lot: number; place: number; slot: number; hot: boolean; seq: number }
interface CraneSeg { t0: number; t1: number; z0: number; y0: number; z1: number; y1: number; fork: boolean }
interface StockerRec {
  slots: number[]; jobs: CraneJobRec[]; cur: CraneJobRec | null;
  crane: { st: 'IDLE' | 'MOVING' | 'FORK'; z: number; y: number; segs: CraneSeg[] };
  waitPort: { kind: 'in' | 'out'; lot: number; t: number; hot: boolean }[];
  manual: number[];
}
interface HourRec { t: number; wip: number; moves: number; busyMs: number; shipped: number }
interface StatsRec {
  moves: number; shipped: number; ships: [number, number][]; hourly: HourRec[];
  emergencyStops: number; releasesSkipped: number;
}
export interface SimStateJson {
  version: 1; seed: number; mode: FabMode; rule: DispatchRule; t: number; seq: number;
  queue: SimEvent[]; rng: Record<string, number>;
  lots: LotRec[]; nextLot: number; nextJob: number; craneSeq: number;
  places: PlaceRec[]; tools: ToolRec[]; vehicles: VehRec[]; holder: number[]; reqs: JobRec[];
  stockers: StockerRec[]; stats: StatsRec; hashes: string[];
  floor: FloorState;
}

// ---------------------------------------------------------------- runtime tables

interface PlaceInfo { id: string; kind: PlaceKind; node: number; owner: number; seat: Vec3; inner: Vec3 | null; hoistM: number; heading: Vec3; craneZ: number }
interface ResInfo {
  id: string; group: string; batch: boolean; ports: number[]; procMs: number; rel: Reliability; scheduled: boolean;
  members: string[]; downOpen: string | null; downClose: string | null; downEntity: string;
}
interface StockerInfo { id: string; ports: number[]; manualZ: number; slotZ: number[]; slotY: number[]; usable: boolean[]; portZ: Map<number, number> }

export interface ClipEvent { t: number; entity: string; clip: string }
export interface FabKpis {
  wipLots: number; lotsOutToday: number; cycleTimeDays: number; xFactor: number; movesPerHour: number;
  toolStateShares: Record<string, number>; vehiclesBusy: number; vehiclesTotal: number; toolCounts: Record<string, number>;
}
export interface FabOptions { seed?: number; mode?: FabMode; wspm?: number; warmupDays?: number; nonScheduled?: string[]; mttrScale?: number; data: FabData;
  /** Who makes repair and PM visits (src/sim/service.ts); the default is the stub technician. */
  service?: ServiceProvider }

const INF = 1e300;
const SPINE_IDLE = 2;

function yawSinCos(deg: number): [number, number] {
  const k = (((Math.round(deg / 90) % 4) + 4) % 4);
  if (Math.abs(deg - Math.round(deg / 90) * 90) > 1e-9) throw new Error(`yaw ${deg} is not a multiple of 90`);
  return ([[0, 1], [1, 0], [0, -1], [-1, 0]] as [number, number][])[k] as [number, number];
}

export class FabSim {
  readonly data: FabData;
  readonly cfg: SimConfig;
  readonly g: RuntimeGraph;
  readonly places: PlaceInfo[] = [];
  readonly placeIndex = new Map<string, number>();
  readonly res: ResInfo[] = [];
  readonly resIndex = new Map<string, number>();
  readonly groupRes = new Map<string, number[]>();
  readonly stockerInfo: StockerInfo[] = [];
  readonly routeGroup: string[] = [];
  readonly rawLeft: number[] = [];
  readonly spineLoop: number[] = [];
  readonly half: number;
  readonly gap: number;
  readonly vmax: number;
  readonly releaseMs: number;
  readonly rawMs: number;
  /** Repair and PM visits go through this provider; it never changes the tool's timeline. */
  readonly service: ServiceProvider;
  S: SimStateJson;
  private lotMap = new Map<number, LotRec>();
  private log: ClipEvent[] = [];
  private readonly logCap = 4096;
  /** Events handled by kind since construction or restore (diagnostics only; not part of the state). */
  readonly eventCounts: Record<string, number> = {};

  constructor(opts: FabOptions) {
    this.data = opts.data;
    this.cfg = opts.data.config;
    const cfg = this.cfg;
    this.g = runtimeGraph(opts.data.graph, cfg.dispatch.switchPenaltyS);
    this.half = cfg.vehicle.lengthM / 2;
    this.gap = cfg.vehicle.gapM;
    this.vmax = cfg.vehicle.straightMps.value;
    const lotsPerMonth = (opts.wspm ?? cfg.starts.waferStartsPerMonth.value) / cfg.starts.wafersPerLot;
    this.releaseMs = Math.round((cfg.starts.monthDays * DAY_MS) / lotsPerMonth);
    this.service = opts.service ?? STUB_SERVICE;
    this.buildTables(opts.nonScheduled ?? cfg.tuning.nonScheduled, opts.mttrScale ?? cfg.tuning.mttrScale);
    this.rawMs = this.rawLeft[0] as number;
    this.S = this.freshState(opts.seed ?? cfg.seeds.default, opts.mode ?? 'pilot');
  }

  // ---------------------------------------------------------------- tables

  private buildTables(nonScheduled: readonly string[], mttrScale: number): void {
    const { tools, layout, graph, route } = this.data;
    const g = this.g;
    const portData = new Map<string, GraphPortData>(graph.ports.map(p => [p.id, p]));
    const addPlace = (id: string, owner: number, inner: Vec3 | null, craneZ: number) => {
      const p = portData.get(id);
      const node = g.portNode.get(id);
      if (!p || node === undefined) throw new Error(`no rail port for ${id}`);
      this.placeIndex.set(id, this.places.length);
      this.places.push({ id, kind: p.kind, node, owner, seat: p.seat, inner, hoistM: p.hoistM, heading: p.heading, craneZ });
      return this.places.length - 1;
    };
    // Resources: litho cells (one resource using the track's ports) and every other tool, sorted by id.
    const layoutTool = new Map(layout.tools.map(t => [t.id, t]));
    const specs: { id: string; group: string; ports: string[]; members: string[]; type: string }[] = [];
    for (const cell of tools.cells) {
      const track = tools.tools.find(t => t.id === cell.track);
      if (!track) throw new Error(`cell ${cell.id} has no track`);
      specs.push({ id: cell.id, group: cell.group, ports: track.ports, members: [cell.track, cell.scanner], type: 'cell' });
    }
    for (const t of tools.tools) if (!t.cell) specs.push({ id: t.id, group: t.group, ports: t.ports, members: [t.id], type: t.type });
    specs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const off = new Set(nonScheduled);
    for (const t of tools.tools) if (!t.scheduled) off.add(t.id);
    for (const spec of specs) {
      const group = tools.groups[spec.group];
      if (!group) throw new Error(`unknown group ${spec.group}`);
      const index = this.res.length;
      const ports = spec.ports.map(pid => addPlace(pid, index, null, 0));
      let downOpen: string | null = null, downClose: string | null = null, downEntity = spec.members[0] as string;
      const type = spec.type === 'cell' ? (layoutTool.get(spec.members[1] as string)?.type ?? '') : spec.type;
      if (/etch|cvd|pvd/.test(type)) { downOpen = 'LidOpen'; downClose = 'LidClose'; }
      else if (/scanner|implanter/.test(type)) { downOpen = 'ServiceOpen'; downClose = 'ServiceClose'; if (spec.type === 'cell') downEntity = spec.members[1] as string; }
      else if (/prober/.test(type)) { downOpen = 'HeadOpen'; downClose = 'HeadClose'; }
      const scheduled = !off.has(spec.id) && !spec.members.some(m => off.has(m));
      this.res.push({ id: spec.id, group: spec.group, batch: !!group.batch, ports, procMs: group.processMsPerLot, rel: { ...group.reliability, mttrH: group.reliability.mttrH * mttrScale }, scheduled, members: spec.members, downOpen, downClose, downEntity });
      this.resIndex.set(spec.id, index);
      if (scheduled) {
        const list = this.groupRes.get(spec.group) ?? [];
        list.push(index);
        this.groupRes.set(spec.group, list);
      }
    }
    for (const fam of Object.keys(tools.familyToGroup)) {
      const grp = tools.familyToGroup[fam] as string;
      if (!(this.groupRes.get(grp)?.length)) throw new Error(`group ${grp} has no scheduled tool`);
    }
    // Stockers: OHT ports (pass-throughs), the manual port, and the slot grid in the stocker's local frame.
    const slots = layout.stockerSlots;
    tools.stockers.forEach((st, si) => {
      const lay = layout.stockers.find(x => x.id === st.id);
      if (!lay) throw new Error(`stocker ${st.id} missing from layout`);
      const [sin, cos] = yawSinCos(lay.yaw);
      const localZ = (w: Vec3) => (w[0] - lay.position[0]) * sin + (w[2] - lay.position[2]) * cos;
      const portZ = new Map<number, number>();
      const ports = lay.ports.map(lp => {
        const z = localZ(lp.innerSeat ?? lp.seat);
        const pi = addPlace(lp.id, si, lp.innerSeat ?? null, z);
        portZ.set(pi, z);
        return pi;
      });
      const slotZ: number[] = [], slotY: number[] = [], usable: boolean[] = [];
      const blockedCols = new Set<string>();
      for (const z of portZ.values()) {
        const c = (z - slots.z0) / slots.dz;
        blockedCols.add(String(Math.floor(c + 1e-9)));
        blockedCols.add(String(Math.ceil(c - 1e-9)));
      }
      const manualZ = localZ(lay.manualPort.innerSeat ?? lay.manualPort.seat);
      blockedCols.add(String(Math.round((manualZ - slots.z0) / slots.dz)));
      for (let rack = 0; rack < 2; rack++) {
        for (let col = 0; col < slots.columns; col++) {
          for (let lev = 0; lev < slots.levels; lev++) {
            slotZ.push(slots.z0 + slots.dz * col);
            slotY.push(slots.y0 + slots.dy * lev);
            usable.push(!(rack === 1 && lev < 2 && blockedCols.has(String(col))));
          }
        }
      }
      const count = usable.filter(Boolean).length;
      if (count !== st.usableSlots) throw new Error(`stocker ${st.id}: ${count} usable slots, data says ${st.usableSlots}`);
      this.stockerInfo.push({ id: st.id, ports, manualZ, slotZ, slotY, usable, portZ });
    });
    for (const shelf of tools.uts) for (const seat of shelf.seats) addPlace(seat, -1, null, 0);
    // Route: group per step and raw process time remaining from each step (the furnace counts its full cycle).
    const fb = tools.furnaceBatch;
    const stepMs = route.route.map(([fam]) => {
      const grp = tools.familyToGroup[fam];
      if (!grp) throw new Error(`route family ${fam} has no group`);
      this.routeGroup.push(grp);
      const group = tools.groups[grp] as { processMsPerLot: number; batch?: boolean };
      return group.batch ? Math.round((fb.cycleH * 60 + fb.handlingMin) * 60_000) : group.processMsPerLot;
    });
    let acc = 0;
    for (let i = stepMs.length - 1; i >= 0; i--) { acc += stepMs[i] as number; this.rawLeft[i] = acc; }
    this.rawLeft[stepMs.length] = 0;
    // The spine loop: follow main edges from the first spine edge until it closes.
    let e0 = -1;
    for (let i = 0; i < g.e; i++) if (g.spine[i]) { e0 = i; break; }
    let e = e0;
    do {
      this.spineLoop.push(e);
      e = this.mainOut(g.to[e] as number);
    } while (e !== e0 && this.spineLoop.length <= g.e);
    if (e !== e0) throw new Error('the spine does not close into a loop');
  }

  private mainOut(node: number): number {
    const outs = this.g.out[node] as number[];
    if (outs.length === 1) return outs[0] as number;
    for (const e of outs) if (this.g.main[e]) return e;
    return outs[0] as number;
  }

  // ---------------------------------------------------------------- fresh state

  private freshState(seed: number, mode: FabMode): SimStateJson {
    const cfg = this.cfg;
    const S: SimStateJson = {
      version: 1, seed, mode: 'pilot', rule: 'leastWork', t: 0, seq: 0, queue: [], rng: {},
      lots: [], nextLot: 1, nextJob: 1, craneSeq: 1,
      places: this.places.map(() => ({ st: 'EMPTY' as PlaceState, lot: -1, res: -1, t0: 0, out: false })),
      tools: this.res.map(r => ({
        st: (r.scheduled ? 'STANDBY' : 'NON_SCHEDULED') as E10State, t0: 0, lot: -1, end: -1, left: -1, ver: 0,
        ready: [], queue: [], assigned: [], batch: [], done: [], xin: 0, xout: 0, waitIn: [],
        pm: false, pmNext: -1, downUntil: -1, failT: -1, redraw: false, stateMs: E10_STATES.map(() => 0),
      })),
      vehicles: [], holder: new Array<number>(this.g.nBlocks).fill(-1), reqs: [],
      floor: emptyFloorState(this.data.layout.floorRobots.stations.length, this.stockerInfo.length),
      stockers: this.stockerInfo.map(si => ({
        slots: si.usable.map(u => (u ? -1 : -2)), jobs: [], cur: null,
        crane: { st: 'IDLE' as const, z: 0, y: this.data.layout.stockerSlots.innerSeatY, segs: [] }, waitPort: [], manual: [],
      })),
      stats: { moves: 0, shipped: 0, ships: [], hourly: [], emergencyStops: 0, releasesSkipped: 0 },
      hashes: [],
    };
    this.S = S;
    this.lotMap.clear();
    // Failures and staggered PMs per resource.
    for (const [group, list] of this.groupRes) {
      void group;
      list.forEach((ri, k) => {
        const r = this.res[ri] as ResInfo, T = S.tools[ri] as ToolRec;
        T.failT = drawExponentialMs(S.rng, seed, `fail:${r.id}`, r.rel.mtbfH * HOUR_MS);
        this.at(T.failT, 'fail', ri);
        T.pmNext = Math.round(((k + 0.5) / list.length) * r.rel.pmEveryH * HOUR_MS);
        this.at(T.pmNext, 'pm', ri);
      });
    }
    this.at(0, 'release');
    this.at(cfg.clock.hashIntervalMs, 'hash');
    // Pilot vehicles start spread evenly around the spine loop.
    const pilot = cfg.modes.pilot.vehicles;
    const loopLen = this.spineLoop.reduce((sum, e) => sum + (this.g.len[e] as number), 0);
    for (let k = 0; k < pilot; k++) {
      const v = this.newVehicle(false);
      if (!this.placeVehicle(v, (k * loopLen) / pilot, loopLen)) throw new Error('could not place the pilot vehicles');
    }
    for (let k = 0; k < S.vehicles.length; k++) this.extendAndPlan(k, 0, true);
    if (mode === 'megafab') this.setMode('megafab');
    return S;
  }

  private newVehicle(syn: boolean): number {
    const S = this.S;
    const rec: VehRec = {
      alive: true, syn, st: 'IDLE', lot: syn ? -2 : -1, job: null, route: [], rs: [], h0: 0, h1: -1, plan: [], rest: 0, ver: 0,
      goals: [], gs: [], gi: 0, wb: -1, we: -1, wt: 0, wm: 1, wtok: 0, wk: -1, ho: null, bs: syn ? 0 : -1, busy: 0,
    };
    for (let i = 0; i < S.vehicles.length; i++) {
      const old = S.vehicles[i] as VehRec;
      if (!old.alive && old.syn === syn) {
        rec.ver = old.ver + 1; rec.wtok = old.wtok + 1;
        S.vehicles[i] = rec;
        return i;
      }
    }
    S.vehicles.push(rec);
    return S.vehicles.length - 1;
  }

  /** Puts vehicle vi at distance d around the spine loop if the blocks it needs are free (vi -1 only checks). */
  private placeVehicle(vi: number, d: number, loopLen: number): boolean {
    const g = this.g, S = this.S, loop = this.spineLoop, L = loop.length;
    let j = 0, acc = 0;
    d = ((d % loopLen) + loopLen) % loopLen;
    while (acc + (g.len[loop[j] as number] as number) <= d && j < L - 1) { acc += g.len[loop[j] as number] as number; j++; }
    const offset = d - acc;
    const need = this.half + this.gap + 0.5;
    let back = j, behind = offset;
    while (behind < need) { back = (back - 1 + L) % L; behind += g.len[loop[back] as number] as number; }
    let fwd = j, ahead = (g.len[loop[j] as number] as number) - offset;
    while (ahead < need) { fwd = (fwd + 1) % L; ahead += g.len[loop[fwd] as number] as number; }
    const edges: number[] = [];
    for (let k = back; ; k = (k + 1) % L) { edges.push(loop[k] as number); if (k === fwd) break; }
    for (const e of edges) if ((S.holder[g.block[e] as number] as number) >= 0) return false;
    if (vi < 0) return true;
    const v = S.vehicles[vi] as VehRec;
    v.route = edges;
    v.rs = [];
    let s = 0;
    for (const e of edges) { v.rs.push(s); s += g.len[e] as number; }
    v.h0 = 0; v.h1 = edges.length - 1;
    for (const e of edges) S.holder[g.block[e] as number] = vi;
    v.rest = (v.rs[(j - back + L) % L] as number) + offset;
    v.plan = [];
    return true;
  }

  // ---------------------------------------------------------------- scheduling and the loop

  private at(t: number, k: string, a = 0, b = 0): void {
    const S = this.S;
    heapPush(S.queue, { t: Math.max(t, S.t), s: S.seq++, k, a, b });
  }

  private clip(t: number, entity: string, clip: string): void {
    this.log.push({ t, entity, clip });
    if (this.log.length > this.logCap) this.log.splice(0, this.log.length - this.logCap);
  }

  step(untilMs: number): void {
    const S = this.S;
    const q = S.queue;
    while (q.length > 0 && (q[0] as SimEvent).t <= untilMs) {
      const ev = heapPop(q) as SimEvent;
      S.t = ev.t;
      this.handle(ev);
    }
    if (untilMs > S.t) S.t = untilMs;
  }

  private handle(ev: SimEvent): void {
    const t = ev.t;
    this.eventCounts[ev.k] = (this.eventCounts[ev.k] ?? 0) + 1;
    switch (ev.k) {
      case 'hash': this.onHash(t); break;
      case 'release': this.onRelease(t); break;
      case 'place': this.onPlace(ev.a, t); break;
      case 'proc': this.onProcDone(ev.a, ev.b, t); break;
      case 'batch': this.onBatchDone(ev.a, ev.b, t); break;
      case 'fcheck': this.toolKick(ev.a, t); break;
      case 'fxIn': this.onFurnaceIn(ev.a, t); break;
      case 'fxOut': this.onFurnaceOut(ev.a, t); break;
      case 'fail': this.onFail(ev.a, t); break;
      case 'repair': this.onRepair(ev.a, ev.b, t); break;
      case 'pm': this.onPmDue(ev.a, t); break;
      case 'pmEnd': this.onPmEnd(ev.a, ev.b, t); break;
      case 'qualEnd': this.onQualEnd(ev.a, ev.b, t); break;
      case 'inject': this.onInject(ev.a, ev.b, t); break;
      case 'vCheck': { const v = this.S.vehicles[ev.a] as VehRec; if (v.alive && v.ver === ev.b) this.extendAndPlan(ev.a, t, false); break; }
      case 'vWake': { const v = this.S.vehicles[ev.a] as VehRec; if (v.alive && v.wtok === ev.b && v.wb >= 0 && v.wk === t) { v.wk = -1; this.extendAndPlan(ev.a, t, false); } break; }
      case 'vArrive': { const v = this.S.vehicles[ev.a] as VehRec; if (v.alive && v.ver === ev.b) this.onArrive(ev.a, t); break; }
      case 'vHand': { const v = this.S.vehicles[ev.a] as VehRec; if (v.alive && v.ver === ev.b) this.onHandoffDone(ev.a, t); break; }
      case 'crane': this.onCraneDone(ev.a, t); break;
      case 'craneMid': this.onCraneMid(ev.a, t); break;
      case 'pass': this.onPass(ev.a, t); break;
      case 'ship': this.onShip(ev.a, t); break;
      case 'floorArrive': this.onFloorArrive(ev.a, t); break;
      case 'floorPick': this.onFloorPick(ev.a, t); break;
      case 'floorDrop': this.onFloorDrop(ev.a, t); break;
      case 'floorHome': this.onFloorHome(ev.a, t); break;
      default: throw new Error(`unknown event ${ev.k}`);
    }
  }

  // ---------------------------------------------------------------- releases, shipping, lots

  private lot(id: number): LotRec {
    const lot = this.lotMap.get(id);
    if (!lot) throw new Error(`no lot ${id}`);
    return lot;
  }

  private onRelease(t: number): void {
    const S = this.S, cfg = this.cfg;
    this.at(t + this.releaseMs, 'release');
    if (S.lots.length >= cfg.starts.conwipCap) { S.stats.releasesSkipped++; return; }
    const u = drawUniform(S.rng, S.seed, 'lotClass');
    const cls: 0 | 1 | 2 = u < cfg.starts.lotClasses.hot ? 1 : u < cfg.starts.lotClasses.hot + cfg.starts.lotClasses.engineering ? 2 : 0;
    const si = drawUniform(S.rng, S.seed, 'release') < 0.5 ? 0 : 1;
    const lot: LotRec = { id: S.nextLot++, cls, step: 0, st: 'WAIT_MOVE', rel: t, loc: 'manual', li: si, slot: -1, tool: -1, dest: -1, qt: t, ship: false };
    S.lots.push(lot);
    this.lotMap.set(lot.id, lot);
    (S.stockers[si] as StockerRec).manual.push(lot.id);
    this.craneJob(si, 'release', lot.id, -1, t);
  }

  private onShip(id: number, t: number): void {
    const S = this.S, lot = this.lot(id);
    const st = S.stockers[lot.li] as StockerRec;
    st.manual = st.manual.filter(x => x !== id);
    S.lots = S.lots.filter(x => x.id !== id);
    this.lotMap.delete(id);
    S.stats.shipped++;
    S.stats.ships.push([t, lot.rel]);
    this.dispatchFloor(t);
  }

  /** The lot has finished a step and is ready for pickup at its port (READY_TO_UNLOAD). */
  private lotDoneAtTool(lot: LotRec, t: number): void {
    lot.st = 'DONE_AT_TOOL';
    const floorStation = this.floorStation(lot.li);
    if (floorStation >= 0) {
      lot.step++;
      lot.ship = lot.step >= this.routeGroup.length;
      lot.st = lot.ship ? 'COMPLETE' : 'WAIT_MOVE';
      lot.tool = -1;
      this.queueFloor(lot, floorStation, this.nearerStocker(this.placeNode(lot.li)), 'collect', t);
      return;
    }
    if (lot.step >= this.routeGroup.length - 1) {
      lot.step = this.routeGroup.length;
      lot.st = 'COMPLETE';
      lot.ship = true;
      lot.tool = -1;
      this.toStocker(lot, this.nearerStocker(this.placeNode(lot.li)), t);
      return;
    }
    lot.step++;
    this.dispatchStep(lot, t);
  }

  private placeNode(pi: number): number { return (this.places[pi] as PlaceInfo).node; }

  private dispatchStep(lot: LotRec, t: number): void {
    const S = this.S;
    const ri = this.chooseTool(this.routeGroup[lot.step] as string, t);
    const T = S.tools[ri] as ToolRec;
    lot.tool = ri;
    T.assigned.push(lot.id);
    lot.qt = t;
    if (lot.loc === 'slot') {
      lot.st = 'QUEUED';
      T.queue.push(lot.id);
      this.callForward(ri, t);
      return;
    }
    const src = lot.li;
    const free = this.freePort(ri);
    if (free >= 0 && this.floorStation(free) >= 0) {
      // A floor station receives from storage. Keep its assigned lot in the resource queue while OHT
      // takes the previous tool's finished lot to a stocker; callForward retrieves it through the floor dock.
      T.queue.push(lot.id);
      this.toStocker(lot, this.nearerStocker(this.placeNode(src)), t);
      return;
    }
    if (free >= 0) {
      this.reserve(free, lot);
      this.requestMove(lot, src, free, t);
      return;
    }
    T.queue.push(lot.id);
    const seat = this.utsUpstream(src, ri);
    if (seat >= 0) {
      this.reserve(seat, lot);
      this.requestMove(lot, src, seat, t);
      return;
    }
    this.toStocker(lot, this.nearerStocker(this.placeNode(src)), t);
  }

  private reserve(pi: number, lot: LotRec, out = false): void {
    const P = this.S.places[pi] as PlaceRec;
    P.st = 'RESERVED'; P.res = lot.id; P.out = out;
    lot.dest = pi;
  }

  private freePort(ri: number): number {
    for (const pi of (this.res[ri] as ResInfo).ports) {
      const P = this.S.places[pi] as PlaceRec;
      if (P.st === 'EMPTY' && P.res < 0) return pi;
    }
    return -1;
  }

  private work(ri: number, t: number): number {
    const r = this.res[ri] as ResInfo, T = this.S.tools[ri] as ToolRec;
    let w = 0;
    if (T.st === 'PRODUCTIVE' && T.end >= 0) w += T.end - t;
    if (T.left >= 0) w += T.left;
    if (T.st === 'SCHEDULED_DOWN' || T.st === 'ENGINEERING') w += Math.max(0, T.downUntil - t);
    else if (T.st === 'UNSCHEDULED_DOWN') w += Math.round(r.rel.mttrH * HOUR_MS);
    if (r.batch) {
      const fb = this.data.tools.furnaceBatch;
      w += Math.round(((T.ready.length + T.assigned.length) * r.procMs) / fb.maxLots);
    } else w += T.assigned.length * r.procMs;
    return w;
  }

  private chooseTool(group: string, t: number): number {
    const list = this.groupRes.get(group) as number[];
    let best = list[0] as number, bestW = INF;
    for (const ri of list) {
      const w = this.work(ri, t);
      if (w < bestW) { bestW = w; best = ri; }
    }
    return best;
  }

  /** Orders candidate lots by the dispatch rule: hot first then first come (leastWork), first come (fifo), or critical ratio. */
  private pickLot(ids: readonly number[], t: number, callable: (lot: LotRec) => boolean): number {
    let best = -1, bestKey0 = INF, bestKey1 = INF;
    const rule = this.S.rule, due = this.cfg.dispatch.criticalRatioDueDays * DAY_MS;
    for (const id of ids) {
      const lot = this.lot(id);
      if (!callable(lot)) continue;
      let k0: number, k1: number;
      if (rule === 'fifo') { k0 = 0; k1 = lot.qt; }
      else if (rule === 'criticalRatio') { k0 = lot.cls === 1 ? 0 : 1; k1 = (lot.rel + due - t) / Math.max(1, this.rawLeft[lot.step] as number); }
      else { k0 = lot.cls === 1 ? 0 : 1; k1 = lot.qt; }
      if (k0 < bestKey0 || (k0 === bestKey0 && (k1 < bestKey1 || (k1 === bestKey1 && id < best)))) { best = id; bestKey0 = k0; bestKey1 = k1; }
    }
    return best;
  }

  /** Calls stored lots forward to free ports of resource ri. */
  private callForward(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec;
    for (;;) {
      if (T.queue.length === 0) return;
      const port = this.freePort(ri);
      if (port < 0) return;
      // Stored lots, and lots still at their last tool waiting for a stocker port, can be called forward.
      const id = this.pickLot(T.queue, t, lot => lot.dest < 0 && (lot.st === 'QUEUED' || (lot.st === 'WAIT_MOVE' && lot.loc === 'place')));
      if (id < 0) return;
      const candidate = this.lot(id);
      if (candidate.loc === 'place' && this.floorStation(port) >= 0) {
        for (const st of this.S.stockers) st.waitPort = st.waitPort.filter(w => w.lot !== id);
        this.toStocker(candidate, this.nearerStocker(this.placeNode(candidate.li)), t);
        return;
      }
      T.queue = T.queue.filter(x => x !== id);
      const lot = this.lot(id);
      this.reserve(port, lot);
      if (lot.loc === 'place') {
        for (const st of this.S.stockers) st.waitPort = st.waitPort.filter(w => w.lot !== id);
        this.requestMove(lot, lot.li, port, t);
      } else this.retrieve(lot, t);
    }
  }

  private utsUpstream(src: number, ri: number): number {
    const g = this.g, n = g.n, a = this.placeNode(src);
    const u = this.placeNode((this.res[ri] as ResInfo).ports[0] as number);
    const direct = g.cost[a * n + u] as number, slack = this.cfg.dispatch.utsUpstreamSlackS;
    let best = -1, bestCost = INF;
    for (let pi = 0; pi < this.places.length; pi++) {
      const info = this.places[pi] as PlaceInfo;
      if (info.kind !== 'uts' || pi === src) continue;
      const P = this.S.places[pi] as PlaceRec;
      if (P.st !== 'EMPTY' || P.res >= 0) continue;
      const x = info.node, toSeat = g.cost[a * n + x] as number;
      if (toSeat + (g.cost[x * n + u] as number) > direct + slack) continue;
      if (toSeat < bestCost) { bestCost = toSeat; best = pi; }
    }
    return best;
  }

  private nearerStocker(node: number): number {
    const g = this.g;
    let best = 0, bestCost = INF;
    this.stockerInfo.forEach((si, i) => {
      for (const pi of si.ports) {
        const c = g.cost[node * g.n + this.placeNode(pi)] as number;
        if (c < bestCost) { bestCost = c; best = i; }
      }
    });
    return best;
  }

  /** Sends a lot at a place to stocker si through a free OHT port, or queues it for one. */
  private toStocker(lot: LotRec, si: number, t: number): void {
    const info = this.stockerInfo[si] as StockerInfo, g = this.g;
    const from = this.placeNode(lot.li);
    let best = -1, bestCost = INF;
    for (const pi of info.ports) {
      const P = this.S.places[pi] as PlaceRec;
      if (P.st !== 'EMPTY' || P.res >= 0) continue;
      const c = g.cost[from * g.n + this.placeNode(pi)] as number;
      if (c < bestCost) { bestCost = c; best = pi; }
    }
    lot.st = 'WAIT_MOVE';
    if (best >= 0) {
      this.reserve(best, lot);
      this.requestMove(lot, lot.li, best, t);
    } else (this.S.stockers[si] as StockerRec).waitPort.push({ kind: 'in', lot: lot.id, t, hot: lot.cls === 1 });
  }

  private retrieve(lot: LotRec, t: number): void {
    const si = lot.li, info = this.stockerInfo[si] as StockerInfo;
    const station = this.floorStation(lot.dest);
    if (station >= 0) {
      lot.st = 'WAIT_MOVE';
      this.queueFloor(lot, station, si, 'deliver', t);
      return;
    }
    for (const pi of info.ports) {
      const P = this.S.places[pi] as PlaceRec;
      if (P.st === 'EMPTY' && P.res < 0) {
        P.st = 'RESERVED'; P.res = lot.id; P.out = true;
        this.craneJob(si, 'retrieve', lot.id, pi, t);
        return;
      }
    }
    (this.S.stockers[si] as StockerRec).waitPort.push({ kind: 'out', lot: lot.id, t, hot: lot.cls === 1 });
  }

  // ---------------------------------------------------------------- places (ports, seats, stocker ports)

  private setPlace(pi: number, st: PlaceState, t: number): void {
    const P = this.S.places[pi] as PlaceRec;
    P.st = st; P.t0 = t;
  }

  private onPlace(pi: number, t: number): void {
    const P = this.S.places[pi] as PlaceRec, info = this.places[pi] as PlaceInfo, ports = this.cfg.ports;
    switch (P.st) {
      case 'DOCKING':
        this.setPlace(pi, 'OPENING', t);
        this.clip(t, info.id, 'DoorOpen');
        this.clip(t, `lot-${P.lot}`, 'DoorRemove');
        this.at(t + ports.openMs, 'place', pi);
        break;
      case 'OPENING': {
        this.setPlace(pi, 'OPEN', t);
        const lot = this.lot(P.lot);
        lot.st = 'AT_PORT';
        lot.qt = t;
        const ri = info.owner, T = this.S.tools[ri] as ToolRec;
        if ((this.res[ri] as ResInfo).batch) this.furnaceIn(pi, t);
        else { T.ready.push(lot.id); this.toolKick(ri, t); }
        break;
      }
      case 'CLOSING':
        this.setPlace(pi, 'UNDOCKING', t);
        this.clip(t, info.id, 'Undock');
        this.at(t + ports.undockMs, 'place', pi);
        break;
      case 'UNDOCKING':
        this.setPlace(pi, 'READY_TO_UNLOAD', t);
        this.lotDoneAtTool(this.lot(P.lot), t);
        break;
      default:
        throw new Error(`place ${info.id} stepped in state ${P.st}`);
    }
  }

  private closePort(pi: number, t: number): void {
    const P = this.S.places[pi] as PlaceRec, info = this.places[pi] as PlaceInfo;
    this.setPlace(pi, 'CLOSING', t);
    this.clip(t, info.id, 'DoorClose');
    this.clip(t, `lot-${P.lot}`, 'DoorReplace');
    this.at(t + this.cfg.ports.closeMs, 'place', pi);
  }

  /** A load port became EMPTY: furnaces first send finished lots out, then stored lots are called forward. */
  private loadPortFreed(pi: number, t: number): void {
    const ri = (this.places[pi] as PlaceInfo).owner;
    if ((this.res[ri] as ResInfo).batch) this.furnaceOut(ri, t);
    this.callForward(ri, t);
  }

  private stockerPortFreed(pi: number, t: number): void {
    const si = (this.places[pi] as PlaceInfo).owner, st = this.S.stockers[si] as StockerRec;
    const P = this.S.places[pi] as PlaceRec;
    if (st.waitPort.length === 0 || P.st !== 'EMPTY' || P.res >= 0) return;
    let k = 0;
    for (let i = 1; i < st.waitPort.length; i++) {
      const a = st.waitPort[i] as { hot: boolean; t: number }, b = st.waitPort[k] as { hot: boolean; t: number };
      if ((a.hot && !b.hot) || (a.hot === b.hot && a.t < b.t)) k = i;
    }
    const w = st.waitPort.splice(k, 1)[0] as { kind: 'in' | 'out'; lot: number };
    const lot = this.lot(w.lot);
    if (w.kind === 'in') {
      this.reserve(pi, lot);
      this.requestMove(lot, lot.li, pi, t);
    } else {
      P.st = 'RESERVED'; P.res = lot.id; P.out = true;
      this.craneJob(si, 'retrieve', lot.id, pi, t);
    }
  }

  private onPass(pi: number, t: number): void {
    const P = this.S.places[pi] as PlaceRec, si = (this.places[pi] as PlaceInfo).owner;
    if (P.st === 'PASS_IN') {
      this.setPlace(pi, 'WAIT_CRANE', t);
      this.craneJob(si, 'store', P.lot, pi, t);
    } else if (P.st === 'PASS_OUT') {
      this.setPlace(pi, 'READY_TO_UNLOAD', t);
      const lot = this.lot(P.lot);
      lot.st = 'WAIT_MOVE';
      this.requestMove(lot, pi, lot.dest, t);
    } else throw new Error(`pass-through event in state ${P.st}`);
  }

  // ---------------------------------------------------------------- tools, E10 states, failures and PM

  /** Repair, PM and qualification visits in progress, derived from tool state. */
  serviceVisits(): ServiceVisit[] { return serviceVisits(this.S.tools, this.res.map(r => r.id)); }

  private setToolState(ri: number, st: E10State, t: number): void {
    const T = this.S.tools[ri] as ToolRec;
    const k = E10_STATES.indexOf(T.st);
    T.stateMs[k] = (T.stateMs[k] as number) + (t - T.t0);
    T.st = st; T.t0 = t;
  }

  private toolKick(ri: number, t: number): void {
    const S = this.S, T = S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.st !== 'STANDBY') return;
    if (T.pm) { this.startPm(ri, t); return; }
    if (r.batch) { this.furnaceKick(ri, t); return; }
    if (T.ready.length === 0) return;
    const id = this.pickLot(T.ready, t, () => true);
    const lot = this.lot(id);
    T.ready = T.ready.filter(x => x !== id);
    T.assigned = T.assigned.filter(x => x !== id);
    lot.st = 'PROCESSING';
    T.lot = id;
    this.setToolState(ri, 'PRODUCTIVE', t);
    T.end = t + r.procMs;
    T.ver++;
    this.at(T.end, 'proc', ri, T.ver);
    if (r.group === 'cmp') this.clip(t, r.id, 'CarouselIndex');
  }

  private onProcDone(ri: number, ver: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec;
    if (T.ver !== ver || T.st !== 'PRODUCTIVE' || T.batch.length > 0) return;
    const lot = this.lot(T.lot);
    T.lot = -1; T.end = -1;
    lot.st = 'DONE_AT_TOOL';
    this.closePort(lot.li, t);
    this.setToolState(ri, 'STANDBY', t);
    this.toolKick(ri, t);
  }

  private onFail(ri: number, t: number): void {
    const S = this.S, T = S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.failT !== t) return;
    if (T.st === 'NON_SCHEDULED' || T.st === 'UNSCHEDULED_DOWN') return;
    if (T.st === 'SCHEDULED_DOWN' || T.st === 'ENGINEERING') { T.redraw = true; return; }
    if (T.st === 'PRODUCTIVE') { T.left = T.end - t; T.end = -1; }
    this.goDown(ri, t, drawLognormalMs(S.rng, S.seed, `repair:${r.id}`, r.rel.mttrH * HOUR_MS));
  }

  private goDown(ri: number, t: number, durMs: number): void {
    const T = this.S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    this.setToolState(ri, 'UNSCHEDULED_DOWN', t);
    if (r.downOpen) this.clip(t, r.downEntity, r.downOpen);
    T.downUntil = t + durMs;
    T.ver++;
    this.at(t + durMs, 'repair', ri, T.ver);
    this.service.request({ kind: 'repair', ri, tool: r.id, at: t, until: T.downUntil });
  }

  private onInject(ri: number, durMs: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec;
    if (T.st === 'NON_SCHEDULED' || T.st === 'UNSCHEDULED_DOWN' || T.st === 'SCHEDULED_DOWN' || T.st === 'ENGINEERING') return;
    if (T.st === 'PRODUCTIVE') { T.left = T.end - t; T.end = -1; }
    this.goDown(ri, t, durMs);
  }

  private onRepair(ri: number, ver: number, t: number): void {
    const S = this.S, T = S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.ver !== ver || T.st !== 'UNSCHEDULED_DOWN') return;
    if (r.downClose) this.clip(t, r.downEntity, r.downClose);
    T.downUntil = -1;
    this.service.release(ri, t);
    if (T.failT <= t) {
      T.failT = t + drawExponentialMs(S.rng, S.seed, `fail:${r.id}`, r.rel.mtbfH * HOUR_MS);
      this.at(T.failT, 'fail', ri);
    }
    if (T.left >= 0) {
      this.setToolState(ri, 'PRODUCTIVE', t);
      T.end = t + T.left; T.left = -1; T.ver++;
      this.at(T.end, T.batch.length > 0 ? 'batch' : 'proc', ri, T.ver);
      return;
    }
    this.setToolState(ri, 'STANDBY', t);
    this.toolKick(ri, t);
  }

  private onPmDue(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.st === 'NON_SCHEDULED') return;
    T.pm = true;
    T.pmNext = t + Math.round(r.rel.pmEveryH * HOUR_MS);
    this.at(T.pmNext, 'pm', ri);
    this.toolKick(ri, t);
  }

  private startPm(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    T.pm = false;
    this.setToolState(ri, 'SCHEDULED_DOWN', t);
    if (r.downOpen) this.clip(t, r.downEntity, r.downOpen);
    const pmMs = Math.round(r.rel.pmLengthH * HOUR_MS), qualMs = this.data.tools.engineering.afterPmQualificationMin * 60_000;
    T.downUntil = t + pmMs + qualMs;
    T.ver++;
    this.at(t + pmMs, 'pmEnd', ri, T.ver);
    this.service.request({ kind: 'pm', ri, tool: r.id, at: t, until: T.downUntil });
  }

  private onPmEnd(ri: number, ver: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.ver !== ver || T.st !== 'SCHEDULED_DOWN') return;
    if (r.downClose) this.clip(t, r.downEntity, r.downClose);
    this.setToolState(ri, 'ENGINEERING', t);
    T.ver++;
    this.at(t + this.data.tools.engineering.afterPmQualificationMin * 60_000, 'qualEnd', ri, T.ver);
  }

  private onQualEnd(ri: number, ver: number, t: number): void {
    const S = this.S, T = S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.ver !== ver || T.st !== 'ENGINEERING') return;
    T.downUntil = -1;
    this.service.release(ri, t);
    this.setToolState(ri, 'STANDBY', t);
    if (T.redraw || T.failT <= t) {
      T.redraw = false;
      T.failT = t + drawExponentialMs(S.rng, S.seed, `fail:${r.id}`, r.rel.mtbfH * HOUR_MS);
      this.at(T.failT, 'fail', ri);
    }
    this.toolKick(ri, t);
  }

  // ---------------------------------------------------------------- furnaces (batch tools)

  /** Lots inside a furnace that are waiting for or in a batch. Finished lots wait on a separate output shelf, so
   *  lots entering can never be blocked by lots that need a port to leave. */
  private occupancy(T: ToolRec): number { return T.ready.length + T.batch.length + T.xin; }

  private furnaceIn(pi: number, t: number): void {
    const ri = (this.places[pi] as PlaceInfo).owner, T = this.S.tools[ri] as ToolRec;
    if (this.occupancy(T) >= this.data.tools.furnaceBatch.internalBuffer) { T.waitIn.push(pi); return; }
    T.xin++;
    this.at(t + this.data.tools.furnaceBatch.portTransferS * 1000, 'fxIn', pi);
  }

  private onFurnaceIn(pi: number, t: number): void {
    const P = this.S.places[pi] as PlaceRec, ri = (this.places[pi] as PlaceInfo).owner, T = this.S.tools[ri] as ToolRec;
    const lot = this.lot(P.lot);
    T.xin--;
    lot.loc = 'buffer'; lot.li = ri; lot.st = 'AT_PORT'; lot.qt = t;
    T.ready.push(lot.id);
    P.lot = -1; P.res = -1; P.out = false;
    this.setPlace(pi, 'EMPTY', t);
    this.loadPortFreed(pi, t);
    this.toolKick(ri, t);
  }

  private furnaceKick(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, fb = this.data.tools.furnaceBatch, r = this.res[ri] as ResInfo;
    const n = T.ready.length;
    if (n < fb.minLots) return;
    let oldest = INF;
    for (const id of T.ready) oldest = Math.min(oldest, this.lot(id).qt);
    const waitMs = fb.oldestWaitH * HOUR_MS;
    if (n < fb.maxLots && t - oldest < waitMs) { this.at(oldest + waitMs, 'fcheck', ri); return; }
    const take = Math.min(n, fb.maxLots);
    const batch: number[] = [];
    for (let k = 0; k < take; k++) {
      const id = this.pickLot(T.ready, t, l => !batch.includes(l.id));
      batch.push(id);
    }
    T.ready = T.ready.filter(x => !batch.includes(x));
    T.assigned = T.assigned.filter(x => !batch.includes(x));
    for (const id of batch) this.lot(id).st = 'PROCESSING';
    T.batch = batch;
    this.setToolState(ri, 'PRODUCTIVE', t);
    T.end = t + r.procMs;
    T.ver++;
    this.at(T.end, 'batch', ri, T.ver);
    this.clip(t, r.id, 'BoatLoad');
  }

  private onBatchDone(ri: number, ver: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, r = this.res[ri] as ResInfo;
    if (T.ver !== ver || T.st !== 'PRODUCTIVE') return;
    this.clip(t, r.id, 'BoatUnload');
    for (const id of T.batch) this.lot(id).st = 'DONE_AT_TOOL';
    T.done.push(...T.batch);
    T.batch = [];
    T.end = -1;
    this.setToolState(ri, 'STANDBY', t);
    // Room inside again: lots waiting at the ports go in first (freeing ports), then finished lots come out.
    this.admitWaiting(ri, t);
    this.furnaceOut(ri, t);
    this.toolKick(ri, t);
  }

  private furnaceOut(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec;
    for (const pi of (this.res[ri] as ResInfo).ports) {
      if (T.done.length === 0) return;
      const P = this.S.places[pi] as PlaceRec;
      if (P.st !== 'EMPTY' || P.res >= 0) continue;
      const id = this.pickLot(T.done, t, () => true);
      T.done = T.done.filter(x => x !== id);
      P.st = 'RESERVED'; P.res = id; P.out = true; P.t0 = t;
      T.xout++;
      this.at(t + this.data.tools.furnaceBatch.portTransferS * 1000, 'fxOut', pi);
    }
  }

  private onFurnaceOut(pi: number, t: number): void {
    const P = this.S.places[pi] as PlaceRec, ri = (this.places[pi] as PlaceInfo).owner, T = this.S.tools[ri] as ToolRec;
    const lot = this.lot(P.res);
    T.xout--;
    P.lot = lot.id; P.res = -1; P.out = false;
    lot.loc = 'place'; lot.li = pi;
    this.closePort(pi, t);
    this.admitWaiting(ri, t);
  }

  private admitWaiting(ri: number, t: number): void {
    const T = this.S.tools[ri] as ToolRec, cap = this.data.tools.furnaceBatch.internalBuffer;
    while (T.waitIn.length > 0 && this.occupancy(T) < cap) this.furnaceIn(T.waitIn.shift() as number, t);
  }

  // ---------------------------------------------------------------- stockers and cranes

  private craneJob(si: number, kind: CraneJobRec['kind'], lotId: number, place: number, t: number): void {
    const st = this.S.stockers[si] as StockerRec, lot = this.lot(lotId);
    st.jobs.push({ kind, lot: lotId, place, slot: kind === 'retrieve' || kind === 'floor' || kind === 'ship' ? lot.slot : -1, hot: lot.cls === 1, seq: this.S.craneSeq++ });
    this.craneKick(si, t);
  }

  private craneKick(si: number, t: number): void {
    const S = this.S, st = S.stockers[si] as StockerRec, info = this.stockerInfo[si] as StockerInfo, sc = this.cfg.stocker;
    if (st.cur || st.jobs.length === 0) return;
    let k = -1;
    for (let i = 0; i < st.jobs.length; i++) {
      const a = st.jobs[i] as CraneJobRec;
      const reservation = S.floor.docks[si] ?? -1;
      if (reservation >= 0 && (a.kind === 'release' || a.kind === 'floor' || a.kind === 'ship') && a.lot !== reservation) continue;
      const b = st.jobs[k];
      if (!b || (a.hot && !b.hot) || (a.hot === b.hot && a.seq < b.seq)) k = i;
    }
    if (k < 0) return;
    const job = st.jobs.splice(k, 1)[0] as CraneJobRec;
    const seatY = this.data.layout.stockerSlots.innerSeatY;
    let src: [number, number], dst: [number, number];
    if (job.kind === 'store' || job.kind === 'release') {
      src = job.kind === 'store' ? [info.portZ.get(job.place) as number, seatY] : [info.manualZ, seatY];
      let best = -1, bestT = INF;
      for (let i = 0; i < st.slots.length; i++) {
        if (st.slots[i] !== -1) continue;
        const c = Math.max(Math.abs((info.slotZ[i] as number) - src[0]) / sc.craneTravelMps, Math.abs((info.slotY[i] as number) - src[1]) / sc.craneLiftMps);
        if (c < bestT) { bestT = c; best = i; }
      }
      if (best < 0) throw new Error(`stocker ${info.id} is full`);
      job.slot = best;
      st.slots[best] = job.lot;
      dst = [info.slotZ[best] as number, info.slotY[best] as number];
    } else {
      src = [info.slotZ[job.slot] as number, info.slotY[job.slot] as number];
      dst = job.kind === 'retrieve' ? [info.portZ.get(job.place) as number, seatY] : [info.manualZ, seatY];
    }
    const segs: CraneSeg[] = [];
    let now = t, z = st.crane.z, y = st.crane.y;
    const move = (to: [number, number]) => {
      const d = Math.round(Math.max(Math.abs(to[0] - z) / sc.craneTravelMps, Math.abs(to[1] - y) / sc.craneLiftMps) * 1000);
      if (d > 0) segs.push({ t0: now, t1: now + d, z0: z, y0: y, z1: to[0], y1: to[1], fork: false });
      now += d; z = to[0]; y = to[1];
    };
    const fork = () => { segs.push({ t0: now, t1: now + sc.forkMs, z0: z, y0: y, z1: z, y1: y, fork: true }); now += sc.forkMs; };
    move(src); fork();
    const mid = now;
    move(dst); fork();
    st.cur = job;
    st.crane = { st: 'MOVING', z: dst[0], y: dst[1], segs };
    this.at(mid, 'craneMid', si);
    this.at(now, 'crane', si);
  }

  /** The crane has picked the FOUP: its source frees. */
  private onCraneMid(si: number, t: number): void {
    const S = this.S, st = S.stockers[si] as StockerRec, job = st.cur as CraneJobRec, lot = this.lot(job.lot);
    lot.loc = 'crane'; lot.li = si;
    if (job.kind === 'store') {
      const P = S.places[job.place] as PlaceRec;
      P.lot = -1; P.res = -1; P.out = false;
      this.setPlace(job.place, 'EMPTY', t);
      this.stockerPortFreed(job.place, t);
    } else if (job.kind === 'release') {
      st.manual = st.manual.filter(x => x !== job.lot);
      if (S.floor.docks[si] === job.lot) S.floor.docks[si] = -1;
    }
    else st.slots[job.slot] = -1;
  }

  private onCraneDone(si: number, t: number): void {
    const S = this.S, st = S.stockers[si] as StockerRec, job = st.cur as CraneJobRec, lot = this.lot(job.lot);
    st.cur = null;
    st.crane = { st: 'IDLE', z: st.crane.z, y: st.crane.y, segs: [] };
    if (job.kind === 'store' || job.kind === 'release') {
      lot.loc = 'slot'; lot.li = si; lot.slot = job.slot; lot.dest = -1;
      if (lot.ship) this.craneJob(si, 'ship', lot.id, -1, t);
      else if (lot.tool < 0) this.dispatchStep(lot, t);
      else { lot.st = 'QUEUED'; this.callForward(lot.tool, t); }
    } else if (job.kind === 'retrieve') {
      const P = S.places[job.place] as PlaceRec;
      lot.loc = 'place'; lot.li = job.place; lot.slot = -1;
      P.lot = lot.id; P.res = -1; P.out = false;
      this.setPlace(job.place, 'PASS_OUT', t);
      this.at(t + this.cfg.stocker.passThroughMs, 'pass', job.place);
    } else if (job.kind === 'floor') {
      lot.loc = 'manual'; lot.li = si; lot.slot = -1;
      st.manual.push(lot.id);
      const active = S.floor.active;
      if (!active || active.lot !== lot.id || active.phase !== 'WAIT_STOCKER') throw new Error('floor retrieval has no reserved carrier');
      this.floorLeg(active, 'TO_PICKUP', t, this.floorTravelMs(active), 'floorArrive');
    } else {
      lot.loc = 'manual'; lot.li = si; lot.slot = -1;
      st.manual.push(lot.id);
      this.at(t + this.cfg.shipping.dwellMs, 'ship', lot.id);
    }
    this.craneKick(si, t);
    this.dispatchFloor(t);
  }

  // ---------------------------------------------------------------- move requests and vehicle dispatch

  /** Only the named station port changes carrier class; other ports of the same resource still use OHT. */
  private floorStation(pi: number): number {
    if (!this.cfg.floorTransport?.enabled || pi < 0) return -1;
    const id = this.places[pi]?.id;
    return this.data.layout.floorRobots.stations.findIndex(s => s.port === id);
  }

  private queueFloor(lot: LotRec, station: number, stocker: number, direction: FloorJob['direction'], t: number): void {
    const floor = this.S.floor;
    if ((floor.active?.lot === lot.id && floor.active.phase !== 'RETURN') || floor.queue.some(j => j.lot === lot.id)) throw new Error(`duplicate floor request for lot ${lot.id}`);
    const id = floor.nextId++;
    floor.queue.push({ id, lot: lot.id, station, stocker, direction, requestedAt: t, hot: lot.cls === 1,
      carrier: 'amr' });
    this.dispatchFloor(t);
  }

  private dispatchFloor(t: number): void {
    const floor = this.S.floor;
    if (floor.active || floor.queue.length === 0) return;
    floor.queue.sort((a, b) => Number(b.hot) - Number(a.hot) || a.requestedAt - b.requestedAt || a.id - b.id);
    // Wait for a clear manual counter before reserving its transfer seat. Other manual crane jobs wait
    // behind this reservation; ordinary arrivals use the remaining counter buffer positions.
    const index = floor.queue.findIndex(job => {
      const st = this.S.stockers[job.stocker]!;
      return floor.docks[job.stocker] === -1 && st.manual.length === 0 && st.cur?.kind !== 'floor' && st.cur?.kind !== 'ship';
    });
    if (index < 0) return;
    const job = floor.queue.splice(index, 1)[0]!;
    floor.docks[job.stocker] = job.lot;
    const active: FloorActive = { ...job, phase: 'WAIT_STOCKER', t0: t, t1: t, carrying: false };
    floor.active = active;
    if (job.direction === 'deliver') this.craneJob(job.stocker, 'floor', job.lot, -1, t);
    else this.floorLeg(active, 'PICK', t, this.cfg.floorTransport!.pickupMs, 'floorPick');
  }

  private floorTravelMs(job: FloorJob): number {
    const cfg = this.cfg.floorTransport!;
    const speed = cfg.speedMps;
    return Math.max(1, Math.ceil(floorRoute(this.data, job.station, job.stocker).lengthM / speed * 1000));
  }

  private floorLeg(active: FloorActive, phase: FloorPhase, t: number, duration: number, event: string): void {
    active.phase = phase; active.t0 = t; active.t1 = t + duration;
    this.at(active.t1, event, active.id);
  }

  private activeFloor(id: number): FloorActive {
    const active = this.S.floor.active;
    if (!active || active.id !== id) throw new Error(`stale floor event ${id}`);
    return active;
  }

  private onFloorArrive(id: number, t: number): void {
    const active = this.activeFloor(id), cfg = this.cfg.floorTransport!;
    if (active.phase === 'TO_PICKUP') this.floorLeg(active, 'PICK', t, cfg.pickupMs, 'floorPick');
    else if (active.phase === 'TO_DROP') this.floorLeg(active, 'DROP', t, cfg.dropMs, 'floorDrop');
    else throw new Error(`floor arrival in ${active.phase}`);
  }

  private onFloorPick(id: number, t: number): void {
    const active = this.activeFloor(id), lot = this.lot(active.lot);
    if (active.phase !== 'PICK' || active.carrying) throw new Error('floor pickup without a free carrier');
    if (active.direction === 'deliver') {
      const st = this.S.stockers[active.stocker]!;
      if (lot.loc !== 'manual' || !st.manual.includes(lot.id)) throw new Error('floor pickup does not own its stocker source');
      st.manual = st.manual.filter(x => x !== lot.id);
      if (this.S.floor.docks[active.stocker] !== lot.id) throw new Error('floor pickup lost its stocker dock reservation');
      this.S.floor.docks[active.stocker] = -1;
      this.craneKick(active.stocker, t);
    } else {
      const pi = this.placeIndex.get(this.data.layout.floorRobots.stations[active.station]!.port)!;
      const P = this.S.places[pi]!;
      if (lot.loc !== 'place' || lot.li !== pi || P.lot !== lot.id) throw new Error('floor pickup does not own its station source');
      P.lot = -1; P.res = -1; P.out = false;
      this.setPlace(pi, 'EMPTY', t);
      this.loadPortFreed(pi, t);
    }
    lot.loc = 'floor'; lot.li = id; lot.slot = -1; lot.st = lot.ship ? 'COMPLETE' : 'IN_TRANSIT';
    active.carrying = true;
    this.floorLeg(active, 'TO_DROP', t, this.floorTravelMs(active), 'floorArrive');
  }

  private onFloorDrop(id: number, t: number): void {
    const active = this.activeFloor(id), lot = this.lot(active.lot), floor = this.S.floor;
    if (active.phase !== 'DROP' || !active.carrying || lot.loc !== 'floor' || lot.li !== id) throw new Error('floor drop lost its one-lot custody');
    active.carrying = false;
    if (active.direction === 'deliver') {
      const pi = this.placeIndex.get(this.data.layout.floorRobots.stations[active.station]!.port)!;
      const P = this.S.places[pi]!;
      if (P.lot >= 0 || P.res !== lot.id) throw new Error('floor destination is not reserved for its lot');
      lot.loc = 'place'; lot.li = pi; lot.dest = -1;
      P.lot = lot.id; P.res = -1; P.out = false;
      this.setPlace(pi, 'DOCKING', t);
      this.clip(t, this.places[pi]!.id, 'Dock');
      this.at(t + this.cfg.ports.dockMs, 'place', pi);
      floor.delivered++;
    } else {
      lot.loc = 'manual'; lot.li = active.stocker; lot.dest = -1;
      this.S.stockers[active.stocker]!.manual.push(lot.id);
      this.craneJob(active.stocker, 'release', lot.id, -1, t);
      floor.collected++;
    }
    this.S.stats.moves++;
    floor.completedByStation[active.station] = (floor.completedByStation[active.station] ?? 0) + 1;
    floor.completedByCarrier[active.carrier]++;
    if (active.direction === 'collect') this.floorLeg(active, 'RETURN', t, this.floorTravelMs(active), 'floorHome');
    else this.onFloorHome(id, t);
  }

  private onFloorHome(id: number, t: number): void {
    const active = this.activeFloor(id);
    if (active.carrying) throw new Error('cannot release aisle authority with a carried lot');
    this.S.floor.active = null;
    this.dispatchFloor(t);
  }

  private requestMove(lot: LotRec, from: number, to: number, t: number): void {
    const S = this.S;
    lot.st = lot.st === 'COMPLETE' ? 'COMPLETE' : 'WAIT_MOVE';
    lot.dest = to;
    S.reqs.push({ id: S.nextJob++, lot: lot.id, from, to, hot: lot.cls === 1, t });
    this.dispatchVehicles(t);
  }

  private dispatchVehicles(t: number): void {
    const S = this.S;
    if (S.reqs.length === 0) return;
    const idle: number[] = [];
    S.vehicles.forEach((v, i) => { if (v.alive && !v.syn && v.st === 'IDLE') idle.push(i); });
    if (idle.length === 0) return;
    S.reqs.sort((a, b) => (a.hot === b.hot ? 0 : a.hot ? -1 : 1) || a.t - b.t || a.id - b.id);
    while (S.reqs.length > 0 && idle.length > 0) {
      const req = S.reqs[0] as JobRec;
      const pickup = this.placeNode(req.from);
      let best = -1, bestCost = INF;
      for (const vi of idle) {
        const c = this.costTo(vi, pickup, t);
        if (c < bestCost) { bestCost = c; best = vi; }
      }
      if (best < 0) return;
      S.reqs.shift();
      idle.splice(idle.indexOf(best), 1);
      this.assign(best, req, t);
    }
  }

  /** Estimated time (s) for vehicle vi to reach node p: along its committed route, then the shortest path. */
  private costTo(vi: number, p: number, t: number): number {
    const g = this.g, v = this.S.vehicles[vi] as VehRec;
    const now = evalPlan(v.plan, t, v.rest);
    const s = now.s, vel = Math.max(0, now.v);
    const k = this.commitIndex(v, s, vel);
    for (let i = this.scanStart(v, s); i <= k; i++) {
      const e = v.route[i] as number, endS = (v.rs[i] as number) + (g.len[e] as number);
      if (g.to[e] === p && endS - s >= stopDistance(vel, this.cfg.vehicle.decel) - 1e-9) return (endS - s) / SPINE_IDLE;
    }
    const e = v.route[k] as number, endS = (v.rs[k] as number) + (g.len[e] as number);
    return (endS - s) / SPINE_IDLE + (g.cost[(g.to[e] as number) * g.n + p] as number);
  }

  private assign(vi: number, job: JobRec, t: number): void {
    const v = this.S.vehicles[vi] as VehRec;
    v.job = job;
    v.st = 'TO_PICKUP';
    v.bs = t;
    this.retarget(vi, t, [this.placeNode(job.from), this.placeNode(job.to)]);
  }

  // ---------------------------------------------------------------- traffic engine

  private refIndex(v: VehRec, s: number): number {
    let i = 0;
    while (i + 1 < v.route.length && (v.rs[i + 1] as number) <= s) i++;
    return i;
  }

  private commitIndex(v: VehRec, s: number, vel: number): number {
    const g = this.g, need = s + this.half + stopDistance(vel, this.cfg.vehicle.decel) + this.gap;
    let k = this.refIndex(v, s);
    while (k < v.h1 && (v.rs[k] as number) + (g.len[v.route[k] as number] as number) < need) k++;
    return k;
  }

  private authEnd(v: VehRec): number {
    if (v.h1 < 0) return v.rest;
    return (v.rs[v.h1] as number) + (this.g.len[v.route[v.h1] as number] as number);
  }

  private appendEdge(v: VehRec): void {
    const g = this.g;
    const last = v.route[v.route.length - 1] as number;
    const node = g.to[last] as number;
    const goal = v.goals[v.gi];
    const e = goal !== undefined ? (g.next[node * g.n + goal] as number) : this.mainOut(node);
    const start = (v.rs[v.rs.length - 1] as number) + (g.len[last] as number);
    v.route.push(e);
    v.rs.push(start);
    if (goal !== undefined && g.to[e] === goal) { v.gs[v.gi] = start + (g.len[e] as number); v.gi++; }
  }

  /** Releases blocks the vehicle's tail has passed and trims its route. */
  private prune(vi: number, t: number): void {
    const g = this.g, S = this.S, v = S.vehicles[vi] as VehRec;
    const tail = evalPlan(v.plan, t, v.rest).s - this.half;
    while (v.h0 <= v.h1 && v.h0 < v.route.length - 1) {
      const e = v.route[v.h0] as number;
      if (tail < (v.rs[v.h0] as number) + (g.len[e] as number) - 1e-6) break;
      const b = g.block[e] as number;
      if (S.holder[b] === vi) S.holder[b] = -1;
      v.h0++;
    }
    if (v.h0 > 0) {
      v.route.splice(0, v.h0);
      v.rs.splice(0, v.h0);
      v.h1 -= v.h0;
      v.h0 = 0;
    }
  }

  /** The edge vehicle v would take next from node: the next hop toward its pending goal, else the main line. */
  private nextEdge(v: VehRec, node: number): number {
    const goal = v.goals[v.gi];
    return goal !== undefined ? (this.g.next[node * this.g.n + goal] as number) : this.mainOut(node);
  }

  /**
   * When vehicle vi, blocked on edge e (block b) held by hi, should try again: when hi's tail has cleared b and,
   * while both would run on along the same edges with no goal of vi in reach, up to followLookaheadM beyond it.
   * A follower is then woken once per few metres of the leader's progress, not once per short block. Null when
   * hi's plan stops before clearing b (hi wakes its waiters when it replans).
   */
  private wakeTime(vi: number, hi: number, b: number, e: number): number | null {
    const g = this.g, h = this.S.vehicles[hi] as VehRec, v = this.S.vehicles[vi] as VehRec;
    let j = -1;
    for (let i = h.h0; i <= h.h1; i++) if (g.block[h.route[i] as number] === b) { j = i; break; }
    if (j < 0) return null;
    let jj = j;
    if (!((v.gs[0] ?? -1) >= 0) && g.to[h.route[j] as number] === g.to[e]) {
      let node = g.to[e] as number, run = 0;
      const goal = v.goals[v.gi];
      while (jj < h.h1 && run < this.cfg.vehicle.followLookaheadM) {
        const nh = h.route[jj + 1] as number;
        if (nh !== this.nextEdge(v, node) || (goal !== undefined && g.to[nh] === goal)) break;
        jj++;
        run += g.len[nh] as number;
        node = g.to[nh] as number;
      }
    }
    for (let k = jj; k >= j; k--) {
      const tr = timeAt(h.plan, (h.rs[k] as number) + (g.len[h.route[k] as number] as number) + this.half);
      if (tr !== null) return tr;
    }
    return null;
  }

  private precedes(u: VehRec, ui: number, vt: number, vm: number, vi: number): boolean {
    return u.wt < vt || (u.wt === vt && (u.wm > vm || (u.wm === vm && ui < vi)));
  }

  private tryTake(vi: number, e: number, t: number): boolean {
    const g = this.g, S = this.S, v = S.vehicles[vi] as VehRec, b = g.block[e] as number;
    const h = S.holder[b] as number;
    if (h === vi) return true;
    if (h >= 0) {
      this.prune(h, t);
      if ((S.holder[b] as number) >= 0) { this.registerWait(vi, b, e, t); return false; }
    }
    const vt = v.wb === b ? v.wt : t, vm = g.main[e] as number;
    for (let ui = 0; ui < S.vehicles.length; ui++) {
      const u = S.vehicles[ui] as VehRec;
      if (ui === vi || !u.alive || u.wb !== b) continue;
      if (this.precedes(u, ui, vt, vm, vi)) { this.registerWait(vi, b, e, t); return false; }
    }
    S.holder[b] = vi;
    if (v.wb === b) this.endWait(v);
    return true;
  }

  /** Records that vehicle vi waits for block b (needed by edge e). The wait keeps its first time for priority. */
  private registerWait(vi: number, b: number, e: number, t: number): void {
    const v = this.S.vehicles[vi] as VehRec;
    if (v.wb !== b) {
      if (v.wb >= 0) this.dropWait(vi, t);
      v.wb = b; v.wt = t; v.wm = this.g.main[e] as number;
      v.wtok++; v.wk = -1;
    }
    v.we = e;
  }

  /** Ends a wait: wakes already scheduled for it become stale. */
  private endWait(v: VehRec): void {
    v.wb = -1; v.wtok++; v.wk = -1;
  }

  /** Withdraws vehicle vi's wait (and its priority), waking vehicles that yielded to it for a free block. */
  private dropWait(vi: number, t: number): void {
    const S = this.S, v = S.vehicles[vi] as VehRec, b = v.wb;
    this.endWait(v);
    if (b < 0 || (S.holder[b] as number) >= 0) return;
    S.vehicles.forEach((w, wi) => {
      if (wi !== vi && w.alive && w.wb === b && this.stoppingOrStopped(w, t)) this.wakeAt(wi, t);
    });
  }

  /** True when the vehicle has no pending check before braking: it is braking or stopped. */
  private stoppingOrStopped(v: VehRec, t: number): boolean {
    const b = brakeStart(v.plan);
    return b === null || Math.floor(b) <= t;
  }

  private wakeAt(vi: number, at: number): void {
    const v = this.S.vehicles[vi] as VehRec;
    if (v.wk >= 0 && v.wk <= at) return;
    v.wk = at;
    this.at(at, 'vWake', vi, v.wtok);
  }

  /** A blocked vehicle that is braking or stopped wakes when the holder is expected to have cleared the block
   *  (and the lookahead); a free block it yields for is handed on by the vehicle that takes it. */
  private armWake(vi: number, t: number): void {
    const v = this.S.vehicles[vi] as VehRec, h = this.S.holder[v.wb] as number;
    if (h < 0) return;
    const tr = this.wakeTime(vi, h, v.wb, v.we);
    if (tr !== null) this.wakeAt(vi, Math.max(t + 1, Math.ceil(tr)));
  }

  /** After vehicle hi's plan or holdings change, wake the braking or stopped vehicles waiting on a block it holds
   *  or has freed. Waiters still cruising have a check pending before they must brake. */
  private wakeWaiters(hi: number, t: number): void {
    const S = this.S;
    for (let wi = 0; wi < S.vehicles.length; wi++) {
      const w = S.vehicles[wi] as VehRec;
      if (wi === hi || !w.alive || w.wb < 0 || !this.stoppingOrStopped(w, t)) continue;
      const h = S.holder[w.wb] as number;
      if (h === hi) {
        const tr = this.wakeTime(wi, hi, w.wb, w.we);
        if (tr !== null) this.wakeAt(wi, Math.max(t, Math.ceil(tr)));
      } else if (h < 0) this.wakeAt(wi, t);
    }
  }

  private limitFor(v: VehRec, e: number): number {
    const lim = this.g.limit[e] as number;
    return !v.syn && v.st === 'IDLE' && this.g.spine[e] ? Math.min(lim, this.cfg.vehicle.idleSpineMps) : lim;
  }

  /** First route index whose edge ends at or after s: the edge the vehicle is on, or the one ending exactly at it. */
  private scanStart(v: VehRec, s: number): number {
    let i = 0;
    while (i + 1 < v.route.length && (v.rs[i] as number) + (this.g.len[v.route[i] as number] as number) < s - 1e-9) i++;
    return i;
  }

  /** Keeps only the route the vehicle can no longer leave (to its stopping point plus the gap) and releases the
   *  blocks beyond it. Returns the position, speed and last kept index. */
  private truncate(vi: number, t: number): { s: number; vel: number; k: number } {
    const g = this.g, S = this.S, v = S.vehicles[vi] as VehRec;
    this.prune(vi, t);
    const now = evalPlan(v.plan, t, v.rest);
    const s = now.s, vel = Math.max(0, now.v);
    const k = this.commitIndex(v, s, vel);
    for (let i = k + 1; i <= v.h1; i++) {
      const b = g.block[v.route[i] as number] as number;
      if (S.holder[b] === vi) S.holder[b] = -1;
    }
    v.route.length = k + 1;
    v.rs.length = k + 1;
    if (v.h1 > k) v.h1 = k;
    return { s, vel, k };
  }

  /** Changes the vehicle's goals: keeps the route it can no longer leave, releases the rest and replans. */
  private retarget(vi: number, t: number, goals: number[]): void {
    const g = this.g, v = this.S.vehicles[vi] as VehRec;
    const { s, vel, k } = this.truncate(vi, t);
    v.goals = goals.slice();
    v.gs = goals.map(() => -1);
    v.gi = 0;
    const dec = this.cfg.vehicle.decel;
    for (let i = this.scanStart(v, s); i <= k && v.gi < goals.length; i++) {
      const e = v.route[i] as number, endS = (v.rs[i] as number) + (g.len[e] as number);
      if (g.to[e] === goals[v.gi] && endS - s >= stopDistance(vel, dec) - 1e-9) { v.gs[v.gi] = endS; v.gi++; }
    }
    this.dropWait(vi, t);
    this.extendAndPlan(vi, t, true);
  }

  /** Reserves blocks ahead, then plans a stop at the goal or at the authority limit. */
  private extendAndPlan(vi: number, t: number, force: boolean): void {
    const S = this.S, v = S.vehicles[vi] as VehRec, cv = this.cfg.vehicle;
    this.prune(vi, t);
    const now = evalPlan(v.plan, t, v.rest);
    const s = now.s, vel = Math.max(0, now.v);
    const idle = !v.syn && v.st === 'IDLE';
    const chunk = idle ? cv.idleAuthorityChunkM : cv.authorityChunkM;
    const need = s + this.half + stopDistance(idle ? cv.idleSpineMps : this.vmax, cv.decel) + this.gap + chunk;
    let gained = 0, blocked = false;
    for (;;) {
      const A = this.authEnd(v);
      const goalS = v.gs[0] ?? -1;
      if (goalS >= 0 && A >= goalS + this.half + this.gap) break;
      if (A >= need) break;
      if (v.h1 + 1 >= v.route.length) this.appendEdge(v);
      const e = v.route[v.h1 + 1] as number;
      if (!this.tryTake(vi, e, t)) { blocked = true; break; }
      v.h1++;
      gained++;
    }
    if (!blocked && v.wb >= 0) this.dropWait(vi, t);
    if (gained === 0 && !force) {
      // Nothing new: keep the plan; check again before braking, or wake when the holder clears. A plan that
      // stops short of what the authority now allows (and is not arriving) is replaced.
      if (blocked) {
        const b = brakeStart(v.plan);
        if (b !== null && Math.floor(b) > t) this.at(Math.floor(b), 'vCheck', vi, v.ver);
        else this.armWake(vi, t);
        return;
      }
      const limit = this.authEnd(v) - this.half - this.gap, goalS = v.gs[0] ?? -1;
      const target = goalS >= 0 && goalS <= limit + 1e-9 ? goalS : limit;
      if (planEnd(v.plan, t, v.rest).s >= target - 1e-3) return;
    }
    this.plan(vi, t, s, vel, blocked);
  }

  private plan(vi: number, t: number, s: number, vel: number, blocked: boolean): void {
    const g = this.g, S = this.S, v = S.vehicles[vi] as VehRec, cv = this.cfg.vehicle;
    let stop = this.authEnd(v) - this.half - this.gap;
    const goalS = v.gs[0] ?? -1;
    let arriving = false;
    if (goalS >= 0 && goalS <= stop + 1e-9) { stop = goalS; arriving = true; }
    if (stop < s) stop = s;
    const segs: Segment[] = [];
    let i = this.refIndex(v, s), pos = s;
    while (pos < stop - 1e-9 && i < v.route.length) {
      const e = v.route[i] as number;
      const end = Math.min((v.rs[i] as number) + (g.len[e] as number), stop);
      if (end > pos) {
        const lim = this.limitFor(v, e), last = segs[segs.length - 1];
        if (last && last.lim === lim) last.len += end - pos;
        else segs.push({ len: end - pos, lim });
        pos = end;
      }
      i++;
    }
    const { pieces, emergency } = planStop(t, s, vel, segs, cv.accel, cv.decel);
    if (emergency) S.stats.emergencyStops++;
    v.plan = pieces;
    v.rest = pieces.length > 0 ? planEnd(pieces, t, s).s : s;
    v.ver++;
    if (arriving) this.at(Math.ceil(planEnd(pieces, t, s).t), 'vArrive', vi, v.ver);
    else {
      // Re-check for more authority just before braking; a blocked vehicle also has its wake.
      const b = brakeStart(pieces);
      if (!blocked) this.at(b === null ? t + 1000 : Math.max(t + 1, Math.floor(b)), 'vCheck', vi, v.ver);
      else if (b !== null && Math.floor(b) > t) this.at(Math.floor(b), 'vCheck', vi, v.ver);
      else this.armWake(vi, t);
    }
    this.wakeWaiters(vi, t);
  }

  private handoffTiming(pi: number): HandoffTiming {
    return (this.places[pi] as PlaceInfo).kind === 'uts' ? this.cfg.vehicle.utsHandoff : this.cfg.vehicle.handoff;
  }

  private onArrive(vi: number, t: number): void {
    const S = this.S, v = S.vehicles[vi] as VehRec, job = v.job as JobRec;
    const pick = v.st === 'TO_PICKUP';
    const pi = pick ? job.from : job.to, info = this.places[pi] as PlaceInfo;
    const tm = this.handoffTiming(pi), id = `vehicle-${vi + 1}`;
    v.plan = [];
    v.st = pick ? 'HANDOFF_PICK' : 'HANDOFF_DROP';
    v.ho = { kind: pick ? 'pick' : 'drop', place: pi, t0: t };
    if (info.kind !== 'uts') this.setPlace(pi, pick ? 'UNLOADING' : 'LOADING', t);
    this.clip(t + tm.e84Ms, id, 'HoistDown');
    this.clip(t + tm.e84Ms + tm.hoistDownMs, id, pick ? 'GripClose' : 'GripOpen');
    this.clip(t + tm.e84Ms + tm.hoistDownMs + tm.gripMs, id, 'HoistUp');
    this.at(t + tm.totalMs, 'vHand', vi, v.ver);
  }

  private onHandoffDone(vi: number, t: number): void {
    const S = this.S, v = S.vehicles[vi] as VehRec, job = v.job as JobRec, ho = v.ho as { kind: 'pick' | 'drop'; place: number };
    const pi = ho.place, info = this.places[pi] as PlaceInfo, P = S.places[pi] as PlaceRec, lot = this.lot(job.lot);
    v.ho = null;
    if (ho.kind === 'pick') {
      lot.loc = 'vehicle'; lot.li = vi;
      if (lot.st !== 'COMPLETE') lot.st = 'IN_TRANSIT';
      v.lot = lot.id;
      P.lot = -1; P.res = -1; P.out = false;
      this.setPlace(pi, 'EMPTY', t);
      v.st = 'TO_DROP';
      v.goals.shift(); v.gs.shift(); v.gi = Math.max(0, v.gi - 1);
      if (info.kind === 'load') this.loadPortFreed(pi, t);
      else if (info.kind === 'stocker') this.stockerPortFreed(pi, t);
      this.extendAndPlan(vi, t, true);
      return;
    }
    // Drop.
    v.lot = -1;
    lot.loc = 'place'; lot.li = pi; lot.dest = -1;
    P.lot = lot.id; P.res = -1; P.out = false;
    S.stats.moves++;
    if (info.kind === 'load') {
      this.setPlace(pi, 'DOCKING', t);
      this.clip(t, info.id, 'Dock');
      this.at(t + this.cfg.ports.dockMs, 'place', pi);
    } else if (info.kind === 'uts') {
      this.setPlace(pi, 'OCCUPIED', t);
      lot.st = 'QUEUED';
      if (lot.tool >= 0) this.callForward(lot.tool, t);
    } else {
      this.setPlace(pi, 'PASS_IN', t);
      this.at(t + this.cfg.stocker.passThroughMs, 'pass', pi);
    }
    v.st = 'IDLE'; v.job = null; v.goals = []; v.gs = []; v.gi = 0;
    if (v.bs >= 0) { v.busy += t - v.bs; v.bs = -1; }
    this.dispatchVehicles(t);
    if (v.st === 'IDLE') this.extendAndPlan(vi, t, true);
  }

  // ---------------------------------------------------------------- modes (megafab synthetic traffic)

  setMode(mode: FabMode): void {
    const S = this.S, t = S.t;
    if (S.mode === mode) return;
    S.mode = mode;
    if (mode === 'megafab') {
      // Shrink every reservation to what its vehicle can no longer leave, then place the synthetic vehicles evenly
      // around the spine loop (one draw of the synthetic stream sets the phase), each at the first free spot at or
      // after its slot (searching on round the loop when pilot traffic fills the slot, so the configured count is
      // placed whenever the loop has room), then replan everyone.
      const mf = this.cfg.modes.megafab;
      const pilots = S.vehicles.filter(v => v.alive && !v.syn).length;
      const want = Math.max(0, Math.min(mf.synthetic, mf.syntheticCap, mf.maxVehicles - pilots));
      S.vehicles.forEach((v, vi) => { if (v.alive && !v.ho) this.truncate(vi, t); });
      const loopLen = this.spineLoop.reduce((sum, e) => sum + (this.g.len[e] as number), 0);
      const start = drawUniform(S.rng, S.seed, 'synthetic') * loopLen;
      const slot = loopLen / Math.max(1, want);
      for (let k = 0; k < want; k++) {
        for (let off = 0; off < loopLen; off += 0.25) {
          const d = start + k * slot + off;
          if (!this.placeVehicle(-1, d, loopLen)) continue;
          this.placeVehicle(this.newVehicle(true), d, loopLen);
          break;
        }
      }
      S.vehicles.forEach((v, vi) => { if (v.alive && !v.ho) { this.dropWait(vi, t); this.extendAndPlan(vi, t, true); } });
      return;
    }
    S.vehicles.forEach((v, vi) => {
      if (!v.alive || !v.syn) return;
      for (let i = v.h0; i <= v.h1; i++) {
        const b = this.g.block[v.route[i] as number] as number;
        if (S.holder[b] === vi) S.holder[b] = -1;
      }
      v.alive = false; v.ver++; v.wtok++; v.wb = -1; v.plan = []; v.route = []; v.rs = []; v.h1 = -1;
    });
    S.vehicles.forEach((w, wi) => { if (w.alive && w.wb >= 0 && (S.holder[w.wb] as number) < 0) this.wakeAt(wi, t); });
  }

  // ---------------------------------------------------------------- hash, stats, snapshot

  private onHash(t: number): void {
    const S = this.S;
    this.at(t + this.cfg.clock.hashIntervalMs, 'hash');
    S.hashes.push(this.hash(t));
    let busy = 0;
    for (const v of S.vehicles) if (v.alive && !v.syn) busy += v.busy + (v.bs >= 0 ? t - v.bs : 0);
    S.stats.hourly.push({ t, wip: S.lots.length, moves: S.stats.moves, busyMs: busy, shipped: S.stats.shipped });
  }

  /** FNV-1a (32-bit, hex) of the canonical serialisation of the integer state at time t. */
  hash(t: number = this.S.t): string {
    const S = this.S, parts: string[] = [`t${t}`];
    if (this.cfg.floorTransport?.enabled) parts.push(`F${JSON.stringify(S.floor)}`);
    const lots = [...S.lots].sort((a, b) => a.id - b.id);
    for (const l of lots) parts.push(`L${l.id},${l.cls},${l.step},${l.st},${l.loc},${l.li},${l.slot},${l.tool},${l.dest},${l.qt}`);
    S.places.forEach((p, i) => parts.push(`P${i},${p.st},${p.lot},${p.res},${p.t0}`));
    S.vehicles.forEach((v, i) => {
      if (!v.alive) { parts.push(`V${i},dead`); return; }
      const { s } = evalPlan(v.plan, t, v.rest);
      const ri = this.refIndex(v, s);
      parts.push(`V${i},${v.st},${v.lot},${v.job ? v.job.id : -1},${v.wb},${v.route[ri] ?? -1},${Math.round((s - (v.rs[ri] ?? 0)) * 1000)},${v.goals.join('/')}`);
    });
    S.stockers.forEach((st, i) => parts.push(`C${i},${st.cur ? `${st.cur.kind}:${st.cur.lot}` : '-'},${st.jobs.length},${st.slots.filter(x => x >= 0).length}`));
    S.tools.forEach((T, i) => parts.push(`T${i},${T.st},${T.t0},${T.lot},${T.end},${T.left},${T.assigned.length},${T.ready.join('/')},${T.batch.join('/')},${T.failT}`));
    for (const ev of heapSorted(S.queue)) parts.push(`Q${ev.t},${ev.s},${ev.k},${ev.a},${ev.b}`);
    for (const name of Object.keys(S.rng).sort()) parts.push(`R${name},${S.rng[name] as number}`);
    return fnv1a(parts.join(';')).toString(16).padStart(8, '0');
  }

  snapshot(): string {
    return JSON.stringify(this.S);
  }

  restore(json: string): void {
    const S = JSON.parse(json) as SimStateJson;
    if (S.version !== 1) throw new Error(`unsupported snapshot version ${String(S.version)}`);
    // Legacy snapshots remain loadable for a documented transition run; the final FF3 warm start is regenerated.
    S.floor ??= emptyFloorState(this.data.layout.floorRobots.stations.length, this.stockerInfo.length);
    if (!S.floor.docks) {
      S.floor.docks = this.stockerInfo.map(() => -1);
      const active = S.floor.active;
      if (active && (active.direction === 'deliver' ? ['WAIT_STOCKER', 'TO_PICKUP', 'PICK'].includes(active.phase)
        : active.phase !== 'RETURN' || S.stockers[active.stocker]!.manual.includes(active.lot))) S.floor.docks[active.stocker] = active.lot;
    }
    this.S = S;
    this.lotMap = new Map(S.lots.map(l => [l.id, l]));
    this.log = [];
  }

  setRule(rule: DispatchRule): void { this.S.rule = rule; }

  injectDown(toolId: string, atMs: number, durationMs: number): void {
    const ri = this.resIndex.get(toolId) ?? this.res.findIndex(r => r.members.includes(toolId));
    if (ri < 0) throw new Error(`unknown tool ${toolId}`);
    this.at(atMs, 'inject', ri, Math.max(1, Math.round(durationMs)));
  }

  clipEvents(sinceMs: number): ClipEvent[] { return this.log.filter(e => e.t >= sinceMs); }

  kpis(): FabKpis {
    const S = this.S, t = S.t;
    const dayStart = Math.floor(t / DAY_MS) * DAY_MS;
    const recent = S.stats.ships.filter(([st]) => st > t - 30 * DAY_MS);
    const ct = recent.length ? recent.reduce((sum, [st, rel]) => sum + (st - rel), 0) / recent.length / DAY_MS : 0;
    const hours = S.stats.hourly;
    const back = hours.length >= 25 ? (hours[hours.length - 25] as HourRec) : null;
    const lastH = hours[hours.length - 1];
    const movesPerHour = back && lastH ? (lastH.moves - back.moves) / 24 : 0;
    const counts: Record<string, number> = {};
    for (const st of E10_STATES) counts[st] = 0;
    for (const T of S.tools) counts[T.st] = (counts[T.st] ?? 0) + 1;
    const shares: Record<string, number> = {};
    for (const st of E10_STATES) shares[st] = (counts[st] as number) / S.tools.length;
    let busy = 0, total = 0;
    for (const v of S.vehicles) if (v.alive && !v.syn) { total++; if (v.st !== 'IDLE') busy++; }
    return {
      wipLots: S.lots.length,
      lotsOutToday: S.stats.ships.filter(([st]) => st >= dayStart).length,
      cycleTimeDays: ct,
      xFactor: ct > 0 ? (ct * DAY_MS) / this.rawMs : 0,
      movesPerHour,
      toolStateShares: shares,
      vehiclesBusy: busy,
      vehiclesTotal: total,
      toolCounts: counts,
    };
  }

  // ---------------------------------------------------------------- read-only views for the scene and the API

  lotClass(id: number): LotClass { return LOT_CLASSES[this.lot(id).cls] as LotClass; }

  vehicleState(vi: number): VehicleState {
    const v = this.S.vehicles[vi] as VehRec;
    return v.wb >= 0 && v.st !== 'HANDOFF_PICK' && v.st !== 'HANDOFF_DROP' ? 'WAIT_BLOCK' : v.st;
  }

  /**
   * Writes vehicle vi's pose at render time t (fractional ms) into out: [x, y, z, hx, hz, speed, hoist, carrying].
   * y is the rail datum; hoist is the hoist extension in metres; carrying is 1 when the FOUP hangs from the hoist.
   * Pure: evaluates the stored plan in closed form and mutates nothing but `out`.
   */
  vehiclePose(vi: number, t: number, out: Float64Array): boolean {
    const v = this.S.vehicles[vi] as VehRec;
    if (!v.alive || v.route.length === 0) return false;
    const { s, v: vel } = evalPlan(v.plan, t, v.rest);
    let i = 0;
    while (i + 1 < v.route.length && (v.rs[i + 1] as number) <= s) i++;
    edgePoint(this.g, v.route[i] as number, s - (v.rs[i] as number), out);
    out[4] = out[5] as number;
    out[5] = Math.max(0, vel);
    let hoist = 0, carrying = v.lot !== -1 ? 1 : 0;
    if (v.ho) {
      const tm = this.handoffTiming(v.ho.place), h = (this.places[v.ho.place] as PlaceInfo).hoistM;
      const local = t - v.ho.t0, down0 = tm.e84Ms, down1 = down0 + tm.hoistDownMs, grip1 = down1 + tm.gripMs, up1 = grip1 + tm.hoistUpMs;
      if (local <= down0) hoist = 0;
      else if (local < down1) hoist = (h * (local - down0)) / tm.hoistDownMs;
      else if (local < grip1) hoist = h;
      else if (local < up1) hoist = h * (1 - (local - grip1) / tm.hoistUpMs);
      carrying = v.ho.kind === 'pick' ? (local >= grip1 ? 1 : 0) : local < down1 + tm.gripMs / 2 ? 1 : 0;
    }
    out[6] = hoist;
    out[7] = carrying;
    return true;
  }

  /** Stocker crane position (local z, y) at render time t. */
  cranePose(si: number, t: number): [number, number, boolean] {
    const c = (this.S.stockers[si] as StockerRec).crane;
    for (const seg of c.segs) {
      if (t < seg.t0) return [seg.z0, seg.y0, false];
      if (t <= seg.t1) {
        const f = seg.t1 > seg.t0 ? (t - seg.t0) / (seg.t1 - seg.t0) : 1;
        return [seg.z0 + (seg.z1 - seg.z0) * f, seg.y0 + (seg.y1 - seg.y0) * f, seg.fork];
      }
    }
    return [c.z, c.y, false];
  }

  placeInfo(pi: number): PlaceInfo { return this.places[pi] as PlaceInfo; }
  placeState(pi: number): PlaceRec { return this.S.places[pi] as PlaceRec; }
  resourceInfo(ri: number): ResInfo { return this.res[ri] as ResInfo; }
  toolState(ri: number): E10State { return (this.S.tools[ri] as ToolRec).st; }
  toolSince(ri: number): number { return (this.S.tools[ri] as ToolRec).t0; }
  lots(): readonly LotRec[] { return this.S.lots; }
  stockerSeat(si: number): { manual: readonly number[] } { return { manual: (this.S.stockers[si] as StockerRec).manual }; }

  // ---------------------------------------------------------------- read-only views (the HUD's panels, TASK-FF2 item 4)

  /** Resource ri (a litho cell or a tool) as the HUD's tool panel shows it; copies, so the caller cannot change state. */
  toolView(ri: number): ToolView {
    const r = this.res[ri] as ResInfo, T = this.S.tools[ri] as ToolRec;
    const processing = T.batch.length > 0 ? [...T.batch] : T.lot >= 0 ? [T.lot] : [];
    return {
      id: r.id, group: r.group, members: [...r.members], batch: r.batch, scheduled: r.scheduled, state: T.st, since: T.t0,
      queued: T.assigned.length, ready: T.ready.length, processing, endsAt: processing.length > 0 ? T.end : -1, done: T.done.length,
      downUntil: T.st === 'SCHEDULED_DOWN' || T.st === 'UNSCHEDULED_DOWN' || T.st === 'ENGINEERING' ? T.downUntil : -1,
      ports: r.ports.map(pi => this.portView(pi)),
    };
  }

  /** Stocker si as the HUD's stocker panel shows it. */
  stockerView(si: number): StockerView {
    const info = this.stockerInfo[si] as StockerInfo, st = this.S.stockers[si] as StockerRec;
    let used = 0;
    for (const id of st.slots) if (id !== -1) used++;
    return {
      id: info.id, used, usable: info.usable.filter(Boolean).length, crane: st.crane.st, jobs: st.jobs.length + (st.cur ? 1 : 0),
      manual: st.manual.length, waiting: st.waitPort.length, ports: info.ports.map(pi => this.portView(pi)),
    };
  }

  /** Lot id as the HUD follows it, or null once it has shipped (or never existed). */
  lotView(id: number): LotView | null {
    const lot = this.lotMap.get(id);
    if (!lot) return null;
    const steps = this.routeGroup.length;
    const at = lot.loc === 'place' ? (this.places[lot.li] as PlaceInfo).id
      : lot.loc === 'vehicle' ? `vehicle-${lot.li + 1}`
      : lot.loc === 'floor' ? `floor-${this.S.floor.active?.carrier ?? 'carrier'}-${this.S.floor.active?.station ?? lot.li}`
      : lot.loc === 'buffer' ? (this.res[lot.li] as ResInfo).id
      : (this.stockerInfo[lot.li] as StockerInfo).id;
    return {
      id, lotClass: LOT_CLASSES[lot.cls] as LotClass, step: lot.step, steps, state: lot.st, released: lot.rel,
      group: lot.step < steps ? (this.routeGroup[lot.step] as string) : null, tool: lot.tool >= 0 ? (this.res[lot.tool] as ResInfo).id : null,
      loc: lot.loc, at, placeKind: lot.loc === 'place' ? (this.places[lot.li] as PlaceInfo).kind : null,
      vehicle: lot.loc === 'vehicle' ? lot.li : -1, dest: lot.dest >= 0 ? (this.places[lot.dest] as PlaceInfo).id : null, ship: lot.ship,
    };
  }

  private portView(pi: number): PortView {
    const P = this.S.places[pi] as PlaceRec;
    return { id: (this.places[pi] as PlaceInfo).id, state: P.st, lot: P.lot >= 0 ? P.lot : -1, reservedFor: P.res >= 0 ? P.res : -1 };
  }
}

export interface PortView { id: string; state: PlaceState; lot: number; reservedFor: number }
export interface ToolView {
  id: string; group: string; members: string[]; batch: boolean; scheduled: boolean; state: E10State; since: number;
  /** Lots dispatched here that have not started: on their way, stored, or waiting at a port. */
  queued: number;
  /** Lots at an open port (or in the furnace's buffer) ready to start. */
  ready: number;
  /** The lot processing now, or a furnace batch. */
  processing: number[];
  /** When the current lot or batch finishes (-1 when none). */
  endsAt: number;
  /** Furnace lots done and waiting to leave. */
  done: number;
  /** The planned end of a repair, PM or engineering hold (-1 otherwise). */
  downUntil: number;
  ports: PortView[];
}
export interface StockerView {
  id: string; used: number; usable: number; crane: 'IDLE' | 'MOVING' | 'FORK';
  /** Crane jobs queued or running. */
  jobs: number;
  /** Lots at the manual port (released, or waiting to ship). */
  manual: number;
  /** Lots waiting for a free OHT port. */
  waiting: number;
  ports: PortView[];
}
export interface LotView {
  id: number; lotClass: LotClass; step: number; steps: number; state: LotState; released: number;
  /** The route group of the current step (null once complete). */
  group: string | null;
  /** The resource the lot is dispatched to or processing at. */
  tool: string | null;
  loc: 'place' | 'vehicle' | 'floor' | 'slot' | 'crane' | 'buffer' | 'manual';
  /** Where it is: the place (port or seat), the vehicle, the furnace (buffer) or the stocker (slot, crane, manual port). */
  at: string;
  placeKind: PlaceKind | null;
  vehicle: number;
  /** The place a move is reserved to, or null. */
  dest: string | null;
  ship: boolean;
}
