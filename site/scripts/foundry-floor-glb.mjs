import { Matrix4, Quaternion, Vector3 } from 'three';
import { parseGlb } from './vehicle-glb.mjs';

/**
 * Measure a Foundry Floor model from its GLB: triangles, vertex-exact bounds, materials, clips and nodes, read from
 * the file itself.
 *
 * Historical files use a visible named `lod1`; standard files reference optional detached lower subtrees with
 * MSFT_lod. Both are measured, without counting optional lower tiers as default-scene drawing. Scene-specific
 * hideByDefault names stay a separate measured group; generic loaders do not apply that scene policy.
 *
 * `triangles` splits all geometry into detailed, lower and hidden groups; `defaultTriangles` counts the actual
 * scene roots. `bounds` excludes lower forms, `lod1Bounds` includes them, and `allBounds` covers every tier.
 * Unreferenced mesh nodes, invalid extension targets and cycles remain errors at the intake boundary.
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
  const parentWorlds = new Array(nodes.length);
  const defaultNodes = new Set();
  const optionalLodNodes = new Set();
  const walk = (index, parentWorld, optional = false) => {
    if(!Number.isInteger(index)||!nodes[index]||world[index])throw new Error('Invalid, cyclic or overlapping scene/LOD node');
    world[index] = parentWorld.clone().multiply(localMatrix(nodes[index]));
    parentWorlds[index] = parentWorld;
    (optional ? optionalLodNodes : defaultNodes).add(index);
    for (const child of nodes[index].children ?? []) walk(child, world[index], optional);
  };
  for (const root of roots) walk(root, new Matrix4());
  const lodOwners = new Set();
  // Optional MSFT_lod subtrees deliberately live outside the default scene tree. Measure them
  // through their declared owner transform; an ordinary loader still draws only the scene roots.
  for(let changed=true;changed;) {
    changed=false;
    for(let index=0;index<nodes.length;index++) {
      const ids=nodes[index].extensions?.MSFT_lod?.ids;
      if(ids===undefined||!world[index]||lodOwners.has(index))continue;
      if(!Array.isArray(ids)||!ids.length||!json.extensionsUsed?.includes('MSFT_lod'))throw new Error('Invalid MSFT_lod declaration');
      lodOwners.add(index);changed=true;
      const parentWorld=parentWorlds[index];
      for(const id of ids)walk(id,parentWorld,true);
    }
  }

  const groups = { detailed: { triangles: 0, meshes: 0, box: emptyBox() }, lod1: { triangles: 0, meshes: 0, box: emptyBox() }, hiddenByDefault: { triangles: 0, meshes: 0, box: emptyBox() } };
  const materialsUsed = new Set();
  const unreachable = [];
  const point = new Vector3();
  let defaultTriangles=0;
  nodes.forEach((node, index) => {
    if (node.mesh === undefined) return;
    if (!world[index]) {
      unreachable.push(node.name ?? `node${index}`);
      return;
    }
    const group = optionalLodNodes.has(index) || lod !== undefined && under(index, lod) ? groups.lod1 : hidden.some((ancestor) => under(index, ancestor)) ? groups.hiddenByDefault : groups.detailed;
    group.meshes += 1;
    for (const primitive of json.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? TRIANGLES) !== TRIANGLES || primitive.attributes.POSITION === undefined) continue;
      const positions = readAccessor(json, binBytes, primitive.attributes.POSITION);
      const indices = primitive.indices !== undefined ? readAccessor(json, binBytes, primitive.indices) : Float64Array.from({ length: positions.length / 3 }, (_, vertex) => vertex);
      const count = Math.floor(indices.length / 3);
      group.triangles += count;
      if(defaultNodes.has(index))defaultTriangles+=count;
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
    hasLod1: lod !== undefined || lodOwners.size>0,
    lodMode: lodOwners.size>0?'MSFT_lod':lod!==undefined?'named-visible':'none',
    defaultTriangles,
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
