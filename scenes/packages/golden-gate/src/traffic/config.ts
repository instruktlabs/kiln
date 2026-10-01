// Traffic tables from data/traffic.json and the lanes of data/layout.json (D-21). Lanes run the whole
// route (./world/route): from one approach road's end over the deck to the other's, in route stations
// (fix round 2; before it they ran deck end to deck end). Class weights,
// paint palette and flow values follow the owner's traffic direction of 2026-09-29 12:45 and 12:58:
// the six approved vehicles, per-instance paint with many white, black, grey and silver cars, some
// blue and red, a few green and others, no two adjacent cars alike, and free-flowing lanes at about
// 20 m/s with natural spacing.
import { LANES, laneX } from '../constants';
import { LAYOUT, TRAFFIC_DATA } from '../data';
import type { LayoutLane } from '../data';
import type { TrafficDensity } from '../tiers';
import { newRoutePoint, routePoint, routeYaw } from '../world/route';
import type { Route, RoutePoint } from '../world/route';
import type { PaintEntry, VehicleClass } from './sim';
import type { VehicleType } from './vehicle-models';

/**
 * The lanes of one direction, inner to outer. The simulation mirrors the two directions, so the data
 * must too: same speeds and classes, mirrored positions, one common length (in route stations, from
 * the lane's first station to its last), indices 0-2 north and 3-5 south. Anything else is a data
 * error, reported here rather than simulated differently.
 */
function directionLanes(lanes: readonly LayoutLane[]): { lanes: LayoutLane[]; length: number } {
  const north = lanes.filter(l => l.direction === 'north'), south = lanes.filter(l => l.direction === 'south');
  if (north.length !== 3 || south.length !== 3) throw new Error('data/layout.json must define three lanes each way');
  const length = (lane: LayoutLane) => Math.abs(lane.stations[1] - lane.stations[0]), common = length(north[0]!);
  north.forEach((n, k) => {
    const s = south[k]!;
    if (n.index !== k || s.index !== k + 3 || n.speed !== s.speed || n.classes.join() !== s.classes.join() || Math.abs(n.x + s.x) > 1e-6
      || Math.abs(length(n) - common) > .01 || Math.abs(length(s) - common) > .01 || !(n.stations[1] > n.stations[0]) || !(s.stations[1] < s.stations[0])
      || Math.abs(n.stations[0] - s.stations[1]) > .01 || Math.abs(n.stations[1] - s.stations[0]) > .01)
      throw new Error(`data/layout.json lanes ${n.id} and ${s.id} are not mirror images with a common length`);
  });
  if (!(common > 0)) throw new Error('data/layout.json lanes have no length: run scripts/layout.ts --write');
  return { lanes: north, length: common };
}
const DIRECTION = directionLanes(LANES);
/**
 * Vehicles fade in and out over `fade` metres at the lane ends, which lie on the approach roads' ends:
 * the fade must fit inside both approaches' dissolve stretches (the road fading into the terrain), so
 * traffic never fades on the deck or on the solid road before it.
 */
function laneFade(): number {
  const room = Math.min(...(['south', 'north'] as const).map(name => { const [from, to] = LAYOUT.approaches[name].ends.dissolve; return to - from; }));
  if (!(TRAFFIC_DATA.fade > 0 && TRAFFIC_DATA.fade <= room + 1e-9)) throw new Error(`data/traffic.json fade ${TRAFFIC_DATA.fade} m must fit the approaches' dissolve stretches (${room} m)`);
  return TRAFFIC_DATA.fade;
}

/** Share of the fleet and the lanes (within a direction, 0 inner .. 2 outer) each vehicle may use. */
export const CLASS_TABLE = Object.fromEntries(Object.entries(TRAFFIC_DATA.vehicles).map(([type, vehicle]) =>
  [type, { weight: vehicle.weight, lanes: DIRECTION.lanes.flatMap((lane, k) => lane.classes.includes(type) ? [k] : []) }])) as unknown as Record<VehicleType, { weight: number; lanes: readonly number[] }>;

/** Paint colours (sRGB) and weights in percent. */
export const PALETTE: readonly PaintEntry[] = TRAFFIC_DATA.palette;

/** Mean time between vehicles entering one lane, per density (s). */
export const DENSITY_HEADWAY: Record<TrafficDensity, number> = TRAFFIC_DATA.densityHeadway;
export const TRAFFIC_FLOW = {
  /** Cruising speed per lane within a direction (m/s), inner to outer; the posted limit is about 20 m/s. */
  laneSpeeds: DIRECTION.lanes.map(lane => lane.speed) as [number, number, number],
  minHeadway: TRAFFIC_DATA.minHeadway,
  /** Each lane runs the whole route, south approach end to north approach end (route stations). */
  laneLength: DIRECTION.length,
  /** Vehicles fade in and out (dithered) over this length at both ends, inside the dissolve stretches. */
  fade: laneFade(),
  seed: TRAFFIC_DATA.seed,
} as const;
/** Route station (./world/route) of a point `s` metres along a lane from its entry; on the deck it is the scene Z. */
export function laneStation(lane: number, s: number): number { const l = LANES[lane]!; return l.stations[0] + (l.direction === 'north' ? s : -s); }
/**
 * Where a vehicle `s` metres along a lane stands: the road point at the lane's station and offset, its
 * yaw in the vehicle frame (local +X forward, which is (cos yaw, -sin yaw) in x, z) and its pitch with
 * the road's grade. Traffic draws with it; the test build's contact scan samples it.
 */
export function lanePose(route: Route, lane: number, s: number, point: RoutePoint = newRoutePoint()): { p: RoutePoint; yaw: number; pitch: number } {
  const dir = LANES[lane]!.direction === 'north' ? 1 : -1, p = routePoint(route, laneStation(lane, s), laneX(lane), point);
  return { p, yaw: routeYaw(p) + (dir < 0 ? Math.PI : 0) - Math.PI / 2, pitch: Math.atan(dir * p.grade) };
}

/** Vehicle classes for the simulation from the loaded model dimensions. */
export function trafficClasses(types: readonly VehicleType[], dims: (type: VehicleType) => { length: number; width: number; wheelRadius: number }): VehicleClass[] {
  return types.map(type => {
    const row = CLASS_TABLE[type];
    if (!row) throw new Error(`data/traffic.json has no vehicle ${type}`);
    return { name: type, length: dims(type).length, width: dims(type).width, radius: dims(type).wheelRadius, weight: row.weight, lanes: row.lanes };
  });
}
