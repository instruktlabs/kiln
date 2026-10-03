/**
 * Kiln Scene Introspection (W3b.1)
 *
 * Executes generated Kiln code headlessly, walks the resulting Three.js scene,
 * and returns a structured report agents can use to debug generation output.
 *
 * Typical use:
 *
 * ```ts
 * const result = await kiln.inspect(code);
 * if (result.boundingBox.min[1] > 0.1) {
 *   // Asset floats above ground - feed back to Claude.
 * }
 * ```
 *
 * Pure function: no file I/O, no WebGL, no GLB bytes.
 */

import * as THREE from 'three';
import type { RequirementsBinding } from './requirements-store';
import type { RequirementsContext } from './requirements-context';
import type { DrawDiagnostics } from './draw-diagnostics';

import { inspectGeneratedAnimation } from './render';
import { listHelperSpecs } from './discovery/helper-specs';
import {
  resolveEvaluatorPortV2,
  type EvaluatorExecutionProfileV2,
  type EvaluatorPortV2,
} from './evaluator';
import { loadGlbReviewScene } from './views/glb';

// =============================================================================
// Types
// =============================================================================

export type Vec3Tuple = [number, number, number];

export interface InspectNamedPart {
  /** Three.js Object3D name (e.g. `"Joint_LeftWheel"`, `"Mesh_Barrel"`). */
  name: string;
  /** Rough classification derived from name + object type. */
  type: 'pivot' | 'mesh' | 'group';
  /** Local position (relative to parent). */
  position: Vec3Tuple;
}

export interface InspectAnimationTrack {
  /** Clip the track belongs to. */
  clipName: string;
  /** Node name the track targets (e.g. `"Joint_LeftWheel"`). */
  targetName: string;
  /** Which transform channel the track drives. */
  property: 'rotation' | 'position' | 'scale';
  /** Whether `targetName` resolves to a node in the scene graph. */
  targetResolved: boolean;
}

export interface InspectBoundingBox {
  min: Vec3Tuple;
  max: Vec3Tuple;
  size: Vec3Tuple;
}

export interface InspectResult {
  requirements: RequirementsContext;
  /** Bounded, advisory single-pass draws and same-material merge observations. */
  drawDiagnostics: DrawDiagnostics;
  /** Total triangle count across every mesh in the scene graph. */
  triangles: number;
  /** Unique material count (by reference equality). */
  materials: number;
  /** World-space bounding box of the full scene. */
  boundingBox: InspectBoundingBox;
  /** All named pivots, meshes, and groups in traversal order. */
  namedParts: InspectNamedPart[];
  /** Every animation channel, with resolution flags so agents can spot typos. */
  animationTracks: InspectAnimationTrack[];
  /** Primitive helper names referenced in the source code. */
  primitivesUsed: string[];
  /** Non-fatal issues (e.g. tracks targeting unknown nodes). */
  warnings: string[];
  /** `meta` block extracted from the code. */
  meta: Record<string, unknown>;
}

// =============================================================================
// Primitive detection
// =============================================================================

/**
 * Names of every primitive helper exposed in the Kiln sandbox, derived from
 * the canonical catalog (discovery/helper-specs.ts) so this detector can never drift
 * from the real surface — the catalog itself is parity-tested against
 * `buildSandboxGlobals` in `__tests__/list-primitives.test.ts`.
 */
const KNOWN_PRIMITIVE_NAMES: readonly string[] = listHelperSpecs().map((p) => p.name);

function detectPrimitivesUsed(code: string): string[] {
  const seen = new Set<string>();
  for (const name of KNOWN_PRIMITIVE_NAMES) {
    // Match `name(` as a word boundary — avoids picking up substrings inside
    // other identifiers.
    const re = new RegExp(`\\b${name}\\s*\\(`);
    if (re.test(code)) seen.add(name);
  }
  return Array.from(seen).sort();
}

// =============================================================================
// Scene walk
// =============================================================================

function classifyNode(obj: THREE.Object3D): 'pivot' | 'mesh' | 'group' {
  // Duck-typed `.isMesh` instead of `instanceof` — sandbox-created meshes
  // Loaded GLB scene objects may belong to a different
  // module realm than this file's THREE import, so `instanceof` returns
  // false. See `kiln-cross-module-three.md` memory + render.ts comment.
  if (
    (obj as { isMesh?: boolean }).isMesh ||
    (obj.userData as { kilnGlbMeshNode?: boolean }).kilnGlbMeshNode
  )
    return 'mesh';
  if (obj.name.startsWith('Joint_')) return 'pivot';
  return 'group';
}

function collectNamedParts(root: THREE.Object3D): InspectNamedPart[] {
  const parts: InspectNamedPart[] = [];
  root.traverse((obj) => {
    if (!obj.name) return;
    parts.push({
      name: obj.name,
      type: classifyNode(obj),
      position: [obj.position.x, obj.position.y, obj.position.z],
    });
  });
  return parts;
}

function countTris(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if (!(child as { isMesh?: boolean }).isMesh) return;
    const meshChild = child as THREE.Mesh;
    const geometry = meshChild.geometry;
    if (!geometry) return;
    if (geometry.index) {
      count += geometry.index.count / 3;
    } else {
      const position = geometry.getAttribute('position');
      if (position) count += position.count / 3;
    }
  });
  return Math.floor(count);
}

function countUniqueMaterials(root: THREE.Object3D): number {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if (!(child as { isMesh?: boolean }).isMesh) return;
    const meshChild = child as THREE.Mesh;
    if (Array.isArray(meshChild.material)) {
      for (const m of meshChild.material) materials.add(m);
    } else if (meshChild.material) {
      materials.add(meshChild.material);
    }
  });
  return materials.size;
}

function computeBoundingBox(root: THREE.Object3D): InspectBoundingBox {
  // Ensure world matrices are fresh before measuring — otherwise nested
  // pivots can misreport bounds when positions were set after the last
  // auto-update. The GLB loader hands us a detached tree, so we drive
  // updates explicitly.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);

  // If the scene has no geometry at all (pivots-only), Box3 stays at +Inf /
  // -Inf. Collapse to the origin so downstream consumers get finite numbers.
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      size: [0, 0, 0],
    };
  }

  const size = new THREE.Vector3();
  box.getSize(size);

  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
    size: [size.x, size.y, size.z],
  };
}

function collectAnimationTracks(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
): InspectAnimationTrack[] {
  const tracks: InspectAnimationTrack[] = [];
  if (clips.length === 0) return tracks;

  const nodeNames = new Set<string>();
  root.traverse((obj) => {
    if (obj.name) nodeNames.add(obj.name);
  });

  for (const clip of clips) {
    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      if (dotIdx === -1) continue;
      const targetName = track.name.substring(0, dotIdx);
      const rawProp = track.name.substring(dotIdx + 1);

      // Three.js stores rotation tracks as `.quaternion` on the track name
      // but agents think of them as `rotation`. Normalize for the report.
      let property: 'rotation' | 'position' | 'scale';
      if (rawProp === 'quaternion' || rawProp === 'rotation') {
        property = 'rotation';
      } else if (rawProp === 'position') {
        property = 'position';
      } else if (rawProp === 'scale') {
        property = 'scale';
      } else {
        continue; // unsupported channel — surfaced via warnings instead
      }

      tracks.push({
        clipName: clip.name,
        targetName,
        property,
        targetResolved: nodeNames.has(targetName),
      });
    }
  }

  return tracks;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Execute Kiln code and return a structured inspection report.
 *
 * @throws {Error} if the evaluator rejects the code or the returned GLB.
 */
export async function inspect(
  code: string,
  options: {
    requirements?: RequirementsBinding;
    evaluatorPort?: EvaluatorPortV2;
    evaluatorProfile?: EvaluatorExecutionProfileV2;
  } = {},
): Promise<InspectResult> {
  // Inspect the authored scene: a configured KILN_BAKE_OPTIMIZE must not merge
  // materials or meshes before the report is taken.
  const rendered = await resolveEvaluatorPortV2(
    options.evaluatorPort,
    options.evaluatorProfile ?? 'trusted-local',
  ).render(code, { optimize: 'off', requirements: options.requirements });
  const { root, clips } = await loadGlbReviewScene(rendered.glb);

  const primitivesUsed = detectPrimitivesUsed(code);
  const namedParts = collectNamedParts(root);
  const triangles = countTris(root);
  const materials = countUniqueMaterials(root);
  const boundingBox = computeBoundingBox(root);
  const animationTracks = collectAnimationTracks(root, clips);
  const warnings = [...rendered.warnings, ...inspectGeneratedAnimation(root, clips)];
  const { inspectDrawDiagnostics } = await import('./draw-diagnostics');

  return {
    requirements: rendered.requirements,
    drawDiagnostics: await inspectDrawDiagnostics(rendered.glb),
    triangles,
    materials,
    boundingBox,
    namedParts,
    animationTracks,
    primitivesUsed,
    warnings,
    meta: rendered.meta as Record<string, unknown>,
  };
}
