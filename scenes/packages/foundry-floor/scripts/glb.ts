// SPDX-License-Identifier: MIT
// A small glTF 2.0 binary reader for the pack's accepted GLBs: the node tree with rest transforms, mesh triangles in
// any frame, and animation sampling. No three, React or DOM, so the asset intake script and the bun tests (sim-spec
// 12 tests 3 and 4) measure the real geometry with the same code. Matrices are column-major 4x4 (glTF order).
export type M4 = Float64Array;
export type V3 = [number, number, number];
export type Q4 = [number, number, number, number];

interface AccessorJson { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean; min?: number[]; max?: number[]; sparse?: unknown }
interface BufferViewJson { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }
interface PrimitiveJson { attributes: Record<string, number>; indices?: number; material?: number; mode?: number }
interface NodeJson { name?: string; children?: number[]; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extensions?: Record<string, unknown> }
interface ChannelJson { sampler: number; target: { node?: number; path: string } }
interface SamplerJson { input: number; output: number; interpolation?: string }
export interface GltfJson {
  asset: { version: string; generator?: string };
  scene?: number; scenes?: { nodes?: number[]; name?: string }[];
  nodes?: NodeJson[]; meshes?: { name?: string; primitives: PrimitiveJson[] }[];
  materials?: { name?: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number }; emissiveFactor?: number[]; doubleSided?: boolean; extensions?: Record<string, unknown> }[];
  accessors?: AccessorJson[]; bufferViews?: BufferViewJson[]; buffers?: { byteLength: number; uri?: string }[];
  animations?: { name?: string; channels: ChannelJson[]; samplers: SamplerJson[] }[];
  extensionsUsed?: string[]; extensionsRequired?: string[];
}
export interface GlbFile { json: GltfJson; bin: Uint8Array }

export function parseGlb(bytes: Uint8Array): GlbFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB (magic)');
  if (view.getUint32(4, true) !== 2) throw new Error('GLB version is not 2');
  const length = view.getUint32(8, true);
  if (length !== bytes.byteLength) throw new Error(`GLB length ${length} differs from the file (${bytes.byteLength})`);
  let offset = 12, json: GltfJson | null = null, bin: Uint8Array = new Uint8Array(0);
  while (offset + 8 <= length) {
    const chunkLength = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), body = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as GltfJson;
    else if (type === 0x004e4942) bin = body;
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  return { json, bin };
}

// ---------------------------------------------------------------- math (column-major)

export function identity(): M4 { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
export function compose(t: readonly number[], r: readonly number[], s: readonly number[], out: M4 = new Float64Array(16)): M4 {
  const [x, y, z, w] = r as Q4, [sx, sy, sz] = s as V3;
  const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx; out[2] = (xz - wy) * sx; out[3] = 0;
  out[4] = (xy - wz) * sy; out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy; out[7] = 0;
  out[8] = (xz + wy) * sz; out[9] = (yz - wx) * sz; out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
  out[12] = t[0]!; out[13] = t[1]!; out[14] = t[2]!; out[15] = 1;
  return out;
}
export function multiply(a: M4, b: M4, out: M4 = new Float64Array(16)): M4 {
  const r = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + row]! * b[c * 4 + k]!;
    r[c * 4 + row] = v;
  }
  out.set(r);
  return out;
}
export function transformPoint(m: M4, x: number, y: number, z: number): V3 {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}
export function det3(m: M4): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}
/** Yaw about +Y (radians) and a translation, as a column-major matrix. */
export function placement(x: number, y: number, z: number, yaw: number, scale = 1): M4 {
  const h = yaw / 2;
  return compose([x, y, z], [0, Math.sin(h), 0, Math.cos(h)], [scale, scale, scale]);
}

// ---------------------------------------------------------------- accessors

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
/** Reads an accessor as plain numbers (normalized integers are mapped to [0, 1] or [-1, 1]). */
export function readAccessor(file: GlbFile, index: number): { values: Float64Array; size: number; count: number } {
  const a = file.json.accessors?.[index];
  if (!a) throw new Error(`accessor ${index} is missing`);
  if (a.sparse) throw new Error(`accessor ${index} is sparse (not supported)`);
  const size = COMPONENTS[a.type] ?? 0, bytes = BYTES[a.componentType] ?? 0, values = new Float64Array(a.count * size);
  if (a.bufferView === undefined) return { values, size, count: a.count };
  const bv = file.json.bufferViews?.[a.bufferView];
  if (!bv) throw new Error(`bufferView ${a.bufferView} is missing`);
  const stride = bv.byteStride ?? size * bytes, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const view = new DataView(file.bin.buffer, file.bin.byteOffset, file.bin.byteLength);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) {
    const at = base + i * stride + c * bytes;
    let v: number;
    switch (a.componentType) {
      case 5126: v = view.getFloat32(at, true); break;
      case 5125: v = view.getUint32(at, true); break;
      case 5123: v = view.getUint16(at, true); if (a.normalized) v /= 65535; break;
      case 5122: v = view.getInt16(at, true); if (a.normalized) v = Math.max(v / 32767, -1); break;
      case 5121: v = view.getUint8(at); if (a.normalized) v /= 255; break;
      case 5120: v = view.getInt8(at); if (a.normalized) v = Math.max(v / 127, -1); break;
      default: throw new Error(`accessor ${index}: component type ${a.componentType}`);
    }
    values[i * size + c] = v;
  }
  return { values, size, count: a.count };
}

// ---------------------------------------------------------------- nodes

export interface NodeRec { index: number; name: string; parent: number; children: number[]; mesh: number | null; t: V3; r: Q4; s: V3; matrix: number[] | null }
export interface SceneTree { nodes: NodeRec[]; roots: number[]; byName: Map<string, number> }
export function sceneTree(file: GlbFile): SceneTree {
  const json = file.json, list = json.nodes ?? [];
  const nodes: NodeRec[] = list.map((n, index) => ({
    index, name: n.name ?? `node${index}`, parent: -1, children: [...(n.children ?? [])], mesh: n.mesh ?? null,
    t: [...(n.translation ?? [0, 0, 0])] as V3, r: [...(n.rotation ?? [0, 0, 0, 1])] as Q4, s: [...(n.scale ?? [1, 1, 1])] as V3, matrix: n.matrix ? [...n.matrix] : null,
  }));
  for (const n of nodes) for (const c of n.children) { const child = nodes[c]; if (child) child.parent = n.index; }
  const roots = [...(json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.filter(n => n.parent < 0).map(n => n.index))];
  // Lower levels replace their owner as siblings, with the same parent transform; they need not be scene roots.
  for (const [owner, node] of list.entries()) {
    const ids = (node.extensions?.MSFT_lod as { ids?: number[] } | undefined)?.ids ?? [];
    for (const id of ids) {
      const lower = nodes[id], parent = nodes[owner]!.parent;
      if (!lower || id === owner) throw new Error('Invalid MSFT_lod node reference');
      if (lower.parent >= 0 && lower.parent !== parent) throw new Error('MSFT_lod node already has a different parent');
      lower.parent = parent;
      const siblings = parent < 0 ? roots : nodes[parent]!.children;
      if (!siblings.includes(id)) siblings.push(id);
    }
  }
  const byName = new Map<string, number>();
  for (const n of nodes) if (!byName.has(n.name)) byName.set(n.name, n.index);
  return { nodes, roots, byName };
}
export type Pose = Map<number, { t?: V3; r?: Q4; s?: V3 }>;
export function localMatrix(n: NodeRec, pose?: Pose): M4 {
  if (n.matrix && !pose?.has(n.index)) return Float64Array.from(n.matrix);
  const p = pose?.get(n.index);
  return compose(p?.t ?? n.t, p?.r ?? n.r, p?.s ?? n.s);
}
/** World matrices of every node reachable from the scene roots, under an optional animated pose. */
export function worldMatrices(tree: SceneTree, pose?: Pose, root: M4 = identity()): M4[] {
  const out: M4[] = new Array(tree.nodes.length);
  const walk = (i: number, parent: M4) => {
    const n = tree.nodes[i] as NodeRec, w = multiply(parent, localMatrix(n, pose));
    out[i] = w;
    for (const c of n.children) walk(c, w);
  };
  for (const r of tree.roots) walk(r, root);
  return out;
}
/** True when node i is `ancestor` or lies below it. */
export function isUnder(tree: SceneTree, i: number, ancestor: number): boolean {
  for (let k = i; k >= 0; k = (tree.nodes[k] as NodeRec).parent) if (k === ancestor) return true;
  return false;
}
/** Nearest node (self first) whose name passes `test`, or -1. */
export function nearestNamed(tree: SceneTree, i: number, test: (name: string) => boolean): number {
  for (let k = i; k >= 0; k = (tree.nodes[k] as NodeRec).parent) if (test((tree.nodes[k] as NodeRec).name)) return k;
  return -1;
}

// ---------------------------------------------------------------- triangles

export interface Triangles { positions: Float64Array; count: number; material: number }
/** The triangles of one mesh in its own frame (mode 4 primitives; other modes are skipped). */
export function meshTriangles(file: GlbFile, meshIndex: number): Triangles[] {
  const mesh = file.json.meshes?.[meshIndex];
  if (!mesh) return [];
  const out: Triangles[] = [];
  for (const prim of mesh.primitives) {
    if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue;
    const pos = readAccessor(file, prim.attributes.POSITION).values;
    const idx = prim.indices !== undefined ? readAccessor(file, prim.indices).values : Float64Array.from({ length: pos.length / 3 }, (_, i) => i);
    const count = Math.floor(idx.length / 3), positions = new Float64Array(count * 9);
    for (let t = 0; t < count; t++) for (let k = 0; k < 3; k++) {
      const v = idx[t * 3 + k]! * 3;
      positions[t * 9 + k * 3] = pos[v]!; positions[t * 9 + k * 3 + 1] = pos[v + 1]!; positions[t * 9 + k * 3 + 2] = pos[v + 2]!;
    }
    out.push({ positions, count, material: prim.material ?? -1 });
  }
  return out;
}
export function triangleCount(file: GlbFile, meshIndex: number): number {
  const mesh = file.json.meshes?.[meshIndex];
  if (!mesh) return 0;
  let n = 0;
  for (const prim of mesh.primitives) {
    if ((prim.mode ?? 4) !== 4) continue;
    const a = prim.indices !== undefined ? file.json.accessors?.[prim.indices] : file.json.accessors?.[prim.attributes.POSITION ?? -1];
    n += Math.floor((a?.count ?? 0) / 3);
  }
  return n;
}
/** Axis-aligned bounds of the given mesh nodes' triangles under world matrices `world`. */
export interface Box { min: V3; max: V3 }
export function emptyBox(): Box { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
export function growBox(b: Box, p: readonly number[]): void {
  for (let k = 0; k < 3; k++) { if (p[k]! < b.min[k]!) b.min[k] = p[k]!; if (p[k]! > b.max[k]!) b.max[k] = p[k]!; }
}
export function nodesBounds(file: GlbFile, tree: SceneTree, world: M4[], include: (i: number) => boolean): Box {
  const box = emptyBox();
  for (const n of tree.nodes) {
    if (n.mesh === null || !include(n.index) || !world[n.index]) continue;
    const m = world[n.index] as M4;
    for (const tri of meshTriangles(file, n.mesh)) for (let v = 0; v < tri.count * 3; v++) growBox(box, transformPoint(m, tri.positions[v * 3]!, tri.positions[v * 3 + 1]!, tri.positions[v * 3 + 2]!));
  }
  return box;
}

// ---------------------------------------------------------------- animation

export interface ClipChannel { node: number; path: 'translation' | 'rotation' | 'scale' | 'weights'; times: Float64Array; values: Float64Array; size: number; interpolation: string }
export interface Clip { name: string; seconds: number; channels: ClipChannel[] }
export function clips(file: GlbFile): Clip[] {
  return (file.json.animations ?? []).map((a, ai) => {
    const channels: ClipChannel[] = [];
    let seconds = 0;
    for (const ch of a.channels) {
      const sampler = a.samplers[ch.sampler];
      if (!sampler || ch.target.node === undefined) continue;
      const times = readAccessor(file, sampler.input).values, out = readAccessor(file, sampler.output);
      seconds = Math.max(seconds, times[times.length - 1] ?? 0);
      channels.push({ node: ch.target.node, path: ch.target.path as ClipChannel['path'], times, values: out.values, size: out.size, interpolation: sampler.interpolation ?? 'LINEAR' });
    }
    return { name: a.name ?? `clip${ai}`, seconds, channels };
  });
}
function slerp(a: readonly number[], b: readonly number[], f: number): Q4 {
  let [bx, by, bz, bw] = b as Q4;
  let dot = a[0]! * bx + a[1]! * by + a[2]! * bz + a[3]! * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let k0 = 1 - f, k1 = f;
  if (dot < 0.9995) { const th = Math.acos(dot), s = Math.sin(th); k0 = Math.sin((1 - f) * th) / s; k1 = Math.sin(f * th) / s; }
  const q: Q4 = [a[0]! * k0 + bx * k1, a[1]! * k0 + by * k1, a[2]! * k0 + bz * k1, a[3]! * k0 + bw * k1];
  const l = Math.hypot(...q) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}
/** One channel's value at time t (clamped to the key range). */
export function sampleChannel(ch: ClipChannel, t: number): number[] {
  const { times, values, size } = ch, n = times.length, cubic = ch.interpolation === 'CUBICSPLINE', stride = cubic ? size * 3 : size;
  const key = (i: number) => Array.from(values.subarray(i * stride + (cubic ? size : 0), i * stride + (cubic ? size : 0) + size));
  if (n === 0) return [];
  if (t <= times[0]!) return key(0);
  if (t >= times[n - 1]!) return key(n - 1);
  let i = 0;
  while (i + 1 < n && times[i + 1]! <= t) i++;
  const t0 = times[i]!, t1 = times[i + 1]!, dt = t1 - t0, f = dt > 0 ? (t - t0) / dt : 0;
  if (ch.interpolation === 'STEP') return key(i);
  if (cubic) {
    const p0 = key(i), p1 = key(i + 1), m0 = Array.from(values.subarray(i * stride + 2 * size, i * stride + 3 * size)), m1 = Array.from(values.subarray((i + 1) * stride, (i + 1) * stride + size));
    const f2 = f * f, f3 = f2 * f, h00 = 2 * f3 - 3 * f2 + 1, h10 = f3 - 2 * f2 + f, h01 = -2 * f3 + 3 * f2, h11 = f3 - f2;
    const v = p0.map((p, k) => h00 * p + h10 * dt * m0[k]! + h01 * p1[k]! + h11 * dt * m1[k]!);
    if (ch.path === 'rotation') { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }
    return v;
  }
  const a = key(i), b = key(i + 1);
  if (ch.path === 'rotation') return slerp(a, b, f);
  return a.map((x, k) => x + (b[k]! - x) * f);
}
/** Writes the pose of `clip` at time t into `pose` (overrides per node). */
export function samplePose(clip: Clip, t: number, pose: Pose = new Map()): Pose {
  for (const ch of clip.channels) {
    if (ch.path === 'weights') continue;
    const entry = pose.get(ch.node) ?? {}, v = sampleChannel(ch, t);
    if (ch.path === 'translation') entry.t = v as V3; else if (ch.path === 'rotation') entry.r = v as Q4; else entry.s = v as V3;
    pose.set(ch.node, entry);
  }
  return pose;
}
/** A clip is a closed loop when every channel's first and last keys are equal. */
export function isClosedLoop(clip: Clip, tolerance = 1e-5): boolean {
  return clip.channels.length > 0 && clip.channels.every(ch => {
    const first = sampleChannel(ch, ch.times[0]!), last = sampleChannel(ch, ch.times[ch.times.length - 1]!);
    if (ch.path === 'rotation') { const d = Math.abs(first.reduce((s, x, k) => s + x * last[k]!, 0)); return 1 - d <= tolerance; }
    return first.every((x, k) => Math.abs(x - last[k]!) <= tolerance);
  });
}
