/**
 * Pure-CPU orthographic rasterizer for Kiln scene graphs.
 *
 * Why this exists: the agent loop needs to SEE its asset (kiln_screenshot)
 * but no GPU/browser renderer is available everywhere the loop runs — the
 * kiln-studio agent-runtime container ships without a browser
 * (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1) and Playwright is unsupported under
 * Bun on Windows (see imposter/bake.ts). headless-gl is WebGL1-only while
 * three >= r163 requires WebGL2. So: a CPU scanline z-buffer
 * rasterizer over the executed scene. Flat lambert, base color only — enough
 * fidelity for silhouette / proportion / orientation / contact QA, which is
 * what the vision loop checks.
 *
 * Scene access is strictly duck-typed (`.isMesh`, `matrixWorld.elements`,
 * vertex readers and position attributes) because sandbox-created objects live in a
 * different module realm — see executeKilnCode in ../render.ts.
 *
 * Lighting matches scripts/visual-audit.ts: key directional light from
 * [1.5, 2, 1] at 1.1 plus 0.25 ambient. Back-face culling is strict (like
 * the offline audit grid) so inverted winding shows up as missing faces.
 */

import { Vector3 } from 'three';
import { resolveBackdrop, type BackdropId } from './background';
import { visibleNormalSign, worldWindingParity, type SurfaceSide } from './face-policy';
import { TriangleCoverage } from './triangle-coverage';

export interface ViewSpec {
  name: string;
  /** Direction from model center toward the camera (kiln frame: +X fwd, +Y up, +Z right). */
  dir: [number, number, number];
}

/** Same six views as the offline audit grid (scripts/visual-audit.ts). */
export const SIX_VIEWS: ViewSpec[] = [
  { name: 'Front', dir: [1, 0, 0] },
  { name: 'Right', dir: [0, 0, 1] },
  { name: 'Back', dir: [-1, 0, 0] },
  { name: 'Left', dir: [0, 0, -1] },
  { name: 'Top', dir: [0, 1, 0.0001] },
  { name: '3/4', dir: [0.7, 0.5, 0.7] },
];

/**
 * H-33 arm: the same grid with the single 3/4 swapped to the opposite-rear
 * azimuth, so features the front-quarter cell always occludes (rear fascia,
 * tail geometry, the back of a spoiler) get one perspective cell.
 */
export const SIX_VIEWS_REAR_QUARTER: ViewSpec[] = [
  ...SIX_VIEWS.slice(0, 5),
  { name: '3/4 Rear', dir: [-0.7, 0.5, -0.7] },
];

/**
 * Elevation clamp for orbit cameras. The rasterizer already swaps its up-hint
 * past |y| > 0.99 so a true pole does not degenerate, but an exactly-vertical
 * camera makes the framing basis spin freely with azimuth — two calls that
 * differ only in azimuth would return differently-rotated top views. Clamping
 * short of the pole keeps azimuth meaningful all the way up.
 */
export const MIN_ELEVATION_DEG = -89;
export const MAX_ELEVATION_DEG = 89;

/**
 * Object-relative orbit angles to a camera direction in the kiln frame
 * (+X forward, +Y up, +Z right).
 *
 * Azimuth sweeps from the front (+X) toward the right (+Z), so it reproduces
 * the named grid cameras exactly: 0 = Front, 90 = Right, 180 = Back,
 * 270 = Left, and (45, 26.79) is the shipped 3/4 direction. Azimuth wraps
 * naturally; elevation is clamped to {@link MIN_ELEVATION_DEG}..{@link MAX_ELEVATION_DEG}.
 */
export function orbitDir(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const el =
    (Math.min(MAX_ELEVATION_DEG, Math.max(MIN_ELEVATION_DEG, elevationDeg)) * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return [cosEl * Math.cos(az), Math.sin(el), cosEl * Math.sin(az)];
}

/**
 * Exact inverse of {@link orbitDir}: recover orbit angles from a direction.
 *
 * Used so the named cameras can report where they are in the same coordinates
 * the model steers with, without a second hand-maintained table that could
 * drift from the direction vectors above. Azimuth comes back in [0, 360).
 */
export function orbitAnglesOf(dir: [number, number, number]): {
  azimuthDeg: number;
  elevationDeg: number;
} {
  const [x, y, z] = normalize(dir);
  const azimuthDeg = ((((Math.atan2(z, x) * 180) / Math.PI) % 360) + 360) % 360;
  return {
    azimuthDeg: +azimuthDeg.toFixed(2),
    elevationDeg: +((Math.asin(Math.min(1, Math.max(-1, y))) * 180) / Math.PI).toFixed(2),
  };
}

/** Named six-view grid variants (H-33). 'default' keeps the shipped front-quarter grid. */
export type ViewGridVariant = 'default' | 'rear-quarter';

/**
 * Resolve a grid-variant name (typically the `KILN_GRID_VARIANT` env) to its
 * view set. Unknown / unset names fall back to {@link SIX_VIEWS} so a stale or
 * mistyped env can never change what the agent sees.
 */
export function resolveGridViews(variant?: string): ViewSpec[] {
  return variant?.trim().toLowerCase() === 'rear-quarter' ? SIX_VIEWS_REAR_QUARTER : SIX_VIEWS;
}

export interface RasterOptions {
  /** Square output size in pixels per view. Default 256. */
  size?: number;
  /** Cull triangles facing away from the camera. Default true (reveals winding bugs). */
  backfaceCull?: boolean;
  /**
   * Fixed world-space AABB to frame the camera to, instead of the scene's own
   * bounds. Used by the animation grid so every sampled frame shares one framing —
   * otherwise per-frame auto-framing re-centers the model and HIDES root travel
   * (a sideways/forward-sliding walk would look stationary). The scene's own
   * geometry is still drawn; only the camera center/zoom come from this box.
   */
  frameBounds?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  /** Named backdrop to clear to. Omit for the default; see `views/background.ts`. */
  backdrop?: BackdropId;
}
const AMBIENT = 0.25;
const KEY_INTENSITY = 1.1;
const KEY_DIR = normalize([1.5, 2, 1]);

type Vec3 = [number, number, number];

function normalize(v: number[]): Vec3 {
  const len = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / len, v[1]! / len, v[2]! / len];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Minimal duck-typed views of the Three.js objects we read. */
interface DuckAttribute {
  array: ArrayLike<number>;
  itemSize: number;
  count: number;
  getX?(index: number): number;
  getY?(index: number): number;
  getZ?(index: number): number;
}
interface DuckGeometry {
  getAttribute(name: string): DuckAttribute | undefined;
  index: DuckAttribute | null;
  /** Three.js geometry groups: ranges of the index (or position) buffer drawn
   *  with `materialIndex` when the mesh carries a material ARRAY. */
  groups?: Array<{ start: number; count: number; materialIndex?: number }>;
}
interface DuckMaterial {
  color?: { r: number; g: number; b: number };
  /** Effective glTF base-color alpha after OPAQUE/MASK/BLEND handling. */
  opacity?: number;
  doubleSided?: boolean;
  side?: number;
  visible?: boolean;
}
interface DuckMesh {
  isMesh?: boolean;
  visible?: boolean;
  geometry?: DuckGeometry;
  material?: DuckMaterial | DuckMaterial[];
  matrixWorld?: { elements: ArrayLike<number> };
  getVertexPosition?(index: number, target: Vector3): Vector3;
  skeleton?: { bones: DuckObject3D[] };
}
interface DuckObject3D {
  visible?: boolean;
  children?: DuckObject3D[];
  updateMatrixWorld?(force?: boolean): void;
  updateWorldMatrix?(updateParents: boolean, updateChildren: boolean): void;
  traverse?(cb: (obj: unknown) => void): void;
}

function updateSurfaceMatrices(root: DuckObject3D): void {
  // Isolated part measurements may start below a changed parent. Keep the normal
  // updateMatrixWorld dispatch too: SkinnedMesh refreshes its bind inverse there.
  root.updateWorldMatrix?.(true, false);
  root.updateMatrixWorld?.(true);
}

/** Three's own vertex reader applies morphs, then skinning, without changing the
 * source buffers. A local Vector3 works across realms; no class identity test is
 * needed. Plain GLB duck geometry retains its deterministic array fallback. */
function surfaceVertexReader(mesh: DuckMesh, position: DuckAttribute): (index: number) => Vector3 {
  for (const bone of mesh.skeleton?.bones ?? []) bone.updateWorldMatrix?.(true, false);
  const vertex = new Vector3();
  if (mesh.getVertexPosition) return (index) => mesh.getVertexPosition!(index, vertex);
  if (position.getX && position.getY && position.getZ)
    return (index) =>
      vertex.set(position.getX!(index), position.getY!(index), position.getZ!(index));
  return (index) =>
    vertex.set(
      position.array[index * 3]!,
      position.array[index * 3 + 1]!,
      position.array[index * 3 + 2]!,
    );
}

interface Tri {
  // World-space vertices, flattened [x0,y0,z0, x1,y1,z1, x2,y2,z2]
  v: Float64Array;
  color: [number, number, number];
  alpha: number;
  doubleSided: boolean;
  side: SurfaceSide;
  windingParity: 1 | -1;
}

/**
 * Opaque triangles first in scene order, then translucent ones farthest-first,
 * as a GPU renderer composites them. Drawn in scene order, a translucent pane
 * listed before the parts behind it wrote its depth first and hid them, so a
 * glazed opening read as empty. `distance` grows away from the viewer; ties keep
 * scene order, so the result stays deterministic.
 */
export function compositingOrder<T extends { v: ArrayLike<number>; alpha: number }>(
  tris: readonly T[],
  distance: (x: number, y: number, z: number) => number,
): T[] {
  const opaque: T[] = [];
  const translucent: Array<{ tri: T; key: number; index: number }> = [];
  for (const [index, tri] of tris.entries()) {
    if (tri.alpha >= 1) {
      opaque.push(tri);
      continue;
    }
    const v = tri.v;
    const key = distance(
      (v[0]! + v[3]! + v[6]!) / 3,
      (v[1]! + v[4]! + v[7]!) / 3,
      (v[2]! + v[5]! + v[8]!) / 3,
    );
    translucent.push({ tri, key, index });
  }
  translucent.sort((a, b) => b.key - a.key || a.index - b.index);
  return [...opaque, ...translucent.map((entry) => entry.tri)];
}

/**
 * Visit every object under `root` that draws. Three's rule: a node with `visible = false`
 * hides its subtree. The start node counts as shown, so a named part (an isolated subject, a
 * measured part) keeps its geometry while the whole scene leaves hidden parts out. A duck root
 * without `children` (the flat scene read from GLB bytes) is walked with `traverse`, each
 * object by its own flag.
 */
function forEachDrawn(root: DuckObject3D, visit: (obj: DuckObject3D) => void): void {
  if (!Array.isArray(root.children)) {
    root.traverse?.((obj) => {
      const node = obj as DuckObject3D;
      if (node === root || node.visible !== false) visit(node);
    });
    return;
  }
  const walk = (obj: DuckObject3D, start: boolean) => {
    if (!start && obj.visible === false) return;
    visit(obj);
    for (const child of obj.children ?? []) walk(child, false);
  };
  walk(root, true);
}

/**
 * World-space triangles of a scene in flat typed arrays: what every view of a sheet draws.
 * Collect once with {@link collectTriangleBuffers} and pass to {@link rasterizeCollected} for
 * each view; the scene must not change in between.
 */
export interface CollectedTriangles {
  count: number;
  /** Nine world coordinates per triangle: [x0,y0,z0, x1,y1,z1, x2,y2,z2]. */
  positions: Float64Array;
  /** Index into the material table, per triangle. */
  material: Uint32Array;
  /** Mesh world-transform winding parity, per triangle. */
  parity: Int8Array;
  /** Material table: clamped linear RGB (three per entry), alpha and side. */
  materialColors: Float64Array;
  materialAlphas: Float64Array;
  materialSides: Uint8Array;
  bbox: { min: Vec3; max: Vec3 };
}

/** Collect world-space triangles and base colors from a (possibly cross-realm) scene. */
export function collectTriangleBuffers(root: unknown): CollectedTriangles {
  const scene = root as DuckObject3D;
  updateSurfaceMatrices(scene);

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  // Pass 1: the meshes that draw, in draw order, and their triangle count, so the flat
  // arrays are allocated once at their final size.
  const meshes: Array<{ mesh: DuckMesh; geo: DuckGeometry; pos: DuckAttribute }> = [];
  let count = 0;
  forEachDrawn(scene, (obj) => {
    const mesh = obj as DuckMesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const pos = geo?.getAttribute?.('position');
    if (!geo || !pos || pos.itemSize !== 3) return;
    if (!mesh.matrixWorld?.elements) return;
    meshes.push({ mesh, geo, pos });
    const slots = geo.index ? geo.index.count : pos.count;
    for (let i = 0; i + 2 < slots; i += 3) count++;
  });

  const positions = new Float64Array(count * 9);
  const material = new Uint32Array(count);
  const parity = new Int8Array(count);
  const materialIds = new Map<DuckMaterial | undefined, number>();
  const colors: number[] = [];
  const alphas: number[] = [];
  const sides: SurfaceSide[] = [];
  const materialId = (mat: DuckMaterial | undefined): number => {
    let id = materialIds.get(mat);
    if (id !== undefined) return id;
    id = materialIds.size;
    materialIds.set(mat, id);
    const c = mat?.color;
    if (c) colors.push(clamp01(c.r), clamp01(c.g), clamp01(c.b));
    else colors.push(0.7, 0.7, 0.7);
    alphas.push(clamp01(mat?.opacity ?? 1));
    sides.push(mat?.doubleSided === true || mat?.side === 2 ? 2 : mat?.side === 1 ? 1 : 0);
    return id;
  };

  let t = 0;
  for (const { mesh, geo, pos } of meshes) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Per-group material resolution: a multi-material mesh draws each geometry
    // group (a start/count range over the index — or position — buffer) with its
    // own `materialIndex`. Resolve the group covering each triangle's first buffer
    // position; meshes without groups (the common single-material case) keep the
    // flat first material.
    const groups = mats.length > 1 && geo.groups?.length ? geo.groups : undefined;
    const materialAt = (bufferPos: number): DuckMaterial | undefined => {
      if (!groups) return mats[0];
      for (const g of groups) {
        if (bufferPos >= g.start && bufferPos < g.start + g.count) {
          return mats[g.materialIndex ?? 0];
        }
      }
      return mats[0];
    };

    const m = mesh.matrixWorld!.elements;
    const windingParity = worldWindingParity(m);

    const readVertex = surfaceVertexReader(mesh, pos);
    const world = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const { x, y, z } = readVertex(i);
      const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      world[i * 3] = wx;
      world[i * 3 + 1] = wy;
      world[i * 3 + 2] = wz;
      if (wx < min[0]) min[0] = wx;
      if (wy < min[1]) min[1] = wy;
      if (wz < min[2]) min[2] = wz;
      if (wx > max[0]) max[0] = wx;
      if (wy > max[1]) max[1] = wy;
      if (wz > max[2]) max[2] = wz;
    }

    // An index past the vertex buffer reads `undefined`, which a Float64Array stores as NaN:
    // the triangle keeps NaN corners, as the per-triangle collector always gave it.
    const pushTri = (a: number, b: number, c2: number, mat: DuckMaterial | undefined) => {
      const o = t * 9;
      positions[o] = world[a * 3]!;
      positions[o + 1] = world[a * 3 + 1]!;
      positions[o + 2] = world[a * 3 + 2]!;
      positions[o + 3] = world[b * 3]!;
      positions[o + 4] = world[b * 3 + 1]!;
      positions[o + 5] = world[b * 3 + 2]!;
      positions[o + 6] = world[c2 * 3]!;
      positions[o + 7] = world[c2 * 3 + 1]!;
      positions[o + 8] = world[c2 * 3 + 2]!;
      material[t] = materialId(mat);
      parity[t] = windingParity;
      t++;
    };

    // Geometry groups address the index buffer for indexed geometry and the
    // position buffer otherwise, so `i` (the triangle's first buffer slot) is
    // the group-lookup key in both branches.
    const index = geo.index;
    if (index) {
      const ia = index.array;
      for (let i = 0; i + 2 < index.count; i += 3) {
        pushTri(ia[i]!, ia[i + 1]!, ia[i + 2]!, materialAt(i));
      }
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) {
        pushTri(i, i + 1, i + 2, materialAt(i));
      }
    }
  }

  return {
    count,
    positions,
    material,
    parity,
    materialColors: Float64Array.from(colors),
    materialAlphas: Float64Array.from(alphas),
    materialSides: Uint8Array.from(sides),
    bbox: Number.isFinite(min[0]) ? { min, max } : { min: [0, 0, 0], max: [0, 0, 0] },
  };
}

/** Collect world-space triangles + base colors from a (possibly cross-realm) scene. */
export function collectTriangles(root: DuckObject3D): {
  tris: Tri[];
  bbox: { min: Vec3; max: Vec3 };
} {
  const collected = collectTriangleBuffers(root);
  const { positions, material, parity, materialColors, materialAlphas, materialSides } = collected;
  const tris: Tri[] = [];
  for (let t = 0; t < collected.count; t++) {
    const id = material[t]!;
    const side = materialSides[id] as SurfaceSide;
    tris.push({
      v: positions.slice(t * 9, t * 9 + 9),
      color: [materialColors[id * 3]!, materialColors[id * 3 + 1]!, materialColors[id * 3 + 2]!],
      alpha: materialAlphas[id]!,
      doubleSided: side === 2,
      side,
      windingParity: parity[t] as 1 | -1,
    });
  }
  return { tris, bbox: collected.bbox };
}

/**
 * View-independent per-triangle facts, derived once per collection: the flat world normal
 * (exactly as each view used to compute it), its key-light term, the opaque draw list and
 * the translucent triangles with their centroids. Lit colours are filled lazily per side.
 */
interface PreparedTriangles {
  /** Unit world normal times winding parity; NaN when the triangle has NaN corners. */
  normals: Float64Array;
  /** 1 when the normal is too short to draw (`hypot < 1e-12`). */
  collapsed: Uint8Array;
  /** dot(normal, KEY_DIR). */
  keyLight: Float64Array;
  opaque: Uint32Array;
  translucent: Uint32Array;
  translucentCentroids: Float64Array;
  /** sRGB bytes for normal sign +1 (offset 0) and -1 (offset 3), six per triangle. */
  shade: Uint8Array;
  /** Bit 1: +1 shade filled; bit 2: -1 shade filled. */
  shaded: Uint8Array;
}

const preparedTriangles = new WeakMap<CollectedTriangles, PreparedTriangles>();

function prepareTriangles(collected: CollectedTriangles): PreparedTriangles {
  const cached = preparedTriangles.get(collected);
  if (cached) return cached;
  const { count, positions: v, material, parity, materialAlphas } = collected;
  const normals = new Float64Array(count * 3);
  const collapsed = new Uint8Array(count);
  const keyLight = new Float64Array(count);
  const opaque: number[] = [];
  const translucent: number[] = [];
  for (let t = 0; t < count; t++) {
    const o = t * 9;
    // World-space face normal (flat shading; robust under non-uniform scale).
    const e10 = v[o + 3]! - v[o]!;
    const e11 = v[o + 4]! - v[o + 1]!;
    const e12 = v[o + 5]! - v[o + 2]!;
    const e20 = v[o + 6]! - v[o]!;
    const e21 = v[o + 7]! - v[o + 1]!;
    const e22 = v[o + 8]! - v[o + 2]!;
    const n0 = e11 * e22 - e12 * e21;
    const n1 = e12 * e20 - e10 * e22;
    const n2 = e10 * e21 - e11 * e20;
    const nLen = Math.hypot(n0, n1, n2);
    if (nLen < 1e-12) collapsed[t] = 1;
    const sign = parity[t]!;
    const N0 = (n0 / nLen) * sign;
    const N1 = (n1 / nLen) * sign;
    const N2 = (n2 / nLen) * sign;
    normals[t * 3] = N0;
    normals[t * 3 + 1] = N1;
    normals[t * 3 + 2] = N2;
    keyLight[t] = N0 * KEY_DIR[0] + N1 * KEY_DIR[1] + N2 * KEY_DIR[2];
    if (materialAlphas[material[t]!]! >= 1) opaque.push(t);
    else translucent.push(t);
  }
  const translucentCentroids = new Float64Array(translucent.length * 3);
  for (let k = 0; k < translucent.length; k++) {
    const o = translucent[k]! * 9;
    translucentCentroids[k * 3] = (v[o]! + v[o + 3]! + v[o + 6]!) / 3;
    translucentCentroids[k * 3 + 1] = (v[o + 1]! + v[o + 4]! + v[o + 7]!) / 3;
    translucentCentroids[k * 3 + 2] = (v[o + 2]! + v[o + 5]! + v[o + 8]!) / 3;
  }
  const prepared: PreparedTriangles = {
    normals,
    collapsed,
    keyLight,
    opaque: Uint32Array.from(opaque),
    translucent: Uint32Array.from(translucent),
    translucentCentroids,
    shade: new Uint8Array(count * 6),
    shaded: new Uint8Array(count),
  };
  preparedTriangles.set(collected, prepared);
  return prepared;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : Math.min(n, 1);
}

/**
 * Linear -> sRGB encode (the renderer's output transform). Material colors read
 * off the scene are linear-sRGB (Three.js color management converts hex strings
 * on construction), and lighting math happens in linear space — without this
 * encode the views come out far darker than the Three.js-rendered audit grids.
 */
function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * Render one orthographic view of the scene to an RGB pixel buffer
 * (size*size*3 bytes, row-major from the top-left).
 */
export function rasterizeView(
  root: unknown,
  dir: [number, number, number],
  opts: RasterOptions = {},
): Uint8Array {
  return rasterizeCollected(collectTriangleBuffers(root), dir, opts);
}

/**
 * {@link rasterizeView} from triangles already collected: a sheet collects once and draws every
 * view from the same collection, with the same pixels as collecting per view.
 */
export function rasterizeCollected(
  collected: CollectedTriangles,
  dir: [number, number, number],
  opts: RasterOptions = {},
): Uint8Array {
  const size = opts.size ?? 256;
  const cull = opts.backfaceCull ?? true;
  const BG = resolveBackdrop(opts.backdrop).rgb;
  const { bbox, positions: v, material, materialColors, materialAlphas, materialSides } = collected;

  const out = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    out[i * 3] = BG[0];
    out[i * 3 + 1] = BG[1];
    out[i * 3 + 2] = BG[2];
  }
  if (collected.count === 0) return out;
  const prepared = prepareTriangles(collected);
  const { normals, collapsed, keyLight, shade, shaded } = prepared;

  // Camera basis: z points from target toward the camera (three.js convention).
  const z = normalize(dir);
  const upHint: Vec3 = Math.abs(z[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
  const x = normalize(cross(upHint, z));
  const y = cross(z, x);

  // Framing box: a caller-supplied fixed AABB (animation grid — keeps the camera
  // steady so root travel is visible) or the scene's own bounds (static views).
  const frameMin = opts.frameBounds ? opts.frameBounds.min : bbox.min;
  const frameMax = opts.frameBounds ? opts.frameBounds.max : bbox.max;
  const center: Vec3 = [
    (frameMin[0] + frameMax[0]) / 2,
    (frameMin[1] + frameMax[1]) / 2,
    (frameMin[2] + frameMax[2]) / 2,
  ];

  // Project the 8 framing-box corners to find the framing extent for this view.
  let ext = 1e-6;
  for (let ci = 0; ci < 8; ci++) {
    const px = (ci & 1 ? frameMax[0] : frameMin[0]) - center[0];
    const py = (ci & 2 ? frameMax[1] : frameMin[1]) - center[1];
    const pz = (ci & 4 ? frameMax[2] : frameMin[2]) - center[2];
    const p: Vec3 = [px, py, pz];
    ext = Math.max(ext, Math.abs(dot(p, x)), Math.abs(dot(p, y)));
  }
  const scale = (size * 0.45) / ext; // 90% of the half-size — small margin
  const half = size / 2;

  const zbuf = new Float64Array(size * size).fill(-Infinity);

  const sx = new Float64Array(3);
  const sy = new Float64Array(3);
  const sz = new Float64Array(3);
  const weights = new Float64Array(3);
  const coverage = new TriangleCoverage();
  const [x0, x1, x2] = x;
  const [y0, y1, y2] = y;
  const [z0, z1, z2] = z;
  const [c0, c1, c2] = center;

  // Opaque triangles in scene order, then translucent ones farthest-first (see
  // compositingOrder). Orthographic: distance from the viewer runs against the view axis `z`.
  const { translucent, translucentCentroids: centroids } = prepared;
  const keys = new Float64Array(translucent.length);
  const back: number[] = [];
  for (let k = 0; k < translucent.length; k++) {
    keys[k] = -(
      (centroids[k * 3]! - c0) * z0 +
      (centroids[k * 3 + 1]! - c1) * z1 +
      (centroids[k * 3 + 2]! - c2) * z2
    );
    back.push(k);
  }
  back.sort((a, b) => keys[b]! - keys[a]! || translucent[a]! - translucent[b]!);
  const order = new Uint32Array(prepared.opaque.length + back.length);
  order.set(prepared.opaque);
  for (let k = 0; k < back.length; k++) order[prepared.opaque.length + k] = translucent[back[k]!]!;

  for (let n = 0; n < order.length; n++) {
    const t = order[n]!;
    if (collapsed[t]) continue;
    const id = material[t]!;
    const alpha = materialAlphas[id]!;

    const facing = normals[t * 3]! * z0 + normals[t * 3 + 1]! * z1 + normals[t * 3 + 2]! * z2;
    const normalSign = visibleNormalSign(facing, materialSides[id] as SurfaceSide, cull);
    if (normalSign === 0) continue;
    if (alpha <= 0) continue;

    // Project to screen space.
    const o = t * 9;
    for (let i = 0; i < 3; i++) {
      const px = v[o + i * 3]! - c0;
      const py = v[o + i * 3 + 1]! - c1;
      const pz = v[o + i * 3 + 2]! - c2;
      sx[i] = half + (px * x0 + py * x1 + pz * x2) * scale;
      sy[i] = half - (px * y0 + py * y1 + pz * y2) * scale;
      sz[i] = px * z0 + py * z1 + pz * z2;
    }

    // Flat lambert with the audit-grid light rig, in linear space, then the
    // sRGB output transform (matching what a Three.js renderer would write).
    // A triangle's colour depends only on its normal sign, so it is computed once per
    // sign and reused by later views; a NaN channel is never cached.
    const bit = normalSign > 0 ? 1 : 2;
    const so = t * 6 + (normalSign > 0 ? 0 : 3);
    let r: number;
    let g: number;
    let b: number;
    if (shaded[t]! & bit) {
      r = shade[so]!;
      g = shade[so + 1]!;
      b = shade[so + 2]!;
    } else {
      const lambert = Math.max(0, keyLight[t]! * normalSign);
      const lit = Math.min(1, AMBIENT + KEY_INTENSITY * lambert);
      r = Math.round(linearToSrgb(materialColors[id * 3]! * lit) * 255);
      g = Math.round(linearToSrgb(materialColors[id * 3 + 1]! * lit) * 255);
      b = Math.round(linearToSrgb(materialColors[id * 3 + 2]! * lit) * 255);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        shade[so] = r;
        shade[so + 1] = g;
        shade[so + 2] = b;
        shaded[t] = shaded[t]! | bit;
      }
    }

    if (!coverage.prepare(sx[0]!, sy[0]!, sx[1]!, sy[1]!, sx[2]!, sy[2]!, size)) continue;
    const { minX, maxX, minY, maxY } = coverage;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        if (!coverage.sample(px + 0.5, py + 0.5, weights)) continue;
        const depth = weights[0]! * sz[0]! + weights[1]! * sz[1]! + weights[2]! * sz[2]!;
        const pi = py * size + px;
        if (depth <= zbuf[pi]!) continue;
        zbuf[pi] = depth;
        if (alpha >= 1) {
          out[pi * 3] = r;
          out[pi * 3 + 1] = g;
          out[pi * 3 + 2] = b;
        } else {
          const inverse = 1 - alpha;
          out[pi * 3] = Math.round(r * alpha + out[pi * 3]! * inverse);
          out[pi * 3 + 1] = Math.round(g * alpha + out[pi * 3 + 1]! * inverse);
          out[pi * 3 + 2] = Math.round(b * alpha + out[pi * 3 + 2]! * inverse);
        }
      }
    }
  }

  return out;
}

/** The position attribute and world matrix of a drawn mesh, under the rasterizer's own rules. */
function drawnMeshPositions(obj: unknown):
  | {
      mesh: DuckMesh;
      position: DuckAttribute;
      matrix: ArrayLike<number>;
    }
  | undefined {
  const mesh = obj as DuckMesh;
  if (!mesh.isMesh) return undefined;
  const position = mesh.geometry?.getAttribute?.('position');
  const matrix = mesh.matrixWorld?.elements;
  if (position?.itemSize !== 3 || !matrix) return undefined;
  return { mesh, position, matrix };
}

/**
 * The box and triangle count of what `collectTriangles` draws, in one walk over positions: no
 * per-triangle record, so measuring a scene costs its vertices and not its garbage. The box covers
 * every position of every drawn mesh, as the rasterizer's does, and is zero when nothing draws.
 */
export function measureDrawnGeometry(root: unknown): {
  min: [number, number, number];
  max: [number, number, number];
  triangles: number;
} {
  updateSurfaceMatrices(root as DuckObject3D);
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  forEachDrawn(root as DuckObject3D, (obj) => {
    const drawn = drawnMeshPositions(obj);
    if (!drawn) return;
    const { mesh, position, matrix: m } = drawn;
    const readVertex = surfaceVertexReader(mesh, position);
    for (let i = 0; i < position.count; i++) {
      const { x, y, z } = readVertex(i);
      const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      const wz = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      if (wx < min[0]) min[0] = wx;
      if (wy < min[1]) min[1] = wy;
      if (wz < min[2]) min[2] = wz;
      if (wx > max[0]) max[0] = wx;
      if (wy > max[1]) max[1] = wy;
      if (wz > max[2]) max[2] = wz;
    }
    triangles += Math.floor((mesh.geometry!.index?.count ?? position.count) / 3);
  });
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], triangles };
  return { min, max, triangles };
}

/** How far `at` lies outside the span of three coordinates; zero inside it. */
function gapToInterval(a: number, b: number, c: number, at: number): number {
  return Math.max(Math.min(a, b, c) - at, 0, at - Math.max(a, b, c));
}

/**
 * Distance from a point to the nearest drawn triangle's world box, without a record per triangle.
 * Infinity when nothing draws. Each mesh's world positions are computed once and shared by its
 * triangles.
 */
export function nearestDrawnTriangleDistance(
  root: unknown,
  point: readonly [number, number, number],
): number {
  updateSurfaceMatrices(root as DuckObject3D);
  const [px, py, pz] = point;
  let nearest = Number.POSITIVE_INFINITY;
  forEachDrawn(root as DuckObject3D, (obj) => {
    if (nearest === 0) return;
    const drawn = drawnMeshPositions(obj);
    if (!drawn) return;
    const { mesh, position, matrix: m } = drawn;
    const readVertex = surfaceVertexReader(mesh, position);
    const world = new Float64Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      const { x, y, z } = readVertex(i);
      world[i * 3] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      world[i * 3 + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      world[i * 3 + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
    }
    const index = mesh.geometry!.index;
    const slots = index ? index.count : position.count;
    for (let i = 0; i + 2 < slots && nearest !== 0; i += 3) {
      const a = (index ? index.array[i]! : i) * 3;
      const b = (index ? index.array[i + 1]! : i + 1) * 3;
      const c = (index ? index.array[i + 2]! : i + 2) * 3;
      const dx = gapToInterval(world[a]!, world[b]!, world[c]!, px);
      const dy = gapToInterval(world[a + 1]!, world[b + 1]!, world[c + 1]!, py);
      const dz = gapToInterval(world[a + 2]!, world[b + 2]!, world[c + 2]!, pz);
      nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
  });
  return nearest;
}

/** World-space AABB of a (possibly sandbox-created) scene's drawable geometry: the box
 *  the rasterizer draws within. Empty scenes report a zero box. Used by the animation
 *  grid to union bounds across posed frames into one steady camera framing. */
export function measureBounds(root: unknown): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const { min, max } = measureDrawnGeometry(root);
  return { min, max };
}

/** Unlike camera framing, an empty part has no measurable geometry bounds. */
export function measurePartBounds(root: unknown): ReturnType<typeof measureBounds> | null {
  const { min, max, triangles } = measureDrawnGeometry(root);
  return triangles ? { min, max } : null;
}

/**
 * `measurePartBounds` for many nodes of one scene: the same meshes (each node as it
 * draws when shown, hidden descendants left out, every position vertex, null without a
 * triangle), but each mesh is transformed once however many requested ancestors contain it.
 */
export function createPartBoundsReader(
  root: unknown,
): (node: unknown) => ReturnType<typeof measureBounds> | null {
  updateSurfaceMatrices(root as DuckObject3D);
  const own = new Map<unknown, { min: Vec3; max: Vec3; tris: number } | null>();
  const meshBounds = (obj: unknown) => {
    if (own.has(obj)) return own.get(obj)!;
    const mesh = obj as DuckMesh;
    const pos = mesh.isMesh ? mesh.geometry?.getAttribute?.('position') : undefined;
    const m = mesh.matrixWorld?.elements;
    let result: { min: Vec3; max: Vec3; tris: number } | null = null;
    if (pos && pos.itemSize === 3 && m) {
      const min: Vec3 = [Infinity, Infinity, Infinity];
      const max: Vec3 = [-Infinity, -Infinity, -Infinity];
      const readVertex = surfaceVertexReader(mesh, pos);
      for (let i = 0; i < pos.count; i++) {
        const { x, y, z } = readVertex(i);
        const w: Vec3 = [
          m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
          m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
          m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
        ];
        for (let k = 0; k < 3; k++) {
          if (w[k]! < min[k]!) min[k] = w[k]!;
          if (w[k]! > max[k]!) max[k] = w[k]!;
        }
      }
      const count = mesh.geometry?.index ? mesh.geometry.index.count : pos.count;
      result = { min, max, tris: Math.floor(count / 3) };
    }
    own.set(obj, result);
    return result;
  };
  return (node) => {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    let tris = 0;
    forEachDrawn(node as DuckObject3D, (obj) => {
      const bounds = meshBounds(obj);
      if (!bounds) return;
      tris += bounds.tris;
      for (let k = 0; k < 3; k++) {
        if (bounds.min[k]! < min[k]!) min[k] = bounds.min[k]!;
        if (bounds.max[k]! > max[k]!) max[k] = bounds.max[k]!;
      }
    });
    return tris ? { min, max } : null;
  };
}

/**
 * Fraction of non-background pixels — used by tests and occupancy checks. The
 * raster must be measured against the backdrop it was painted with, so pass the
 * same `backdrop` the render used (omitted on both sides means the default).
 */
export function coverage(rgb: Uint8Array, size: number, backdrop?: BackdropId): number {
  const BG = resolveBackdrop(backdrop).rgb;
  let filled = 0;
  for (let i = 0; i < size * size; i++) {
    if (rgb[i * 3] !== BG[0] || rgb[i * 3 + 1] !== BG[1] || rgb[i * 3 + 2] !== BG[2]) filled++;
  }
  return filled / (size * size);
}

/**
 * Hide a named subtree from the rasterizer so a view can see past it (lift a roof,
 * cut away a near wall). `collectTriangles` hides a hidden node's subtree, but a flat
 * duck scene (no `children`) culls per mesh, so this sets `.visible = false` on each
 * matched node AND every descendant.
 *
 * `match` is either a string (case-insensitive exact match OR startsWith — so
 * "Roof" also lifts "Roof_Ridge") or a predicate over the node name. Returns the
 * number of matched subtree roots hidden (0 → nothing matched; the caller decides
 * whether to warn). Pure helper; mutates `.visible` on the passed scene.
 */
export function hideNodeInScene(
  root: unknown,
  match: string | ((name: string) => boolean),
): number {
  const test =
    typeof match === 'function'
      ? match
      : (name: string) => {
          const t = match.toLowerCase();
          const n = name.toLowerCase();
          return n === t || n.startsWith(t);
        };
  let hidden = 0;
  const r = root as DuckObject3D;
  r.traverse?.((obj) => {
    const node = obj as {
      name?: string;
      traverse?(cb: (o: unknown) => void): void;
    };
    if (!node.name || !test(node.name)) return;
    hidden++;
    // Flip the matched node and its whole subtree (the per-mesh cull means hiding
    // just the group is not enough — the leaf meshes must be invisible).
    node.traverse?.((d) => {
      (d as { visible?: boolean }).visible = false;
    });
  });
  return hidden;
}
