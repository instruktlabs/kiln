/**
 * Kiln profile solids — bevel, chamfer, extrude, revolve (manifold-3d backed)
 *
 * Three ops that close the two biggest gaps in the primitive set: nothing
 * could round or chamfer an edge, and nothing could turn an arbitrary 2D
 * outline into a solid. Both are answered by the same mechanism, so they live
 * together.
 *
 * ## Why this implementation and not the obvious one
 *
 * The textbook general bevel is morphological: erode the solid by r, then
 * dilate it by r (a Minkowski "open"). manifold-3d exposes `minkowskiSum` /
 * `minkowskiDifference`, and it does produce a correct, size-preserving round
 * on arbitrary meshes. It is unusable inside a generation loop — measured on
 * this exact library version:
 *
 *   | source            | tris in | tris out |     time |
 *   |-------------------|---------|----------|----------|
 *   | box               |      12 |      236 |    61 ms |
 *   | plate with a hole |     208 |   23,760 | 10,161 ms |
 *   | sphere (seg 64)   |   2,048 |    8,978 | 35,860 ms |
 *
 * Cost is superlinear in source complexity and it detonates the triangle
 * budget. `smoothOut() + refine()` is fast but is not a bevel at all: it moves
 * the bounding box (a unit box becomes 1.56 across) and inflates volume.
 *
 * What works is doing the rounding in **2D** and then sweeping: offset the
 * cross-section with a `JoinType`, then `extrude` or `revolve`. Every case
 * measured here lands between 0.3 ms and 9 ms, preserves the bounding box
 * exactly, keeps holes, and composes with the boolean ops in `solids.ts`.
 *
 * The bevel sequence is erode(-r) -> dilate(+2r) -> erode(-r), which rounds
 * **inner and outer** corners while leaving the outer dimensions untouched.
 *
 * ## What this deliberately does NOT do
 *
 * There is no general "bevel every edge of an arbitrary mesh" op. `extrudeProfile`
 * rounds the edges **parallel to the sweep axis** (the profile's corners); the
 * two caps stay sharp. For an all-12-edges rounded box use `roundedBoxGeo`.
 * Re-rounding an arbitrary solid by projecting it back to 2D works only for
 * genuinely prismatic shapes and silently destroys everything else, so it is
 * not exposed.
 *
 * As with all manifold-backed ops, only positions survive: normals are
 * regenerated and UVs are not carried.
 */

import type * as THREE from 'three';
import type { CrossSection, JoinType, Manifold, Vec2 } from 'manifold-3d';
import { getManifoldModule, manifoldToGeometry } from './solids';
import { AuthoringDiagnosticError } from './evaluator/authoring-diagnostic';

/** A closed 2D outline as `[x, y]` pairs — same convention as `lathe`. */
export type Profile2D = Array<[number, number]>;

/** `round` = fillet, `chamfer` = a single flat cut across the corner. */
export type BevelStyle = 'round' | 'chamfer';

/** Which world axis the sweep runs along. */
export type SweepAxis = 'x' | 'y' | 'z';

export interface ExtrudeProfileOptions {
  /** Length of the sweep. Default 1. */
  depth?: number;
  /** Holes as additional closed outlines, subtracted from `profile`. */
  holes?: Profile2D[];
  /** Corner rounding radius. 0 (default) leaves corners sharp. */
  bevel?: number;
  /** `round` (default) or `chamfer`. */
  bevelStyle?: BevelStyle;
  /** Segments per 360 degrees of round corner. Default 12. */
  segments?: number;
  /** Total twist across the sweep, in degrees. Default 0. */
  twist?: number;
  /** Top scale: `0.5` shrinks both axes by half, `0` makes a pyramid/cone. */
  taper?: number | [number, number];
  /**
   * Intermediate rings between the two caps, a whole number >= 0. Default 0
   * (caps joined by one band of side faces); 16 when twisting.
   */
  divisions?: number;
  /** Sweep axis. Default `y`, matching `cylinderGeo`. */
  axis?: SweepAxis;
  /** Center on the sweep axis. Default true, matching `boxGeo`. */
  center?: boolean;
  /** Averaged (smooth) normals instead of flat facets. Default false. */
  smooth?: boolean;
}

export interface RevolveProfileOptions {
  /** Radial segments. Default 24. */
  segments?: number;
  /** Sweep angle in degrees. Default 360. */
  angle?: number;
  /** Corner rounding radius applied to the profile before revolving. */
  bevel?: number;
  /** `round` (default) or `chamfer`. */
  bevelStyle?: BevelStyle;
  /** Segments per 360 degrees of round corner. Default 12. */
  bevelSegments?: number;
  /** Axis of revolution. Default `y`, matching `lathe`. */
  axis?: SweepAxis;
  /** Averaged (smooth) normals. Default true — revolved shapes are curved. */
  smooth?: boolean;
}

export interface RoundedBoxOptions {
  /** `round` (default) or `chamfer`. */
  style?: BevelStyle;
  /** Sphere segments for `round`. Default 12. Higher = smoother, more tris. */
  segments?: number;
  /** Averaged normals. Defaults to true for `round`, false for `chamfer`. */
  smooth?: boolean;
}

const JOIN_FOR_STYLE: Record<BevelStyle, JoinType> = {
  // Measured, not assumed: on a 2x2 square with bevel 0.1, `Round` yields a
  // 5-point arc per corner, `Square` yields one 45-degree flat, and `Miter`
  // leaves the corner *untouched* (area stays exactly 4.0). Miter is a
  // corner-preserving join by definition and is never a bevel.
  round: 'Round',
  chamfer: 'Square',
};

function assertFiniteProfile(profile: Profile2D, label: string): void {
  if (!Array.isArray(profile) || profile.length < 3) {
    throw new Error(`${label}: need at least 3 points to form a closed outline.`);
  }
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new Error(
        `${label}: point ${i} is not a finite [x, y] pair (got ${JSON.stringify(p)}).`,
      );
    }
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number (got ${value}).`);
  }
}

/** Rotate a Z-swept geometry onto the requested axis, in place. */
function orientSweep(geo: THREE.BufferGeometry, axis: SweepAxis): THREE.BufferGeometry {
  // manifold sweeps along +Z; Kiln's primitive set is Y-up.
  if (axis === 'y') geo.rotateX(-Math.PI / 2);
  else if (axis === 'x') geo.rotateY(Math.PI / 2);
  else if (axis !== 'z') throw new Error(`axis must be 'x', 'y', or 'z' (got ${String(axis)}).`);
  return geo;
}

/**
 * Round or chamfer every corner of a cross-section without moving its outer
 * dimensions: erode by r, dilate by 2r, erode by r.
 *
 * Throws when `bevel` is too large for the profile's narrowest feature — the
 * first erosion empties the section, and manifold would otherwise hand back a
 * silently empty solid.
 */
function bevelCrossSection(
  cs: CrossSection,
  bevel: number,
  style: BevelStyle,
  segments: number,
  label: string,
): CrossSection {
  const join = JOIN_FOR_STYLE[style];
  if (!join) {
    throw new Error(`${label}: bevelStyle must be 'round' or 'chamfer' (got ${String(style)}).`);
  }
  const eroded = cs.offset(-bevel, join, 2, segments);
  if (eroded.isEmpty()) {
    eroded.delete();
    throw new AuthoringDiagnosticError('PROFILE_BEVEL_COLLAPSE');
  }
  const dilated = eroded.offset(2 * bevel, join, 2, segments);
  const out = dilated.offset(-bevel, join, 2, segments);
  eroded.delete();
  dilated.delete();
  return out;
}

/**
 * `scaleTop` MUST be a Vec2. manifold-3d 3.5.1 types it as `Vec2 | number`,
 * but the scalar path is misread as `[s, 0]`: `extrude(1, 1, 0, 1)` returns a
 * half-volume 20-triangle wedge where a unit prism was asked for, while
 * `extrude(1, 1, 0, [1, 1])` returns the correct volume-1 prism. Passing a
 * scalar silently produces wedges wherever a taper was intended.
 */
function normalizeTaper(taper: number | [number, number] | undefined): Vec2 {
  if (taper === undefined) return [1, 1];
  if (typeof taper === 'number') {
    if (!Number.isFinite(taper) || taper < 0) {
      throw new Error(`taper must be a finite number >= 0 (got ${taper}).`);
    }
    return [taper, taper];
  }
  if (
    !Array.isArray(taper) ||
    taper.length !== 2 ||
    !taper.every((v) => Number.isFinite(v) && v >= 0)
  ) {
    throw new Error(
      `taper must be a number or [x, y] pair of numbers >= 0 (got ${JSON.stringify(taper)}).`,
    );
  }
  return [taper[0], taper[1]];
}

/**
 * Sweep a closed 2D outline into a solid, optionally rounding or chamfering
 * its corners, punching holes, twisting, and tapering.
 *
 * The bevel applies to the edges **parallel to the sweep axis**. The two caps
 * stay sharp — for a box rounded on all twelve edges use `roundedBoxGeo`.
 *
 * Output is a watertight manifold solid, so it feeds straight into
 * `boolUnion` / `boolDiff` / `boolIntersect`.
 *
 * @example
 * // An L-bracket with filleted inner and outer corners.
 * const geo = await extrudeProfile(
 *   [[0, 0], [2, 0], [2, 0.4], [0.4, 0.4], [0.4, 2], [0, 2]],
 *   { depth: 0.5, bevel: 0.06 },
 * );
 * createPart('Bracket', geo, steel, { parent: root });
 *
 * @example
 * // A washer: round outline, round hole, chamfered edges.
 * const ring = await extrudeProfile(circleProfile(1), {
 *   depth: 0.2,
 *   holes: [circleProfile(0.5)],
 *   bevel: 0.03,
 *   bevelStyle: 'chamfer',
 * });
 *
 * @example
 * // A twisted tapered spire.
 * const spire = await extrudeProfile(
 *   [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
 *   { depth: 3, twist: 90, taper: 0.2 },
 * );
 */
export async function extrudeProfile(
  profile: Profile2D,
  options: ExtrudeProfileOptions = {},
): Promise<THREE.BufferGeometry> {
  assertFiniteProfile(profile, 'extrudeProfile');
  const {
    depth = 1,
    holes = [],
    bevel = 0,
    bevelStyle = 'round',
    segments = 12,
    twist = 0,
    taper,
    divisions,
    axis = 'y',
    center = true,
    smooth = false,
  } = options;
  assertPositive(depth, 'extrudeProfile: depth');
  if (bevel < 0) throw new Error(`extrudeProfile: bevel must be >= 0 (got ${bevel}).`);
  if (divisions !== undefined && !(Number.isInteger(divisions) && divisions >= 0)) {
    throw new Error(`extrudeProfile: divisions must be a whole number >= 0 (got ${divisions}).`);
  }
  for (let i = 0; i < holes.length; i++) {
    assertFiniteProfile(holes[i] as Profile2D, `extrudeProfile: holes[${i}]`);
  }

  const mod = await getManifoldModule();
  const { CrossSection: CS } = mod;

  const disposable: CrossSection[] = [];
  const track = <T extends CrossSection>(cs: T): T => {
    disposable.push(cs);
    return cs;
  };

  try {
    let section: CrossSection = track(new CS([profile as Vec2[]], 'NonZero'));
    if (holes.length > 0) {
      // Subtract rather than relying on an EvenOdd fill rule: agent-written
      // hole outlines have arbitrary winding, and a wrong winding under
      // EvenOdd yields a filled disc instead of a hole with no error.
      const holeSections = holes.map((h) => track(new CS([h as Vec2[]], 'NonZero')));
      section = track(CS.difference(section, CS.union(holeSections)));
      if (section.isEmpty()) {
        throw new Error(
          'extrudeProfile: the holes consume the whole profile — nothing left to extrude.',
        );
      }
    }
    if (bevel > 0) {
      section = track(bevelCrossSection(section, bevel, bevelStyle, segments, 'extrudeProfile'));
    }

    // Twist needs intermediate slices or it interpolates as a single shear. A
    // straight or tapered sweep is exact with none: each ring would only add
    // coplanar side triangles.
    const nDivisions = divisions ?? (twist !== 0 ? 16 : 0);
    const solid = section.extrude(depth, nDivisions, twist, normalizeTaper(taper), center);
    try {
      return orientSweep(manifoldToGeometry(solid, { smooth }), axis);
    } finally {
      solid.delete();
    }
  } finally {
    for (const cs of disposable) cs.delete();
  }
}

/**
 * Revolve a closed 2D outline around an axis into a **solid** (watertight,
 * CSG-ready) shape, optionally rounding its corners first.
 *
 * This is the manifold-backed sibling of `lathe` / `revolveGeo`, which build
 * an open Three.js `LatheGeometry` surface. Reach for those when you just want
 * a surface; reach for this when the result has to survive a boolean, or when
 * you want the rim rounded.
 *
 * The profile is in the same convention as `lathe`: `x` is distance from the
 * axis, `y` is position along it. Only the `x >= 0` side is used.
 *
 * @example
 * // A pill/capsule tank with a rounded rim, ready to be carved.
 * const body = await revolveProfile(
 *   [[0, -0.5], [0.4, -0.5], [0.4, 0.5], [0, 0.5]],
 *   { bevel: 0.08, segments: 32 },
 * );
 * const carved = await boolDiff('Tank', createPart('B', body, mat), portCutter);
 */
export async function revolveProfile(
  profile: Profile2D,
  options: RevolveProfileOptions = {},
): Promise<THREE.BufferGeometry> {
  assertFiniteProfile(profile, 'revolveProfile');
  const {
    segments = 24,
    angle = 360,
    bevel = 0,
    bevelStyle = 'round',
    bevelSegments = 12,
    axis = 'y',
    smooth = true,
  } = options;
  if (bevel < 0) throw new Error(`revolveProfile: bevel must be >= 0 (got ${bevel}).`);
  if (!Number.isFinite(angle) || angle <= 0 || angle > 360) {
    throw new Error(`revolveProfile: angle must be in (0, 360] degrees (got ${angle}).`);
  }

  const mod = await getManifoldModule();
  const { CrossSection: CS } = mod;

  const disposable: CrossSection[] = [];
  try {
    let section: CrossSection = new CS([profile as Vec2[]], 'NonZero');
    disposable.push(section);
    if (bevel > 0) {
      section = bevelCrossSection(section, bevel, bevelStyle, bevelSegments, 'revolveProfile');
      disposable.push(section);
    }
    const solid = section.revolve(segments, angle);
    try {
      return orientSweep(manifoldToGeometry(solid, { smooth }), axis);
    } finally {
      solid.delete();
    }
  } finally {
    for (const cs of disposable) cs.delete();
  }
}

/**
 * A box with all twelve edges rounded or chamfered, at the exact outer size
 * you asked for — `roundedBoxGeo(1, 1, 1, 0.1)` is 1x1x1, not 1.2x1.2x1.2.
 *
 * `round` is built as the convex hull of eight inset spheres and `chamfer` as
 * the hull of three interlocking boxes. Both are exact and cheap (a seg-12
 * rounded box lands near 200 triangles in a couple of milliseconds).
 *
 * Argument order matches `boxGeo(width, height, depth)`.
 *
 * @example
 * const geo = await roundedBoxGeo(1.2, 0.6, 0.8, 0.05);
 * createPart('Console', geo, plastic, { position: [0, 0.3, 0], parent: root });
 *
 * @example
 * // Chamfered instead of filleted — reads as machined metal.
 * const block = await roundedBoxGeo(1, 1, 1, 0.08, { style: 'chamfer' });
 */
export async function roundedBoxGeo(
  width: number,
  height: number,
  depth: number,
  radius: number,
  options: RoundedBoxOptions = {},
): Promise<THREE.BufferGeometry> {
  assertPositive(width, 'roundedBoxGeo: width');
  assertPositive(height, 'roundedBoxGeo: height');
  assertPositive(depth, 'roundedBoxGeo: depth');
  assertPositive(radius, 'roundedBoxGeo: radius');
  const { style = 'round', segments = 12, smooth } = options;

  const smallest = Math.min(width, height, depth);
  if (radius >= smallest / 2) {
    throw new AuthoringDiagnosticError('ROUNDED_BOX_RADIUS');
  }

  const mod = await getManifoldModule();
  const ManifoldCls = mod.Manifold;
  const parts: Manifold[] = [];

  try {
    let solid: Manifold;
    if (style === 'round') {
      // Hull of eight spheres inset by the radius: exact outer size, every
      // edge and corner filleted.
      const corners: Manifold[] = [];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const s = ManifoldCls.sphere(radius, segments).translate([
              (sx * (width - 2 * radius)) / 2,
              (sy * (height - 2 * radius)) / 2,
              (sz * (depth - 2 * radius)) / 2,
            ]);
            parts.push(s);
            corners.push(s);
          }
        }
      }
      solid = ManifoldCls.hull(corners);
    } else if (style === 'chamfer') {
      // Hull of three interlocking boxes: each of the twelve edges becomes a
      // 45-degree flat, each corner a triangle. No rounding, no extra segments.
      const boxes = [
        ManifoldCls.cube([width, height - 2 * radius, depth - 2 * radius], true),
        ManifoldCls.cube([width - 2 * radius, height, depth - 2 * radius], true),
        ManifoldCls.cube([width - 2 * radius, height - 2 * radius, depth], true),
      ];
      parts.push(...boxes);
      solid = ManifoldCls.hull(boxes);
    } else {
      throw new Error(`roundedBoxGeo: style must be 'round' or 'chamfer' (got ${String(style)}).`);
    }

    try {
      return manifoldToGeometry(solid, { smooth: smooth ?? style === 'round' });
    } finally {
      solid.delete();
    }
  } finally {
    for (const p of parts) p.delete();
  }
}

/**
 * A closed circular outline, for feeding `extrudeProfile` / `revolveProfile`
 * holes and outlines without hand-writing trigonometry.
 *
 * @example
 * const washer = await extrudeProfile(circleProfile(1), {
 *   depth: 0.1,
 *   holes: [circleProfile(0.4)],
 * });
 */
export function circleProfile(
  radius: number,
  segments = 24,
  center: [number, number] = [0, 0],
): Profile2D {
  assertPositive(radius, 'circleProfile: radius');
  if (!Number.isInteger(segments) || segments < 3) {
    throw new Error(`circleProfile: segments must be an integer >= 3 (got ${segments}).`);
  }
  const out: Profile2D = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    out.push([center[0] + Math.cos(t) * radius, center[1] + Math.sin(t) * radius]);
  }
  return out;
}
