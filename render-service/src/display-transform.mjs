/**
 * The display transform the renderer applies to every HDR pixel, and its inverse.
 *
 * `renderDisplayTarget` draws into three's HalfFloat framebuffer and then runs
 * the output pass: the preset's tone mapping and exposure, then the
 * sRGB transfer function. The scene background is cleared into that framebuffer
 * like any other pixel, so a backdrop set as a plain colour came out of the pass
 * shifted -- the neutral `#aab1bc` read back as (203, 207, 213) -- while the
 * engine's CPU rasterizer paints the table value exactly. Compositing the
 * backdrop after the pass instead would leave a one-pixel fringe on every
 * silhouette, because multisampled edges resolve to premultiplied colour before
 * tone mapping. So the backdrop stays inside the pass, and this module answers
 * "which linear clear colour comes out as exactly that byte triple".
 *
 * The legacy forward transform is a port of three's `acesFilmicToneMapping` and
 * `sRGBTransferOETF`, with the matrices read row-major; it reproduces pixels
 * measured on a dawn-d3d12 device to within rounding. The inverse is analytic:
 * both matrices invert, and the RRT/ODT fit is a rational function whose inverse
 * is one quadratic per channel. Every answer is checked through the forward
 * transform before it is returned, so drift in either direction is an error
 * here rather than a quietly wrong backdrop. Review Neutral uses the Khronos
 * PBR Neutral construction with a smaller, rig-calibrated glare offset. Its
 * shoulder, desaturation and toe each have an analytic inverse below. Keeping
 * both paths here preserves v1 captures and avoids post-composite edge fringes.
 */

// sRGB => XYZ => D65_2_D60 => AP1 => RRT_SAT
const ACES_INPUT = Object.freeze([
  0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777,
]);
// ODT_SAT => XYZ => D60_2_D65 => sRGB
const ACES_OUTPUT = Object.freeze([
  1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602,
]);
const FIT = Object.freeze({ a: 0.0245786, b: 0.000090537, c: 0.983729, d: 0.432951, e: 0.238081 });

export const TONE_MAPPINGS = Object.freeze(['aces', 'review-neutral']);
// A versioned rendering choice, not a caller-adjustable colour correction.
// Khronos Neutral uses 0.04. This room rig's measured dielectric glare is lower.
// The GPU node imports these same constants; changes require a new preset ID.
export const REVIEW_NEUTRAL = Object.freeze({
  offset: 0.015,
  startCompression: 0.785,
  desaturation: 0.15,
});

function assertToneMapping(name) {
  if (!TONE_MAPPINGS.includes(name)) throw new Error(`unknown tone mapping: ${name}`);
}

function reviewNeutral(linear, exposure) {
  const { offset, startCompression: start, desaturation } = REVIEW_NEUTRAL;
  let color = linear.map((c) => c * exposure);
  const minimum = Math.min(...color);
  const glare = minimum < 2 * offset ? minimum - (minimum * minimum) / (4 * offset) : offset;
  color = color.map((c) => c - glare);
  const peak = Math.max(...color);
  if (peak < start) return color;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + 1 - 2 * start);
  const whiteMix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return color.map((c) => ((c * newPeak) / peak) * (1 - whiteMix) + newPeak * whiteMix);
}

function reviewNeutralInverse(display, exposure) {
  const { offset, startCompression: start, desaturation } = REVIEW_NEUTRAL;
  const newPeak = Math.max(...display);
  let color = display;
  if (newPeak >= start) {
    const d = 1 - start;
    const peak = 2 * start - 1 + (d * d) / (1 - newPeak);
    const whiteMix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
    color = display.map((c) => (((c - newPeak * whiteMix) / (1 - whiteMix)) * peak) / newPeak);
  }
  const minimum = Math.min(...color);
  const originalMinimum = minimum < offset ? Math.sqrt(4 * offset * minimum) : minimum + offset;
  return color.map((c) => (c + originalMinimum - minimum) / exposure);
}

function multiply(m, v) {
  return [0, 1, 2].map((row) => m[row * 3] * v[0] + m[row * 3 + 1] * v[1] + m[row * 3 + 2] * v[2]);
}

function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!det) throw new Error('display transform matrix is singular');
  return [
    A / det,
    -(b * i - c * h) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    -(a * f - c * d) / det,
    C / det,
    -(a * h - b * g) / det,
    (a * e - b * d) / det,
  ];
}

const ACES_INPUT_INVERSE = Object.freeze(invert(ACES_INPUT));
const ACES_OUTPUT_INVERSE = Object.freeze(invert(ACES_OUTPUT));

const rrtOdtFit = (x) => (x * (x + FIT.a) - FIT.b) / (x * (x + FIT.d) * FIT.c + FIT.e);

/** The non-negative root of `rrtOdtFit(x) = t`; the fit is monotonic there. */
function rrtOdtFitInverse(t) {
  // (1 - c t) x^2 + (a - c d t) x - (b + e t) = 0
  const qa = 1 - FIT.c * t;
  const qb = FIT.a - FIT.c * FIT.d * t;
  const qc = -(FIT.b + FIT.e * t);
  if (qa <= 0) return Number.POSITIVE_INFINITY;
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
}

/** three's `sRGBTransferOETF`, including its 0.41666 exponent. */
export function srgbEncode(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** 0.41666 - 0.055;
}

export function srgbDecode(e) {
  return e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** (1 / 0.41666);
}

/** ACES filmic tone mapping of a linear working-space colour, clamped to [0, 1]. */
export function toneMap(linear, exposure, mapping = 'aces') {
  assertToneMapping(mapping);
  if (mapping === 'review-neutral') return reviewNeutral(linear, exposure);
  const scaled = linear.map((c) => (c * exposure) / 0.6);
  const fitted = multiply(ACES_INPUT, scaled).map(rrtOdtFit);
  return multiply(ACES_OUTPUT, fitted).map((c) => Math.min(1, Math.max(0, c)));
}

/** The byte triple a linear colour reads back as after the output pass. */
export function displayBytes(linear, exposure, mapping = 'aces') {
  return toneMap(linear, exposure, mapping).map((c) => Math.round(srgbEncode(c) * 255));
}

function assertExposure(exposure) {
  if (!Number.isFinite(exposure) || exposure <= 0)
    throw new Error(`exposure must be a positive number (got ${exposure})`);
}

/**
 * The linear colour that reads back as exactly `bytes` at `exposure`, or an
 * error when the tone mapping cannot reach it (saturated colours leave the
 * gamut on the way back through the matrices).
 */
export function linearForDisplayBytes(bytes, exposure, mapping = 'aces') {
  assertExposure(exposure);
  assertToneMapping(mapping);
  if (
    !Array.isArray(bytes) ||
    bytes.length !== 3 ||
    !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)
  )
    throw new Error(
      `display bytes must be three integers in 0..255 (got ${JSON.stringify(bytes)})`,
    );
  const display = bytes.map((b) => srgbDecode(b / 255));
  const linear =
    mapping === 'review-neutral'
      ? reviewNeutralInverse(display, exposure)
      : multiply(
          ACES_INPUT_INVERSE,
          multiply(ACES_OUTPUT_INVERSE, display).map(rrtOdtFitInverse),
        ).map((c) => (c * 0.6) / exposure);
  const reached = displayBytes(linear, exposure, mapping);
  if (
    linear.some((c) => !Number.isFinite(c) || c < 0) ||
    reached.some((c, index) => c !== bytes[index])
  ) {
    throw new Error(
      `display colour ${JSON.stringify(bytes)} is not reachable through the tone mapping at exposure ${exposure}`,
    );
  }
  return linear;
}

export function hexToBytes(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/.test(hex))
    throw new Error(`expected a lowercase #rrggbb hex colour (got ${JSON.stringify(hex)})`);
  return [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
}

/** The linear clear colour that makes a backdrop read back as its own hex. */
export function backdropClearColor(hex, exposure, mapping = 'aces') {
  return linearForDisplayBytes(hexToBytes(hex), exposure, mapping);
}
