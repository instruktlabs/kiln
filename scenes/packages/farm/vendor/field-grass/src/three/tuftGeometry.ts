// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Matthew Kissinger
/**
 * One tuft of grass, as geometry. Every blade in the game is a copy of one of
 * these two meshes; the bake decides where the copies stand (tools/bake-grass.mjs)
 * and this file decides what a copy looks like.
 *
 * WHY A TUFT AND NOT A BLADE. Brushstroke masses read better than
 * photoreal blades, and a mass is also the cheaper unit: a clump of seven blades
 * placed once costs one twelve-byte record instead of seven, and the blades
 * inside it can be arranged to read as one shape - splayed outward, unequal
 * heights, unequal lean - which is what a painted clump of grass actually looks
 * like. Seven blades scattered independently read as seven blades.
 *
 * SEEDED, NOT RANDOM. The arrangement comes from `mulberry32`, so the mesh is
 * the same on every machine and every run. This is mesh construction, not
 * scatter: placements are baked, and what is built here is one
 * small buffer of a few hundred vertices, the same way scene/terrainGeometry.ts
 * builds the ground from the committed grid.
 *
 * WHAT THE SHADER READS OFF A VERTEX. Four attributes, no more:
 *
 *   position  the blade in tuft-local metres, already curved
 *   normal    the blade's face normal, lifted toward the sky (see NORMAL_LIFT)
 *   uv        (across, along) - 0..1 across the blade's width, 0..1 root to tip
 *   uv1       (phase, stature) - the blade's own wind phase, and how tall it is
 *             relative to its tuft, so the long blades in a clump lead the gust
 *
 * `uv` and `uv1` carry these rather than custom-named attributes because the
 * TSL shim exposes `uv(index)` and adding two more accessors to it for a pair
 * of vec2s would widen a shared module for one caller's convenience.
 */

import * as THREE from 'three/webgpu';
import { mulberry32 } from '../core/rng';

export interface TuftShape {
  /** Blades in the clump. */
  readonly blades: number;
  /**
   * Height fractions of the paired vertex rows, root first, tip excluded. Three
   * entries is a three-segment blade with a curve you can see; two is the flat
   * tier's blade, which is only ever a few pixels tall.
   */
  readonly rows: readonly number[];
  /** How far from the tuft centre a blade may root, metres. */
  readonly clumpRadius: number;
  /** Authored blade height at tuft scale 1.0, metres. */
  readonly height: number;
  /** Authored half-width at the root, metres. */
  readonly halfWidth: number;
  /** Seed for the arrangement. Different per shape so the two do not rhyme. */
  readonly seed: number;
}

/**
 * The interactive tier: seven blades, three segments. 0.52 m before the tuft's
 * own 0.62-1.50 height scale, so the meadow runs 0.32 m to 0.78 m - shin to
 * knee on a medium game animal. This lets actors part the grass without
 * disappearing into it.
 */
export const FIELD_TUFT: TuftShape = {
  blades: 7,
  rows: [0, 0.36, 0.7],
  clumpRadius: 0.34,
  height: 0.52,
  halfWidth: 0.085,
  seed: 0x9d2b,
};

/**
 * The surround tier: five blades, two segments, a wider and slightly taller
 * clump. It is never closer than 106 m to any body in the game and never
 * interacts, so it spends its vertices on covering ground instead of on curve.
 */
export const SURROUND_TUFT: TuftShape = {
  blades: 5,
  rows: [0, 0.45],
  clumpRadius: 0.44,
  height: 0.58,
  halfWidth: 0.1,
  seed: 0x4f17,
};

/**
 * A calmer, more graphic clump for the storybook preset. Five wider blades
 * keep the silhouette readable without chasing a particular studio's look.
 */
export const STORYBOOK_TUFT: TuftShape = {
  blades: 5,
  rows: [0, 0.4, 0.74],
  clumpRadius: 0.38,
  height: 0.56,
  halfWidth: 0.105,
  seed: 0x72e1,
};

/** Blade lean at the tip, as a fraction of its height. Splays the clump. */
const LEAN_MIN = 0.22;
const LEAN_MAX = 0.78;
/** Lean grows as t^this: a blade is upright at the root and falls at the tip. */
const LEAN_POWER = 1.75;
/** How much a leaning blade loses in height. Keeps the arc roughly isometric. */
const CURVE_SHORTEN = 0.16;
/** Per-blade height spread inside a clump. Unequal blades read as a plant. */
const STATURE_MIN = 0.7;
const STATURE_MAX = 1.15;
/** Per-blade width spread. */
const WIDTH_MIN = 0.82;
const WIDTH_MAX = 1.24;
/** How far a blade's own yaw may wander off its radial direction, radians. */
const YAW_SPREAD = 0.55;

/**
 * How much of the vertex normal is the sky rather than the blade's own face.
 *
 * Measured against the sun, not chosen: the key sits 8 degrees above the
 * horizon (tsl/palette.ts), so the Y component of a normal barely moves nDotL
 * and the horizontal component is nearly all of it. At full face normal every
 * blade swings the whole ramp and the field reads as static - the camouflage
 * camouflage failure. At full sky normal the whole meadow is one flat tone.
 * 0.84 sky to 0.46 face puts the swing at +/-0.23 around 0.5, which crosses
 * both band edges (shadowEdge 0.42, litEdge 0.58): every clump carries all
 * three tones, and which tone a blade lands in depends on which way it faces,
 * without any blade falling all the way to the bottom of the shadow band.
 */
const NORMAL_LIFT = 0.84;
const NORMAL_FACE = 0.46;
/**
 * Edge cupping: the outer vertices of a row tilt their normals away from the
 * blade's centre line, so a flat two-triangle strip shades like a rounded
 * strand instead of like a ribbon.
 */
const NORMAL_CUP = 0.38;

/** Width across the blade at height fraction t, as a fraction of halfWidth. */
function widthProfile(t: number): number {
  return Math.sqrt(Math.max(0, 1 - t * t * 0.94)) * (1 - 0.18 * t);
}

/**
 * Build one tuft. Positions are tuft-local metres with the root at the origin;
 * the instance matrix carries yaw, uniform scale and the ground position.
 */
export function buildTuftGeometry(shape: TuftShape): THREE.BufferGeometry {
  const rng = mulberry32(shape.seed);
  const rowCount = shape.rows.length;
  const vertsPerBlade = rowCount * 2 + 1;
  const trisPerBlade = (rowCount - 1) * 2 + 1;

  const vertexCount = shape.blades * vertsPerBlade;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const uv1s = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(shape.blades * trisPerBlade * 3);

  let p = 0;
  let n = 0;
  let u = 0;
  let u1 = 0;
  let i = 0;

  for (let blade = 0; blade < shape.blades; blade++) {
    // Blades are spread around the clump by a turn each plus a jitter, so the
    // arrangement never collapses into a line and never looks like a dial.
    const around = ((blade + rng() * 0.75) / shape.blades) * Math.PI * 2;
    const radius = shape.clumpRadius * Math.sqrt(rng());
    const rootX = Math.cos(around) * radius;
    const rootZ = Math.sin(around) * radius;

    // Outward lean: the blade falls away from the clump centre, which is what
    // gives a tuft its fountain silhouette and what gives it any presence at
    // all seen from the Classic camera's 50 degree look-down.
    const yaw = around + (rng() - 0.5) * 2 * YAW_SPREAD;
    const leanX = Math.cos(yaw);
    const leanZ = Math.sin(yaw);
    const sideX = -leanZ;
    const sideZ = leanX;

    const lean = LEAN_MIN + (LEAN_MAX - LEAN_MIN) * rng();
    const stature = STATURE_MIN + (STATURE_MAX - STATURE_MIN) * rng();
    const width = WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * rng();
    const phase = rng();
    const height = shape.height * stature;
    const base = blade * vertsPerBlade;

    for (let row = 0; row < rowCount; row++) {
      const t = shape.rows[row]!;
      const forward = lean * height * Math.pow(t, LEAN_POWER);
      const y = height * t * (1 - CURVE_SHORTEN * t * t);
      const halfWidth = shape.halfWidth * width * widthProfile(t);
      const centerX = rootX + leanX * forward;
      const centerZ = rootZ + leanZ * forward;

      // Face normal: the blade's surface is spanned by its side axis and its
      // tangent, and the tangent tilts toward the lean as the blade curves.
      const nextT = row + 1 < rowCount ? shape.rows[row + 1]! : 1;
      const dForward = lean * height * (Math.pow(nextT, LEAN_POWER) - Math.pow(t, LEAN_POWER));
      const dY = height * (nextT * (1 - CURVE_SHORTEN * nextT * nextT) - t * (1 - CURVE_SHORTEN * t * t));
      const tangentX = leanX * dForward;
      const tangentZ = leanZ * dForward;
      // cross(side, tangent), with side flat in XZ and tangent (tx, dY, tz).
      const faceX = sideZ * dY;
      const faceY = sideZ * tangentX - sideX * tangentZ;
      const faceZ = -sideX * dY;

      for (const side of [-1, 1] as const) {
        positions[p++] = centerX + sideX * halfWidth * side;
        positions[p++] = y;
        positions[p++] = centerZ + sideZ * halfWidth * side;

        const cupX = faceX + sideX * NORMAL_CUP * side;
        const cupY = faceY;
        const cupZ = faceZ + sideZ * NORMAL_CUP * side;
        const faceLength = Math.hypot(cupX, cupY, cupZ) || 1;
        const nx = (cupX / faceLength) * NORMAL_FACE;
        const ny = (cupY / faceLength) * NORMAL_FACE + NORMAL_LIFT;
        const nz = (cupZ / faceLength) * NORMAL_FACE;
        const length = Math.hypot(nx, ny, nz) || 1;
        normals[n++] = nx / length;
        normals[n++] = ny / length;
        normals[n++] = nz / length;

        uvs[u++] = side < 0 ? 0 : 1;
        uvs[u++] = t;
        uv1s[u1++] = phase;
        uv1s[u1++] = stature;
      }
    }

    // The tip: one vertex, so a blade ends in a point rather than in a cut.
    const tipForward = lean * height;
    const tipY = height * (1 - CURVE_SHORTEN);
    positions[p++] = rootX + leanX * tipForward;
    positions[p++] = tipY;
    positions[p++] = rootZ + leanZ * tipForward;
    {
      const tangentX = leanX * lean * height * LEAN_POWER;
      const tangentZ = leanZ * lean * height * LEAN_POWER;
      const dY = height * (1 - 3 * CURVE_SHORTEN);
      const faceX = sideZ * dY;
      const faceY = sideZ * tangentX - sideX * tangentZ;
      const faceZ = -sideX * dY;
      const faceLength = Math.hypot(faceX, faceY, faceZ) || 1;
      const nx = (faceX / faceLength) * NORMAL_FACE;
      const ny = (faceY / faceLength) * NORMAL_FACE + NORMAL_LIFT;
      const nz = (faceZ / faceLength) * NORMAL_FACE;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[n++] = nx / length;
      normals[n++] = ny / length;
      normals[n++] = nz / length;
    }
    uvs[u++] = 0.5;
    uvs[u++] = 1;
    uv1s[u1++] = phase;
    uv1s[u1++] = stature;

    // Winding: (left, right, rightAbove) has geometric normal cross(side,
    // tangent), which is the face normal written above, so front faces and
    // vertex normals agree and the double-sided flip lands the right way round.
    for (let row = 0; row + 1 < rowCount; row++) {
      const l0 = base + row * 2;
      const r0 = l0 + 1;
      const l1 = l0 + 2;
      const r1 = l0 + 3;
      indices[i++] = l0;
      indices[i++] = r0;
      indices[i++] = r1;
      indices[i++] = l0;
      indices[i++] = r1;
      indices[i++] = l1;
    }
    const lastL = base + (rowCount - 1) * 2;
    indices[i++] = lastL;
    indices[i++] = lastL + 1;
    indices[i++] = lastL + 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1s, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // The instance matrices place these all over the field and the wind moves
  // them further, so the tuft's own bounds are meaningless; the meshes turn
  // frustum culling off and this keeps three from computing a sphere nobody
  // reads.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), shape.clumpRadius + shape.height);
  return geometry;
}

/** Blades in a tuft times the tuft count: the number the perf report quotes. */
export function bladeCount(shape: TuftShape, tufts: number): number {
  return shape.blades * tufts;
}
