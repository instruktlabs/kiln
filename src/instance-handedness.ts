/**
 * Keeps GPU instancing faithful to what the copies looked like as separate nodes.
 *
 * glTF takes a triangle's winding from the determinant of the node's global transform and has
 * no per-instance winding, and three.js reads it from `matrixWorld` alone. A negative-determinant
 * instance on a right-handed node therefore draws inside out: a single-sided surface culls its
 * front and a closed one shows its inner faces.
 *
 * A batch holds one handedness. Mirrored copies get their own batch on a reflected node, so the
 * node's determinant states the winding for all of them and no geometry is copied.
 *
 * three r186's WebGPU instance node (`nodes/accessors/Instance.js`) transforms positions and
 * normals but not `tangentLocal`, unlike its batch and skinning nodes and the WebGL shader. A
 * turned, stretched or mirrored instance of a tangent-bearing mesh keeps its source tangent, which
 * lights its normal map wrongly, and a quarter turn lays the tangent along the normal and shades
 * black. A node's own transform does reach the tangent, so such copies batch by the rotation and
 * stretch they share, carried on the batch node, leaving only translation and uniform scale on the
 * instances.
 */
import type { Accessor, Document, Mesh, Node, Scene, mat4, vec3, vec4 } from '@gltf-transform/core';
import { instance } from '@gltf-transform/functions';
import type { InstancedMesh } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { MSFT_LOD } from './gltf-io';

/** The reflection a mirrored batch's node carries. */
const BATCH_REFLECTION: vec3 = [-1, 1, 1];

/** Columns further from perpendicular than this are shear that TRS cannot state. */
const SHEAR_COSINE_LIMIT = 1e-4;

/** Rotation axis components and relative scale spread below this count as no change. */
const LINEAR_TOLERANCE = 1e-4;

const dot = (a: readonly number[], b: readonly number[]) =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** A TRS scale reflects when an odd number of its axes are negative. */
export function isMirroredScale(scale: readonly number[]): boolean {
  return scale[0]! * scale[1]! * scale[2]! < 0;
}

/** The sign of the upper 3x3 determinant, which decides winding. */
function isMirroredMatrix(m: mat4): boolean {
  const determinant =
    m[0] * (m[5] * m[10] - m[6] * m[9]) -
    m[4] * (m[1] * m[10] - m[2] * m[9]) +
    m[8] * (m[1] * m[6] - m[2] * m[5]);
  return determinant < 0;
}

/** True when the axes are non-zero and perpendicular, so translation, rotation and scale state it. */
function hasExactTrs(m: mat4): boolean {
  const axes = [m.slice(0, 3), m.slice(4, 7), m.slice(8, 11)];
  if (axes.some((axis) => dot(axis, axis) === 0)) return false;
  return [
    [0, 1],
    [0, 2],
    [1, 2],
  ].every(([i, j]) => {
    const a = axes[i!]!;
    const b = axes[j!]!;
    return Math.abs(dot(a, b)) <= SHEAR_COSINE_LIMIT * Math.sqrt(dot(a, a) * dot(b, b));
  });
}

const hasTangents = (mesh: Mesh) =>
  mesh.listPrimitives().some((primitive) => primitive.getAttribute('TANGENT'));

/** The world matrix's rotation and stretch with uniform scale divided out, as a grouping key. */
function sharedLinearKey(m: mat4): string {
  const largest = Math.sqrt(
    Math.max(
      dot(m.slice(0, 3), m.slice(0, 3)),
      dot(m.slice(4, 7), m.slice(4, 7)),
      dot(m.slice(8, 11), m.slice(8, 11)),
    ),
  );
  return [0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => Math.round((m[i]! / largest) * 1e5)).join(',');
}

/** True when an instance's own rotation or stretch would not reach a tangent-bearing mesh's tangents. */
export function instancingLosesTangents(mesh: Mesh, rotation: vec4, scale: vec3): boolean {
  if (!hasTangents(mesh)) return false;
  const turned = rotation.slice(0, 3).some((axis) => Math.abs(axis) > LINEAR_TOLERANCE);
  const largest = Math.max(...scale);
  const uniform = Math.min(...scale) >= largest * (1 - LINEAR_TOLERANCE) && largest > 0;
  return turned || !uniform;
}

function negateComponents(accessor: Accessor | null, stride: number, components: number[]): void {
  const array = accessor?.getArray();
  if (!array) return;
  for (let start = 0; start < array.length; start += stride)
    for (const component of components) array[start + component] = -array[start + component]!;
}

/**
 * Rewrite a batch of mirrored transforms for a node that carries {@link BATCH_REFLECTION}: with
 * M that reflection, `M * T(t) R(q) S(s)` equals `T(Mt) R(MqM) S(Ms)`, each a sign flip. An
 * absent channel is the identity, which the reflection leaves alone.
 */
export function reflectInstanceBatch(node: Node, batch: InstancedMesh): void {
  negateComponents(batch.getAttribute('TRANSLATION'), 3, [0]);
  negateComponents(batch.getAttribute('ROTATION'), 4, [1, 2]);
  negateComponents(batch.getAttribute('SCALE'), 3, [0]);
  node.setScale(BATCH_REFLECTION);
}

interface SharedLinear {
  rotation: vec4;
  scale: vec3;
}

/** Move a batch's shared rotation and stretch to its node, leaving translation and uniform scale. */
function carrySharedLinear(doc: Document, node: Node, batch: InstancedMesh, shared: SharedLinear) {
  const translations = batch.getAttribute('TRANSLATION');
  const rotations = batch.getAttribute('ROTATION');
  const scales = batch.getAttribute('SCALE');
  const first = (translations ?? rotations ?? scales)!;
  const count = first.getCount();
  const inverse = new THREE.Quaternion(...shared.rotation).invert();
  const moved = new Float32Array(count * 3);
  const uniform = new Float32Array(count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    if (translations) point.fromArray(translations.getElement(i, []));
    else point.set(0, 0, 0);
    point.applyQuaternion(inverse);
    moved.set(
      [point.x / shared.scale[0], point.y / shared.scale[1], point.z / shared.scale[2]],
      i * 3,
    );
    const k = scales ? Math.max(...scales.getElement(i, []).map(Math.abs)) : 1;
    uniform.set([k, k, k], i * 3);
  }
  const buffer = first.getBuffer();
  const accessor = (array: Float32Array<ArrayBuffer>) =>
    doc.createAccessor().setType('VEC3').setArray(array).setBuffer(buffer);
  batch.setAttribute('TRANSLATION', accessor(moved));
  batch.setAttribute('ROTATION', null);
  batch.setAttribute('SCALE', uniform.every((value) => value === 1) ? null : accessor(uniform));
  for (const old of [translations, rotations, scales]) old?.dispose();
  node.setRotation(shared.rotation).setScale(shared.scale);
}

/**
 * `instance()` groups by Mesh identity and flattens each node's world matrix to TRS, so it mixes
 * hands, straightens shear and rotates tangent-bearing copies. Stand-in meshes steer that grouping:
 * mirrored nodes share one per mesh and become their own batch, tangent-bearing nodes share one per
 * mesh and shared rotation, and a node no batch can draw faithfully gets its own and stays below
 * `min`. Every node and batch gets its real mesh back. Returns each new batch node with the names
 * of the nodes it replaced, in instance order.
 */
export async function instanceByHandedness(
  doc: Document,
  min: number,
): Promise<{ node: Node; instances: string[] }[]> {
  const root = doc.getRoot();
  const originals = new Map<Mesh, Mesh>();
  const standIn = (mesh: Mesh) => {
    const copy = doc.createMesh(mesh.getName());
    for (const primitive of mesh.listPrimitives()) copy.addPrimitive(primitive);
    originals.set(copy, mesh);
    return copy;
  };

  const mirrored = new Map<Mesh, Mesh>();
  const byLinear = new Map<Mesh, Map<string, Mesh>>();
  const sharedLinear = new Map<Mesh, SharedLinear>();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix();
    if (!hasExactTrs(world)) {
      node.setMesh(standIn(mesh));
    } else if (hasTangents(mesh)) {
      const groups = byLinear.get(mesh) ?? new Map<string, Mesh>();
      byLinear.set(mesh, groups);
      const key = sharedLinearKey(world);
      let group = groups.get(key);
      if (!group) {
        group = standIn(mesh);
        groups.set(key, group);
        const scale = node.getWorldScale();
        const largest = Math.max(...scale.map(Math.abs));
        sharedLinear.set(group, {
          rotation: node.getWorldRotation(),
          scale: [scale[0] / largest, scale[1] / largest, scale[2] / largest],
        });
      }
      node.setMesh(group);
    } else if (isMirroredMatrix(world)) {
      if (!mirrored.has(mesh)) mirrored.set(mesh, standIn(mesh));
      node.setMesh(mirrored.get(mesh)!);
    }
  }

  // `instance()` orders a batch's copies as its scene traversal meets them and adds the batch to
  // that scene, so the same traversal names them.
  const users = new Map<Scene, Map<Mesh, string[]>>();
  const existing = new Set<Node>();
  for (const scene of root.listScenes()) {
    const byMesh = new Map<Mesh, string[]>();
    users.set(scene, byMesh);
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (node.getExtension('EXT_mesh_gpu_instancing')) existing.add(node);
      else if (mesh) {
        const names = byMesh.get(mesh) ?? [];
        names.push(node.getName());
        byMesh.set(mesh, names);
      }
    });
  }

  await doc.transform(instance({ min }));

  const created: { node: Node; instances: string[] }[] = [];
  for (const [scene, byMesh] of users)
    for (const node of scene.listChildren()) {
      const mesh = node.getMesh();
      if (!mesh || existing.has(node) || !node.getExtension('EXT_mesh_gpu_instancing')) continue;
      created.push({ node, instances: byMesh.get(mesh) ?? [] });
    }

  const mirroredStandIns = new Set(mirrored.values());
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const original = mesh && originals.get(mesh);
    if (!original) continue;
    const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
    const shared = sharedLinear.get(mesh);
    if (batch && shared) carrySharedLinear(doc, node, batch, shared);
    else if (batch && mirroredStandIns.has(mesh)) reflectInstanceBatch(node, batch);
    node.setMesh(original);
  }
  for (const copy of originals.keys()) copy.dispose();
  // A viewer without the extension would silently draw one copy per batch: make it refuse instead.
  for (const extension of root.listExtensionsUsed())
    if (extension.extensionName === 'EXT_mesh_gpu_instancing') extension.setRequired(true);
  return created;
}

/** A three track's node name; a name three cannot parse protects itself whole. */
function trackNodeName(name: string): string {
  try {
    return THREE.PropertyBinding.parseTrackName(name).nodeName || name;
  } catch {
    return name;
  }
}

/** The node names a scene's `kilnReviewClipsV1` tracks animate, as three's track names state them. */
export function reviewClipTargets(doc: Document): Set<string> {
  const targets = new Set<string>();
  for (const scene of doc.getRoot().listScenes()) {
    const review = scene.getExtras().kilnReviewClipsV1 as { clips?: unknown } | undefined;
    if (!Array.isArray(review?.clips)) continue;
    for (const clip of review.clips as { tracks?: unknown }[])
      if (Array.isArray(clip?.tracks))
        for (const track of clip.tracks as { name?: unknown }[])
          if (typeof track?.name === 'string') targets.add(trackNodeName(track.name));
  }
  return targets;
}

/** Why this document cannot be batched at all, or undefined when it can. */
export function instancingBlocker(doc: Document): string | undefined {
  const root = doc.getRoot();
  if (root.listAnimations().length > 0) return 'animations';
  if (root.listSkins().length > 0) return 'skins';
  // The review copy of clips glTF cannot state targets nodes by name, as animations do.
  if (reviewClipTargets(doc).size > 0) return 'review clips';
  const nodes = root.listNodes();
  // Kiln City runtimes target pivots by name, and a batch drops per-node names.
  if (nodes.some((node) => /^joint[_-]/i.test(node.getName()))) return 'joint pivots';
  // An MSFT_lod chain's levels stand in for a node a batch would fold away.
  if (nodes.some((node) => node.getExtension(MSFT_LOD) !== null)) return 'levels of detail';
  // These transforms cannot preserve per-node state when they remove or reparent nodes.
  if (
    nodes.some(
      (node) =>
        node.getExtension('KHR_node_visibility') !== null ||
        Object.keys(node.getExtras()).length > 0,
    )
  )
    return 'node extras or visibility';
  return undefined;
}

export function countInstanceBatches(doc: Document): { batches: number; instances: number } {
  let batches = 0;
  let instances = 0;
  for (const node of doc.getRoot().listNodes()) {
    const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
    if (!batch) continue;
    batches += 1;
    instances +=
      (
        batch.getAttribute('TRANSLATION') ??
        batch.getAttribute('ROTATION') ??
        batch.getAttribute('SCALE')
      )?.getCount() ?? 0;
  }
  return { batches, instances };
}
