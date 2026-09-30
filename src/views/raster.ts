/**
 * Pure-CPU orthographic rasterizer for Kiln scene graphs.
 *
 * Why this exists: the agent loop needs to SEE its asset (kiln_screenshot)
 * but no GPU/browser renderer is available everywhere the loop runs — the
 * kiln-studio agent-runtime container ships without a browser
 * (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1) and Playwright is unsupported under
 * Bun on Windows (see imposter/bake.ts). headless-gl is WebGL1-only while
 * three >= r163 requires WebGL2. So: a dependency-free scanline z-buffer
 * rasterizer over the executed scene. Flat lambert, base color only — enough
 * fidelity for silhouette / proportion / orientation / contact QA, which is
 * what the vision loop checks.
 *
 * Scene access is strictly duck-typed (`.isMesh`, `matrixWorld.elements`,
 * position attribute arrays) because sandbox-created objects live in a
 * different module realm — see executeKilnCode in ../render.ts.
 *
 * Lighting matches scripts/visual-audit.ts: key directional light from
 * [1.5, 2, 1] at 1.1 plus 0.25 ambient. Back-face culling is strict (like
 * the offline audit grid) so inverted winding shows up as missing faces.
 */

import { resolveBackdrop, type BackdropId } from './background';

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
  frameBounds?: { min: [number, number, number]; max: [number, number, number] };
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
  visible?: boolean;
}
interface DuckMesh {
  isMesh?: boolean;
  visible?: boolean;
  geometry?: DuckGeometry;
  material?: DuckMaterial | DuckMaterial[];
  matrixWorld?: { elements: ArrayLike<number> };
}
interface DuckObject3D {
  visible?: boolean;
  children?: DuckObject3D[];
  updateMatrixWorld?(force?: boolean): void;
  traverse?(cb: (obj: unknown) => void): void;
}

interface Tri {
  // World-space vertices, flattened [x0,y0,z0, x1,y1,z1, x2,y2,z2]
  v: Float64Array;
  color: [number, number, number];
  alpha: number;
  doubleSided: boolean;
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

/** Collect world-space triangles + base colors from a (possibly cross-realm) scene. */
export function collectTriangles(root: DuckObject3D): {
  tris: Tri[];
  bbox: { min: Vec3; max: Vec3 };
} {
  root.updateMatrixWorld?.(true);

  const tris: Tri[] = [];
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  const drawMesh = (obj: unknown) => {
    const mesh = obj as DuckMesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry;
    const pos = geo?.getAttribute?.('position');
    if (!geo || !pos || pos.itemSize !== 3) return;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const colorOf = (mat: DuckMaterial | undefined): [number, number, number] => {
      const c = mat?.color;
      return c ? [clamp01(c.r), clamp01(c.g), clamp01(c.b)] : [0.7, 0.7, 0.7];
    };
    // Per-group material resolution: a multi-material mesh draws each geometry
    // group (a start/count range over the index — or position — buffer) with its
    // own `materialIndex`. Colors are already per-triangle here, so resolve the
    // group covering each triangle's first buffer position; meshes without
    // groups (the common single-material case) keep the flat first material.
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

    const m = mesh.matrixWorld?.elements;
    if (!m) return;

    const arr = pos.array;
    const world = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3]!;
      const y = arr[i * 3 + 1]!;
      const z = arr[i * 3 + 2]!;
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

    const pushTri = (a: number, b: number, c2: number, material: DuckMaterial | undefined) => {
      const v = new Float64Array(9);
      v[0] = world[a * 3]!;
      v[1] = world[a * 3 + 1]!;
      v[2] = world[a * 3 + 2]!;
      v[3] = world[b * 3]!;
      v[4] = world[b * 3 + 1]!;
      v[5] = world[b * 3 + 2]!;
      v[6] = world[c2 * 3]!;
      v[7] = world[c2 * 3 + 1]!;
      v[8] = world[c2 * 3 + 2]!;
      tris.push({
        v,
        color: colorOf(material),
        alpha: clamp01(material?.opacity ?? 1),
        doubleSided: material?.doubleSided === true,
      });
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
  };
  forEachDrawn(root, drawMesh);

  if (!Number.isFinite(min[0])) {
    return { tris, bbox: { min: [0, 0, 0], max: [0, 0, 0] } };
  }
  return { tris, bbox: { min, max } };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
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
  const size = opts.size ?? 256;
  const cull = opts.backfaceCull ?? true;
  const BG = resolveBackdrop(opts.backdrop).rgb;
  const { tris, bbox } = collectTriangles(root as DuckObject3D);

  const out = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    out[i * 3] = BG[0];
    out[i * 3 + 1] = BG[1];
    out[i * 3 + 2] = BG[2];
  }
  if (tris.length === 0) return out;

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

  // Orthographic: distance from the viewer runs against the view axis `z`.
  const ordered = compositingOrder(
    tris,
    (px, py, pz) => -((px - center[0]) * z[0] + (py - center[1]) * z[1] + (pz - center[2]) * z[2]),
  );
  for (const tri of ordered) {
    // World-space face normal (flat shading; robust under non-uniform scale).
    const e1: Vec3 = [tri.v[3]! - tri.v[0]!, tri.v[4]! - tri.v[1]!, tri.v[5]! - tri.v[2]!];
    const e2: Vec3 = [tri.v[6]! - tri.v[0]!, tri.v[7]! - tri.v[1]!, tri.v[8]! - tri.v[2]!];
    const n = cross(e1, e2);
    const nLen = Math.hypot(n[0], n[1], n[2]);
    if (nLen < 1e-12) continue;
    const N: Vec3 = [n[0] / nLen, n[1] / nLen, n[2] / nLen];

    const facing = dot(N, z);
    if (cull && facing <= 0 && !tri.doubleSided) continue;
    if (tri.alpha <= 0) continue;

    // Project to screen space.
    for (let i = 0; i < 3; i++) {
      const px = tri.v[i * 3]! - center[0];
      const py = tri.v[i * 3 + 1]! - center[1];
      const pz = tri.v[i * 3 + 2]! - center[2];
      const p: Vec3 = [px, py, pz];
      sx[i] = half + dot(p, x) * scale;
      sy[i] = half - dot(p, y) * scale;
      sz[i] = dot(p, z);
    }

    // Flat lambert with the audit-grid light rig, in linear space, then the
    // sRGB output transform (matching what a Three.js renderer would write).
    const lambert = Math.max(0, dot(N, KEY_DIR));
    const lit = Math.min(1, AMBIENT + KEY_INTENSITY * lambert);
    const r = Math.round(linearToSrgb(tri.color[0] * lit) * 255);
    const g = Math.round(linearToSrgb(tri.color[1] * lit) * 255);
    const b = Math.round(linearToSrgb(tri.color[2] * lit) * 255);

    // Rasterize via edge functions.
    const minX = Math.max(0, Math.floor(Math.min(sx[0]!, sx[1]!, sx[2]!)));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(sx[0]!, sx[1]!, sx[2]!)));
    const minY = Math.max(0, Math.floor(Math.min(sy[0]!, sy[1]!, sy[2]!)));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(sy[0]!, sy[1]!, sy[2]!)));
    if (minX > maxX || minY > maxY) continue;

    const ax = sx[0]!,
      ay = sy[0]!,
      bx2 = sx[1]!,
      by = sy[1]!,
      cx = sx[2]!,
      cy = sy[2]!;
    const area = (bx2 - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-9) continue;
    const invArea = 1 / area;

    for (let py = minY; py <= maxY; py++) {
      for (let px = minX; px <= maxX; px++) {
        const cxp = px + 0.5;
        const cyp = py + 0.5;
        const w0 = ((bx2 - ax) * (cyp - ay) - (by - ay) * (cxp - ax)) * invArea;
        const w1 = ((cx - bx2) * (cyp - by) - (cy - by) * (cxp - bx2)) * invArea;
        const w2 = 1 - w0 - w1;
        // Accept either winding on screen (back-face culling already happened
        // in world space) — check all barycentrics share the area's sign space.
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        // Barycentric weights map: w0 → vertex C, w1 → vertex A, w2 → vertex B
        // for this edge-function arrangement; depth interpolation just needs a
        // consistent convex combination, so order doesn't matter for QA views.
        const depth = w1 * sz[0]! + w2 * sz[1]! + w0 * sz[2]!;
        const pi = py * size + px;
        if (depth <= zbuf[pi]!) continue;
        zbuf[pi] = depth;
        if (tri.alpha >= 1) {
          out[pi * 3] = r;
          out[pi * 3 + 1] = g;
          out[pi * 3 + 2] = b;
        } else {
          const inverse = 1 - tri.alpha;
          out[pi * 3] = Math.round(r * tri.alpha + out[pi * 3]! * inverse);
          out[pi * 3 + 1] = Math.round(g * tri.alpha + out[pi * 3 + 1]! * inverse);
          out[pi * 3 + 2] = Math.round(b * tri.alpha + out[pi * 3 + 2]! * inverse);
        }
      }
    }
  }

  return out;
}

/** World-space AABB of a (possibly sandbox-created) scene's drawable geometry.
 *  Reuses the rasterizer's own triangle collection so the box matches exactly what
 *  gets drawn. Empty scenes report a zero box. Used by the animation grid to union
 *  bounds across posed frames into one steady camera framing. */
export function measureBounds(root: unknown): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const { bbox } = collectTriangles(root as DuckObject3D);
  return { min: [...bbox.min], max: [...bbox.max] };
}

/** Unlike camera framing, an empty part has no measurable geometry bounds. */
export function measurePartBounds(root: unknown): ReturnType<typeof measureBounds> | null {
  const { tris, bbox } = collectTriangles(root as DuckObject3D);
  return tris.length ? { min: [...bbox.min], max: [...bbox.max] } : null;
}

/**
 * `measurePartBounds` for many nodes of one scene: the same meshes (each node as it
 * draws when shown, hidden descendants left out, every position vertex, null without a
 * triangle), but each mesh is transformed once however many requested ancestors contain it.
 */
export function createPartBoundsReader(
  root: unknown,
): (node: unknown) => ReturnType<typeof measureBounds> | null {
  (root as DuckObject3D).updateMatrixWorld?.(true);
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
      const arr = pos.array;
      for (let i = 0; i < pos.count; i++) {
        const x = arr[i * 3]!,
          y = arr[i * 3 + 1]!,
          z = arr[i * 3 + 2]!;
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
    const node = obj as { name?: string; traverse?(cb: (o: unknown) => void): void };
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
