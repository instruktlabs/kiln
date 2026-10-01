// SPDX-License-Identifier: MIT
// Where every static entity stands, from data/layout.json and data/rail-graph.json (D-21: the layout is data; the
// asset map says how each GLB mounts). Pure: no three, React or DOM, so the clearance and hand-off tests (sim-spec 12
// tests 3 and 4) read the same placements the scene draws.
//   tools            at their layout position and yaw (placed by the measured extents in build-layout.ts)
//   load ports       origin on the tool's lpN locator (port.mount), +X toward the aisle (port.facing)
//   signal towers    on the tool's or stocker's signalTowerMount, turned with it
//   stockers, UTS    at their layout position and yaw (the UTS seat plane at heights.utsSeat)
//   rail pieces      straight pieces at their centre (fillers scaled along X), curves and switches at endA / mainA
//   floor, ceiling   one module per 3.6 m grid cell; the ceiling over the litho zone in amber
//   walls, posts     wall-kit panels by variant (one gallery-end panel scaled to the gallery height) and corner posts
//   gallery, subfab  the visitor gallery segments and the subfab kits under the section cut
//   floor robots     arms and AMRs at their stations (at rest in FF2)
import type { FabData, Vec3 } from '../../sim/data';
import { floorStockerDock } from '../../sim/floor-transport';

export interface Placed { id: string; x: number; y: number; z: number; /** radians, three's rotation.y */ yaw: number; variant?: string; scale?: Vec3 }
export type Placements = Record<string, Placed[]>;

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** The yaw that turns an asset's +X onto a horizontal direction (fx, fz). */
export const yawOf = (fx: number, fz: number): number => Math.atan2(-fz, fx);
const at = (id: string, p: readonly number[], yaw: number, extra: Partial<Placed> = {}): Placed => ({ id, x: p[0] as number, y: p[1] as number, z: p[2] as number, yaw, ...extra });

/** Every static placement, keyed by asset-map entity. */
export function staticPlacements(data: FabData): Placements {
  const { layout, graph } = data;
  const out: Placements = {};
  const add = (entity: string, p: Placed) => (out[entity] ??= []).push(p);

  for (const tool of layout.tools) {
    add(tool.entity, at(tool.id, tool.position, rad(tool.yaw), tool.variant ? { variant: tool.variant } : {}));
    for (const port of tool.ports) {
      const f = port.facing ?? [1, 0, 0];
      add('loadPort', at(port.id, port.mount ?? port.seat, yawOf(f[0], f[2])));
    }
    add('signalTower', at(`${tool.id}.tower`, tool.signalTowerMount, rad(tool.yaw)));
  }
  for (const st of layout.stockers) {
    add(st.entity, at(st.id, st.position, rad(st.yaw)));
    add('signalTower', at(`${st.id}.tower`, st.signalTowerMount, rad(st.yaw)));
  }
  for (const u of layout.uts) add(u.entity, at(u.id, u.position, rad(u.yaw)));

  for (const piece of graph.pieces) {
    if (piece.type === 'straight') add('railStraight', at(piece.id, piece.position, rad(piece.yaw), piece.scaleX ? { scale: [piece.scaleX, 1, 1] } : {}));
    else if (piece.type === 'curve') add('railCurve', at(piece.id, piece.position, rad(piece.yaw)));
    else add('railSwitch', at(piece.id, piece.position, rad(piece.yaw), { variant: piece.use ?? 'diverge' }));
  }

  const fm = layout.floorModules, cm = layout.ceilingModules, amber = layout.lithoZone.amberCeiling;
  for (let i = 0; i < fm.grid[0]; i++) for (let j = 0; j < fm.grid[1]; j++) {
    const x = fm.x[0] + (i + 0.5) * fm.moduleSize, z = fm.z[0] + (j + 0.5) * fm.moduleSize;
    add('floorModule', at(`floor-${i}-${j}`, [x, layout.heights.raisedFloor as number, z], 0));
  }
  for (let i = 0; i < cm.grid[0]; i++) for (let j = 0; j < cm.grid[1]; j++) {
    const x = cm.x[0] + (i + 0.5) * cm.moduleSize, z = cm.z[0] + (j + 0.5) * cm.moduleSize;
    const inAmber = x > amber.x[0] && x < amber.x[1] && z > amber.z[0] && z < amber.z[1];
    add('ceilingModule', at(`ceiling-${i}-${j}`, [x, cm.ffuFaceY, z], 0, { variant: inAmber ? 'amber' : 'white' }));
  }

  for (const panel of layout.walls.panels) add('wallKit', at(panel.id, panel.position, rad(panel.yaw), { variant: panel.variant, ...(panel.scale ? { scale: panel.scale } : {}) }));
  for (const post of layout.walls.posts) add('wallKit', at(post.id, post.position, 0, { variant: 'cornerPost' }));

  for (const seg of layout.gallery.segmentPlacements) add('gallerySegment', at(seg.id, seg.position, rad(seg.yaw)));
  for (const kit of layout.sectionCut.subfabKits) add('subfabKit', at(kit.id, kit.position, rad(kit.yaw)));
  for (const m of layout.sectionCut.modulePlacements) add('sectionModule', at(m.id, m.position, rad(m.yaw), { variant: m.variant }));

  for (const arm of layout.floorRobots.arms) add('toolFrontRobotArm', at(arm.id, arm.position, rad(arm.yaw)));
  for (const amr of layout.floorRobots.amrs) add('amrFloorRobot', at(amr.id, amr.position, rad(amr.yaw)));
  if (data.config.floorTransport?.enabled) layout.stockers.forEach((_, i) => {
    const dock = floorStockerDock(data, i);
    add('toolFrontRobotArm', at(`floor-stocker-arm-${i}`, dock.arm, rad(dock.yaw)));
  });
  return out;
}

/** A local point of a placement in world coordinates (rotation about +Y by yaw, then the placement's scale is not
 *  applied: locators of scaled pieces are not used). */
export function worldPoint(p: Placed, local: readonly number[]): Vec3 {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = local[0] as number, ly = local[1] as number, lz = local[2] as number;
  return [p.x + c * lx + s * lz, p.y + ly, p.z - s * lx + c * lz];
}
