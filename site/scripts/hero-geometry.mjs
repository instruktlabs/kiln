import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * The world-space triangles of a GLB, per named node, for the hero generator: part bounds centres and the
 * visibility test of a callout (does the camera ray through a part's projected centre reach that part first?).
 * Plain glTF only: a file that requires an extension (compression, quantization) is refused rather than misread.
 */

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const READERS = {
  5120: [1, (view, at) => view.getInt8(at)],
  5121: [1, (view, at) => view.getUint8(at)],
  5122: [2, (view, at) => view.getInt16(at, true)],
  5123: [2, (view, at) => view.getUint16(at, true)],
  5125: [4, (view, at) => view.getUint32(at, true)],
  5126: [4, (view, at) => view.getFloat32(at, true)],
};

/** Parse a GLB into its JSON and binary chunk. */
export function readGlb(bytes) {
  const data = Buffer.from(bytes);
  if (data.toString('ascii', 0, 4) !== 'glTF' || data.readUInt32LE(4) !== 2) throw new Error('Not a glTF 2.0 binary');
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.toString('utf8', 20, 20 + jsonLength).trim());
  const binStart = 20 + jsonLength;
  const bin = binStart < data.length ? data.subarray(binStart + 8, binStart + 8 + data.readUInt32LE(binStart)) : Buffer.alloc(0);
  if (json.extensionsRequired?.length) throw new Error(`The GLB requires ${json.extensionsRequired.join(', ')}; the hero reads plain glTF only`);
  return { json, bin };
}

function accessorValues({ json, bin }, index) {
  const accessor = json.accessors[index];
  if (accessor.sparse) throw new Error(`Accessor ${index} is sparse`);
  const bufferView = json.bufferViews[accessor.bufferView];
  const width = COMPONENTS[accessor.type];
  const [size, read] = READERS[accessor.componentType];
  const stride = bufferView.byteStride ?? width * size;
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const values = new Float64Array(accessor.count * width);
  for (let item = 0; item < accessor.count; item++) {
    for (let component = 0; component < width; component++) values[item * width + component] = read(view, base + item * stride + component * size);
  }
  return values;
}

/**
 * Every mesh node's triangles in world space, keyed by its node path (`Root/Group/Mesh`), the way Kiln names
 * parts. Returns `[{ path, positions }]` where `positions` holds nine numbers per triangle.
 */
export function worldTriangles(bytes) {
  const glb = readGlb(bytes);
  const { json } = glb;
  const parts = [];
  const visit = (index, parent, parentPath) => {
    const node = json.nodes[index];
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local);
    const path = [...parentPath, node.name ?? `node_${index}`];
    if (node.mesh !== undefined) {
      const triangles = [];
      for (const primitive of json.meshes[node.mesh].primitives) {
        if ((primitive.mode ?? 4) !== 4) continue;
        const positions = accessorValues(glb, primitive.attributes.POSITION);
        const count = positions.length / 3;
        const indices = primitive.indices !== undefined ? accessorValues(glb, primitive.indices) : Float64Array.from({ length: count }, (_, i) => i);
        const point = new Vector3();
        for (const vertex of indices) {
          point.set(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]).applyMatrix4(world);
          triangles.push(point.x, point.y, point.z);
        }
      }
      parts.push({ path: path.join('/'), positions: Float64Array.from(triangles) });
    }
    for (const child of node.children ?? []) visit(child, world, path);
  };
  for (const index of json.scenes[json.scene ?? 0].nodes) visit(index, new Matrix4(), []);
  return parts;
}

/** The axis-aligned bounds of every triangle under a part path (the node itself or any descendant). */
export function partBounds(parts, path) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let found = 0;
  for (const part of parts) {
    if (part.path !== path && !part.path.startsWith(`${path}/`)) continue;
    found++;
    for (let i = 0; i < part.positions.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], part.positions[i + axis]);
        max[axis] = Math.max(max[axis], part.positions[i + axis]);
      }
    }
  }
  if (!found) throw new Error(`No mesh under part path ${path}`);
  return { min, max, centre: min.map((value, axis) => (value + max[axis]) / 2) };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * The first surface an orthographic camera sees at a world point's screen position: the ray runs along the view
 * direction through the point. Returns the owning part path and the hit distance, or null.
 */
export function firstHit(parts, point, viewDirection) {
  const direction = viewDirection.map((value) => -value);
  const origin = point.map((value, axis) => value + viewDirection[axis] * 1e5);
  let best = null;
  for (const part of parts) {
    const p = part.positions;
    for (let i = 0; i < p.length; i += 9) {
      const a = [p[i], p[i + 1], p[i + 2]];
      const edge1 = [p[i + 3] - a[0], p[i + 4] - a[1], p[i + 5] - a[2]];
      const edge2 = [p[i + 6] - a[0], p[i + 7] - a[1], p[i + 8] - a[2]];
      const h = cross(direction, edge2);
      const det = dot(edge1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(origin, a);
      const u = dot(s, h) / det;
      if (u < 0 || u > 1) continue;
      const q = cross(s, edge1);
      const v = dot(direction, q) / det;
      if (v < 0 || u + v > 1) continue;
      const t = dot(edge2, q) / det;
      if (t > 0 && (!best || t < best.distance)) best = { path: part.path, distance: t };
    }
  }
  return best;
}
