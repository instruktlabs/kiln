import { enforceCapturePixels, enforceCaptureBytes, type CaptureLimits } from './capture-limits';
import { DEFAULT_BACKDROP_ID } from './background';
export { DEFAULT_CAPTURE_LIMITS, resolveCaptureLimits } from './capture-limits';
export type { CaptureLimits } from './capture-limits';
import { captureCpuCell, type CaptureCache } from './capture-cache';
export * from './capture-cache';
import {
  rasterizeCamera,
  cameraFromBounds,
  resolveAssetCamera,
  selectCameraSubject,
  withCameraVisibility,
  type CameraShotV1,
  type ResolvedCameraShotV1,
  type ResolvedAssetCameraV1,
} from './camera';
import { renderCaptureGrid } from './camera-capture';
export * from './camera';
export * from './camera-capture';
/**
 * Six-view grid rendering for the Kiln vision loop.
 *
 * Renders a scene (or a Kiln program) to a 3x2 grid PNG of orthographic
 * views — Front / Right / Back / Left | Top / 3-4 — using the pure-CPU
 * rasterizer in ./raster.ts. This is what the agent sees via the
 * kiln_screenshot tool and what ships as the views.png artifact.
 *
 * Grid order (H-30: now ALSO stamped into each cell as a label + axis gnomon,
 * matching the animation/interior grids — grid-confusion literature shows
 * text-only layout descriptions silently fail):
 *   row 1: Front, Right, Back
 *   row 2: Left,  Top,   3/4
 */

import {
  rasterizeView,
  measureBounds,
  measurePartBounds,
  hideNodeInScene,
  type RasterOptions,
  type ViewSpec,
} from './raster';
import { encodePng } from './png';
import { decodePng } from './png';
import { compositeCellGrid } from './grid';
import { annotateViewCell } from './annotate';
import { resolveGridCapture, type CaptureConfig, type CaptureShape } from './capture';
import {
  prepareClip,
  measureLoopClosure,
  poseSceneAtTime,
  planFrameTimes,
  findClip,
  clipNames,
  stampLabel,
  type DuckClip,
} from './pose';
import { hideArchitectureRoofInScene } from './architecture';
import {
  buildSlotIndex,
  chooseSlot,
  hexToLinearRgb,
  type SnapPaletteSlot,
  type Vec3,
} from '../palette-snap';
import { loadGlbGeometryFlatScene, type GlbGeometryFlatReasonCode } from './glb';
import {
  resolveEvaluatorPortV2,
  type EvaluatorExecutionProfileV2,
  type EvaluatorPortV2,
} from '../evaluator';

export {
  rasterizeView,
  measureBounds,
  hideNodeInScene,
  SIX_VIEWS,
  SIX_VIEWS_REAR_QUARTER,
  resolveGridViews,
  coverage,
  orbitDir,
  orbitAnglesOf,
  MIN_ELEVATION_DEG,
  MAX_ELEVATION_DEG,
} from './raster';
export type { RasterOptions, ViewSpec, ViewGridVariant } from './raster';
export { annotateViewCell, stampAxisGnomon } from './annotate';
export {
  BACKDROPS,
  BACKDROP_IDS,
  DEFAULT_BACKDROP_ID,
  GRID_BACKGROUND_HEX,
  GRID_BACKGROUND_RGB,
  isBackdropId,
  resolveBackdrop,
} from './background';
export type { Backdrop, BackdropId } from './background';
export { encodePng, decodePng } from './png';
export type { DecodedPng } from './png';
export {
  CAPTURE_PRESETS,
  CaptureConfigError,
  DEFAULT_CAPTURE_PRESET,
  MAX_CAPTURE_CELLS,
  captureCellLabel,
  describeCapture,
  resolveCapture,
  resolveGridCapture,
} from './capture';
export type {
  CaptureCell,
  CaptureConfig,
  CapturePreset,
  CaptureShape,
  ResolvedCapture,
} from './capture';
export { compositeCellGrid, compositeViewPngGrid, GRID_COLS } from './grid';
export { ViewEvidenceHistoryStore } from './evidence-history';
export type { ComposedCellGrid, ComposedPngGrid } from './grid';
export { CPU_RASTER_RENDERER_ID } from './renderer-id';
export {
  GLB_GEOMETRY_FLAT_REASON,
  GlbGeometryFlatError,
  geometryFlatTextureReasonCode,
  loadGlbGeometryFlatScene,
  loadGlbReviewScene,
} from './glb';
export type {
  GlbGeometryFlatErrorCode,
  GlbGeometryFlatReasonCode,
  GlbGeometryFlatRoot,
  LoadedGlbGeometryFlatScene,
  LoadedGlbReviewScene,
} from './glb';
export {
  ARCHITECTURE_ROOF_ROLE_PREFIXES,
  hasArchitectureRoofRole,
  hideArchitectureRoofInScene,
  selectArchitectureRoofNodes,
} from './architecture';
export type {
  ArchitectureRoofSelection,
  ArchitectureRoofSelectionMode,
  ArchitectureViewNode,
} from './architecture';
export { rasterizeComposedScene, SCENE_VIEWS } from './scene-raster';
export type { ComposedPart, ComposedSceneRasterResult } from './scene-raster';
export {
  GENERIC_DIAGNOSTIC_BUFFER_IDS,
  GENERIC_DIAGNOSTIC_CAMERAS,
  GENERIC_DIAGNOSTIC_REQUESTS,
  planDiagnosticViews,
  renderDiagnosticView,
  renderDiagnosticViews,
} from './diagnostic';
export {
  CHARACTER_MOTION_DIAGNOSTIC_PHASES,
  buildCharacterDiagnosticDescriptor,
  planCharacterDiagnosticRequests,
} from './character';
export type {
  CharacterDiagnosticDescriptorV1,
  CharacterDiagnosticEdgeV1,
  CharacterDiagnosticJointV1,
  CharacterDiagnosticRequestV1,
} from './character';
export {
  captureVehicleDiagnosticViews,
  createVehicleDiagnosticOverlay,
  describeVehicleDiagnostics,
} from './vehicle';
export type {
  VehicleCapturedDiagnosticV1,
  VehicleDiagnosticAxleV1,
  VehicleDiagnosticDescriptorV1,
  VehicleDiagnosticViewV1,
  VehicleDiagnosticWheelV1,
} from './vehicle';
export type {
  CategoryDiagnosticVariant,
  DiagnosticCameraSpec,
  DiagnosticOverlayRegion,
  DiagnosticRenderOptions,
  DiagnosticViewFrame,
  DiagnosticViewPlanV1,
  DiagnosticViewRequest,
  GenericDiagnosticBufferId,
} from './diagnostic';
export {
  prepareClip,
  poseSceneAtTime,
  planFrameTimes,
  findClip,
  clipNames,
  type DuckClip,
  type PreparedClip,
} from './pose';

interface DuckColor {
  r: number;
  g: number;
  b: number;
}

interface DuckMaterial {
  color?: DuckColor;
  emissive?: DuckColor;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  map?: unknown;
  vertexColors?: boolean;
}

interface DuckMesh {
  isMesh?: boolean;
  material?: DuckMaterial | DuckMaterial[];
}

interface DuckObject3D {
  traverse?: (cb: (obj: DuckMesh) => void) => void;
}

export interface ScenePaletteSnapResult {
  snapped: number;
  skipped: number;
}

function setLinearColor(color: DuckColor | undefined, rgb: Vec3): void {
  if (!color) return;
  color.r = rgb[0];
  color.g = rgb[1];
  color.b = rgb[2];
}

function snapMaterialToPalette(
  mat: DuckMaterial,
  slots: readonly SnapPaletteSlot[],
  idx: ReturnType<typeof buildSlotIndex>,
): boolean | undefined {
  if (!mat.color) return undefined;
  if (mat.map || mat.vertexColors) return false;

  const emissive =
    mat.emissive && (mat.emissiveIntensity ?? 1) > 0
      ? ([
          mat.emissive.r * (mat.emissiveIntensity ?? 1),
          mat.emissive.g * (mat.emissiveIntensity ?? 1),
          mat.emissive.b * (mat.emissiveIntensity ?? 1),
        ] as Vec3)
      : undefined;
  const slotI = chooseSlot(idx, {
    baseLinear: [mat.color.r, mat.color.g, mat.color.b],
    ...(emissive ? { emissiveLinear: emissive } : {}),
    transparent: mat.transparent === true || (mat.opacity !== undefined && mat.opacity < 0.98),
  });
  if (slotI === undefined) return false;

  const slot = slots[slotI]!;
  const kind = slot.kind ?? 'opaque';
  const rgb = hexToLinearRgb(slot.color);
  setLinearColor(mat.color, rgb);
  if (mat.metalness !== undefined) mat.metalness = slot.metalness ?? 0;
  if (mat.roughness !== undefined)
    mat.roughness = slot.roughness ?? (kind === 'glass' ? 0.1 : 0.85);

  if (kind === 'glass') {
    mat.transparent = true;
    mat.opacity = slot.opacity ?? 0.4;
  } else {
    if (mat.transparent !== undefined) mat.transparent = false;
    if (mat.opacity !== undefined) mat.opacity = 1;
  }

  if (mat.emissive) {
    if (kind === 'glow') {
      setLinearColor(mat.emissive, rgb);
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 1, 1);
    } else {
      setLinearColor(mat.emissive, [0, 0, 0]);
      if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
    }
  }
  return true;
}

/** Snap flat-color scene materials to a palette before CPU preview rasterization. */
export function snapSceneToPalette(
  root: unknown,
  slots: readonly SnapPaletteSlot[],
): ScenePaletteSnapResult {
  if (slots.length === 0) return { snapped: 0, skipped: 0 };
  const traverse = (root as DuckObject3D | undefined)?.traverse;
  if (!traverse) return { snapped: 0, skipped: 0 };

  const idx = buildSlotIndex(slots);
  let snapped = 0;
  let skipped = 0;
  traverse.call(root, (obj: DuckMesh) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      const didSnap = snapMaterialToPalette(mat, slots, idx);
      if (didSnap === true) snapped++;
      else if (didSnap === false) skipped++;
    }
  });
  return { snapped, skipped };
}

export interface ViewGridResult {
  captureCache?: { hit: boolean; reused: number; total: number };
  png: Buffer;
  width: number;
  height: number;
  /** View names in grid order (row-major). */
  views: string[];
  /** Grid shape actually rendered by the model-facing contact sheet — the
   *  default reports `3x2`. Absent on the fixed diagnostic layouts (interior
   *  cutaway, animation strip), which have their own row shape and would have
   *  to invent a preset name to report one. */
  capture?: CaptureShape;
}

export interface ViewGridOptions extends RasterOptions {
  captureLimits?: CaptureLimits;
  captureCache?: CaptureCache;
  /** Exact GLB identity, supplied automatically by renderGlbViewGrid. */
  artifactGlbSha256?: `sha256:${string}`;
  views?: ViewSpec[];
  /** Snap flat-color materials before rasterization. Mutates the provided scene root. */
  snapPalette?: readonly SnapPaletteSlot[];
  /** Model-chosen grid shape and cameras. Omit for the shipped 3x2 contact sheet.
   *  Ignored when `views` is passed explicitly (internal callers win). */
  capture?: CaptureConfig;
  /** Column count override. Defaults to the capture preset's columns. */
  cols?: number;
}

/** Render a (possibly sandbox-created) Three.js scene root into the 3x2 grid. */
export async function renderViewGrid(
  root: unknown,
  opts: ViewGridOptions = {},
): Promise<ViewGridResult> {
  // H-31: 384px cells (was 256). Measured input-image cost of the full grid:
  // Anthropic ~w*h/750 tokens => 1168x780 ≈ 1,215 tok (vs 784x524 ≈ 548) —
  // negligible against 32-64K reasoning budgets; 512 would double it again for
  // marginal legibility gain at typical asset scales. Candidate thumbnails
  // downscale separately (Studio thumbnailFor), unaffected.
  if (opts.capture?.shots || opts.capture?.version)
    return renderCaptureGrid(root, opts.capture, undefined, opts.captureLimits);
  const size = opts.size ?? 384;
  // H-33: the default view set is env-selectable (KILN_GRID_VARIANT=rear-quarter
  // swaps the 3/4 cell to the opposite-rear azimuth) so a bench arm can flip the
  // grid per-process without any wire or tool-schema change. Explicit opts.views
  // always wins; unset/unknown env keeps SIX_VIEWS.
  //
  // T3.2: `capture` lets the model pick the grid shape and per-cell cameras.
  // The env variant and an explicit `views` both still win, in that order of
  // specificity, so no internal caller changes behavior. With `capture`
  // omitted this resolves to SIX_VIEWS at 3 columns — the previous constants.
  const resolved = resolveGridCapture(opts.capture, process.env['KILN_GRID_VARIANT']);
  const views = opts.views ?? resolved.views;
  const cols = opts.cols ?? resolved.cols;
  enforceCapturePixels(views.length, size, cols, opts.captureLimits);
  if (opts.snapPalette?.length) snapSceneToPalette(root, opts.snapPalette);

  // Per-cell zoom needs a shared frame box; measuring is only worth it when a
  // zoom was actually requested. Passing frameBounds unconditionally would
  // route every render through a different framing path than before and break
  // the byte-identity guarantee for the default grid.
  const wantsZoom = resolved.zooms.some((z) => z !== undefined);
  const sceneBounds = wantsZoom ? measureBounds(root) : undefined;
  // An explicit raster option wins over the capture's backdrop, matching how
  // `views`/`cols` already treat internal callers; both default to neutral.
  const backdrop = opts.backdrop ?? resolved.backdrop;

  const cache = opts.snapPalette?.length ? undefined : opts.captureCache;
  let reused = 0;
  const cells: Uint8Array[] = [];
  for (let vi = 0; vi < views.length; vi++) {
    const zoom = resolved.zooms[vi];
    const rasterOptions = {
      size,
      backfaceCull: opts.backfaceCull,
      backdrop,
      ...(opts.frameBounds ? { frameBounds: opts.frameBounds } : {}),
      ...(sceneBounds && zoom !== undefined
        ? { frameBounds: expandFrameBounds(sceneBounds, zoom) }
        : {}),
    };
    let cell: Uint8Array;
    if (cache && opts.artifactGlbSha256) {
      const { CPU_RASTER_RENDERER_ID } = await import('./renderer-id');
      const camera = cameraFromBounds(
        rasterOptions.frameBounds ?? measureBounds(root),
        views[vi]!.dir,
      );
      const result = await captureCpuCell(
        cache,
        {
          artifactGlbSha256: opts.artifactGlbSha256,
          rendererId: `${CPU_RASTER_RENDERER_ID}/legacy-fit`,
          camera,
          size,
          backfaceCull: opts.backfaceCull ?? true,
          backdrop,
        },
        async () => ({
          png: encodePng(rasterizeView(root, views[vi]!.dir, rasterOptions), size, size),
          width: size,
          height: size,
          inputGlbSha256: opts.artifactGlbSha256!,
          reasonCodes: [],
          meshCount: 0,
          instanceCount: 0,
        }),
      );
      if (result.captureCache?.hit) reused++;
      cell = decodePng(result.png).rgb;
    } else cell = rasterizeView(root, views[vi]!.dir, rasterOptions);
    // H-30: view name + axis gnomon, via the annotator the GPU port shares.
    annotateViewCell(cell, size, views[vi]!);
    cells.push(cell);
  }
  const { rgb, width, height } = compositeCellGrid(cells, size, cols);

  const png = encodePng(rgb, width, height);
  enforceCaptureBytes([png], opts.captureLimits);
  return {
    png,
    width,
    height,
    views: views.map((v) => v.name),
    capture: { preset: resolved.preset, cols, cells: views.length, backdrop },
    ...(cache && opts.artifactGlbSha256
      ? { captureCache: { hit: reused === views.length, reused, total: views.length } }
      : {}),
  };
}

export interface GlbViewGridResult extends ViewGridResult {
  /** Identity of the exact byte array parsed for this fallback. */
  inputGlbSha256: `sha256:${string}`;
  /** Stable limitations of geometry-flat rendering for this artifact. */
  reasonCodes: GlbGeometryFlatReasonCode[];
  meshCount: number;
  instanceCount: number;
}

async function hashGlbViewInput(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const copy = Uint8Array.from(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy));
  return `sha256:${[...digest].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export interface GlbViewCellResult {
  png: Buffer;
  width: number;
  height: number;
  inputGlbSha256: `sha256:${string}`;
  reasonCodes: GlbGeometryFlatReasonCode[];
  meshCount: number;
  instanceCount: number;
}

/** Render one unannotated geometry-flat cell from an immutable GLB snapshot. */
export async function renderGlbViewCell(
  bytes: Uint8Array,
  view: ViewSpec,
  options: RasterOptions & { camera?: ResolvedAssetCameraV1 } = {},
): Promise<GlbViewCellResult> {
  const exactBytes = Uint8Array.from(bytes);
  const loaded = await loadGlbGeometryFlatScene(exactBytes);
  const size = options.size ?? 256;
  const rgb = options.camera
    ? rasterizeCamera(loaded.root, options.camera, size, options.backfaceCull, options.backdrop)
    : rasterizeView(loaded.root, view.dir, {
        size,
        ...(options.backdrop ? { backdrop: options.backdrop } : {}),
        ...(options.backfaceCull !== undefined ? { backfaceCull: options.backfaceCull } : {}),
        ...(options.frameBounds ? { frameBounds: options.frameBounds } : {}),
      });
  return {
    png: encodePng(rgb, size, size),
    width: size,
    height: size,
    inputGlbSha256: await hashGlbViewInput(exactBytes),
    reasonCodes: loaded.reasonCodes,
    meshCount: loaded.meshCount,
    instanceCount: loaded.instanceCount,
  };
}

/** Render the geometry-flat contact sheet from exact final GLB bytes. */
export async function renderGlbViewGrid(
  bytes: Uint8Array,
  options: ViewGridOptions = {},
): Promise<GlbViewGridResult> {
  // One immutable snapshot owns both parsing and identity. Even a caller that
  // mutates its Buffer while this async render is running cannot make the
  // rasterized geometry and reported hash refer to different byte sequences.
  const exactBytes = Uint8Array.from(bytes);
  const loaded = await loadGlbGeometryFlatScene(exactBytes);
  const artifactGlbSha256 = await hashGlbViewInput(exactBytes);
  const grid = await renderViewGrid(loaded.root, { ...options, artifactGlbSha256 });
  return {
    ...grid,
    inputGlbSha256: await hashGlbViewInput(exactBytes),
    reasonCodes: loaded.reasonCodes,
    meshCount: loaded.meshCount,
    instanceCount: loaded.instanceCount,
  };
}

/** Grow a bounds box about its center — the per-cell `zoom` padding. */
function expandFrameBounds(
  b: { min: [number, number, number]; max: [number, number, number] },
  factor: number,
): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const center = (b.min[a]! + b.max[a]!) / 2;
    const half = ((b.max[a]! - b.min[a]!) / 2) * factor;
    min[a] = center - half;
    max[a] = center + half;
  }
  return { min, max };
}

/** Execute a Kiln program and render its scene into the 3x2 grid. */
export interface CodeViewGridOptions extends ViewGridOptions {
  evaluatorPort?: EvaluatorPortV2;
  evaluatorProfile?: EvaluatorExecutionProfileV2;
}

export async function renderCodeViewGrid(
  code: string,
  opts: CodeViewGridOptions = {},
): Promise<ViewGridResult> {
  const { evaluatorPort, evaluatorProfile, ...viewOptions } = opts;
  const rendered = await resolveEvaluatorPortV2(
    evaluatorPort,
    evaluatorProfile ?? 'trusted-local',
  ).render(code);
  return renderGlbViewGrid(rendered.glb, viewOptions);
}

// =============================================================================
// Animation views — see one clip's MOTION (kiln_screenshot_animation)
// =============================================================================

/** Friendly camera names → orthographic view directions (kiln frame). The default
 *  is RIGHT: the side profile reveals forward/back leg swing, knee bend direction,
 *  and the arc of an attack — the motion defects a static grid can't show. */
const ANIM_CAMERAS: Record<string, ViewSpec> = {
  front: { name: 'Front', dir: [1, 0, 0] },
  right: { name: 'Right', dir: [0, 0, 1] },
  back: { name: 'Back', dir: [-1, 0, 0] },
  left: { name: 'Left', dir: [0, 0, -1] },
  top: { name: 'Top', dir: [0, 1, 0.0001] },
  'three-quarter': { name: '3/4', dir: [0.7, 0.5, 0.7] },
};
const ANIM_CAMERA_ALIASES: Record<string, string> = {
  '3/4': 'three-quarter',
  '34': 'three-quarter',
  threequarter: 'three-quarter',
  quarter: 'three-quarter',
  perspective: 'three-quarter',
  side: 'right',
  profile: 'right',
};

function resolveCamera(name?: string): ViewSpec {
  const key = (name ?? 'right')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return (
    ANIM_CAMERAS[key] ?? ANIM_CAMERAS[ANIM_CAMERA_ALIASES[key] ?? ''] ?? ANIM_CAMERAS['right']!
  );
}

export interface AnimationViewOptions extends RasterOptions {
  shot?: CameraShotV1;
  /** Up to 16 exact subtrees to measure at every pose, independent of the camera. */
  measureParts?: NonNullable<CameraShotV1['subject']>[];
  frameTimes?: number[];
  framing?: 'locked' | 'follow';
  /** Clip to render, by name (case-insensitive, substring-tolerant). Omit → first clip. */
  clip?: string;
  /** Camera angle. Default 'right' (side profile). */
  camera?: string;
  /** Frames sampled across the clip (start→end inclusive). Default 6. */
  frames?: number;
  /** Return the frames as separate PNGs instead of one composite grid. Default false. */
  perFrame?: boolean;
  /** Internal derivative renderer. Receives the already-posed scene and must
   * render exactly one square cell without executing generated source. */
  renderDerivativeCell?: DerivativeCellRenderer;
}

export interface DerivativeCellRenderInput {
  camera?: ResolvedAssetCameraV1;
  root: unknown;
  label: string;
  view: ViewSpec;
  size: number;
  backfaceCull?: boolean;
  frameBounds?: { min: [number, number, number]; max: [number, number, number] };
  /** Backdrop the cell must be painted on, by either producer. */
  backdrop?: import('./background').BackdropId;
  /** Stable reason to decline GPU when its auto-framing cannot honor this view. */
  gpuUnsupportedReasonCode?: 'DERIVATIVE_GPU_FRAMING_UNSUPPORTED';
}

export interface DerivativeCellRenderResult {
  png: Buffer;
  receipt: import('../composer/render-port').DerivativeViewReceiptV1;
}

export type DerivativeCellRenderer = (
  input: DerivativeCellRenderInput,
) => Promise<DerivativeCellRenderResult>;

/** Drawable geometry in world metres before camera isolation/cutaway. Samples
 * describe only the requested poses, not swept bounds or collision/contact QA. */
export interface AnimationPoseBounds {
  phase: number;
  timeSeconds: number;
  scene: { min: [number, number, number]; max: [number, number, number] };
  /** Selected shot subject, if any, in the same world coordinate system. */
  subject?: { min: [number, number, number]; max: [number, number, number] };
  /**
   * Input order; null bounds mean no drawable triangles, never inferred contact.
   * origin is the node's world position, so a locator without geometry is still measured.
   */
  parts?: {
    path: string;
    name: string;
    bounds: ReturnType<typeof measurePartBounds>;
    origin: [number, number, number];
  }[];
}

function worldOrigin(node: unknown): [number, number, number] {
  const e = (node as { matrixWorld: { elements: ArrayLike<number> } }).matrixWorld.elements;
  return [e[12]!, e[13]!, e[14]!];
}

/** Distance from a point to an axis-aligned box; zero inside it. */
function boxDistance(
  point: readonly number[],
  box: { min: readonly number[]; max: readonly number[] },
): number {
  let sum = 0;
  for (let a = 0; a < 3; a++) {
    const d = Math.max(box.min[a]! - point[a]!, 0, point[a]! - box.max[a]!);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export interface AnimationViewResult {
  loopClosure?: import('./pose').LoopClosureEvidence;
  cameraShots?: ResolvedCameraShotV1[];
  ok: boolean;
  clip?: string;
  camera?: string;
  frames: number;
  /** Phase fraction (0..1) of each frame, in order. */
  frameTimes: number[];
  poseBounds?: AnimationPoseBounds[];
  /** Clip duration in seconds. */
  duration?: number;
  /** Track targets that resolve to no joint — the "frozen clip" signal (cause #1). */
  unresolvedTracks?: string[];
  width?: number;
  height?: number;
  /** Composite grid PNG (default mode). */
  png?: Buffer;
  /** Per-frame PNGs (perFrame mode). */
  pngs?: Buffer[];
  /** Clip names available in the scene (set on a not-found error). */
  availableClips?: string[];
  error?: string;
  derivativeReceipts?: import('../composer/render-port').DerivativeViewReceiptV1[];
}

/**
 * Render one animation clip as a strip of evenly-sampled, phase-labeled frames
 * from a single camera, so the agent can SEE the motion (sideways walk, reverse
 * knee, backward swing, item not tracking the hand). MUTATES `root` (callers pass
 * a freshly executed scene — the tool re-executes per call).
 *
 * Two passes: pose+measure every frame to a union AABB (steady framing so root
 * travel reads), then pose+rasterize+label each frame against that fixed box.
 */
export async function renderClipAnimation(
  root: unknown,
  clips: readonly DuckClip[],
  opts: AnimationViewOptions = {},
): Promise<AnimationViewResult> {
  const size = opts.size ?? 256;
  const frameCount = Math.max(2, Math.min(opts.frames ?? 6, 6));
  const cam = resolveCamera(opts.camera);

  if (!clips || clips.length === 0) {
    return {
      ok: false,
      frames: 0,
      frameTimes: [],
      error: 'this asset has no animation clips',
      availableClips: [],
    };
  }
  // Resolve the requested clip by name; default to the first when none is named.
  const requested = opts.clip?.trim();
  const chosen = requested ? findClip(clips, requested) : clips[0];
  if (!chosen) {
    return {
      ok: false,
      frames: 0,
      frameTimes: [],
      ...(requested ? { clip: requested } : {}),
      error: `clip "${requested}" not found in this asset`,
      availableClips: clipNames(clips),
    };
  }

  const prepared = prepareClip(root as never, chosen);
  if (opts.frameTimes && opts.frames !== undefined)
    throw new Error('frameTimes and frames are mutually exclusive');
  if (opts.shot && opts.camera) throw new Error('shot and camera are mutually exclusive');
  if (
    opts.frameTimes &&
    (opts.frameTimes.length < 1 ||
      opts.frameTimes.length > 9 ||
      opts.frameTimes.some(
        (v, i) => !Number.isFinite(v) || v < 0 || v > 1 || (i > 0 && v <= opts.frameTimes![i - 1]!),
      ))
  )
    throw new Error('frameTimes must contain 1..9 strictly increasing phases in 0..1');
  const times = opts.frameTimes
    ? opts.frameTimes.map((t) => t * prepared.duration)
    : planFrameTimes(prepared.duration, frameCount);
  const frameTimes = times.map((t) => (prepared.duration > 0 ? t / prepared.duration : 0));
  if (opts.measureParts && (opts.measureParts.length < 1 || opts.measureParts.length > 16))
    throw new Error('measureParts must contain 1..16 exact selectors');
  const measuredParts = opts.measureParts?.map((selector) => selectCameraSubject(root, selector));
  if (
    measuredParts &&
    new Set(measuredParts.map((part) => part.node)).size !== measuredParts.length
  )
    throw new Error('measureParts contains duplicate part selections');

  // Pass 1 — measure each pose and union subject bounds for steady framing.
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const poseBounds: AnimationPoseBounds[] = [];
  for (const [i, t] of times.entries()) {
    poseSceneAtTime(root as never, prepared, t);
    const scene = measureBounds(root);
    const subject = opts.shot?.subject
      ? measureBounds(selectCameraSubject(root, opts.shot.subject).node)
      : undefined;
    poseBounds.push({
      phase: frameTimes[i]!,
      timeSeconds: t,
      scene,
      ...(subject ? { subject } : {}),
      ...(measuredParts
        ? {
            parts: measuredParts.map(({ path, name, node }) => ({
              path,
              name,
              bounds: measurePartBounds(node),
              origin: worldOrigin(node),
            })),
          }
        : {}),
    });
    const b = subject ?? scene;
    for (let a = 0; a < 3; a++) {
      const lo = b.min[a]!;
      const hi = b.max[a]!;
      if (lo < min[a]!) min[a] = lo;
      if (hi > max[a]!) max[a] = hi;
    }
  }
  const frameBounds = Number.isFinite(min[0]) ? { min, max } : undefined;
  poseSceneAtTime(root as never, prepared, times[0]!);
  const initialShot = opts.shot ? resolveAssetCamera(root, opts.shot) : undefined;
  let lockedCamera = initialShot?.camera;
  if (initialShot && opts.shot?.camera?.type !== 'explicit' && frameBounds) {
    const dir = initialShot.camera.position.map((v, i) => v - initialShot.camera.target[i]!) as [
      number,
      number,
      number,
    ];
    lockedCamera = cameraFromBounds(
      frameBounds,
      dir,
      opts.shot?.camera?.type === 'orbit' ? (opts.shot.camera.padding ?? 1.2) : 1.2,
      initialShot.camera.up,
    );
  }
  const lens = opts.shot?.camera;
  if (
    lockedCamera &&
    opts.framing !== 'follow' &&
    lens?.type === 'explicit' &&
    lens.projection === 'perspective' &&
    lens.near === undefined
  ) {
    // A locked camera was placed against the first pose; keep its default near plane
    // short of the scene at every sampled pose, not only the first.
    const union = { min: [...poseBounds[0]!.scene.min], max: [...poseBounds[0]!.scene.max] };
    for (const { scene } of poseBounds)
      for (let a = 0; a < 3; a++) {
        union.min[a] = Math.min(union.min[a]!, scene.min[a]!);
        union.max[a] = Math.max(union.max[a]!, scene.max[a]!);
      }
    lockedCamera = {
      ...lockedCamera,
      near: Math.max(
        0.001,
        Math.min(lockedCamera.near, boxDistance(lockedCamera.position, union) / 2),
      ),
    };
  }
  const cameraShots: ResolvedCameraShotV1[] = [];

  // Pass 2 — render + label each frame against the fixed framing.
  const labelScale = Math.max(2, Math.round(size / 80));
  const cells: Uint8Array[] = [];
  const derivativeReceipts: import('../composer/render-port').DerivativeViewReceiptV1[] = [];
  for (let i = 0; i < times.length; i++) {
    poseSceneAtTime(root as never, prepared, times[i]!);
    const resolvedShot = opts.shot ? resolveAssetCamera(root, opts.shot) : undefined;
    if (resolvedShot) {
      if (opts.framing !== 'follow') resolvedShot.camera = lockedCamera!;
      cameraShots.push(resolvedShot);
    }
    let cell: Uint8Array;
    if (opts.renderDerivativeCell) {
      const produce = () =>
        opts.renderDerivativeCell!({
          root,
          ...(resolvedShot ? { camera: resolvedShot.camera } : {}),
          label: `${Math.round(frameTimes[i]! * 100)}%`,
          view: cam,
          size,
          ...(opts.backfaceCull !== undefined ? { backfaceCull: opts.backfaceCull } : {}),
          ...(frameBounds ? { frameBounds } : {}),
        });
      const rendered = resolvedShot
        ? await withCameraVisibility(root, resolvedShot, produce)
        : await produce();
      const decoded = decodePng(rendered.png);
      if (decoded.width !== size || decoded.height !== size) {
        throw new Error(
          `derivative animation cell must be ${size}x${size}; got ${decoded.width}x${decoded.height}`,
        );
      }
      cell = decoded.rgb;
      derivativeReceipts.push(rendered.receipt);
    } else {
      cell = resolvedShot
        ? await withCameraVisibility(root, resolvedShot, async () =>
            rasterizeCamera(root, resolvedShot.camera, size),
          )
        : rasterizeView(root, cam.dir, {
            size,
            ...(opts.backfaceCull !== undefined ? { backfaceCull: opts.backfaceCull } : {}),
            ...(frameBounds ? { frameBounds } : {}),
          });
    }
    stampLabel(
      cell,
      size,
      size,
      labelScale,
      labelScale,
      `${Math.round(frameTimes[i]! * 100)}%`,
      labelScale,
    );
    cells.push(cell);
  }

  const baseMeta = {
    ok: true as const,
    loopClosure: measureLoopClosure(root as never, chosen),
    clip: prepared.name,
    camera: cam.name,
    frames: times.length,
    frameTimes,
    poseBounds,
    ...(cameraShots.length ? { cameraShots } : {}),
    duration: prepared.duration,
    ...(prepared.unresolved.length ? { unresolvedTracks: prepared.unresolved } : {}),
    ...(derivativeReceipts.length ? { derivativeReceipts } : {}),
  };

  if (opts.perFrame) {
    return {
      ...baseMeta,
      width: size,
      height: size,
      pngs: cells.map((c) => encodePng(c, size, size)),
    };
  }

  // Compose into a 3x2 grid (same layout as the six-view grid).
  const { rgb, width, height } = compositeCellGrid(cells, size);
  return { ...baseMeta, width, height, png: encodePng(rgb, width, height) };
}

// =============================================================================
// Interior views — see INSIDE an enterable building, roof off (kiln_view_interior)
// =============================================================================

export interface InteriorGridResult extends ViewGridResult {
  cameraShots?: ResolvedCameraShotV1[];
  perFramePngs?: Buffer[];
  /** Roof subtree roots hidden (0 → no roof resolved: no `roof.` role, no
   *  historical roof name, or an explicit `nodeName` that matched nothing). */
  roofsHidden: number;
  /** Near-wall subtree roots hidden for the eye-level cutaway (0 → not a room()). */
  wallsHidden: number;
  derivativeReceipts?: import('../composer/render-port').DerivativeViewReceiptV1[];
}

export interface InteriorGridOptions extends RasterOptions {
  capture?: CaptureConfig;
  /** Exact-name override: lift this node and its children instead of resolving
   *  the roof semantically. Omit it for the ordinary path — role first, then a
   *  narrow historical-name fallback. */
  nodeName?: string;
  /** Internal exact-derivative renderer; omitted preserves the historical CPU path. */
  renderDerivativeCell?: DerivativeCellRenderer;
}

/** Outward face normals of room() walls, by lowercased name suffix (front faces +X). */
const ROOM_WALL_NORMALS: Array<{ suffix: string; n: [number, number, number] }> = [
  { suffix: 'wallfront', n: [1, 0, 0] },
  { suffix: 'wallback', n: [-1, 0, 0] },
  { suffix: 'wallleft', n: [0, 0, -1] },
  { suffix: 'wallright', n: [0, 0, 1] },
];

export const INTERIOR_VIEWS: ViewSpec[] = [
  { name: 'Floor plan', dir: [0, 1, 0.0001] }, // top-down, roof off
  { name: 'Dollhouse', dir: [0.7, 0.5, 0.7] }, // 3/4 cutaway, roof off
  { name: 'Eye-level', dir: [0.55, 0.35, 0.45] }, // low angle, roof + near walls off
];

function normalizeVec(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
function dotVec(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Render an enterable building with its roof — and, for the eye-level cell, the
 * near walls — hidden, so the agent can SEE the interior the six exterior views
 * cannot. Three roof-off cells in one row: Floor plan (top-down, layout +
 * walkability), Dollhouse (3/4 cutaway, fixtures sit on the floor), Eye-level
 * (low angle through the doorway with the camera-facing walls removed, so the
 * doorway reads as a real gap and nothing is buried inside a solid mass).
 *
 * MUTATES `root` (callers pass a freshly executed scene — the tool re-executes
 * per call). Interior faces point AWAY from the camera once the lid/near walls
 * are off, so backface culling is OFF for every cell (the exterior grid keeps it
 * ON to reveal winding bugs).
 */
export async function renderInteriorGrid(
  root: unknown,
  opts: InteriorGridOptions = {},
): Promise<InteriorGridResult> {
  const size = opts.size ?? 256;
  const labelScale = Math.max(2, Math.round(size / 80));

  // Lift the roof once — persists for every cell. Explicit nodeName remains an
  // opt-in compatibility override; ordinary architecture views are semantic
  // first with a narrow historical-name fallback.
  const roofsHidden = opts.nodeName
    ? hideNodeInScene(root, opts.nodeName)
    : hideArchitectureRoofInScene(root).nodes.length;

  if (opts.capture) {
    const grid = await renderCaptureGrid(root, opts.capture, opts.renderDerivativeCell);
    return { ...grid, roofsHidden, wallsHidden: 0 };
  }
  let wallsHidden = 0;
  const cells: Uint8Array[] = [];
  const derivativeReceipts: import('../composer/render-port').DerivativeViewReceiptV1[] = [];
  for (const view of INTERIOR_VIEWS) {
    if (view.name === 'Eye-level') {
      // Cutaway: also remove the walls facing the camera so the eye looks past
      // them onto the far wall + floor. room() names walls `<root>_Wall<Side>`.
      const d = normalizeVec(view.dir);
      wallsHidden = hideNodeInScene(root, (name) => {
        const lower = name.toLowerCase();
        for (const w of ROOM_WALL_NORMALS) {
          if (lower.endsWith(w.suffix) && dotVec(w.n, d) > 0.2) return true;
        }
        return false;
      });
    }
    let cell: Uint8Array;
    if (opts.renderDerivativeCell) {
      const rendered = await opts.renderDerivativeCell({
        root,
        label: view.name,
        view,
        size,
        backfaceCull: false,
      });
      const decoded = decodePng(rendered.png);
      if (decoded.width !== size || decoded.height !== size) {
        throw new Error(
          `derivative interior cell must be ${size}x${size}; got ${decoded.width}x${decoded.height}`,
        );
      }
      cell = decoded.rgb;
      derivativeReceipts.push(rendered.receipt);
    } else {
      cell = rasterizeView(root, view.dir, { size, backfaceCull: false });
    }
    stampLabel(cell, size, size, labelScale, labelScale, view.name, labelScale);
    cells.push(cell);
  }

  // Single-row grid (reuse the six-view PAD/PAD_COLOR layout).
  const { rgb, width, height } = compositeCellGrid(cells, size, INTERIOR_VIEWS.length);

  return {
    png: encodePng(rgb, width, height),
    width,
    height,
    views: INTERIOR_VIEWS.map((v) => v.name),
    // The fixed interior row paints the default backdrop; echo it the way every
    // other grid does, so a reader never has to guess what a silhouette sat on.
    capture: {
      preset: 'interior',
      cols: INTERIOR_VIEWS.length,
      cells: INTERIOR_VIEWS.length,
      backdrop: DEFAULT_BACKDROP_ID,
    },
    roofsHidden,
    wallsHidden,
    ...(derivativeReceipts.length ? { derivativeReceipts } : {}),
  };
}
