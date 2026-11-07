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
 */
import type { Accessor, Document, Mesh, Node, mat4, vec3, vec4 } from '@gltf-transform/core';
import { instance } from '@gltf-transform/functions';
import type { InstancedMesh } from '@gltf-transform/extensions';

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

/** True when the matrix's axes are perpendicular, so translation, rotation and scale state it. */
function hasExactTrs(m: mat4): boolean {
  const axes = [m.slice(0, 3), m.slice(4, 7), m.slice(8, 11)];
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

/**
 * three r186's WebGPU instance node (`nodes/accessors/Instance.js`) transforms positions and
 * normals but not `tangentLocal`, unlike its batch and skinning nodes and the WebGL shader. A
 * copy of a tangent-bearing mesh keeps its source tangent, so any turn, non-uniform stretch or
 * reflection lights the normal map wrongly, and a quarter turn lays the tangent along the normal
 * and shades black. Such copies stay plain nodes until that renderer transforms tangents.
 */
export function instancingLosesTangents(mesh: Mesh, rotation: vec4, scale: vec3): boolean {
  if (!mesh.listPrimitives().some((primitive) => primitive.getAttribute('TANGENT'))) return false;
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

/**
 * `instance()` groups by Mesh identity and flattens each node's world matrix to TRS, so it mixes
 * hands and straightens shear. Stand-in meshes steer that grouping: mirrored nodes share one per
 * mesh and become their own batch, and a node no batch can draw faithfully gets its own and stays
 * below `min`. Every node and batch gets its real mesh back.
 */
export async function instanceByHandedness(doc: Document, min: number): Promise<void> {
  const root = doc.getRoot();
  const originals = new Map<Mesh, Mesh>();
  const standIn = (mesh: Mesh) => {
    const copy = doc.createMesh(mesh.getName());
    for (const primitive of mesh.listPrimitives()) copy.addPrimitive(primitive);
    originals.set(copy, mesh);
    return copy;
  };

  const mirrored = new Map<Mesh, Mesh>();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix();
    if (
      !hasExactTrs(world) ||
      instancingLosesTangents(mesh, node.getWorldRotation(), node.getWorldScale())
    ) {
      node.setMesh(standIn(mesh));
    } else if (isMirroredMatrix(world)) {
      if (!mirrored.has(mesh)) mirrored.set(mesh, standIn(mesh));
      node.setMesh(mirrored.get(mesh)!);
    }
  }

  await doc.transform(instance({ min }));

  const mirroredStandIns = new Set(mirrored.values());
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const original = mesh && originals.get(mesh);
    if (!original) continue;
    const batch = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
    if (batch && mirroredStandIns.has(mesh)) reflectInstanceBatch(node, batch);
    node.setMesh(original);
  }
  for (const copy of originals.keys()) copy.dispose();
}
