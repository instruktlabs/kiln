// SPDX-License-Identifier: MIT
// Deterministic geometric trailer following. The lane controls the tractor; the trailer
// points from a rear path sample to the physical coupling, keeping the authored pins joined.
// This is a low-speed presentation model, not a tyre/suspension physics simulation.
import type { CampusLane } from '../data';
import { lanePoint, newLanePoint } from '../roads';
import type { VehicleModel } from './vehicles';
import type { FlowData } from '../drive/driving';
import type { VehicleClass } from '../drive/traffic-sim';

export const FREIGHT_TYPES = ['truck-tractor', 'trailer-dryvan', 'trailer-flatbed', 'trailer-tanker', 'van-delivery'] as const;
export type FreightType = typeof FREIGHT_TYPES[number];
export const freightModelId = (type: FreightType): string => `freight-${type}`;
export function freightWheels(type: FreightType): readonly string[] {
  const rear = ['Wheel_RL', 'Wheel_RR', 'Wheel_RL2', 'Wheel_RR2'];
  return type === 'truck-tractor' ? ['Wheel_FL', 'Wheel_FR', ...rear] : type.startsWith('trailer-') ? rear : ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
}
export interface FreightCoupling {
  tractor: string; trailer: string; length: number; width: number;
  /** Model-origin offset from the whole articulated vehicle's straight footprint centre. */
  tractorOffset: number;
  fifthWheel: readonly [number, number, number]; kingpin: readonly [number, number, number];
  axleDistance: number; trailerSpinScale: number;
}
export interface FreightPose { x: number; y: number; z: number; heading: number }
export interface ArticulatedFreight { tractor: FreightPose; trailer: FreightPose }

export function freightFleet(models: ReadonlyMap<string, VehicleModel>, rows: NonNullable<FlowData['freight']>) {
  const classes: VehicleClass[] = [], couplings = new Map<string, FreightCoupling>();
  for (const row of rows) {
    const tractor = models.get(row.tractor), trailer = row.trailer ? models.get(row.trailer) : undefined;
    if (!tractor || (row.trailer && !trailer)) throw new Error(`Freight class ${row.name} is missing a pinned model`);
    const coupling = trailer ? createFreightCoupling(tractor, trailer) : undefined;
    if (coupling) couplings.set(row.name, coupling);
    classes.push({ name: row.name, length: coupling?.length ?? tractor.length, width: coupling?.width ?? tractor.width,
      radius: tractor.wheelRadius, weight: row.weight, lanes: row.lanes });
  }
  return { classes, couplings };
}

export function createFreightCoupling(tractor: VehicleModel, trailer: VehicleModel): FreightCoupling {
  const fifthWheel = tractor.locators.FifthWheel, kingpin = trailer.locators.Kingpin;
  if (!fifthWheel || !kingpin) throw new Error('Freight requires authored FifthWheel and Kingpin locators');
  const axles = trailer.wheels.filter(w => !w.front);
  if (!axles.length) throw new Error('Freight trailer has no measured rear axle');
  const axle = axles.reduce((sum, w) => sum + w.offset[0], 0) / axles.length;
  const axleDistance = kingpin[0] - axle;
  if (!(axleDistance > 0)) throw new Error('Freight kingpin must be ahead of the trailer axle');
  const shift = fifthWheel[0] - kingpin[0];
  const min = Math.min(tractor.boxCentre[0] - tractor.length / 2, shift + trailer.boxCentre[0] - trailer.length / 2);
  const max = Math.max(tractor.boxCentre[0] + tractor.length / 2, shift + trailer.boxCentre[0] + trailer.length / 2);
  return { tractor: tractor.type, trailer: trailer.type, length: max - min, width: Math.max(tractor.width, trailer.width),
    tractorOffset: -(min + max) / 2, fifthWheel, kingpin, axleDistance, trailerSpinScale: tractor.wheelRadius / trailer.wheelRadius };
}

export function articulateFreight(lane: CampusLane, s: number, coupling: FreightCoupling): ArticulatedFreight {
  const a = newLanePoint(), b = newLanePoint();
  const originS = s + coupling.tractorOffset;
  lanePoint(lane, originS, a);
  const c = Math.cos(a.heading), sn = Math.sin(a.heading), f = coupling.fifthWheel;
  const pinX = a.u + f[0] * c - f[2] * sn, pinZ = a.v + f[0] * sn + f[2] * c;
  lanePoint(lane, originS + f[0] - coupling.axleDistance, b);
  const heading = Math.atan2(pinZ - b.v, pinX - b.u), tc = Math.cos(heading), ts = Math.sin(heading), k = coupling.kingpin;
  return {
    tractor: { x: a.u, y: 0, z: a.v, heading: a.heading },
    trailer: { x: pinX - k[0] * tc + k[2] * ts, y: f[1] - k[1], z: pinZ - k[0] * ts - k[2] * tc, heading },
  };
}

export function parkedFreight(x: number, z: number, heading: number, coupling: FreightCoupling): ArticulatedFreight {
  const c = Math.cos(heading), s = Math.sin(heading), f = coupling.fifthWheel, k = coupling.kingpin;
  const tractor = { x: x+coupling.tractorOffset*c, y: 0, z: z+coupling.tractorOffset*s, heading };
  return { tractor, trailer: { x: tractor.x+(f[0]-k[0])*c-(f[2]-k[2])*s,
    y: f[1]-k[1], z: tractor.z+(f[0]-k[0])*s+(f[2]-k[2])*c, heading } };
}
