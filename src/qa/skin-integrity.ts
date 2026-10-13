import * as THREE from 'three';
import type { QaFinding } from './types';

/** Source serialization invariants, independent of style, body plan or optional QA policy. */
export interface SkinIntegrityInspectionV1 {
  schemaVersion: 1;
  findings: QaFinding[];
  meshesChecked: number;
  verticesChecked: number;
  truncated: boolean;
  /** Current posed world-space bounds only; not a whole-animation envelope. */
  bounds: { nodePath: string; min: [number, number, number]; max: [number, number, number] }[];
}

const MAX_FINDINGS = 64;
const WEIGHT_TOLERANCE = 1e-5;
type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

function validAttribute(a: Attribute | undefined, count: number, size: number): a is Attribute {
  if (!a || a.itemSize !== size || a.count !== count || !Number.isSafeInteger(count) || count < 1)
    return false;
  if ('isInterleavedBufferAttribute' in a) {
    return (
      Number.isSafeInteger(a.data.stride) &&
      a.data.stride >= size &&
      Number.isSafeInteger(a.offset) &&
      a.offset >= 0 &&
      a.offset + size <= a.data.stride &&
      (count - 1) * a.data.stride + a.offset + size <= a.array.length
    );
  }
  return count * size <= a.array.length;
}

function finiteAffine(matrix: THREE.Matrix4 | undefined): matrix is THREE.Matrix4 {
  const e = matrix?.elements;
  return (
    !!e &&
    e.length === 16 &&
    [...e].every((v) => Number.isFinite(v) && Number.isFinite(Math.fround(v))) &&
    // Inverting valid TRS matrices can introduce double-precision roundoff.
    // Judge the affine row at the Float32 precision used by the exported data.
    Math.fround(e[3]!) === 0 &&
    Math.fround(e[7]!) === 0 &&
    Math.fround(e[11]!) === 0 &&
    Math.fround(e[15]!) === 1
  );
}

/** Read logical attributes and transforms without updating or repairing the caller's scene. */
export function inspectSkinIntegrity(root: THREE.Object3D): SkinIntegrityInspectionV1 {
  const result: SkinIntegrityInspectionV1 = {
    schemaVersion: 1,
    findings: [],
    meshesChecked: 0,
    verticesChecked: 0,
    truncated: false,
    bounds: [],
  };
  const paths = new Map<THREE.Object3D, string>();
  const pending: [THREE.Object3D, string, number][] = [[root, '', 0]];
  while (pending.length) {
    const [node, parent, sibling] = pending.pop()!;
    if (paths.has(node)) continue;
    const segment = `${(node.name || node.type).slice(0, 80)}[${sibling}]`;
    const path = (parent ? `${parent}/${segment}` : segment).slice(-800);
    paths.set(node, path);
    for (let i = node.children.length - 1; i >= 0; i--) pending.push([node.children[i]!, path, i]);
  }
  const worlds = new Map<THREE.Object3D, THREE.Matrix4>();
  function world(node: THREE.Object3D): THREE.Matrix4 | undefined {
    const chain: THREE.Object3D[] = [],
      seen = new Set<THREE.Object3D>();
    let cursor: THREE.Object3D | null = node;
    while (cursor && !worlds.has(cursor)) {
      if (seen.has(cursor)) return undefined;
      seen.add(cursor);
      chain.push(cursor);
      cursor = cursor.parent;
    }
    while (chain.length) {
      const n = chain.pop()!;
      const local = n.matrixAutoUpdate
        ? new THREE.Matrix4().compose(n.position, n.quaternion, n.scale)
        : n.matrix.clone();
      const parent = n.parent ? worlds.get(n.parent) : undefined;
      const value =
        n.matrixWorldAutoUpdate === false
          ? n.matrixWorld.clone()
          : parent
            ? new THREE.Matrix4().multiplyMatrices(parent, local)
            : local;
      worlds.set(n, value);
    }
    return worlds.get(node);
  }
  for (const [node, nodePath] of paths) {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) continue;
    if (result.findings.length >= MAX_FINDINGS) {
      result.truncated = true;
      break;
    }
    result.meshesChecked++;
    const start = result.findings.length;
    const add = (
      code: string,
      message: string,
      attribute?: string,
      measurement?: QaFinding['measurement'],
    ) => {
      if (result.findings.length >= MAX_FINDINGS) {
        result.truncated = true;
        return;
      }
      result.findings.push({
        code,
        disposition: 'block',
        dimension: 'exportIntegrity',
        profile: 'skin.source-integrity.v1',
        message,
        affected: { node: mesh.name.slice(0, 160), nodePath, ...(attribute ? { attribute } : {}) },
        ...(measurement ? { measurement } : {}),
        repairText:
          'Rebuild the named binding at its intended rest pose. Keep bone order, inverse bind matrices and four influence lanes aligned with every final vertex; unwrap or change topology before binding. Do not repair invalid indices by normalizing weights.',
      });
    };
    const skeleton = mesh.skeleton,
      bones = skeleton?.bones;
    if (!bones?.length || !Array.isArray(bones)) {
      add('SKIN_SKELETON', 'Skinned mesh requires a nonempty skeleton in the exported hierarchy.');
      continue;
    }
    const unique = new Set<THREE.Bone>();
    for (let joint = 0; joint < bones.length; joint++) {
      const bone = bones[joint];
      if (!bone?.isObject3D || !paths.has(bone) || unique.has(bone)) {
        add(
          'SKIN_JOINT_MEMBERSHIP',
          `Joint ${joint} (${JSON.stringify(bone?.name?.slice(0, 160) ?? 'missing')}) must be a distinct node inside the exported hierarchy.`,
          `joints[${joint}]`,
        );
      }
      if (bone) unique.add(bone);
      if (!finiteAffine(skeleton.boneInverses?.[joint])) {
        add(
          'SKIN_INVERSE_BIND',
          `Joint ${joint} (${JSON.stringify(bone?.name?.slice(0, 160) ?? 'missing')}) requires a finite affine inverse bind matrix.`,
          `boneInverses[${joint}]`,
        );
      }
      if (result.truncated) break;
    }
    if (
      !finiteAffine(mesh.bindMatrix) ||
      !Number.isFinite(mesh.bindMatrix.determinant()) ||
      mesh.bindMatrix.determinant() === 0 ||
      ![THREE.AttachedBindMode, THREE.DetachedBindMode].includes(mesh.bindMode)
    ) {
      add(
        'SKIN_BIND_MATRIX',
        'Mesh requires a finite invertible affine bind matrix and an attached or detached bind mode.',
        'bindMatrix',
      );
    }
    const position = mesh.geometry?.getAttribute('position'),
      count = position?.count ?? 0;
    const indices = mesh.geometry?.getAttribute('skinIndex'),
      weights = mesh.geometry?.getAttribute('skinWeight');
    if (
      !validAttribute(position, count, 3) ||
      !validAttribute(indices, count, 4) ||
      indices.normalized ||
      !validAttribute(weights, count, 4)
    ) {
      add(
        'SKIN_ATTRIBUTES',
        'Skin requires xyz positions and four non-normalized joint indices and four weights per final vertex, backed by complete buffers.',
        'skinIndex/skinWeight',
      );
      continue;
    }
    const invalid = new Map<
      string,
      { count: number; first: number; last: number; attribute: string }
    >();
    const bad = (code: string, vertex: number, attribute: string) => {
      const row = invalid.get(code);
      if (row) {
        if (row.last !== vertex) row.count++;
        row.last = vertex;
      } else invalid.set(code, { count: 1, first: vertex, last: vertex, attribute });
    };
    for (let vertex = 0; vertex < count; vertex++) {
      let sum = 0;
      for (let lane = 0; lane < 4; lane++) {
        const index = indices.getComponent(vertex, lane),
          weight = weights.getComponent(vertex, lane);
        if (!Number.isInteger(index) || index < 0 || index >= bones.length)
          bad('SKIN_JOINT_INDEX', vertex, 'skinIndex');
        if (!Number.isFinite(weight) || weight < 0 || weight > 1)
          bad('SKIN_WEIGHT_VALUE', vertex, 'skinWeight');
        sum += weight;
      }
      if (!Number.isFinite(sum) || Math.abs(sum - 1) > WEIGHT_TOLERANCE)
        bad('SKIN_WEIGHT_SUM', vertex, 'skinWeight');
    }
    result.verticesChecked += count;
    for (const [code, row] of invalid) {
      const why =
        code === 'SKIN_JOINT_INDEX'
          ? 'indices must address the skeleton, including zero-weight lanes'
          : code === 'SKIN_WEIGHT_SUM'
            ? `weights must sum to one within ${WEIGHT_TOLERANCE}`
            : 'weights must be finite values in [0,1]';
      add(
        code,
        `Invalid ${row.attribute} at vertex range ${row.first}..${row.last} (${row.count} affected vertices): ${why}.`,
        row.attribute,
        {
          name: 'invalidSkinVertices',
          actual: row.count,
          expected: 0,
          breakdown: { firstVertex: row.first, lastVertex: row.last },
        },
      );
    }
    if (result.findings.length !== start) continue;
    const meshWorld = world(mesh);
    if (!finiteAffine(meshWorld)) {
      add('SKIN_POSE_TRANSFORM', 'Current mesh world transform must be finite and affine.');
      continue;
    }
    const inverse =
      mesh.bindMode === THREE.AttachedBindMode
        ? meshWorld.clone().invert()
        : mesh.bindMatrix.clone().invert();
    const matrices: THREE.Matrix4[] = [];
    for (let joint = 0; joint < bones.length; joint++) {
      const boneWorld = world(bones[joint]!);
      if (!finiteAffine(boneWorld)) {
        add(
          'SKIN_POSE_TRANSFORM',
          `Current transform for joint ${joint} must be finite and affine.`,
          `joints[${joint}]`,
        );
        break;
      }
      matrices.push(
        new THREE.Matrix4()
          .multiplyMatrices(boneWorld, skeleton.boneInverses[joint]!)
          .multiply(mesh.bindMatrix),
      );
    }
    if (result.findings.length !== start) continue;
    const base = new THREE.Vector3(),
      posed = new THREE.Vector3(),
      temp = new THREE.Vector3(),
      box = new THREE.Box3();
    for (let vertex = 0; vertex < count; vertex++) {
      // Mesh's implementation evaluates morphs but does not invoke the unsafe skin path.
      THREE.Mesh.prototype.getVertexPosition.call(mesh, vertex, base);
      posed.set(0, 0, 0);
      for (let lane = 0; lane < 4; lane++) {
        const weight = weights.getComponent(vertex, lane);
        if (weight !== 0)
          posed.addScaledVector(
            temp.copy(base).applyMatrix4(matrices[indices.getComponent(vertex, lane)]!),
            weight,
          );
      }
      posed.applyMatrix4(inverse).applyMatrix4(meshWorld);
      if (
        !Number.isFinite(Math.fround(posed.x)) ||
        !Number.isFinite(Math.fround(posed.y)) ||
        !Number.isFinite(Math.fround(posed.z))
      ) {
        add(
          'SKIN_POSED_VERTEX',
          `Current deformed vertex ${vertex} is not finite and Float32-representable. Check positions, morphs and weighted joint transforms.`,
          `position[${vertex}]`,
        );
        break;
      }
      box.expandByPoint(posed);
    }
    if (result.findings.length === start)
      result.bounds.push({ nodePath, min: box.min.toArray(), max: box.max.toArray() });
  }
  return result;
}
