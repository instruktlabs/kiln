import * as THREE from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import {
  stampSemanticMetadataV1,
  type SemanticMetadataV1,
  type SemanticMetadataV1Input,
} from './contracts';
import { GEOMETRY_ALLOCATION_LIMITS as limits, assertFiniteTriple } from './geometry-budget';

export interface CreateSkinnedPartOptions {
  /** Already assembled common hierarchy containing every bone, in the rest pose. */
  parent: THREE.Object3D;
  /** Explicit, stable index order. Bones remain owned by the caller's hierarchy. */
  bones: readonly THREE.Bone[];
  /** Four indices and weights per geometry vertex, including zero-weight lanes. */
  indices: ArrayLike<number>;
  weights: ArrayLike<number>;
  /** Default false: require weights to sum to one. Never invent weights for zero sums. */
  normalizeWeights?: boolean;
  position?: [number, number, number];
  /** Local Euler angles in degrees, matching createPart. */
  rotation?: [number, number, number];
  scale?: [number, number, number];
  semantic?: SemanticMetadataV1 | SemanticMetadataV1Input;
}

function topRoot(node: THREE.Object3D): THREE.Object3D {
  while (node.parent) node = node.parent;
  return node;
}

function assertMatrix(matrix: THREE.Matrix4, label: string): void {
  if (
    !matrix.elements.every(
      (value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)),
    ) ||
    !Number.isFinite(matrix.determinant()) ||
    matrix.determinant() === 0 ||
    !matrix
      .clone()
      .invert()
      .elements.every((value) => Number.isFinite(value) && Number.isFinite(Math.fround(value)))
  )
    throw new RangeError(`createSkinnedPart ${label} must have finite invertible bind transforms.`);
}

/** Clone unchanged topology, attach explicit four-lane influences and bind at the current rest pose. */
export function createSkinnedPart(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  options: CreateSkinnedPartOptions,
): THREE.SkinnedMesh {
  try {
    return buildSkinnedPart(name, geometry, material, options);
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError)
      throw new AuthoringDiagnosticError('SKIN_BINDING_ARGUMENT', error.message);
    throw error;
  }
}

function buildSkinnedPart(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  options: CreateSkinnedPartOptions,
): THREE.SkinnedMesh {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    THREE.PropertyBinding.sanitizeNodeName(name) !== name
  )
    throw new TypeError(
      'createSkinnedPart name must be nonempty and free of animation binding punctuation.',
    );
  if (!geometry?.isBufferGeometry)
    throw new TypeError('createSkinnedPart requires BufferGeometry.');
  const materials = Array.isArray(material) ? material : [material];
  if (!materials.length || materials.some((value) => !value?.isMaterial))
    throw new TypeError('createSkinnedPart requires a material or nonempty material array.');
  if (!options?.parent?.isObject3D)
    throw new TypeError('createSkinnedPart requires an existing parent in the bone hierarchy.');
  const { bones, indices, weights, parent } = options;
  if (!Array.isArray(bones) || bones.length < 1 || bones.length > limits.skinBones)
    throw new RangeError(`createSkinnedPart bone limit is 1..${limits.skinBones}.`);
  if (options.normalizeWeights !== undefined && typeof options.normalizeWeights !== 'boolean')
    throw new TypeError('createSkinnedPart normalizeWeights must be boolean.');
  const top = topRoot(parent),
    names = new Set<string>(),
    members = new Set<THREE.Bone>();
  for (const bone of bones) {
    if (!bone?.isBone || topRoot(bone) !== top || members.has(bone))
      throw new TypeError(
        'createSkinnedPart bones must be distinct Bones in the parent hierarchy.',
      );
    if (
      !bone.name ||
      THREE.PropertyBinding.sanitizeNodeName(bone.name) !== bone.name ||
      names.has(bone.name)
    )
      throw new TypeError('createSkinnedPart bones need unique animation-safe names.');
    members.add(bone);
    names.add(bone.name);
  }
  // Collision with any other node makes name-based animation ambiguous.
  top.traverse((node) => {
    if (names.has(node.name) && !members.has(node as THREE.Bone))
      throw new TypeError(`createSkinnedPart ambiguous bone name: ${node.name}.`);
  });
  const position = geometry.getAttribute('position'),
    count = position?.count;
  if (
    position?.itemSize !== 3 ||
    !Number.isSafeInteger(count) ||
    count! < 1 ||
    count! > limits.skinVertices
  )
    throw new RangeError(
      `createSkinnedPart position vertex limit is 1..${limits.skinVertices} xyz vertices.`,
    );
  if (geometry.hasAttribute('skinIndex') || geometry.hasAttribute('skinWeight'))
    throw new TypeError(
      'createSkinnedPart geometry already contains binding attributes; provide unbound geometry.',
    );
  let bytes = count! * 4 * (2 + 4);
  const attributes = [
    geometry.getIndex(),
    ...Object.values(geometry.attributes),
    ...Object.values(geometry.morphAttributes).flat(),
  ];
  for (const attribute of attributes) {
    if (!attribute) continue;
    bytes += attribute.array.byteLength;
    if (!Number.isSafeInteger(bytes) || bytes > limits.skinAttributeBytes)
      throw new RangeError(
        `createSkinnedPart attribute allocation limit is ${limits.skinAttributeBytes} bytes.`,
      );
  }
  if (!indices || !weights || indices.length !== count! * 4 || weights.length !== count! * 4)
    throw new RangeError('createSkinnedPart requires exactly four indices and weights per vertex.');
  // First pass validates all input before cloning or allocating output attributes.
  for (let vertex = 0; vertex < count!; vertex++) {
    let sum = 0;
    for (let lane = 0; lane < 4; lane++) {
      const i = vertex * 4 + lane,
        index = indices[i]!,
        weight = weights[i]!;
      if (!Number.isInteger(index) || index < 0 || index >= bones.length)
        throw new RangeError(
          `createSkinnedPart vertex ${vertex} lane ${lane} has an invalid bone index.`,
        );
      if (!Number.isFinite(weight) || weight < 0)
        throw new RangeError(
          `createSkinnedPart vertex ${vertex} lane ${lane} needs a finite nonnegative weight.`,
        );
      if (!options.normalizeWeights && weight > 1)
        throw new RangeError(
          `createSkinnedPart vertex ${vertex} weights must be <=1 and sum to one; request normalizeWeights explicitly.`,
        );
      sum += weight;
    }
    if (
      !Number.isFinite(sum) ||
      sum <= 0 ||
      (!options.normalizeWeights && Math.abs(sum - 1) > 1e-5)
    )
      throw new RangeError(
        `createSkinnedPart vertex ${vertex} has an invalid weight sum; require one or explicitly normalize a positive finite sum.`,
      );
  }
  for (const key of ['position', 'rotation', 'scale'] as const)
    if (options[key] !== undefined) assertFiniteTriple(`createSkinnedPart ${key}`, options[key]);
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...(options.position ?? [0, 0, 0])),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        ...((options.rotation ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [
          number,
          number,
          number,
        ]),
      ),
    ),
    new THREE.Vector3(...(options.scale ?? [1, 1, 1])),
  );
  top.updateWorldMatrix(true, true);
  const bind = new THREE.Matrix4().multiplyMatrices(parent.matrixWorld, local);
  assertMatrix(bind, 'mesh');
  for (const bone of bones) {
    assertMatrix(bone.matrixWorld, `bone ${bone.name}`);
  }
  const skinIndices = new Uint16Array(indices.length),
    skinWeights = new Float32Array(weights.length);
  for (let vertex = 0; vertex < count!; vertex++) {
    const start = vertex * 4;
    const sum = options.normalizeWeights
      ? weights[start]! + weights[start + 1]! + weights[start + 2]! + weights[start + 3]!
      : 1;
    for (let lane = 0; lane < 4; lane++) {
      skinIndices[start + lane] = indices[start + lane]!;
      skinWeights[start + lane] = weights[start + lane]! / sum;
    }
  }
  const owned = geometry.clone();
  owned.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  owned.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
  const mesh = new THREE.SkinnedMesh(owned, Array.isArray(material) ? [...material] : material);
  mesh.name = `Mesh_${name}`;
  if (options.position) mesh.position.fromArray(options.position);
  if (options.rotation)
    mesh.rotation.set(
      ...(options.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]),
    );
  if (options.scale) mesh.scale.fromArray(options.scale);
  if (options.semantic) stampSemanticMetadataV1(mesh, options.semantic);
  const skeleton = new THREE.Skeleton(
    [...bones],
    bones.map((bone) => bone.matrixWorld.clone().invert()),
  );
  mesh.bind(skeleton, bind);
  parent.add(mesh);
  mesh.updateWorldMatrix(true, false);
  return mesh;
}
