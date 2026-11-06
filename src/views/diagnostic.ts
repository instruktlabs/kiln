/**
 * Deterministic, read-only diagnostic views for asset QA.
 *
 * The ordinary six-view grid is a product artifact. These buffers are additive
 * evidence: every generic buffer uses the same frozen six named cameras, while
 * category profiles may request narrowly-scoped extra views. The CPU collector
 * composes local transforms itself and never updates, poses, hides, recolors, or
 * otherwise mutates the source scene.
 */

import type { AssetCategory, AssetIntentV1 } from '../contracts';
import { readSemanticMetadataV1FromExtras } from '../contracts';
import { planCharacterDiagnosticRequests } from './character';
import { encodePng } from './png';

type Vec3 = [number, number, number];
type Mat4 = Float64Array;

export const GENERIC_DIAGNOSTIC_BUFFER_IDS = [
  'silhouette-unlit',
  'wireframe',
  'normals-backface',
  'depth-contact',
  'semantic-overlay',
] as const;

export type GenericDiagnosticBufferId = (typeof GENERIC_DIAGNOSTIC_BUFFER_IDS)[number];

export interface DiagnosticCameraSpec {
  id: string;
  name: string;
  /** Direction from model center toward the camera in Kiln's canonical frame. */
  dir: Vec3;
}

const frozenCamera = (id: string, name: string, dir: Vec3): DiagnosticCameraSpec =>
  Object.freeze({ id, name, dir: Object.freeze([...dir]) as unknown as Vec3 });

/** The exact named cameras used by the generic six-view product grid. */
export const GENERIC_DIAGNOSTIC_CAMERAS: readonly DiagnosticCameraSpec[] = Object.freeze([
  frozenCamera('front', 'Front', [1, 0, 0]),
  frozenCamera('right', 'Right', [0, 0, 1]),
  frozenCamera('back', 'Back', [-1, 0, 0]),
  frozenCamera('left', 'Left', [0, 0, -1]),
  frozenCamera('top', 'Top', [0, 1, 0.0001]),
  frozenCamera('three-quarter', '3/4', [0.7, 0.5, 0.7]),
]);

const EXTRA_CAMERAS = Object.freeze({
  underside: frozenCamera('underside', 'Canopy underside', [0.15, -0.85, 0.5]),
  grazing: frozenCamera('grazing', 'Material grazing light', [0.08, 0.12, 1]),
});

const cameraById = new Map(
  [...GENERIC_DIAGNOSTIC_CAMERAS, ...Object.values(EXTRA_CAMERAS)].map((camera) => [
    camera.id,
    camera,
  ]),
);

export type CategoryDiagnosticVariant =
  | 'architecture-cutaway'
  | 'architecture-gable-elevation'
  | 'architecture-portal-eye'
  | 'character-skeleton'
  | 'character-motion-strip'
  | 'vehicle-underbody'
  | 'vehicle-wheel-section'
  | 'vegetation-canopy-underside'
  | 'material-grazing-light';

export interface DiagnosticViewRequest {
  /** Stable evidence ID; never derived from model-authored scene metadata. */
  id: string;
  label: string;
  cameraId: string;
  buffer: GenericDiagnosticBufferId;
  scope: 'generic' | 'category' | 'material';
  variant?: CategoryDiagnosticVariant;
  /** Read-only cutaway filter over canonical semantic role prefixes. */
  omitRolePrefixes?: readonly string[];
  /** Optional framing target; non-matching geometry remains visible. */
  focusRolePrefixes?: readonly string[];
  /** Fixed normalized phases requested from the later animation sampler. */
  phaseFractions?: readonly number[];
  /** Exact clip selected by trusted character intent for an automatic motion strip. */
  clipName?: string;
}

const request = (value: DiagnosticViewRequest): DiagnosticViewRequest =>
  Object.freeze({
    ...value,
    ...(value.omitRolePrefixes
      ? { omitRolePrefixes: Object.freeze([...value.omitRolePrefixes]) }
      : {}),
    ...(value.focusRolePrefixes
      ? { focusRolePrefixes: Object.freeze([...value.focusRolePrefixes]) }
      : {}),
    ...(value.phaseFractions ? { phaseFractions: Object.freeze([...value.phaseFractions]) } : {}),
  });

/** Five deterministic buffers from every one of the unchanged generic six cameras. */
export const GENERIC_DIAGNOSTIC_REQUESTS: readonly DiagnosticViewRequest[] = Object.freeze(
  GENERIC_DIAGNOSTIC_CAMERAS.flatMap((camera) =>
    GENERIC_DIAGNOSTIC_BUFFER_IDS.map((buffer) =>
      request({
        id: `generic.${camera.id}.${buffer}`,
        label: `${camera.name} ${buffer}`,
        cameraId: camera.id,
        buffer,
        scope: 'generic',
      }),
    ),
  ),
);

const CATEGORY_REQUESTS: Readonly<Record<AssetCategory, readonly DiagnosticViewRequest[]>> =
  Object.freeze({
    prop: Object.freeze([]),
    vfx: Object.freeze([]),
    environment: Object.freeze([]),
    architecture: Object.freeze([]),
    character: Object.freeze([]),
    vehicle: Object.freeze([
      request({
        id: 'vehicle.underbody',
        label: 'Vehicle underbody and support plane',
        cameraId: 'underside',
        buffer: 'semantic-overlay',
        scope: 'category',
        variant: 'vehicle-underbody',
        focusRolePrefixes: [
          'chassis.',
          'wheel.',
          'axle.',
          'support.',
          'contact.',
          'diagnostic.vehicle.',
        ],
      }),
      request({
        id: 'vehicle.wheel-section.right',
        label: 'Vehicle wheel section',
        cameraId: 'right',
        buffer: 'semantic-overlay',
        scope: 'category',
        variant: 'vehicle-wheel-section',
        focusRolePrefixes: ['wheel.', 'axle.', 'hub.', 'tire.'],
      }),
    ]),
    vegetation: Object.freeze([
      request({
        id: 'vegetation.canopy-underside',
        label: 'Vegetation canopy underside',
        cameraId: 'underside',
        buffer: 'normals-backface',
        scope: 'category',
        variant: 'vegetation-canopy-underside',
        focusRolePrefixes: ['canopy.', 'foliage.', 'leaf.'],
      }),
    ]),
  });

/** A reusable view recipe; it does not select an asset policy. */
export const MOBILITY_DIAGNOSTIC_REQUESTS = CATEGORY_REQUESTS.vehicle;

function architectureDiagnosticRequests(intent: AssetIntentV1): readonly DiagnosticViewRequest[] {
  const architecture = intent.architecture;
  if (!architecture) return [];
  const requests: DiagnosticViewRequest[] = [];
  const buildingProfile =
    architecture.roof.type === 'gable' ||
    /(?:building|house|cottage|barn|hut|gable)/i.test(architecture.subtype);
  if (buildingProfile) {
    const ridgeX = architecture.roof.ridgeAxis === 'x';
    requests.push(
      request({
        id: 'architecture.gable.positive',
        label: 'Architecture positive gable elevation',
        cameraId: ridgeX ? 'front' : 'right',
        buffer: 'semantic-overlay',
        scope: 'category',
        variant: 'architecture-gable-elevation',
        focusRolePrefixes: ['roof.gable.positive', 'roof.slope.', 'wall.'],
      }),
      request({
        id: 'architecture.gable.negative',
        label: 'Architecture negative gable elevation',
        cameraId: ridgeX ? 'back' : 'left',
        buffer: 'semantic-overlay',
        scope: 'category',
        variant: 'architecture-gable-elevation',
        focusRolePrefixes: ['roof.gable.negative', 'roof.slope.', 'wall.'],
      }),
    );
  }
  requests.push(
    request({
      id: 'architecture.cutaway.plan',
      label: 'Architecture roof-off plan',
      cameraId: 'top',
      buffer: 'semantic-overlay',
      scope: 'category',
      variant: 'architecture-cutaway',
      omitRolePrefixes: ['roof.'],
    }),
    request({
      id: 'architecture.cutaway.dollhouse',
      label: 'Architecture roof-off dollhouse',
      cameraId: 'three-quarter',
      buffer: 'semantic-overlay',
      scope: 'category',
      variant: 'architecture-cutaway',
      omitRolePrefixes: ['roof.'],
    }),
  );
  if (architecture.enterable) {
    requests.push(
      request({
        id: 'architecture.portal.eye',
        label: 'Architecture portal eye view',
        cameraId: 'front',
        buffer: 'depth-contact',
        scope: 'category',
        variant: 'architecture-portal-eye',
        focusRolePrefixes: ['opening.', 'wall.', 'floor'],
      }),
    );
  }
  return Object.freeze(requests);
}

function characterDiagnosticRequests(intent: AssetIntentV1): readonly DiagnosticViewRequest[] {
  if (!intent.character) return [];
  return Object.freeze(
    planCharacterDiagnosticRequests(intent.character).map((value) =>
      request({
        id: value.id,
        label: value.label,
        cameraId: value.cameraId,
        buffer: value.buffer,
        scope: 'category',
        variant: value.variant,
        focusRolePrefixes: value.focusRolePrefixes,
        ...(value.phaseFractions ? { phaseFractions: value.phaseFractions } : {}),
        ...(value.clipName ? { clipName: value.clipName } : {}),
      }),
    ),
  );
}

const MATERIAL_GRAZING_REQUEST = request({
  id: 'material.grazing-light',
  label: 'Material grazing light',
  cameraId: 'grazing',
  buffer: 'silhouette-unlit',
  scope: 'material',
  variant: 'material-grazing-light',
});

export interface DiagnosticViewPlanV1 {
  schemaVersion: 1;
  category: AssetCategory;
  qaProfile: string;
  /** These IDs stay byte-for-byte identical for every profile. */
  genericCameraIds: readonly string[];
  generic: readonly DiagnosticViewRequest[];
  /** Additive requests selected only from trusted intent. */
  extra: readonly DiagnosticViewRequest[];
}

/**
 * Select additive category/material views from closure-owned intent. Scene names,
 * userData, and model-authored category claims are deliberately not inputs.
 */
export function planDiagnosticViews(intent: AssetIntentV1): DiagnosticViewPlanV1 {
  const categoryRequests =
    intent.category === 'architecture'
      ? architectureDiagnosticRequests(intent)
      : intent.category === 'character'
        ? characterDiagnosticRequests(intent)
        : CATEGORY_REQUESTS[intent.category];
  const includeGrazing = intent.material.mode !== 'flatOptimized';
  return {
    schemaVersion: 1,
    category: intent.category,
    qaProfile: intent.qaProfile,
    genericCameraIds: Object.freeze(GENERIC_DIAGNOSTIC_CAMERAS.map((camera) => camera.id)),
    generic: GENERIC_DIAGNOSTIC_REQUESTS,
    extra: includeGrazing
      ? Object.freeze([...categoryRequests, MATERIAL_GRAZING_REQUEST])
      : categoryRequests,
  };
}

interface DuckAttribute {
  array: ArrayLike<number>;
  itemSize: number;
  count: number;
}

interface DuckGeometry {
  getAttribute?(name: string): DuckAttribute | undefined;
  index?: DuckAttribute | null;
  userData?: Record<string, unknown>;
}

interface DuckMaterial {
  color?: { r: number; g: number; b: number };
  visible?: boolean;
}

interface DuckNode {
  name?: string;
  type?: string;
  visible?: boolean;
  children?: DuckNode[];
  isMesh?: boolean;
  geometry?: DuckGeometry;
  material?: DuckMaterial | DuckMaterial[];
  userData?: Record<string, unknown>;
  matrix?: { elements: ArrayLike<number> };
  matrixAutoUpdate?: boolean;
  position?: { x: number; y: number; z: number };
  quaternion?: { x: number; y: number; z: number; w: number };
  scale?: { x: number; y: number; z: number };
}

interface DiagnosticTriangle {
  vertices: Float64Array;
  color: Vec3;
  nodeName: string;
  nodePath: string;
  semanticRoles: readonly string[];
}

interface CollectedScene {
  triangles: DiagnosticTriangle[];
  bounds: { min: Vec3; max: Vec3 };
  focusBounds?: { min: Vec3; max: Vec3 };
}

const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function multiplyMatrices(a: ArrayLike<number>, b: ArrayLike<number>): Mat4 {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let value = 0;
      for (let k = 0; k < 4; k++) value += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = value;
    }
  }
  return out;
}

function composeLocalMatrix(node: DuckNode): Mat4 {
  if (node.matrixAutoUpdate === false && node.matrix?.elements) {
    return new Float64Array(Array.from(node.matrix.elements));
  }
  const p = node.position;
  const q = node.quaternion;
  const s = node.scale;
  if (!p || !q || !s) {
    return node.matrix?.elements
      ? new Float64Array(Array.from(node.matrix.elements))
      : new Float64Array(IDENTITY);
  }

  const x2 = q.x + q.x;
  const y2 = q.y + q.y;
  const z2 = q.z + q.z;
  const xx = q.x * x2;
  const xy = q.x * y2;
  const xz = q.x * z2;
  const yy = q.y * y2;
  const yz = q.y * z2;
  const zz = q.z * z2;
  const wx = q.w * x2;
  const wy = q.w * y2;
  const wz = q.w * z2;

  return new Float64Array([
    (1 - (yy + zz)) * s.x,
    (xy + wz) * s.x,
    (xz - wy) * s.x,
    0,
    (xy - wz) * s.y,
    (1 - (xx + zz)) * s.y,
    (yz + wx) * s.y,
    0,
    (xz + wy) * s.z,
    (yz - wx) * s.z,
    (1 - (xx + yy)) * s.z,
    0,
    p.x,
    p.y,
    p.z,
    1,
  ]);
}

function transformPoint(matrix: ArrayLike<number>, x: number, y: number, z: number): Vec3 {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ];
}

function matchesRole(roles: readonly string[], prefixes: readonly string[] | undefined): boolean {
  return Boolean(prefixes?.some((prefix) => roles.some((role) => role.startsWith(prefix))));
}

function semanticRoles(node: DuckNode): readonly string[] {
  const metadata = readSemanticMetadataV1FromExtras(node.userData ?? {});
  if (metadata) return metadata.roles;
  const geometryRole = node.geometry?.userData?.['kilnGeometryRole'];
  return typeof geometryRole === 'string' ? [geometryRole] : [];
}

function clamp01(value: number): number {
  return value < 0 ? 0 : Math.min(value, 1);
}

function collectScene(root: unknown, requestValue: DiagnosticViewRequest): CollectedScene {
  const triangles: DiagnosticTriangle[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const focusMin: Vec3 = [Infinity, Infinity, Infinity];
  const focusMax: Vec3 = [-Infinity, -Infinity, -Infinity];

  const visit = (
    node: DuckNode,
    parentMatrix: ArrayLike<number>,
    parentPath: string,
    siblingIndex: number,
    ancestorVisible: boolean,
    inheritedRoles: readonly string[],
  ): void => {
    const local = composeLocalMatrix(node);
    const world = multiplyMatrices(parentMatrix, local);
    const visible = ancestorVisible && node.visible !== false;
    const segment = `${node.name?.trim() || node.type || 'Node'}[${siblingIndex}]`;
    const nodePath = parentPath ? `${parentPath}/${segment}` : segment;
    const roles = [...new Set([...inheritedRoles, ...semanticRoles(node)])];
    const omitted = matchesRole(roles, requestValue.omitRolePrefixes);

    if (visible && !omitted && node.isMesh && node.geometry) {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const material = materials[0];
      if (material?.visible !== false) {
        const position = node.geometry.getAttribute?.('position');
        if (position?.itemSize === 3) {
          const worldPositions: Vec3[] = [];
          for (let index = 0; index < position.count; index++) {
            const point = transformPoint(
              world,
              position.array[index * 3]!,
              position.array[index * 3 + 1]!,
              position.array[index * 3 + 2]!,
            );
            worldPositions.push(point);
          }
          const materialColor = material?.color;
          const color: Vec3 = materialColor
            ? [clamp01(materialColor.r), clamp01(materialColor.g), clamp01(materialColor.b)]
            : [0.7, 0.7, 0.7];
          const focused = matchesRole(roles, requestValue.focusRolePrefixes);
          const addTriangle = (a: number, b: number, c: number): void => {
            const points = [worldPositions[a], worldPositions[b], worldPositions[c]];
            if (points.some((point) => !point || point.some((value) => !Number.isFinite(value)))) {
              return;
            }
            const vertices = new Float64Array(9);
            points.forEach((point, pointIndex) => {
              for (let axis = 0; axis < 3; axis++) {
                const value = point![axis]!;
                vertices[pointIndex * 3 + axis] = value;
                min[axis] = Math.min(min[axis]!, value);
                max[axis] = Math.max(max[axis]!, value);
                if (focused) {
                  focusMin[axis] = Math.min(focusMin[axis]!, value);
                  focusMax[axis] = Math.max(focusMax[axis]!, value);
                }
              }
            });
            triangles.push({
              vertices,
              color,
              nodeName: node.name ?? '',
              nodePath,
              semanticRoles: roles,
            });
          };
          const index = node.geometry.index;
          if (index) {
            for (let i = 0; i + 2 < index.count; i += 3) {
              addTriangle(index.array[i]!, index.array[i + 1]!, index.array[i + 2]!);
            }
          } else {
            for (let i = 0; i + 2 < position.count; i += 3) addTriangle(i, i + 1, i + 2);
          }
        }
      }
    }

    (node.children ?? []).forEach((child, index) => {
      visit(child, world, nodePath, index, visible && !omitted, roles);
    });
  };

  visit(root as DuckNode, IDENTITY, '', 0, true, []);
  const empty = !Number.isFinite(min[0]);
  const focusEmpty = !Number.isFinite(focusMin[0]);
  return {
    triangles,
    bounds: empty ? { min: [0, 0, 0], max: [0, 0, 0] } : { min, max },
    ...(!focusEmpty ? { focusBounds: { min: focusMin, max: focusMax } } : {}),
  };
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(...vector) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function stableColor(key: string): [number, number, number] {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return [96 + (hash & 0x7f), 96 + ((hash >>> 8) & 0x7f), 96 + ((hash >>> 16) & 0x7f)];
}

export interface DiagnosticOverlayRegion {
  nodeName: string;
  nodePath: string;
  semanticRoles: readonly string[];
  /** Inclusive pixel bounds [minX,minY,maxX,maxY]. */
  pixelBounds: [number, number, number, number];
  color: [number, number, number];
  triangleCount: number;
}

export interface DiagnosticViewFrame {
  id: string;
  label: string;
  camera: DiagnosticCameraSpec;
  buffer: GenericDiagnosticBufferId;
  variant?: CategoryDiagnosticVariant;
  width: number;
  height: number;
  rgb: Uint8Array;
  png: Buffer;
  regions: DiagnosticOverlayRegion[];
  phaseFractions?: readonly number[];
}

export interface DiagnosticRenderOptions {
  /** Square output size. Clamped to 16..1024; default 256. */
  size?: number;
  groundY?: number;
}

interface ProjectedTriangle {
  source: DiagnosticTriangle;
  x: [number, number, number];
  y: [number, number, number];
  z: [number, number, number];
  worldY: [number, number, number];
  normal: Vec3;
  frontFacing: boolean;
}

function projectScene(
  scene: CollectedScene,
  camera: DiagnosticCameraSpec,
  size: number,
): ProjectedTriangle[] {
  const zAxis = normalize(camera.dir);
  const upHint: Vec3 = Math.abs(zAxis[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
  const xAxis = normalize(cross(upHint, zAxis));
  const yAxis = cross(zAxis, xAxis);
  const frame = scene.focusBounds ?? scene.bounds;
  const center: Vec3 = [
    (frame.min[0] + frame.max[0]) / 2,
    (frame.min[1] + frame.max[1]) / 2,
    (frame.min[2] + frame.max[2]) / 2,
  ];
  let extent = 1e-6;
  for (let corner = 0; corner < 8; corner++) {
    const point: Vec3 = [
      (corner & 1 ? frame.max[0] : frame.min[0]) - center[0],
      (corner & 2 ? frame.max[1] : frame.min[1]) - center[1],
      (corner & 4 ? frame.max[2] : frame.min[2]) - center[2],
    ];
    extent = Math.max(extent, Math.abs(dot(point, xAxis)), Math.abs(dot(point, yAxis)));
  }
  const scale = (size * 0.45) / extent;
  const half = size / 2;

  return scene.triangles.flatMap((triangle): ProjectedTriangle[] => {
    const v = triangle.vertices;
    const edgeA: Vec3 = [v[3]! - v[0]!, v[4]! - v[1]!, v[5]! - v[2]!];
    const edgeB: Vec3 = [v[6]! - v[0]!, v[7]! - v[1]!, v[8]! - v[2]!];
    const normalRaw = cross(edgeA, edgeB);
    const length = Math.hypot(...normalRaw);
    if (length < 1e-12) return [];
    const normal: Vec3 = normalRaw.map((component) => component / length) as Vec3;
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const worldY: number[] = [];
    for (let index = 0; index < 3; index++) {
      const point: Vec3 = [
        v[index * 3]! - center[0],
        v[index * 3 + 1]! - center[1],
        v[index * 3 + 2]! - center[2],
      ];
      xs.push(half + dot(point, xAxis) * scale);
      ys.push(half - dot(point, yAxis) * scale);
      zs.push(dot(point, zAxis));
      worldY.push(v[index * 3 + 1]!);
    }
    return [
      {
        source: triangle,
        x: xs as [number, number, number],
        y: ys as [number, number, number],
        z: zs as [number, number, number],
        worldY: worldY as [number, number, number],
        normal,
        frontFacing: dot(normal, zAxis) > 0,
      },
    ];
  });
}

function drawLine(
  rgb: Uint8Array,
  size: number,
  from: [number, number],
  to: [number, number],
  color: [number, number, number],
): void {
  let x0 = Math.round(from[0]);
  let y0 = Math.round(from[1]);
  const x1 = Math.round(to[0]);
  const y1 = Math.round(to[1]);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    if (x0 >= 0 && x0 < size && y0 >= 0 && y0 < size) {
      const offset = (y0 * size + x0) * 3;
      rgb[offset] = color[0];
      rgb[offset + 1] = color[1];
      rgb[offset + 2] = color[2];
    }
    if (x0 === x1 && y0 === y1) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x0 += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function drawRegionBox(rgb: Uint8Array, size: number, region: DiagnosticOverlayRegion): void {
  const [minX, minY, maxX, maxY] = region.pixelBounds;
  drawLine(rgb, size, [minX, minY], [maxX, minY], region.color);
  drawLine(rgb, size, [maxX, minY], [maxX, maxY], region.color);
  drawLine(rgb, size, [maxX, maxY], [minX, maxY], region.color);
  drawLine(rgb, size, [minX, maxY], [minX, minY], region.color);
}

/** Render one diagnostic request without modifying any property on `root`. */
export function renderDiagnosticView(
  root: unknown,
  requestValue: DiagnosticViewRequest,
  options: DiagnosticRenderOptions = {},
): DiagnosticViewFrame {
  const camera = cameraById.get(requestValue.cameraId);
  if (!camera)
    throw new TypeError(`Unknown diagnostic camera ${JSON.stringify(requestValue.cameraId)}.`);
  const size = Math.max(16, Math.min(1024, Math.round(options.size ?? 256)));
  const groundY = options.groundY ?? 0;
  const scene = collectScene(root, requestValue);
  const triangles = projectScene(scene, camera, size);
  const background: [number, number, number] = [18, 20, 24];
  const rgb = new Uint8Array(size * size * 3);
  for (let pixel = 0; pixel < size * size; pixel++) {
    rgb[pixel * 3] = background[0];
    rgb[pixel * 3 + 1] = background[1];
    rgb[pixel * 3 + 2] = background[2];
  }
  const depth = new Float64Array(size * size).fill(-Infinity);
  const depths = triangles.flatMap((triangle) => triangle.z);
  const minDepth = depths.length > 0 ? Math.min(...depths) : 0;
  const maxDepth = depths.length > 0 ? Math.max(...depths) : 1;
  const depthRange = Math.max(1e-9, maxDepth - minDepth);
  const contactTolerance = Math.max(1e-4, (scene.bounds.max[1] - scene.bounds.min[1]) * 0.015);
  const regionMap = new Map<string, DiagnosticOverlayRegion>();

  for (const triangle of triangles) {
    const minX = Math.max(0, Math.floor(Math.min(...triangle.x)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(...triangle.x)));
    const minY = Math.max(0, Math.floor(Math.min(...triangle.y)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(...triangle.y)));
    if (minX > maxX || minY > maxY) continue;

    // Roles are inherited from root to leaf. Color by the most-specific role
    // so a broad ancestor such as `vehicle.frame` does not flatten every body,
    // tire, rim, and hub into the same overlay color.
    const key = triangle.source.semanticRoles.at(-1) ?? triangle.source.nodePath;
    const regionColor = stableColor(key);
    const existing = regionMap.get(triangle.source.nodePath);
    if (existing) {
      existing.pixelBounds[0] = Math.min(existing.pixelBounds[0], minX);
      existing.pixelBounds[1] = Math.min(existing.pixelBounds[1], minY);
      existing.pixelBounds[2] = Math.max(existing.pixelBounds[2], maxX);
      existing.pixelBounds[3] = Math.max(existing.pixelBounds[3], maxY);
      existing.triangleCount++;
    } else {
      regionMap.set(triangle.source.nodePath, {
        nodeName: triangle.source.nodeName,
        nodePath: triangle.source.nodePath,
        semanticRoles: [...triangle.source.semanticRoles],
        pixelBounds: [minX, minY, maxX, maxY],
        color: regionColor,
        triangleCount: 1,
      });
    }

    if (requestValue.buffer === 'wireframe') continue;
    const ax = triangle.x[0];
    const ay = triangle.y[0];
    const bx = triangle.x[1];
    const by = triangle.y[1];
    const cx = triangle.x[2];
    const cy = triangle.y[2];
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const inverseArea = 1 / area;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const sampleX = px + 0.5;
        const sampleY = py + 0.5;
        const w0 = ((bx - ax) * (sampleY - ay) - (by - ay) * (sampleX - ax)) * inverseArea;
        const w1 = ((cx - bx) * (sampleY - by) - (cy - by) * (sampleX - bx)) * inverseArea;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const pixelDepth = w1 * triangle.z[0] + w2 * triangle.z[1] + w0 * triangle.z[2];
        const pixel = py * size + px;
        if (pixelDepth <= depth[pixel]!) continue;
        depth[pixel] = pixelDepth;
        const offset = pixel * 3;
        let color: [number, number, number];
        if (requestValue.variant === 'material-grazing-light') {
          const grazingDirection = normalize([0.25, 0.08, 1]);
          const light = 0.08 + 0.92 * Math.max(0, dot(triangle.normal, grazingDirection));
          color = triangle.source.color.map((value) =>
            Math.round(clamp01(value * light) * 255),
          ) as [number, number, number];
        } else if (requestValue.buffer === 'silhouette-unlit') {
          color = [235, 238, 242];
        } else if (requestValue.buffer === 'normals-backface') {
          color = triangle.frontFacing
            ? (triangle.normal.map((value) => Math.round((value * 0.5 + 0.5) * 255)) as [
                number,
                number,
                number,
              ])
            : [238, 48, 64];
        } else if (requestValue.buffer === 'depth-contact') {
          const worldY =
            w1 * triangle.worldY[0] + w2 * triangle.worldY[1] + w0 * triangle.worldY[2];
          if (Math.abs(worldY - groundY) <= contactTolerance) color = [58, 220, 126];
          else if (worldY < groundY - contactTolerance) color = [245, 94, 72];
          else {
            const value = Math.round(48 + 190 * ((pixelDepth - minDepth) / depthRange));
            color = [value, value, value];
          }
        } else {
          color = regionColor;
        }
        rgb[offset] = color[0];
        rgb[offset + 1] = color[1];
        rgb[offset + 2] = color[2];
      }
    }
  }

  if (requestValue.buffer === 'wireframe') {
    for (const triangle of triangles) {
      const color: [number, number, number] = triangle.frontFacing
        ? [225, 235, 245]
        : [230, 72, 84];
      for (const [a, b] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        drawLine(rgb, size, [triangle.x[a], triangle.y[a]], [triangle.x[b], triangle.y[b]], color);
      }
    }
  }

  const regions = [...regionMap.values()].sort((a, b) => a.nodePath.localeCompare(b.nodePath));
  if (requestValue.buffer === 'semantic-overlay') {
    for (const region of regions) drawRegionBox(rgb, size, region);
  }

  return {
    id: requestValue.id,
    label: requestValue.label,
    camera,
    buffer: requestValue.buffer,
    ...(requestValue.variant ? { variant: requestValue.variant } : {}),
    width: size,
    height: size,
    rgb,
    png: encodePng(rgb, size, size),
    regions,
    ...(requestValue.phaseFractions ? { phaseFractions: requestValue.phaseFractions } : {}),
  };
}

/** Render an already-selected deterministic request list in stable input order. */
export function renderDiagnosticViews(
  root: unknown,
  requests: readonly DiagnosticViewRequest[],
  options: DiagnosticRenderOptions = {},
): DiagnosticViewFrame[] {
  return requests.map((viewRequest) => renderDiagnosticView(root, viewRequest, options));
}
