// SPDX-License-Identifier: MIT
// Where every visible FOUP is at render time t, derived from the twin's state only (sim-spec 8: nothing is canned).
// Pure: no three, React or DOM, so bun tests can check that each lot is drawn once and in the right place.
//   on a vehicle       base at the carried height (heights.vehicleFoupBase), or on the hoist during a handoff;
//   at a place         on the seat (load port, UTS seat, stocker OHT port), sliding along the stocker pass-through;
//   on a stocker crane at the crane's fork; at a stocker manual port in a row along the counter;
//   in a stocker slot or inside a furnace: not drawn (behind the enclosure).
// Synthetic vehicles in megafab mode always carry one synthetic FOUP.
//
// Yaw is the FOUP asset's (+X is the door; three's rotation.y). The asset map's mount rule: a vehicle carries its FOUP
// turned -90 degrees from the direction of travel, so the door faces the vehicle's right, which is the side every
// load port, stocker port and UTS seat lies on (layout conventions.loadSide); a FOUP set down keeps that yaw, so at a
// load port the door faces the tool. On a stocker crane and at the manual counter the door faces into the stocker.
import type { FabData } from '../sim/data';
import type { FabSim } from '../sim/fab';
import { floorFoupPose } from '../sim/floor-transport';

export const FOUP_SYNTHETIC = 3;
/** One FOUP pose: lot id (-1 for synthetic), class (0 normal, 1 hot, 2 engineering, 3 synthetic), base position, yaw
 *  (radians) and where it is: the place index when it sits on a seat (else -1) and the vehicle index when a vehicle
 *  carries it or is handing it over (else -1). */
export interface FoupPose { lot: number; cls: number; x: number; y: number; z: number; yaw: number; place: number; vehicle: number }

export interface FoupPoseContext {
  sim: FabSim;
  data: FabData;
  /** Material world supplies the actual animated grip locator during floor transfers. */
  floorPose?: (t: number) => { position: [number, number, number]; yaw: number } | null;
  /** The carried FOUP base height (layout heights.vehicleFoupBase). */
  carriedBaseY: number;
  passThroughMs: number;
  /** Per stocker: world position, yaw (radians) with its sin and cos, the manual-port seat and the direction lots
   *  queue along the counter. */
  stockers: { position: [number, number, number]; yaw: number; sin: number; cos: number; manualSeat: [number, number, number]; row: [number, number] }[];
}

/** The FOUP yaw for a direction of travel (hx, hz): the door toward the right of travel. */
export const foupYawForHeading = (hx: number, hz: number): number => Math.atan2(-hz, hx) - Math.PI / 2;

/** The pose context for a fab laid out by `data`: lots at a stocker's manual port queue along the stocker's length. */
export function foupPoseContext(sim: FabSim, data: FabData): FoupPoseContext {
  return {
    sim, data, carriedBaseY: data.layout.heights.vehicleFoupBase as number, passThroughMs: data.config.stocker.passThroughMs,
    stockers: data.layout.stockers.map(st => {
      const yaw = (st.yaw * Math.PI) / 180, sin = Math.sin(yaw), cos = Math.cos(yaw), seat = st.manualPort.seat;
      return { position: [st.position[0], st.position[1], st.position[2]], yaw, sin, cos, manualSeat: [seat[0], seat[1], seat[2]], row: [sin, cos] };
    }),
  };
}

/** Fills `out` (reusing its objects) and returns the number of poses. `scratch` holds at least 8 numbers. */
export function foupPoses(ctx: FoupPoseContext, t: number, out: FoupPose[], scratch: Float64Array): number {
  const { sim, carriedBaseY } = ctx, S = sim.S;
  let n = 0;
  const push = (lot: number, cls: number, x: number, y: number, z: number, yaw: number, place: number, vehicle: number) => {
    const p = out[n] ?? (out[n] = { lot, cls, x, y, z, yaw, place, vehicle });
    p.lot = lot; p.cls = cls; p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.place = place; p.vehicle = vehicle;
    n++;
  };
  const byId = new Map<number, number>();
  for (const l of sim.lots()) byId.set(l.id, l.cls);
  const cls = (id: number) => byId.get(id) ?? 0;
  const drawn = new Set<number>();
  const floor = S.floor.active;
  if (floor && (floor.carrying || floor.phase === 'PICK')) {
    const pose = ctx.floorPose?.(t) ?? floorFoupPose(ctx.data, floor, t);
    push(floor.lot, cls(floor.lot), ...pose.position, pose.yaw, -1, -1);
    drawn.add(floor.lot);
  }
  const seatPose = (pi: number, lot: number, vehicle: number) => {
    const info = sim.placeInfo(pi), P = sim.placeState(pi);
    let [x, y, z] = info.seat;
    if (info.inner && (P.st === 'PASS_IN' || P.st === 'PASS_OUT' || P.st === 'WAIT_CRANE')) {
      const f = P.st === 'WAIT_CRANE' ? 1 : Math.min(1, Math.max(0, (t - P.t0) / ctx.passThroughMs));
      const k = P.st === 'PASS_OUT' ? 1 - f : f;
      x += (info.inner[0] - x) * k; y += (info.inner[1] - y) * k; z += (info.inner[2] - z) * k;
    }
    push(lot, cls(lot), x, y, z, foupYawForHeading(info.heading[0], info.heading[2]), pi, vehicle);
  };

  S.vehicles.forEach((v, vi) => {
    if (!v.alive || !sim.vehiclePose(vi, t, scratch)) return;
    const x = scratch[0] as number, z = scratch[2] as number, yaw = foupYawForHeading(scratch[3] as number, scratch[4] as number);
    const hoist = scratch[6] as number, carrying = scratch[7] === 1;
    if (v.syn) { push(-1, FOUP_SYNTHETIC, x, carriedBaseY, z, yaw, -1, vi); return; }
    const lot = v.ho ? (v.job?.lot ?? -1) : v.lot;
    if (lot < 0) return;
    drawn.add(lot);
    if (carrying) push(lot, cls(lot), x, carriedBaseY - hoist, z, yaw, -1, vi);
    else if (v.ho) seatPose(v.ho.place, lot, vi);
  });

  S.places.forEach((P, pi) => {
    if (P.lot < 0 || drawn.has(P.lot)) return;
    drawn.add(P.lot);
    seatPose(pi, P.lot, -1);
  });

  S.stockers.forEach((st, si) => {
    const s = ctx.stockers[si];
    if (!s) return;
    const [cz, cy] = sim.cranePose(si, t);
    for (const lot of sim.lots()) {
      if (lot.loc === 'crane' && lot.li === si && !drawn.has(lot.id)) {
        drawn.add(lot.id);
        push(lot.id, lot.cls, s.position[0] + s.sin * cz, cy, s.position[2] + s.cos * cz, s.yaw + Math.PI, -1, -1);
      }
    }
    const reserved = S.floor.docks[si] ?? -1;
    let buffered = reserved >= 0 ? 1 : 0;
    st.manual.forEach(id => {
      const k = id === reserved ? 0 : buffered++;
      if (drawn.has(id)) return;
      drawn.add(id);
      push(id, cls(id), s.manualSeat[0] + s.row[0] * 0.45 * k, s.manualSeat[1], s.manualSeat[2] + s.row[1] * 0.45 * k, s.yaw + Math.PI, -1, -1);
    });
  });
  return n;
}
