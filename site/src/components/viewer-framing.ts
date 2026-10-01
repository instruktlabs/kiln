import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

/** Default three-quarter view from slightly above the asset. */
const ELEVATION = 0.315; // radians, about 18 degrees
export const AZIMUTH = 0.733; // radians, about 42 degrees

export const orbitDirection = (azimuth: number) =>
  new THREE.Vector3(
    Math.cos(azimuth) * Math.cos(ELEVATION),
    Math.sin(ELEVATION),
    Math.sin(azimuth) * Math.cos(ELEVATION),
  );

const AZIMUTH_SAMPLES = 16;

/**
 * Every sampled point resolved into camera axes, once per azimuth on the
 * turntable.
 *
 * The whole turntable and not just the opening angle, because the view rotates:
 * framing for the angle it happens to start at walks the tail of a fifty-metre
 * airship off the edge four seconds later. Flat typed arrays because the search
 * below sweeps these tens of times and allocating a vector per point per pass
 * turns ten milliseconds into a second.
 */
function project(points: readonly THREE.Vector3[], origin: THREE.Vector3) {
  const n = points.length;
  const depth = new Float64Array(AZIMUTH_SAMPLES * n);
  const across = new Float64Array(AZIMUTH_SAMPLES * n);
  const above = new Float64Array(AZIMUTH_SAMPLES * n);
  const p = new THREE.Vector3();

  for (let a = 0; a < AZIMUTH_SAMPLES; a++) {
    const forward = orbitDirection((a / AZIMUTH_SAMPLES) * Math.PI * 2);
    const right = new THREE.Vector3().crossVectors(UP, forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right);
    for (let i = 0; i < n; i++) {
      p.copy(points[i]!).sub(origin);
      const at = a * n + i;
      depth[at] = p.dot(forward);
      across[at] = p.dot(right);
      above[at] = p.dot(up);
    }
  }
  return { n, depth, across, above };
}

type Projection = ReturnType<typeof project>;

/**
 * How far back the camera has to sit for everything to stay in frame, with the
 * orbit target raised by `lift` from where the projection was taken.
 *
 * A point is on screen when |across| <= (distance - depth) * tanH, and likewise
 * vertically, so each point names a distance and the largest one wins. Raising
 * the target moves each point down by `lift` in world space, which is a shift of
 * `lift * cos(elevation)` in the camera's vertical axis and `lift *
 * sin(elevation)` in depth; nothing moves horizontally, because the horizontal
 * axis of an orbiting camera is always level.
 */
function distanceFor(proj: Projection, lift: number, tanH: number, tanV: number) {
  const dz = lift * Math.sin(ELEVATION);
  const dy = lift * Math.cos(ELEVATION);
  let needed = 0;
  for (let i = 0; i < proj.depth.length; i++) {
    const depth = proj.depth[i]! - dz;
    const h = depth + Math.abs(proj.across[i]!) / tanH;
    const v = depth + Math.abs(proj.above[i]! - dy) / tanV;
    if (h > needed) needed = h;
    if (v > needed) needed = v;
  }
  return needed;
}

/**
 * Where to point the camera and how far back to put it.
 *
 * Aiming at the centre of the bounding box is the obvious choice and it wastes a
 * lot of screen. The camera looks down from eighteen degrees, so the near-bottom
 * of a wide asset projects much further below the centre than its far-top
 * projects above: the cathedral came out sitting low in a frame padded to fit the
 * corner of its own base slab, at about forty per cent of the width it could
 * have had. Raising the aim point re-centres the silhouette and the padding goes
 * away with it.
 *
 * The distance needed is convex in that height, so a ternary search finds the
 * best one in a few dozen evaluations of arithmetic over flat arrays.
 */
export function frameAsset(
  points: readonly THREE.Vector3[],
  center: THREE.Vector3,
  extent: number,
  fov: number,
  aspect: number,
) {
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  const proj = project(points, center);

  let low = -extent;
  let high = extent;
  for (let i = 0; i < 22; i++) {
    const a = low + (high - low) / 3;
    const b = high - (high - low) / 3;
    // Center from the vertical fit first. Including the horizontal constraint here
    // pushes the aim toward the top edge in portrait viewports: it shaves a little
    // distance while leaving the entire asset low in the frame.
    if (distanceFor(proj, a, Infinity, tanV) < distanceFor(proj, b, Infinity, tanV)) high = b;
    else low = a;
  }
  const lift = (low + high) / 2;
  return {
    target: new THREE.Vector3(center.x, center.y + lift, center.z),
    distance: distanceFor(proj, lift, tanH, tanV),
  };
}
