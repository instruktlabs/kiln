/** Internal safety and correspondence boundary for the xatlasjs adapter. */
import * as THREE from 'three';
import { GEOMETRY_ALLOCATION_LIMITS as limits } from './geometry-budget';

type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

export interface AtlasMesh {
  vertexCount: number;
  vertex: { coords1?: Float32Array | number[] };
  index?: Uint16Array | Uint32Array | number[];
  oldIndexes: Uint16Array | Uint32Array | number[];
}

/** Reject truncated Uint16 output and reordered faces before copying protected data. */
export function validateAtlasRemap(mesh: AtlasMesh, inputIndex: Uint32Array, sourceCount: number) {
  const count = mesh.vertexCount;
  if (!Number.isSafeInteger(count) || count < 1 || count > limits.unwrapVertices)
    throw new RangeError(
      `autoUnwrap: xatlas output exceeds the supported 1..${limits.unwrapVertices} vertices. Split the mesh before unwrapping.`,
    );
  if (mesh.oldIndexes.length !== count)
    throw new Error('autoUnwrap: xatlas returned an incomplete source-vertex map.');
  for (const oldIndex of mesh.oldIndexes)
    if (!Number.isSafeInteger(oldIndex) || oldIndex < 0 || oldIndex >= sourceCount)
      throw new Error('autoUnwrap: xatlas returned an invalid source-vertex map.');
  const index = mesh.index;
  if (!index || index.length !== inputIndex.length)
    throw new Error(
      'autoUnwrap: xatlas changed the triangle count; face correspondence is unsupported.',
    );
  for (let i = 0; i < index.length; i++) {
    const vertex = index[i]!;
    if (
      !Number.isSafeInteger(vertex) ||
      vertex < 0 ||
      vertex >= count ||
      mesh.oldIndexes[vertex] !== inputIndex[i]
    )
      throw new Error(
        'autoUnwrap: xatlas changed triangle correspondence; refusing to misassign vertex data or material groups.',
      );
  }
  const uv = mesh.vertex.coords1;
  if (!uv || uv.length !== count * 2 || !uv.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
    throw new Error(
      'autoUnwrap: xatlas produced no valid UV coordinates (degenerate or zero-area triangles?).',
    );
  return { index, uv, oldIndexes: mesh.oldIndexes };
}

function interleaved(attribute: Attribute): attribute is THREE.InterleavedBufferAttribute {
  return (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute === true;
}

/** Copy raw storage, including normalized integers and half floats, without welding. */
export function remapUnwrapAttribute(
  attribute: Attribute,
  oldIndexes: ArrayLike<number>,
): THREE.BufferAttribute {
  const ArrayType = attribute.array.constructor as new (length: number) => THREE.TypedArray;
  const array = new ArrayType(oldIndexes.length * attribute.itemSize);
  const stride = interleaved(attribute) ? attribute.data.stride : attribute.itemSize;
  const offset = interleaved(attribute) ? attribute.offset : 0;
  for (let i = 0; i < oldIndexes.length; i++) {
    for (let c = 0; c < attribute.itemSize; c++)
      array[i * attribute.itemSize + c] = attribute.array[oldIndexes[i]! * stride + offset + c]!;
  }
  const output = (attribute as Attribute & { isFloat16BufferAttribute?: boolean })
    .isFloat16BufferAttribute
    ? new THREE.Float16BufferAttribute(
        array as Uint16Array,
        attribute.itemSize,
        attribute.normalized,
      )
    : new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized);
  output.name = attribute.name;
  output.setUsage(interleaved(attribute) ? attribute.data.usage : attribute.usage);
  if (!interleaved(attribute)) output.gpuType = attribute.gpuType;
  return output;
}

function validateAttribute(name: string, attribute: Attribute, count: number): void {
  if (
    (attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute ||
    (interleaved(attribute) &&
      (attribute.data as THREE.InterleavedBuffer & { isInstancedInterleavedBuffer?: boolean })
        .isInstancedInterleavedBuffer)
  )
    throw new TypeError(
      `autoUnwrap: ${name} is per-instance data; unwrap the base geometry before instancing.`,
    );
  if (
    attribute.count !== count ||
    !Number.isSafeInteger(attribute.itemSize) ||
    attribute.itemSize < 1 ||
    attribute.itemSize > 4
  )
    throw new TypeError(
      `autoUnwrap: ${name} must be a matching per-vertex attribute with 1..4 components.`,
    );
  if (
    interleaved(attribute) &&
    (!Number.isSafeInteger(attribute.offset) ||
      attribute.offset < 0 ||
      attribute.offset + attribute.itemSize > attribute.data.stride)
  )
    throw new TypeError(`autoUnwrap: ${name} has an invalid interleaved offset or stride.`);
}

/** Decode xyz through getters: .array alone ignores stride, normalization and half floats. */
function xyz(attribute: Attribute, name: string): Float32Array {
  if (attribute.itemSize !== 3)
    throw new TypeError(`autoUnwrap: ${name} requires three components.`);
  const output = new Float32Array(attribute.count * 3);
  for (let i = 0; i < attribute.count; i++) {
    output[i * 3] = attribute.getX(i);
    output[i * 3 + 1] = attribute.getY(i);
    output[i * 3 + 2] = attribute.getZ(i);
  }
  if (!output.every(Number.isFinite))
    throw new TypeError(`autoUnwrap: ${name} must contain finite Float32-representable values.`);
  return output;
}

export function prepareUnwrap(
  geometry: THREE.BufferGeometry,
  opts: { resolution?: number; padding?: number; useNormals?: boolean },
) {
  const resolution = opts.resolution ?? 1024;
  const padding = opts.padding ?? 2;
  if (!Number.isSafeInteger(resolution) || resolution < 1 || resolution > limits.unwrapResolution)
    throw new RangeError(
      `autoUnwrap: resolution must be an integer from 1 to ${limits.unwrapResolution}.`,
    );
  if (!Number.isSafeInteger(padding) || padding < 0 || padding > resolution)
    throw new RangeError('autoUnwrap: padding must be an integer from 0 to resolution.');
  if (opts.useNormals !== undefined && typeof opts.useNormals !== 'boolean')
    throw new TypeError('autoUnwrap: useNormals must be a boolean.');
  if ((geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry)
    throw new TypeError('autoUnwrap: unwrap the base geometry before instancing.');
  const position = geometry.getAttribute('position');
  if (position?.itemSize !== 3)
    throw new TypeError('autoUnwrap: geometry requires a three-component position attribute.');
  const count = position.count;
  const corners = geometry.index?.count ?? count;
  if (count === 0 || corners === 0)
    throw new Error(
      'autoUnwrap: geometry has no triangles. Check the operation that produced it (for example an empty CSG result).',
    );
  if (!Number.isSafeInteger(count) || count < 1 || count > limits.unwrapVertices)
    throw new RangeError(
      `autoUnwrap: input exceeds ${limits.unwrapVertices} vertices supported by xatlasjs. Split the mesh before unwrapping.`,
    );
  if (!Number.isSafeInteger(corners) || corners % 3 !== 0)
    throw new TypeError(
      'autoUnwrap: geometry has an index count that is not a whole number of triangles.',
    );
  if (corners / 3 > limits.unwrapTriangles)
    throw new RangeError(`autoUnwrap: triangle budget exceeds ${limits.unwrapTriangles}.`);
  const attributes = Object.entries(geometry.attributes);
  for (const [name, attribute] of attributes) validateAttribute(name, attribute, count);
  const normal = geometry.getAttribute('normal');
  if (normal && normal.itemSize !== 3)
    throw new TypeError('autoUnwrap: normal requires three components.');
  const useNormals = !!opts.useNormals && !!normal;
  for (const [name, targets] of Object.entries(geometry.morphAttributes)) {
    if (!['position', 'normal', 'color'].includes(name))
      throw new TypeError(
        `autoUnwrap: morph ${name} is unsupported; UV0 and tangents change during unwrapping.`,
      );
    if (name === 'normal' && targets.length && !useNormals)
      throw new TypeError(
        'autoUnwrap: normal morphs require base normals and useNormals: true to preserve their reference frame.',
      );
    for (const attribute of targets) {
      validateAttribute(`morph ${name}`, attribute, count);
      const base = geometry.getAttribute(name);
      if (!base || attribute.itemSize !== base.itemSize)
        throw new TypeError(`autoUnwrap: morph ${name} requires a matching base attribute.`);
      attributes.push([`morph ${name}`, attribute]);
    }
  }
  // Bound owned output buffers before reading attributes or entering native code.
  const perVertexBytes = attributes.reduce(
    (sum, [, attr]) => sum + attr.itemSize * attr.array.BYTES_PER_ELEMENT,
    20,
  );
  if (
    perVertexBytes * Math.min(count + corners, limits.unwrapVertices) >
    limits.unwrapAttributeBytes
  )
    throw new RangeError(
      `autoUnwrap: attribute budget exceeds ${limits.unwrapAttributeBytes} bytes.`,
    );
  for (const [name, attribute] of attributes) {
    const getters = [attribute.getX, attribute.getY, attribute.getZ, attribute.getW];
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < attribute.itemSize; c++) {
        const value = getters[c]!.call(attribute, i);
        if (!Number.isFinite(value))
          throw new TypeError(`autoUnwrap: ${name} contains non-finite values.`);
      }
    }
  }
  if (geometry.index && (geometry.index.itemSize !== 1 || geometry.index.normalized))
    throw new TypeError('autoUnwrap: index must be a scalar, non-normalized integer attribute.');
  const index = new Uint32Array(corners);
  for (let i = 0; i < corners; i++) {
    const value = geometry.index ? geometry.index.getX(i) : i;
    if (!Number.isSafeInteger(value) || value < 0 || value >= count)
      throw new RangeError('autoUnwrap: index references an invalid source vertex.');
    index[i] = value;
  }
  for (const { start, count: length, materialIndex = 0 } of geometry.groups) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < 0 ||
      length < 0 ||
      start % 3 ||
      length % 3 ||
      start + length > corners ||
      !Number.isSafeInteger(materialIndex) ||
      materialIndex < 0
    )
      throw new TypeError(
        'autoUnwrap: groups must reference complete source triangles and nonnegative material indices.',
      );
  }
  return {
    index,
    positions: xyz(position, 'position'),
    normals: useNormals ? xyz(normal, 'normal') : null,
    useNormals,
    resolution,
    padding,
  };
}
