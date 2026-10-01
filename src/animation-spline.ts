/**
 * Cubic-spline keyframes (R67): the glTF CUBICSPLINE layout and arithmetic.
 *
 * A cubic track stores three values per key, exactly as a glTF CUBICSPLINE sampler does: the
 * key's in-tangent, its value and its out-tangent, `size` components each. Tangents are rates per
 * second. Between keys k and k + 1, with h = t[k+1] - t[k] and s = (t - t[k]) / h,
 *
 *   p(s) = (2s^3 - 3s^2 + 1) v[k] + (s^3 - 2s^2 + s) h out[k] + (-2s^3 + 3s^2) v[k+1] + (s^3 - s^2) h in[k+1]
 *
 * and a rotation is evaluated component-wise, then normalized. The authoring interpolations
 * compute the tangents once, when a track is built:
 *
 * - `CUBICSPLINE`: one smooth curve through every key, with the slopes PCHIP computes (as SciPy's
 *   `PchipInterpolator`): monotone between keys, so the curve never overshoots a key, and zero
 *   where the value holds or turns. Two keys give a straight line.
 * - `EASE_IN`, `EASE_OUT`, `EASE_IN_OUT`: each segment between consecutive keys starts at rest
 *   (s^2), ends at rest (2s - s^2) or both (3s^2 - 2s^3), like a CSS timing function on each
 *   keyframe interval. One key pair is a smooth swing.
 *
 * A rotation first takes the shortest arc between consecutive keys: a key whose quaternion has a
 * negative dot product with the previous key's is negated, which is the same rotation.
 *
 * three.js marks a CUBICSPLINE track on its interpolant factory (GLTFLoader sets the flag and
 * GLTFExporter reads it). This module reads that flag without importing three, so the
 * realm-agnostic poser in `views/pose.ts` can share it.
 */

export type CubicInterpolation = 'CUBICSPLINE' | 'EASE_IN' | 'EASE_OUT' | 'EASE_IN_OUT';

export const CUBIC_INTERPOLATIONS: readonly CubicInterpolation[] = [
  'CUBICSPLINE',
  'EASE_IN',
  'EASE_OUT',
  'EASE_IN_OUT',
];

/** The flag three.js puts on a glTF CUBICSPLINE track's interpolant factory. */
export const CUBIC_SPLINE_FACTORY_FLAG = 'isInterpolantFactoryMethodGLTFCubicSpline';

export function isCubicInterpolation(mode: unknown): mode is CubicInterpolation {
  return CUBIC_INTERPOLATIONS.includes(mode as CubicInterpolation);
}

/** True when `track` stores glTF CUBICSPLINE keys: [in-tangent, value, out-tangent] per key. */
export function isCubicSplineTrack(track: unknown): boolean {
  if (!track || typeof track !== 'object') return false;
  const factory = (track as { createInterpolant?: unknown }).createInterpolant;
  return (
    typeof factory === 'function' &&
    (factory as unknown as Record<string, unknown>)[CUBIC_SPLINE_FACTORY_FLAG] === true
  );
}

type Writable = { [index: number]: number };

/**
 * Evaluate the segment from key `k` to key `k + 1` (times `t0`, `t1`) at `t` into `out`, `size`
 * components, with the same arithmetic as three.js's glTF cubic-spline interpolant.
 */
export function cubicSegment(
  values: ArrayLike<number>,
  size: number,
  k: number,
  t0: number,
  t1: number,
  t: number,
  out: Writable,
): void {
  const span = t1 - t0;
  const p = (t - t0) / span;
  const pp = p * p;
  const ppp = pp * p;
  const s2 = -2 * ppp + 3 * pp;
  const s3 = ppp - pp;
  const s0 = 1 - s2;
  const s1 = s3 - pp + p;
  const at0 = k * size * 3;
  const at1 = at0 + size * 3;
  for (let i = 0; i < size; i++) {
    const p0 = values[at0 + size + i]!;
    const m0 = values[at0 + 2 * size + i]! * span;
    const p1 = values[at1 + size + i]!;
    const m1 = values[at1 + i]! * span;
    out[i] = s0 * p0 + s1 * m0 + s2 * p1 + s3 * m1;
  }
}

/** Normalize the quaternion in `q[0..3]` as three.js does; a zero quaternion becomes identity. */
export function normalizeQuaternion(q: Writable): void {
  const length = Math.sqrt(q[0]! * q[0]! + q[1]! * q[1]! + q[2]! * q[2]! + q[3]! * q[3]!);
  if (length === 0) {
    q[0] = 0;
    q[1] = 0;
    q[2] = 0;
    q[3] = 1;
    return;
  }
  const inverse = 1 / length;
  for (let i = 0; i < 4; i++) q[i] = q[i]! * inverse;
}

/** SciPy's PCHIP end slope: a three-point estimate kept on the side of its segment. */
function pchipEnd(h0: number, h1: number, m0: number, m1: number): number {
  const d = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
  if (Math.sign(d) !== Math.sign(m0)) return 0;
  if (Math.sign(m0) !== Math.sign(m1) && Math.abs(d) > 3 * Math.abs(m0)) return 3 * m0;
  return d;
}

/** PCHIP slopes (Fritsch-Butland weighted harmonic mean) of `y` at `t`, per second. */
function pchipSlopes(t: readonly number[], y: readonly number[]): number[] {
  const n = t.length;
  const h: number[] = [];
  const m: number[] = [];
  for (let k = 0; k < n - 1; k++) {
    h.push(t[k + 1]! - t[k]!);
    m.push((y[k + 1]! - y[k]!) / h[k]!);
  }
  if (n === 2) return [m[0]!, m[0]!];
  const d = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const before = m[k - 1]!;
    const after = m[k]!;
    if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) continue;
    const w1 = 2 * h[k]! + h[k - 1]!;
    const w2 = h[k]! + 2 * h[k - 1]!;
    d[k] = (w1 + w2) / (w1 / before + w2 / after);
  }
  d[0] = pchipEnd(h[0]!, h[1]!, m[0]!, m[1]!);
  d[n - 1] = pchipEnd(h[n - 2]!, h[n - 3]!, m[n - 2]!, m[n - 3]!);
  return d;
}

/**
 * The glTF CUBICSPLINE values for keys `values` (`size` components per key) at `times`, with the
 * tangents `mode` computes. Times and values are read as float32, as the track stores them, so
 * the tangents match the written bytes. Needs at least two keys.
 */
export function cubicSplineValues(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  size: number,
  mode: CubicInterpolation,
  quaternion: boolean,
): number[] {
  const n = times.length;
  if (n < 2) throw new Error(`${mode} needs at least two keyframes.`);
  const t = Array.from(times, Math.fround);
  const v = Array.from(values, Math.fround);
  if (quaternion) {
    for (let k = 1; k < n; k++) {
      let dot = 0;
      for (let i = 0; i < size; i++) dot += v[(k - 1) * size + i]! * v[k * size + i]!;
      if (dot < 0) for (let i = 0; i < size; i++) v[k * size + i] = -v[k * size + i]!;
    }
  }
  const inTangent = new Array<number>(n * size).fill(0);
  const outTangent = new Array<number>(n * size).fill(0);
  for (let c = 0; c < size; c++) {
    const y = Array.from({ length: n }, (_, k) => v[k * size + c]!);
    if (mode === 'CUBICSPLINE') {
      const slopes = pchipSlopes(t, y);
      for (let k = 0; k < n; k++) {
        if (k > 0) inTangent[k * size + c] = slopes[k]!;
        if (k < n - 1) outTangent[k * size + c] = slopes[k]!;
      }
      continue;
    }
    for (let k = 0; k < n - 1; k++) {
      // Twice the segment's mean speed: s^2 and 2s - s^2 end at that rate.
      const speed = (2 * (y[k + 1]! - y[k]!)) / (t[k + 1]! - t[k]!);
      if (mode === 'EASE_IN') inTangent[(k + 1) * size + c] = speed;
      else if (mode === 'EASE_OUT') outTangent[k * size + c] = speed;
    }
  }
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const from = k * size;
    const to = from + size;
    out.push(...inTangent.slice(from, to), ...v.slice(from, to), ...outTangent.slice(from, to));
  }
  return out;
}
