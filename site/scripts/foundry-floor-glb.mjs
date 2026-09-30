import { Matrix4, Quaternion, Vector3 } from 'three';
import { parseGlb } from './vehicle-glb.mjs';

/**
 * Measure a Foundry Floor model from its GLB: triangles, vertex-exact bounds, materials, clips and nodes, read from
 * the file itself.
 *
 * A Foundry Floor model keeps its far form as a node named `lod1` inside the same file, and some models carry parts
 * the scene hides when it loads them (`hideByDefault` in the pack's `data/assets.json`). The file itself has no
 * visibility flags: every part exports visible, so a plain glTF viewer draws the detailed parts, `lod1` and the
 * hidden parts together. The pack's own asset map counts three groups, and so does this reader:
 *
 * - detailed: every mesh that is neither under `lod1` nor under a hidden-by-default node;
 * - lod1: every mesh under the `lod1` node;
 * - hiddenByDefault: every mesh under a hidden-by-default node (and not under `lod1`).
 *
 * `bounds` covers everything outside `lod1` (the asset map's `bounds`); `detailedBounds` only the detailed group;
 * `lod1Bounds` the `lod1` group; `allBounds` everything a plain viewer draws.
 */

const TRIANGLES = 4;
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
export const round4 = (value) => {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** One accessor as plain numbers (normalized integers mapped to [0, 1] or [-1, 1]). */
function readAccessor(json, bin, index) {
  const accessor = json.accessors?.[index];
  if (!accessor) throw new Error(`accessor ${index} is missing`);
  if (accessor.sparse) throw new Error(`accessor ${index} is sparse, which this reader does not support`);
  const size = COMPONENTS[accessor.type];
  const bytes = BYTES[accessor.componentType];
  if (!size || !bytes) throw new Error(`accessor ${index}: unsupported ${accessor.type} of component ${accessor.componentType}`);
  const values = new Float64Array(accessor.count * size);
  if (accessor.bufferView === undefined) return values;
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`bufferView ${accessor.bufferView} is missing`);
  const stride = view.byteStride ?? size * bytes;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let item = 0; item < accessor.count; item++) {
    for (let component = 0; component < size; component++) {
      const at = base + item * stride + component * bytes;
      let value;
      switch (accessor.componentType) {
        case 5126: value = data.getFloat32(at, true); break;
        case 5125: value = data.getUint32(at, true); break;
        case 5123: value = data.getUint16(at, true); if (accessor.normalized) value /= 65535; break;
        case 5122: value = data.getInt16(at, true); if (accessor.normalized) value = Math.max(value / 32767, -1); break;
        case 5121: value = data.getUint8(at); if (accessor.normalized) value /= 255; break;
        default: value = data.getInt8(at); if (accessor.normalized) value = Math.max(value / 127, -1);
      }
      values[item * size + component] = value;
    }
  }
  return values;
}

const localMatrix = (node) => (node.matrix
  ? new Matrix4().fromArray(node.matrix)
  : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1]))));

const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const grow = (box, point) => {
  for (let axis = 0; axis < 3; axis++) {
    if (point[axis] < box.min[axis]) box.min[axis] = point[axis];
    if (point[axis] > box.max[axis]) box.max[axis] = point[axis];
  }
};
const union = (...boxes) => {
  const out = emptyBox();
  for (const box of boxes) if (Number.isFinite(box.min[0])) { grow(out, box.min); grow(out, box.max); }
  return out;
};
/** A box as the asset map writes it: min, max and size, each rounded to 0.1 mm; null when empty. */
export const boxRecord = (box) => (Number.isFinite(box.min[0])
  ? { min: box.min.map(round4), max: box.max.map(round4), size: box.max.map((value, axis) => round4(value - box.min[axis])) }
  : null);

/**
 * Measure one GLB. `hideByDefault` names the nodes the scene hides at load (from the asset map); a name the file
 * lacks is an error, as it is in the pack's own intake script.
 */
export function inspectFoundryFloorGlb(bytes, { hideByDefault = [] } = {}) {
  const { json, binBytes } = parseGlb(bytes);
  const nodes = json.nodes ?? [];
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((node, index) => { for (const child of node.children ?? []) parent[child] = index; });
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, index) => index).filter((index) => parent[index] < 0);
  const byName = new Map();
  nodes.forEach((node, index) => { const name = node.name ?? `node${index}`; if (!byName.has(name)) byName.set(name, index); });
  const under = (index, ancestor) => {
    for (let at = index; at >= 0; at = parent[at]) if (at === ancestor) return true;
    return false;
  };
  const lod = byName.get('lod1');
  const hidden = hideByDefault.map((name) => {
    const index = byName.get(name);
    if (index === undefined) throw new Error(`The asset map hides node ${name}, which the GLB lacks`);
    return index;
  });
  const world = new Array(nodes.length);
  const walk = (index, parentWorld) => {
    world[index] = parentWorld.clone().multiply(localMatrix(nodes[index]));
    for (const child of nodes[index].children ?? []) walk(child, world[index]);
  };
  for (const root of roots) walk(root, new Matrix4());

  const groups = { detailed: { triangles: 0, meshes: 0, box: emptyBox() }, lod1: { triangles: 0, meshes: 0, box: emptyBox() }, hiddenByDefault: { triangles: 0, meshes: 0, box: emptyBox() } };
  const materialsUsed = new Set();
  const unreachable = [];
  const point = new Vector3();
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    if (!world[index]) {
      unreachable.push(node.name ?? `node${index}`);
      return;
    }
    const group = lod !== undefined && under(index, lod) ? groups.lod1 : hidden.some((ancestor) => under(index, ancestor)) ? groups.hiddenByDefault : groups.detailed;
    group.meshes += 1;
    for (const primitive of json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES || primitive.attributes.POSITION === undefined) continue;
      const positions = readAccessor(json, binBytes, primitive.attributes.POSITION);
      const indices = primitive.indices !== undefined ? readAccessor(json, binBytes, primitive.indices) : Float64Array.from({ length: positions.length / 3 }, (_, vertex) => vertex);
      const count = Math.floor(indices.length / 3);
      group.triangles += count;
      if (primitive.material !== undefined) materialsUsed.add(json.materials?.[primitive.material]?.name ?? '');
      for (let corner = 0; corner < count * 3; corner++) {
        const vertex = indices[corner] * 3;
        point.set(positions[vertex], positions[vertex + 1], positions[vertex + 2]).applyMatrix4(world[index]);
        grow(group.box, [point.x, point.y, point.z]);
      }
    }
  });
  const materials = (json.materials ?? []).map((material) => material.name ?? '');
  return {
    root: roots.map((index) => nodes[index].name ?? `node${index}`).join(','),
    hasLod1: lod !== undefined,
    triangles: {
      detailed: groups.detailed.triangles,
      lod1: groups.lod1.triangles,
      hiddenByDefault: groups.hiddenByDefault.triangles,
      total: groups.detailed.triangles + groups.lod1.triangles + groups.hiddenByDefault.triangles,
    },
    meshes: { detailed: groups.detailed.meshes, lod1: groups.lod1.meshes, hiddenByDefault: groups.hiddenByDefault.meshes },
    bounds: boxRecord(union(groups.detailed.box, groups.hiddenByDefault.box)),
    detailedBounds: boxRecord(groups.detailed.box),
    lod1Bounds: boxRecord(groups.lod1.box),
    allBounds: boxRecord(union(groups.detailed.box, groups.hiddenByDefault.box, groups.lod1.box)),
    // Materials in file order, keeping only those a triangle uses (the asset map's list).
    materials: materials.filter((name) => materialsUsed.has(name)),
    materialCount: materials.length,
    textures: json.textures?.length ?? 0,
    clips: (json.animations ?? []).map((clip, index) => clip.name ?? `clip${index}`),
    nodeCount: nodes.length,
    meshCount: json.meshes?.length ?? 0,
    unreachableMeshNodes: unreachable,
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    generator: json.asset?.generator ?? null,
    assetExtras: json.asset?.extras ?? null,
    copyright: json.asset?.copyright ?? null,
  };
}
