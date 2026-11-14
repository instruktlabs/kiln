/**
 * The town as instances of the kit parts. Each drawn part of each kit is one InstancedMesh for the
 * whole town; a placement contributes an instance to every part its options show. The instance
 * carries the placement's matrix, its morph weights (the sizes) and its colour. A new seed rewrites
 * those buffers and nothing else: the kit geometry, materials and textures are loaded once.
 */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Color, DataTexture, FloatType, Group, InstancedMesh, Matrix4, Quaternion, RedFormat, Vector3 } from 'three/webgpu';
import type { BufferGeometry, Material, Mesh, MeshStandardMaterial } from 'three/webgpu';
import { kitSpec, shows, valueOf, weights } from './kit-spec';
import type { KitDeclaration, KitGltf, KitMeshSpec, ParamValues } from './kit-spec';
import type { TownPlacement, TownPlan } from './plan/town-plan.js';

export interface KitPart {
  spec: KitMeshSpec;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /** Glass and glow neither cast nor receive a sun shadow. */
  shadows: boolean;
  /** Whether it casts into the sun's shadow map; when absent, the same as `shadows`. */
  casts?: boolean;
}
export interface Kit { id: string; declaration: KitDeclaration; parts: KitPart[] }

export const KIT_IDS = ['facade-bay', 'ground-bay', 'roof', 'paving', 'junction', 'street-lamp', 'signage', 'street-furniture', 'tree'] as const;
export type KitId = typeof KIT_IDS[number];

/** Pair a loaded kit file with its declaration. Colour-driven materials turn white: each instance brings its own colour. */
export function readKit(id: string, gltf: GLTF, declaration: KitDeclaration): Kit {
  const spec = kitSpec(id, gltf.parser.json as KitGltf);
  const byNode = new Map<number, Mesh>();
  gltf.scene.traverse(object => {
    const mesh = object as Mesh;
    const node = (gltf.parser.associations.get(object) as { nodes?: number } | undefined)?.nodes;
    if (mesh.isMesh && node !== undefined) byNode.set(node, mesh);
  });
  const parts = spec.meshes.map((part): KitPart => {
    const mesh = byNode.get(part.node);
    if (!mesh) throw new Error(`Kit ${id}: part ${part.name} did not load`);
    if (Array.isArray(mesh.material)) throw new Error(`Kit ${id}: part ${part.name} has several materials`);
    const material = mesh.material as MeshStandardMaterial;
    const count = mesh.geometry.morphAttributes.position?.length ?? 0;
    if (count !== part.targets.length) throw new Error(`Kit ${id}: part ${part.name} loaded ${count} morph targets, expected ${part.targets.length}`);
    if (part.colour) material.color.setRGB(1, 1, 1);
    const clear = material.transparent === true || /glass|glow|water/i.test(material.name);
    // Trees stand outside the sun's shadow map, which is kept tight on the streets; their shade is drawn on the ground.
    return { spec: part, geometry: mesh.geometry, material, shadows: !clear, casts: !clear && id !== 'tree' };
  });
  return { id, declaration, parts };
}

interface Slot { kit: Kit; part: KitPart; mesh: InstancedMesh | null; capacity: number; used: number }

export interface TownStats { placements: number; instances: number; draws: number; triangles: number; parts: number }
export interface TownView {
  readonly root: Group;
  readonly stats: TownStats;
  /** Rewrite the instance buffers for a plan. Returns true when a mesh was replaced, so shadow tracking must be renewed. */
  apply(plan: TownPlan): boolean;
  dispose(): void;
}

const position = new Vector3(), scale = new Vector3(1, 1, 1), rotation = new Quaternion(), up = new Vector3(0, 1, 0);
const matrix = new Matrix4(), none = new Matrix4().makeScale(0, 0, 0), tint = new Color();

/** The world matrix of a placement: its position, turned about Y by its yaw in degrees. */
export function placementMatrix(place: TownPlacement, target: Matrix4): Matrix4 {
  position.set(place.pos[0], place.pos[1], place.pos[2]);
  rotation.setFromAxisAngle(up, place.yaw * Math.PI / 180);
  return target.compose(position, rotation, scale);
}

function byKit(plan: TownPlan): Map<string, TownPlacement[]> {
  const lists = new Map<string, TownPlacement[]>();
  for (const place of plan.placements) {
    const list = lists.get(place.kit);
    if (list) list.push(place); else lists.set(place.kit, [place]);
  }
  return lists;
}

function createMesh(slot: Slot, capacity: number): InstancedMesh {
  const { part, kit } = slot;
  const mesh = new InstancedMesh(part.geometry, part.material, capacity);
  mesh.name = `${kit.id}:${part.spec.name}`;
  mesh.castShadow = part.casts ?? part.shadows;
  mesh.receiveShadow = part.shadows;
  // One mesh spans the whole town, and its sizes move vertices beyond the geometry's own bounds.
  mesh.frustumCulled = false;
  const targets = part.spec.targets.length;
  if (targets) mesh.morphTexture = new DataTexture(new Float32Array((targets + 1) * capacity), targets + 1, capacity, RedFormat, FloatType);
  return mesh;
}

export function createTownView(kits: ReadonlyMap<string, Kit>): TownView {
  const root = new Group();
  root.name = 'Seed town';
  const slots: Slot[] = [];
  for (const kit of kits.values()) for (const part of kit.parts) slots.push({ kit, part, mesh: null, capacity: 0, used: 0 });
  const stats: TownStats = { placements: 0, instances: 0, draws: 0, triangles: 0, parts: slots.length };
  const influence: number[] = [];
  let disposed = false;

  function apply(plan: TownPlan): boolean {
    if (disposed) throw new Error('Seed town view is disposed');
    const lists = byKit(plan);
    for (const kit of lists.keys()) if (!kits.has(kit)) throw new Error(`Seed town plan names an unknown kit: ${kit}`);
    let replaced = false, instances = 0, draws = 0, triangles = 0;
    for (const slot of slots) {
      const { kit, part } = slot, places = lists.get(kit.id) ?? [];
      const shown = places.filter(place => shows(part.spec, kit.declaration, place.values as ParamValues));
      // Two instances at least: three reads per-instance morph weights only when a mesh has more than one.
      const count = Math.max(2, shown.length);
      if (!slot.mesh || count > slot.capacity) {
        if (slot.mesh) { root.remove(slot.mesh); slot.mesh.dispose(); }
        slot.capacity = Math.max(4, Math.ceil(count * 1.3));
        slot.mesh = createMesh(slot, slot.capacity);
        root.add(slot.mesh);
        replaced = true;
      }
      const mesh = slot.mesh, targets = part.spec.targets.length;
      const morph = targets ? (mesh.morphTexture!.image.data as Float32Array) : null;
      influence.length = targets;
      for (let i = 0; i < count; i++) {
        const place = shown[i];
        if (!place) {
          mesh.setMatrixAt(i, none);
          if (morph) morph.fill(0, i * (targets + 1), (i + 1) * (targets + 1));
          if (part.spec.colour) mesh.setColorAt(i, tint.setRGB(1, 1, 1));
          continue;
        }
        mesh.setMatrixAt(i, placementMatrix(place, matrix));
        if (morph) {
          weights(kit.id, part.spec, kit.declaration, place.values as ParamValues, influence);
          // Column 0 is the base influence, 1 for relative targets; the targets follow.
          morph[i * (targets + 1)] = 1;
          for (let t = 0; t < targets; t++) morph[i * (targets + 1) + 1 + t] = influence[t]!;
        }
        if (part.spec.colour) {
          const colour = valueOf(kit.declaration, place.values as ParamValues, part.spec.colour);
          if (typeof colour !== 'string') throw new Error(`Kit ${kit.id}: colour ${part.spec.colour} has no value`);
          mesh.setColorAt(i, tint.set(colour));
        }
      }
      mesh.count = count;
      mesh.visible = shown.length > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (mesh.morphTexture) mesh.morphTexture.needsUpdate = true;
      slot.used = shown.length;
      if (shown.length) {
        draws += 1;
        instances += shown.length;
        const geometry = part.geometry;
        triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3 * shown.length;
      }
    }
    Object.assign(stats, { placements: plan.placements.length, instances, draws, triangles: Math.round(triangles) });
    return replaced;
  }

  return {
    root, stats, apply,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      // The pack owns the kit geometry, materials and textures; only the instance buffers are ours.
      for (const slot of slots) { slot.mesh?.dispose(); slot.mesh = null; }
      root.clear();
    },
  };
}

const vertex = new Vector3();

/**
 * The positions of one placement's part with its sizes applied, in world space, appended to `out`.
 * Used for collision and bounds: the page never reads the instanced meshes back.
 */
export function bakePart(kit: Kit, part: KitPart, place: TownPlacement, out: number[], offset?: Vector3): void {
  const base = part.geometry.getAttribute('position'), deltas = part.geometry.morphAttributes.position ?? [];
  const influence: number[] = [];
  weights(kit.id, part.spec, kit.declaration, place.values as ParamValues, influence);
  placementMatrix(place, matrix);
  const index = part.geometry.index;
  const corner = (i: number) => {
    vertex.fromBufferAttribute(base, i);
    for (let t = 0; t < deltas.length; t++) {
      const w = influence[t] ?? 0;
      if (!w) continue;
      const delta = deltas[t]!;
      vertex.x += delta.getX(i) * w; vertex.y += delta.getY(i) * w; vertex.z += delta.getZ(i) * w;
    }
    vertex.applyMatrix4(matrix);
    if (offset) vertex.add(offset);
    out.push(vertex.x, vertex.y, vertex.z);
  };
  if (index) for (let i = 0; i < index.count; i++) corner(index.getX(i));
  else for (let i = 0; i < base.count; i++) corner(i);
}

/** Triangles of every shown part of the given kits, as a flat list of world positions. */
export function bakeKits(kits: ReadonlyMap<string, Kit>, plan: TownPlan, ids: readonly string[], offset?: Vector3): Float32Array {
  const out: number[] = [];
  for (const place of plan.placements) {
    if (!ids.includes(place.kit)) continue;
    const kit = kits.get(place.kit);
    if (!kit) throw new Error(`Seed town plan names an unknown kit: ${place.kit}`);
    for (const part of kit.parts) if (shows(part.spec, kit.declaration, place.values as ParamValues)) bakePart(kit, part, place, out, offset);
  }
  return new Float32Array(out);
}

/** The world box of one placement's shown parts. */
export function placementBox(kits: ReadonlyMap<string, Kit>, place: TownPlacement, target: Box3, offset?: Vector3): Box3 {
  const kit = kits.get(place.kit);
  if (!kit) throw new Error(`Seed town plan names an unknown kit: ${place.kit}`);
  const out: number[] = [];
  for (const part of kit.parts) if (shows(part.spec, kit.declaration, place.values as ParamValues)) bakePart(kit, part, place, out, offset);
  target.makeEmpty();
  for (let i = 0; i < out.length; i += 3) target.expandByPoint(vertex.set(out[i]!, out[i + 1]!, out[i + 2]!));
  return target;
}

export type { Material };
