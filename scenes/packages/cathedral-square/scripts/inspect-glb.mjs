import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const buf = readFileSync(file);
console.log('bytes', buf.length, 'sha256', createHash('sha256').update(buf).digest('hex'));
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not glb');
let offset = 12;
let json;
let bin;
while (offset + 8 <= buf.length) {
  const length = buf.readUInt32LE(offset);
  const type = buf.readUInt32LE(offset + 4);
  const body = buf.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
  else if (type === 0x004e4942) bin = body;
  offset += 8 + length;
}
if (!json || !bin) throw new Error('missing chunks');

const f32 = (accessor) => {
  const view = json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return new Float32Array(bin.buffer, bin.byteOffset + start, accessor.count * 3);
};
const u32 = (accessor) => {
  const view = json.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (accessor.componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + start, accessor.count);
  if (accessor.componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + start, accessor.count);
  throw new Error(`index type ${accessor.componentType}`);
};

const parent = new Array(json.nodes.length).fill(-1);
for (let i = 0; i < json.nodes.length; i++) for (const c of json.nodes[i].children ?? []) parent[c] = i;
const world = new Array(json.nodes.length);
function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function worldOf(i) {
  if (world[i]) return world[i];
  const local = nodeMatrix(json.nodes[i]);
  world[i] = parent[i] < 0 ? local : matMul(worldOf(parent[i]), local);
  return world[i];
}
const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function transformPoint(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
function aabbOf(accessor, m) {
  const [ax, ay, az] = accessor.min;
  const [bx, by, bz] = accessor.max;
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [ax, bx]) for (const y of [ay, by]) for (const z of [az, bz]) {
    const p = transformPoint(m, x, y, z);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  }
  return { min, max };
}

const sceneNodes = json.scenes[json.scene ?? 0].nodes ?? [];
const seen = new Set();
const roots = [];
function walk(i) { if (seen.has(i)) return; seen.add(i); roots.push(i); for (const c of json.nodes[i].children ?? []) walk(c); }
for (const n of sceneNodes) walk(n);

const interesting = /ground|door|portal|step|west|tower|rose|trumeau|jamb|porch/i;
const names = new Map();
let tris = 0;
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const west = [];
for (const i of roots) {
  const node = json.nodes[i];
  if (node.mesh === undefined) continue;
  const mesh = json.meshes[node.mesh];
  const m = worldOf(i);
  const label = node.name || mesh.name || `node${i}`;
  names.set(label, (names.get(label) ?? 0) + 1);
  for (const prim of mesh.primitives) {
    const acc = json.accessors[prim.attributes.POSITION];
    const count = prim.indices !== undefined ? json.accessors[prim.indices].count / 3 : acc.count / 3;
    tris += count;
    const box = aabbOf(acc, m);
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], box.min[k]); max[k] = Math.max(max[k], box.max[k]); }
    if (interesting.test(label) || interesting.test(mesh.name ?? '') || interesting.test(json.materials?.[prim.material]?.name ?? '')) {
      west.push({ name: label, material: json.materials?.[prim.material]?.name, tris: Math.round(count), min: box.min.map(n => +n.toFixed(2)), max: box.max.map(n => +n.toFixed(2)) });
    }
  }
}
console.log('nodes', json.nodes.length, 'meshes', json.meshes.length, 'drawnTris', Math.round(tris));
console.log('bounds', min.map(n => +n.toFixed(2)), max.map(n => +n.toFixed(2)));
const named = [...names.entries()].filter(([name]) => interesting.test(name)).sort((a, b) => a[0].localeCompare(b[0]));
console.log('interesting names', named.length);
for (const [name, n] of named) console.log(`  ${n}x ${name}`);
const grouped = new Map();
for (const item of west) {
  const g = grouped.get(item.name) ?? { name: item.name, material: item.material, tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  g.tris += item.tris;
  for (let k = 0; k < 3; k++) { g.min[k] = Math.min(g.min[k], item.min[k]); g.max[k] = Math.max(g.max[k], item.max[k]); }
  grouped.set(item.name, g);
}
console.log('interesting groups', grouped.size);
for (const item of [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`${item.name} tris=${item.tris} min=${item.min.map(n => n.toFixed(2))} max=${item.max.map(n => n.toFixed(2))} mat=${item.material}`);
}
if (process.argv[3] !== '--openings') process.exit(0);

// Occupancy of the west wall at walking height: z bins, max x of geometry with y in [0.3, 2.4] and x in [40, 80].
const z0 = -22, z1 = 22, dz = 0.25;
const bins = Math.round((z1 - z0) / dz);
const maxX = new Array(bins).fill(-Infinity);
const minX = new Array(bins).fill(Infinity);
const count = new Array(bins).fill(0);
let scanned = 0;
for (const i of roots) {
  const node = json.nodes[i];
  if (node.mesh === undefined) continue;
  const m = worldOf(i);
  const mesh = json.meshes[node.mesh];
  for (const prim of mesh.primitives) {
    const acc = json.accessors[prim.attributes.POSITION];
    const box = aabbOf(acc, m);
    if (box.max[0] < 48 || box.min[0] > 75 || box.max[1] < 0.3 || box.min[1] > 2.4 || box.max[2] < z0 || box.min[2] > z1) continue;
    const pos = f32(acc);
    const index = prim.indices !== undefined ? u32(json.accessors[prim.indices]) : null;
    const n = index ? index.length : acc.count;
    const p = (k) => {
      const v = index ? index[k] : k;
      return transformPoint(m, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
    };
    for (let t = 0; t < n; t += 3) {
      const a = p(t), b = p(t + 1), c = p(t + 2);
      const yMin = Math.min(a[1], b[1], c[1]), yMax = Math.max(a[1], b[1], c[1]);
      const xMin = Math.min(a[0], b[0], c[0]), xMax = Math.max(a[0], b[0], c[0]);
      if (yMax < 0.3 || yMin > 2.4 || xMax < 50 || xMin > 72) continue;
      scanned++;
      const zz0 = Math.min(a[2], b[2], c[2]), zz1 = Math.max(a[2], b[2], c[2]);
      const i0 = Math.max(0, Math.floor((zz0 - z0) / dz));
      const i1 = Math.min(bins - 1, Math.floor((zz1 - z0) / dz));
      for (let bi = i0; bi <= i1; bi++) {
        maxX[bi] = Math.max(maxX[bi], xMax);
        minX[bi] = Math.min(minX[bi], xMin);
        count[bi]++;
      }
    }
  }
}
console.log('west triangles scanned', scanned);
let run = null;
for (let i = 0; i <= bins; i++) {
  const open = i < bins && count[i] < 8;
  if (open && !run) run = i;
  if (!open && run !== null) {
    const a = z0 + run * dz, b = z0 + i * dz;
    console.log(`gap z ${a.toFixed(2)}..${b.toFixed(2)} width ${(b - a).toFixed(2)} edgeCount ${count[Math.max(0, run - 1)]}/${count[Math.min(bins - 1, i)]}`);
    run = null;
  }
}
console.log('sample bins every 1m');
for (let z = -16; z <= 16; z += 1) {
  const i = Math.round((z - z0) / dz);
  console.log(`z=${z} count=${count[i]} x=${Number.isFinite(minX[i]) ? minX[i].toFixed(1) : '-'}..${Number.isFinite(maxX[i]) ? maxX[i].toFixed(1) : '-'}`);
}
