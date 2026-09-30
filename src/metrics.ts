/**
 * Kiln instanceability metrics + grader.
 *
 * A pure, deterministic, GPU-free static analysis over a baked glTF Document.
 * Lives in @kiln/engine so it can be computed at every natural point with
 * zero deploy coupling:
 *   - in render.ts -> render.meta for CLI / MCP / batch (never crosses the wire)
 *   - web-side in Kiln Studio from the persisted GLB
 *
 * The AgentCore runtime is a pass-through transport; adding fields to its wire
 * envelope would force a dual-image redeploy. The grade is a pure function over
 * GLB bytes, so we never put it on the wire — we recompute it wherever the GLB
 * already lives.
 *
 * NOTHING here is a hard gate. The metrics and grade are informational signals
 * that help agents and humans understand how cheap an asset is to render at
 * scale. They never reject, block, or fail a generation/validation/bake.
 */

import type { Document } from '@gltf-transform/core';

/**
 * Deterministic instanceability inputs, measured against the POST-dedup() glTF
 * Document — i.e. the GLB the runtime actually loads.
 */
export interface InstanceabilityMetrics {
  /** Distinct glTF primitive identities referenced by scenes. Not GPU buffer-allocation count. */
  uniqueGeometries: number;
  /** Distinct materials after dedup(). The "expensive axis" to collapse. */
  uniqueMaterials: number;
  /** Mesh-bearing node placements across all document scenes. */
  meshNodes: number;
  /** Placed mesh copies, including EXT_mesh_gpu_instancing multiplicity. */
  meshInstances: number;
  /**
   * Estimated single-pass draws across all scenes: for every node that
   * references a mesh, the count of that mesh's primitives. Shared meshes
   * referenced by N nodes contribute N times (each node is its own draw).
   */
  drawCalls: number;
  /** Number of texture images in the document. */
  textureCount: number;
  /** True if the document contains any skin (skinned/animated character). */
  skinned: boolean;
  /** Count of materials with a blended alpha mode (force per-object sort). */
  transparentMaterials: number;
  /** Placed triangle count, including instance multiplicity; excludes point/line primitives. */
  triangles: number;
}

export type InstanceabilityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface InstanceabilityReport {
  grade: InstanceabilityGrade;
  /**
   * One line that marks the grade informational and names what set it, e.g. "D (informational,
   * not a QA verdict), set by 9 distinct materials (D at 7-12). Also: 1 transparent material
   * (lowers only A/B to C); 20 geometries; 30 draw calls."
   */
  summary: string;
  /** Why the grade landed where it did (advisory bullet points); the first names the driver. */
  reasons: string[];
  metrics: InstanceabilityMetrics;
}

function primTris(prim: import('@gltf-transform/core').Primitive): number {
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
  switch (prim.getMode()) {
    case 4:
      return Math.floor(count / 3); // TRIANGLES
    case 5: // TRIANGLE_STRIP
    case 6:
      return Math.max(0, count - 2); // TRIANGLE_FAN
    default:
      return 0; // points and lines are not triangles
  }
}

function instanceCopies(node: import('@gltf-transform/core').Node): number {
  const ext = node.getExtension('EXT_mesh_gpu_instancing') as {
    getAttribute?: (name: string) => { getCount(): number } | null;
  } | null;
  if (!ext) return 1;
  return (
    ext.getAttribute?.('TRANSLATION')?.getCount() ??
    ext.getAttribute?.('ROTATION')?.getCount() ??
    ext.getAttribute?.('SCALE')?.getCount() ??
    1
  );
}

/** Placed triangles in one node's subtree, instance copies included, whether or not a scene
 *  reaches it: the per-level count of an `MSFT_lod` chain. */
export function nodeTriangles(node: import('@gltf-transform/core').Node): number {
  let triangles = 0;
  const mesh = node.getMesh();
  if (mesh) {
    const copies = instanceCopies(node);
    for (const prim of mesh.listPrimitives()) triangles += primTris(prim) * copies;
  }
  for (const child of node.listChildren()) triangles += nodeTriangles(child);
  return triangles;
}

/**
 * Collect instanceability metrics from a baked glTF Document.
 *
 * Call AFTER dedup() so shared meshes/materials are already merged and the
 * counts reflect the real GPU upload. Pass `triangles` from the render pass
 * (countTriangles over the THREE scene) to skip re-walking accessors; omit it
 * and the count is derived from the Document (used by the GLB-bytes path).
 */
export function collectGlbMetrics(doc: Document, triangles?: number): InstanceabilityMetrics {
  const root = doc.getRoot();

  const geomSet = new Set<object>();
  const matSet = new Set<object>();
  let drawCalls = 0;
  let derivedTris = 0;
  let meshNodes = 0;
  let meshInstances = 0;

  // Walk every node in every scene; a node referencing a mesh issues one draw
  // per primitive. Shared meshes (dedup-instanced) are referenced by multiple
  // nodes and therefore counted multiple times — that's the real draw cost,
  // and the real rendered-triangle total. A node batched by the M1c pass
  // (EXT_mesh_gpu_instancing) is ONE draw per primitive but renders N copies,
  // so its triangles multiply by the instance count while drawCalls stay 1 —
  // exactly what a supporting GPU does with it. Nodes outside every scene, such
  // as the lower levels of an MSFT_lod chain, are not drawn and not counted.
  const visit = (node: import('@gltf-transform/core').Node): void => {
    const mesh = node.getMesh();
    if (mesh) {
      const copies = instanceCopies(node);
      meshNodes += 1;
      meshInstances += copies;
      for (const prim of mesh.listPrimitives()) {
        drawCalls += 1;
        geomSet.add(prim);
        derivedTris += primTris(prim) * copies;
        const mat = prim.getMaterial();
        if (mat) matSet.add(mat);
      }
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const scene of root.listScenes()) {
    for (const node of scene.listChildren()) visit(node);
  }

  const transparentMaterials = root
    .listMaterials()
    .filter((m) => m.getAlphaMode() === 'BLEND').length;

  return {
    uniqueGeometries: geomSet.size,
    uniqueMaterials: matSet.size,
    meshNodes,
    meshInstances,
    drawCalls,
    textureCount: root.listTextures().length,
    skinned: root.listSkins().length > 0,
    transparentMaterials,
    triangles: triangles ?? derivedTris,
  };
}

/** Distinct-material bands that set the base grade. */
const MATERIAL_GRADE_BANDS: readonly {
  grade: InstanceabilityGrade;
  max: number;
  range: string;
}[] = [
  { grade: 'A', max: 1, range: '0-1' },
  { grade: 'B', max: 3, range: '2-3' },
  { grade: 'C', max: 6, range: '4-6' },
  { grade: 'D', max: 12, range: '7-12' },
  { grade: 'F', max: Number.POSITIVE_INFINITY, range: '13+' },
];

const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * Grade instanceability A–F. Kiln-tuned, advisory only.
 *
 * Rubric philosophy: the cheapest-to-scale asset shares one material across
 * shared geometry (a textbook InstancedMesh / BatchedMesh unit). The expensive,
 * un-collapsible axis is distinct-material cardinality, so the grade is driven
 * primarily by `uniqueMaterials`, with draw calls, transparency and texture
 * sprawl as secondary penalties.
 *
 * IMPORTANT Kiln adaptation: a skinned / animated character is NOT an automatic
 * F. Skinning only means the asset is clone-rendered rather than statically GPU-
 * instanced — which is fine at the placement counts Kiln City sees. We note it
 * and grade the remaining axes.
 *
 * The summary says the grade is informational and names what set it, so a
 * secondary fact (glass on an asset whose material count set D) is not read as
 * the cause.
 */
export function gradeInstanceability(
  metrics: InstanceabilityMetrics,
  opts: { category?: string } = {},
): InstanceabilityReport {
  const m = metrics;

  // Base grade from distinct-material cardinality (the collapsible axis).
  const band = MATERIAL_GRADE_BANDS.find((b) => m.uniqueMaterials <= b.max)!;
  let grade = band.grade;
  const materials = `${counted(m.uniqueMaterials, 'distinct material', 'distinct materials')} (${band.grade} at ${band.range})`;

  // Transparency forces per-object depth sort, and per-asset texture sprawl (un-atlased) is a
  // scaling cost: each lowers an A or B to C and has no effect on a C or worse.
  const transparency =
    m.transparentMaterials > 0
      ? counted(m.transparentMaterials, 'transparent material', 'transparent materials')
      : undefined;
  const textures = m.textureCount > 4 ? `${m.textureCount} textures` : undefined;
  const drivers: string[] = [];
  const also: string[] = [];
  if ((grade === 'A' || grade === 'B') && (transparency || textures)) {
    grade = 'C';
    if (transparency) drivers.push(`${transparency} (lowers A/B to C)`);
    if (textures) drivers.push(`${textures} (over 4 lowers A/B to C)`);
    also.push(materials);
  } else {
    drivers.push(materials);
    if (transparency) also.push(`${transparency} (lowers only A/B to C)`);
    if (textures) also.push(`${textures} (over 4 lowers only A/B to C)`);
  }
  also.push(
    counted(m.uniqueGeometries, 'geometry', 'geometries'),
    counted(m.drawCalls, 'draw call', 'draw calls'),
  );
  // Skinned: informational, NOT a grade penalty. Clone-rendered by design.
  if (m.skinned) also.push('skinned (clone-rendered, not penalized)');
  const setBy = drivers.join(' and ');

  const reasons = [
    `grade ${grade} set by ${setBy}`,
    `${m.uniqueMaterials} material${m.uniqueMaterials === 1 ? '' : 's'}, ` +
      `${m.uniqueGeometries} geometr${m.uniqueGeometries === 1 ? 'y' : 'ies'}, ` +
      `${m.drawCalls} draw call${m.drawCalls === 1 ? '' : 's'}`,
  ];
  if (transparency)
    reasons.push(`${m.transparentMaterials} transparent material(s) force per-object sort`);
  if (textures) reasons.push(`${m.textureCount} textures (consider atlasing)`);
  if (m.skinned)
    reasons.push(
      'skinned/animated — clone-rendered (not statically GPU-instanced); fine at low counts',
    );
  if (opts.category) reasons.push(`category: ${opts.category}`);

  const summary = `${grade} (informational, not a QA verdict), set by ${setBy}. Also: ${also.join('; ')}.`;
  return { grade, summary, reasons, metrics: m };
}
