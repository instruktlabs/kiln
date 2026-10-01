// SPDX-License-Identifier: MIT
// Derived fields of the scene layout (data/layout.json, D-21 "the truth is data"). The lane
// polylines follow the bridge's `Roadway` top surface, so they are computed from the approved bridge
// GLB (read directly, without a renderer or decoder) and written into the layout; the approach roads'
// derived fields (./approaches.ts: start from the Roadway end, profile, segments, centreline, imagery
// deviation) and the lanes' route ends are derived with them. `--check` recomputes everything, fails
// when the file is stale, and runs the approach checks. Everything else in the layout is authored.
// Run from the scenes root:
//   ./scripts/toolchain-run.ps1 packages/golden-gate/scripts/layout.ts [--write | --check] [--heights x,z;x,z] [--glb <bridge GLB>] [--no-visibility]
// The roadway is read from the staged release's web runtime (verified against its pin by stage.ts), else from
// the pinned runtime at its source (./release.ts), or from --glb. The source folder is the Kiln author's
// working output and may hold a newer, unaccepted revision, so the staged copy comes first.
// `--check` reports the drift of the stored polylines and approach fields from the recomputed ones, the
// largest vertical distance between each lane polyline and the road surface under it (1 m samples; the
// 5 mm tolerance) and the approach checks (grades, terrain every 5 m, spans, imagery, sight lines).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, Quaternion, Vector3 } from 'three/webgpu';
import type { Object3D } from 'three/webgpu';
import { rasterizeRoad, roadHeight } from '../src/world/road';
import type { RoadGrid } from '../src/world/road';
import type { LayoutLane, SceneLayout } from '../src/data';
import { checkApproaches, deriveApproaches, loadTileArrays, MIN_END_SIGHT, PAD_CLEAR, Tin } from './approaches';
import type { ApproachCheck } from './approaches';

import { BRIDGE_WEB_GLB, stagedBridge } from './release';
export { BRIDGE_WEB_GLB };

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LAYOUT_PATH = resolve(PACKAGE_ROOT, 'data/layout.json');
/** Lane polylines: the roadway sampled every metre, then simplified so no point of it is further than this (m) from the polyline. */
export const POLYLINE_TOLERANCE = .005;

interface GltfJson {
  nodes: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
}
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Splits a GLB into its JSON and binary chunks. */
export function readGlb(bytes: Uint8Array): { json: GltfJson; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB');
  const jsonLength = view.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GltfJson;
  const binStart = 20 + jsonLength, binLength = view.getUint32(binStart, true);
  return { json, bin: bytes.subarray(binStart + 8, binStart + 8 + binLength) };
}
/** Reads a float or unsigned-integer accessor (non-normalized) into a flat array. */
function accessor(json: GltfJson, bin: Uint8Array, index: number): Float32Array | Uint32Array {
  const a = json.accessors[index]!, size = COMPONENTS[a.type]!, bufferView = json.bufferViews[a.bufferView!]!;
  if (a.normalized) throw new Error('Normalized accessors are not expected in the roadway');
  const view = new DataView(bin.buffer, bin.byteOffset + (bufferView.byteOffset ?? 0) + (a.byteOffset ?? 0));
  const bytesPer = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
  const stride = bufferView.byteStride ?? size * bytesPer, out = a.componentType === 5126 ? new Float32Array(a.count * size) : new Uint32Array(a.count * size);
  for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) {
    const at = i * stride + c * bytesPer;
    out[i * size + c] = a.componentType === 5126 ? view.getFloat32(at, true) : a.componentType === 5125 ? view.getUint32(at, true) : a.componentType === 5123 ? view.getUint16(at, true) : view.getUint8(at);
  }
  return out;
}
/** The named node and its subtree as three.js meshes (positions and indices only), in scene space. */
export function nodeMeshes(bytes: Uint8Array, name: string): Object3D {
  const { json, bin } = readGlb(bytes), parents = new Map<number, number>();
  json.nodes.forEach((node, i) => node.children?.forEach(child => parents.set(child, i)));
  const local = (i: number) => {
    const n = json.nodes[i]!;
    if (n.matrix) return new Matrix4().fromArray(n.matrix);
    return new Matrix4().compose(new Vector3().fromArray(n.translation ?? [0, 0, 0]), new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(n.scale ?? [1, 1, 1]));
  };
  const world = (i: number): Matrix4 => { const parent = parents.get(i); return parent === undefined ? local(i) : world(parent).multiply(local(i)); };
  const start = json.nodes.findIndex(n => n.name === name);
  if (start < 0) throw new Error(`No node named ${name}`);
  const group = new Group();
  const visit = (i: number) => {
    const node = json.nodes[i]!;
    if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh]!.primitives) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(accessor(json, bin, primitive.attributes.POSITION!) as Float32Array, 3));
      if (primitive.indices !== undefined) geometry.setIndex(new BufferAttribute(accessor(json, bin, primitive.indices) as Uint32Array, 1));
      const mesh = new Mesh(geometry); mesh.matrixAutoUpdate = false; mesh.matrix.copy(world(i)); group.add(mesh);
    }
    node.children?.forEach(visit);
  };
  visit(start);
  return group;
}
/** The bridge web runtime the layout derives from: the staged copy when present, else the pinned source path. */
export function bridgeWebPath(): string { const staged = stagedBridge('web'); return existsSync(staged) ? staged : BRIDGE_WEB_GLB; }
export function roadGridFromBridge(bytes: Uint8Array = readFileSync(bridgeWebPath())): RoadGrid { return rasterizeRoad(nodeMeshes(bytes, 'Roadway')); }

const mm = (v: number) => Math.round(v * 1000) / 1000;
/** JSON with two-space indents and every array of numbers or plain strings on one line (diff-friendly and short). */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2).replace(/\[\s*((?:-?[\d.eE+-]+|"[^"\[\],]*")(?:,\s*(?:-?[\d.eE+-]+|"[^"\[\],]*"))*)\s*\]/g, (_, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`)}\n`;
}
/** Ramer-Douglas-Peucker on (z, y): the indices of the points to keep. */
function simplify(points: readonly [number, number][], tolerance: number): number[] {
  const keep = new Set<number>([0, points.length - 1]), stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!, [za, ya] = points[a]!, [zb, yb] = points[b]!;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i++) { const [z, y] = points[i]!, d = Math.abs(y - (ya + (yb - ya) * (z - za) / (zb - za))); if (d > worst) { worst = d; at = i; } }
    if (worst > tolerance) { keep.add(at); stack.push([a, at], [at, b]); }
  }
  return [...keep].sort((x, y) => x - y);
}
/** A lane's centre line on the roadway top, from its entry (one deck end) to its exit (the other end). */
export function lanePolyline(grid: RoadGrid, lane: Pick<LayoutLane, 'x' | 'direction'>, roadEndZ: number): [number, number, number][] {
  const sign = lane.direction === 'north' ? 1 : -1, entry = -sign * roadEndZ, length = 2 * roadEndZ, samples: [number, number][] = [];
  for (let s = 0; s < length - 1e-6; s += grid.dz) samples.push([entry + sign * s, roadHeight(grid, lane.x, entry + sign * s)]);
  samples.push([-entry, roadHeight(grid, lane.x, -entry)]);
  return simplify(samples, POLYLINE_TOLERANCE).map(i => [lane.x, mm(samples[i]![1]), mm(samples[i]![0])]);
}
/** The layout with every lane's deck polyline recomputed from the roadway. */
export function withDerivedLanes(layout: SceneLayout, grid: RoadGrid): SceneLayout {
  return { ...layout, lanes: layout.lanes.map(lane => ({ ...lane, polyline: lanePolyline(grid, lane, layout.bridge.roadEndZ) })) };
}
/** Canonical near terrain (high set) used by the approach derivation. */
export function nearTin(): Tin { return new Tin(loadTileArrays('near')); }
/** The layout with the lane polylines, the approaches' derived fields and the lanes' route ends recomputed. */
export function withDerived(layout: SceneLayout, bytes: Uint8Array, grid: RoadGrid, tin: Tin = nearTin()): SceneLayout {
  const lanes = withDerivedLanes(layout, grid).lanes, derived = deriveApproaches({ ...layout, lanes }, bytes, grid, tin);
  return { ...layout, lanes: derived.lanes, approaches: derived.approaches };
}
/** Largest difference between the stored and recomputed approach fields and lane route ends (Infinity when their shapes differ). */
export function derivedDrift(layout: SceneLayout, fresh: SceneLayout): number {
  let worst = 0;
  const walk = (a: unknown, b: unknown): void => {
    if (typeof a === 'number' && typeof b === 'number') { worst = Math.max(worst, Math.abs(a - b)); return; }
    if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) { worst = Infinity; return; } a.forEach((v, i) => walk(v, b[i])); return; }
    if (a && b && typeof a === 'object' && typeof b === 'object') { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of keys) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]); return; }
    if (a !== b) worst = Infinity;
  };
  walk(layout.approaches, fresh.approaches);
  layout.lanes.forEach((lane, i) => { const f = fresh.lanes[i]!; walk([lane.entry, lane.exit, lane.stations], [f.entry, f.exit, f.stations]); });
  return worst;
}
/** Failures of the approach checks (empty when they pass). */
export function approachFailures(checks: readonly ApproachCheck[]): string[] {
  const fail: string[] = [];
  for (const c of checks) {
    if (c.maxGradeToJoin > .04 + 1e-4) fail.push(`${c.name}: grade ${c.maxGradeToJoin} before the join`);
    if (c.deviation.atGrade > c.deviation.tolerance || c.deviation.elevated > c.deviation.tolerance) fail.push(`${c.name}: ${c.deviation.atGrade} / ${c.deviation.elevated} m from the imagery road`);
    for (const [level, t] of Object.entries(c.terrain)) {
      if (t.penetrations) fail.push(`${c.name} ${level}: ${t.penetrations} penetrations (worst ${t.worst} m)`);
      if (t.unsupported) fail.push(`${c.name} ${level}: ${t.unsupported} stations without ground contact or support`);
      if (t.skirtsAbove || t.uncovered) fail.push(`${c.name} ${level}: ${t.skirtsAbove} skirt corners above the edited surface, ${t.uncovered} triangles uncovered`);
      if (t.pads.penetrations) fail.push(`${c.name} ${level}: terrain within ${PAD_CLEAR} m of the dressing's pavement at ${t.pads.penetrations} of ${t.pads.samples} samples (worst ${t.pads.worst} m)`);
    }
    if (c.longestSpan > 1.3 * 40) fail.push(`${c.name}: span ${c.longestSpan} m`);
    for (const [kind, e] of Object.entries(c.visibility.nearest)) if (e.nearest !== null && e.nearest < MIN_END_SIGHT) fail.push(`${c.name}: the end stretch is visible ${e.nearest} m from a ${kind} viewpoint (${e.example}; limit ${MIN_END_SIGHT} m)`);
  }
  return fail;
}
/** Largest vertical distance (m) between each stored lane polyline and the road surface under it, sampled every grid step along the lane. */
export function laneRoadDeviation(layout: SceneLayout, grid: RoadGrid): number {
  let worst = 0;
  for (const lane of layout.lanes) {
    const points = lane.polyline;
    for (let k = 1; k < points.length; k++) {
      const [x, y0, z0] = points[k - 1]!, [, y1, z1] = points[k]!, steps = Math.max(1, Math.ceil(Math.abs(z1 - z0) / grid.dz));
      for (let i = 0; i <= steps; i++) { const t = i / steps, z = z0 + (z1 - z0) * t; worst = Math.max(worst, Math.abs(y0 + (y1 - y0) * t - roadHeight(grid, x, z))); }
    }
  }
  return worst;
}
/** Largest vertical difference between the stored and recomputed lane polylines (m). */
export function laneDrift(layout: SceneLayout, grid: RoadGrid): number {
  let worst = 0;
  const fresh = withDerivedLanes(layout, grid);
  layout.lanes.forEach((lane, i) => {
    const expected = fresh.lanes[i]!.polyline;
    if (lane.polyline.length !== expected.length) { worst = Infinity; return; }
    lane.polyline.forEach((p, k) => { for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(p[c]! - expected[k]![c]!)); });
  });
  return worst;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const args = process.argv.slice(2), glbAt = args.indexOf('--glb'), glb = glbAt >= 0 ? resolve(args[glbAt + 1]!) : bridgeWebPath();
  const bytes = new Uint8Array(readFileSync(glb)), grid = roadGridFromBridge(bytes), at = args.indexOf('--heights'), heights = at >= 0 ? args[at + 1] : undefined;
  if (heights) for (const pair of heights.split(';')) { const [x, z] = pair.split(',').map(Number) as [number, number]; console.log(JSON.stringify({ x, z, road: mm(roadHeight(grid, x, z)) })); }
  const layout = args.includes('--write') || args.includes('--check') ? JSON.parse(readFileSync(LAYOUT_PATH, 'utf8')) as SceneLayout : null;
  if (layout && args.includes('--write')) {
    // Stable key order: the file stays diff-friendly.
    const fresh = withDerived(layout, bytes, grid);
    writeFileSync(LAYOUT_PATH, formatJson(fresh));
    console.log(`wrote ${LAYOUT_PATH}: ${fresh.lanes.length} lane polylines (${fresh.lanes.map(l => l.polyline.length).join(', ')} points, tolerance ${POLYLINE_TOLERANCE} m)`);
    for (const name of ['south', 'north'] as const) { const a = fresh.approaches[name]; console.log(JSON.stringify({ approach: name, start: a.start, profile: a.profile.length, segments: a.segments.map(s => `${s.kind} ${s.from}-${s.to}`), centreline: a.centreline.length, deviation: a.deviation })); }
  }
  if (layout && args.includes('--check')) {
    const drift = laneDrift(layout, grid), deviation = laneRoadDeviation(layout, grid), approachDrift = derivedDrift(layout, withDerived(layout, bytes, grid));
    console.log(JSON.stringify({ glb, lanes: layout.lanes.length, laneDrift: drift, laneRoadDeviation: +deviation.toFixed(4), approachDrift, tolerance: POLYLINE_TOLERANCE }));
    if (!(deviation <= POLYLINE_TOLERANCE + 1e-3)) throw new Error(`data/layout.json lane polylines are ${deviation} m off the road surface (tolerance ${POLYLINE_TOLERANCE} m)`);
    if (!(drift <= .002)) throw new Error(`data/layout.json lane polylines are stale (drift ${drift} m): run layout.ts --write`);
    if (!(approachDrift <= .002)) throw new Error(`data/layout.json approaches or lane ends are stale (drift ${approachDrift}): run layout.ts --write`);
    const checks = checkApproaches(layout, grid, { near: loadTileArrays('near'), near_low: loadTileArrays('near_low') }, !args.includes('--no-visibility'));
    for (const c of checks) console.log(JSON.stringify(c));
    const failures = approachFailures(checks);
    if (failures.length) throw new Error(`approach checks failed:\n  ${failures.join('\n  ')}`);
  }
}
