// SPDX-License-Identifier: MIT
// Follow-a-wafer framing (TASK-FF2 item 4): what the camera aims at for a lot (its drawn FOUP; for a lot without one,
// inside a furnace or a stocker, the front of what holds it; the layout's seat when the FOUP is not posed) and from
// which side it looks: the first clear side nearest the way the place faces (a load port's aisle, a stocker's face)
// or else the camera's, under the FFU face, checked against the tool and stocker bodies and the fab floor's room.
// Pure: no three, React or DOM.
import type { LayoutData, Vec3 } from '../sim/data';
import type { LotView } from '../sim/fab';
import { obstructionDistance } from './picking';
import type { PickBox } from './picking';

export const FOLLOW = {
  /** The FOUP's middle above its base. */ foupMidM: 0.2,
  /** How far out and up the camera starts from the aim. */ outM: 4.5, upM: 1.6, minUpM: 0.6,
  /** The camera stays this far under the FFU face. */ ffuClearM: 0.4,
  /** A stocker's face aim stands this far out, at this height. */ faceOutM: 0.35, faceY: 1.6,
} as const;

export interface FollowPlaces {
  /** Place, tool, cell or stocker id to the horizontal way it faces (toward its aisle). */
  facing: Map<string, Vec3>;
  /** Place, tool, cell or stocker id to the aim for a lot there without a posed FOUP. */
  front: Map<string, Vec3>;
}
type Room = { min: readonly number[]; max: readonly number[] };

export function followPlaces(layout: LayoutData): FollowPlaces {
  const facing = new Map<string, Vec3>(), front = new Map<string, Vec3>();
  const seat = (p: { seat: Vec3 }): Vec3 => [p.seat[0], p.seat[1] + FOLLOW.foupMidM, p.seat[2]];
  for (const t of layout.tools) {
    const f = t.ports.find(p => p.facing)?.facing;
    for (const p of t.ports) { const pf = p.facing ?? f; if (pf) facing.set(p.id, pf); front.set(p.id, seat(p)); }
    if (!t.ports.length) continue;
    // A lot inside the tool (a furnace's buffer or batch): its load ports, where the FOUPs go in and out.
    let x = 0, z = 0, y = 0;
    for (const p of t.ports) { x += p.seat[0]; z += p.seat[2]; y = Math.max(y, p.seat[1]); }
    const aim: Vec3 = [x / t.ports.length, y + FOLLOW.foupMidM, z / t.ports.length];
    for (const id of t.cell ? [t.id, t.cell] : [t.id]) { front.set(id, aim); if (f) facing.set(id, f); }
  }
  for (const s of layout.stockers) {
    const fp = s.footprint, cx = (fp.min[0] + fp.max[0]) / 2, cz = (fp.min[2] + fp.max[2]) / 2;
    const hx = (fp.max[0] - fp.min[0]) / 2, hz = (fp.max[2] - fp.min[2]) / 2;
    // A lot in a slot or on the crane: the middle of the face its ports are on.
    front.set(s.id, [cx + s.facing[0] * (hx + FOLLOW.faceOutM), FOLLOW.faceY, cz + s.facing[2] * (hz + FOLLOW.faceOutM)]);
    facing.set(s.id, s.facing);
    for (const p of [...s.ports, s.manualPort]) { facing.set(p.id, s.facing); front.set(p.id, seat(p)); }
  }
  for (const u of layout.uts) for (const p of u.seats) front.set(p.id, seat(p));
  return { facing, front };
}

/** The camera's offset from `aim`: out `FOLLOW.outM` and up (under the FFU face), on the first of 16 sides, alternating
 *  out from `preferYaw` (radians in the XZ plane, atan2(z, x)), whose line from the aim is clear; else the clearest. */
export function followOffset(bodies: readonly PickBox[], room: Room, layout: LayoutData, aim: Vec3, preferYaw: number): Vec3 {
  const ffu = layout.heights.ffuFace ?? 6, up = Math.max(FOLLOW.minUpM, Math.min(FOLLOW.upM, ffu - FOLLOW.ffuClearM - aim[1]));
  let best: Vec3 = [Math.cos(preferYaw) * FOLLOW.outM, up, Math.sin(preferYaw) * FOLLOW.outM], bestFree = -1;
  for (let k = 0; k < 16; k++) {
    const yaw = preferYaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const offset: Vec3 = [Math.cos(yaw) * FOLLOW.outM, up, Math.sin(yaw) * FOLLOW.outM];
    const hit = obstructionDistance(bodies, room, aim, [aim[0] + offset[0], aim[1] + offset[1], aim[2] + offset[2]]);
    if (hit === Infinity) return offset;
    if (hit > bestFree) { bestFree = hit; best = offset; }
  }
  return best;
}

/** The side to prefer for a lot's place: the way it faces, else from where the camera stands. */
export function preferredYaw(places: FollowPlaces, v: LotView, aim: Vec3, camera: readonly number[]): number {
  const f = places.facing.get(v.at);
  return f ? Math.atan2(f[2], f[0]) : Math.atan2((camera[2] as number) - aim[2], (camera[0] as number) - aim[0]);
}
