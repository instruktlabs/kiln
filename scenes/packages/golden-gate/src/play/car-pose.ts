// SPDX-License-Identifier: MIT
// The driven car's pose on the route (fix round 2): its route coordinates (./car: x lateral offset,
// z station) mapped onto the deck or an approach road, the body level between the ends of its
// wheelbase and pitched with the road. Pure: Driving.tsx draws the car with it and the test build's
// contact scan (./route-contact) samples it.
import { newRoutePoint, routeHeight, routePoint, routeYaw } from '../world/route';
import type { Route } from '../world/route';
import { carYaw } from './car';
import type { CarState } from './car';

export interface CarPose {
  x: number; y: number; z: number;
  /** World heading in the kit's convention (forward = (sin yaw, cos yaw)). */
  yaw: number;
  /** Nose-up pitch (rad), with the curb bump. */
  pitch: number;
}
export const newCarPose = (): CarPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
const point = newRoutePoint();

export function carPose(route: Route, c: Pick<CarState, 'x' | 'z' | 'dir' | 'offset' | 'bump'>, wheelbase: number, out: CarPose = newCarPose()): CarPose {
  const local = carYaw(c), half = wheelbase / 2, along = Math.cos(local) * half, across = Math.sin(local) * half;
  const front = routeHeight(route, c.z + along, c.x + across), back = routeHeight(route, c.z - along, c.x - across);
  const p = routePoint(route, c.z, c.x, point);
  out.x = p.x; out.y = (front + back) / 2; out.z = p.z;
  // The route's frame turns by the centreline's heading; the car's own yaw is relative to it.
  out.yaw = routeYaw(p) + local; out.pitch = Math.atan2(front - back, 2 * half) + c.bump;
  return out;
}
