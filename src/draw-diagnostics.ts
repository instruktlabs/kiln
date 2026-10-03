/** Bounded, advisory draw analysis. Never mutates geometry or supplies QA acceptance evidence. */
import { type Document, type Node, Primitive } from '@gltf-transform/core';
import { cloneDocument } from '@gltf-transform/functions';
import * as THREE from 'three';
import { createGltfIO } from './gltf-io';
import { isHiddenGltfNode } from './metrics';
import { findRigidBoundaries, mergeRigidGroups } from './rigid-merge';

const MAX_NODES = 2048;
const MAX_USES = 256;
const MAX_VERTICES = 262_144;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ANCHORS = 16;
const MAX_SAMPLES = 256;
const MAX_FINDINGS = 4;
const SCOPE =
  'Static single-pass primitive draws across document scenes, respecting node visibility. Excludes culling, alternate LOD selections, shadow, reflection and depth passes, and renderer-specific extra passes; GPU instances count once per primitive. IDs use scene/node indices; names are bounded labels.';
const METHOD =
  'Current rigid-merge policy on a bounded clone with existing materials: includes layouts, boundaries, locks, shared-byte budget and vertex splits. Excludes palette consolidation and instancing; not a full-mode or GPU performance prediction.';

interface PartRef {
  id: string;
  name: string;
}
interface Anchor extends PartRef {
  draws: number;
  afterRigidMerge: number;
}
export interface DrawDiagnostics {
  version: 'kiln.draw-diagnostics.v1';
  status: 'assessed' | 'skipped';
  scope: string;
  reason?: 'input-limit' | 'unreadable-glb' | 'analysis-failed';
  currentDraws?: number;
  mergeEstimate?: {
    method: string;
    draws: number;
    saved: number;
    rejectedBuckets: number;
    skipped?: string;
  };
  anchors?: { total: number; omitted: number; items: Anchor[] };
  observations?: {
    mirroredTangents: { count: number; omitted: number; parts: PartRef[]; evidence: string };
    coplanarParts: {
      sampledTriangles: number;
      eligibleTriangles: number;
      unexaminedPrimitiveUses: number;
      candidatePairs: number;
      omitted: number;
      candidates: { parts: [PartRef, PartRef] }[];
      evidence: string;
    };
  };
}
interface Use {
  node: Node;
  primitive: Primitive;
  part: PartRef;
}
const nameOf = (name: string) => (name.length <= 80 ? name : `${name.slice(0, 79)}…`);
const skipped = (reason: DrawDiagnostics['reason']): DrawDiagnostics => ({
  version: 'kiln.draw-diagnostics.v1',
  status: 'skipped',
  scope: SCOPE,
  reason,
});

/** Bound clone/bake work by stored resources and placed uses, including invisible geometry. */
function withinLimits(doc: Document): boolean {
  const root = doc.getRoot();
  if (
    root.listNodes().length > MAX_NODES ||
    root.listAccessors().length > 4096 ||
    root.listMaterials().length > 2048 ||
    root.listTextures().length > 256 ||
    root.listScenes().length > 32 ||
    doc.getGraph().listEdges().length > 32768
  )
    return false;
  let bytes =
    root.listAccessors().reduce((n, a) => n + (a.getArray()?.byteLength ?? 0), 0) +
    root.listTextures().reduce((n, t) => n + (t.getImage()?.byteLength ?? 0), 0);
  let uses = 0;
  let vertices = 0;
  const walk = (node: Node, depth: number): boolean => {
    if (depth > 128) return false;
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      uses++;
      vertices += p.getAttribute('POSITION')?.getCount() ?? 0;
      bytes +=
        p.listAttributes().reduce((n, a) => n + (a.getArray()?.byteLength ?? 0), 0) +
        (p.getIndices()?.getArray()?.byteLength ?? 0);
    }
    return (
      uses <= MAX_USES &&
      vertices <= MAX_VERTICES &&
      bytes <= MAX_BYTES &&
      node.listChildren().every((n) => walk(n, depth + 1))
    );
  };
  return (
    bytes <= MAX_BYTES && root.listScenes().every((s) => s.listChildren().every((n) => walk(n, 0)))
  );
}

function collect(doc: Document, keep: readonly string[]) {
  const root = doc.getRoot();
  const boundaries = findRigidBoundaries(doc, new Set(keep));
  const nodeIds = new Map(root.listNodes().map((n, i) => [n, i]));
  const anchors = new Map<string, Anchor>();
  const uses: Use[] = [];
  for (const [sceneIndex, scene] of root.listScenes().entries()) {
    const id = `scene:${sceneIndex}`;
    const initial = { id, name: nameOf(scene.getName() || 'Scene'), draws: 0, afterRigidMerge: 0 };
    anchors.set(id, initial);
    const walk = (node: Node, anchor: Anchor): void => {
      if (isHiddenGltfNode(node)) return;
      const part = { id: `${id}/node:${nodeIds.get(node)}`, name: nameOf(node.getName()) };
      if (boundaries.has(node)) {
        anchor = { ...part, draws: 0, afterRigidMerge: 0 };
        anchors.set(part.id, anchor);
      }
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        anchor.draws++;
        uses.push({ node, primitive, part });
      }
      for (const child of node.listChildren()) walk(child, anchor);
    };
    for (const child of scene.listChildren()) walk(child, initial);
  }
  return { anchors, uses };
}

interface Sample {
  points: THREE.Vector3[];
  normal: THREE.Vector3;
  bounds: THREE.Box3;
  part: PartRef;
}
type Point2 = [number, number];
const cross2 = (a: Point2, b: Point2, p: Point2) =>
  (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Positive projected overlap excludes mere shared edges and vertices. */
function overlaps(a: Sample, b: Sample): boolean {
  if (Math.abs(a.normal.dot(b.normal)) < 1 - 1e-8 || !a.bounds.intersectsBox(b.bounds))
    return false;
  const tolerance =
    Math.max(
      a.bounds.getSize(new THREE.Vector3()).length(),
      b.bounds.getSize(new THREE.Vector3()).length(),
      1e-12,
    ) * 1e-6;
  if (b.points.some((p) => Math.abs(a.normal.dot(p.clone().sub(a.points[0]!))) > tolerance))
    return false;
  const normal = a.normal.toArray().map(Math.abs);
  const drop = normal.indexOf(Math.max(...normal));
  const project = (p: THREE.Vector3): Point2 => p.toArray().filter((_, i) => i !== drop) as Point2;
  const clip = a.points.map(project);
  if (cross2(clip[0]!, clip[1]!, clip[2]!) < 0) clip.reverse();
  let polygon = b.points.map(project);
  for (let i = 0; i < 3 && polygon.length; i++) {
    const x = clip[i]!,
      y = clip[(i + 1) % 3]!;
    const output: Point2[] = [];
    for (let j = 0; j < polygon.length; j++) {
      const p = polygon[j]!,
        q = polygon[(j + 1) % polygon.length]!;
      const dp = cross2(x, y, p),
        dq = cross2(x, y, q);
      if (dp >= 0) output.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygon = output;
  }
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!,
      q = polygon[(i + 1) % polygon.length]!;
    area += p[0] * q[1] - p[1] * q[0];
  }
  return Math.abs(area) / 2 > tolerance * tolerance;
}

function observe(uses: Use[]): NonNullable<DrawDiagnostics['observations']> {
  const mirrored = new Map<string, PartRef>();
  const samples: Sample[] = [];
  let eligibleTriangles = 0;
  let unexaminedPrimitiveUses = 0;
  for (const { node, primitive, part } of uses) {
    if (
      node.getSkin() ||
      node.getExtension('EXT_mesh_gpu_instancing') ||
      primitive.listTargets().length
    ) {
      unexaminedPrimitiveUses++;
      continue;
    }
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    if (primitive.getAttribute('TANGENT') && matrix.determinant() < 0) mirrored.set(part.id, part);
    const position = primitive.getAttribute('POSITION');
    if (!position || primitive.getMode() !== Primitive.Mode.TRIANGLES) {
      unexaminedPrimitiveUses++;
      continue;
    }
    const indices = primitive.getIndices();
    const count = Math.floor((indices?.getCount() ?? position.getCount()) / 3);
    eligibleTriangles += count;
    const amount = Math.min(count, 8, MAX_SAMPLES - samples.length);
    for (let i = 0; i < amount; i++) {
      const start = Math.floor((i * count) / amount) * 3;
      const points = [0, 1, 2].map((j) =>
        new THREE.Vector3()
          .fromArray(position.getElement(indices ? indices.getScalar(start + j) : start + j, []))
          .applyMatrix4(matrix),
      );
      const normal = points[1]!.clone().sub(points[0]!).cross(points[2]!.clone().sub(points[0]!));
      if (!Number.isFinite(normal.lengthSq()) || normal.lengthSq() === 0) continue;
      samples.push({
        points,
        normal: normal.normalize(),
        bounds: new THREE.Box3().setFromPoints(points),
        part,
      });
    }
  }
  const pairs = new Map<string, { parts: [PartRef, PartRef] }>();
  for (let i = 0; i < samples.length; i++)
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i]!,
        b = samples[j]!;
      if (a.part.id === b.part.id || a.part.id.split('/')[0] !== b.part.id.split('/')[0]) continue;
      const key = [a.part.id, b.part.id].sort().join('|');
      if (!pairs.has(key) && overlaps(a, b)) pairs.set(key, { parts: [a.part, b.part] });
    }
  return {
    mirroredTangents: {
      count: mirrored.size,
      omitted: Math.max(0, mirrored.size - MAX_FINDINGS),
      parts: [...mirrored.values()].slice(0, MAX_FINDINGS),
      evidence:
        'Visible static nodes with tangent attributes and negative world determinant; not proof of a shading defect. Skinned, morphed and GPU-instanced uses are not assessed.',
    },
    coplanarParts: {
      sampledTriangles: samples.length,
      eligibleTriangles,
      unexaminedPrimitiveUses,
      candidatePairs: pairs.size,
      omitted: Math.max(0, pairs.size - MAX_FINDINGS),
      candidates: [...pairs.values()].slice(0, MAX_FINDINGS),
      evidence:
        'Sampled overlapping coplanar triangles in separate static nodes; not proof of visible z-fighting. At most 8 triangles per primitive and 256 total; unexamined faces may contain other candidates.',
    },
  };
}

/** Same-material merge estimate only; byte limits return an explicit skipped assessment. */
export function analyzeDrawDiagnostics(
  doc: Document,
  options: { keep?: readonly string[] } = {},
): DrawDiagnostics {
  try {
    if (!withinLimits(doc)) return skipped('input-limit');
    const keep = options.keep ?? [];
    const before = collect(doc, keep);
    const copy = cloneDocument(doc);
    const merge = mergeRigidGroups(copy, { keep });
    const after = collect(copy, keep);
    const all = [...before.anchors.values()].map((anchor) => ({
      ...anchor,
      afterRigidMerge: after.anchors.get(anchor.id)?.draws ?? 0,
    }));
    const currentDraws = before.uses.length;
    return {
      version: 'kiln.draw-diagnostics.v1',
      status: 'assessed',
      scope: SCOPE,
      currentDraws,
      mergeEstimate: {
        method: METHOD,
        draws: after.uses.length,
        saved: currentDraws - after.uses.length,
        rejectedBuckets: merge.rejected.length,
        ...(merge.skipped ? { skipped: merge.skipped } : {}),
      },
      anchors: {
        total: all.length,
        omitted: Math.max(0, all.length - MAX_ANCHORS),
        items: all.slice(0, MAX_ANCHORS),
      },
      observations: observe(before.uses),
    };
  } catch {
    return skipped('analysis-failed');
  }
}

/** Best-effort diagnostics for exact delivery bytes; unsupported GLBs still remain exportable. */
export async function inspectDrawDiagnostics(
  bytes: Uint8Array,
  options: { keep?: readonly string[] } = {},
): Promise<DrawDiagnostics> {
  if (bytes.byteLength > MAX_BYTES) return skipped('input-limit');
  try {
    return analyzeDrawDiagnostics(await createGltfIO().readBinary(bytes), options);
  } catch {
    return skipped('unreadable-glb');
  }
}
