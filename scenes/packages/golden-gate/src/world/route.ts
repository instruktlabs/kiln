// SPDX-License-Identifier: MIT
// The drivable route (fix round 2): the bridge deck and both approach roads as one road. A point on it
// is a route station σ (metres) and a lateral offset d (metres):
//  - on the deck (|σ| <= roadEndZ) σ is the scene Z and d the scene X;
//  - on an approach σ = sign * (roadEndZ + s), where s is the approach station from the bridge's road
//    end (sign -1 south, +1 north), so σ grows northward along the whole route;
//  - d runs along N = (Tz, -Tx) of the +σ tangent T, which is +X on the deck; a lane keeps its deck x as
//    d from one approach end to the other.
// The deck surface is the bridge's Roadway (the road grid of ./road); the approaches follow their
// alignment and profile from data/layout.json `approaches` (D-21). Pure and deterministic: the runtime,
// scripts/layout.ts and the checks share it.
import { buildHorizontal, horizontalAt, horizontalProject, lateral, profileAt } from './alignment';
import type { Horizontal, HorizontalPoint, Profile, ProfilePoint } from './alignment';
import { roadHeight } from './road';
import type { RoadGrid } from './road';
import type { ApproachData, ApproachName, SceneApproaches } from '../data';

export interface Approach {
  name: ApproachName; sign: 1 | -1; horizontal: Horizontal; profile: Profile;
  /** Modelled length (m from the bridge's road end). */
  length: number;
  data: ApproachData;
}
export const APPROACH_SIGN: Record<ApproachName, 1 | -1> = { south: -1, north: 1 };

/** The approach's horizontal alignment: from the road end on the bridge axis, heading away from the bridge. */
export function approachHorizontal(name: ApproachName, alignment: ApproachData['alignment'], roadEndZ: number): Horizontal {
  const sign = APPROACH_SIGN[name];
  return buildHorizontal({ start: [0, sign * roadEndZ], direction: [0, sign], pis: alignment.pis, radii: alignment.radii, end: alignment.end });
}
export function buildApproach(name: ApproachName, data: ApproachData, roadEndZ: number): Approach {
  return { name, sign: APPROACH_SIGN[name], horizontal: approachHorizontal(name, data.alignment, roadEndZ), profile: { pvis: data.profile }, length: data.length, data };
}

export interface Route {
  grid: RoadGrid; roadEndZ: number; south: Approach; north: Approach;
  /** Route stations of the two modelled ends (south negative). */
  min: number; max: number;
  /** Last road-grid row inside the Roadway at each end (|z|); between it and roadEndZ the deck height runs linearly to the approach's start elevation. */
  jointRow: number;
}
export function createRoute(grid: RoadGrid, approaches: SceneApproaches, roadEndZ: number): Route {
  const south = buildApproach('south', approaches.south, roadEndZ), north = buildApproach('north', approaches.north, roadEndZ);
  const jointRow = grid.z0 + Math.floor((roadEndZ - grid.z0) / grid.dz - 1e-9) * grid.dz;
  return { grid, roadEndZ, south, north, min: -(roadEndZ + south.length), max: roadEndZ + north.length, jointRow: Math.abs(jointRow) };
}

export interface RoutePoint {
  x: number; y: number; z: number;
  /** Unit direction of +σ in (x, z). */
  fx: number; fz: number;
  /** dy/dσ of the road surface. */
  grade: number;
  /** Signed curvature of the centreline (1/m), positive when it bends toward +d. */
  curvature: number;
  /** The approach the point lies on (null on the deck) and its approach station. */
  approach: Approach | null; s: number;
}
export const newRoutePoint = (): RoutePoint => ({ x: 0, y: 0, z: 0, fx: 0, fz: 1, grade: 0, curvature: 0, approach: null, s: 0 });

const scratchH: HorizontalPoint = { x: 0, z: 0, tx: 0, tz: 1, curvature: 0 };
const scratchP: ProfilePoint = { y: 0, grade: 0 };

/** The approach a route station lies on, or null on the deck. */
export function approachAt(route: Route, sigma: number): Approach | null {
  return sigma > route.roadEndZ ? route.north : sigma < -route.roadEndZ ? route.south : null;
}
/** Deck surface height at (σ, d): the Roadway grid, joined linearly to the approach's start elevation over the last grid row. */
export function deckHeight(route: Route, sigma: number, d: number): number {
  const a = Math.abs(sigma);
  if (a <= route.jointRow) return roadHeight(route.grid, d, sigma);
  const sign = sigma < 0 ? -1 : 1, approach = sign < 0 ? route.south : route.north, t = Math.min(1, (a - route.jointRow) / (route.roadEndZ - route.jointRow));
  return roadHeight(route.grid, d, sign * route.jointRow) * (1 - t) + profileAt(approach.profile, 0, scratchP).y * t;
}

/** Road surface point at route station σ and lateral offset d. */
export function routePoint(route: Route, sigma: number, d: number, out: RoutePoint = newRoutePoint()): RoutePoint {
  const approach = approachAt(route, sigma);
  if (!approach) {
    out.x = d; out.z = sigma; out.y = deckHeight(route, sigma, d); out.fx = 0; out.fz = 1; out.curvature = 0; out.approach = null; out.s = 0;
    // Central difference over the route surface (it crosses onto the approach at the deck ends).
    out.grade = routeHeight(route, sigma + .5, d) - routeHeight(route, sigma - .5, d);
    return out;
  }
  const sign = approach.sign, s = sign * sigma - route.roadEndZ;
  const h = horizontalAt(approach.horizontal, s, scratchH), [nx, nz] = lateral(h.tx, h.tz), p = profileAt(approach.profile, s, scratchP);
  out.x = h.x + sign * d * nx; out.z = h.z + sign * d * nz; out.y = p.y;
  out.fx = sign * h.tx; out.fz = sign * h.tz; out.grade = sign * p.grade; out.curvature = sign * h.curvature; out.approach = approach; out.s = s;
  return out;
}
export function routeHeight(route: Route, sigma: number, d: number): number {
  const approach = approachAt(route, sigma);
  return approach ? profileAt(approach.profile, approach.sign * sigma - route.roadEndZ, scratchP).y : deckHeight(route, sigma, d);
}
/** Kit yaw of the +σ direction (forward = (sin yaw, cos yaw)). */
export function routeYaw(p: Pick<RoutePoint, 'fx' | 'fz'>): number { return Math.atan2(p.fx, p.fz); }
/** Distance travelled along a lane at offset d per metre of σ (1 - κ d on curves). */
export function laneScale(p: Pick<RoutePoint, 'curvature'>, d: number): number { return 1 - p.curvature * d; }

/**
 * Route station and lateral offset of a scene point (x, z): the deck when it is within the deck's
 * stations, otherwise the nearer approach. Returns null beyond both modelled ends by more than `beyond`.
 */
export function routeProject(route: Route, x: number, z: number, beyond = 0): { sigma: number; d: number } | null {
  if (Math.abs(z) <= route.roadEndZ) return { sigma: z, d: x };
  const approach = z > 0 ? route.north : route.south, p = horizontalProject(approach.horizontal, x, z, 1e6);
  if (!p || p.s < 0) return { sigma: z, d: x };
  if (p.s > approach.length + beyond) return null;
  return { sigma: approach.sign * (route.roadEndZ + p.s), d: approach.sign * p.d };
}
