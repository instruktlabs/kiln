// SPDX-License-Identifier: MIT
// Canonical terrain (owner direction D-21): the decoder-free source tiles live in the package's source
// data (source-data/terrain/, plain glTF 2.0: float32 positions, normals and UVs, uint32 indices; not
// served to the web). The web tiles (KHR_mesh_quantization + EXT_meshopt_compression) are a
// derivative. The kit pins no meshopt encoder (kit request GG-005), so staging cannot yet produce the
// derivative itself; instead it proves each delivered derivative tile is its canonical tile: every
// canonical vertex within one step of the 16-bit quantization grid of a web vertex, the same triangles
// over those vertices, and UVs within half a texel of the 2048 px albedo (the web tile stores UVs with
// meshopt's lossy float filter).
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/golden-gate/scripts/terrain-canonical.ts [--copy] [--verify]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { BufferAttribute, Mesh, Object3D } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMONS = resolve(PACKAGE_ROOT, '../../..');
export const CANONICAL_DIR = resolve(PACKAGE_ROOT, 'source-data/terrain');
export const CANONICAL_INDEX = resolve(CANONICAL_DIR, 'canonical.json');
/** The terrain pipeline's pre-compression exports from the run that produced the delivered tiles. */
const PIPELINE_RAW = resolve(COMMONS, 'golden-gate-scene/terrain/cache/build');
const PIPELINE_OUT = resolve(COMMONS, 'golden-gate-scene/terrain/out');
export const TILE_KEYS = ['near', 'near_low', 'mid', 'mid_low', 'far'].flatMap(level => ['00', '01', '10', '11'].map(q => `${level}_${q}`));

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const toArrayBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export interface CanonicalTile { key: string; file: string; bytes: number; sha256: string; triangles: number; vertices: number; source: string; derivative: { file: string; bytes: number; sha256: string } }
export interface CanonicalIndex { schema: 'golden-gate-canonical-terrain/1'; notes: string; frame: string; tiles: CanonicalTile[] }
export interface TileComparison {
  key: string; triangles: [number, number]; vertices: [number, number];
  /** Canonical vertices with no derivative vertex within one quantization step (0 when equivalent). */
  positionMisses: number;
  /** Largest distance from a canonical vertex to its derivative vertex, in quantization steps (Chebyshev). */
  positionError: number;
  /** Derivative vertices that no canonical vertex maps to. */
  unusedDerivativeVertices: number;
  /** Triangles (as sets of quantized corners) present in one tile and not the other. */
  triangleMisses: number;
  /** Largest UV difference between a canonical vertex and the derivative vertex at its position. */
  uvError: number;
  /** Quantization step of the derivative (m). */
  step: number;
}

async function parse(bytes: Uint8Array): Promise<Mesh> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(toArrayBuffer(bytes), '');
  const meshes: Mesh[] = [];
  gltf.scene.traverse((node: Object3D) => { if ((node as Mesh).isMesh) meshes.push(node as Mesh); });
  if (meshes.length !== 1) throw new Error(`Expected one terrain mesh, found ${meshes.length}`);
  meshes[0]!.updateWorldMatrix(true, false);
  return meshes[0]!;
}

/** Compares a canonical tile with its derivative on the derivative's quantization grid. */
export async function compareTile(key: string, canonicalBytes: Uint8Array, derivativeBytes: Uint8Array): Promise<TileComparison> {
  const canonical = await parse(canonicalBytes), derivative = await parse(derivativeBytes);
  const t = new Vector3(), q = new Quaternion(), s = new Vector3();
  derivative.matrixWorld.decompose(t, q, s);
  if (Math.abs(q.w) < 1 - 1e-9 || Math.abs(s.x - s.y) > 1e-9 || Math.abs(s.x - s.z) > 1e-9) throw new Error(`${key}: derivative transform is not a uniform scale and translation`);
  const inverse = new Matrix4().copy(derivative.matrixWorld).invert();
  const dPos = derivative.geometry.getAttribute('position') as BufferAttribute, dUv = derivative.geometry.getAttribute('uv') as BufferAttribute;
  const cPos = canonical.geometry.getAttribute('position') as BufferAttribute, cUv = canonical.geometry.getAttribute('uv') as BufferAttribute;
  const pack = (x: number, y: number, z: number) => (x * 65536 + y) * 65536 + z;
  // Derivative vertices by quantized position (several vertices may share one: UV or normal seams).
  const byKey = new Map<number, number[]>();
  for (let i = 0; i < dPos.count; i++) { const k = pack(dPos.getX(i), dPos.getY(i), dPos.getZ(i)); const list = byKey.get(k); if (list) list.push(i); else byKey.set(k, [i]); }
  const v = new Vector3(), cKeys = new Float64Array(cPos.count), used = new Set<number>();
  let positionMisses = 0, positionError = 0, uvError = 0;
  for (let i = 0; i < cPos.count; i++) {
    v.fromBufferAttribute(cPos, i).applyMatrix4(canonical.matrixWorld).applyMatrix4(inverse);
    // The nearest grid point that holds a derivative vertex, among the rounded point and its neighbours.
    const rx = Math.round(v.x), ry = Math.round(v.y), rz = Math.round(v.z);
    let distance = Infinity, k = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const candidate = pack(rx + a, ry + b, rz + c); if (!byKey.has(candidate)) continue;
      const d = Math.max(Math.abs(rx + a - v.x), Math.abs(ry + b - v.y), Math.abs(rz + c - v.z));
      if (d < distance) { distance = d; k = candidate; }
    }
    if (!(distance <= 1)) { positionMisses++; cKeys[i] = -1 - i; continue; }
    cKeys[i] = k; used.add(k); positionError = Math.max(positionError, distance);
    let best = Infinity;
    for (const j of byKey.get(k)!) best = Math.min(best, Math.max(Math.abs(cUv.getX(i) - dUv.getX(j)), Math.abs(cUv.getY(i) - dUv.getY(j))));
    uvError = Math.max(uvError, best);
  }
  const unusedDerivativeVertices = [...byKey.keys()].filter(k => !used.has(k)).reduce((n, k) => n + byKey.get(k)!.length, 0);
  const triangles = (keyOf: (vertex: number) => number, index: BufferAttribute) => {
    const counts = new Map<string, number>();
    for (let f = 0; f < index.count; f += 3) {
      const corners = [keyOf(index.getX(f)), keyOf(index.getX(f + 1)), keyOf(index.getX(f + 2))].sort((a, b) => a - b).join(',');
      counts.set(corners, (counts.get(corners) ?? 0) + 1);
    }
    return counts;
  };
  const cTris = triangles(i => cKeys[i]!, canonical.geometry.index!), dTris = triangles(j => pack(dPos.getX(j), dPos.getY(j), dPos.getZ(j)), derivative.geometry.index!);
  let triangleMisses = 0;
  for (const [corners, n] of cTris) triangleMisses += Math.abs(n - (dTris.get(corners) ?? 0));
  for (const [corners, n] of dTris) if (!cTris.has(corners)) triangleMisses += n;
  return { key, triangles: [canonical.geometry.index!.count / 3, derivative.geometry.index!.count / 3], vertices: [cPos.count, dPos.count], positionMisses, positionError, unusedDerivativeVertices, triangleMisses, uvError, step: s.x };
}

/** Half a texel of the 2048 px tile albedo, in UV units. */
export const UV_TOLERANCE = .5 / 2048;
/** Throws unless the derivative is the canonical tile (see the header). */
export function assertEquivalent(c: TileComparison): void {
  if (c.triangles[0] !== c.triangles[1] || c.positionMisses || c.unusedDerivativeVertices || c.triangleMisses || !(c.uvError <= UV_TOLERANCE))
    throw new Error(`Terrain ${c.key}: the web tile is not its canonical tile (${JSON.stringify(c)})`);
}

/** Copies the pipeline's pre-compression tiles into source-data/terrain and indexes them. */
export function copyCanonical(): CanonicalIndex {
  mkdirSync(CANONICAL_DIR, { recursive: true });
  const manifest = JSON.parse(readFileSync(resolve(PIPELINE_OUT, 'manifest.json'), 'utf8')) as { files: { file: string; bytes: number; sha256: string }[] };
  const tiles = TILE_KEYS.map(key => {
    const from = resolve(PIPELINE_RAW, `${key}_raw.glb`), to = resolve(CANONICAL_DIR, `${key}.glb`);
    copyFileSync(from, to);
    const bytes = readFileSync(to), json = glbJson(bytes), derivative = manifest.files.find(f => f.file === `tiles/${key}.glb`);
    if (!derivative) throw new Error(`The terrain manifest has no tiles/${key}.glb`);
    if (json.extensionsUsed?.length || json.extensionsRequired?.length) throw new Error(`${key}: canonical tile uses extensions ${json.extensionsUsed}`);
    const primitive = json.meshes[0]!.primitives[0]!;
    return { key, file: `${key}.glb`, bytes: bytes.length, sha256: sha256(bytes), triangles: json.accessors[primitive.indices!]!.count / 3, vertices: json.accessors[primitive.attributes.POSITION!]!.count,
      source: relative(COMMONS, from).split('\\').join('/'), derivative: { file: derivative.file, bytes: derivative.bytes, sha256: derivative.sha256 } };
  });
  const index: CanonicalIndex = {
    schema: 'golden-gate-canonical-terrain/1',
    notes: 'Canonical (decoder-free) terrain tiles, owner direction D-21: plain glTF 2.0 with float32 POSITION, NORMAL and TEXCOORD_0 and uint32 indices, one material, no textures (albedo and object-space normal maps are the WebP files beside each web tile). Copied byte for byte from the terrain pipeline\'s pre-compression export of the same run as the delivered web tiles (tiles/*.glb, KHR_mesh_quantization + EXT_meshopt_compression, gltfpack 1.3.0 -c -vp 16 -kv -vtf). scripts/terrain-canonical.ts --verify (run by staging) proves each web tile has the same triangles on its 16-bit grid and the same UVs. Not served to the web.',
    frame: 'scene metres: +Y up, +X west, +Z north, water at Y = 0 (layout.json conventions.frame); vertices are authored in scene coordinates',
    tiles,
  };
  writeFileSync(CANONICAL_INDEX, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

interface GlbJson { extensionsUsed?: string[]; extensionsRequired?: string[]; meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[]; accessors: { count: number }[] }
function glbJson(bytes: Uint8Array): GlbJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GlbJson;
}

/** Checks the canonical files against their index, then each derivative (by path) against its canonical tile. */
export async function verifyCanonical(derivativePath: (key: string) => string): Promise<TileComparison[]> {
  const index = JSON.parse(readFileSync(CANONICAL_INDEX, 'utf8')) as CanonicalIndex, out: TileComparison[] = [];
  for (const tile of index.tiles) {
    const canonical = readFileSync(resolve(CANONICAL_DIR, tile.file)), derivative = readFileSync(derivativePath(tile.key));
    if (canonical.length !== tile.bytes || sha256(canonical) !== tile.sha256) throw new Error(`Canonical terrain ${tile.file} differs from source-data/terrain/canonical.json`);
    if (derivative.length !== tile.derivative.bytes || sha256(derivative) !== tile.derivative.sha256) throw new Error(`Web tile ${tile.key} is not the derivative recorded in canonical.json`);
    const comparison = await compareTile(tile.key, canonical, derivative);
    assertEquivalent(comparison); out.push(comparison);
  }
  return out;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const args = process.argv.slice(2);
  if (args.includes('--copy')) { const index = copyCanonical(); console.log(JSON.stringify({ tiles: index.tiles.length, bytes: index.tiles.reduce((s, t) => s + t.bytes, 0) })); }
  if (args.includes('--verify') || !args.length) {
    if (!existsSync(CANONICAL_INDEX)) throw new Error('No canonical terrain: run with --copy first');
    const results = await verifyCanonical(key => resolve(PIPELINE_OUT, 'tiles', `${key}.glb`));
    for (const r of results) console.log(JSON.stringify(r));
  }
}
