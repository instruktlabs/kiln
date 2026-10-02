// The bridge (Kiln web runtime GLB, plus the far runtime as the distance LOD). Both come from the
// verified pack. This module owns the level-of-detail switch, the lamp/beacon emissive control,
// the roadway height grid used by traffic and the player car, and the chase-camera colliders. The
// approach roads (./approach-mesh, fix round 2) are built here on the bridge's own materials, near and
// far representations switching by the camera's distance to the route (deck axis and approach centrelines).
// Draw optimisation (OD-18; tmp/drawcalls/understand/golden-gate.md sections 2-3): the scene draws a render copy of each
// model that shares the pack's geometry and materials, its parts regrouped under south, north and span groups and merged
// by material inside each group. The pack's models are never changed (World.tsx rebuilds from the same pack.models on a
// tier change); a detached copy of the web model keeps the authored graph for the Roadway raster, the colliders and route
// contact. On High, shadow depth stand-ins replace the web model's and the near approaches' casters, and in the planar
// reflection a copy of the far approaches stands in for the near ones.
import { Color, Group, MeshStandardMaterial } from 'three/webgpu';
import type { Material, Mesh, Object3D, Vector3 } from 'three/webgpu';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createCollisionWorld, mainOnly, mergeRigidByMaterial, passStandIn, shadowStandIns } from '@kiln-scenes/scene-kit';
import type { CollisionWorld, PassLayers, RigidMerge, ShadowStandIns } from '@kiln-scenes/scene-kit';
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
/** The lamp materials' authored emissive intensity: the pack's materials are shared by every build, and setLamps scales them. */
const AUTHORED = /*@__PURE__*/ new WeakMap<MeshStandardMaterial, number>();
/** Top-level parts of GoldenGateBridge by group (staged/g9/bridge): the south tower, fender and anchorage, the north tower and anchorage, and the span parts (cables, deck, suspenders, bracing and trusses) that run deck end to deck end. */
const SIDES = [/^South/, /^North/] as const, GROUPS = ['south', 'north', 'span'] as const;
/** Shadow stand-in anchors below the groups, so each tower and anchorage casts through its own proxy and keeps shadow-frustum culling. */
const PROXY_ANCHOR = /^(South|North)(Tower|Anchorage)$/;

export interface BridgeOptions {
  farSwitch: number; castShadow: boolean;
  /** Merge each model's parts by material inside its south, north and span groups (the `bridgeMerge` development parameter). */
  merge?: boolean;
  /** Shadow depth stand-ins on this layer for the web model and the near approaches; the sun's shadow camera must enable it. */
  standInLayer?: number;
  /** Planar reflection: the near approaches move to `main`, which main and shadow cameras enable, and a copy of the far approaches on `pass` stands in for them in the reflection. */
  passLayers?: PassLayers;
}
export interface Bridge {
  /** Web model as authored, detached and never drawn: named nodes and world matrices for the Roadway, the colliders and route contact. */
  root: Group; web: Object3D; views: { web: Object3D; far: Object3D }; road: RoadGrid; colliders: CollisionWorld;
  /** The approach roads (data/layout.json approaches) and their near and far meshes. */
  approaches: Approach[]; approachMeshes: { near: ApproachMeshes; far: ApproachMeshes };
  /** The drivable route: the Roadway's road grid joined to both approach roads (traffic and the player's car). */
  route: Route;
  readonly usingFar: boolean;
  readonly approachesFar: boolean;
  /** Distance LOD with 12 % hysteresis around the tier's switch distance. */
  update(camera: Vector3): void;
  setLamps(level: number): void;
  stats: {
    webMeshes: number; farMeshes: number; jointMaterials: number; colliders: number; roadCells: number; approachTriangles: { near: number; far: number }; approachDraws: { near: number; far: number };
    /** Meshes each view draws on the world layer; the merge and the stand-ins as built (null when off). */
    draws: { web: number; far: number }; merged: { web: RigidMerge['stats']; far: RigidMerge['stats'] } | null;
    shadowProxies: { proxies: number; sourceMeshes: number; triangles: number } | null; reflectionProxies: number;
  };
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

function prepare(scene: Object3D, castShadow: boolean, lamps: Set<MeshStandardMaterial>): number {
  let meshes = 0;
  scene.traverse(node => {
    node.layers.set(LAYERS.world);
    const mesh = node as Mesh; if (!mesh.isMesh) return;
    meshes++; mesh.castShadow = castShadow; mesh.receiveShadow = castShadow;
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Material[]) {
      const standard = material as MeshStandardMaterial;
      if (LAMP_MATERIALS.has(material.name) && standard.emissive) { lamps.add(standard); if (!AUTHORED.has(standard)) AUTHORED.set(standard, standard.emissiveIntensity); }
    }
  });
  return meshes;
}
/** A render copy of a model (shared geometry and materials) with GoldenGateBridge's parts regrouped under identity south, north and span groups. */
function view(model: Object3D, which: string): { root: Object3D; groups: Set<Object3D> } {
  const root = model.clone(), bridge = root.getObjectByName('GoldenGateBridge');
  if (!bridge) throw new Error(`Bridge ${which} runtime has no GoldenGateBridge node`);
  const groups = GROUPS.map(name => Object.assign(new Group(), { name }));
  for (const part of [...bridge.children]) { const side = SIDES.findIndex(s => s.test(part.name)); groups[side < 0 ? 2 : side]!.add(part); }
  bridge.add(...groups); root.name = `bridge-${which}`;
  return { root, groups: new Set(groups) };
}
/** Meshes drawn on the world layer below root, ignoring root's own visibility. */
function draws(root: Object3D): number {
  let n = 0; const visit = (o: Object3D) => { if (o !== root && !o.visible) return; if ((o as Mesh).isMesh && o.layers.isEnabled(LAYERS.world)) n++; o.children.forEach(visit); };
  visit(root); return n;
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
  const lamps = new Set<MeshStandardMaterial>(), source = web.scene.clone(), views = { web: view(web.scene, 'web'), far: view(far.scene, 'far') };
  source.updateMatrixWorld(true);
  const webMeshes = prepare(views.web.root, o.castShadow, lamps), farMeshes = prepare(views.far.root, false, lamps);
  const jointMaterials = offsetJointPlates(views.web.root) + offsetJointPlates(views.far.root);
  root.add(views.web.root, views.far.root); views.far.root.visible = false;
  root.updateMatrixWorld(true);
  const roadway = source.getObjectByName('Roadway');
  if (!roadway) throw new Error('Bridge runtime has no Roadway node');
  const road = rasterizeRoad(roadway), route = createRoute(road, LAYOUT.approaches, BRIDGE.roadEndZ);
  const cs = LAYOUT.approaches.crossSection, approaches = [route.south, route.north], dressing = LAYOUT.dressing;
  const paint = new MeshStandardMaterial({ name: 'PaintedSteel', color: new Color(dressing.paint.color), roughness: dressing.paint.roughness, metalness: 0 });
  const meshes = {
    near: approachMeshes(approaches, cs, BRIDGE.roadEndZ, BRIDGE.medianHalfWidth, 'near', approachMaterials(views.web.root, 'web', paint), { castShadow: o.castShadow, layer: LAYERS.world }, dressing),
    far: approachMeshes(approaches, cs, BRIDGE.roadEndZ, BRIDGE.medianHalfWidth, 'far', approachMaterials(views.far.root, 'far', paint), { castShadow: false, layer: LAYERS.world }, dressing),
  };
  root.add(meshes.near.group, meshes.far.group); meshes.far.group.visible = false;
  // Stand-ins before the merge: a merged mesh spans its whole group, so proxies built after it could not split per tower.
  const layer = o.standInLayer, proxies: ShadowStandIns[] = o.castShadow && layer !== undefined
    ? [shadowStandIns(views.web.root, { layer, isAnchor: n => views.web.groups.has(n) || PROXY_ANCHOR.test(n.name) }), shadowStandIns(meshes.near.group, { layer, isAnchor: () => false })] : [];
  const merged: RigidMerge[] = o.merge ? [views.web, views.far].map(v => mergeRigidByMaterial(v.root, { isAnchor: n => v.groups.has(n) })) : [];
  let reflection: ReturnType<typeof passStandIn> | null = null;
  if (o.passLayers) {
    // Before the vegetation joins the near group (build-world), so it stays reflected.
    mainOnly([meshes.near.group], o.passLayers.main);
    reflection = passStandIn(meshes.far.group, { layer: o.passLayers.pass, parent: meshes.near.group }); reflection.object.visible = true;
    reflection.object.traverse(n => { (n as Mesh).receiveShadow = o.castShadow; });
  }
  const centrelines = approaches.map(a => a.data.centreline);
  const colliders = createCollisionWorld();
  colliders.addStatic('bridge-obstruction', source, mesh => { let node: Object3D | null = mesh; while (node && node !== source) { if (OBSTRUCTION.test(node.name)) return true; node = node.parent; } return false; });
  let usingFar = false, approachesFar = false;
  const bridge: Bridge = {
    root, web: source, views: { web: views.web.root, far: views.far.root }, road, colliders, approaches, approachMeshes: meshes, route,
    get usingFar() { return usingFar; },
    get approachesFar() { return approachesFar; },
    update(camera) {
      // Distance to the bridge's bounding segment (the deck axis from anchorage to anchorage).
      const z = Math.max(-BRIDGE.roadEndZ, Math.min(BRIDGE.roadEndZ, camera.z)), d = Math.hypot(camera.x, camera.y - 100, camera.z - z);
      const next = usingFar ? d > o.farSwitch * .88 : d > o.farSwitch * 1.12;
      if (next !== usingFar) { usingFar = next; views.web.root.visible = !next; views.far.root.visible = next; }
      // The approaches switch by the distance to the whole route, with the same hysteresis.
      const r = Math.min(Math.hypot(camera.x, camera.y - 62, camera.z - z), ...centrelines.map(line => polylineDistance(camera, line)));
      const nextApproach = approachesFar ? r > o.farSwitch * .88 : r > o.farSwitch * 1.12;
      if (nextApproach !== approachesFar) { approachesFar = nextApproach; meshes.near.group.visible = !nextApproach; meshes.far.group.visible = nextApproach; }
    },
    setLamps(level) { for (const material of lamps) material.emissiveIntensity = (AUTHORED.get(material) ?? 1) * level; },
    stats: { webMeshes, farMeshes, jointMaterials, colliders: colliders.colliders.length, roadCells: road.nx * road.nz, approachTriangles: { near: meshes.near.triangles, far: meshes.far.triangles }, approachDraws: { near: meshes.near.draws, far: meshes.far.draws },
      draws: { web: draws(views.web.root), far: draws(views.far.root) }, merged: merged.length ? { web: merged[0]!.stats, far: merged[1]!.stats } : null,
      shadowProxies: proxies.length ? proxies.reduce((s, p) => ({ proxies: s.proxies + p.stats.proxies, sourceMeshes: s.sourceMeshes + p.stats.sourceMeshes, triangles: s.triangles + p.stats.triangles }), { proxies: 0, sourceMeshes: 0, triangles: 0 }) : null,
      reflectionProxies: reflection?.stats.meshes ?? 0 },
    dispose() {
      root.removeFromParent(); colliders.dispose();
      for (const m of merged) m.restore();
      for (const p of proxies) p.restore();
      reflection?.restore(); meshes.near.dispose(); meshes.far.dispose(); paint.dispose();
      bridge.setLamps(1);
    },
  };
  return bridge;
}
