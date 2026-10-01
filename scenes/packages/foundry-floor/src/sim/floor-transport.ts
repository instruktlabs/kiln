// SPDX-License-Identifier: MIT
// Floor-carrier state is plain JSON. One shared aisle authority covers the narrow stocker canyon and bay
// approaches; waiting carriers remain at their individual docks. These are synthetic design assumptions.
import type { FabData, Vec3 } from './data';

export type FloorPhase = 'WAIT_STOCKER' | 'TO_PICKUP' | 'PICK' | 'TO_DROP' | 'DROP' | 'RETURN';
export interface FloorJob {
  id: number; lot: number; station: number; stocker: number; direction: 'deliver' | 'collect';
  carrier: 'amr'; requestedAt: number; hot: boolean;
}
export interface FloorActive extends FloorJob { phase: FloorPhase; t0: number; t1: number; carrying: boolean }
export interface FloorState {
  nextId: number; queue: FloorJob[]; active: FloorActive | null;
  /** One transfer seat per stocker. A reservation is capacity, never a second FOUP owner. */
  docks: number[];
  delivered: number; collected: number; completedByStation: number[]; completedByCarrier: { amr: number };
}
export interface FloorConfig {
  enabled: boolean; speedMps: number;
  pickupMs: number; dropMs: number;
}
export interface FloorRoute { points: Vec3[]; lengthM: number; startYaw: number; endYaw: number }

export function emptyFloorState(stations: number, stockers: number): FloorState {
  return { nextId: 1, queue: [], active: null, docks: Array.from({ length: stockers }, () => -1), delivered: 0, collected: 0,
    completedByStation: Array.from({ length: stations }, () => 0), completedByCarrier: { amr: 0 } };
}

/** Transfer extensions put the arm seat outside the stocker envelope; each stocker has a staggered dock. */
export function floorStockerDock(data: FabData, stocker: number): { seat: Vec3; arm: Vec3; dock: Vec3; yaw: number } {
  const s = data.layout.stockers[stocker]!;
  const east = s.position[0] > 0;
  const z = s.manualPort.seat[2] + (east ? -3 : 3);
  return { seat: [east ? 0.95 : -0.95, 0.9, z], arm: [east ? 0.3 : -0.3, 0, z],
    dock: [east ? 0.07 : -0.07, 0, z + (east ? -0.65 : 0.65)], yaw: east ? 0 : 180 };
}

/** The configured stocker dock to a station dock, along the canyon, spine and the station's bay aisle. */
export function floorRoute(data: FabData, station: number, stocker: number): FloorRoute {
  const target = data.layout.floorRobots.stations[station]!;
  const tool = data.layout.tools.find(t => t.id === target.tool)!;
  const bay = data.layout.bays.find(b => b.id === tool.bay)!;
  const dock = floorStockerDock(data, stocker).dock;
  const start: Vec3[] = dock[2] > 10.2
    ? [dock, [0.95, 0, dock[2]], [0.95, 0, 11.1], [0, 0, 11.1], [0, 0, 9.2], [-0.95, 0, 9.2], [-0.95, 0, 5.8], [0, 0, 5.8]]
    : [dock, [-0.8, 0, dock[2]], [-0.8, 0, 5.8], [0, 0, 5.8]];
  const aisleX = bay.xc + Math.sign(target.amr.position[0] - bay.xc) * 0.4;
  const points: Vec3[] = [...start, [0, 0, 0], [aisleX, 0, 0], [aisleX, 0, target.amr.position[2]], [...target.amr.position]];
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[2] - points[i - 1]![2]) > 1e-9);
  const lengthM = clean.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - clean[i]![0], p[2] - clean[i]![2]), 0);
  return { points: clean, lengthM, startYaw: floorStockerDock(data, stocker).yaw * Math.PI / 180, endYaw: target.amr.yaw * Math.PI / 180 };
}

/** The stocker canyon's visitor route bends around the new transfer docks; all other authored paths remain. */
export function floorWalkPaths(data: FabData): FabData['layout']['cameras']['walk']['paths'] {
  const paths = data.layout.cameras.walk.paths;
  if (!data.config.floorTransport?.enabled) return paths;
  return paths.flatMap(path => {
    if (path.id !== 'aisle-S3') return [path];
    const points: [number, number][] = [path.from, [0, 5.8], [-0.95, 5.8], [-0.95, 9.2], [0, 9.2], [0, 11.1], [0.95, 11.1], [0.95, 14.5], [0, 14.5], path.to];
    return points.slice(1).map((to, i) => ({ id: `${path.id}-${i + 1}`, from: points[i]!, to }));
  });
}

/** Position and yaw along a route. Path travel depends only on simulation time. */
export function floorRoutePose(route: FloorRoute, progress: number, reverse = false): { position: Vec3; yaw: number } {
  // AMRs can reverse along the same lane. Keeping the docking headings in both directions avoids a half-turn
  // under a loaded arm; corner rotations blend over distance and are checked against the full body envelope.
  if (reverse) return floorRoutePose(route, 1 - progress);
  const points = route.points;
  const angle = (i: number) => i === 1 ? route.startYaw : i === points.length - 1 ? route.endYaw
    : Math.atan2(-(points[i]![2] - points[i - 1]![2]), points[i]![0] - points[i - 1]![0]);
  const blend = (a: number, b: number, f: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
  let distance = Math.min(1, Math.max(0, progress)) * route.lengthM;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (distance <= length || i === points.length - 1) {
      const f = length ? Math.min(1, distance / length) : 1;
      const turn = Math.min(0.3, length / 2), middle = angle(i);
      const begin = i === 1 ? middle : blend(angle(i - 1), middle, 0.5);
      const end = i === points.length - 1 ? middle : blend(middle, angle(i + 1), 0.5);
      const yaw = distance < turn ? blend(begin, middle, distance / turn)
        : distance > length - turn ? blend(middle, end, (distance - length + turn) / turn) : middle;
      return { position: [a[0] + (b[0] - a[0]) * f, 0, a[2] + (b[2] - a[2]) * f], yaw };
    }
    distance -= length;
  }
  return { position: [...points[0]!], yaw: 0 };
}

export function floorCarrierPose(data: FabData, active: FloorActive, t: number): { position: Vec3; yaw: number } {
  const station = data.layout.floorRobots.stations[active.station]!;
  const stocker = floorStockerDock(data, active.stocker);
  const progress = (t - active.t0) / Math.max(1, active.t1 - active.t0);
  if (active.phase === 'TO_PICKUP' || active.phase === 'TO_DROP' || active.phase === 'RETURN') {
    const reverse = active.phase === 'TO_PICKUP' || (active.phase === 'TO_DROP' && active.direction === 'collect');
    return floorRoutePose(floorRoute(data, active.station, active.stocker), progress, reverse);
  }
  const atStocker = (active.phase === 'PICK' && active.direction === 'deliver') || (active.phase === 'DROP' && active.direction === 'collect');
  return atStocker ? { position: stocker.dock, yaw: stocker.yaw * Math.PI / 180 }
    : { position: [...station.amr.position], yaw: station.amr.yaw * Math.PI / 180 };
}

/** Default numeric pose; the GLB world replaces hand-off poses with the sampled grip locator of the actual arm. */
export function floorFoupPose(data: FabData, active: FloorActive, t: number): { position: Vec3; yaw: number } {
  const carrier = floorCarrierPose(data, active, t), [x, , z] = carrier.position;
  const offset = 0.23;
  const carried: Vec3 = [x + Math.cos(carrier.yaw) * offset, 1.15, z - Math.sin(carrier.yaw) * offset];
  if (active.phase !== 'PICK' && active.phase !== 'DROP') return { position: carried, yaw: carrier.yaw - Math.PI / 2 };
  const atStocker = (active.phase === 'PICK') === (active.direction === 'deliver');
  const seat = atStocker ? data.layout.stockers[active.stocker]!.manualPort.seat : data.layout.floorRobots.stations[active.station]!.handoff.seat;
  const progress = Math.min(1, Math.max(0, (t - active.t0) / Math.max(1, active.t1 - active.t0)));
  const f = active.phase === 'PICK' ? progress : 1 - progress;
  return { position: [seat[0] + (carried[0] - seat[0]) * f, seat[1] + (carried[1] - seat[1]) * f, seat[2] + (carried[2] - seat[2]) * f], yaw: carrier.yaw - Math.PI / 2 };
}
