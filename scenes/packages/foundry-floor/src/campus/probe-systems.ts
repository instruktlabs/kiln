// SPDX-License-Identifier: MIT
import type { Object3D } from 'three/webgpu';

/** Baked fab groups are named `<entity>:…` (scene/glb/bake.ts); the count probe groups them by role. */
const FAB_ROLES: Record<string, string> = {
  floorModule: 'fab-building', ceilingModule: 'fab-building', sectionModule: 'fab-building', gallerySegment: 'fab-building', subfabKit: 'fab-building', wallKit: 'fab-building',
  tool: 'fab-tools', loadPort: 'fab-tools', signalTower: 'fab-tools',
  vehicle: 'fab-movers', amrFloorRobot: 'fab-movers', humanoidWorkRobot: 'fab-movers', technician: 'fab-movers', toolFrontRobotArm: 'fab-movers', foup: 'fab-movers', stocker: 'fab-movers',
  railCurve: 'fab-transport', railSwitch: 'fab-transport', railStraight: 'fab-transport', uts: 'fab-transport',
};
const CAMPUS = ['campus-sky', 'campus-ground', 'campus-structures', 'campus-planting', 'campus-traffic', 'campus-interior-context'];

/**
 * Test and dev builds only (campus/World.tsx registers it behind TEST): count-probe systems (scene-kit testing/probe.ts),
 * found by name at call time so one hook serves the exterior and the interior. Exterior systems are the campus groups;
 * inside, the baked fab groups are grouped by role and the proxies and pulses keep their own names.
 */
export function foundryProbeSystems(scene: Object3D): Record<string, Object3D[]> {
  const systems: Record<string, Object3D[]> = {}, add = (name: string, object: Object3D) => (systems[name] ??= []).push(object);
  for (const name of CAMPUS) { const object = scene.getObjectByName(name); if (object) add(name.replace(/^campus-/, ''), object); }
  for (const child of scene.getObjectByName('foundry-floor-world')?.children ?? []) add(FAB_ROLES[child.name.split(':')[0]!] ?? (child.name ? child.name.replace(/^foundry-floor-/, 'fab-') : 'fab-unnamed'), child);
  return systems;
}
/** Fab groups name their entity (`tool:<type>` or the class); campus meshes keep the default (pack model or mesh name). */
export function foundryProbeAsset(object: Object3D): string | null {
  const parts = object.name.split(':');
  return parts.length > 2 && object.parent?.name === 'foundry-floor-world' ? parts[0] === 'tool' ? `tool:${parts[1]}` : parts[0]! : null;
}
