/** Manifold-backed solid operations with explicit legacy and attribute-preserving modes. */
import * as THREE from 'three';
import { creaseNormals } from './geometry';
import type { ManifoldToplevel, Manifold, Mesh as ManifoldMesh } from 'manifold-3d';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

let _module: ManifoldToplevel | null = null;
let _initPromise: Promise<ManifoldToplevel> | null = null;

/** @internal Shared with profile solids; initialize one WASM instance. */
export async function getManifoldModule(): Promise<ManifoldToplevel> {
  if (_module) return _module;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const mod = (await import('manifold-3d')) as unknown as {
      default: (opts?: Record<string, unknown>) => Promise<ManifoldToplevel>;
    };
    const m = await mod.default();
    m.setup();
    _module = m;
    return m;
  })();
  return _initPromise;
}

export interface CsgOptions {
  smooth?: boolean;
  /** Retain UV0 and operand material groups only. Default keeps the first material and no UVs. */
  preserveAttributes?: boolean;
}
export interface CsgSourceRun {
  sourceName: string;
  start: number;
  count: number;
  materialIndex: number;
  backside: boolean;
}
interface Source {
  name: string;
  material: THREE.Material;
}
type GeometryNote = string | { code: string; message?: string };
interface BridgeContext {
  preserve: boolean;
  sources: Map<number, Source>;
  anyUV: boolean;
  missingUV: Set<string>;
  frame: ComputationFrame;
  attributeWarnings: Map<string, GeometryNote>;
  geometryWarnings: Map<string, GeometryNote>;
}

interface ComputationFrame {
  /** The first contributing mesh's world origin; retained on the returned mesh. */
  origin: THREE.Vector3;
  center: THREE.Vector3;
  scale: number;
  matrices: Map<THREE.Mesh, THREE.Matrix4>;
}

/** One frame for the complete operation, before any world position becomes Float32. */
function computationFrame(parts: THREE.Object3D[]): ComputationFrame {
  const meshes: THREE.Mesh[] = [];
  for (const part of parts) {
    part.updateWorldMatrix(true, true);
    part.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const unsupported = (mesh as THREE.InstancedMesh).isInstancedMesh
        ? 'an instanced mesh'
        : (mesh as THREE.SkinnedMesh).isSkinnedMesh
          ? 'a skinned mesh'
          : mesh.morphTargetInfluences?.some((weight) => weight !== 0)
            ? 'a mesh with active morph influences'
            : undefined;
      if (unsupported)
        throw new AuthoringDiagnosticError(
          'CSG_OPERAND_MESH',
          `CSG: "${mesh.name || '(unnamed)'}" is ${unsupported}; bake the intended instances or pose into static triangle meshes before the Boolean. Base geometry alone does not represent this operand.`,
        );
      if (mesh.geometry.getAttribute('position')?.count) meshes.push(mesh);
    });
  }
  const origin = meshes.length
    ? new THREE.Vector3().setFromMatrixPosition(meshes[0]!.matrixWorld)
    : new THREE.Vector3();
  const matrices = new Map<THREE.Mesh, THREE.Matrix4>();
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mesh of meshes) {
    const matrix = mesh.matrixWorld.clone();
    // Subtract translation before applying the linear transform: adding a large
    // world origin to each vertex and then subtracting it already loses detail.
    matrix.elements[12]! -= origin.x;
    matrix.elements[13]! -= origin.y;
    matrix.elements[14]! -= origin.z;
    matrices.set(mesh, matrix);
    const position = mesh.geometry.getAttribute('position');
    if (position.itemSize !== 3) continue; // The operand validator owns this diagnostic.
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      if (![point.x, point.y, point.z].every(Number.isFinite))
        throw new AuthoringDiagnosticError(
          'CSG_OPERAND_MESH',
          'CSG: operand positions and transforms must be finite',
        );
      bounds.expandByPoint(point);
    }
  }
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.hypot(size.x, size.y, size.z);
  if (!Number.isFinite(scale))
    throw new AuthoringDiagnosticError(
      'CSG_OPERAND_MESH',
      'CSG: combined operand extent must be finite',
    );
  return { origin, center: bounds.getCenter(new THREE.Vector3()), scale: scale || 1, matrices };
}

/** Retain export-visible diagnostics without sharing mutable records with an operand. */
function retainNotes(target: Map<string, GeometryNote>, notes: unknown): void {
  if (!Array.isArray(notes)) return;
  for (const note of notes) {
    if (typeof note === 'string') target.set(JSON.stringify(note), note);
    else if (note && typeof note === 'object' && 'code' in note) {
      const copy = {
        code: String(note.code),
        ...('message' in note ? { message: String(note.message) } : {}),
      };
      target.set(JSON.stringify(copy), copy);
    }
  }
}

function sourceSpans(
  mesh: THREE.Mesh,
  count: number,
): { start: number; count: number; materialIndex: number; name: string }[] {
  const prior = mesh.geometry.userData.kilnCsgProvenance as { runs?: CsgSourceRun[] } | undefined;
  if (prior?.runs?.length)
    return prior.runs.map((r) => ({
      start: r.start * 3,
      count: r.count * 3,
      materialIndex: r.materialIndex,
      name: r.sourceName,
    }));
  const ranges = mesh.geometry.userData.kilnRanges as { name: string }[] | undefined;
  const name = mesh.name || ranges?.[0]?.name || 'unnamed';
  return Array.isArray(mesh.material)
    ? mesh.geometry.groups.map((g) => ({
        start: g.start,
        count: g.count,
        materialIndex: g.materialIndex ?? 0,
        name,
      }))
    : [{ start: 0, count, materialIndex: 0, name }];
}

function threeToManifold(
  src: THREE.Object3D,
  mod: ManifoldToplevel,
  label: string,
  context: BridgeContext,
): Manifold {
  src.updateWorldMatrix(true, true);
  const properties: number[] = [],
    indices: number[] = [],
    runs: number[] = [],
    originals: number[] = [],
    faceIds: number[] = [];
  let vertexOffset = 0,
    meshCount = 0;
  const stride = context.preserve ? 5 : 3;
  src.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry,
      position = geometry.getAttribute('position');
    if (!position) return;
    retainNotes(context.attributeWarnings, geometry.userData.kilnAttributeWarnings);
    retainNotes(context.geometryWarnings, geometry.userData.kilnGeometryWarnings);
    const dropped = Object.keys(geometry.attributes)
      .filter((key) => !['position', 'normal', 'uv'].includes(key))
      .sort();
    if (dropped.length)
      retainNotes(context.attributeWarnings, [
        {
          code: 'CSG_ATTRIBUTES_DROPPED',
          message: `CSG removed attributes from "${mesh.name || label}": ${dropped.join(', ')}. Only UV0 and material groups can be preserved; rebuild required attributes after the Boolean.`,
        },
      ]);
    const morphs = Object.entries(geometry.morphAttributes)
      .filter(([, targets]) => targets.length > 0)
      .map(([key]) => key)
      .sort();
    if (morphs.length)
      retainNotes(context.attributeWarnings, [
        {
          code: 'CSG_MORPHS_DROPPED',
          message: `CSG used the base shape of "${mesh.name || label}" and removed inactive morph targets: ${morphs.join(', ')}. Boolean topology does not retain morph correspondences.`,
        },
      ]);
    meshCount++;
    const index = geometry.index,
      count = index?.count ?? position.count;
    if (count % 3 !== 0)
      throw new AuthoringDiagnosticError(
        'CSG_OPERAND_MESH',
        `CSG ${label}: mesh "${mesh.name || '(unnamed)'}" has ${count} ${index ? 'indices' : 'vertices'}, which is not a whole number of triangles. Every CSG input must be a triangle mesh.`,
      );
    if (position.itemSize !== 3)
      throw new AuthoringDiagnosticError(
        'CSG_OPERAND_MESH',
        `CSG ${label}: positions must have three components`,
      );
    const uv = geometry.getAttribute('uv');
    if (context.preserve && uv && (uv.itemSize !== 2 || uv.count !== position.count))
      throw new AuthoringDiagnosticError(
        'CSG_OPERAND_MESH',
        `CSG ${label}: uv must have two components per vertex`,
      );
    if (context.preserve) {
      if (uv) context.anyUV = true;
      else context.missingUV.add(mesh.name || label);
    }
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point
        .fromBufferAttribute(position, i)
        .applyMatrix4(context.frame.matrices.get(mesh)!)
        .sub(context.frame.center)
        .divideScalar(context.frame.scale);
      if (![point.x, point.y, point.z].every((n) => Number.isFinite(Math.fround(n))))
        throw new AuthoringDiagnosticError(
          'CSG_OPERAND_MESH',
          `CSG ${label}: transformed positions must be finite Float32 coordinates`,
        );
      properties.push(point.x, point.y, point.z);
      if (context.preserve) {
        const u = uv?.getX(i) ?? 0,
          v = uv?.getY(i) ?? 0;
        if (!Number.isFinite(u) || !Number.isFinite(v))
          throw new AuthoringDiagnosticError(
            'CSG_OPERAND_MESH',
            `CSG ${label}: UVs must be finite`,
          );
        properties.push(u, v);
      }
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const spans = sourceSpans(mesh, count).sort((a, b) => a.start - b.start);
    let covered = 0;
    for (const span of spans) {
      if (
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.count) ||
        span.start !== covered ||
        span.count <= 0 ||
        span.count % 3 ||
        span.start % 3 ||
        span.start + span.count > count ||
        !materials[span.materialIndex]
      )
        throw new AuthoringDiagnosticError(
          'CSG_OPERAND_MESH',
          `CSG ${label}: material/source groups must cover triangles exactly once with valid materials`,
        );
      const id = mod.Manifold.reserveIDs(1);
      context.sources.set(id, { name: span.name, material: materials[span.materialIndex]! });
      runs.push(indices.length);
      originals.push(id);
      for (let i = span.start; i < span.start + span.count; i += 3) {
        const triangle = [
          index?.getX(i) ?? i,
          index?.getX(i + 1) ?? i + 1,
          index?.getX(i + 2) ?? i + 2,
        ];
        if (triangle.some((j) => !Number.isInteger(j) || j < 0 || j >= position.count))
          throw new AuthoringDiagnosticError(
            'CSG_OPERAND_MESH',
            `CSG ${label}: index outside positions`,
          );
        // A reflected world transform reverses winding; retain the operand's outward solid orientation.
        if (mesh.matrixWorld.determinant() < 0)
          [triangle[1], triangle[2]] = [triangle[2]!, triangle[1]!];
        indices.push(...triangle.map((j) => j + vertexOffset));
        const prior = geometry.userData.kilnCsgProvenance as { faceIds?: number[] } | undefined;
        faceIds.push(prior?.faceIds?.[i / 3] ?? i / 3);
      }
      covered += span.count;
    }
    if (covered !== count)
      throw new AuthoringDiagnosticError(
        'CSG_OPERAND_MESH',
        `CSG ${label}: material/source groups do not cover every triangle`,
      );
    vertexOffset += position.count;
  });
  if (!indices.length)
    throw new AuthoringDiagnosticError(
      'CSG_OPERAND_MESH',
      `CSG ${label}: contributes no triangles${meshCount === 0 ? ' (nothing in it is a mesh — an empty Group, or a part that was never added to it)' : ' (its meshes have no geometry)'}. Every CSG operand must be a solid with triangles.`,
    );
  runs.push(indices.length);
  const mesh = new mod.Mesh({
    numProp: stride,
    vertProperties: new Float32Array(properties),
    triVerts: new Uint32Array(indices),
    runIndex: new Uint32Array(runs),
    runOriginalID: new Uint32Array(originals),
    ...(context.preserve ? { faceID: new Uint32Array(faceIds) } : {}),
  });
  mesh.merge();
  return mod.Manifold.ofMesh(mesh);
}

function assertNonEmptyResult(m: Manifold, op: string, hint: string): void {
  if (m.numTri() === 0) throw new Error(`${op}: the result is empty (zero triangles). ${hint}`);
}

/** Count exact collapsed faces in the consumer's Float32 representation, without
 * an arbitrary distance tolerance or squared-area underflow at small scales. */
function collapsedFaces(mesh: ManifoldMesh): number[] {
  const p = mesh.vertProperties,
    stride = mesh.numProp,
    indices = mesh.triVerts;
  const faces: number[] = [];
  for (let i = 0; i < p.length; i += stride)
    if (![p[i], p[i + 1], p[i + 2]].every(Number.isFinite))
      throw new AuthoringDiagnosticError('SOLID_FLOAT32_COLLAPSE');
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * stride,
      b = indices[i + 1]! * stride,
      c = indices[i + 2]! * stride;
    const bx = p[b]! - p[a]!,
      by = p[b + 1]! - p[a + 1]!,
      bz = p[b + 2]! - p[a + 2]!;
    const cx = p[c]! - p[a]!,
      cy = p[c + 1]! - p[a + 1]!,
      cz = p[c + 2]! - p[a + 2]!;
    if (by * cz - bz * cy === 0 && bz * cx - bx * cz === 0 && bx * cy - by * cx === 0)
      faces.push(i / 3);
  }
  return faces;
}

/** Elide only exact zero-area faces, remapping all triangle-indexed metadata.
 * The caller must rebuild/validate topology afterwards, including merge vectors.
 * Removing a collinear face alone can leave a T-junction or an open edge. */
function removeCollapsedFaces(mesh: ManifoldMesh, faces: number[]): void {
  const removed = new Set(faces),
    count = mesh.triVerts.length / 3;
  const prefix = new Uint32Array(count + 1);
  const triangles = new Uint32Array(mesh.triVerts.length - faces.length * 3);
  const faceIds = mesh.faceID.length ? new Uint32Array(count - faces.length) : undefined;
  const tangents = mesh.halfedgeTangent.length
    ? new Float32Array((count - faces.length) * 12)
    : undefined;
  let kept = 0;
  for (let i = 0; i < count; i++) {
    if (!removed.has(i)) {
      triangles.set(mesh.triVerts.subarray(i * 3, i * 3 + 3), kept * 3);
      if (faceIds) faceIds[kept] = mesh.faceID[i]!;
      if (tangents) tangents.set(mesh.halfedgeTangent.subarray(i * 12, i * 12 + 12), kept * 12);
      kept++;
    }
    prefix[i + 1] = kept * 3;
  }
  mesh.triVerts = triangles;
  if (faceIds) mesh.faceID = faceIds;
  if (tangents) mesh.halfedgeTangent = tangents;
  mesh.runIndex = Uint32Array.from(mesh.runIndex, (offset) => prefix[offset / 3]!);
}

function materializeSolid(m: Manifold): { mesh: ManifoldMesh; collapsed: number } {
  const mesh = m.getMesh(),
    faces = collapsedFaces(mesh),
    collapsed = faces.length;
  if (!collapsed) return { mesh, collapsed };
  // Manifold operates at higher precision than getMesh(). Reimport the actual
  // Float32 mesh so its topology cleanup runs on consumer coordinates. Keep
  // collinear faces during this step: they can connect a split edge and deleting
  // them first would open a T-junction that merge() cannot reconstruct.
  // Manifold's shrinking transforms can retain an absolute pre-transform
  // tolerance. Do not let that erase representable detail on a small asset.
  // Cap the reimport tolerance at one Float32 relative-precision step in the
  // actual output coordinates; the constructor still owns its baseline bound.
  let magnitude = 0;
  for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp)
    for (let axis = 0; axis < 3; axis++)
      magnitude = Math.max(magnitude, Math.abs(mesh.vertProperties[i + axis]!));
  mesh.tolerance = Math.min(mesh.tolerance, magnitude * 2 ** -23);
  const rounded = _module!.Manifold.ofMesh(mesh);
  try {
    if (rounded.status() !== 'NoError' || rounded.numTri() === 0)
      throw new AuthoringDiagnosticError('SOLID_FLOAT32_COLLAPSE');
    const result = rounded.getMesh();
    const remaining = collapsedFaces(result);
    if (!remaining.length) return { mesh: result, collapsed };
    // The constructor can retain zero-area seam faces after simplifying the
    // topology. Remove only these residual faces and their metadata, then let
    // Manifold validate the rebuilt seam connections. This is a bounded second
    // stage, not repeated simplification or a partially repaired export.
    removeCollapsedFaces(result, remaining);
    result.merge();
    const cleaned = _module!.Manifold.ofMesh(result);
    try {
      if (cleaned.status() !== 'NoError' || cleaned.numTri() === 0)
        throw new AuthoringDiagnosticError('SOLID_FLOAT32_COLLAPSE');
      const finalMesh = cleaned.getMesh();
      if (collapsedFaces(finalMesh).length)
        throw new AuthoringDiagnosticError('SOLID_FLOAT32_COLLAPSE');
      return { mesh: finalMesh, collapsed };
    } finally {
      cleaned.delete();
    }
  } finally {
    rounded.delete();
  }
}

function solidMeshToGeometry(
  { mesh, collapsed }: ReturnType<typeof materializeSolid>,
  opts: { smooth?: boolean; preserveUV?: boolean } = {},
): THREE.BufferGeometry {
  const positions = new Float32Array((mesh.vertProperties.length / mesh.numProp) * 3);
  const uvs =
    opts.preserveUV && mesh.numProp >= 5 ? new Float32Array((positions.length / 3) * 2) : undefined;
  for (let i = 0, v = 0; i < mesh.vertProperties.length; i += mesh.numProp, v++) {
    positions.set(mesh.vertProperties.subarray(i, i + 3), v * 3);
    if (uvs) uvs.set(mesh.vertProperties.subarray(i + 3, i + 5), v * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  if (uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const out = opts.smooth ? geometry : geometry.toNonIndexed();
  out.computeVertexNormals();
  if (opts.smooth && uvs) {
    const cornerNormals = creaseNormals(out, { angle: 180 }).getAttribute('normal');
    const normal = out.getAttribute('normal');
    for (let corner = 0; corner < out.index!.count; corner++) {
      normal.setXYZ(
        out.index!.getX(corner),
        cornerNormals.getX(corner),
        cornerNormals.getY(corner),
        cornerNormals.getZ(corner),
      );
    }
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  if (collapsed)
    out.userData.kilnGeometryWarnings = [
      {
        code: 'SOLID_FLOAT32_CANONICALIZED',
        message: `Removed ${collapsed} zero-area Float32 faces and rebuilt their topology with Manifold. Source runs and properties were retained; this is precision cleanup, not general mesh repair.`,
      },
    ];
  return out;
}

/** @internal Profile solids use the position-only version of this bridge. */
export function manifoldToGeometry(
  m: Manifold,
  opts: { smooth?: boolean; preserveUV?: boolean } = {},
): THREE.BufferGeometry {
  return solidMeshToGeometry(materializeSolid(m), opts);
}

function firstMaterial(src: THREE.Object3D): THREE.Material {
  let material: THREE.Material | undefined;
  src.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!material && mesh.isMesh)
      material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  });
  return material ?? new THREE.MeshStandardMaterial();
}

function outputMesh(
  result: Manifold,
  name: string,
  parts: THREE.Object3D[],
  opts: CsgOptions,
  context: BridgeContext,
  isHull: boolean,
): THREE.Mesh {
  const materialized = materializeSolid(result);
  const geometry = solidMeshToGeometry(materialized, {
    smooth: opts.smooth,
    preserveUV: context.preserve && context.anyUV && !isHull,
  });
  const native = materialized.mesh,
    materials: THREE.Material[] = [],
    sourceRuns: CsgSourceRun[] = [];
  if (!isHull)
    for (let i = 0; i < native.runOriginalID.length; i++) {
      const source = context.sources.get(native.runOriginalID[i]!);
      const start = native.runIndex[i]! / 3,
        count = (native.runIndex[i + 1]! - native.runIndex[i]!) / 3;
      if (!count) continue;
      const material = source?.material ?? firstMaterial(parts[0]!);
      let materialIndex = context.preserve ? materials.indexOf(material) : 0;
      if (context.preserve && materialIndex < 0) {
        materialIndex = materials.length;
        materials.push(material);
      }
      sourceRuns.push({
        sourceName: source?.name ?? 'unknown',
        start,
        count,
        materialIndex,
        backside: !!((native.runFlags?.[i] ?? 0) & 1),
      });
      if (context.preserve) geometry.addGroup(start * 3, count * 3, materialIndex);
    }
  const total = (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;
  geometry.userData.kilnCsgProvenance = {
    schemaVersion: 1,
    runs: sourceRuns,
    faceIds: isHull ? [] : Array.from(native.faceID),
    unknownTriangles: isHull
      ? total
      : sourceRuns.filter((r) => r.sourceName === 'unknown').reduce((sum, r) => sum + r.count, 0),
  };
  geometry.userData.kilnRanges = sourceRuns.length
    ? sourceRuns.map((r) => ({
        name: r.sourceName,
        start: r.start,
        count: r.count,
        certainty: r.sourceName === 'unknown' ? 'unknown' : 'source-run',
      }))
    : [{ name: 'generated hull', start: 0, count: total, certainty: 'unknown' }];
  const warnings: { code: string; message: string }[] = [];
  if (context.preserve && context.anyUV && context.missingUV.size)
    warnings.push({
      code: 'CSG_UV_MISSING',
      message: `UVs were absent on ${[...context.missingUV].join(', ')}; those surfaces use zero UVs. Unwrap the result if they need a texture.`,
    });
  if (isHull && context.preserve)
    warnings.push({
      code: 'HULL_ATTRIBUTES_GENERATED',
      message:
        'A convex hull creates new faces. Source UVs and material boundaries cannot be assigned faithfully; output uses the first material and no UVs.',
    });
  geometry.userData.kilnAttributeWarnings = [...context.attributeWarnings.values(), ...warnings];
  retainNotes(context.geometryWarnings, geometry.userData.kilnGeometryWarnings);
  if (context.geometryWarnings.size)
    geometry.userData.kilnGeometryWarnings = [...context.geometryWarnings.values()];
  const output = new THREE.Mesh(
    geometry,
    context.preserve && !isHull && materials.length ? materials : firstMaterial(parts[0]!),
  );
  output.name = `Mesh_${name}`;
  output.position.copy(context.frame.origin);
  return output;
}

function splitPartsAndOpts(items: Array<THREE.Object3D | CsgOptions>): {
  parts: THREE.Object3D[];
  opts: CsgOptions;
} {
  const last = items[items.length - 1];
  if (last && !(last as THREE.Object3D).isObject3D)
    return { parts: items.slice(0, -1) as THREE.Object3D[], opts: last as CsgOptions };
  return { parts: items as THREE.Object3D[], opts: {} };
}

type Operation = 'boolUnion' | 'boolDiff' | 'boolIntersect' | 'hull';
async function runBoolean(
  op: Operation,
  name: string,
  parts: THREE.Object3D[],
  opts: CsgOptions,
): Promise<THREE.Mesh> {
  const mod = await getManifoldModule(),
    context: BridgeContext = {
      preserve: opts.preserveAttributes ?? false,
      sources: new Map(),
      anyUV: false,
      missingUV: new Set(),
      frame: computationFrame(parts),
      attributeWarnings: new Map(),
      geometryWarnings: new Map(),
    };
  const owned = new Set<Manifold>();
  const track = (m: Manifold) => {
    owned.add(m);
    return m;
  };
  try {
    const operands = parts.map((p, i) =>
      track(
        threeToManifold(
          p,
          mod,
          op === 'boolDiff'
            ? i === 0
              ? 'boolDiff body'
              : `boolDiff cutter ${i}`
            : op === 'boolIntersect'
              ? `boolIntersect operand ${i === 0 ? 'a' : 'b'}`
              : `${op} operand ${i + 1}`,
          context,
        ),
      ),
    );
    let result: Manifold;
    if (op === 'boolUnion') result = track(mod.Manifold.union(operands));
    else if (op === 'boolDiff') {
      const cutters =
        operands.length === 2 ? operands[1]! : track(mod.Manifold.union(operands.slice(1)));
      result = track(operands[0]!.subtract(cutters));
    } else if (op === 'boolIntersect') result = track(operands[0]!.intersect(operands[1]!));
    else result = track(operands.length === 1 ? operands[0]!.hull() : mod.Manifold.hull(operands));
    const hint =
      op === 'boolDiff'
        ? 'The cutters removed the entire body — check their size and position, or subtract fewer of them.'
        : op === 'boolIntersect'
          ? 'The two operands do not overlap — position them so their volumes actually intersect.'
          : op === 'hull'
            ? 'The inputs are coplanar or collinear, so they enclose no volume.'
            : 'Every operand was empty after merging.';
    assertNonEmptyResult(result, op, hint);
    // Restore units in Manifold before the single Float32 materialization. A
    // later Float32 rescale could collapse faces after normals/topology checks.
    // The large world origin remains on the returned mesh, preserving detail.
    const scaled = track(result.scale(context.frame.scale));
    const restored = track(scaled.translate(context.frame.center.toArray()));
    return outputMesh(
      restored,
      name,
      parts,
      { ...opts, smooth: opts.smooth ?? op === 'hull' },
      context,
      op === 'hull',
    );
  } finally {
    for (const ownedManifold of owned) ownedManifold.delete();
  }
}

/** Union solids. Opt into UV/material retention with preserveAttributes: true. */
export async function boolUnion(
  name: string,
  ...items: Array<THREE.Object3D | CsgOptions>
): Promise<THREE.Mesh> {
  const { parts, opts } = splitPartsAndOpts(items);
  if (parts.length < 2) throw new Error('boolUnion requires at least two parts');
  return runBoolean('boolUnion', name, parts, opts);
}
/** Cut faces inherit their cutter's material and UVs in preservation mode. */
export async function boolDiff(
  name: string,
  body: THREE.Object3D,
  ...items: Array<THREE.Object3D | CsgOptions>
): Promise<THREE.Mesh> {
  const { parts, opts } = splitPartsAndOpts(items);
  if (parts.length < 1) throw new Error('boolDiff requires at least one cutter');
  return runBoolean('boolDiff', name, [body, ...parts], opts);
}
export async function boolIntersect(
  name: string,
  a: THREE.Object3D,
  b: THREE.Object3D,
  opts: CsgOptions = {},
): Promise<THREE.Mesh> {
  return runBoolean('boolIntersect', name, [a, b], opts);
}
/** Hull faces are generated, so their source UV/material provenance is explicitly unknown. */
export async function hull(
  name: string,
  ...items: Array<THREE.Object3D | CsgOptions>
): Promise<THREE.Mesh> {
  const { parts, opts } = splitPartsAndOpts(items);
  if (parts.length < 1) throw new Error('hull requires at least one part');
  return runBoolean('hull', name, parts, opts);
}
