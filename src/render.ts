import type { DuckClip } from './views/pose';
import {
  assertNoLegacyRuntimePolicy,
  resolveRequirementsContext,
  type RequirementsContext,
} from './requirements-context';
import type { RequirementsBinding } from './requirements-store';
import {
  runRequirementsSceneQa,
  collectRequirementsSceneEvidence,
  appendRequirementsFinalQa,
} from './qa/requirements-run';
import type { AssetRequirementsQaReportV2 } from './qa/requirements-report';
import { rethrowAuthoringError } from './evaluator/authoring-diagnostic';
/**
 * Headless Kiln GLB Renderer
 *
 * Takes Kiln-generated code and produces a binary GLB Buffer.
 * Uses Three.js for scene construction (pure math, no WebGL) and
 * @gltf-transform/core for serialization. No browser APIs required.
 *
 * Ported from scripts/export-glb.ts - same bridge pattern, exposed as a
 * library function so core can be consumed by server/CLI without shelling
 * out.
 */

import * as THREE from 'three';
import { createGltfIO } from './gltf-io';
import { communitySceneDocument, resolveGltfExporter } from './community-exporter';
import { rigExtrasForExport } from './rig-export';
import {
  geometryAttributeValues,
  inspectGeometryExport,
  validateMaterialGroups,
  type GeometryExportPolicy,
} from './geometry-export';
import { createHash } from 'node:crypto';
import { Document, getBounds } from '@gltf-transform/core';
import {
  dedup,
  instance,
  palette,
  flatten,
  join,
  weld,
  prune,
  mergeDocuments,
} from '@gltf-transform/functions';

import {
  buildSlotIndex,
  chooseSlot,
  hexToLinearRgb,
  type SnapSlot,
  type SnapPaletteSlot,
} from './palette-snap';

import { buildSandboxGlobals, countTriangles, type DiagnosticConsole } from './primitives';
import {
  collectGlbMetrics,
  gradeInstanceability,
  type InstanceabilityGrade,
  type InstanceabilityMetrics,
  type InstanceabilityReport,
} from './metrics';
import {
  cloneSemanticMetadataV1,
  createSemanticMetadataV1,
  KILN_SEMANTIC_EXTRAS_KEY,
  validateSemanticMetadataV1,
  type AssetCategory,
  type AssetIntentV1,
  type IntegrationAssetRole,
  type IntegrationManifestV1,
} from './contracts';
import {
  assertFinalGlbValid,
  GltfValidationError,
  validateFinalGlbBytes,
  type KhronosGltfValidationReport,
} from './qa/gltf';
import { AssetQaBlockedError, qaBlockingEnabled, qaPolicyFromEnv } from './qa/run';
import {
  collectMaterialMetricsV1,
  evaluateMaterialBudgetV1,
  type MaterialMetricsV1,
} from './material-metrics';
import {
  collectMaterialRecipeApplications,
  type MaterialRecipeApplicationProvenanceV1,
} from './material-recipe-runtime';
import {
  collectMaterialResourceProvenance,
  type MaterialResourceProvenanceV1,
} from './material-resources';
import { DEFAULT_TEXTURE_RESOLVER, type TextureResolver } from './texture-resolver';
import type { MaterialLibraryPayloadV1, MaterialManifestV1 } from './material-library';
import type { RebuildOptions } from './rebuild-options';
import { assertGeneratedSourceSafe } from './validation';
import { applyKitContract, type KitPackOptions, type KitPackSummary } from './kit';
import {
  type BakedTextureProvenanceV1,
  bakeSceneTextures,
  ensureNormalMapTangents,
} from './texture-bake';
import type { CharacterCapturedDiagnosticV1 } from './views/character-capture';
import type { VehicleCapturedDiagnosticV1 } from './views/vehicle';

export type CapturedDiagnosticV1 = CharacterCapturedDiagnosticV1 | VehicleCapturedDiagnosticV1;

// WebIO (not NodeIO) is used for GLB serialization so the same code path
// works in both Node and browser environments. writeBinary() only builds the
// GLB byte stream in memory - it never reads URIs - so the fetch/fs gap
// between WebIO and NodeIO is irrelevant on the write side. This lets the
// editor's exportGLB() and headless renderGLB() share one bridge.

/** Engine-standard glTF IO: WebIO with the extensions Kiln GLBs may carry.
 *  EXT_mesh_gpu_instancing must be REGISTERED on the read side or a re-read
 *  (grade-from-bytes, optimize-from-bytes, palette snap) would silently drop
 *  the instancing a prior bake emitted — the batch node would collapse to a
 *  single copy. Write-side registration is harmless (the extension instance
 *  travels on the Document). */
// Variants and Basisu are registered for READS as much as writes: once the kit
// pass has run, every later pass that parses these bytes (metrics, optimize,
// palette snap) would silently drop both extensions without them.
const engineIO = createGltfIO;

/**
 * World-space AABB of a stored GLB, computed from its bytes alone — node
 * transforms applied over the (spec-required) POSITION accessor bounds. No
 * model-authored code is executed: this exists so consumers that only hold the
 * artifact (e.g. Kiln Studio's compose catalog fallback, H-41) never need
 * `executeKilnCode` to recover a footprint. Caveat: EXT_mesh_gpu_instancing
 * copies are not expanded (the batch node contributes its single-copy bounds);
 * records new enough to be instanced also persist `metrics.bbox`, so the
 * from-bytes path is a legacy-record fallback. Returns undefined for a GLB with
 * no measurable geometry.
 */
export async function measureGlbBounds(
  bytes: Uint8Array,
): Promise<{ min: [number, number, number]; max: [number, number, number] } | undefined> {
  const doc = await engineIO().readBinary(bytes);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return undefined;
  const { min, max } = getBounds(scene);
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite)) return undefined;
  return {
    min: [min[0]!, min[1]!, min[2]!],
    max: [max[0]!, max[1]!, max[2]!],
  };
}

// Gltf-transform type aliases for local readability.
type GtNode = import('@gltf-transform/core').Node;
type GtMesh = import('@gltf-transform/core').Mesh;
type GtMaterial = import('@gltf-transform/core').Material;
type GtBuffer = import('@gltf-transform/core').Buffer;
type GtTexture = import('@gltf-transform/core').Texture;
type GtScene = import('@gltf-transform/core').Scene;

// Accessor.Type is typed as Record<string, AccessorType> which runs afoul of
// noUncheckedIndexedAccess. Use the literal strings directly - same values,
// no type noise.
type AccessorTypeStr = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';
const TYPE_SCALAR: AccessorTypeStr = 'SCALAR';
const TYPE_VEC2: AccessorTypeStr = 'VEC2';
const TYPE_VEC3: AccessorTypeStr = 'VEC3';
const TYPE_VEC4: AccessorTypeStr = 'VEC4';

// =============================================================================
// Execution
// =============================================================================

/**
 * Scene-placement role the agent declares in its `meta` block. Drives composer
 * layout (wonders anchor + scale up, fill scatters, ground is the base, vehicles
 * snap to roads) and Kiln City density budgeting. Semantic — cannot be recomputed
 * from GLB bytes, so it travels in provenance. See plan/05-product-depth.md §3.4.
 */
export type AssetRole = IntegrationAssetRole;
export type { SnapPaletteSlot } from './palette-snap';

const GROUND_CONTACT_TOLERANCE = 0.02;

function ensureDefaultScene(doc: Document): GtScene | undefined {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (scene && !root.getDefaultScene()) root.setDefaultScene(scene);
  return scene;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** Inspect finished bytes without executing model-authored source code. */
export async function inspectGlbIntegration(
  bytes: Uint8Array,
  opts: {
    requestedRole?: IntegrationAssetRole;
    assessedRole?: IntegrationAssetRole;
    validation?: KhronosGltfValidationReport;
  } = {},
): Promise<IntegrationManifestV1 | undefined> {
  const doc = await engineIO().readBinary(bytes);
  const root = doc.getRoot();
  const explicitDefault = root.getDefaultScene();
  const scene = explicitDefault ?? root.listScenes()[0];
  if (!scene) return undefined;

  const { min, max } = getBounds(scene);
  const finiteBounds = min.every(Number.isFinite) && max.every(Number.isFinite);
  if (!finiteBounds) return undefined;
  const metrics = collectGlbMetrics(doc);
  const validation = opts.validation ?? (await validateFinalGlbBytes(bytes));
  const scenes = root.listScenes();
  const minTuple: [number, number, number] = [min[0]!, min[1]!, min[2]!];
  const maxTuple: [number, number, number] = [max[0]!, max[1]!, max[2]!];
  const minY = minTuple[1];

  return {
    schemaVersion: 'kiln.integration-manifest.v1',
    analyzerVersion: 1,
    artifactSha256: await sha256Hex(bytes),
    units: 'm',
    axes: { forward: '+X', up: '+Y', right: '+Z' },
    bounds: {
      min: minTuple,
      max: maxTuple,
      size: [maxTuple[0] - minTuple[0], maxTuple[1] - minTuple[1], maxTuple[2] - minTuple[2]],
      center: [
        (minTuple[0] + maxTuple[0]) / 2,
        (minTuple[1] + maxTuple[1]) / 2,
        (minTuple[2] + maxTuple[2]) / 2,
      ],
    },
    pivot: { convention: 'author-origin', position: [0, 0, 0] },
    ground: {
      groundY: 0,
      contactTolerance: GROUND_CONTACT_TOLERANCE,
      minY,
      offsetToGround: -minY,
      grounded: Math.abs(minY) <= GROUND_CONTACT_TOLERANCE,
    },
    defaultScene: { index: scenes.indexOf(scene), name: scene.getName() },
    ...(opts.requestedRole ? { requestedRole: opts.requestedRole } : {}),
    ...(opts.assessedRole ? { assessedRole: opts.assessedRole } : {}),
    renderMetrics: {
      triangles: metrics.triangles,
      drawCalls: metrics.drawCalls,
      uniqueGeometries: metrics.uniqueGeometries,
      uniqueMaterials: metrics.uniqueMaterials,
      textureCount: metrics.textureCount,
      transparentMaterials: metrics.transparentMaterials,
      skinned: metrics.skinned,
    },
    structuralQa: {
      hasDefaultScene: explicitDefault !== null,
      finiteBounds,
      validatorErrors: validation.issues.numErrors,
      validatorWarnings: validation.issues.numWarnings,
    },
    visualQa: 'not_assessed',
  };
}

export interface KilnCodeMeta {
  name?: string;
  category?: string;
  /** Scene-placement role (agent-declared). Drives composer layout + city budgeting. */
  role?: AssetRole;
  tris?: number;
  /**
   * Count of primitive invocations from the agent-generated build() call.
   * Populated by executeKilnCode / renderGLB; agents don't author this.
   * Used to drive primitive-library prioritization from real usage.
   */
  primitiveUsage?: Record<string, number>;
  /**
   * Instanceability metrics measured against the post-dedup() glTF Document.
   * Informational only — never a gate. Populated by renderGLB / renderSceneToGLB.
   */
  instanceability?: InstanceabilityReport;
  /**
   * Convenience copy of {@link KilnCodeMeta.instanceability}.grade (A–F),
   * auto-filled at bake so consumers read the tier without re-deriving it.
   */
  tier?: InstanceabilityGrade;
  /** Set if metric computation threw; the GLB is still valid. */
  metricsError?: string;
  /** Set when an opt-in consolidation pass ran (optimize !== 'off'). */
  optimize?: OptimizeSummary;
  /** Set when the GPU-instancing pass created batches (M1c — perf, not grade). */
  instancing?: InstancingSummary;
  [key: string]: unknown;
}

export interface ExecutedKilnCode {
  meta: KilnCodeMeta;
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /**
   * Primitive-call counts gathered while executing build()/animate().
   * Identical to meta.primitiveUsage once renderGLB merges it in.
   */
  primitiveUsage: Record<string, number>;
}

/**
 * Execute Kiln-generated code in a Function sandbox and return the built
 * Three.js scene plus animation clips. Throws on any runtime error in the
 * generated code.
 */
/**
 * Execute generated Kiln code and return the built scene + clips.
 *
 * Async because CSG primitives (boolUnion, boolDiff, etc.) are WASM-backed
 * and async. Sync `build()` functions are supported transparently — if the
 * return value is a Promise it is awaited, otherwise it is used as-is.
 * Same for `animate()`.
 */
export interface ExecuteKilnCodeOptions {
  /** Trusted host injection. Generated source receives only the closed
   *  loadApprovedTexture(resourceId) function. */
  textureResolver?: TextureResolver;
  /** Trusted diagnostic sink, never a global console mutation. */
  console?: DiagnosticConsole;
}

export async function executeKilnCode(
  code: string,
  options: ExecuteKilnCodeOptions = {},
): Promise<ExecutedKilnCode> {
  if (!code || typeof code !== 'string') {
    throw new Error('executeKilnCode: code must be a non-empty string');
  }

  // Normalize line endings - Windows CRLF from LLM responses trips up the
  // Function constructor.
  const normalized = code.replace(/\r\n/g, '\n');

  // Defense in depth only: reject known ambient/dynamic-code escape patterns
  // before the Function constructor sees source. This is not process isolation.
  assertGeneratedSourceSafe(normalized);

  try {
    const primitiveUsage: Record<string, number> = {};
    const globals = buildSandboxGlobals(primitiveUsage, {
      textureResolver: options.textureResolver ?? DEFAULT_TEXTURE_RESOLVER,
      console: options.console,
    });
    const globalNames = Object.keys(globals);
    const globalValues = Object.values(globals);

    const fn = new Function(
      ...globalNames,
      `${normalized}\nreturn { meta: typeof meta !== 'undefined' ? meta : {}, build, animate: typeof animate !== 'undefined' ? animate : null };`,
    );

    const { meta, build, animate } = fn(...globalValues) as {
      meta: KilnCodeMeta;
      build: () => THREE.Object3D | Promise<THREE.Object3D>;
      animate:
        | ((
            root: THREE.Object3D,
          ) => THREE.AnimationClip[] | undefined | Promise<THREE.AnimationClip[] | undefined>)
        | null;
    };

    if (typeof build !== 'function') {
      throw new Error('executeKilnCode: generated code did not define `build`');
    }

    const root = await build();
    // Duck-typed check — the kiln sandbox uses `new Function(...)`, which under
    // bun creates an isolated module realm. `new THREE.X()` inside the sandbox
    // produces objects whose constructor is a *different* class object from the
    // THREE imported here, so `instanceof THREE.Object3D` returns false.
    // Three.js sets `.isObject3D = true` on the prototype for exactly this case.
    if (!(root as { isObject3D?: boolean })?.isObject3D) {
      throw new Error('executeKilnCode: build() did not return a THREE.Object3D');
    }

    const clips = animate ? ((await animate(root)) ?? []) : [];

    return { meta: meta ?? {}, root, clips, primitiveUsage };
  } catch (error) {
    rethrowAuthoringError(error);
  }
}

// =============================================================================
// Three.js -> gltf-transform Bridge
// =============================================================================

function bridgeMaterial(
  doc: Document,
  threeMat: THREE.Material,
  cache: Map<THREE.Material, GtMaterial>,
  textureCache: Map<THREE.Texture, GtTexture>,
): GtMaterial {
  const cached = cache.get(threeMat);
  if (cached) return cached;

  const mat = doc.createMaterial(threeMat.name || undefined);

  // Duck-typed material checks — see executeKilnCode for the rationale.
  // Sandbox-created materials are different class instances of the same
  // module, so `.isXMaterial` is the only reliable identity test.
  const matFlags = threeMat as unknown as {
    isMeshStandardMaterial?: boolean;
    isMeshLambertMaterial?: boolean;
    isMeshBasicMaterial?: boolean;
    isSpriteMaterial?: boolean;
  };
  if (matFlags.isMeshStandardMaterial) {
    const stdMat = threeMat as THREE.MeshStandardMaterial;
    mat.setBaseColorFactor([stdMat.color.r, stdMat.color.g, stdMat.color.b, stdMat.opacity]);
    mat.setRoughnessFactor(stdMat.roughness);
    mat.setMetallicFactor(stdMat.metalness);
    if (stdMat.emissive) {
      mat.setEmissiveFactor([stdMat.emissive.r, stdMat.emissive.g, stdMat.emissive.b]);
    }
    if (stdMat.alphaTest > 0) {
      mat.setAlphaMode('MASK');
      mat.setAlphaCutoff(stdMat.alphaTest);
    } else if (stdMat.transparent) {
      mat.setAlphaMode('BLEND');
    }
    if (stdMat.side === THREE.DoubleSide) {
      mat.setDoubleSided(true);
    }
    // PBR texture slots (Wave 3B)
    if (stdMat.map) {
      const t = bridgeTexture(doc, stdMat.map, textureCache);
      if (t) mat.setBaseColorTexture(t);
    }
    if (stdMat.normalMap) {
      const t = bridgeTexture(doc, stdMat.normalMap, textureCache);
      if (t) mat.setNormalTexture(t);
    }
    // metallic + roughness live in one glTF texture (R=unused, G=rough, B=metal).
    // If the agent used separate Three.js maps we emit the roughness one as
    // the combined channel — the common case is a single combined map anyway.
    if (stdMat.roughnessMap && stdMat.metalnessMap && stdMat.roughnessMap !== stdMat.metalnessMap) {
      throw new TypeError(
        `Material ${JSON.stringify(threeMat.name || '(unnamed)')} uses separate roughness/metalness textures. Pack G=roughness/B=metalness before export.`,
      );
    }
    const mrSource = stdMat.roughnessMap ?? stdMat.metalnessMap;
    if (mrSource) {
      const t = bridgeTexture(doc, mrSource, textureCache);
      if (t) mat.setMetallicRoughnessTexture(t);
    }
    if (stdMat.emissiveMap) {
      const t = bridgeTexture(doc, stdMat.emissiveMap, textureCache);
      if (t) mat.setEmissiveTexture(t);
    }
    if (stdMat.aoMap) {
      const t = bridgeTexture(doc, stdMat.aoMap, textureCache);
      if (t) mat.setOcclusionTexture(t);
      mat.setOcclusionStrength(stdMat.aoMapIntensity ?? 1);
    }
  } else if (matFlags.isMeshLambertMaterial) {
    const lambMat = threeMat as THREE.MeshLambertMaterial;
    mat.setBaseColorFactor([lambMat.color.r, lambMat.color.g, lambMat.color.b, lambMat.opacity]);
    mat.setRoughnessFactor(1.0);
    mat.setMetallicFactor(0.0);
    if (lambMat.emissive) {
      mat.setEmissiveFactor([lambMat.emissive.r, lambMat.emissive.g, lambMat.emissive.b]);
    }
  } else if (matFlags.isMeshBasicMaterial) {
    const basicMat = threeMat as THREE.MeshBasicMaterial;
    mat.setBaseColorFactor([
      basicMat.color.r,
      basicMat.color.g,
      basicMat.color.b,
      basicMat.opacity,
    ]);
    mat.setRoughnessFactor(1.0);
    mat.setMetallicFactor(0.0);
  } else if (matFlags.isSpriteMaterial) {
    const spriteMat = threeMat as THREE.SpriteMaterial;
    mat.setBaseColorFactor([
      spriteMat.color.r,
      spriteMat.color.g,
      spriteMat.color.b,
      spriteMat.opacity,
    ]);
    mat.setRoughnessFactor(1.0);
    mat.setMetallicFactor(0.0);
  }

  // Material alpha/sidedness is shared across Three.js material families.
  // Keep this after the family-specific PBR mapping so SpriteMaterial and
  // MeshBasic/Lambert materials cannot pass scene QA and then become opaque or
  // single-sided in the GLB bridge.
  const common = threeMat as THREE.Material & {
    alphaTest?: number;
    transparent?: boolean;
    opacity?: number;
    map?: THREE.Texture | null;
  };
  if ((common.alphaTest ?? 0) > 0) {
    mat.setAlphaMode('MASK');
    mat.setAlphaCutoff(common.alphaTest ?? 0.5);
  } else if (common.transparent || (common.opacity ?? 1) < 1) {
    mat.setAlphaMode('BLEND');
  }
  if (threeMat.side === THREE.DoubleSide) mat.setDoubleSided(true);
  if (common.map && !mat.getBaseColorTexture()) {
    const texture = bridgeTexture(doc, common.map, textureCache);
    if (texture) mat.setBaseColorTexture(texture);
  }

  cache.set(threeMat, mat);
  return mat;
}

/**
 * Bridge a Three.js Texture to a gltf-transform Texture.
 *
 * Uses `userData.encoded` — the bytes `loadTexture` stashed, or the PNG
 * `bakeSceneTextures` encoded earlier in `renderSceneToGLB` — so nothing is
 * re-encoded here.
 *
 * Returning null still drops the slot, but it is no longer silent: the bake
 * pass has already walked every material slot and warned by material and slot
 * name for anything it could not encode. That warning lives there rather than
 * here because this function receives a bare `THREE.Texture` and cannot say
 * which material or slot it came from — which is most of what makes the
 * warning actionable.
 */
function bridgeTexture(
  doc: Document,
  threeTex: THREE.Texture,
  cache: Map<THREE.Texture, GtTexture>,
): GtTexture | null {
  const cached = cache.get(threeTex);
  if (cached) return cached;

  const encoded = (threeTex.userData as Record<string, unknown>)['encoded'] as
    | { mime: string; bytes: Uint8Array }
    | undefined;
  if (!encoded) return null;

  const t = doc.createTexture(threeTex.name || 'texture');
  t.setMimeType(encoded.mime);
  t.setImage(encoded.bytes);
  cache.set(threeTex, t);
  return t;
}

function bridgeGeometry(
  doc: Document,
  buf: GtBuffer,
  geometry: THREE.BufferGeometry,
  material: GtMaterial | GtMaterial[],
  meshName: string,
): GtMesh {
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }

  const prim = doc.createPrimitive().setMaterial(Array.isArray(material) ? material[0]! : material);

  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (posAttr) {
    prim.setAttribute(
      'POSITION',
      doc
        .createAccessor(`${meshName}_pos`)
        .setArray(geometryAttributeValues(posAttr))
        .setType(TYPE_VEC3)
        .setBuffer(buf),
    );
  }

  const normAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (normAttr) {
    prim.setAttribute(
      'NORMAL',
      doc
        .createAccessor(`${meshName}_norm`)
        .setArray(geometryAttributeValues(normAttr))
        .setType(TYPE_VEC3)
        .setBuffer(buf),
    );
  }

  const uvAttr = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (uvAttr) {
    prim.setAttribute(
      'TEXCOORD_0',
      doc
        .createAccessor(`${meshName}_uv`)
        .setArray(geometryAttributeValues(uvAttr))
        .setType(TYPE_VEC2)
        .setBuffer(buf),
    );
  }

  const tangentAttr = geometry.getAttribute('tangent') as THREE.BufferAttribute | undefined;
  if (tangentAttr?.itemSize === 4) {
    prim.setAttribute(
      'TANGENT',
      doc
        .createAccessor(`${meshName}_tangent`)
        .setArray(geometryAttributeValues(tangentAttr))
        .setType(TYPE_VEC4)
        .setBuffer(buf),
    );
  }

  const indexAttr = geometry.getIndex();
  if (indexAttr) {
    // Uint16 holds indices up to 65535; a geometry with more vertices needs
    // Uint32 indices or the values silently wrap (corrupt GLB). gltf-transform
    // derives componentType (5123 vs 5125) from the typed-array class.
    const IndexArray = posAttr && posAttr.count > 65535 ? Uint32Array : Uint16Array;
    prim.setIndices(
      doc
        .createAccessor(`${meshName}_idx`)
        .setArray(new IndexArray(indexAttr.array))
        .setType(TYPE_SCALAR)
        .setBuffer(buf),
    );
  }

  const mesh = doc.createMesh(meshName);
  if (!Array.isArray(material)) return mesh.addPrimitive(prim);
  const indexValues = indexAttr
    ? Array.from(indexAttr.array)
    : Array.from({ length: posAttr!.count }, (_, i) => i);
  const groups = validateMaterialGroups(geometry, material.length, meshName);
  for (const group of groups) {
    const part = doc.createPrimitive().setMaterial(material[group.materialIndex ?? 0]!);
    for (const semantic of prim.listSemantics())
      part.setAttribute(semantic, prim.getAttribute(semantic)!);
    const IndexArray = posAttr!.count > 65535 ? Uint32Array : Uint16Array;
    part.setIndices(
      doc
        .createAccessor(`${meshName}_group_indices`)
        .setArray(new IndexArray(indexValues.slice(group.start, group.start + group.count)))
        .setType(TYPE_SCALAR)
        .setBuffer(buf),
    );
    mesh.addPrimitive(part);
  }
  prim.dispose();
  return mesh;
}

function bridgeNode(
  doc: Document,
  buf: GtBuffer,
  threeObj: THREE.Object3D,
  matCache: Map<THREE.Material, GtMaterial>,
  nodeMap: Map<string, GtNode>,
  meshCache: Map<string, GtMesh>,
  texCache: Map<THREE.Texture, GtTexture>,
): GtNode {
  const gtNode = doc.createNode(threeObj.name || undefined);

  // Only validated versioned Kiln semantic and rig payloads are promoted from Three.js
  // userData into glTF extras. Arbitrary userData can contain encoded textures
  // and other non-JSON values, so exporting it wholesale is intentionally
  // forbidden. A malformed reserved payload is an authoring error rather than
  // something the bridge may silently drop.
  const semanticValue = threeObj.userData[KILN_SEMANTIC_EXTRAS_KEY];
  const extras = rigExtrasForExport(threeObj);
  let semanticForExport = semanticValue;
  if ((threeObj as THREE.Object3D & { isSprite?: boolean }).isSprite) {
    // glTF has no native Sprite primitive. The bridge emits a quad below and
    // stamps the actual Three.js spherical-facing behavior as a portable
    // semantic so a runtime consumer can reconstruct it deterministically.
    if (semanticValue === undefined) {
      semanticForExport = createSemanticMetadataV1({
        roles: ['vfx.facing.camera-spherical', 'vfx.effect.surface.card'],
      });
    } else {
      const existing = validateSemanticMetadataV1(semanticValue);
      if (existing.valid && existing.value) {
        semanticForExport = {
          ...cloneSemanticMetadataV1(existing.value),
          roles: [
            // The exporter owns the runtime truth for Sprite facing. Drop any
            // contradictory model-authored facing self-report before stamping
            // the actual spherical behavior.
            ...existing.value.roles.filter((role) => !role.startsWith('vfx.facing.')),
            'vfx.facing.camera-spherical',
            ...(existing.value.roles.some((role) => role.startsWith('vfx.effect.surface'))
              ? []
              : ['vfx.effect.surface.card']),
          ],
        };
      }
    }
  }
  if (semanticForExport !== undefined) {
    const semantic = validateSemanticMetadataV1(semanticForExport);
    if (!semantic.valid || !semantic.value) {
      const detail = semantic.issues
        .map((issue) => `${issue.path || '<root>'}: ${issue.message}`)
        .join('; ');
      throw new TypeError(
        `Invalid ${KILN_SEMANTIC_EXTRAS_KEY} on node ${threeObj.name || '<unnamed>'}: ${detail}`,
      );
    }
    extras[KILN_SEMANTIC_EXTRAS_KEY] = cloneSemanticMetadataV1(semantic.value);
  }
  if (Object.keys(extras).length) gtNode.setExtras(extras);

  gtNode.setTranslation([threeObj.position.x, threeObj.position.y, threeObj.position.z]);
  gtNode.setRotation([
    threeObj.quaternion.x,
    threeObj.quaternion.y,
    threeObj.quaternion.z,
    threeObj.quaternion.w,
  ]);
  gtNode.setScale([threeObj.scale.x, threeObj.scale.y, threeObj.scale.z]);

  if ((threeObj as { isMesh?: boolean }).isMesh) {
    const threeMesh = threeObj as THREE.Mesh;
    const threeMats = Array.isArray(threeMesh.material) ? threeMesh.material : [threeMesh.material];
    const gtMats = threeMats.map((material) => bridgeMaterial(doc, material, matCache, texCache));
    const gtMat = Array.isArray(threeMesh.material) ? gtMats : gtMats[0]!;

    // Key the mesh cache by (geometry ref, material ref) so createInstance
    // (same geo + mat as source) produces a GLB-level mesh instance: a
    // single Mesh referenced by multiple Nodes. Cuts duplicated accessors
    // for wheels, bolts, fence posts, etc.
    const cacheKey = `${threeMesh.geometry.uuid}__${threeMats.map((material) => material.uuid).join('_')}`;
    let gtMesh = meshCache.get(cacheKey);
    if (!gtMesh) {
      gtMesh = bridgeGeometry(doc, buf, threeMesh.geometry, gtMat, threeMesh.name || 'mesh');
      meshCache.set(cacheKey, gtMesh);
    }
    gtNode.setMesh(gtMesh);
  } else if ((threeObj as THREE.Object3D & { isSprite?: boolean }).isSprite) {
    const sprite = threeObj as THREE.Sprite;
    const threeMat = sprite.material;
    const gtMat = bridgeMaterial(doc, threeMat, matCache, texCache);
    // Unit XY quad matches Three.js Sprite scale semantics. Non-default center
    // and material rotation are baked into the quad; camera-facing remains an
    // explicit semantic runtime behavior on the exported node.
    const centerX = sprite.center?.x ?? 0.5;
    const centerY = sprite.center?.y ?? 0.5;
    const rotation = sprite.material.rotation ?? 0;
    const cacheKey = `kiln-sprite-quad:${centerX}:${centerY}:${rotation}__${threeMat.uuid}`;
    let gtMesh = meshCache.get(cacheKey);
    if (!gtMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1);
      if (centerX !== 0.5 || centerY !== 0.5) {
        geometry.translate(0.5 - centerX, 0.5 - centerY, 0);
      }
      if (rotation !== 0) geometry.rotateZ(rotation);
      gtMesh = bridgeGeometry(doc, buf, geometry, gtMat, sprite.name || 'sprite-quad');
      meshCache.set(cacheKey, gtMesh);
    }
    gtNode.setMesh(gtMesh);
  }

  if (threeObj.name) {
    nodeMap.set(threeObj.name, gtNode);
  }

  for (const child of threeObj.children) {
    const childNode = bridgeNode(doc, buf, child, matCache, nodeMap, meshCache, texCache);
    gtNode.addChild(childNode);
  }

  return gtNode;
}

function animationInterpolation(track: THREE.KeyframeTrack): 'LINEAR' | 'STEP' {
  const mode = track.getInterpolation();
  if (mode === THREE.InterpolateDiscrete) return 'STEP';
  if (mode === THREE.InterpolateLinear) return 'LINEAR';
  throw new Error(`Unsupported animation interpolation on ${track.name}; use LINEAR or STEP.`);
}

/** glTF derives duration from sampler times. Encode a trailing hold so an explicit
 * clip duration survives either exporter, while review extras keep authored keys. */
function clipsWithDurationSamples(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  return clips.map((clip) => {
    const end = Math.fround(clip.duration);
    const needsHold = (track: THREE.KeyframeTrack) =>
      track.times.length > 0 && track.times[track.times.length - 1]! < end;
    if (!clip.tracks.some(needsHold)) return clip;
    const copied = clip.clone();
    for (const track of copied.tracks) {
      if (!needsHold(track)) continue;
      const stride = track.getValueSize();
      track.times = Float32Array.from([...track.times, end]);
      track.values = Float32Array.from([...track.values, ...track.values.slice(-stride)]);
    }
    return copied;
  });
}

function bridgeAnimations(
  doc: Document,
  buf: GtBuffer,
  clips: THREE.AnimationClip[],
  nodeMap: Map<string, GtNode>,
  warnings: string[],
): void {
  for (const clip of clips) {
    const anim = doc.createAnimation(clip.name);

    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      const nodeName = track.name.substring(0, dotIdx);
      const property = track.name.substring(dotIdx + 1);

      const targetNode = nodeMap.get(nodeName);
      if (!targetNode) {
        warnings.push(`Animation target "${nodeName}" not found - skipped`);
        continue;
      }

      let targetPath: 'translation' | 'rotation' | 'scale';
      let valueType: AccessorTypeStr;
      if (property === 'position') {
        targetPath = 'translation';
        valueType = TYPE_VEC3;
      } else if (property === 'quaternion') {
        targetPath = 'rotation';
        valueType = TYPE_VEC4;
      } else if (property === 'scale') {
        targetPath = 'scale';
        valueType = TYPE_VEC3;
      } else {
        warnings.push(`Unsupported animation property "${property}" on "${nodeName}" - skipped`);
        continue;
      }

      const inputAcc = doc
        .createAccessor(`${clip.name}_${nodeName}_input`)
        .setArray(new Float32Array(track.times))
        .setType(TYPE_SCALAR)
        .setBuffer(buf);

      const outputAcc = doc
        .createAccessor(`${clip.name}_${nodeName}_output`)
        .setArray(new Float32Array(track.values))
        .setType(valueType)
        .setBuffer(buf);

      const sampler = doc
        .createAnimationSampler()
        .setInput(inputAcc)
        .setOutput(outputAcc)
        .setInterpolation(animationInterpolation(track));

      const channel = doc
        .createAnimationChannel()
        .setTargetNode(targetNode)
        .setTargetPath(targetPath)
        .setSampler(sampler);

      anim.addSampler(sampler);
      anim.addChannel(channel);
    }

    // Never serialize an empty Animation object: Khronos correctly reports
    // EMPTY_ENTITY as an error. Advisory-only unresolved tracks are skipped;
    // explicit required tracks have already been blocked by deterministic QA.
    if (anim.listChannels().length === 0) anim.dispose();
  }
}

const REVIEW_CLIPS_EXTRAS_KEY = 'kilnReviewClipsV1';
const REVIEW_CLIP_LIMITS = {
  clips: 32,
  tracks: 256,
  samplesPerTrack: 4_096,
  valuesPerTrack: 16_384,
} as const;

/** Preserve the authored review clip vocabulary in artifact bytes, including
 * unresolved tracks that glTF cannot encode as native channels. Review tools
 * use this bounded data only to reconstruct deterministic poses/warnings; it
 * is not executable source and native valid channels remain authoritative to
 * ordinary glTF consumers. */
function reviewClipExtras(clips: THREE.AnimationClip[]): Record<string, unknown> {
  if (clips.length > REVIEW_CLIP_LIMITS.clips) {
    throw new Error(`Animation review clip limit exceeded (${REVIEW_CLIP_LIMITS.clips}).`);
  }
  let trackCount = 0;
  return {
    version: 1,
    clips: clips.map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.map((track) => {
        trackCount++;
        if (trackCount > REVIEW_CLIP_LIMITS.tracks) {
          throw new Error(`Animation review track limit exceeded (${REVIEW_CLIP_LIMITS.tracks}).`);
        }
        if (
          track.times.length > REVIEW_CLIP_LIMITS.samplesPerTrack ||
          track.values.length > REVIEW_CLIP_LIMITS.valuesPerTrack
        ) {
          throw new Error('Animation review sample limit exceeded.');
        }
        const times = Array.from(track.times);
        const values = Array.from(track.values);
        if (!times.every(Number.isFinite) || !values.every(Number.isFinite)) {
          throw new Error('Animation review tracks must contain only finite values.');
        }
        return { name: track.name, times, values, interpolation: animationInterpolation(track) };
      }),
    })),
  };
}

// =============================================================================
// Public API
// =============================================================================

export interface RenderResult {
  /** Effective exporter inputs, retained with exact reviewed artifacts for explicit rebuilds. */
  rebuildOptions?: RebuildOptions;
  /** Host requirements receipt; generated metadata cannot establish or replace it. */
  requirements: RequirementsContext;
  /** Optional host cache receipt. This identifies evaluation reuse, not image fidelity. */
  buildCache?: { key: `sha256:${string}`; hit: boolean };
  glb: Buffer;
  /** SHA-256 identity of the exact returned GLB bytes. */
  artifactGlbSha256: `sha256:${string}`;
  tris: number;
  meta: KilnCodeMeta;
  warnings: string[];
  /** Automatic category diagnostics captured from the exact final source scene. */
  diagnosticViews?: CapturedDiagnosticV1[];
  materialMetrics?: MaterialMetricsV1;
  materialRecipeApplications?: MaterialRecipeApplicationProvenanceV1[];
  materialResourceProvenance?: MaterialResourceProvenanceV1[];
  /** Exact host-approved input dependencies, including licenses and procedural recipes.
   * These are declared build inputs, not proof that every supplied map was used. */
  materialLibraryDependencies?: MaterialManifestV1[];
  /** Textures baked into the returned GLB, including bounded procedural lineage. */
  bakedTextures?: BakedTextureProvenanceV1[];
  integrationManifest: IntegrationManifestV1;
}

/**
 * Bake-time material-consolidation mode (opt-in, default off).
 *   - `off`     — today's output, byte-identical across every consumer.
 *   - `auto`    — grade-aware: runs `palette` only when it would actually act
 *                 (>= PALETTE_MIN distinct materials — i.e. the asset is grade
 *                 C/D/F from material sprawl); below that it is a no-op, byte-
 *                 identical to `off`. The default grade-lift lever for the agent
 *                 path: lean assets stay untouched, sprawling heroes collapse.
 *   - `palette` — merge distinct flat-color materials into one palette material
 *                 + palette texture (`palette → weld → prune`). Node graph,
 *                 named pivots, and animations are fully preserved, so it is safe
 *                 for animated assets + Kiln City behaviors. Lifts the grade by
 *                 collapsing the material count (the grade's primary axis).
 *   - `full`    — `palette` plus `flatten → join` to also cut draw calls. STATIC
 *                 assets only: auto-degrades to `palette` when the Document has
 *                 animations or skins (flatten/join must not disturb a rig).
 * See docs/kiln-material-consolidation-cycle.md (Move 1).
 */
export type OptimizeMode = 'off' | 'auto' | 'palette' | 'full';

/** What a consolidation pass did (recorded in provenance / render.meta). */
export interface OptimizeSummary {
  /** The mode actually applied (may differ from the request after auto-degrade). */
  mode: 'palette' | 'full';
  materialsBefore: number;
  materialsAfter: number;
  drawsBefore: number;
  drawsAfter: number;
}

/**
 * GPU-instancing pass mode (M1c — a PERF/filesize lever, NOT a grade lever; the
 * A–F grade keys on material count and is unchanged by instancing):
 *   - `off`  — never run the pass.
 *   - `auto` — run only for `role: 'fill'` assets (high-repetition scatter is
 *              where batching pays; hero/vehicle assets keep their node graph).
 *   - `on`   — always attempt (still skipped for animated/skinned docs and
 *              assets with `Joint_*` pivots — see {@link applyGpuInstancing}).
 */
export type InstanceMode = 'off' | 'auto' | 'on';

/** What a GPU-instancing pass did (recorded in provenance / render.meta). */
export interface InstancingSummary {
  /** Instanced batch nodes created (one per shared mesh). */
  batches: number;
  /** Total node copies folded into those batches. */
  instances: number;
  drawsBefore: number;
  drawsAfter: number;
}

export interface RenderSceneResult {
  /** Binary GLB bytes, platform-agnostic (Buffer-compatible in Node). */
  bytes: Uint8Array;
  /** SHA-256 identity of `bytes`. */
  artifactGlbSha256: `sha256:${string}`;
  tris: number;
  warnings: string[];
  /** Official Khronos report for these exact post-transform bytes. */
  gltfValidation: KhronosGltfValidationReport;
  /** Five-signal deterministic report for the exact scene and final bytes. */
  qaReport: AssetRequirementsQaReportV2;
  requirements: RequirementsContext;
  /** Post-dedup (and post-optimize, when enabled) instanceability report
   *  (informational). Undefined if it threw. */
  instanceability?: InstanceabilityReport;
  /** Set if metric computation threw; bytes are still valid. */
  metricsError?: string;
  /** Textures encoded to PNG at export time (T2.2). Absent when none were baked. */
  bakedTextures?: BakedTextureProvenanceV1[];
  /** Set when an opt-in consolidation pass ran (optimize !== 'off'). */
  optimize?: OptimizeSummary;
  /** Set when the GPU-instancing pass created batches (instance !== 'off'). */
  instancing?: InstancingSummary;
  /** Category captures selected only by trusted intent from the exact source scene. */
  diagnosticViews?: CapturedDiagnosticV1[];
  materialMetrics?: MaterialMetricsV1;
  materialRecipeApplications?: MaterialRecipeApplicationProvenanceV1[];
  materialResourceProvenance?: MaterialResourceProvenanceV1[];
  integrationManifest: IntegrationManifestV1;
}

export interface RenderSceneOptions {
  /** Host-only migration option; omitted keeps the established exporter. */
  gltfExporter?: 'legacy' | 'three';
  /** Warn about unsupported custom attributes (default), or reject before export. */
  geometryPolicy?: GeometryExportPolicy;
  /** Name of the glTF scene. Defaults to 'Scene'. */
  sceneName?: string;
  /** Animation clips to bridge into the document. */
  clips?: THREE.AnimationClip[];
  /**
   * Run gltf-transform dedup() before serializing. Default true. Set false
   * to inspect raw bridge output for debugging.
   */
  dedup?: boolean;
  /** Legacy argument accepted only to return an explicit migration-required error. */
  category?: string;
  /** Legacy argument accepted only to return an explicit migration-required error. */
  intent?: AssetIntentV1;
  /** Host established binding; never read from source metadata. */
  requirements?: RequirementsBinding;
  /**
   * Opt-in material consolidation, applied after dedup. Defaults to the
   * `KILN_BAKE_OPTIMIZE` env (else `off`). `off` is byte-identical to today.
   * See {@link OptimizeMode}.
   */
  optimize?: OptimizeMode;
  /**
   * GPU-instancing pass (EXT_mesh_gpu_instancing) for repeated geometry,
   * applied between dedup and optimize (the upstream-canonical order:
   * dedup → instance → palette). Defaults to the `KILN_BAKE_INSTANCE` env
   * (else `auto`, which only acts for `role: 'fill'`). See {@link InstanceMode}.
   */
  instance?: InstanceMode;
  /** Agent-declared asset role — drives the `instance: 'auto'` gate. */
  role?: AssetRole;
  /**
   * Re-serialization of a scene that has already been adjudicated, so asset QA
   * observes rather than blocks.
   *
   * The review tools pose a loaded scene and export it again to get one camera
   * cell out of the render port. That export is not a new asset submission: the
   * bytes it derives from were produced by this engine and passed QA on the way
   * out. Re-adjudicating them fails on facts the round trip destroys rather
   * than on anything wrong with the asset — a texture that arrives back as a
   * decoded image no longer carries the payload provenance
   * `MAT_TEXTURE_DECODE_FAILED` looks for, so every textured asset was rejected
   * by its own animation preview.
   *
   * Reports are still computed and still record their real disposition, so
   * telemetry stays honest; only the throw is withheld. This is deliberately
   * narrower than `KILN_QA_MODE`, which turns blocking off for a whole process.
   */
  derivative?: boolean;
}

function finalTextureForSlot(material: GtMaterial, slot: string): GtTexture | null {
  switch (slot) {
    case 'map':
      return material.getBaseColorTexture();
    case 'normalMap':
      return material.getNormalTexture();
    case 'roughnessMap':
    case 'metalnessMap':
      return material.getMetallicRoughnessTexture();
    case 'emissiveMap':
      return material.getEmissiveTexture();
    case 'aoMap':
      return material.getOcclusionTexture();
    default:
      return null;
  }
}

/**
 * Rebind engine-authored texture lineage to a downstream final GLB.
 *
 * Studio may legally rewrite the first engine export through instancing, ORM
 * packing, and KTX2 transcoding before persistence. The authored recipe and
 * source PNG identity remain useful, but their original artifact hash is not a
 * claim about those final bytes. Resolve each recorded material slot against
 * the final document and attach the exact embedded image and GLB identities.
 * No generated source is executed.
 */
export async function bindBakedTextureProvenanceToFinalGlb(
  baked: readonly BakedTextureProvenanceV1[],
  finalGlb: Uint8Array,
): Promise<BakedTextureProvenanceV1[]> {
  if (baked.length === 0) return [];
  const doc = await engineIO().readBinary(finalGlb);
  const root = doc.getRoot();
  const byMaterialName = new Map<string, GtMaterial[]>();
  for (const material of root.listMaterials()) {
    const name = material.getName() || '(unnamed material)';
    const list = byMaterialName.get(name) ?? [];
    list.push(material);
    byMaterialName.set(name, list);
  }
  const nodesByName = new Map<string, GtNode[]>();
  for (const node of root.listNodes()) {
    const list = nodesByName.get(node.getName()) ?? [];
    list.push(node);
    nodesByName.set(node.getName(), list);
  }
  const artifactGlbSha256 = `sha256:${await sha256Hex(finalGlb)}` as const;

  return baked.flatMap((entry) => {
    const resolved = new Set<GtTexture>();
    for (const binding of entry.bindings) {
      const nodeMaterials = (nodesByName.get(binding.node) ?? []).flatMap(
        (node) =>
          node
            .getMesh()
            ?.listPrimitives()
            .flatMap((primitive) => {
              const material = primitive.getMaterial();
              return material ? [material] : [];
            }) ?? [],
      );
      const materials = nodeMaterials.filter(
        (material) => (material.getName() || '(unnamed material)') === binding.material,
      );
      const candidates = materials.length
        ? materials
        : (byMaterialName.get(binding.material) ?? []);
      for (const material of candidates) {
        const texture = finalTextureForSlot(material, binding.slot);
        if (texture) resolved.add(texture);
      }
    }
    // Texture names survive ordinary transforms and are a safe disambiguator
    // when instancing replaced the authored node. Do not use the name alone if
    // it is empty: unnamed textures are common and not identities.
    if (resolved.size === 0 && entry.texture !== '(unnamed texture)') {
      for (const texture of root.listTextures()) {
        if (texture.getName() === entry.texture) resolved.add(texture);
      }
    }
    if (resolved.size !== 1) return [];
    const texture = [...resolved][0]!;
    const image = texture.getImage();
    const mime = texture.getMimeType();
    if (!image || !mime) return [];
    return [
      {
        ...entry,
        artifactGlbSha256,
        finalMime: mime,
        finalImageSha256: `sha256:${createHash('sha256').update(image).digest('hex')}` as const,
      },
    ];
  });
}

/** Minimum distinct material-value blocks before palette() generates a texture.
 *  Below this it is a no-op (an asset with very few materials is already cheap).
 *  Aligned with the instanceability rubric: grade B tops out at 3 materials, so
 *  the first grade-C count (4) must trigger `auto` consolidation. */
const PALETTE_MIN = 4;

/** Resolve the effective optimize mode: explicit option wins, else the env, else off. */
function resolveOptimize(opt?: OptimizeMode): OptimizeMode {
  if (opt) return opt;
  const env = process.env['KILN_BAKE_OPTIMIZE'];
  return env === 'auto' || env === 'palette' || env === 'full' ? env : 'off';
}

/** Minimum nodes sharing one mesh before the instancing pass batches them.
 *  The gltf-transform default (5) — below that the extension's byte overhead
 *  and loader bookkeeping outweigh the draw savings. */
const INSTANCE_MIN = 5;

/** Resolve the effective instance mode: explicit option wins, else the env, else auto. */
function resolveInstance(opt?: InstanceMode): InstanceMode {
  if (opt) return opt;
  const env = process.env['KILN_BAKE_INSTANCE'];
  return env === 'off' || env === 'auto' || env === 'on' ? env : 'auto';
}

/** True when any node carries a `Joint*` name — the Kiln City runtime targets
 *  those pivots by NAME (wheel spin/steer rigs), and instance() drops per-node
 *  names when it folds nodes into a batch. Such assets are never instanced. */
function hasJointPivots(doc: Document): boolean {
  return doc
    .getRoot()
    .listNodes()
    .some((n) => /^joint[_-]/i.test(n.getName()));
}

/**
 * Run the opt-in GPU-instancing pass (M1c) on a baked Document, in place.
 *
 * Emits `EXT_mesh_gpu_instancing` batches for meshes referenced by
 * >= {@link INSTANCE_MIN} nodes (colonnades, fence runs, container stacks),
 * cutting draw calls + bytes at city scale. **Perf/filesize only — the A–F
 * grade keys on material count and does not move.** Runs after dedup (which
 * links duplicate meshes so sharing is detectable) and before palette()
 * (the upstream-canonical dedup → instance → palette order; join() skips
 * instanced nodes by design so `full` stays safe).
 *
 * Skipped (returns undefined) when:
 *   - mode is `off`, or `auto` and the role is not `'fill'`;
 *   - the Document carries animations or skins (the library no-ops on
 *     animated docs; skinned nodes are excluded per-mesh — we skip whole);
 *   - any node is named `Joint*` (city behaviors target pivots by name);
 *   - no mesh crosses the threshold (nothing to batch).
 */
async function applyGpuInstancing(
  doc: Document,
  mode: InstanceMode,
  role: AssetRole | undefined,
): Promise<InstancingSummary | undefined> {
  if (mode === 'off') return undefined;
  if (mode === 'auto' && role !== 'fill') return undefined;
  const root = doc.getRoot();
  if (root.listAnimations().length > 0 || root.listSkins().length > 0) return undefined;
  if (hasJointPivots(doc)) return undefined;

  const before = collectGlbMetrics(doc);
  await doc.transform(instance({ min: INSTANCE_MIN }));

  let batches = 0;
  let instances = 0;
  for (const node of root.listNodes()) {
    const ext = node.getExtension('EXT_mesh_gpu_instancing') as {
      getAttribute?: (name: string) => { getCount(): number } | null;
    } | null;
    if (!ext) continue;
    batches += 1;
    // Identity channels are disposed by the library, so read whichever survives.
    instances +=
      ext.getAttribute?.('TRANSLATION')?.getCount() ??
      ext.getAttribute?.('ROTATION')?.getCount() ??
      ext.getAttribute?.('SCALE')?.getCount() ??
      0;
  }
  if (batches === 0) return undefined;

  const after = collectGlbMetrics(doc);
  return { batches, instances, drawsBefore: before.drawCalls, drawsAfter: after.drawCalls };
}

/**
 * Run the opt-in consolidation transforms on a baked Document, in place.
 *
 * `palette` collapses distinct untextured flat-color materials into one palette
 * material + a small palette texture (textured materials pass through untouched);
 * `weld` + `prune` clean up. `full` adds `flatten → join` to also reduce draws,
 * but ONLY for static, semantics-free assets — animations, skins, or any reserved
 * semantic extras auto-degrade to `palette` so a rig, portal-clearance node,
 * socket, or separable role is never flattened away. `prune` keeps empty leaf
 * nodes + extras so named pivots that Kiln City behaviors target by name survive.
 * palette groups by alpha mode, so opaque + the one glass slot stay distinct
 * materials (transparency is never flattened into opaque).
 *
 * Returns what it did; throws are the caller's to handle (the GLB is otherwise
 * valid). Pure w.r.t. inputs other than the mutated Document.
 */
async function consolidateMaterials(
  doc: Document,
  mode: 'palette' | 'full',
): Promise<OptimizeSummary> {
  const before = collectGlbMetrics(doc);
  const root = doc.getRoot();
  const animatedOrSkinned = root.listAnimations().length > 0 || root.listSkins().length > 0;
  const semanticGraph = root
    .listNodes()
    .some((node) => node.getExtras()[KILN_SEMANTIC_EXTRAS_KEY] !== undefined);
  const effective: 'palette' | 'full' =
    mode === 'full' && (animatedOrSkinned || semanticGraph) ? 'palette' : mode;

  const steps = [palette({ min: PALETTE_MIN })];
  if (effective === 'full') {
    // flatten() leaves skeletons + animation-targeted nodes in place, but it may
    // remove empty semantic clearance/socket nodes even when prune keeps leaves
    // and extras. Full therefore runs only on static, semantics-free graphs.
    steps.push(flatten(), join({ keepNamed: true }));
  }
  // A solid texture can be semantically meaningful in more than one slot (for
  // example the same unnamed bytes used as base color, normal, and packed MR).
  // gltf-transform's default solid-texture pruning folds base/MR pixels into
  // factors but retains the normal binding, corrupting that shared-slot case
  // while remaining validator-clean. Preserve authored textures across every
  // material rebake; palette-generated textures and ordinary dead resources are
  // still cleaned normally.
  steps.push(weld(), prune({ keepLeaves: true, keepExtras: true, keepSolidTextures: true }));

  await doc.transform(...steps);

  const after = collectGlbMetrics(doc);
  return {
    mode: effective,
    materialsBefore: before.uniqueMaterials,
    materialsAfter: after.uniqueMaterials,
    drawsBefore: before.drawCalls,
    drawsAfter: after.drawCalls,
  };
}

/**
 * Serialize a pre-built Three.js scene graph to a GLB byte stream.
 *
 * This is the shared bridge used by both `renderGLB(code)` (headless, re-
 * executes code) and the in-editor `exportGLB()` (uses the live scene).
 *
 * Works in both Node and browser - uses WebIO, which only touches network
 * APIs on the read side. The write side is pure bytes-in/bytes-out, so the
 * same function serializes identically on either platform. That unifies
 * the two historical paths (Three.js GLTFExporter in the editor vs.
 * gltf-transform bridge headlessly) into one canonical pipeline.
 *
 * Pure function: no file I/O, no globals, no WebGL.
 */
export async function renderSceneToGLB(
  root: THREE.Object3D,
  opts: RenderSceneOptions = {},
): Promise<RenderSceneResult> {
  assertNoLegacyRuntimePolicy(opts);
  const requirements = resolveRequirementsContext(opts.requirements);
  const clips = opts.clips ?? [];
  if (opts.geometryPolicy !== undefined && !['warn', 'strict'].includes(opts.geometryPolicy))
    throw new Error('geometryPolicy must be warn or strict');
  const exporter = resolveGltfExporter(opts.gltfExporter);
  const warnings = inspectGeometryExport(root, opts.geometryPolicy, exporter);
  const tris = countTriangles(root);
  const materialRecipeApplications = collectMaterialRecipeApplications(root);
  const materialResourceProvenance = collectMaterialResourceProvenance(root);

  // Runtime-aware joint-name validation (follow-up #6 from the W1.1 spike
  // report). Walk the scene graph + animation tracks and surface any track
  // whose target name doesn't resolve to a scene node. Non-fatal - the GLB
  // still renders; agents iterating on code use these warnings to fix the
  // next iteration. Runs before the bridge so the descriptive "rename the
  // pivot" hint is first; the bridge also emits a briefer "target not
  // found - skipped" for each unresolved track (kept for compatibility).
  for (const w of inspectGeneratedAnimation(root, clips)) warnings.push(w);
  for (const w of inspectSceneStructure(root)) warnings.push(w);

  // T2.2 — encode in-memory textures to PNG BEFORE QA, so QA judges the file
  // that will actually be written. A procedural DataTexture used to reach the
  // bridge with no encoded bytes and be dropped without a word; now it is
  // either baked into the GLB or warned about by name.
  const bakedTextures = await bakeSceneTextures(root, warnings);
  // A normal-mapped mesh without tangents makes every runtime invent its own
  // tangent basis, so the same asset lights differently in different engines.
  // Only touches meshes that actually carry a normal map — the attribute
  // changes the exported bytes.
  ensureNormalMapTangents(root, warnings);

  const qaPolicy = qaPolicyFromEnv();
  const sceneEvidence = await collectRequirementsSceneEvidence(requirements, root, qaPolicy);
  const sceneQaReport = runRequirementsSceneQa(requirements, root, clips, qaPolicy, sceneEvidence);
  // A derivative export withholds the throw without hiding the finding.
  const qaBlocks = qaBlockingEnabled() && opts.derivative !== true;
  const qaSuppressedBy = opts.derivative === true ? 'derivative re-serialization' : 'KILN_QA_MODE';
  if (sceneQaReport.disposition === 'block') {
    const blocked = new AssetQaBlockedError(sceneQaReport, 'scene');
    if (qaBlocks) throw blocked;
    warnings.push(`${blocked.message} — block suppressed by ${qaSuppressedBy}`);
  }

  const nativeClips = clipsWithDurationSamples(clips);
  const doc =
    exporter === 'three'
      ? await communitySceneDocument(
          root,
          nativeClips,
          (await import('./exporter-node')).nodeExportPlatform,
        )
      : new Document();
  // `asset.generator` defaults to the serializer's own version string, which put
  // `glTF-Transform v4.4.1` inside every artifact's bytes -- and therefore inside
  // `artifactHash`. Taking 4.5.0 moved all 83 recorded hashes and failed the
  // gallery build, and the ENTIRE difference between the two GLBs was that one
  // string: identical BIN chunk, identical accessor min/max, identical everything
  // else. A dependency's version number is provenance about the tool, not identity
  // of the asset, and it has no business in a hash that claims to name the asset.
  // Kiln's own version deliberately stays out too: it belongs in the provenance
  // record, where changing it does not move artifact bytes.
  doc.getRoot().getAsset().generator = 'Kiln';
  if (exporter === 'legacy') {
    const buf = doc.createBuffer();
    const matCache = new Map<THREE.Material, GtMaterial>();
    const meshCache = new Map<string, GtMesh>();
    const texCache = new Map<THREE.Texture, GtTexture>();
    const nodeMap = new Map<string, GtNode>();

    const rootNode = bridgeNode(doc, buf, root, matCache, nodeMap, meshCache, texCache);
    const gltfScene = doc.createScene(opts.sceneName ?? 'Scene').addChild(rootNode);
    doc.getRoot().setDefaultScene(gltfScene);

    if (clips.length > 0) {
      gltfScene.setExtras({ [REVIEW_CLIPS_EXTRAS_KEY]: reviewClipExtras(clips) });
      bridgeAnimations(doc, buf, nativeClips, nodeMap, warnings);
    }
  } else {
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    if (!scene) throw new Error('Community exporter produced no scene.');
    scene.setName(opts.sceneName ?? 'Scene');
    if (clips.length > 0) scene.setExtras({ [REVIEW_CLIPS_EXTRAS_KEY]: reviewClipExtras(clips) });
  }

  // Dedupe accessors/materials/meshes so instanced parts (4 wheels, 10 posts,
  // 12 windows) share a single underlying resource in the GLB. Cuts file
  // size on instancing-heavy assets; no-op on unique-geometry scenes.
  if (opts.dedup !== false) {
    try {
      await doc.transform(dedup());
    } catch (err) {
      warnings.push(`dedup transform failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Opt-in GPU-instancing pass (M1c) — dedup → instance → palette is the
  // upstream-canonical order (dedup links duplicate meshes so sharing is
  // detectable; join() skips instanced nodes so `full` stays safe). Perf/bytes
  // only; the grade does not move. Failure is swallowed with a warning.
  let instancing: InstancingSummary | undefined;
  try {
    instancing = await applyGpuInstancing(doc, resolveInstance(opts.instance), opts.role);
  } catch (err) {
    warnings.push(`instance transform failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Opt-in material consolidation (default off => byte-identical to today). Runs
  // after dedup so palette() works on the already-merged material set. `auto` is
  // grade-aware: it consolidates only when palette() would actually act
  // (>= PALETTE_MIN materials), so lean assets stay byte-stable. Failure is
  // swallowed with a warning — the dedup'd GLB is still valid.
  const optimizeMode = resolveOptimize(opts.optimize);
  let effectiveOptimize: 'off' | 'palette' | 'full' =
    optimizeMode === 'auto' ? 'off' : optimizeMode;
  if (optimizeMode === 'auto' && collectGlbMetrics(doc, tris).uniqueMaterials >= PALETTE_MIN) {
    effectiveOptimize = 'palette';
  }
  let optimize: OptimizeSummary | undefined;
  if (effectiveOptimize !== 'off') {
    try {
      optimize = await consolidateMaterials(doc, effectiveOptimize);
    } catch (err) {
      warnings.push(
        `optimize (${effectiveOptimize}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Instanceability metrics, measured against the post-dedup() (and post-optimize,
  // when enabled) Document so the counts reflect the GLB the runtime actually
  // loads. Informational only — never a gate. Failure is swallowed: the GLB is
  // still valid without it. Triangle count can change under `full` (join welds
  // primitives), so derive it from the final Document rather than the pre-bake tris.
  let instanceability: InstanceabilityReport | undefined;
  let metricsError: string | undefined;
  try {
    // Derive tris from the Document when a transform reshaped it (join welds
    // primitives; instancing folds N nodes into one batch whose tris the
    // instance-aware counter multiplies back out).
    const metrics: InstanceabilityMetrics = collectGlbMetrics(
      doc,
      optimize || instancing ? undefined : tris,
    );
    instanceability = gradeInstanceability(metrics);
  } catch (err) {
    metricsError = err instanceof Error ? err.message : String(err);
  }

  let materialMetrics: MaterialMetricsV1 | undefined;
  let materialBudgetWarnings = [] as ReturnType<typeof evaluateMaterialBudgetV1>;
  try {
    materialMetrics = collectMaterialMetricsV1(doc);
    materialBudgetWarnings = evaluateMaterialBudgetV1(materialMetrics, {
      profile: 'web.portable.v1',
      tier: 'standard',
    });
  } catch (error) {
    warnings.push(
      `material metrics failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const io = engineIO();
  ensureDefaultScene(doc);
  const bytes = await io.writeBinary(doc);
  const artifactGlbSha256 = `sha256:${await sha256Hex(bytes)}` as const;
  const boundBakedTextures = bakedTextures.map((entry) => ({
    ...entry,
    artifactGlbSha256,
  }));
  const gltfValidation = await validateFinalGlbBytes(bytes);
  const qaReport = await appendRequirementsFinalQa(
    requirements,
    sceneQaReport,
    gltfValidation,
    bytes,
    instanceability,
    metricsError,
    materialMetrics,
    materialBudgetWarnings,
  );
  if (qaReport.disposition === 'block') {
    const blocked = new AssetQaBlockedError(qaReport, 'final-glb', gltfValidation);
    if (qaBlocks) throw blocked;
    warnings.push(`${blocked.message} — block suppressed by ${qaSuppressedBy}`);
  }
  for (const issue of gltfValidation.issues.messages) {
    if (issue.severity !== 1) continue;
    warnings.push(
      `glTF ${issue.code}${issue.pointer ? ` at ${issue.pointer}` : ''}: ${issue.message}`,
    );
  }

  const integrationManifest = await inspectGlbIntegration(bytes, {
    ...(opts.role ? { requestedRole: opts.role } : {}),
    validation: gltfValidation,
  });
  if (!integrationManifest) throw new Error('renderSceneToGLB: final GLB has no measurable scene');

  const diagnosticViews: CapturedDiagnosticV1[] = [];
  const rig = requirements.requirements.requirements.rig;
  if (rig?.state === 'requested') {
    const { captureCharacterDiagnosticViews } = await import('./views/character-capture');
    diagnosticViews.push(
      ...(await captureCharacterDiagnosticViews(
        root,
        clips as readonly DuckClip[],
        rig.value,
        Object.values(qaReport.dimensions).flatMap((d) => d.findings),
      )),
    );
  }
  if (requirements.requirements.requirements.mobility?.state === 'requested') {
    const { captureVehicleDiagnosticViews } = await import('./views');
    diagnosticViews.push(...captureVehicleDiagnosticViews(root));
  }

  return {
    bytes,
    requirements,
    artifactGlbSha256,
    tris,
    warnings,
    gltfValidation,
    qaReport,
    instanceability,
    metricsError,
    ...(optimize ? { optimize } : {}),
    ...(instancing ? { instancing } : {}),
    ...(materialMetrics ? { materialMetrics } : {}),
    ...(materialRecipeApplications.length ? { materialRecipeApplications } : {}),
    ...(materialResourceProvenance.length ? { materialResourceProvenance } : {}),
    ...(boundBakedTextures.length ? { bakedTextures: boundBakedTextures } : {}),
    integrationManifest,
    ...(diagnosticViews.length ? { diagnosticViews } : {}),
  };
}

/**
 * Execute Kiln code and serialize to a GLB Buffer.
 *
 * This is the main headless entry point. Takes the JS code Claude produces
 * (the same string shape `/api/kiln/generate` returns) and returns ready-
 * to-write bytes.
 *
 * Pure function: no file I/O, no globals, no WebGL.
 */
export interface RenderGlbOptions {
  requirements?: RequirementsBinding;
  /** Host-only migration option, transported explicitly to isolated workers. */
  gltfExporter?: 'legacy' | 'three';
  geometryPolicy?: GeometryExportPolicy;
  optimize?: OptimizeMode;
  instance?: InstanceMode;
  intent?: AssetIntentV1;
  category?: AssetCategory;
  /** Trusted evaluator dependency; never derived from generated code. */
  textureResolver?: TextureResolver;
  /** Host-approved portable material maps, transported as data to evaluator workers. */
  materialResources?: MaterialLibraryPayloadV1;
  /** In-process host diagnostic sink; not serializable to evaluator workers. */
  diagnosticConsole?: DiagnosticConsole;
}

/**
 * Trusted in-process execute/export implementation.
 *
 * Hosts should normally call {@link renderGLB}. The subprocess evaluator calls
 * this function directly to prevent recursive process creation.
 */
export async function renderGLBInProcess(
  code: string,
  opts: RenderGlbOptions = {},
): Promise<RenderResult> {
  assertNoLegacyRuntimePolicy(opts);
  const requirements = resolveRequirementsContext(opts.requirements);
  if (opts.geometryPolicy !== undefined && !['warn', 'strict'].includes(opts.geometryPolicy))
    throw new Error('geometryPolicy must be warn or strict');
  let textureResolver = opts.textureResolver ?? DEFAULT_TEXTURE_RESOLVER;
  const rebuildOptions: RebuildOptions = {
    gltfExporter: resolveGltfExporter(opts.gltfExporter),
    geometryPolicy: opts.geometryPolicy ?? 'warn',
    optimize: resolveOptimize(opts.optimize),
    instance: resolveInstance(opts.instance),
  };
  let materialLibraryDependencies: MaterialManifestV1[] | undefined;
  if (opts.materialResources) {
    const { decodeMaterialLibraryPayload, createMaterialLibraryTextureResolver } = await import(
      './material-library-node'
    );
    const materialRecords = await decodeMaterialLibraryPayload(opts.materialResources);
    materialLibraryDependencies = materialRecords.map((record) => structuredClone(record.manifest));
    textureResolver = await createMaterialLibraryTextureResolver(materialRecords, textureResolver);
  }
  const { meta, root, clips, primitiveUsage } = await executeKilnCode(code, {
    textureResolver,
    console: opts.diagnosticConsole,
  });
  const scene = await renderSceneToGLB(root, {
    ...rebuildOptions,
    sceneName: meta.name || 'Scene',
    clips,
    requirements: requirements.binding,
    role: meta.role,
  });

  const {
    category: modelCategory,
    requirements: _requirements,
    intent: _intent,
    policyHash: _policyHash,
    adviceHash: _adviceHash,
    binding: _binding,
    ...modelMeta
  } = meta;
  return {
    glb: Buffer.from(scene.bytes),
    rebuildOptions,
    ...(materialLibraryDependencies ? { materialLibraryDependencies } : {}),
    requirements: scene.requirements,
    artifactGlbSha256: scene.artifactGlbSha256,
    tris: scene.tris,
    meta: {
      ...modelMeta,
      ...(modelCategory !== undefined ? { modelCategory } : {}),
      tris: scene.tris,
      primitiveUsage,
      ...(scene.instanceability
        ? { instanceability: scene.instanceability, tier: scene.instanceability.grade }
        : {}),
      ...(scene.metricsError ? { metricsError: scene.metricsError } : {}),
      ...(scene.optimize ? { optimize: scene.optimize } : {}),
      ...(scene.instancing ? { instancing: scene.instancing } : {}),
      gltfValidation: scene.gltfValidation,
      qaReport: scene.qaReport,
    },
    warnings: scene.warnings,
    ...(scene.diagnosticViews ? { diagnosticViews: scene.diagnosticViews } : {}),
    ...(scene.materialMetrics ? { materialMetrics: scene.materialMetrics } : {}),
    ...(scene.materialRecipeApplications
      ? { materialRecipeApplications: scene.materialRecipeApplications }
      : {}),
    ...(scene.materialResourceProvenance
      ? { materialResourceProvenance: scene.materialResourceProvenance }
      : {}),
    ...(scene.bakedTextures ? { bakedTextures: scene.bakedTextures } : {}),
    integrationManifest: scene.integrationManifest,
  };
}

export type EvaluatorMode = 'in-process' | 'subprocess' | 'isolated';

/** Resolve the trusted host evaluator flag. Unknown values fail closed. */
export function resolveEvaluatorMode(
  env: Record<string, string | undefined> = process.env,
): EvaluatorMode {
  const value = env['KILN_EVALUATOR_MODE'];
  if (value === undefined || value === '' || value === 'in-process') return 'in-process';
  if (value === 'subprocess') return 'subprocess';
  if (value === 'isolated') return 'isolated';
  throw new Error('Invalid KILN_EVALUATOR_MODE.');
}

/**
 * Execute Kiln code and serialize it to GLB.
 *
 * Subprocess containment is disabled by default and selected only by the
 * trusted host flag. A subprocess error is terminal; this boundary never
 * falls back to unsafe in-process execution.
 */
export async function renderGLB(code: string, opts: RenderGlbOptions = {}): Promise<RenderResult> {
  const mode = resolveEvaluatorMode();
  const exporter = resolveGltfExporter(opts.gltfExporter);
  if (exporter === 'three') opts = { ...opts, gltfExporter: exporter };
  if (mode === 'in-process') return renderGLBInProcess(code, opts);
  if (mode === 'subprocess') {
    const { renderGLBViaSubprocess } = await import('./evaluator/subprocess');
    return renderGLBViaSubprocess(code, opts);
  }
  const { renderGLBViaIsolatedEvaluator } = await import('./evaluator/isolation');
  return renderGLBViaIsolatedEvaluator(code, opts);
}

/**
 * Grade instanceability directly from baked GLB bytes.
 *
 * Used by consumers that hold a finished GLB but not its THREE scene — e.g.
 * Kiln Studio computing the grade web-side from the persisted artifact, so the
 * AgentCore runtime never has to (no wire bump, no runtime image rebuild). Pure
 * read: parses the GLB, walks the post-dedup document, grades. Never throws on a
 * valid GLB; returns undefined if the bytes can't be parsed.
 */
export async function gradeGlbBytes(
  bytes: Uint8Array,
  opts: { category?: string } = {},
): Promise<InstanceabilityReport | undefined> {
  try {
    const doc = await engineIO().readBinary(bytes);
    return gradeInstanceability(collectGlbMetrics(doc), opts);
  } catch {
    return undefined;
  }
}

/** Result of {@link optimizeGlbBytes}: the consolidated GLB + its re-graded report. */
export interface OptimizeGlbResult {
  /** The consolidated GLB bytes. */
  bytes: Uint8Array;
  /** Instanceability report recomputed on the optimized bytes. */
  report?: InstanceabilityReport;
  /** What the consolidation pass did (absent when only instancing applied). */
  summary?: OptimizeSummary;
  /** What the GPU-instancing pass did (absent when it was off / skipped / no-op). */
  instancing?: InstancingSummary;
  /** Official Khronos report for the exact rebaked bytes. */
  gltfValidation: KhronosGltfValidationReport;
}

/**
 * Consolidate materials in a finished GLB, working from bytes — the web-side
 * counterpart to {@link renderGLB}'s bake-time `optimize` option.
 *
 * Used by Kiln Studio: the AgentCore runtime returns an un-optimized GLB, and the
 * web tier re-bakes it here before persisting, so consolidation reaches prod with
 * NO wire bump / runtime change (the runtime never sees an `optimize` flag). Same
 * `consolidateMaterials` pass + re-grade as the render path. Pure read+write:
 * parses the GLB, transforms, re-serializes; returns `undefined` if the bytes
 * can't be parsed or the transform throws (caller keeps the original GLB).
 */
export async function optimizeGlbBytes(
  bytes: Uint8Array,
  opts: { mode?: OptimizeMode; category?: string; instance?: InstanceMode; role?: AssetRole } = {},
): Promise<OptimizeGlbResult | undefined> {
  const requested = opts.mode ?? 'palette';
  try {
    const io = engineIO();
    const doc = await io.readBinary(bytes);
    // GPU-instancing first (dedup already ran at bake; instance → palette is the
    // canonical order). Defaults OFF here — this is the web-tier re-bake seam, and
    // the caller opts in per-asset (Studio passes instance:'auto' + the record's
    // role, so only fill assets are batched — same gate as the render path).
    let instancing: InstancingSummary | undefined;
    if (opts.instance && opts.instance !== 'off') {
      instancing = await applyGpuInstancing(doc, opts.instance, opts.role);
    }
    // `auto` is grade-aware: consolidate only when palette() would act
    // (>= PALETTE_MIN materials); a no-op auto (or an explicit `off`) keeps
    // the original bytes unchanged — unless instancing acted, in which case
    // the instanced bytes are still worth persisting.
    let summary: OptimizeSummary | undefined;
    let mode: 'palette' | 'full' | undefined;
    if (requested !== 'off') {
      if (requested === 'auto') {
        if (collectGlbMetrics(doc).uniqueMaterials >= PALETTE_MIN) mode = 'palette';
      } else {
        mode = requested;
      }
    }
    if (mode) summary = await consolidateMaterials(doc, mode);
    if (!summary && !instancing) return undefined;
    ensureDefaultScene(doc);
    const outBytes = await io.writeBinary(doc);
    const gltfValidation = await assertFinalGlbValid(outBytes);
    let report: InstanceabilityReport | undefined;
    try {
      report = gradeInstanceability(collectGlbMetrics(doc), { category: opts.category });
    } catch {
      report = undefined;
    }
    return {
      bytes: outBytes,
      gltfValidation,
      ...(report ? { report } : {}),
      ...(summary ? { summary } : {}),
      ...(instancing ? { instancing } : {}),
    };
  } catch (error) {
    if (error instanceof GltfValidationError) throw error;
    return undefined;
  }
}

export interface PackKitResult {
  bytes: Uint8Array;
  summary: KitPackSummary;
  gltfValidation: KhronosGltfValidationReport;
}

/**
 * Apply the kit contract to a finished GLB, working from bytes.
 *
 * Sibling of {@link optimizeGlbBytes} and deliberately the same shape: parse,
 * transform, re-serialise, re-validate against Khronos. The runtime never sees
 * a kit flag, so this reaches production with no wire bump.
 *
 * Returns `undefined` when nothing changed or the bytes cannot be parsed, so a
 * caller keeps the original GLB rather than persisting a no-op rewrite.
 * Khronos validation failures are the one thing that throws: bytes that do not
 * validate must never be persisted, and silently returning the original would
 * hide that this pass produced an invalid file.
 */
export async function packKitGlb(
  bytes: Uint8Array,
  opts: KitPackOptions = {},
): Promise<PackKitResult | undefined> {
  let doc: Document;
  try {
    doc = await engineIO().readBinary(bytes);
  } catch {
    return undefined;
  }

  const summary = await applyKitContract(doc, opts);
  const changed = summary.ormPacked > 0 || summary.variantsAdded.length > 0 || summary.ktx2.applied;
  if (!changed) return undefined;

  ensureDefaultScene(doc);
  const outBytes = await engineIO().writeBinary(doc);
  const gltfValidation = await assertFinalGlbValid(outBytes);
  return { bytes: outBytes, summary, gltfValidation };
}

// =============================================================================
// Palette snap (scene palettes) — web-side hard snap to a user-defined palette
// =============================================================================

/** Result of {@link snapGlbToPalette}. */
export interface SnapGlbResult {
  /** The snapped + consolidated GLB bytes. */
  bytes: Uint8Array;
  /** Instanceability report recomputed on the snapped bytes. */
  report?: InstanceabilityReport;
  /** What the consolidation pass did. */
  summary: OptimizeSummary;
  /** Materials whose color was rewritten to a slot. */
  snapped: number;
  /** Materials left unchanged (textured / hero, or no eligible slot). */
  skipped: number;
  /** Official Khronos report for the exact palette-rebaked bytes. */
  gltfValidation: KhronosGltfValidationReport;
}

/**
 * Hard-snap a finished GLB's materials to a user-defined palette — the bake-time,
 * persisted counterpart of the Kiln City frontend snap. Each flat-color material's
 * base color is rewritten to the perceptually-nearest slot (OKLab, via
 * {@link chooseSlot}) and its PBR set from that slot, so a whole batch generated
 * against one palette lands on exactly those colors and collapses (after
 * `consolidateMaterials`) to ~one material per slot — "reads as one place" + a few
 * draws. Textured / hero materials are left untouched (they carry their own color).
 *
 * Pure read+write (parses GLB, rewrites, re-serializes); returns `undefined` if the
 * bytes can't be parsed or the transform throws (caller keeps the original GLB),
 * mirroring {@link optimizeGlbBytes}.
 */
export async function snapGlbToPalette(
  bytes: Uint8Array,
  slots: readonly SnapPaletteSlot[],
  opts: { category?: string } = {},
): Promise<SnapGlbResult | undefined> {
  if (slots.length === 0) return undefined;
  try {
    const io = engineIO();
    const doc = await io.readBinary(bytes);
    const before = collectGlbMetrics(doc);
    const idx = buildSlotIndex(slots as readonly SnapSlot[]);
    let snapped = 0;
    let skipped = 0;
    for (const mat of doc.getRoot().listMaterials()) {
      // Hero exception — never recolor a textured material (it carries its own color).
      if (mat.getBaseColorTexture()) {
        skipped++;
        continue;
      }
      const base = mat.getBaseColorFactor();
      const emissive = mat.getEmissiveFactor();
      const transparent = mat.getAlphaMode() === 'BLEND' || mat.getAlpha() < 0.98;
      const slotI = chooseSlot(idx, {
        baseLinear: [base[0], base[1], base[2]],
        emissiveLinear: [emissive[0], emissive[1], emissive[2]],
        transparent,
      });
      if (slotI === undefined) {
        skipped++;
        continue;
      }
      const slot = slots[slotI]!;
      const kind = slot.kind ?? 'opaque';
      const [lr, lg, lb] = hexToLinearRgb(slot.color);
      const alpha = kind === 'glass' ? (slot.opacity ?? 0.4) : 1;
      mat.setBaseColorFactor([lr, lg, lb, alpha]);
      mat.setMetallicFactor(slot.metalness ?? 0);
      mat.setRoughnessFactor(slot.roughness ?? (kind === 'glass' ? 0.1 : 0.85));
      if (kind === 'glass') mat.setAlphaMode('BLEND');
      else if (mat.getAlphaMode() === 'BLEND') mat.setAlphaMode('OPAQUE');
      // Glow keeps a "lit" look by emitting its slot color; clear stray emissive otherwise.
      mat.setEmissiveFactor(kind === 'glow' ? [lr, lg, lb] : [0, 0, 0]);
      snapped++;
    }
    // Snapping made many materials value-identical — dedup merges those objects first
    // (palette() alone keeps distinct objects), then consolidate collapses further.
    await doc.transform(dedup());
    await consolidateMaterials(doc, 'palette');
    // Summary spans the WHOLE snap (original → final), not just the consolidation sub-step,
    // so provenance shows the true material collapse (e.g. 14 → 4).
    const after = collectGlbMetrics(doc);
    const summary: OptimizeSummary = {
      mode: 'palette',
      materialsBefore: before.uniqueMaterials,
      materialsAfter: after.uniqueMaterials,
      drawsBefore: before.drawCalls,
      drawsAfter: after.drawCalls,
    };
    ensureDefaultScene(doc);
    const outBytes = await io.writeBinary(doc);
    const gltfValidation = await assertFinalGlbValid(outBytes);
    let report: InstanceabilityReport | undefined;
    try {
      report = gradeInstanceability(after, { category: opts.category });
    } catch {
      report = undefined;
    }
    return {
      bytes: outBytes,
      ...(report ? { report } : {}),
      summary,
      snapped,
      skipped,
      gltfValidation,
    };
  } catch (error) {
    if (error instanceof GltfValidationError) throw error;
    return undefined;
  }
}

// =============================================================================
// Scene composition — merge N placed GLBs into one scene GLB (export)
// =============================================================================

/** One placed asset to compose into the scene: its GLB bytes + a world transform. */
export interface SceneComposePart {
  bytes: Uint8Array;
  transform: {
    /** World position [x, y, z], engine frame (+X fwd, +Y up, ground Y=0), meters. */
    pos: [number, number, number];
    /** Euler rotation in DEGREES, XYZ order (the Kiln/Placement convention). */
    rotDeg: [number, number, number];
    /** Per-axis scale. */
    scale: [number, number, number];
  };
  /** Wrapper node name (e.g. an instanceId) — a debug aid in the exported file. */
  name?: string;
}

export interface SceneComposeOptions {
  /** glTF scene name. Default 'Scene'. */
  sceneName?: string;
  /** Material consolidation across the merged scene. Default 'palette' (a few draws). */
  optimize?: OptimizeMode;
  /** Keep each asset's animation clips. Default false (static dressing). */
  keepAnimations?: boolean;
  /** Retained clip names: preserve source names (default), or disambiguate by placement and clip index. */
  animationNaming?: 'preserve' | 'instance';
}

export interface SceneComposeResult {
  /** The composed scene GLB bytes. */
  bytes: Uint8Array;
  tris: number;
  /** Draw calls in the composed scene (post-optimize). */
  draws: number;
  /** Distinct materials in the composed scene (post-optimize). */
  materials: number;
  /** Per-part skip notes + transform warnings (never throws on one bad part). */
  warnings: string[];
  /** Official Khronos report for the exact composed bytes. */
  gltfValidation: KhronosGltfValidationReport;
}

/** Euler degrees (XYZ) → a glTF quaternion [x, y, z, w] via THREE (the viewer's frame). */
function eulerDegToQuat(deg: [number, number, number]): [number, number, number, number] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(deg[0]),
    THREE.MathUtils.degToRad(deg[1]),
    THREE.MathUtils.degToRad(deg[2]),
    'XYZ',
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

/**
 * Compose N placed GLBs into a single scene GLB — the Scenes-page export primitive.
 *
 * Pure gltf-transform (no THREE GLTFLoader, whose texture path is browser-DOM-bound):
 * each part's bytes are read into a Document, `mergeDocuments` copies its graph into a
 * master Document (textures copied as bytes, lossless), and its scene roots are
 * reparented under a fresh transform node carrying the placement's TRS. One merge per
 * placement (a Node can't have two parents); a final `dedup()` collapses repeated
 * blueprints (e.g. 30 identical fence posts) and `consolidateMaterials` keeps the
 * export to a few draws. A corrupt/unreadable part becomes a warning and is skipped,
 * never failing the whole export.
 *
 * Runs under Bun in the web tier (same WebIO read→transform→write path as
 * {@link optimizeGlbBytes}). Pure: no fs / globals / WebGL.
 */
export async function composeSceneGLB(
  parts: readonly SceneComposePart[],
  opts: SceneComposeOptions = {},
): Promise<SceneComposeResult> {
  const warnings: string[] = [];
  // engineIO so a part that carries EXT_mesh_gpu_instancing keeps its batches
  // through the merge (mergeDocuments copies the extension onto the master).
  const io = engineIO();
  const master = new Document();
  const masterScene = master.createScene(opts.sceneName ?? 'Scene');
  master.getRoot().setDefaultScene(masterScene);
  let composed = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    try {
      const src = await io.readBinary(part.bytes);
      if (opts.keepAnimations && opts.animationNaming === 'instance') {
        for (const [clipIndex, animation] of src.getRoot().listAnimations().entries()) {
          animation.setName(
            `${i}:${part.name ?? 'part'}/${clipIndex}:${animation.getName() || 'clip'}`,
          );
        }
      }
      const srcScene = src.getRoot().listScenes()[0];
      const map = mergeDocuments(master, src);
      const wrap = master
        .createNode(part.name ?? `part_${i}`)
        .setTranslation([part.transform.pos[0], part.transform.pos[1], part.transform.pos[2]])
        .setRotation(eulerDegToQuat(part.transform.rotDeg))
        .setScale([part.transform.scale[0], part.transform.scale[1], part.transform.scale[2]]);
      const mergedScene = srcScene ? (map.get(srcScene) as GtScene | undefined) : undefined;
      if (mergedScene) {
        for (const child of mergedScene.listChildren()) wrap.addChild(child);
        mergedScene.dispose();
      }
      masterScene.addChild(wrap);
      composed++;
    } catch (err) {
      warnings.push(
        `part ${i} (${part.name ?? ''}) skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (composed === 0) throw new Error('composeSceneGLB: no parts could be merged');

  // Static dressing has no shared timeline — drop per-asset clips unless asked to keep.
  if (!opts.keepAnimations) {
    for (const anim of master.getRoot().listAnimations()) anim.dispose();
  }

  try {
    await master.transform(dedup());
  } catch (err) {
    warnings.push(`dedup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const optimizeMode: OptimizeMode = opts.optimize ?? 'palette';
  let effectiveOptimize: 'off' | 'palette' | 'full' =
    optimizeMode === 'auto' ? 'off' : optimizeMode;
  if (optimizeMode === 'auto' && collectGlbMetrics(master).uniqueMaterials >= PALETTE_MIN) {
    effectiveOptimize = 'palette';
  }
  if (effectiveOptimize !== 'off') {
    try {
      await consolidateMaterials(master, effectiveOptimize);
    } catch (err) {
      warnings.push(
        `optimize (${effectiveOptimize}) failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // mergeDocuments brings each source's Buffer across, but a GLB allows ≤1 buffer.
  // Reassign every accessor to the first buffer and drop the rest.
  const rootBuffers = master.getRoot().listBuffers();
  if (rootBuffers.length > 1) {
    const main = rootBuffers[0]!;
    for (const acc of master.getRoot().listAccessors()) acc.setBuffer(main);
    for (let i = 1; i < rootBuffers.length; i++) rootBuffers[i]!.dispose();
  }

  const metrics = collectGlbMetrics(master);
  ensureDefaultScene(master);
  const bytes = await io.writeBinary(master);
  const gltfValidation = await assertFinalGlbValid(bytes, 'scene.glb');
  for (const issue of gltfValidation.issues.messages) {
    if (issue.severity !== 1) continue;
    warnings.push(
      `glTF ${issue.code}${issue.pointer ? ` at ${issue.pointer}` : ''}: ${issue.message}`,
    );
  }
  return {
    bytes,
    tris: metrics.triangles,
    draws: metrics.drawCalls,
    materials: metrics.uniqueMaterials,
    warnings,
    gltfValidation,
  };
}

// =============================================================================
// Runtime-aware animation inspection
// =============================================================================

/**
 * Walk a Kiln-executed scene graph and its animation clips, and surface any
 * track whose target (e.g. `Joint_LeftWheel.rotation`) doesn't resolve to a
 * named node in the scene. These are *warnings*, not errors — the GLB still
 * renders fine, the track just does nothing. Agents iterating on generated
 * code use this signal to pick a real joint name on the next pass.
 *
 * Pure, side-effect free, safe to call without rendering.
 */
export function inspectGeneratedAnimation(
  root: THREE.Object3D,
  clips: THREE.AnimationClip[],
): string[] {
  const warnings: string[] = [];
  if (clips.length === 0) return warnings;

  const nodeNames = new Set<string>();
  root.traverse((obj) => {
    if (obj.name) nodeNames.add(obj.name);
  });

  for (const clip of clips) {
    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      if (dotIdx === -1) {
        warnings.push(`Track "${track.name}" is missing a node.property separator`);
        continue;
      }
      const nodeName = track.name.substring(0, dotIdx);
      const property = track.name.substring(dotIdx + 1);

      if (!nodeNames.has(nodeName)) {
        warnings.push(
          `Animation track "${clip.name}:${track.name}" targets unknown node "${nodeName}" — rename the pivot or fix the track`,
        );
      }

      if (!['position', 'quaternion', 'scale'].includes(property)) {
        warnings.push(
          `Animation track "${clip.name}:${track.name}" uses unsupported property "${property}"`,
        );
      }
    }
  }

  return warnings;
}

// =============================================================================
// Runtime structural validators (stray planes, floating parts)
// =============================================================================

interface MeshStats {
  name: string;
  triCount: number;
  isPlaneGeo: boolean;
  center: THREE.Vector3;
  size: THREE.Vector3;
  box: THREE.Box3;
}

function collectMeshStats(root: THREE.Object3D): MeshStats[] {
  root.updateMatrixWorld(true);
  const out: MeshStats[] = [];
  root.traverse((obj) => {
    if (!(obj as { isMesh?: boolean }).isMesh) return;
    const meshObj = obj as THREE.Mesh;
    const geo = meshObj.geometry;
    if (!geo) return;

    const idx = geo.getIndex();
    const tri = idx ? idx.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;

    const box = new THREE.Box3().setFromObject(obj);
    if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) {
      return;
    }
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    out.push({
      name: obj.name || '(unnamed)',
      triCount: Math.floor(tri),
      isPlaneGeo: geo.type === 'PlaneGeometry',
      center,
      size,
      box,
    });
  });
  return out;
}

/**
 * Detects two structural failure modes observed in real overnight runs:
 *
 * 1. **Stray plane at origin** — a 2-triangle `PlaneGeometry` mesh whose
 *    world-space bbox centroid sits within 2cm of world origin. This is
 *    what happens when the model reaches for `planeGeo` as a decal (red
 *    star, stamp, hull number) and forgets to position it on the host
 *    surface. Fix: move the decal into place, or switch to `decalBox`.
 * 2. **Floating part** — a mesh whose world-space bbox has no overlap
 *    (with a 2cm tolerance) with any other mesh in the scene. Fix: move
 *    the mesh so it contacts its intended parent surface.
 *
 * Emits strings compatible with the existing `warnings` channel on
 * `RenderResult`. `_direct-generate.ts` threshold-checks these to trigger
 * a single corrective retry.
 *
 * Floating-part warnings carry an actionable fix: the minimal world-space
 * shift that brings the floater into contact with its nearest sibling (or the
 * `snapTo(part, host)` call that applies it).
 *
 * Pass `opts.category` (vehicle / weapon / boat / aircraft) to additionally
 * run the orientation advisory: kiln assets face +X, so a vehicle whose Z
 * extent dominates its X extent was probably built sideways. Aircraft skip
 * the Z check (wingspan legitimately dominates) and check Y instead.
 */
export interface InspectStructureOptions {
  /** Asset kind for the orientation advisory. Omit to skip it. */
  category?: 'vehicle' | 'weapon' | 'boat' | 'aircraft' | (string & {});
}

/** Minimal world-space translation that closes the gap between two boxes
 *  (zero on axes that already overlap). */
function minimalGapVector(a: THREE.Box3, b: THREE.Box3): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (const axis of ['x', 'y', 'z'] as const) {
    if (a.min[axis] > b.max[axis]) v[axis] = b.max[axis] - a.min[axis];
    else if (a.max[axis] < b.min[axis]) v[axis] = b.min[axis] - a.max[axis];
    else v[axis] = 0;
  }
  return v;
}

export function inspectSceneStructure(
  root: THREE.Object3D,
  opts: InspectStructureOptions = {},
): string[] {
  const warnings: string[] = [];
  const meshes = collectMeshStats(root);
  if (meshes.length === 0) return warnings;

  // Orientation advisory (category-aware; runs even for single-mesh scenes).
  const cat = opts.category?.toLowerCase();
  if (cat === 'vehicle' || cat === 'weapon' || cat === 'boat' || cat === 'aircraft') {
    const all = new THREE.Box3();
    for (const m of meshes) all.union(m.box);
    const size = new THREE.Vector3();
    all.getSize(size);
    if (cat === 'aircraft') {
      if (size.y > size.x * 1.2) {
        warnings.push(
          `Orientation: this aircraft is ${size.y.toFixed(2)} tall but only ${size.x.toFixed(2)} long along +X (the nose axis). Kiln aircraft fly nose-first along +X — it may be built vertically or sideways.`,
        );
      }
    } else if (size.z > size.x * 1.3) {
      warnings.push(
        `Orientation: this ${cat} spans ${size.z.toFixed(2)} along Z but only ${size.x.toFixed(2)} along +X. Kiln ${cat}s face +X (forward/muzzle/bow) — it looks built sideways; rebuild the long axis along X.`,
      );
    }
  }

  const STRAY_CENTROID_TOL = 0.02;
  const FLOATING_EXPAND = 0.02;
  const DECAL_EXTENT_MAX = 0.5; // anything smaller than 50cm fits decal profile

  for (const m of meshes) {
    if (!m.isPlaneGeo) continue;
    if (m.triCount > 2) continue;
    if (m.size.length() > DECAL_EXTENT_MAX) continue;
    if (m.center.length() < STRAY_CENTROID_TOL) {
      warnings.push(
        `Stray plane "${m.name}" at world origin (centroid ≈ [0,0,0]). Replace planeGeo with decalBox and position on a host surface, or move this mesh into place.`,
      );
    }
  }

  if (meshes.length > 1) {
    const floaters: string[] = [];
    for (let i = 0; i < meshes.length; i++) {
      const a = meshes[i]!;
      const ax = a.box.clone().expandByScalar(FLOATING_EXPAND);
      let overlapsAny = false;
      for (let j = 0; j < meshes.length; j++) {
        if (i === j) continue;
        const b = meshes[j]!;
        if (ax.intersectsBox(b.box)) {
          overlapsAny = true;
          break;
        }
      }
      if (overlapsAny) continue;

      // Actionable fix: the minimal shift to the NEAREST sibling, plus the
      // snapTo call that applies it.
      let nearest: MeshStats | undefined;
      let nearestGap: THREE.Vector3 | undefined;
      for (let j = 0; j < meshes.length; j++) {
        if (i === j) continue;
        const gap = minimalGapVector(a.box, meshes[j]!.box);
        if (!nearestGap || gap.length() < nearestGap.length()) {
          nearest = meshes[j]!;
          nearestGap = gap;
        }
      }
      const fix =
        nearest && nearestGap
          ? ` Fix: shift "${a.name}" by [${nearestGap.x.toFixed(3)}, ${nearestGap.y.toFixed(3)}, ${nearestGap.z.toFixed(3)}] toward "${nearest.name}", or call snapTo(part, hostPart) to do it automatically.`
          : '';
      floaters.push(`${a.name}${fix ? ` —${fix}` : ''}`);
    }
    if (floaters.length > 0) {
      warnings.push(
        `Floating parts (no mesh overlap with any sibling, 2cm tol): ${floaters.join(' | ')}`,
      );
    }
  }

  return warnings;
}

/**
 * OPT-IN geometry settle: translate each floating mesh into contact with its
 * nearest sibling, but only when the gap is small (≤ `maxGap`). Deliberately
 * NOT applied inside kiln_render or renderGLB — silently mutating geometry
 * would desync the code from the artifact and poison refine loops. The batch
 * harness uses it after a soft-retry still warns, and records the settled part
 * names in provenance so the mutation is visible.
 *
 * Returns the names of the parts that were moved.
 */
export function settleContacts(
  root: THREE.Object3D,
  opts: { maxGap?: number; overlap?: number } = {},
): string[] {
  const maxGap = opts.maxGap ?? 0.05;
  const overlap = opts.overlap ?? 0.01;
  const settled: string[] = [];

  // One move per pass, then re-collect: moving a part changes every other
  // part's floating status (with two meshes BOTH read as floaters — moving
  // either resolves both). Among the settleable floaters, move the smallest
  // (it's the attachment, not the hull).
  for (let pass = 0; pass < 8; pass++) {
    const meshes = collectMeshStats(root);
    if (meshes.length < 2) return settled;

    let pick: { stats: MeshStats; gap: THREE.Vector3; volume: number } | undefined;
    for (let i = 0; i < meshes.length; i++) {
      const a = meshes[i]!;
      const ax = a.box.clone().expandByScalar(0.02);
      if (meshes.some((b, j) => j !== i && ax.intersectsBox(b.box))) continue;

      let nearestGap: THREE.Vector3 | undefined;
      for (let j = 0; j < meshes.length; j++) {
        if (i === j) continue;
        const gap = minimalGapVector(a.box, meshes[j]!.box);
        if (!nearestGap || gap.length() < nearestGap.length()) nearestGap = gap;
      }
      if (!nearestGap || nearestGap.length() === 0 || nearestGap.length() > maxGap) continue;

      const volume = a.size.x * a.size.y * a.size.z;
      if (!pick || volume < pick.volume) pick = { stats: a, gap: nearestGap, volume };
    }
    if (!pick) break;

    // Close the gap plus a small overlap along the dominant gap axis.
    const delta = pick.gap.clone();
    const dominant = (['x', 'y', 'z'] as const).reduce(
      (d, axis) => (Math.abs(delta[axis]) > Math.abs(delta[d]) ? axis : d),
      'x' as 'x' | 'y' | 'z',
    );
    delta[dominant] += Math.sign(delta[dominant]) * overlap;

    // Find the named object and move it, converting the world delta into the
    // parent's local space (handles rotated/scaled ancestors).
    let target: THREE.Object3D | undefined;
    root.traverse((obj) => {
      if (!target && obj.name === pick!.stats.name && (obj as { isMesh?: boolean }).isMesh)
        target = obj;
    });
    if (!target) break;
    const parent = target.parent ?? root;
    const p0 = new THREE.Vector3();
    target.getWorldPosition(p0);
    const p1 = p0.clone().add(delta);
    const l0 = parent.worldToLocal(p0.clone());
    const l1 = parent.worldToLocal(p1.clone());
    target.position.add(l1.sub(l0));
    target.updateMatrixWorld(true);
    settled.push(pick.stats.name);
  }
  return settled;
}
