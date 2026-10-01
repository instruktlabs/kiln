// The bridge (Kiln web runtime GLB, plus the far runtime as the distance LOD). Both come from the
// verified pack. This module owns the level-of-detail switch, the lamp/beacon emissive control,
// the roadway height grid used by traffic and the player car, and the chase-camera colliders. The
// approach roads (./approach-mesh, fix round 2) are built here on the bridge's own materials, near and
// far representations switching by the camera's distance to the route (deck axis and approach centrelines).
import { Color, Group, MeshStandardMaterial } from 'three/webgpu';
import type { Material, Mesh, Object3D, Vector3 } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createCollisionWorld } from '@kiln-scenes/scene-kit';
import type { CollisionWorld } from '@kiln-scenes/scene-kit';
import { BRIDGE, LAYERS } from '../constants';
import { LAYOUT } from '../data';
import type { Vec3 } from '../data';
import { rasterizeRoad } from './road';
import type { RoadGrid } from './road';
import { createRoute } from './route';
import type { Approach, Route } from './route';
import { approachMeshes } from './approach-mesh';
import type { ApproachMaterials, ApproachMeshes } from './approach-mesh';

export { rasterizeRoad, roadHeight, roadSlope, ROAD_GRID_SPACING } from './road';
export type { RoadGrid } from './road';

/** layout.json lights.bridgeLamps and bridge.obstructionNodes (D-21). */
const LAMP_MATERIALS = new Set(LAYOUT.lights.bridgeLamps.materials);
const OBSTRUCTION = new RegExp(`^(${LAYOUT.bridge.obstructionNodes.join('|')})`);

export interface BridgeOptions { farSwitch: number; castShadow: boolean }
export interface Bridge {
  root: Group; web: Object3D; far: Object3D; road: RoadGrid; colliders: CollisionWorld;
  /** The approach roads (data/layout.json approaches) and their near and far meshes. */
  approaches: Approach[]; approachMeshes: { near: ApproachMeshes; far: ApproachMeshes };
  /** The drivable route: the Roadway's road grid joined to both approach roads (traffic and the player's car). */
  route: Route;
  readonly usingFar: boolean;
  readonly approachesFar: boolean;
  /** Distance LOD with 12 % hysteresis around the tier's switch distance. */
  update(camera: Vector3): void;
  setLamps(level: number): void;
  stats: { webMeshes: number; farMeshes: number; jointMaterials: number; colliders: number; roadCells: number; approachTriangles: { near: number; far: number }; approachDraws: { near: number; far: number } };
  dispose(): void;
}

/**
 * layout.json bridge.jointPlates (fix round 3): the expansion-joint plates lie 1.5 mm above the Roadway, which
 * runs on beneath them, so their material takes a polygon offset toward the camera (both backends map it to the
 * depth bias). Returns the number of materials changed.
 */
export function offsetJointPlates(scene: Object3D): number {
  const { material: name, polygonOffset: { factor, units } } = LAYOUT.bridge.jointPlates, done = new Set<Material>();
  scene.traverse(node => {
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      if (m.name !== name || done.has(m)) continue;
      m.polygonOffset = true; m.polygonOffsetFactor = factor; m.polygonOffsetUnits = units; m.needsUpdate = true; done.add(m);
    }
  });
  return done.size;
}

function prepare(scene: Object3D, castShadow: boolean, lamps: Set<MeshStandardMaterial>, emissive: Map<MeshStandardMaterial, number>): number {
  let meshes = 0;
  scene.traverse(node => {
    node.layers.set(LAYERS.world);
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    meshes++; mesh.castShadow = castShadow; mesh.receiveShadow = castShadow;
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      const standard = material as MeshStandardMaterial;
      if (LAMP_MATERIALS.has(material.name) && standard.emissive) { lamps.add(standard); if (!emissive.has(standard)) emissive.set(standard, standard.emissiveIntensity); }
    }
  });
  return meshes;
}

/** The bridge runtime's Asphalt, RoadMarkings, Concrete and LampGlass materials, by name, and the scene's painted steel (layout.json dressing.paint). */
function approachMaterials(scene: Object3D, which: string, paint: Material): ApproachMaterials {
  const byName = new Map<string, Material>();
  scene.traverse(node => { const mesh = node as Mesh; if (!mesh.isMesh) return; for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) if (!byName.has(m.name)) byName.set(m.name, m); });
  const get = (name: string) => { const m = byName.get(name); if (!m) throw new Error(`Bridge ${which} runtime has no ${name} material for the approach roads`); return m; };
  return { asphalt: get('Asphalt'), markings: get('RoadMarkings'), concrete: get('Concrete'), paint, glass: get('LampGlass') };
}
/** Distance from p to the polyline (3-D). */
function polylineDistance(p: Vector3, line: readonly Vec3[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!, ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2], len2 = ex * ex + ey * ey + ez * ez;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a[0]) * ex + (p.y - a[1]) * ey + (p.z - a[2]) * ez) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a[0] - ex * t, p.y - a[1] - ey * t, p.z - a[2] - ez * t));
  }
  return best;
}

export function createBridge(web: GLTF, far: GLTF, o: BridgeOptions): Bridge {
  const root = new Group(); root.name = 'bridge';
  const lamps = new Set<MeshStandardMaterial>(), emissive = new Map<MeshStandardMaterial, number>();
  const webMeshes = prepare(web.scene, o.castShadow, lamps, emissive), farMeshes = prepare(far.scene, false, lamps, emissive);
  const jointMaterials = offsetJointPlates(web.scene) + offsetJointPlates(far.scene);
  root.add(web.scene, far.scene); far.scene.visible = false;
  root.updateMatrixWorld(true);
  const roadway = web.scene.getObjectByName('Roadway');
  if (!roadway) throw new Error('Bridge runtime has no Roadway node');
  const road = rasterizeRoad(roadway), route = createRoute(road, LAYOUT.approaches, BRIDGE.roadEndZ);
  const cs = LAYOUT.approaches.crossSection, approaches = [route.south, route.north], dressing = LAYOUT.dressing;
  const paint = new MeshStandardMaterial({ name: 'PaintedSteel', color: new Color(dressing.paint.color), roughness: dressing.paint.roughness, metalness: 0 });
  const meshes = {
    near: approachMeshes(approaches, cs, BRIDGE.roadEndZ, BRIDGE.medianHalfWidth, 'near', approachMaterials(web.scene, 'web', paint), { castShadow: o.castShadow, layer: LAYERS.world }, dressing),
    far: approachMeshes(approaches, cs, BRIDGE.roadEndZ, BRIDGE.medianHalfWidth, 'far', approachMaterials(far.scene, 'far', paint), { castShadow: false, layer: LAYERS.world }, dressing),
  };
  root.add(meshes.near.group, meshes.far.group); meshes.far.group.visible = false;
  const centrelines = approaches.map(a => a.data.centreline);
  const colliders = createCollisionWorld();
  colliders.addStatic('bridge-obstruction', web.scene, mesh => { let node: Object3D | null = mesh; while (node && node !== web.scene) { if (OBSTRUCTION.test(node.name)) return true; node = node.parent; } return false; });
  let usingFar = false, approachesFar = false;
  const bridge: Bridge = {
    root, web: web.scene, far: far.scene, road, colliders, approaches, approachMeshes: meshes, route,
    get usingFar() { return usingFar; },
    get approachesFar() { return approachesFar; },
    update(camera) {
      // Distance to the bridge's bounding segment (the deck axis from anchorage to anchorage).
      const z = Math.max(-BRIDGE.roadEndZ, Math.min(BRIDGE.roadEndZ, camera.z)), d = Math.hypot(camera.x, camera.y - 100, camera.z - z);
      const next = usingFar ? d > o.farSwitch * .88 : d > o.farSwitch * 1.12;
      if (next !== usingFar) { usingFar = next; web.scene.visible = !next; far.scene.visible = next; }
      // The approaches switch by the distance to the whole route, with the same hysteresis.
      const r = Math.min(Math.hypot(camera.x, camera.y - 62, camera.z - z), ...centrelines.map(line => polylineDistance(camera, line)));
      const nextApproach = approachesFar ? r > o.farSwitch * .88 : r > o.farSwitch * 1.12;
      if (nextApproach !== approachesFar) { approachesFar = nextApproach; meshes.near.group.visible = !nextApproach; meshes.far.group.visible = nextApproach; }
    },
    setLamps(level) { for (const material of lamps) material.emissiveIntensity = (emissive.get(material) ?? 1) * level; },
    stats: { webMeshes, farMeshes, jointMaterials, colliders: colliders.colliders.length, roadCells: road.nx * road.nz, approachTriangles: { near: meshes.near.triangles, far: meshes.far.triangles }, approachDraws: { near: meshes.near.draws, far: meshes.far.draws } },
    dispose() { root.removeFromParent(); colliders.dispose(); meshes.near.dispose(); meshes.far.dispose(); paint.dispose(); root.remove(web.scene, far.scene); },
  };
  return bridge;
}
