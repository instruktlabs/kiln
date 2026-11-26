/**
 * The town as instances of the kit parts. Each drawn part of each kit is one InstancedMesh for the
 * whole town; a placement contributes an instance to every part its options show. The instance
 * carries the placement's matrix, its size weights and its colour. A new seed rewrites those buffers
 * and nothing else: the kit geometry, materials and textures are loaded once. The sizes are applied
 * by one shader node for every part (morph.ts), not by three's morph targets.
 */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, BoxGeometry, BufferGeometry, Color, Group, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardNodeMaterial, Quaternion, Vector3, Vector4 } from 'three/webgpu';
import type { Material, Mesh, MeshStandardMaterial, Texture } from 'three/webgpu';
import { abs, normalWorld, positionWorld, select, texture, vec2 } from 'three/tsl';
import { kitSpec, shows, valueOf, weights } from './kit-spec';
import { bindMorph, deltaTexture, MORPH, packDeltas, weightRows, weightTexture, withMorph } from './morph';
import type { MorphTextures, PartMorph } from './morph';
import type { KitDeclaration, KitGltf, KitMeshSpec, ParamValues } from './kit-spec';
import type { TownPlacement, TownPlan } from './plan/town-plan.js';

export interface KitPart {
  spec: KitMeshSpec;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /** Glass and glow receive no sun shadow. */
  shadows: boolean;
  /** Whether it casts into the sun's shadow map; when absent, the same as `shadows`. Window panes cast: see castsSun. */
  casts?: boolean;
}
export interface Kit { id: string; declaration: KitDeclaration; parts: KitPart[] }

export const KIT_IDS = ['facade-bay', 'ground-bay', 'roof', 'paving', 'junction', 'street-lamp', 'signage', 'street-furniture', 'tree'] as const;
export type KitId = typeof KIT_IDS[number];

/**
 * The roof kit's walls, drawn with their texture laid in world space. Their sizes are morph targets, so
 * coordinates fixed in the file would stretch: the side walls below the eaves (up to 16 m tall) carry a
 * plain tone in the file for that reason. Here the gables, side and back walls all take the render or the
 * brickwork at its own scale, so one wall reads as one surface at any height. Tile sizes are the roof
 * kit's own (its TEX table): render 2.4 m, brick 0.9 m. A vertical face takes the plane it faces, as the
 * kit's own coordinates do.
 */
const ROOF_WALLS: Record<string, { texture: 'wall' | 'wall-brick'; tile: number }> = {
  wall: { texture: 'wall', tile: 2.4 },
  'wall-side': { texture: 'wall', tile: 2.4 },
  'wall-brick': { texture: 'wall-brick', tile: 0.9 },
  'wall-brick-side': { texture: 'wall-brick', tile: 0.9 },
};
const worldWalls = new WeakMap<MeshStandardMaterial, MeshStandardMaterial>();

function worldWall(source: MeshStandardMaterial, map: Texture, tile: number): MeshStandardMaterial {
  const known = worldWalls.get(source);
  if (known) return known;
  const material = new MeshStandardNodeMaterial({
    name: source.name, color: source.color, roughness: source.roughness, metalness: source.metalness, side: source.side, map,
  });
  const across = select(abs(normalWorld.x).greaterThanEqual(abs(normalWorld.z)), positionWorld.z, positionWorld.x);
  material.colorNode = texture(map, vec2(across, positionWorld.y).div(tile));
  const made = material as unknown as MeshStandardMaterial;
  worldWalls.set(source, made);
  return made;
}

/** Pair a loaded kit file with its declaration. Colour-driven materials turn white: each instance brings its own colour. */
export function readKit(id: string, gltf: GLTF, declaration: KitDeclaration): Kit {
  const kit = readKitParts(id, gltf, declaration);
  if (id !== 'roof') return kit;
  const maps = new Map<string, Texture>();
  for (const part of kit.parts) if (part.material.map && (part.material.name === 'wall' || part.material.name === 'wall-brick')) maps.set(part.material.name, part.material.map);
  for (const part of kit.parts) {
    const wall = ROOF_WALLS[part.material.name], map = wall && maps.get(wall.texture);
    if (wall && map) part.material = worldWall(part.material, map, wall.tile);
  }
  return kit;
}

const CLEAR = /glass|glow|water/i, PANE = /glass|glow/i;

/**
 * Whether a part of a kit casts into the sun's shadow map. A window pane does, though it takes no shadow: the walls are
 * single faces and the shadow pass draws only those turned from the sun, so a ray entering by a building's back would
 * otherwise leave by its windows and light the pavement in the building's own shade. Trees stand outside the shadow map,
 * which is kept tight on the streets; their shade is drawn on the ground.
 */
export function castsSun(kit: string, material: string, transparent: boolean): boolean {
  if (kit === 'tree') return false;
  return PANE.test(material) || !(transparent || CLEAR.test(material));
}

/** How far behind a bay's front plane its backing stands (a wall is 0.3 m deep) and how thick it is, metres. */
export const BACKING = { back: 0.34, thick: 0.04, colour: 0x0a0d0e };

/**
 * The dark slab behind a bay, as tall and wide as the bay. The buildings are hollow and their walls show one face, so
 * without it a hairline between a pane and its frame, seen from the side or from below, shows the sky through the
 * building. A passage has its own tunnel and takes none.
 */
export function backingOf(place: TownPlacement, declaration: KitDeclaration): { height: number; width: number } | null {
  if (place.kit !== 'facade-bay' && place.kit !== 'ground-bay') return null;
  const value = (name: string) => valueOf(declaration, place.values as ParamValues, name);
  if (value('front') === 'passage') return null;
  const height = Number(value(place.kit === 'ground-bay' ? 'shopHeight' : 'storeyHeight')), width = Number(value('bayWidth'));
  return height > 0 && width > 0 ? { height, width } : null;
}

function readKitParts(id: string, gltf: GLTF, declaration: KitDeclaration): Kit {
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
    const clear = material.transparent === true || CLEAR.test(material.name);
    return { spec: part, geometry: mesh.geometry, material, shadows: !clear, casts: castsSun(id, material.name, material.transparent === true) };
  });
  return { id, declaration, parts };
}

interface Slot {
  kit: Kit; part: KitPart; mesh: InstancedMesh | null; capacity: number; used: number;
  /** The part's geometry as it is drawn: the kit's own attributes and index, without its morph targets. */
  geometry: BufferGeometry;
  morph: PartMorph;
}

/** A geometry that shares `source`'s vertex buffers and index and carries none of its morph targets. */
function drawnGeometry(source: BufferGeometry): BufferGeometry {
  const drawn = new BufferGeometry();
  drawn.name = source.name;
  for (const [name, attribute] of Object.entries(source.attributes)) drawn.setAttribute(name, attribute);
  drawn.setIndex(source.index);
  for (const group of source.groups) drawn.addGroup(group.start, group.count, group.materialIndex);
  drawn.setDrawRange(source.drawRange.start, source.drawRange.count);
  return drawn;
}

export interface TownStats { placements: number; instances: number; draws: number; triangles: number; parts: number }
export interface TownView {
  readonly root: Group;
  readonly stats: TownStats;
  /** Rewrite the instance buffers for a plan. Returns true when a mesh was replaced, so shadow tracking must be renewed. */
  apply(plan: TownPlan): boolean;
  dispose(): void;
}

const position = new Vector3(), scale = new Vector3(1, 1, 1), rotation = new Quaternion(), up = new Vector3(0, 1, 0);
const matrix = new Matrix4(), tint = new Color();

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
  const mesh = new InstancedMesh(slot.geometry, withMorph(part.material), capacity);
  bindMorph(mesh, slot.morph);
  mesh.name = `${kit.id}:${part.spec.name}`;
  mesh.castShadow = part.casts ?? part.shadows;
  mesh.receiveShadow = part.shadows;
  // One mesh spans the whole town, and its sizes move vertices beyond the geometry's own bounds.
  mesh.frustumCulled = false;
  return mesh;
}

export function createTownView(kits: ReadonlyMap<string, Kit>): TownView {
  const root = new Group();
  root.name = 'Seed town';
  const sources: KitPart[] = [];
  for (const kit of kits.values()) for (const part of kit.parts) {
    const count = part.geometry.morphAttributes.position?.length ?? 0;
    if (count !== part.spec.targets.length) throw new Error(`Kit ${kit.id}: part ${part.spec.name} has ${count} morph targets, its spec ${part.spec.targets.length}`);
    sources.push(part);
  }
  // Every part's size deltas in one texture, every instance's turn and weights in another: see morph.ts.
  const atlas = packDeltas(sources.map(part => part.geometry));
  const shared: MorphTextures = { deltas: deltaTexture(atlas), weights: weightTexture(0) };
  const slots: Slot[] = [];
  let next = 0;
  for (const kit of kits.values()) for (const part of kit.parts) {
    const block = atlas.blocks[next++]!;
    slots.push({ kit, part, mesh: null, capacity: 0, used: 0, geometry: drawnGeometry(part.geometry), morph: { shared, info: new Vector4(block.row, block.targets, block.vertices, 0) } });
  }
  const stats: TownStats = { placements: 0, instances: 0, draws: 0, triangles: 0, parts: slots.length };
  const influence: number[] = [];
  let disposed = false;
  // One more draw for the whole town: the slab behind every bay.
  const slab = new BoxGeometry(1, 1, 1), dark = new MeshBasicMaterial({ color: BACKING.colour });
  dark.name = 'bay-backing';
  let backing: InstancedMesh | null = null, backingCapacity = 0;
  const local = new Matrix4(), centre = new Vector3(), size = new Vector3(), level = new Quaternion();

  /** Returns true when the backing mesh was replaced. */
  function back(plan: TownPlan): boolean {
    const slabs: { place: TownPlacement; height: number; width: number }[] = [];
    for (const place of plan.placements) {
      const kit = kits.get(place.kit), fit = kit && backingOf(place, kit.declaration);
      if (fit) slabs.push({ place, ...fit });
    }
    let replaced = false;
    if (slabs.length > backingCapacity) {
      if (backing) { root.remove(backing); backing.dispose(); }
      backingCapacity = Math.ceil(slabs.length * 1.3);
      backing = new InstancedMesh(slab, dark, backingCapacity);
      backing.name = 'Bay backing';
      backing.castShadow = true;
      backing.frustumCulled = false;
      root.add(backing);
      replaced = true;
    }
    if (!backing) return false;
    const mesh = backing;
    slabs.forEach(({ place, height, width }, i) => {
      // The kit's -X runs into the building; a bay stands on its placement and runs along +Z.
      local.compose(centre.set(-BACKING.back - BACKING.thick / 2, height / 2, width / 2), level, size.set(BACKING.thick, height, width));
      mesh.setMatrixAt(i, placementMatrix(place, matrix).multiply(local));
    });
    mesh.count = slabs.length;
    mesh.visible = slabs.length > 0;
    mesh.instanceMatrix.needsUpdate = true;
    return replaced;
  }

  function apply(plan: TownPlan): boolean {
    if (disposed) throw new Error('Seed town view is disposed');
    const lists = byKit(plan);
    for (const kit of lists.keys()) if (!kits.has(kit)) throw new Error(`Seed town plan names an unknown kit: ${kit}`);
    let replaced = false, instances = 0, draws = 0, triangles = 0;
    const lineup = slots.map(slot => (lists.get(slot.kit.id) ?? []).filter(place => shows(slot.part.spec, slot.kit.declaration, place.values as ParamValues)));
    const rows = weightRows(slots.map((slot, i) => ({ count: lineup[i]!.length, targets: slot.part.spec.targets.length })));
    if (rows.texels > shared.weights.image.data!.length) {
      // Every mesh reads the weights through `shared`, so the larger texture reaches them all at once.
      shared.weights.dispose();
      shared.weights = weightTexture(rows.texels, Math.ceil(rows.texels / MORPH.width * 1.5));
    }
    const morph = shared.weights.image.data as Float32Array;
    slots.forEach((slot, order) => {
      const { kit, part } = slot, shown = lineup[order]!, count = shown.length;
      if (!slot.mesh || count > slot.capacity) {
        if (slot.mesh) { root.remove(slot.mesh); slot.mesh.dispose(); }
        slot.capacity = Math.max(4, Math.ceil(count * 1.3));
        slot.mesh = createMesh(slot, slot.capacity);
        root.add(slot.mesh);
        replaced = true;
      }
      const mesh = slot.mesh, targets = part.spec.targets.length, base = rows.bases[order]!, stride = MORPH.head + targets;
      slot.morph.info.w = base;
      influence.length = targets;
      for (let i = 0; i < count; i++) {
        const place = shown[i]!, at = base + i * stride, turn = place.yaw * Math.PI / 180;
        mesh.setMatrixAt(i, placementMatrix(place, matrix));
        // The node turns a size delta as the placement turns the part: see placementMatrix.
        morph[at] = Math.cos(turn);
        morph[at + 1] = Math.sin(turn);
        if (targets) {
          weights(kit.id, part.spec, kit.declaration, place.values as ParamValues, influence);
          for (let t = 0; t < targets; t++) morph[at + MORPH.head + t] = influence[t]!;
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
      slot.used = shown.length;
      if (shown.length) {
        draws += 1;
        instances += shown.length;
        const geometry = part.geometry;
        triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3 * shown.length;
      }
    });
    shared.weights.needsUpdate = true;
    if (back(plan)) replaced = true;
    if (backing?.visible) { draws += 1; triangles += 12 * backing.count; }
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
      // The drawn geometries and the two morph textures are ours as well; the vertex buffers they point at are the pack's.
      for (const slot of slots) { slot.mesh?.dispose(); slot.mesh = null; slot.geometry.dispose(); }
      shared.deltas.dispose(); shared.weights.dispose();
      backing?.dispose(); backing = null;
      slab.dispose(); dark.dispose();
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
