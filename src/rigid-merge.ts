/**
 * Rigid-group merge: the draw-call step proposed for `optimize: 'full'`.
 *
 * A rigid group is a scene, or a boundary node, plus every descendant that is not itself a
 * boundary. Nothing in one group moves against the rest of it at runtime, so primitives that
 * share a material and vertex layout are baked into a well-conditioned contributing node's frame
 * and joined into fewer draws. No node is removed, renamed or reparented; a node whose
 * primitives all moved keeps its name with no mesh.
 *
 * Boundaries: animation targets, skin joints, `Joint_*` pivots (`hasJointPivots`' rule), nodes
 * with any extras (a superset of Kiln semantic metadata), nodes a semantic relationship names
 * (`targetType: 'node'`, resolved by name in `assembly.ts`), `KHR_node_visibility`, `MSFT_lod`,
 * shared scene entry points, and names the caller keeps. A boundary's own primitives never move.
 *
 * Contract: the merge keeps every node name and the geometry of every boundary. It does NOT keep
 * the geometry of a named non-boundary node: `Roadway` may come back holding its group's other
 * parts, or empty. A consumer that addresses nodes by name must list them in `keep`, or not merge;
 * `unmatchedKeep` reports kept names that no scene node carries.
 *
 * A mesh several nodes share is baked once per user that merges. Additional geometry bytes are
 * capped at 4 KiB per saved draw, after the 65,534-vertex split and accounting for originals that
 * remain in use. `expandSharedMeshes: false` locks shared users instead.
 *
 * Locked, never moved or joined: skinned or GPU-instanced nodes, meshes with extras, nodes with a
 * singular world matrix, primitives with morph targets, extensions or extras, strip/fan/loop
 * modes (a join inserts restart indices, which needs `KHR_mesh_primitive_restart`), primitives
 * without POSITION, `KHR_materials_volume` (thickness is in node space) and, unless
 * `mergeTransparent`, BLEND or transmissive materials: three sorts transparency per object, so a
 * joined draw would freeze one triangle order for every viewpoint.
 *
 * Tangents are baked here, not with gltf-transform's `transformPrimitive` (4.5.0's
 * `applyTangentMatrix` reads x after overwriting it and never flips w): xyz through the upper
 * 3x3, normalised, w *= sign(det). Renderers disagree on mirrored frames. three r186 builds the
 * bitangent as cross(N, T) * w with no determinant term (`normal_vertex.glsl.js:9`,
 * `nodes/accessors/Bitangent.js:58`); a renderer that applies the world determinant does not. So
 * by default a tangent-bearing primitive joins only parts of the same world handedness, where both
 * agree; `mergeMirroredTangents` joins across handedness and keeps the determinant-corrected frame.
 *
 * Each bucket is built and checked detached from the scene before anything is removed; a bucket
 * that fails leaves its primitives untouched and is reported in `rejected`.
 */
import {
  type Accessor,
  ComponentTypeToTypedArray,
  type Document,
  type Material,
  type Mesh,
  type Node,
  Primitive,
  type Property,
  PropertyType,
  type Transform,
} from '@gltf-transform/core';
import { createTransform, dequantizePrimitive, joinPrimitives } from '@gltf-transform/functions';
import * as THREE from 'three';
import { KILN_SEMANTIC_EXTRAS_KEY, type SemanticRelationshipV1 } from './contracts/semantic';
import { type Lod, MSFT_LOD } from './gltf-io';

export type RigidBoundaryReason =
  | 'animated'
  | 'skin-joint'
  | 'joint-pivot'
  | 'extras'
  | 'relationship-target'
  | 'visibility'
  | 'lod'
  | 'shared-scene'
  | 'kept';

export type RigidLockReason =
  | 'boundary'
  | 'skinned'
  | 'instanced'
  | 'mesh-extras'
  | 'shared-mesh'
  | 'shared-byte-budget'
  | 'singular-matrix'
  | 'morph-targets'
  | 'primitive-mode'
  | 'primitive-extensions'
  | 'primitive-extras'
  | 'no-position'
  | 'transparent'
  | 'volume';

export interface RigidMergeOptions {
  /** Node names to treat as boundaries: parts a consumer finds by name. */
  keep?: readonly string[];
  /** Join BLEND and transmissive primitives too (fixes their triangle order). */
  mergeTransparent?: boolean;
  /** Join tangent-bearing primitives across world handedness (see the module note). */
  mergeMirroredTangents?: boolean;
  /**
   * Permit shared-mesh copies within the 4 KiB per saved draw budget (default true).
   * False locks every user as `shared-mesh`.
   */
  expandSharedMeshes?: boolean;
}

export interface RigidMergeSummary {
  /** Primitives on scene nodes, before and after; a GPU-instanced node counts once. */
  primitivesBefore: number;
  primitivesAfter: number;
  /** Rigid groups walked: one per scene plus one per boundary. */
  groups: number;
  /** Buckets joined into fewer primitives, after the vertex-limit split. */
  merges: number;
  boundaries: { node: string; reasons: RigidBoundaryReason[] }[];
  locked: { node: string; reason: RigidLockReason; primitives: number }[];
  /** Buckets left as authored because building or checking the join failed. */
  rejected: { node: string; primitives: number; error: string }[];
  /** `keep` names no scene node carries: a misspelt or off-scene name protects nothing. */
  unmatchedKeep: string[];
  /** Set when nothing ran: an animation channel without a target node cannot be bounded. */
  skipped?: 'unbounded-animation';
}

interface Entry {
  node: Node;
  prim: Primitive;
}

const JOINT_PIVOT = /^joint[_-]/i;
/** LINE_LOOP, LINE_STRIP, TRIANGLE_STRIP, TRIANGLE_FAN. */
const RESTART_MODES: ReadonlySet<number> = new Set([2, 3, 5, 6]);
const BAKED = /^(POSITION|NORMAL|TANGENT)$/;
const MAX_VERTICES = 65_534;
const MAX_BYTES_PER_SAVED_DRAW = 4_096;

const hasKeys = (value: object) => Object.keys(value).length > 0;
const worldOf = (node: Node) => new THREE.Matrix4().fromArray(node.getWorldMatrix());
const nodeUsers = (mesh: Mesh) =>
  mesh.listParents().filter((parent) => parent.propertyType === PropertyType.NODE).length;

/** |det| against the column lengths, so a tiny part is not mistaken for a flat one. */
function isSingular(matrix: THREE.Matrix4): boolean {
  const e = matrix.elements;
  const scale =
    Math.hypot(e[0]!, e[1]!, e[2]!) *
    Math.hypot(e[4]!, e[5]!, e[6]!) *
    Math.hypot(e[8]!, e[9]!, e[10]!);
  const det = matrix.determinant();
  return !Number.isFinite(det) || Math.abs(det) <= 1e-9 * scale;
}

export function findRigidBoundaries(
  doc: Document,
  keep: ReadonlySet<string>,
): Map<Node, RigidBoundaryReason[]> {
  const root = doc.getRoot();
  const found = new Map<Node, RigidBoundaryReason[]>();
  const add = (node: Node, reason: RigidBoundaryReason) => {
    const reasons = found.get(node) ?? [];
    if (!reasons.includes(reason)) reasons.push(reason);
    found.set(node, reasons);
  };
  for (const animation of root.listAnimations())
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode();
      if (target) add(target, 'animated');
    }
  for (const skin of root.listSkins())
    for (const joint of skin.listJoints()) add(joint, 'skin-joint');
  const targets = new Set<string>();
  for (const node of root.listNodes()) {
    const semantic = node.getExtras()[KILN_SEMANTIC_EXTRAS_KEY] as
      | { relationships?: unknown }
      | undefined;
    if (Array.isArray(semantic?.relationships))
      for (const relationship of semantic.relationships as Partial<SemanticRelationshipV1>[])
        if (relationship?.targetType === 'node' && typeof relationship.target === 'string')
          targets.add(relationship.target);
  }
  for (const node of root.listNodes()) {
    const name = node.getName();
    const sceneParents = node
      .listParents()
      .filter((parent) => parent.propertyType === PropertyType.SCENE).length;
    // Scene roots can be shared; nodes otherwise have a single parent. Only
    // merges wholly inside a shared subtree are safe in every scene using it.
    if (sceneParents > 1) add(node, 'shared-scene');
    if (JOINT_PIVOT.test(name)) add(node, 'joint-pivot');
    if (hasKeys(node.getExtras())) add(node, 'extras');
    if (targets.has(name)) add(node, 'relationship-target');
    if (node.getExtension('KHR_node_visibility')) add(node, 'visibility');
    const lod = node.getExtension<Lod>(MSFT_LOD);
    if (lod) {
      add(node, 'lod');
      for (const level of lod.listLevels())
        if (level.propertyType === PropertyType.NODE) add(level as Node, 'lod');
    }
    if (keep.has(name)) add(node, 'kept');
  }
  return found;
}

function nodeLock(
  node: Node,
  mesh: Mesh,
  world: THREE.Matrix4,
  expandShared: boolean,
): RigidLockReason | undefined {
  if (node.getSkin()) return 'skinned';
  if (node.getExtension('EXT_mesh_gpu_instancing')) return 'instanced';
  if (hasKeys(mesh.getExtras())) return 'mesh-extras';
  if (!expandShared && nodeUsers(mesh) > 1) return 'shared-mesh';
  if (isSingular(world)) return 'singular-matrix';
  return undefined;
}

function primLock(prim: Primitive, mergeTransparent: boolean): RigidLockReason | undefined {
  if (prim.listTargets().length > 0) return 'morph-targets';
  if (RESTART_MODES.has(prim.getMode())) return 'primitive-mode';
  if (prim.listExtensions().length > 0) return 'primitive-extensions';
  if (hasKeys(prim.getExtras())) return 'primitive-extras';
  if (!prim.getAttribute('POSITION')) return 'no-position';
  const material = prim.getMaterial();
  if (material?.getExtension('KHR_materials_volume')) return 'volume';
  if (
    !mergeTransparent &&
    material &&
    (material.getAlphaMode() === 'BLEND' ||
      material.getExtension('KHR_materials_transmission') ||
      material.getExtension('KHR_materials_diffuse_transmission'))
  )
    return 'transparent';
  return undefined;
}

/** gltf-transform's join key (`createPrimGroupKey`, not exported) plus `normalized`. */
function bucketKey(
  prim: Primitive,
  materials: ReadonlyMap<Material | null, number>,
  handedness: number | null,
): string {
  const layout = prim
    .listSemantics()
    .sort()
    .map((semantic) => {
      const a = prim.getAttribute(semantic)!;
      return `${semantic}:${a.getElementSize()}:${a.getComponentType()}:${a.getNormalized()}`;
    })
    .join('+');
  const hand = handedness !== null && prim.getAttribute('TANGENT') ? `|${handedness}` : '';
  return `${materials.get(prim.getMaterial()) ?? -1}|${prim.getMode()}|${!!prim.getIndices()}|${layout}${hand}`;
}

function reverseWinding(prim: Primitive): void {
  const indices = prim.getIndices()?.getArray();
  const swap = (array: { [i: number]: number }, size: number, i: number) => {
    for (let k = 0; k < size; k++) {
      const [j, l] = [(i + 1) * size + k, (i + 2) * size + k];
      [array[j], array[l]] = [array[l]!, array[j]!];
    }
  };
  if (indices) {
    for (let i = 0; i + 2 < indices.length; i += 3) swap(indices, 1, i);
    return;
  }
  for (const semantic of prim.listSemantics()) {
    const attribute = prim.getAttribute(semantic)!;
    for (let i = 0; i + 2 < attribute.getCount(); i += 3)
      swap(attribute.getArray()!, attribute.getElementSize(), i);
  }
}

/** Bake `matrix` into a dequantized primitive copy. */
function bake(prim: Primitive, matrix: THREE.Matrix4): void {
  const linear = new THREE.Matrix3().setFromMatrix4(matrix);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const mirrored = matrix.determinant() < 0;
  const v = new THREE.Vector3();
  const each = (semantic: string, apply: (element: number[]) => void) => {
    const attribute = prim.getAttribute(semantic);
    const element: number[] = [];
    for (let i = 0; i < (attribute?.getCount() ?? 0); i++) {
      apply(attribute!.getElement(i, element));
      attribute!.setElement(i, element);
    }
  };
  each('POSITION', (e) => v.fromArray(e).applyMatrix4(matrix).toArray(e));
  each('NORMAL', (e) => v.fromArray(e).applyMatrix3(normalMatrix).normalize().toArray(e));
  each('TANGENT', (e) => {
    v.fromArray(e).applyMatrix3(linear).normalize().toArray(e);
    if (mirrored) e[3] = -e[3]!;
  });
  if (mirrored && prim.getMode() === Primitive.Mode.TRIANGLES) reverseWinding(prim);
}

const accessorsOf = (prim: Primitive): Accessor[] => {
  const indices = prim.getIndices();
  return indices ? [...prim.listAttributes(), indices] : prim.listAttributes();
};

/** Prefer the least anisotropic frame, then scales closest to unit; input order breaks ties. */
function destinationOf(entries: Entry[]): Node {
  let chosen = entries[0]!.node;
  let best = Infinity;
  let bestScale = Infinity;
  for (const { node } of entries) {
    const linear = new THREE.Matrix3().setFromMatrix4(worldOf(node));
    const norm = Math.hypot(...linear.elements);
    const inverseNorm = Math.hypot(...linear.clone().invert().elements);
    const condition = norm * inverseNorm;
    const scale = Math.max(norm, inverseNorm);
    if (
      condition < best * (1 - 1e-12) ||
      (Math.abs(condition - best) <= best * 1e-12 && scale < bestScale)
    ) {
      chosen = node;
      best = condition;
      bestScale = scale;
    }
  }
  return chosen;
}

/** Float32 storage in a distant frame must not erase detail that the original node retained. */
function checkPositionPrecision(
  input: Accessor,
  output: Accessor,
  sourceWorld: THREE.Matrix4,
  destinationWorld: THREE.Matrix4,
  reversed: boolean,
): void {
  const expected = new THREE.Vector3();
  const actual = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const element: number[] = [];
  let error = 0;
  let magnitude = 0;
  for (let i = 0; i < input.getCount(); i++) {
    const out = reversed ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
    expected.fromArray(input.getElement(i, element)).applyMatrix4(sourceWorld);
    actual.fromArray(output.getElement(out, element)).applyMatrix4(destinationWorld);
    bounds.expandByPoint(expected);
    error = Math.max(error, expected.distanceTo(actual));
    magnitude = Math.max(magnitude, expected.length());
  }
  const tolerance = Math.max(
    bounds.getSize(expected).length() * 1e-6,
    magnitude * Number.EPSILON * 32,
    Number.EPSILON,
  );
  if (error > tolerance) throw new Error('rigid merge: destination frame loses position precision');
}

/** Split complete points/lines/triangles, remapping every vertex attribute together. */
function splitVertices(prim: Primitive, created: Property[]): Primitive[] {
  if (prim.getAttribute('POSITION')!.getCount() <= MAX_VERTICES) return [prim];
  const width =
    prim.getMode() === Primitive.Mode.POINTS ? 1 : prim.getMode() === Primitive.Mode.LINES ? 2 : 3;
  const sourceIndices = prim.getIndices()?.getArray();
  const count = sourceIndices?.length ?? prim.getAttribute('POSITION')!.getCount();
  if (count % width !== 0) throw new Error('rigid merge: incomplete primitive element');
  const chunks: Primitive[] = [];
  let remap = new Map<number, number>();
  let indices: number[] = [];
  const flush = () => {
    if (!indices.length) return;
    const chunk = prim.clone();
    created.push(chunk);
    const vertices = [...remap.keys()];
    for (const semantic of prim.listSemantics()) {
      const source = prim.getAttribute(semantic)!;
      const size = source.getElementSize();
      const ArrayType = ComponentTypeToTypedArray[source.getComponentType()];
      if (!ArrayType) throw new Error(`rigid merge: unsupported component type for ${semantic}`);
      const data = new ArrayType(vertices.length * size);
      const sourceData = source.getArray()!;
      for (const [out, input] of vertices.entries())
        data.set(sourceData.subarray(input * size, (input + 1) * size), out * size);
      const attribute = source.clone().setArray(data);
      created.push(attribute);
      chunk.setAttribute(semantic, attribute);
    }
    if (prim.getIndices()) {
      const accessor = prim.getIndices()!.clone().setArray(new Uint16Array(indices));
      created.push(accessor);
      chunk.setIndices(accessor);
    }
    chunks.push(chunk);
    remap = new Map();
    indices = [];
  };
  for (let offset = 0; offset < count; offset += width) {
    const element = Array.from(
      { length: width },
      (_, i) => sourceIndices?.[offset + i] ?? offset + i,
    );
    const extra = new Set(element.filter((index) => !remap.has(index))).size;
    if (remap.size + extra > MAX_VERTICES) flush();
    for (const index of element) {
      if (!remap.has(index)) remap.set(index, remap.size);
      indices.push(remap.get(index)!);
    }
  }
  flush();
  for (const property of [prim, ...accessorsOf(prim)]) property.dispose();
  return chunks;
}

/** Join one bucket into detached, checked primitives without touching the originals. */
function prepare(entries: Entry[], dst: Node, created: Property[]): Primitive[] {
  const destinationWorld = worldOf(dst);
  const inverse = destinationWorld.clone().invert();
  const copies = entries.map(({ node, prim }) => {
    const copy = prim.clone();
    created.push(copy);
    for (const semantic of copy.listSemantics()) {
      const attribute = copy.getAttribute(semantic)!.clone();
      created.push(attribute);
      copy.setAttribute(semantic, attribute);
    }
    const indices = copy.getIndices()?.clone();
    if (indices) {
      created.push(indices);
      copy.setIndices(indices);
    }
    dequantizePrimitive(copy, { pattern: BAKED });
    if (node !== dst) {
      const sourceWorld = worldOf(node);
      const matrix = inverse.clone().multiply(sourceWorld);
      bake(copy, matrix);
      const reversed =
        !copy.getIndices() &&
        copy.getMode() === Primitive.Mode.TRIANGLES &&
        matrix.determinant() < 0;
      checkPositionPrecision(
        prim.getAttribute('POSITION')!,
        copy.getAttribute('POSITION')!,
        sourceWorld,
        destinationWorld,
        reversed,
      );
    }
    return copy;
  });
  const merged = joinPrimitives(copies);
  created.push(merged, ...accessorsOf(merged));
  for (const semantic of ['POSITION', 'NORMAL', 'TANGENT']) {
    const array = merged.getAttribute(semantic)?.getArray();
    if (array && !array.every(Number.isFinite))
      throw new Error(`rigid merge: non-finite ${semantic} in the joined primitive`);
  }
  const elements = (p: Primitive) =>
    p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount();
  const expected = copies.reduce((sum, copy) => sum + elements(copy), 0);
  if (elements(merged) !== expected)
    throw new Error(`rigid merge: joined ${elements(merged)} of ${expected} elements`);
  for (const copy of copies)
    for (const property of [copy, ...accessorsOf(copy)]) property.dispose();
  return splitVertices(merged, created);
}

/** Bytes guaranteed to disappear when these exact node/primitive uses are removed. */
function removableBytes(entries: Entry[]): number {
  const uses = new Map<Primitive, Set<Node>>();
  for (const { node, prim } of entries) {
    const nodes = uses.get(prim) ?? new Set<Node>();
    nodes.add(node);
    uses.set(prim, nodes);
  }
  const removed = new Set<Primitive>();
  for (const [prim, nodes] of uses) {
    const retained = prim.listParents().some((parent) => {
      if (parent.propertyType === PropertyType.ROOT) return false;
      if (parent.propertyType !== PropertyType.MESH) return true;
      return parent
        .listParents()
        .some(
          (user) =>
            user.propertyType !== PropertyType.ROOT &&
            (user.propertyType !== PropertyType.NODE || !nodes.has(user as Node)),
        );
    });
    if (!retained) removed.add(prim);
  }
  const accessors = new Set([...removed].flatMap(accessorsOf));
  let bytes = 0;
  for (const accessor of accessors)
    if (
      accessor
        .listParents()
        .every(
          (parent) => parent.propertyType === PropertyType.ROOT || removed.has(parent as Primitive),
        )
    )
      bytes += accessor.getArray()?.byteLength ?? 0;
  return bytes;
}

const primitiveBytes = (primitives: Primitive[]) =>
  [...new Set(primitives.flatMap(accessorsOf))].reduce(
    (sum, a) => sum + (a.getArray()?.byteLength ?? 0),
    0,
  );

function sceneNodes(doc: Document): Set<Node> {
  const seen = new Set<Node>();
  const visit = (node: Node): void => {
    if (seen.has(node)) return;
    seen.add(node);
    for (const child of node.listChildren()) visit(child);
  };
  for (const scene of doc.getRoot().listScenes())
    for (const child of scene.listChildren()) visit(child);
  return seen;
}

const countPrimitives = (nodes: Iterable<Node>): number =>
  [...nodes].reduce((sum, node) => sum + (node.getMesh()?.listPrimitives().length ?? 0), 0);

/** Merge primitives by material within each rigid group, in place. */
export function mergeRigidGroups(
  doc: Document,
  options: RigidMergeOptions = {},
): RigidMergeSummary {
  const root = doc.getRoot();
  const keep = new Set(options.keep ?? []);
  const nodes = sceneNodes(doc);
  const names = new Set([...nodes].map((node) => node.getName()));
  const summary: RigidMergeSummary = {
    primitivesBefore: countPrimitives(nodes),
    primitivesAfter: 0,
    groups: 0,
    merges: 0,
    boundaries: [],
    locked: [],
    rejected: [],
    unmatchedKeep: [...keep].filter((name) => !names.has(name)),
  };
  if (root.listAnimations().some((a) => a.listChannels().some((c) => !c.getTargetNode()))) {
    summary.skipped = 'unbounded-animation';
    summary.primitivesAfter = summary.primitivesBefore;
    return summary;
  }

  const boundaries = findRigidBoundaries(doc, keep);
  const materials = new Map<Material | null, number>(root.listMaterials().map((m, i) => [m, i]));
  const groups: Map<string, Entry[]>[] = [];
  const locks = new Map<string, RigidMergeSummary['locked'][number]>();
  const lock = (node: Node, reason: RigidLockReason, primitives: number) => {
    const key = `${node.getName()}|${reason}`;
    const known = locks.get(key);
    if (known) known.primitives += primitives;
    else {
      const entry = { node: node.getName(), reason, primitives };
      locks.set(key, entry);
      summary.locked.push(entry);
    }
  };
  const seen = new Set<Node>();
  const visit = (node: Node, parentGroup: Map<string, Entry[]>): void => {
    if (seen.has(node)) return;
    seen.add(node);
    const reasons = boundaries.get(node);
    let group = parentGroup;
    if (reasons) {
      summary.boundaries.push({ node: node.getName(), reasons });
      group = new Map();
      groups.push(group);
    }
    const mesh = node.getMesh();
    if (mesh) {
      const world = worldOf(node);
      const nodeReason = reasons
        ? 'boundary'
        : nodeLock(node, mesh, world, options.expandSharedMeshes !== false);
      const handedness = options.mergeMirroredTangents ? null : Math.sign(world.determinant());
      if (nodeReason) lock(node, nodeReason, mesh.listPrimitives().length);
      else
        for (const prim of mesh.listPrimitives()) {
          const primReason = primLock(prim, options.mergeTransparent === true);
          if (primReason) lock(node, primReason, 1);
          else {
            const key = bucketKey(prim, materials, handedness);
            const list = group.get(key);
            if (list) list.push({ node, prim });
            else group.set(key, [{ node, prim }]);
          }
        }
    }
    for (const child of node.listChildren()) visit(child, group);
  };
  for (const scene of root.listScenes()) {
    const group = new Map<string, Entry[]>();
    groups.push(group);
    for (const child of scene.listChildren()) visit(child, group);
  }
  summary.groups = groups.length;

  // Build every join first; only a bucket that built and checked cleanly changes the graph.
  const plans: { entries: Entry[]; destination: Node; merged: Primitive[] }[] = [];
  for (const group of groups)
    for (const bucket of group.values()) {
      let entries = bucket;
      while (entries.length >= 2) {
        const created: Property[] = [];
        // The library can allocate accessors before joinPrimitives throws. Track
        // its creation events too, so rejecting a bucket restores the whole graph.
        const track = (event: { target: unknown }) => created.push(event.target as Property);
        doc.getGraph().addEventListener('node:create', track);
        try {
          const destination = destinationOf(entries);
          const merged = prepare(entries, destination, created);
          const savedDraws = entries.length - merged.length;
          const shared = entries.filter(
            (entry) => removableBytes([entry]) < primitiveBytes([entry.prim]),
          );
          const addedBytes = Math.max(0, primitiveBytes(merged) - removableBytes(entries));
          if (savedDraws > 0 && addedBytes <= savedDraws * MAX_BYTES_PER_SAVED_DRAW) {
            plans.push({ entries, destination, merged });
            break;
          }
          for (const property of created) property.dispose();
          if (!shared.length || savedDraws <= 0) break;
          // Remove the costliest shared mesh first, retaining useful merges among affordable inputs.
          const costly = shared.reduce((best, entry) =>
            primitiveBytes(entry.node.getMesh()!.listPrimitives()) >
            primitiveBytes(best.node.getMesh()!.listPrimitives())
              ? entry
              : best,
          );
          const mesh = costly.node.getMesh()!;
          for (const entry of entries.filter((entry) => entry.node.getMesh() === mesh))
            lock(entry.node, 'shared-byte-budget', 1);
          entries = entries.filter((entry) => entry.node.getMesh() !== mesh);
        } catch (error) {
          for (const property of created) property.dispose();
          summary.rejected.push({
            node: entries[0]!.node.getName(),
            primitives: entries.length,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        } finally {
          doc.getGraph().removeEventListener('node:create', track);
        }
      }
    }

  const owned = new Map<Node, Mesh>();
  const ownMesh = (node: Node): Mesh => {
    let mesh = owned.get(node);
    if (mesh) return mesh;
    mesh = node.getMesh()!;
    // Mesh.clone() shares primitive references, so other users keep theirs.
    if (nodeUsers(mesh) > 1) {
      mesh = mesh.clone();
      node.setMesh(mesh);
    }
    owned.set(node, mesh);
    return mesh;
  };
  const removed = new Set<Primitive>();
  for (const { entries, destination, merged } of plans) {
    for (const { node, prim } of entries) {
      ownMesh(node).removePrimitive(prim);
      removed.add(prim);
    }
    for (const primitive of merged) ownMesh(destination).addPrimitive(primitive);
  }
  for (const [node, mesh] of owned)
    if (mesh.listPrimitives().length === 0) {
      node.setMesh(null);
      if (nodeUsers(mesh) === 0) mesh.dispose();
    }
  for (const prim of removed) {
    if (prim.listParents().some((parent) => parent.propertyType === PropertyType.MESH)) continue;
    const accessors = accessorsOf(prim);
    prim.dispose();
    for (const accessor of accessors)
      if (accessor.listParents().every((parent) => parent.propertyType === PropertyType.ROOT))
        accessor.dispose();
  }
  summary.merges = plans.length;
  summary.primitivesAfter = countPrimitives(nodes);
  return summary;
}

/** {@link mergeRigidGroups} as a gltf-transform step, e.g. between `palette()` and `weld()`. */
export function rigidMerge(
  options: RigidMergeOptions = {},
  onSummary?: (summary: RigidMergeSummary) => void,
): Transform {
  return createTransform('kilnRigidMerge', (doc: Document) => {
    const summary = mergeRigidGroups(doc, options);
    onSummary?.(summary);
  });
}
