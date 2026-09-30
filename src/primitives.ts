/**
 * Kiln Primitives Library
 *
 * High-level helpers for 3D asset creation.
 * Claude generates code using these primitives to keep files small.
 *
 * Copied from packages/client/src/lib/kiln/primitives.ts as the canonical
 * source in @pixel-forge/core. The headless variant in scripts/export-glb.ts
 * was verified structurally identical; the two have been reconciled here.
 */

import * as THREE from 'three';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';
import {
  assertDimension,
  assertPrimitiveSegments,
  assertPrimitiveGrid,
  assertFiniteTriple,
  GEOMETRY_ALLOCATION_LIMITS,
} from './geometry-budget';
import { buildWallPanels } from './wall-panels';
import { createJointChain } from './character';
import { describeAssembly, replicateAssembly } from './assembly';
export * from './assembly';
export { createRoofPlanes } from './architecture';
export type { RoofPlanesOptions } from './architecture';
import {
  createGableEndPanel,
  createGableRoof,
  createGableShell,
  createRoofPlanes,
  createRoofSurfaceLayout,
} from './architecture';
import * as gears from './gears';
import * as ops from './ops';
import * as geometry from './geometry';
import * as deform from './deform';
import * as sweep from './sweep';
import { implicitSurface } from './implicit';
export * from './implicit';
export * from './sweep';
export * from './deform';
export * from './geometry';
import * as profile from './profile';
import * as solids from './solids';
import * as proceduralTextures from './procedural-texture';
import * as textures from './textures';
import type { TextureResolver } from './texture-resolver';
import { compilePortableMaterialSpecV2 } from './portable-material-runtime';
import { createVehicleFrame, createWheelAssembly, createWheelGeometrySet } from './vehicle';
import {
  stampSemanticMetadataV1,
  type SemanticMetadataV1,
  type SemanticMetadataV1Input,
} from './contracts';
import * as uv from './uv';
import * as uvShapes from './uv-shapes';
import { projectUV } from './uv-project';
export { projectUV } from './uv-project';
export type { ProjectUVOptions } from './uv-project';
export { remapUV } from './uv-shapes';
export type { RemapUVOptions } from './uv-shapes';

export {
  createGableEndPanel,
  createGableRoof,
  createGableShell,
  createRoofSurfaceLayout,
} from './architecture';
export type {
  GableEndPanelOptions,
  GableRoofOptions,
  GableShellOptions,
  RoofFaceFrame,
  RoofSurfaceLayoutOptions,
} from './architecture';
export { createJointChain } from './character';
export type {
  CreateJointChainOptionsV1,
  JointChainResultV1,
  JointChainSegmentV1,
} from './character';
export {
  createVehicleFrame,
  createWheelAssembly,
  createWheelGeometrySet,
} from './vehicle';
export { materialRecipe } from './material-recipe-runtime';
export type { ApplyMaterialRecipeOptions } from './material-recipe-runtime';
export type { MaterialRecipeId, MaterialRecipeOverridesV1 } from './material-recipes';
export { compilePortableMaterialSpecV2 } from './portable-material-runtime';
export {
  MAX_PORTABLE_MATERIAL_TEXELS,
  MAX_PORTABLE_MATERIAL_TEXTURES,
  MAX_PROCEDURAL_LAYERS,
  MAX_PROCEDURAL_SIZE,
  PORTABLE_MATERIAL_SPEC_VERSION,
  PROCEDURAL_TEXTURE_SPEC_VERSION,
  ProceduralTextureError,
  canonicalProceduralTextureJsonV2,
  canonicalizePortableMaterialSpecV2,
  canonicalizeProceduralTextureSpecV2,
  compileProceduralTextureSpecV2,
  hashProceduralTextureSpecV2,
  migrateProceduralTextureSpecV1,
} from './procedural-texture';
export type {
  CanonicalPortableMaterialSpecV2,
  CanonicalProceduralTextureSpecV2,
  PortableMaterialSpecV2,
  ProceduralLayer,
  ProceduralTextureSpec,
  ProceduralTextureSpecV1,
  ProceduralTextureSpecV2,
} from './procedural-texture';
export type {
  VehicleFrameOptions,
  VehicleFrameResult,
  WheelAssemblyOptions,
  WheelAssemblyResult,
  WheelGeometrySet,
  WheelMaterialSet,
} from './vehicle';

type Vec3Tuple = [number, number, number];

function vectorToTuple(v: THREE.Vector3): Vec3Tuple {
  return [v.x, v.y, v.z];
}

// =============================================================================
// Geometry Helpers
// =============================================================================

/**
 * Creates the root Object3D for an asset.
 */
export function createRoot(name: string): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = name;
  return root;
}

/**
 * Creates a pivot (empty Object3D) for skeletal animation.
 * Pivots are the joints that get animated; meshes are children.
 */
export function createPivot(
  name: string,
  position: [number, number, number] = [0, 0, 0],
  parent?: THREE.Object3D,
): THREE.Object3D {
  const pivot = new THREE.Object3D();
  pivot.name = `Joint_${name}`;
  pivot.position.set(...position);
  if (parent) parent.add(pivot);
  return pivot;
}

/**
 * Creates a mesh with automatic pivot wrapping for animation.
 * The mesh is automatically added to `parent` if provided.
 *
 * Returns the added Object3D (mesh or pivot) for reference.
 * NOTE: Do NOT call .add() on the return value - it's already added!
 */
/**
 * The three positional arguments, checked at the door.
 *
 * `new THREE.Mesh()` accepts anything at all and fails much later somewhere
 * else. A dispatched model that wrote `createPart(root, { geo: boxGeo, material })`
 * -- the shape most other scene APIs take, and the single most common way to get
 * this call wrong -- got all the way to the exporter and died on
 * `undefined is not an object (evaluating 'Object.keys(morphAttributes)')`.
 * That message names nothing the author did and gives a model no way back, so it
 * spends its remaining turns guessing. Three cheap instanceof checks turn the
 * same mistake into a sentence that says what was passed, what was wanted, and
 * what the call looks like when it is right.
 *
 * The tests are the `isBufferGeometry` / `isMaterial` flags rather than
 * `instanceof`, and that is not a style choice. `three-subdivide` resolves its
 * own copy of three, so `subdivide()` hands back a geometry whose prototype
 * chain belongs to a different THREE -- `instanceof` says no to something that
 * is a geometry in every way that matters, and the lighthouse's rocks go
 * through exactly that path. Three.js ships those flags for this reason.
 */
function assertPartArgs(name: unknown, geometry: unknown, material: unknown): void {
  const SIG =
    'Signature: createPart(name, geometry, material, options?) -- ' +
    "e.g. createPart('Hull', boxGeo(1, 1, 1), gameMaterial(0x808080), { parent: root }).";

  if (typeof name !== 'string') {
    const asObject = name as { isObject3D?: boolean; name?: string } | null;
    const got =
      asObject?.isObject3D === true
        ? `an Object3D ("${asObject.name || 'unnamed'}"). The parent belongs in the options object as { parent }, not first`
        : `${name === null ? 'null' : typeof name}`;
    throw new AuthoringDiagnosticError(
      'PART_NAME_ARGUMENT',
      `createPart: the first argument is the part NAME, a string, but got ${got}. ${SIG}`,
    );
  }

  if ((geometry as { isBufferGeometry?: boolean } | null)?.isBufferGeometry !== true) {
    let got: string;
    if (typeof geometry === 'function') {
      got =
        'a function -- geometry helpers have to be CALLED, so boxGeo(1, 1, 1) rather than boxGeo';
    } else if (geometry instanceof Promise) {
      got =
        'a Promise -- roundedBoxGeo, extrudeProfile and revolveProfile are async, ' +
        'so await the helper and mark build() async';
    } else {
      got =
        geometry === null ? 'null' : geometry === undefined ? 'undefined' : `a ${typeof geometry}`;
    }
    throw new AuthoringDiagnosticError(
      'PART_GEOMETRY_ARGUMENT',
      `createPart("${name}"): the second argument must be a geometry, but got ${got}. ${SIG}`,
    );
  }

  if ((material as { isMaterial?: boolean } | null)?.isMaterial !== true) {
    const got =
      typeof material === 'number'
        ? 'a number -- a colour is not a material, so wrap it: gameMaterial(0x808080)'
        : material === null
          ? 'null'
          : material === undefined
            ? 'undefined'
            : `a ${typeof material}`;
    throw new AuthoringDiagnosticError(
      'PART_MATERIAL_ARGUMENT',
      `createPart("${name}"): the third argument must be a material, but got ${got}. ${SIG}`,
    );
  }
}

export function createPart(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  options: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    pivot?: boolean; // Wrap in pivot for animation
    parent?: THREE.Object3D;
    /** Versioned roles/relationships/local frames/sockets stamped on the returned
     * helper node and preserved in glTF node extras. */
    semantic?: SemanticMetadataV1 | SemanticMetadataV1Input;
  } = {},
): THREE.Object3D {
  assertPartArgs(name, geometry, material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `Mesh_${name}`;

  if (options.position) mesh.position.set(...options.position);
  if (options.rotation)
    mesh.rotation.set(
      THREE.MathUtils.degToRad(options.rotation[0]),
      THREE.MathUtils.degToRad(options.rotation[1]),
      THREE.MathUtils.degToRad(options.rotation[2]),
    );
  if (options.scale) mesh.scale.set(...options.scale);

  if (options.pivot) {
    const pivot = new THREE.Object3D();
    pivot.name = `Joint_${name}`;
    pivot.add(mesh);
    mesh.position.set(0, 0, 0); // Reset - pivot controls position
    if (options.position) pivot.position.set(...options.position);
    if (options.parent) options.parent.add(pivot);
    if (options.semantic) stampSemanticMetadataV1(pivot, options.semantic);
    return pivot; // Return the pivot (the animatable node)
  }

  if (options.parent) options.parent.add(mesh);
  if (options.semantic) stampSemanticMetadataV1(mesh, options.semantic);
  return mesh; // Return the mesh
}

// =============================================================================
// Common Shapes (game-ready low-poly)
// =============================================================================

export function capsuleGeo(radius: number, height: number, segments = 6): THREE.CapsuleGeometry {
  assertDimension('capsuleGeo radius', radius);
  assertDimension('capsuleGeo height (straight middle length)', height, true);
  assertDimension('capsuleGeo outer half-length', height / 2 + radius);
  assertPrimitiveSegments('capsuleGeo segments', segments, 3);
  return new THREE.CapsuleGeometry(radius, height, 2, segments);
}

export function capsuleXGeo(radius: number, length: number, segments = 6): THREE.CapsuleGeometry {
  const geo = capsuleGeo(radius, length, segments);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

export function capsuleZGeo(radius: number, length: number, segments = 6): THREE.CapsuleGeometry {
  const geo = capsuleGeo(radius, length, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function cylinderGeo(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments = 8,
): THREE.CylinderGeometry {
  assertDimension('cylinderGeo radiusTop', radiusTop, true);
  assertDimension('cylinderGeo radiusBottom', radiusBottom, true);
  if (radiusTop === 0 && radiusBottom === 0)
    throw new RangeError('cylinderGeo requires at least one positive radius.');
  assertDimension('cylinderGeo height', height);
  assertPrimitiveSegments('cylinderGeo segments', segments, 3);
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
}

export function cylinderXGeo(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  segments = 8,
): THREE.CylinderGeometry {
  const geo = cylinderGeo(radiusTop, radiusBottom, length, segments);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

export function cylinderZGeo(
  radiusTop: number,
  radiusBottom: number,
  length: number,
  segments = 8,
): THREE.CylinderGeometry {
  const geo = cylinderGeo(radiusTop, radiusBottom, length, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export function boxGeo(width: number, height: number, depth: number): THREE.BoxGeometry {
  for (const [name, value] of Object.entries({ width, height, depth }))
    assertDimension(`boxGeo ${name} (use planeGeo for a sheet)`, value);
  return new THREE.BoxGeometry(width, height, depth);
}

export function sphereGeo(
  radius: number,
  widthSegments = 8,
  heightSegments = 6,
): THREE.SphereGeometry {
  assertDimension('sphereGeo radius', radius);
  assertPrimitiveSegments('sphereGeo widthSegments', widthSegments, 3);
  assertPrimitiveSegments('sphereGeo heightSegments', heightSegments, 2);
  assertPrimitiveGrid('sphereGeo', widthSegments, heightSegments);
  return new THREE.SphereGeometry(radius, widthSegments, heightSegments);
}

export function coneGeo(radius: number, height: number, segments = 8): THREE.ConeGeometry {
  assertDimension('coneGeo radius', radius);
  assertDimension('coneGeo height', height);
  assertPrimitiveSegments('coneGeo segments', segments, 3);
  return new THREE.ConeGeometry(radius, height, segments);
}

export function coneXGeo(radius: number, length: number, segments = 8): THREE.ConeGeometry {
  const geo = coneGeo(radius, length, segments);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

export function coneZGeo(radius: number, length: number, segments = 8): THREE.ConeGeometry {
  const geo = coneGeo(radius, length, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Y-axis aliases. The base geometries (`cylinderGeo`, `capsuleGeo`, `coneGeo`)
// are already Y-axis by default, but LLMs see `*XGeo` / `*ZGeo` and infer a
// matching `*YGeo` sibling. Rather than argue the naming, we accept the
// symmetric form and route it to the base implementation. No behavior change
// for existing code.
export const cylinderYGeo = cylinderGeo;
export const capsuleYGeo = capsuleGeo;
export const coneYGeo = coneGeo;

/**
 * Frame-first cylinder. Builds a Y-up cylinder of `height` at the origin,
 * orients its axis to `normal`, and translates the center to `center`. Use
 * this when the cylinder needs to point along a non-cardinal axis — struts
 * inside CSG operands, antennas off a tilted surface, anything where the
 * `*XGeo` / `*ZGeo` variants don't fit.
 *
 * `radiusTop === radiusBottom` for plain tubes; pass different values for a
 * tapered/conical body without reaching for `coneGeo`.
 *
 * The returned geometry has its position pre-baked. You can pass it straight
 * to `new THREE.Mesh(...)` without further rotation.
 */
export function cylinderOnAxis(
  center: Vec3Tuple,
  normal: Vec3Tuple,
  radiusBottom: number,
  height: number,
  options: { radiusTop?: number; segments?: number } = {},
): THREE.CylinderGeometry {
  const radiusTop = options.radiusTop ?? radiusBottom;
  const segments = options.segments ?? 8;
  assertFiniteTriple('cylinderOnAxis center', center);
  assertFiniteTriple('cylinderOnAxis normal', normal);
  const n = new THREE.Vector3(normal[0], normal[1], normal[2]);
  const len = Math.hypot(...normal);
  if (len < 1e-6) {
    throw new Error(
      `cylinderOnAxis: normal must be a non-zero vector (got [${normal.join(',')}]).`,
    );
  }
  // Normalize by a component first so finite vectors cannot overflow lengthSq.
  const magnitude = Math.max(...normal.map(Math.abs));
  n.set(normal[0] / magnitude, normal[1] / magnitude, normal[2] / magnitude).normalize();
  const geo = cylinderGeo(radiusTop, radiusBottom, height, segments);

  // Quaternion from Y to normal.
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  geo.applyQuaternion(q);
  geo.translate(center[0], center[1], center[2]);
  return geo;
}

/**
 * Tapered cone helper that exposes the bottom + top radius. The default Y-up
 * `coneGeo` is apex-only (top radius locked at 0); for truncated/frustum
 * shapes — soda cans, pylon caps, lampshades — pass a non-zero
 * `radiusTop`. When `radiusTop === 0` it matches `coneGeo` exactly; when
 * `radiusTop === radiusBottom` it matches `cylinderGeo`.
 *
 * `axis` selects the orientation:
 *   - `'y'` (default) — apex/cap on +Y, matches `coneGeo`
 *   - `'x'` — pre-rotated along +X, matches the `coneXGeo` family
 *   - `'z'` — pre-rotated along +Z
 */
export function taperConeGeo(
  radiusBottom: number,
  radiusTop: number,
  height: number,
  axis: 'x' | 'y' | 'z' = 'y',
  segments = 8,
): THREE.CylinderGeometry {
  if (!['x', 'y', 'z'].includes(axis)) throw new AuthoringDiagnosticError('TAPER_CONE_AXIS');
  const geo = cylinderGeo(radiusTop, radiusBottom, height, segments);
  if (axis === 'x') geo.rotateZ(-Math.PI / 2);
  else if (axis === 'z') geo.rotateX(Math.PI / 2);
  return geo;
}

export function torusGeo(
  radius: number,
  tube: number,
  radialSegments = 8,
  tubularSegments = 12,
): THREE.TorusGeometry {
  assertDimension('torusGeo radius', radius);
  assertDimension('torusGeo tube', tube);
  assertDimension('torusGeo outer radius', radius + tube);
  assertPrimitiveSegments('torusGeo radialSegments', radialSegments, 3);
  assertPrimitiveSegments('torusGeo tubularSegments', tubularSegments, 3);
  assertPrimitiveGrid('torusGeo', radialSegments, tubularSegments);
  return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments);
}

export function planeGeo(
  width: number,
  height: number,
  widthSegments = 1,
  heightSegments = 1,
): THREE.PlaneGeometry {
  assertDimension('planeGeo width', width);
  assertDimension('planeGeo height', height);
  assertPrimitiveSegments('planeGeo widthSegments', widthSegments, 1);
  assertPrimitiveSegments('planeGeo heightSegments', heightSegments, 1);
  assertPrimitiveGrid('planeGeo', widthSegments, heightSegments);
  return new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
}

/**
 * Flat box sized for surface-attached decals: red stars on fuselages, hull
 * numbers, stamps, dome windows on no-texture vehicles. Returns a very thin
 * {@link THREE.BoxGeometry} so the decal has depth and is visibly attached
 * to its host surface — unlike a bare {@link planeGeo} which renders as a
 * disconnected 2-tri quad when it drifts away from a parent mesh.
 *
 * Always place the returned geometry with `position` + `rotation` on the
 * host surface via `createPart`. Keep `depth` as small as 0.005 for
 * paper-thin decals, or bump to 0.05 for raised plates / badges.
 *
 * ```ts
 * // Red star on the fuselage side.
 * const star = decalBox(0.18, 0.18, 0.01);
 * createPart('Mesh_StarPort', star, gameMaterial(0xc61f2a), {
 *   position: [0.4, 0.6, 0.41], // on +Z fuselage surface
 *   rotation: [0, 0, 0],
 *   parent: fuselage,
 * });
 * ```
 */
export function decalBox(width: number, height: number, depth: number = 0.01): THREE.BoxGeometry {
  assertDimension('decalBox width', width);
  assertDimension('decalBox height', height);
  assertDimension('decalBox depth', depth, true);
  const d = Math.max(depth, 0.002);
  return new THREE.BoxGeometry(width, height, d);
}

// =============================================================================
// Billboard / imposter primitives
// =============================================================================

export interface FoliageCardOptions {
  /** Quad width in world units. */
  width?: number;
  /** Quad height in world units. */
  height?: number;
  /**
   * Vertical pivot as a fraction of height: 0 = bottom, 0.5 = center, 1 = top.
   * Foliage usually wants 0 so the card plants on the ground.
   */
  yPivot?: number;
}

/**
 * Double-sided quad for foliage / vegetation cards. Y-up facing +Z by default.
 * The pivot is placed at `yPivot * height` below the quad center — set 0 to
 * have the card root on the ground plane.
 *
 * Use with an alpha-tested material for leaves and billboard plants.
 */
function validateCardFrame(name: string, width: number, height: number, yPivot: number): void {
  assertDimension(`${name} width`, width);
  assertDimension(`${name} height`, height);
  const shift = height * (0.5 - yPivot);
  if (
    !Number.isFinite(yPivot) ||
    ![shift - Math.fround(height / 2), shift + Math.fround(height / 2)].every((value) =>
      Number.isFinite(Math.fround(value)),
    )
  )
    throw new RangeError(`${name} yPivot must produce finite Float32 card coordinates.`);
}

export function foliageCardGeo(opts: FoliageCardOptions = {}): THREE.PlaneGeometry {
  const w = opts.width ?? 1;
  const h = opts.height ?? 1;
  const yPivot = opts.yPivot ?? 0;
  validateCardFrame('foliageCardGeo', w, h, yPivot);
  const geom = new THREE.PlaneGeometry(w, h);
  // Shift so the pivot offset becomes the local origin.
  geom.translate(0, h * (0.5 - yPivot), 0);
  geom.userData['kilnGeometryRole'] = 'foliageCard';
  return geom;
}

export interface CrossedQuadsOptions {
  width?: number;
  height?: number;
  /** Number of intersecting planes. 2 = X-cross, 3 = triple-star. Default 2. */
  planes?: 2 | 3;
  /** Y pivot fraction of height (see foliageCardGeo). Default 0. */
  yPivot?: number;
}

/**
 * Two or three planes intersecting along the Y axis — the classic "bush" or
 * "cross-billboard" near-field vegetation primitive. Cheaper than real
 * geometry, denser-looking than a single foliage card from any angle.
 */
export function crossedQuadsGeo(opts: CrossedQuadsOptions = {}): THREE.BufferGeometry {
  const w = opts.width ?? 1;
  const h = opts.height ?? 1;
  const planes = opts.planes ?? 2;
  const yPivot = opts.yPivot ?? 0;
  validateCardFrame('crossedQuadsGeo', w, h, yPivot);
  if (planes !== 2 && planes !== 3) throw new RangeError('crossedQuadsGeo planes must be 2 or 3.');

  const geometries: THREE.PlaneGeometry[] = [];
  for (let i = 0; i < planes; i++) {
    const angle = (i / planes) * Math.PI;
    const quad = new THREE.PlaneGeometry(w, h);
    quad.translate(0, h * (0.5 - yPivot), 0);
    quad.rotateY(angle);
    geometries.push(quad);
  }

  // Merge into one BufferGeometry — deterministic + cheaper at draw time.
  const out = new THREE.BufferGeometry();
  const posCount = geometries.reduce((sum, g) => sum + (g.attributes.position?.count ?? 0), 0);
  const positions = new Float32Array(posCount * 3);
  const normals = new Float32Array(posCount * 3);
  const uvs = new Float32Array(posCount * 2);
  const indices: number[] = [];
  let vOffset = 0;
  for (const g of geometries) {
    const p = g.attributes.position!;
    const n = g.attributes.normal!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < p.count; i++) {
      positions[(vOffset + i) * 3] = p.getX(i);
      positions[(vOffset + i) * 3 + 1] = p.getY(i);
      positions[(vOffset + i) * 3 + 2] = p.getZ(i);
      normals[(vOffset + i) * 3] = n.getX(i);
      normals[(vOffset + i) * 3 + 1] = n.getY(i);
      normals[(vOffset + i) * 3 + 2] = n.getZ(i);
      uvs[(vOffset + i) * 2] = uv.getX(i);
      uvs[(vOffset + i) * 2 + 1] = uv.getY(i);
    }
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) {
      indices.push(idx.getX(i) + vOffset);
    }
    vOffset += p.count;
  }
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(indices);
  out.userData['kilnGeometryRole'] = 'foliageCard';
  return out;
}

export interface OctaGridPlaneOptions {
  /** Atlas tile grid X. */
  tilesX: number;
  /** Atlas tile grid Y. */
  tilesY: number;
  /** Quad width in world units. Default 1. */
  width?: number;
  /** Quad height in world units. Default 1. */
  height?: number;
  /** 0 = bottom pivot, 0.5 = center, 1 = top. Default 0. */
  yPivot?: number;
}

/**
 * Atlas-ready billboard quad — same geometry as foliageCardGeo but the UV
 * rect is [0, 1/tilesX]×[1 - 1/tilesY, 1] so a shader using viewDir->tileIdx
 * can offset the UVs per-instance to sample the right imposter tile.
 *
 * The returned geometry has its UVs pre-scaled to cover exactly one tile.
 * The shader (TIJ billboard material) is expected to add (tileX/tilesX,
 * tileY/tilesY) to each vertex's UV at draw time.
 */
export function octaGridPlane(opts: OctaGridPlaneOptions): THREE.PlaneGeometry {
  for (const key of ['tilesX', 'tilesY'] as const) {
    if (!Number.isSafeInteger(opts[key]) || opts[key] <= 0) {
      throw new RangeError(`octaGridPlane: ${key} must be a positive finite safe integer.`);
    }
  }
  const w = opts.width ?? 1;
  const h = opts.height ?? 1;
  const yPivot = opts.yPivot ?? 0;
  validateCardFrame('octaGridPlane', w, h, yPivot);
  const geom = new THREE.PlaneGeometry(w, h);
  geom.translate(0, h * (0.5 - yPivot), 0);

  // Scale UVs so the quad covers one tile-sized rect in the top-left corner.
  const uv = geom.attributes.uv!;
  const du = 1 / opts.tilesX;
  const dv = 1 / opts.tilesY;
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) * du);
    // Top row — start at 1 - dv so the default samples the top-left tile.
    uv.setY(i, 1 - dv + uv.getY(i) * dv);
  }
  uv.needsUpdate = true;
  return geom;
}

export interface WingGeometryOptions {
  span?: number;
  rootChord?: number;
  tipChord?: number;
  sweep?: number;
  thickness?: number;
  dihedral?: number;
}

/**
 * Trapezoid aircraft wing panel.
 *
 * Coordinate contract: +X forward, +Y up, +Z right. The root edge sits at
 * local Z=0 and the panel extends toward +Z.
 *
 * **Parameter units (READ THIS — these are NOT angles):**
 * - `sweep` is the **X-displacement of the tip leading edge in world units**
 *   (positive = tip moves aft along -X). NOT an angle in degrees/radians.
 * - `dihedral` is the **Y-displacement of the tip in world units**
 *   (positive = tip rises). NOT an angle. For most aircraft you want a
 *   small value like 0.05–0.1 — a value of 1 with span=2 gives a 45°
 *   gull-wing, almost certainly wrong unless explicitly designing one.
 * - `span` is wing length in world units (root to tip).
 * - `rootChord` / `tipChord` / `thickness` are all world units.
 *
 * Quick reference: a real-aircraft-looking wing has dihedral roughly 2–7%
 * of span (e.g. span=4, dihedral=0.1 to 0.25).
 */
export function wingGeo(options: WingGeometryOptions = {}): THREE.BufferGeometry {
  const span = options.span ?? 1;
  const rootChord = options.rootChord ?? 0.6;
  const tipChord = options.tipChord ?? rootChord * 0.5;
  const sweep = options.sweep ?? 0;
  const thickness = options.thickness ?? 0.04;
  const dihedral = options.dihedral ?? 0;
  for (const [name, value] of Object.entries({ span, rootChord, thickness }))
    assertDimension(`wingGeo ${name}`, value);
  assertDimension('wingGeo tipChord', tipChord, true);
  for (const [name, value] of Object.entries({ sweep, dihedral }))
    if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value)))
      throw new RangeError(`wingGeo ${name} must be finite and Float32-representable.`);

  const rootLead = rootChord / 2;
  const rootTrail = -rootChord / 2;
  const tipLead = rootLead - sweep;
  const tipTrail = tipLead - tipChord;
  const halfThickness = thickness / 2;

  const vertices = new Float32Array([
    rootLead,
    halfThickness,
    0,
    rootTrail,
    halfThickness,
    0,
    tipLead,
    dihedral + halfThickness,
    span,
    tipTrail,
    dihedral + halfThickness,
    span,
    rootLead,
    -halfThickness,
    0,
    rootTrail,
    -halfThickness,
    0,
    tipLead,
    dihedral - halfThickness,
    span,
    tipTrail,
    dihedral - halfThickness,
    span,
  ]);

  if (!vertices.every(Number.isFinite))
    throw new RangeError('wingGeo dimensions and offsets produce nonfinite Float32 vertices.');

  const indices = [
    0,
    3,
    2,
    0,
    1,
    3, // top
    4,
    6,
    7,
    4,
    7,
    5, // bottom
    0,
    2,
    6,
    0,
    6,
    4, // leading edge
    1,
    5,
    7,
    1,
    7,
    3, // trailing edge
    0,
    4,
    5,
    0,
    5,
    1, // root cap
    2,
    3,
    7,
    2,
    7,
    6, // tip cap
  ];

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  // A zero tip chord is a triangular wing: omit collapsed faces at the tip.
  geo.setIndex(
    tipChord === 0
      ? [0, 1, 3, 4, 7, 5, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3, 0, 4, 5, 0, 5, 1]
      : indices,
  );
  geo.computeVertexNormals();
  return geo;
}

export interface WingPairOptions extends WingGeometryOptions {
  rootX?: number;
  rootY?: number;
  /** Fuselage half-width / root offset. Roots attach at +/-rootZ. */
  rootZ: number;
  parent?: THREE.Object3D;
}

export function createWingPair(
  name: string,
  material: THREE.Material,
  options: WingPairOptions,
): { right: THREE.Object3D; left: THREE.Object3D } {
  const { parent, rootX = 0, rootY = 0, rootZ, ...wingOptions } = options;
  assertFiniteTriple('createWingPair root position', [rootX, rootY, rootZ]);
  const rightGeo = wingGeo(wingOptions);
  const leftGeo = wingGeo(wingOptions);
  leftGeo.scale(1, 1, -1);
  // A baked reflection reverses orientation. Reverse every triangle before
  // recomputing normals so single-sided rendering and exported solids agree.
  const indices = leftGeo.getIndex()!;
  for (let i = 0; i < indices.count; i += 3) {
    const second = indices.getX(i + 1);
    indices.setX(i + 1, indices.getX(i + 2));
    indices.setX(i + 2, second);
  }
  indices.needsUpdate = true;
  leftGeo.computeVertexNormals();

  return {
    right: createPart(`${name}Right`, rightGeo, material, {
      position: [rootX, rootY, rootZ],
      parent,
    }),
    left: createPart(`${name}Left`, leftGeo, material, {
      position: [rootX, rootY, -rootZ],
      parent,
    }),
  };
}

export interface BeamBetweenOptions {
  segments?: number;
  parent?: THREE.Object3D;
}

export function beamBetween(
  name: string,
  start: Vec3Tuple,
  end: Vec3Tuple,
  radius: number,
  material: THREE.Material,
  options: BeamBetweenOptions = {},
): THREE.Object3D {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const length = direction.length();

  if (length <= 1e-4) {
    throw new Error(
      `beamBetween("${name}"): start and end must be different points (got start=[${start.join(',')}], end=[${end.join(',')}], delta=${length.toExponential(2)}). Pick two distinct endpoints or switch to cylinderGeo with an explicit length + position.`,
    );
  }

  const mesh = new THREE.Mesh(cylinderGeo(radius, radius, length, options.segments ?? 8), material);
  mesh.name = `Mesh_${name}`;
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());

  if (options.parent) options.parent.add(mesh);
  return mesh;
}

/**
 * Align world bounding boxes: translate `part` by the minimal
 * world-space vector that closes the gap between its bounding box and the
 * host's, plus a small `overlap` along the dominant gap axis (or the forced
 * `axis`). The axis selects the overlap bias, not a movement constraint: gaps
 * on other axes are also closed. AABB overlap does not prove surface contact.
 *
 * If the boxes already touch or overlap, the part is left in place.
 * Returns `part` for chaining.
 */
export function snapTo(
  part: THREE.Object3D,
  host: THREE.Object3D,
  options: { axis?: 'x' | 'y' | 'z'; overlap?: number } = {},
): THREE.Object3D {
  const overlap = options.overlap ?? 0.02;
  // Boxes in world space (works mid-build; matrices may be stale otherwise).
  part.updateWorldMatrix(true, true);
  host.updateWorldMatrix(true, true);
  const a = new THREE.Box3().setFromObject(part);
  const b = new THREE.Box3().setFromObject(host);
  if (a.isEmpty() || b.isEmpty()) return part;

  const delta = new THREE.Vector3();
  for (const axis of ['x', 'y', 'z'] as const) {
    if (a.min[axis] > b.max[axis]) delta[axis] = b.max[axis] - a.min[axis];
    else if (a.max[axis] < b.min[axis]) delta[axis] = b.min[axis] - a.max[axis];
  }
  if (delta.lengthSq() === 0) return part; // AABBs already touch or overlap.

  const dominant =
    options.axis ??
    (['x', 'y', 'z'] as const).reduce<'x' | 'y' | 'z'>(
      (d, axis) => (Math.abs(delta[axis]) > Math.abs(delta[d]) ? axis : d),
      'x',
    );
  if (delta[dominant] !== 0) delta[dominant] += Math.sign(delta[dominant]) * overlap;
  else delta[dominant] = -overlap; // forced axis had no gap — bias into the host

  // Convert the world delta into the part's parent space (handles rotated or
  // scaled ancestors) by mapping two world points.
  const parent = part.parent;
  if (parent) {
    const p0 = new THREE.Vector3();
    part.getWorldPosition(p0);
    const p1 = p0.clone().add(delta);
    const l0 = parent.worldToLocal(p0.clone());
    const l1 = parent.worldToLocal(p1.clone());
    part.position.add(l1.sub(l0));
  } else {
    part.position.add(delta);
  }
  part.updateMatrixWorld(true);
  return part;
}

export interface LadderOptions {
  bottom: Vec3Tuple;
  top: Vec3Tuple;
  material: THREE.Material;
  width?: number;
  rungCount?: number;
  railRadius?: number;
  rungRadius?: number;
  segments?: number;
  /** Preferred parent-space width basis, projected perpendicular to the endpoints. */
  widthAxis?: 'x' | 'z';
  /** Explicit parent-space width direction; zero or parallel directions are rejected. */
  widthDirection?: Vec3Tuple;
  parent?: THREE.Object3D;
}

export interface LadderResult {
  /** Root at bottom in parent coordinates; child placements are root-local. */
  root: THREE.Object3D;
  leftRail: THREE.Object3D;
  rightRail: THREE.Object3D;
  rungs: THREE.Object3D[];
}

export function createLadder(name: string, options: LadderOptions): LadderResult {
  const {
    bottom,
    top,
    material,
    width = 0.42,
    rungCount = 6,
    railRadius = 0.025,
    rungRadius = 0.02,
    segments = 6,
    widthAxis = 'x',
    widthDirection,
    parent,
  } = options;

  assertFiniteTriple('createLadder bottom', bottom);
  assertFiniteTriple('createLadder top', top);
  for (const [key, value] of Object.entries({ width, railRadius, rungRadius }))
    assertDimension(`createLadder ${key}`, value);
  assertPrimitiveSegments('createLadder segments', segments, 3);
  if (
    !Number.isSafeInteger(rungCount) ||
    rungCount < 0 ||
    rungCount > GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes
  )
    throw new RangeError('createLadder rungCount must be an integer from 0 to 10000.');
  if (widthAxis !== 'x' && widthAxis !== 'z')
    throw new RangeError('createLadder widthAxis must be x or z.');

  const bottomVec = new THREE.Vector3();
  const topVec = new THREE.Vector3(...top).sub(new THREE.Vector3(...bottom));
  const length = Math.hypot(topVec.x, topVec.y, topVec.z);
  assertDimension('createLadder endpoint distance', length);
  if (length <= 1e-4)
    throw new RangeError('createLadder endpoints must be different by more than 1e-4.');
  const along = topVec.clone().divideScalar(length);
  if (widthDirection !== undefined)
    assertFiniteTriple('createLadder widthDirection', widthDirection);
  let across = widthDirection
    ? new THREE.Vector3(...widthDirection)
    : widthAxis === 'x'
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
  const largest = Math.max(Math.abs(across.x), Math.abs(across.y), Math.abs(across.z));
  if (!largest) throw new RangeError('createLadder widthDirection must be nonzero.');
  across.divideScalar(largest).normalize();
  across.addScaledVector(along, -across.dot(along));
  if (across.lengthSq() < 1e-12) {
    if (widthDirection)
      throw new RangeError('createLadder widthDirection must not be parallel to the endpoints.');
    // Select the least-aligned canonical basis for a well-conditioned projection.
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ];
    across = axes.reduce((best, axis) =>
      Math.abs(axis.dot(along)) < Math.abs(best.dot(along)) ? axis : best,
    );
    across.addScaledVector(along, -across.dot(along));
  }
  across.normalize();
  const offset = across.clone().multiplyScalar(width / 2);
  const root = new THREE.Object3D();
  root.name = name;
  root.position.set(...bottom);
  const rotation = new THREE.Quaternion()
    .setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(across, along, across.clone().cross(along)),
    )
    .toArray();
  stampSemanticMetadataV1(root, {
    roles: ['ladder'],
    frames: [
      { id: 'bottom', translation: [0, 0, 0], rotation },
      { id: 'top', translation: vectorToTuple(topVec), rotation },
    ],
    sockets: ['bottom', 'top'].map((id) => ({
      id,
      type: 'ladder-end',
      frame: id,
      compatibleTypes: ['ladder-end'],
    })),
  });

  const leftBottom = bottomVec.clone().sub(offset);
  const leftTop = topVec.clone().sub(offset);
  const rightBottom = bottomVec.clone().add(offset);
  const rightTop = topVec.clone().add(offset);

  const leftRail = beamBetween(
    `${name}LeftRail`,
    vectorToTuple(leftBottom),
    vectorToTuple(leftTop),
    railRadius,
    material,
    { parent: root, segments },
  );
  const rightRail = beamBetween(
    `${name}RightRail`,
    vectorToTuple(rightBottom),
    vectorToTuple(rightTop),
    railRadius,
    material,
    { parent: root, segments },
  );

  const rungs: THREE.Object3D[] = [];
  for (let i = 0; i < rungCount; i++) {
    const t = (i + 1) / (rungCount + 1);
    const center = bottomVec.clone().lerp(topVec, t);
    rungs.push(
      beamBetween(
        `${name}Rung${i + 1}`,
        vectorToTuple(center.clone().sub(offset)),
        vectorToTuple(center.clone().add(offset)),
        rungRadius,
        material,
        { parent: root, segments },
      ),
    );
  }

  stampSemanticMetadataV1(leftRail, { roles: ['ladder.rail', 'ladder.rail.left'] });
  stampSemanticMetadataV1(rightRail, { roles: ['ladder.rail', 'ladder.rail.right'] });
  rungs.forEach((rung, index) => {
    stampSemanticMetadataV1(rung, { roles: ['ladder.rung', `ladder.rung.${index + 1}`] });
  });
  if (parent) parent.add(root);
  return { root, leftRail, rightRail, rungs };
}

// =============================================================================
// Building / architecture helpers
// =============================================================================
//
// Enterable buildings are HOLLOW shells: thin walls around real interior space,
// real doorway gaps, a separable roof. These helpers make that correct-by-
// construction so the agent cannot accidentally fill the volume, forget the
// doorway, or mirror the roof slopes the wrong way. Openings are composed from
// box segments (jambs + lintel + sill), never CSG — solid opaque overlaps are
// robust where thin boolean cutters are fragile.

export interface WallOpening {
  /** 'door' reaches the floor; 'window' is inset at `sill` height. */
  kind?: 'door' | 'window';
  /** Center of the opening along the wall length axis (0 = centered). */
  offset?: number;
  /** Opening width along the wall length axis. */
  width?: number;
  /** Opening height. */
  height?: number;
  /** Window sill height above the wall base (ignored for doors). */
  sill?: number;
}

export interface WallWithOpeningOptions {
  /** Wall length along its run axis. */
  length: number;
  /** Wall height (Y). Base sits at local Y=0. */
  height: number;
  /** Wall thickness along the perpendicular horizontal axis. */
  thickness: number;
  /** Which horizontal axis the wall runs along. Default 'z'. */
  axis?: 'x' | 'z';
  /** A single door/window cut. Mutually exclusive with `openings`. */
  opening?: WallOpening;
  /** Multiple rectangular cuts, including vertically stacked windows.
   * Cuts may touch but must not overlap and must fit inside the wall sides/top. */
  openings?: readonly WallOpening[];
  parent?: THREE.Object3D;
}

/**
 * A wall with rectangular door/window cuts, composed from solid box segments.
 * Invalid, overlapping or out-of-bound cuts throw; they are never clipped.
 * Runs along `axis`, base at local Y=0, centered on the
 * length axis. Returns the wall container so the caller can position it.
 */
export function wallWithOpening(
  name: string,
  material: THREE.Material,
  options: WallWithOpeningOptions,
): THREE.Object3D {
  const { length, height, thickness, axis = 'z', opening, openings, parent } = options;
  if (opening && openings)
    throw new TypeError('wallWithOpening: use opening or openings, not both.');
  const built = buildWallPanels(length, height, thickness, openings ?? (opening ? [opening] : []));
  const group = new THREE.Object3D();
  group.name = name;

  const panel = (
    suffix: string,
    lenStart: number,
    lenEnd: number,
    yLo: number,
    yHi: number,
  ): void => {
    const segLen = lenEnd - lenStart;
    const segH = yHi - yLo;
    if (segLen <= 0 || segH <= 0) return;
    const lenC = (lenStart + lenEnd) / 2;
    const yC = (yLo + yHi) / 2;
    const geo = axis === 'z' ? boxGeo(thickness, segH, segLen) : boxGeo(segLen, segH, thickness);
    const pos: [number, number, number] = axis === 'z' ? [0, yC, lenC] : [lenC, yC, 0];
    createPart(`${name}${suffix}`, geo, material, { position: pos, parent: group });
  };

  for (const segment of built.panels) {
    panel(segment.suffix, segment.left, segment.right, segment.bottom, segment.top);
  }

  if (parent) parent.add(group);
  return group;
}

export interface RoomOpening extends WallOpening {
  /** Which wall the opening cuts. `front` faces +X. */
  wall: 'front' | 'back' | 'left' | 'right';
}

export interface RoomOptions {
  /** Side-to-side extent along Z. */
  width?: number;
  /** Front-to-back extent along X (front faces +X). */
  depth?: number;
  /** Wall height (Y). */
  height?: number;
  wallThickness?: number;
  /** Lay a floor slab. Default true. */
  floor?: boolean;
  floorThickness?: number;
  /** Per-wall openings. Defaults to a centered door on the front wall, so the
   *  room is ENTERABLE by default. */
  openings?: RoomOpening[];
  parent?: THREE.Object3D;
}

/**
 * A hollow, enterable room: four thin walls + a floor, sized so a humanoid fits
 * (defaults: 2.8m ceiling, a centered 1.1×2.1m front door). The keystone of an
 * architecture asset — the agent builds onto/around it (roof via
 * {@link createRoofPlanes}, fixtures as separate parts) but cannot ship a solid
 * block or a sealed box. `front` faces +X; the floor top sits at the ground.
 */
export function room(
  name: string,
  material: THREE.Material,
  options: RoomOptions = {},
): {
  root: THREE.Object3D;
  walls: Record<'front' | 'back' | 'left' | 'right', THREE.Object3D>;
  floor: THREE.Object3D | null;
} {
  const {
    width = 4,
    depth = 4,
    height = 2.8,
    wallThickness = 0.15,
    floor = true,
    floorThickness = 0.1,
    parent,
  } = options;
  const openings = options.openings ?? [{ wall: 'front', kind: 'door' }];
  const root = new THREE.Object3D();
  root.name = name;

  const wall = (
    suffix: string,
    len: number,
    axis: 'x' | 'z',
    pos: [number, number, number],
    which: RoomOpening['wall'],
  ): THREE.Object3D => {
    const w = wallWithOpening(`${name}_Wall${suffix}`, material, {
      length: len,
      height,
      thickness: wallThickness,
      axis,
      openings: openings.filter((op) => op.wall === which),
      parent: root,
    });
    w.position.set(...pos);
    return w;
  };

  const walls = {
    front: wall('Front', width, 'z', [depth / 2, 0, 0], 'front'),
    back: wall('Back', width, 'z', [-depth / 2, 0, 0], 'back'),
    left: wall('Left', depth, 'x', [0, 0, -width / 2], 'left'),
    right: wall('Right', depth, 'x', [0, 0, width / 2], 'right'),
  };

  let floorObj: THREE.Object3D | null = null;
  if (floor) {
    floorObj = createPart(`${name}_Floor`, boxGeo(depth, floorThickness, width), material, {
      position: [0, -floorThickness / 2, 0],
      parent: root,
    });
  }

  if (parent) parent.add(root);
  return { root, walls, floor: floorObj };
}

export interface StairsOptions {
  /** Number of steps. Default 8. */
  steps?: number;
  /** Total vertical climb. */
  totalRise: number;
  /** Total horizontal run along `axis`. */
  totalRun: number;
  /** Tread width along the perpendicular horizontal axis. */
  width: number;
  /** Direction the flight climbs toward. Default 'x'. */
  axis?: 'x' | 'z';
  treadThickness?: number;
  /** Add a vertical riser face under each tread. Default true. */
  riser?: boolean;
  parent?: THREE.Object3D;
}

/**
 * A straight flight of stairs: box treads (with optional risers) climbing
 * `totalRise` over `totalRun` from local origin along `axis`. Signed rise/run
 * support ascending or descending flights in either direction. Steps are named
 * `Step_1..N` for engine use.
 */
export function createStairs(
  name: string,
  material: THREE.Material,
  options: StairsOptions,
): { root: THREE.Object3D; steps: THREE.Object3D[] } {
  const {
    steps = 8,
    totalRise,
    totalRun,
    width,
    axis = 'x',
    treadThickness = 0.08,
    riser = true,
    parent,
  } = options;
  if (
    !Number.isSafeInteger(steps) ||
    steps < 1 ||
    steps > GEOMETRY_ALLOCATION_LIMITS.repeatedMeshes
  ) {
    throw new RangeError(
      `createStairs("${name}"): steps must be >= 1, <= 10000 and a finite safe integer (got ${steps}).`,
    );
  }
  assertDimension('createStairs width', width);
  assertDimension('createStairs treadThickness', treadThickness);
  if (!Number.isFinite(totalRise) || !Number.isFinite(totalRun))
    throw new RangeError('createStairs totalRise and totalRun must be finite.');
  if (axis !== 'x' && axis !== 'z') throw new RangeError('createStairs axis must be x or z.');
  if (Math.abs(totalRise) < 1e-4 || Math.abs(totalRun) < 1e-4) {
    throw new Error(
      `createStairs("${name}"): totalRise and totalRun must be non-zero (got rise=${totalRise}, run=${totalRun}).`,
    );
  }
  const root = new THREE.Object3D();
  root.name = name;
  const stepRise = totalRise / steps;
  const stepRun = totalRun / steps;
  const stepList: THREE.Object3D[] = [];

  for (let i = 0; i < steps; i++) {
    const topY = (i + 1) * stepRise;
    const alongC = (i + 0.5) * stepRun;
    const treadGeo =
      axis === 'x'
        ? boxGeo(Math.abs(stepRun), treadThickness, width)
        : boxGeo(width, treadThickness, Math.abs(stepRun));
    const treadPos: [number, number, number] =
      axis === 'x'
        ? [alongC, topY - treadThickness / 2, 0]
        : [0, topY - treadThickness / 2, alongC];
    stepList.push(
      createPart(`${name}Step${i + 1}`, treadGeo, material, { position: treadPos, parent: root }),
    );

    if (riser) {
      const front = i * stepRun;
      const riserGeo =
        axis === 'x'
          ? boxGeo(treadThickness, Math.abs(stepRise), width)
          : boxGeo(width, Math.abs(stepRise), treadThickness);
      const riserPos: [number, number, number] =
        axis === 'x'
          ? [front + (Math.sign(stepRun) * treadThickness) / 2, topY - stepRise / 2, 0]
          : [0, topY - stepRise / 2, front + (Math.sign(stepRun) * treadThickness) / 2];
      createPart(`${name}Riser${i + 1}`, riserGeo, material, { position: riserPos, parent: root });
    }
  }

  if (parent) parent.add(root);
  return { root, steps: stepList };
}

// =============================================================================
// Materials
// =============================================================================

/**
 * Reject anything that is not a colour where a colour is expected.
 *
 * Every constructor here takes `(color, options)`, and a model that has met a
 * different engine reaches for `gameMaterial({ color, roughness, metalness })`
 * instead. That is not an error in three.js: `Color.set` ignores a plain object
 * and leaves the colour at its default white, the options argument is absent so
 * the material also takes default roughness and metalness, and the program runs
 * to completion. What comes back is a white plastic part in the middle of a
 * correctly-painted asset, which reads as the model having chosen it.
 *
 * An air-defence radar in `examples/` had every steel fitting on the vehicle
 * blown out this way, and the header comment it wrote about the finish described
 * a material that was never applied. So this fails closed, and says which shape
 * it wanted, because the whole point of the catalog is that the API a model
 * half-remembers is not the API it gets to use.
 */
function requireColor(color: unknown, fn: string): void {
  if (typeof color === 'number' || typeof color === 'string') return;
  const got =
    color && typeof color === 'object'
      ? `an object with keys [${Object.keys(color as object).join(', ')}]`
      : String(color);
  throw new AuthoringDiagnosticError(
    'MATERIAL_COLOR_ARGUMENT',
    `${fn}(color, options?): color must be a hex number like 0x8c4a32 or a CSS string, got ${got}. ` +
      `Material settings go in the SECOND argument: ${fn}(0x8c4a32, { roughness: 0.5, metalness: 0.9 }).`,
  );
}

export function gameMaterial(
  color: number | string,
  options: {
    metalness?: number;
    roughness?: number;
    emissive?: number | string;
    emissiveIntensity?: number;
    flatShading?: boolean;
  } = {},
): THREE.MeshStandardMaterial {
  requireColor(color, 'gameMaterial');
  return new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0,
    roughness: options.roughness ?? 0.8,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    flatShading: options.flatShading ?? true,
  });
}

export function basicMaterial(
  color: number | string,
  options: { transparent?: boolean; opacity?: number } = {},
): THREE.MeshBasicMaterial {
  requireColor(color, 'basicMaterial');
  return new THREE.MeshBasicMaterial({
    color,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

export function glassMaterial(
  color: number | string,
  options: { opacity?: number; roughness?: number; metalness?: number } = {},
): THREE.MeshStandardMaterial {
  requireColor(color, 'glassMaterial');
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity: options.opacity ?? 0.35,
    roughness: options.roughness ?? 0.1,
    metalness: options.metalness ?? 0,
    side: THREE.DoubleSide,
  });
}

export function lambertMaterial(
  color: number | string,
  options: { flatShading?: boolean; emissive?: number | string } = {},
): THREE.MeshLambertMaterial {
  requireColor(color, 'lambertMaterial');
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: options.flatShading ?? true,
    emissive: options.emissive ?? 0x000000,
  });
}

// =============================================================================
// Animation Helpers
// =============================================================================

/**
 * Keyframe interpolation mode.
 * - LINEAR: default, smooth transitions between keyframes.
 * - STEP: discrete, hold value until next keyframe (good for robotic/mechanical motion).
 */
export type TrackInterpolation = 'LINEAR' | 'STEP';

function threeInterpolation(mode?: TrackInterpolation): THREE.InterpolationModes {
  if (mode !== undefined && mode !== 'LINEAR' && mode !== 'STEP') {
    throw new Error(
      'Animation interpolation must be LINEAR or STEP; cubic splines are unsupported.',
    );
  }
  return mode === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
}

function animationNumber(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isFinite(Math.fround(value))
  ) {
    throw new Error(`${label} must be finite and representable as float32.`);
  }
}

function animationTarget(name: unknown): asserts name is string {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name !== name.trim() ||
    /[.[\]:/\\]/.test(name) ||
    Array.from(name).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    throw new Error(
      'Animation target must be an exact nonempty node name, without binding paths or property syntax.',
    );
  }
}

function animationVector(value: unknown, label: string): asserts value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must contain exactly three finite components.`);
  }
  for (const component of value) animationNumber(component, label);
}

function animationTimes(times: ArrayLike<number>, label: string): void {
  if (times.length === 0) throw new Error(`${label} requires at least one keyframe time.`);
  let previous = -Infinity;
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    animationNumber(time, `${label} time ${i}`);
    const stored = Math.fround(time);
    if (time < 0 || stored <= previous) {
      throw new Error(
        `${label} times must be nonnegative and strictly increasing after float32 storage.`,
      );
    }
    previous = stored;
  }
}

function animationKeys(
  target: string,
  frames: Array<{ time: number }>,
  channel: 'rotation' | 'position' | 'scale',
  interpolation?: TrackInterpolation,
): void {
  animationTarget(target);
  threeInterpolation(interpolation);
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error(`${channel}Track requires at least one keyframe.`);
  }
  for (const [i, frame] of frames.entries()) {
    if (!frame || typeof frame !== 'object')
      throw new Error(`${channel}Track keyframe ${i} must be an object.`);
    animationVector(
      (frame as unknown as Record<string, unknown>)[channel],
      `${channel}Track ${channel} ${i}`,
    );
  }
  animationTimes(
    frames.map((frame) => frame.time),
    `${channel}Track`,
  );
}

/**
 * Absolute local rotation: XYZ Euler angles in degrees, converted to unit quaternions.
 * LINEAR uses shortest-arc quaternion interpolation, not linear Euler angles. A two-key
 * 0-to-360 degree track is stationary; use intermediate rotations (as spinAnimation does).
 * Times are nonnegative seconds, strictly increasing after float32 storage.
 * The exact target node must exist in the authored scene; this constructor has no scene.
 */
export function rotationTrack(
  jointName: string,
  keyframes: Array<{ time: number; rotation: [number, number, number] }>,
  interpolation?: TrackInterpolation,
): THREE.QuaternionKeyframeTrack {
  animationKeys(jointName, keyframes, 'rotation', interpolation);
  const times: number[] = [];
  const values: number[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  for (const kf of keyframes) {
    times.push(kf.time);
    euler.set(
      THREE.MathUtils.degToRad(kf.rotation[0]),
      THREE.MathUtils.degToRad(kf.rotation[1]),
      THREE.MathUtils.degToRad(kf.rotation[2]),
    );
    quat.setFromEuler(euler);
    values.push(quat.x, quat.y, quat.z, quat.w);
  }

  return new THREE.QuaternionKeyframeTrack(
    `${jointName}.quaternion`,
    times,
    values,
    threeInterpolation(interpolation),
  );
}

/** Absolute parent-local positions in scene units. Times are nonnegative seconds. */
export function positionTrack(
  jointName: string,
  keyframes: Array<{ time: number; position: [number, number, number] }>,
  interpolation?: TrackInterpolation,
): THREE.VectorKeyframeTrack {
  animationKeys(jointName, keyframes, 'position', interpolation);
  const times: number[] = [];
  const values: number[] = [];

  for (const kf of keyframes) {
    times.push(kf.time);
    values.push(...kf.position);
  }

  return new THREE.VectorKeyframeTrack(
    `${jointName}.position`,
    times,
    values,
    threeInterpolation(interpolation),
  );
}

/** Absolute local scale factors; finite zero and negative values remain intentional options. */
export function scaleTrack(
  jointName: string,
  keyframes: Array<{ time: number; scale: [number, number, number] }>,
  interpolation?: TrackInterpolation,
): THREE.VectorKeyframeTrack {
  animationKeys(jointName, keyframes, 'scale', interpolation);
  const times: number[] = [];
  const values: number[] = [];

  for (const kf of keyframes) {
    times.push(kf.time);
    values.push(...kf.scale);
  }

  return new THREE.VectorKeyframeTrack(
    `${jointName}.scale`,
    times,
    values,
    threeInterpolation(interpolation),
  );
}

/**
 * Create a TRS clip with nonnegative duration in seconds, or -1 to derive duration from
 * the final stored key. An explicit duration must include every key (float32 rounding
 * is allowed); zero is valid for time-zero static poses. Tracks remain shared references.
 * Export adds held final samples when needed to preserve an explicit longer duration.
 * Supports LINEAR/STEP vector and quaternion tracks, not cubic splines or other channels.
 * Quaternion samples must already be unit length (squared-length tolerance 1e-4).
 * Validates target syntax, not scene existence/uniqueness: use scene inspection/QA for that.
 * `options.loop` declares intent: true for a cycle, false for a one-shot. It is exported as
 * the glTF animation extra `kilnLoopIntent` ('loop' | 'once') and reported by animation review;
 * omitted means unspecified.
 */
export function createClip(
  name: string,
  duration: number,
  tracks: THREE.KeyframeTrack[],
  options?: { loop?: boolean },
): THREE.AnimationClip {
  if (typeof name !== 'string' || !name.trim())
    throw new Error('Animation clip name must be nonempty.');
  animationNumber(duration, 'Animation clip duration');
  if (duration < 0 && duration !== -1)
    throw new Error('Animation clip duration must be nonnegative, or -1 for automatic duration.');
  if (!Array.isArray(tracks) || tracks.length === 0)
    throw new Error('Animation clip requires at least one track.');
  const loop = clipLoopOption(options);
  const names = new Set<string>();
  for (const track of tracks) {
    if (!(track instanceof THREE.KeyframeTrack))
      throw new Error('Animation clip tracks must be KeyframeTrack instances.');
    if (typeof track.name !== 'string')
      throw new Error('Animation track target/channel must use a string name.');
    const dot = track.name.lastIndexOf('.');
    animationTarget(track.name.slice(0, dot));
    const channel = track.name.slice(dot + 1);
    if (!['position', 'scale', 'quaternion'].includes(channel)) {
      throw new Error(
        `Animation track ${track.name} has an unsupported channel; use position, quaternion or scale.`,
      );
    }
    if (names.has(track.name))
      throw new Error(`Duplicate animation target/channel: ${track.name}.`);
    names.add(track.name);
    const quaternion = channel === 'quaternion';
    const Type = quaternion ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
    if (!(track instanceof Type))
      throw new Error(
        `Animation channel ${channel} requires ${quaternion ? 'QuaternionKeyframeTrack' : 'VectorKeyframeTrack'}.`,
      );
    const mode = track.getInterpolation();
    if (mode !== THREE.InterpolateLinear && mode !== THREE.InterpolateDiscrete) {
      throw new Error(
        'Animation interpolation must be LINEAR or STEP; cubic splines are unsupported.',
      );
    }
    animationTimes(track.times, track.name);
    const stride = quaternion ? 4 : 3;
    if (track.values.length !== track.times.length * stride)
      throw new Error(`Animation track ${track.name} requires ${stride} values per keyframe.`);
    for (const value of track.values) animationNumber(value, `Animation track ${track.name} value`);
    if (quaternion) {
      for (let i = 0; i < track.values.length; i += 4) {
        const lengthSquared =
          track.values[i]! ** 2 +
          track.values[i + 1]! ** 2 +
          track.values[i + 2]! ** 2 +
          track.values[i + 3]! ** 2;
        if (Math.abs(lengthSquared - 1) > 1e-4)
          throw new Error(`Animation track ${track.name} quaternion samples must be unit length.`);
      }
    }
    if (duration !== -1 && track.times[track.times.length - 1]! > Math.fround(duration)) {
      throw new Error(
        `Animation clip duration ${duration} does not include every key of ${track.name}.`,
      );
    }
  }
  const clip = new THREE.AnimationClip(name, duration, tracks);
  if (loop !== undefined) clip.userData.kilnLoopIntent = loop ? 'loop' : 'once';
  return clip;
}

function clipLoopOption(options: unknown): boolean | undefined {
  if (options === undefined) return undefined;
  if (typeof options !== 'object' || options === null || Array.isArray(options))
    throw new Error('Animation clip options must be an object such as { loop: true }.');
  for (const key of Object.keys(options))
    if (key !== 'loop')
      throw new Error(`Animation clip option ${key} is unknown; the only option is loop.`);
  const loop = (options as { loop?: unknown }).loop;
  if (loop !== undefined && typeof loop !== 'boolean')
    throw new Error('Animation clip loop must be true (a cycle) or false (a one-shot).');
  return loop;
}

// =============================================================================
// Common Animation Patterns
// =============================================================================

export interface PositionAnimationOptions {
  /** Authored parent-local position in scene units. Defaults to [0, 0, 0], preserving the origin-pivot pattern. */
  basePosition?: [number, number, number];
}

function positionPresetBase(
  duration: number,
  amount: number,
  options: PositionAnimationOptions,
): [number, number, number] {
  animationNumber(duration, 'Animation preset duration');
  if (duration <= 0) throw new Error('Animation preset duration must be positive.');
  animationNumber(amount, 'Animation preset displacement');
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new Error('Animation preset options must be an object.');
  const base = options.basePosition === undefined ? [0, 0, 0] : options.basePosition;
  animationVector(base, 'Animation preset basePosition');
  return base;
}

/** Rise by amount along parent-local Y, then return to basePosition. Does not infer a rest pose. */
export function idleBreathing(
  bodyJoint: string,
  duration = 2,
  amount = 0.02,
  options: PositionAnimationOptions = {},
): THREE.AnimationClip {
  const [x, y, z] = positionPresetBase(duration, amount, options);
  return createClip('Idle', duration, [
    positionTrack(bodyJoint, [
      { time: 0, position: [x, y, z] },
      { time: duration / 2, position: [x, y + amount, z] },
      { time: duration, position: [x, y, z] },
    ]),
  ]);
}

/** Move by height along parent-local Y and return. Supply basePosition to retain an authored offset. */
export function bobbingAnimation(
  rootName: string,
  duration = 2,
  height = 0.1,
  options: PositionAnimationOptions = {},
): THREE.AnimationClip {
  const [x, y, z] = positionPresetBase(duration, height, options);
  return createClip('Bob', duration, [
    positionTrack(rootName, [
      { time: 0, position: [x, y, z] },
      { time: duration / 2, position: [x, y + height, z] },
      { time: duration, position: [x, y, z] },
    ]),
  ]);
}

/** Full turn from identity rotation. Use an unrotated animation pivot to retain a part's rest rotation. */
export function spinAnimation(
  jointName: string,
  duration = 2,
  axis: 'x' | 'y' | 'z' = 'y',
): THREE.AnimationClip {
  animationNumber(duration, 'Animation preset duration');
  if (duration <= 0) throw new Error('Animation preset duration must be positive.');
  if (!['x', 'y', 'z'].includes(axis)) throw new Error('Spin animation axis must be x, y or z.');
  const rotation: [number, number, number] = [0, 0, 0];
  const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
  const rotations: Array<{ time: number; rotation: [number, number, number] }> = [];

  for (let i = 0; i <= 4; i++) {
    const r: [number, number, number] = [...rotation];
    r[idx] = (i * 90) % 360;
    rotations.push({ time: (i * duration) / 4, rotation: r });
  }

  return createClip('Spin', duration, [rotationTrack(jointName, rotations)]);
}

// =============================================================================
// Utilities
// =============================================================================

// =============================================================================
// Instancing / Reuse (Wave 1B)
// =============================================================================

/** Own vertex buffers before deforming a memoized primitive. */
export function copyGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  return geo.clone();
}

/** Copy material properties. Referenced textures remain shared. */
export function copyMaterial<T extends THREE.Material>(mat: T): T {
  return mat.clone();
}

/**
 * Creates a new Object3D that reuses an existing part's geometry+material
 * at a new transform. The cheapest way to replicate a part (wheel, bolt,
 * window, fence-post) without duplicating GPU-side data.
 *
 * If `source` is a pivot (from `createPivot` or `createPart` with
 * `pivot: true`), the instance replicates the first Mesh child's geometry.
 *
 * Automatically adds to `parent` when provided (mirrors createPart).
 */
export function createInstance(
  name: string,
  source: THREE.Object3D,
  options: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    parent?: THREE.Object3D;
  } = {},
): THREE.Object3D {
  // Duck-typed `.isMesh` — sandbox-created meshes belong to a different
  // module realm than this file's THREE import. See render.ts comment.
  const isMesh = (o: THREE.Object3D | undefined): o is THREE.Mesh =>
    !!(o as { isMesh?: boolean })?.isMesh;
  const sourceMesh = isMesh(source)
    ? source
    : (source.children.find(isMesh) as THREE.Mesh | undefined);

  if (!sourceMesh) {
    throw new Error(`createInstance("${name}"): source "${source.name}" has no Mesh to clone from`);
  }

  const mesh = new THREE.Mesh(sourceMesh.geometry, sourceMesh.material);
  mesh.name = `Mesh_${name}`;

  if (options.position) mesh.position.set(...options.position);
  if (options.rotation)
    mesh.rotation.set(
      THREE.MathUtils.degToRad(options.rotation[0]),
      THREE.MathUtils.degToRad(options.rotation[1]),
      THREE.MathUtils.degToRad(options.rotation[2]),
    );
  if (options.scale) mesh.scale.set(...options.scale);

  if (options.parent) options.parent.add(mesh);
  return mesh;
}

// =============================================================================
// Introspection
// =============================================================================

export function countTriangles(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((child) => {
    if ((child as { isMesh?: boolean }).isMesh) {
      const meshChild = child as THREE.Mesh;
      const geometry = meshChild.geometry;
      const copies = (meshChild as THREE.InstancedMesh).isInstancedMesh
        ? (meshChild as THREE.InstancedMesh).count
        : 1;
      if (geometry.index) {
        count += Math.floor(geometry.index.count / 3) * copies;
      } else {
        const position = geometry.getAttribute('position');
        if (position) count += Math.floor(position.count / 3) * copies;
      }
    } else if ((child as { isSprite?: boolean }).isSprite) {
      // The canonical GLB bridge materializes every Three.js Sprite as one
      // semantic camera-facing quad.
      count += 2;
    }
  });
  return Math.floor(count);
}

export function countMaterials(root: THREE.Object3D): number {
  const materials = new Set<THREE.Material>();
  root.traverse((child) => {
    if ((child as { isMesh?: boolean }).isMesh) {
      const meshChild = child as THREE.Mesh;
      if (Array.isArray(meshChild.material)) {
        meshChild.material.forEach((material) => {
          materials.add(material);
        });
      } else {
        materials.add(meshChild.material);
      }
    } else if ((child as { isSprite?: boolean }).isSprite) {
      materials.add((child as THREE.Sprite).material);
    }
  });
  return materials.size;
}

export function getJointNames(root: THREE.Object3D): string[] {
  const joints: string[] = [];
  root.traverse((child) => {
    if (child.name.startsWith('Joint_')) {
      joints.push(child.name);
    }
  });
  return joints;
}

/** Count distinct material identities against an optional caller-selected budget.
 * This is not asset validation and does not estimate draw calls. */
export function materialBudgetAdvisory(
  root: THREE.Object3D,
  options: { maxMaterials?: number } = {},
): {
  materialCount: number;
  maxMaterials: number | null;
  exceeded: boolean | null;
  warnings: string[];
} {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== 'maxMaterials')
  ) {
    throw new Error('materialBudgetAdvisory: options may contain only maxMaterials.');
  }
  const requested = options.maxMaterials;
  if (
    requested !== undefined &&
    (typeof requested !== 'number' || !Number.isSafeInteger(requested) || requested < 0)
  ) {
    throw new Error('materialBudgetAdvisory: maxMaterials must be a nonnegative safe integer.');
  }
  const maxMaterials = requested === undefined ? null : requested;
  const materialCount = countMaterials(root);
  const exceeded = maxMaterials === null ? null : materialCount > maxMaterials;
  return {
    materialCount,
    maxMaterials,
    exceeded,
    warnings: exceeded
      ? [
          `Material count ${materialCount} exceeds the requested budget ${maxMaterials}. This count is not a draw-call estimate or an asset-validity verdict.`,
        ]
      : [],
  };
}

/**
 * The full sandbox globals used when executing Kiln code. Kept in one place
 * so render.ts and any future evaluator share the same surface area as what
 * the LLM expects.
 *
 * Pass `usage` to tally how many times each primitive was invoked by the
 * agent-generated `build()` call. The counter lives on the caller's object
 * so render.ts can stash it into `render.meta.primitiveUsage` for
 * downstream analysis. When omitted, wrapping is skipped (zero overhead).
 */
export type DiagnosticConsole = Pick<Console, 'log' | 'info' | 'debug' | 'warn' | 'error'>;

export interface SandboxGlobalsOptions {
  /** Host-owned closed resolver. Generated code receives only the bound
   *  loadApprovedTexture(resourceId) closure, never this object. */
  textureResolver?: TextureResolver;
  /** Host-owned diagnostic sink; defaults to the ambient console for library callers. */
  console?: DiagnosticConsole;
}

export function buildSandboxGlobals(
  usage?: Record<string, number>,
  options: SandboxGlobalsOptions = {},
): Record<string, unknown> {
  // CSG ops remain lazy at their own call sites, so importing the wrapper here
  // is safe for Node ESM builds and still avoids manifold WASM init unless used.

  const wrap = <F extends (...args: never[]) => unknown>(name: string, fn: F): F => {
    if (!usage) return fn;
    const wrapped = (...args: Parameters<F>): ReturnType<F> => {
      usage[name] = (usage[name] ?? 0) + 1;
      // `fn` IS an F, so this genuinely returns `ReturnType<F>`; tsc resolves the call
      // through F's constraint and sees only `unknown`. The assertion states what holds
      // by construction, and is narrower than typing the bound as `any`, which would
      // silence the whole expression instead of this one step.
      return fn(...args) as ReturnType<F>;
    };
    return wrapped as F;
  };

  // -- Lazy mesh cache (per-sandbox, not a process global) ---------------
  //
  // Pattern adapted from chili3d's lazy-mesher: each parametric geometry is
  // memoised on stringified args, so repeated calls inside a single build()
  // return the same BufferGeometry reference. Direct-library factories remain
  // fresh allocations. Pass cached references directly for intentional sharing;
  // call copyGeometry before mutating vertices so other parts stay unchanged.
  // Export may also deduplicate identical resources independently of this cache.
  //
  // Each cached geometry is also stamped with a `kilnRanges` entry on its
  // userData (B3 — sub-shape mapping). The renderer ignores it (gltf-
  // transform doesn't serialise userData), but downstream tooling — a
  // future click-to-edit interaction in the gallery viewer — can map a
  // clicked triangle back to the primitive call that produced it.
  const geoCache = new Map<string, THREE.BufferGeometry>();
  let _kilnCallSeq = 0;
  const stampKilnRange = (name: string, geo: THREE.BufferGeometry) => {
    const idx = geo.getIndex();
    const triCount = idx ? idx.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3;
    const callId = ++_kilnCallSeq;
    geo.userData = {
      ...(geo.userData ?? {}),
      kilnRanges: [
        {
          name: `${name}#${callId}`,
          start: 0,
          count: Math.floor(triCount),
        },
      ],
    };
  };
  const cacheGeo = <F extends (...args: never[]) => THREE.BufferGeometry>(
    name: string,
    fn: F,
  ): F => {
    const memoFn = (...args: Parameters<F>): THREE.BufferGeometry => {
      let key: string;
      try {
        key = `${name}::${JSON.stringify(args)}`;
      } catch {
        // Args weren't JSON-stringifiable (circular ref, BufferGeometry,
        // etc.) — bypass the cache rather than throw, but still tag the
        // result with kilnRanges so downstream inspection works.
        const result = fn(...args);
        stampKilnRange(name, result);
        return result;
      }
      const hit = geoCache.get(key);
      if (hit) return hit;
      const result = fn(...args);
      stampKilnRange(name, result);
      geoCache.set(key, result);
      return result;
    };
    return memoFn as F;
  };
  // Compose: usage tracking (outer) + memoisation (inner). A cache hit
  // still ticks the usage counter so the telemetry reflects what the
  // agent wrote, not what was recomputed.
  const wrapGeo = <F extends (...args: never[]) => THREE.BufferGeometry>(name: string, fn: F): F =>
    wrap(name, cacheGeo(name, fn));

  const loadApprovedTexture = (...args: unknown[]): Promise<THREE.DataTexture> => {
    if (args.length !== 1 || typeof args[0] !== 'string') {
      return Promise.reject(
        new TypeError('loadApprovedTexture accepts exactly one approved resource ID string'),
      );
    }
    if (!options.textureResolver) {
      return Promise.reject(new Error('loadApprovedTexture: no host TextureResolver is installed'));
    }
    return options.textureResolver.loadApprovedTexture(args[0]);
  };

  const sandboxMaterialRecipe = (...args: unknown[]): Promise<THREE.MeshStandardMaterial> => {
    if (args.length < 1 || args.length > 2 || typeof args[0] !== 'string') {
      return Promise.reject(
        new TypeError(
          'materialRecipe accepts an approved recipe ID and optional bounded overrides',
        ),
      );
    }
    if (!options.textureResolver) {
      return Promise.reject(new Error('materialRecipe: no host TextureResolver is installed'));
    }
    return options.textureResolver.materialRecipe(args[0], args[1]);
  };

  return {
    createRoot: wrap('createRoot', createRoot),
    describeAssembly: wrap('describeAssembly', describeAssembly),
    replicateAssembly: wrap('replicateAssembly', replicateAssembly),
    createPivot: wrap('createPivot', createPivot),
    createJointChain: wrap('createJointChain', createJointChain),
    createVehicleFrame: wrap('createVehicleFrame', createVehicleFrame),
    createWheelGeometrySet: wrap('createWheelGeometrySet', createWheelGeometrySet),
    createWheelAssembly: wrap('createWheelAssembly', createWheelAssembly),
    createPart: wrap('createPart', createPart),
    capsuleGeo: wrapGeo('capsuleGeo', capsuleGeo),
    capsuleXGeo: wrapGeo('capsuleXGeo', capsuleXGeo),
    capsuleYGeo: wrapGeo('capsuleYGeo', capsuleYGeo),
    capsuleZGeo: wrapGeo('capsuleZGeo', capsuleZGeo),
    cylinderGeo: wrapGeo('cylinderGeo', cylinderGeo),
    cylinderXGeo: wrapGeo('cylinderXGeo', cylinderXGeo),
    cylinderYGeo: wrapGeo('cylinderYGeo', cylinderYGeo),
    cylinderZGeo: wrapGeo('cylinderZGeo', cylinderZGeo),
    boxGeo: wrapGeo('boxGeo', boxGeo),
    sphereGeo: wrapGeo('sphereGeo', sphereGeo),
    coneGeo: wrapGeo('coneGeo', coneGeo),
    coneXGeo: wrapGeo('coneXGeo', coneXGeo),
    coneYGeo: wrapGeo('coneYGeo', coneYGeo),
    coneZGeo: wrapGeo('coneZGeo', coneZGeo),
    taperConeGeo: wrapGeo('taperConeGeo', taperConeGeo),
    cylinderOnAxis: wrapGeo('cylinderOnAxis', cylinderOnAxis),
    torusGeo: wrapGeo('torusGeo', torusGeo),
    planeGeo: wrapGeo('planeGeo', planeGeo),
    decalBox: wrapGeo('decalBox', decalBox),
    foliageCardGeo: wrapGeo('foliageCardGeo', foliageCardGeo),
    crossedQuadsGeo: wrapGeo('crossedQuadsGeo', crossedQuadsGeo),
    octaGridPlane: wrapGeo('octaGridPlane', octaGridPlane),
    wingGeo: wrapGeo('wingGeo', wingGeo),
    createWingPair: wrap('createWingPair', createWingPair),
    beamBetween: wrap('beamBetween', beamBetween),
    createLadder: wrap('createLadder', createLadder),
    snapTo: wrap('snapTo', snapTo),
    room: wrap('room', room),
    wallWithOpening: wrap('wallWithOpening', wallWithOpening),
    createRoofPlanes: wrap('createRoofPlanes', createRoofPlanes),
    createGableRoof: wrap('createGableRoof', createGableRoof),
    createGableEndPanel: wrap('createGableEndPanel', createGableEndPanel),
    createGableShell: wrap('createGableShell', createGableShell),
    createRoofSurfaceLayout: wrap('createRoofSurfaceLayout', createRoofSurfaceLayout),
    createStairs: wrap('createStairs', createStairs),
    gameMaterial: wrap('gameMaterial', gameMaterial),
    materialRecipe: wrap('materialRecipe', sandboxMaterialRecipe),
    compilePortableMaterialSpecV2: wrap('compilePortableMaterialSpecV2', (...args: unknown[]) => {
      if (args.length !== 1)
        return Promise.reject(
          new TypeError('compilePortableMaterialSpecV2 accepts exactly one material spec'),
        );
      return compilePortableMaterialSpecV2(args[0], { resolver: options.textureResolver });
    }),
    basicMaterial: wrap('basicMaterial', basicMaterial),
    glassMaterial: wrap('glassMaterial', glassMaterial),
    lambertMaterial: wrap('lambertMaterial', lambertMaterial),
    rotationTrack: wrap('rotationTrack', rotationTrack),
    positionTrack: wrap('positionTrack', positionTrack),
    scaleTrack: wrap('scaleTrack', scaleTrack),
    createClip: wrap('createClip', createClip),
    spinAnimation: wrap('spinAnimation', spinAnimation),
    bobbingAnimation: wrap('bobbingAnimation', bobbingAnimation),
    idleBreathing: wrap('idleBreathing', idleBreathing),
    implicitSurface: wrap('implicitSurface', implicitSurface),
    sweepProfile: wrap('sweepProfile', sweep.sweepProfile),
    loftProfiles: wrap('loftProfiles', sweep.loftProfiles),
    bend: wrap('bend', deform.bend),
    twist: wrap('twist', deform.twist),
    taper: wrap('taper', deform.taper),
    displace: wrap('displace', deform.displace),
    copyGeometry: wrap('copyGeometry', copyGeometry),
    copyMaterial: wrap('copyMaterial', copyMaterial),
    meshGeo: wrap('meshGeo', geometry.meshGeo),
    parametricSurface: wrap('parametricSurface', geometry.parametricSurface),
    creaseNormals: wrap('creaseNormals', geometry.creaseNormals),
    geometryDiagnostics: wrap('geometryDiagnostics', geometry.geometryDiagnostics),
    createInstance: wrap('createInstance', createInstance),
    // CSG (async)
    boolUnion: wrap('boolUnion', solids.boolUnion),
    boolDiff: wrap('boolDiff', solids.boolDiff),
    boolIntersect: wrap('boolIntersect', solids.boolIntersect),
    hull: wrap('hull', solids.hull),
    // Bevel / extrude / revolve (async — same manifold WASM as the CSG ops).
    // NOT wrapGeo: these return a Promise, and the geometry memo/kilnRanges
    // stamp in wrapGeo operates on a BufferGeometry synchronously.
    roundedBoxGeo: wrap('roundedBoxGeo', profile.roundedBoxGeo),
    extrudeProfile: wrap('extrudeProfile', profile.extrudeProfile),
    revolveProfile: wrap('revolveProfile', profile.revolveProfile),
    circleProfile: wrap('circleProfile', profile.circleProfile),
    // Array/mirror/subdivide/curve ops
    arrayLinear: wrap('arrayLinear', ops.arrayLinear),
    arrayRadial: wrap('arrayRadial', ops.arrayRadial),
    mirror: wrap('mirror', ops.mirror),
    subdivide: wrap('subdivide', ops.subdivide),
    mergeVertices: wrap('mergeVertices', ops.mergeVertices),
    curveToMesh: wrap('curveToMesh', ops.curveToMesh),
    pipeAlongPath: wrap('pipeAlongPath', ops.pipeAlongPath),
    lathe: wrap('lathe', ops.lathe),
    revolveGeo: wrap('revolveGeo', ops.revolveGeo),
    bezierCurve: wrap('bezierCurve', ops.bezierCurve),
    // UV (async)
    autoUnwrap: wrap('autoUnwrap', uv.autoUnwrap),
    // Shape-aware unwraps (sync — preserve built-in directional UVs)
    projectUV: wrap('projectUV', projectUV),
    remapUV: wrap('remapUV', uvShapes.remapUV),
    // Parametric primitives
    gearGeo: wrapGeo('gearGeo', gears.gearGeo),
    bladeGeo: wrapGeo('bladeGeo', gears.bladeGeo),
    // Closed approved textures. Paths, URLs, bytes, hashes, and resolver
    // objects are intentionally not accepted by this one-argument closure.
    loadApprovedTexture: wrap('loadApprovedTexture', loadApprovedTexture),
    // Procedural textures (sync — no I/O, so no await)
    proceduralTexture: wrap('proceduralTexture', proceduralTextures.proceduralTexture),
    normalMapFromHeight: wrap('normalMapFromHeight', proceduralTextures.normalMapFromHeight),
    pbrMaterial: wrap('pbrMaterial', textures.pbrMaterial),
    foliageMaterial: wrap('foliageMaterial', textures.foliageMaterial),
    countTriangles: wrap('countTriangles', countTriangles),
    countMaterials: wrap('countMaterials', countMaterials),
    getJointNames: wrap('getJointNames', getJointNames),
    materialBudgetAdvisory: wrap('materialBudgetAdvisory', materialBudgetAdvisory),
    // THREE namespace is exposed so agents can `new THREE.Mesh(geo, mat)`
    // as operands to CSG and other ops that expect Object3D inputs.
    THREE,
    Math,
    console: options.console ?? console,
  };
}
