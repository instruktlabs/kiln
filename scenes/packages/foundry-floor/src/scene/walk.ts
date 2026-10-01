// SPDX-License-Identifier: MIT
// Free walk (D-22, TASK-FF2 item 3): a visitor at human eye height on the fab floor or in the gallery, moved by the kit's
// input (keyboard, or its joystick on touch), looking by drag. Everything the walker can meet stands on one flat floor
// (Y 0) with vertical sides, so collision is a circle against the plan boxes of the static placements the scene draws
// (placements.ts, sized by the asset map's measured bounds), cut to the band a person occupies: tool bodies, load
// ports, stockers, wall panels (doors stay closed: the west doors lead out of the fab, the gallery doors stand behind
// the gallery handrail), posts, the parked floor robots, the gallery's benches and kiosks, the section modules' drawn
// shafts, and the layout's walk edges (the rail along the section cut, the landing rails, the gallery's walls and
// handrail). The walker slides along what it meets and stays inside the layout's walk areas. The fab floor and the
// gallery with its viewing landing are separate spaces (glazing between them), so walking starts where the view is.
// Pure: no three, React or DOM, so bun tests walk the same boxes the page does.
import type { FabData, LayoutData, WalkData } from '../sim/data';
import type { AssetMap } from './assets/asset-map';
import { staticPlacements } from './world/placements';
import { proxyBoxes } from './world/proxies';

/** A plan box on the floor: world X and Z extents. */
export interface PlanBox { id: string; minX: number; maxX: number; minZ: number; maxZ: number }
export interface Walker { x: number; z: number; /** radians, the layout's yaw: 0 faces +X, pi/2 faces -Z */ yaw: number; pitch: number; fov: number }
export interface WalkWorld {
  readonly walk: WalkData;
  readonly boxes: readonly PlanBox[];
  /** The walk area holding (x, z), or null. */
  areaAt(x: number, z: number): string | null;
  /** True when a walker centred at (x, z) touches nothing and stands in a walk area. */
  free(x: number, z: number): boolean;
  /** The free spot nearest (x, z) within `reach` metres, or null. */
  nearestFree(x: number, z: number, reach?: number): [number, number] | null;
  /** Moves the walker by (dx, dz), sliding along what it meets; returns the distance moved. */
  move(w: Walker, dx: number, dz: number): number;
}

/** The band of heights a walking person occupies (feet clear of floor-level trim, up to head height). */
export const BODY_BAND: readonly [number, number] = [0.02, 1.8];
/** Entities never met on foot: overhead, under the floor, on top of tools, or moving (drawn from the twin). */
const NOT_OBSTACLES = new Set(['railStraight', 'railCurve', 'railSwitch', 'uts', 'floorModule', 'ceilingModule', 'signalTower']);
const EDGE_HALF_M = 0.03;
const MAX_STEP_M = 0.1;

/** The plan boxes a walker meets, from the placements and the asset map's measured bounds. */
export function walkBoxes(data: FabData, map: AssetMap): PlanBox[] {
  const out: PlanBox[] = [];
  const placements = staticPlacements(data);
  for (const [entity, list] of Object.entries(placements)) {
    const e = map.entities[entity];
    if (!e?.measured || NOT_OBSTACLES.has(entity)) continue;
    for (const p of list) {
      const variant = p.variant !== undefined ? e.variants?.[p.variant] : undefined;
      // An entity that names obstacle parts meets the walker with those parts only (shown by the placement's variant);
      // a wall-kit variant with its own root uses that subtree; anything else its whole measured body.
      const locals = e.obstacles?.length
        ? e.obstacles.filter(n => !variant?.show || variant.show.includes(n)).map(n => e.measured!.nodeBounds?.[n]).filter(b => !!b)
        : [(variant?.root && e.measured.subtrees?.[variant.root]) || e.measured.bounds];
      const k = e.scale?.value ?? 1, sx = (p.scale?.[0] ?? 1) * k, sy = (p.scale?.[1] ?? 1) * k, sz = (p.scale?.[2] ?? 1) * k;
      const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
      for (const b of locals) {
        const y0 = p.y + b!.min[1] * sy, y1 = p.y + b!.max[1] * sy;
        if (y1 <= BODY_BAND[0] || y0 >= BODY_BAND[1]) continue;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const lx of [b!.min[0] * sx, b!.max[0] * sx]) for (const lz of [b!.min[2] * sz, b!.max[2] * sz]) {
          const x = p.x + c * lx + s * lz, z = p.z - s * lx + c * lz;
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        out.push({ id: `${entity}:${p.id}`, minX, maxX, minZ, maxZ });
      }
    }
  }
  for (const edge of data.layout.cameras.walk.edges) {
    const [ax, az] = edge.from, [bx, bz] = edge.to;
    out.push({ id: `edge:${edge.id}`, minX: Math.min(ax, bx) - EDGE_HALF_M, maxX: Math.max(ax, bx) + EDGE_HALF_M, minZ: Math.min(az, bz) - EDGE_HALF_M, maxZ: Math.max(az, bz) + EDGE_HALF_M });
  }
  for (const b of proxyBoxes(map, placements, data)) if (b.name.startsWith('floor-transfer') && b.max[1] > BODY_BAND[0] && b.min[1] < BODY_BAND[1]) {
    out.push({ id: b.name, minX: b.min[0], maxX: b.max[0], minZ: b.min[2], maxZ: b.max[2] });
  }
  return out;
}

/** A coarse grid over the boxes, so a step tests only the boxes near the walker. */
function boxGrid(boxes: readonly PlanBox[], cell: number) {
  const cells = new Map<number, PlanBox[]>();
  const key = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
  for (const b of boxes) {
    for (let i = Math.floor(b.minX / cell); i <= Math.floor(b.maxX / cell); i++) for (let j = Math.floor(b.minZ / cell); j <= Math.floor(b.maxZ / cell); j++) {
      const k = key(i, j), list = cells.get(k);
      if (list) list.push(b); else cells.set(k, [b]);
    }
  }
  const seen = new Set<PlanBox>(), found: PlanBox[] = [];
  return (x: number, z: number, r: number): PlanBox[] => {
    seen.clear(); found.length = 0;
    for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++) for (let j = Math.floor((z - r) / cell); j <= Math.floor((z + r) / cell); j++) {
      for (const b of cells.get(key(i, j)) ?? []) if (!seen.has(b)) { seen.add(b); found.push(b); }
    }
    return found;
  };
}

export function createWalkWorld(data: FabData, map: AssetMap): WalkWorld {
  const walk = data.layout.cameras.walk, boxes = walkBoxes(data, map), r = walk.radius;
  const near = boxGrid(boxes, 2);
  const areaAt = (x: number, z: number): string | null => {
    for (const a of walk.areas) if (x >= a.x[0] && x <= a.x[1] && z >= a.z[0] && z <= a.z[1]) return a.id;
    return null;
  };
  const touches = (x: number, z: number): boolean => {
    for (const b of near(x, z, r)) {
      const dx = Math.max(b.minX - x, 0, x - b.maxX), dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  };
  const free = (x: number, z: number): boolean => areaAt(x, z) !== null && !touches(x, z);
  /** Pushes (x, z) out of every box it overlaps, a few passes; returns the position. */
  const pushOut = (x: number, z: number): [number, number] => {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const b of near(x, z, r)) {
        const cx = Math.min(Math.max(x, b.minX), b.maxX), cz = Math.min(Math.max(z, b.minZ), b.maxZ);
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) { const d = Math.sqrt(d2), k = (r - d + 1e-6) / d; x += dx * k; z += dz * k; }
        else {
          // The centre is inside the box: leave by the nearest side.
          const exits: readonly (readonly [number, number])[] = [[b.minX - r - 1e-6 - x, 0], [b.maxX + r + 1e-6 - x, 0], [0, b.minZ - r - 1e-6 - z], [0, b.maxZ + r + 1e-6 - z]];
          let best = exits[0]!;
          for (const e of exits) if (Math.abs(e[0]) + Math.abs(e[1]) < Math.abs(best[0]) + Math.abs(best[1])) best = e;
          x += best[0]; z += best[1];
        }
        moved = true;
      }
      if (!moved) break;
    }
    return [x, z];
  };
  return {
    walk, boxes, areaAt, free,
    nearestFree(x, z, reach = 4) {
      if (free(x, z)) return [x, z];
      for (let ring = 1; ring * 0.2 <= reach; ring++) {
        const rr = ring * 0.2, n = Math.max(8, Math.round((2 * Math.PI * rr) / 0.2));
        for (let k = 0; k < n; k++) {
          const a = (2 * Math.PI * k) / n, px = x + rr * Math.cos(a), pz = z + rr * Math.sin(a);
          if (free(px, pz)) return [px, pz];
        }
      }
      return null;
    },
    move(w, dx, dz) {
      const x0 = w.x, z0 = w.z, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / MAX_STEP_M));
      for (let i = 0; i < steps; i++) {
        const [nx, nz] = pushOut(w.x + dx / steps, w.z + dz / steps);
        // The walk areas bound the walker; along an area's edge it keeps the component that stays inside.
        if (areaAt(nx, nz) !== null && !touches(nx, nz)) { w.x = nx; w.z = nz; }
        else if (areaAt(nx, w.z) !== null && !touches(nx, w.z)) w.x = nx;
        else if (areaAt(w.x, nz) !== null && !touches(w.x, nz)) w.z = nz;
      }
      return Math.hypot(w.x - x0, w.z - z0);
    },
  };
}

/** The layout yaw of a horizontal view direction (dx, dz): 0 faces +X, pi/2 faces -Z. */
export const yawOfDirection = (dx: number, dz: number): number => Math.atan2(-dz, dx);

/**
 * Where walking starts from a camera pose: at the camera when it stands at eye level in a walk area, else where its
 * view ray meets the floor, else the layout's start (in the gallery); always the nearest free spot, facing the view.
 */
export function walkStart(world: WalkWorld, position: readonly number[], direction: readonly number[], fov: number): Walker {
  const walk = world.walk, [px, py, pz] = position as [number, number, number], [dx, dy, dz] = direction as [number, number, number];
  const flat = Math.hypot(dx, dz), yaw = flat > 1e-6 ? yawOfDirection(dx, dz) : (walk.start.yawDeg * Math.PI) / 180;
  const candidates: [number, number][] = [];
  if (py > 0 && py < 3.5 && world.areaAt(px, pz)) candidates.push([px, pz]);
  if (dy < -1e-3) { const t = -py / dy; candidates.push([px + dx * t, pz + dz * t]); }
  for (const [x, z] of candidates) {
    if (!world.areaAt(x, z)) continue;
    const spot = world.nearestFree(x, z, 6);
    if (spot) return { x: spot[0], z: spot[1], yaw, pitch: 0, fov: clampFov(fov) };
  }
  const s = walk.start.position;
  const spot = world.nearestFree(s[0], s[2], 6) ?? [s[0], s[2]];
  return { x: spot[0], z: spot[1], yaw: (walk.start.yawDeg * Math.PI) / 180, pitch: 0, fov: clampFov(fov) };
}

export const WALK_FOV: readonly [number, number] = [35, 75];
export const clampFov = (fov: number): number => Math.min(WALK_FOV[1], Math.max(WALK_FOV[0], Number.isFinite(fov) ? fov : 60));
const PITCH_LIMIT = 1.2;

/**
 * One frame of walking: look from the drag (the world follows the finger), zoom from the pinch or wheel, move from the
 * stick or keys relative to the view (run near full deflection or with Shift). Returns the distance moved.
 */
export function stepWalker(world: WalkWorld, w: Walker, input: { move: { x: number; y: number }; run: boolean; look: { x: number; y: number }; zoom: number }, dt: number): number {
  w.yaw += input.look.x;
  w.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, w.pitch + input.look.y));
  if (input.zoom) w.fov = clampFov(w.fov * Math.exp(input.zoom * 0.5));
  const mx = input.move.x, my = input.move.y, m = Math.hypot(mx, my);
  if (!(dt > 0) || m < 1e-6) return 0;
  const speed = (input.run ? world.walk.runSpeed : world.walk.speed) * Math.min(1, m), fx = Math.cos(w.yaw), fz = -Math.sin(w.yaw);
  // Forward (fx, fz) and right (-fz, fx) on the floor.
  const dirX = (fx * my - fz * mx) / m, dirZ = (fz * my + fx * mx) / m;
  return world.move(w, dirX * speed * dt, dirZ * speed * dt);
}

/** The eye pose of a walker: position and a look-at target one metre ahead. */
export function walkerEye(world: WalkWorld, w: Walker, position: number[], target: number[]): void {
  const eye = world.walk.eyeY, cp = Math.cos(w.pitch);
  position[0] = w.x; position[1] = eye; position[2] = w.z;
  target[0] = w.x + Math.cos(w.yaw) * cp; target[1] = eye + Math.sin(w.pitch); target[2] = w.z - Math.sin(w.yaw) * cp;
}

/** Where the walker stands, in words for the status line: the gallery, the viewing landing, the spine or a bay. */
export function walkPlace(world: WalkWorld, layout: LayoutData, x: number, z: number): string {
  const area = world.areaAt(x, z);
  if (area === 'gallery') return 'In the visitor gallery';
  if (area === 'landing') return 'On the viewing landing beside the section cut';
  if (area !== 'fab') return '';
  const bay = layout.bays.find(b => x >= b.x[0] && x <= b.x[1] && z >= b.z[0] && z <= b.z[1]);
  return bay ? `On the fab floor, bay ${bay.id}: ${bay.contents}` : 'On the fab floor, the spine';
}
