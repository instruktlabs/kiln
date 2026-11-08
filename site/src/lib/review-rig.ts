/**
 * The Kiln review lighting rig `review-neutral-v1`: what the engine's render service applies to every
 * material-review capture. The site's posters are rendered under it, and the live 3D viewer applies the same
 * values, so an asset reads the same in its poster and when it is opened.
 *
 * These are copies of the engine's values, not a second definition. `review-rig.test.ts` compares every
 * number with the engine's `render-service/src/presentation-presets.mjs`, `display-transform.mjs` and
 * `review-tone-mapping.mjs` whenever an engine worktree is available (`KILN_RIG_ENGINE_DIR`, or the sibling
 * `kiln-oss-review-lighting`), so a change to the rig cannot pass unnoticed. A different rig needs a new id.
 */

/** Where the values come from: the engine's `codex/review-lighting` branch, at the commit the posters were rendered with. */
export const REVIEW_RIG_SOURCE = Object.freeze({
  repository: 'kiln-oss',
  branch: 'codex/review-lighting',
  commit: '5af4341e65a1c5131a9ad5bb5110046be925f29e',
  files: Object.freeze([
    'render-service/src/presentation-presets.mjs',
    'render-service/src/display-transform.mjs',
    'render-service/src/review-tone-mapping.mjs',
  ]),
});

export type Vec3 = readonly [number, number, number];

export interface RigLight {
  readonly color: number;
  readonly intensity: number;
  /** World position; a directional light shines from here toward the origin, so only the direction matters. */
  readonly position: Vec3;
}

export const REVIEW_RIG = Object.freeze({
  id: 'review-neutral-v1',
  /** The neutral backdrop, as the sRGB bytes every rig capture is cleared to. */
  backdrop: '#aab1bc',
  exposure: 0.9,
  /** three's room scene, prefiltered with this sigma and scaled by this intensity; it lights and reflects. */
  environment: Object.freeze({ type: 'room', sigma: 0.04, intensity: 0.4352 }),
  hemisphere: Object.freeze({ sky: 0xffffff, ground: 0xffffff, intensity: 1.0879 }),
  /** Three white directional lights. The chart's `key` panels face the key light, `away` panels face directly away from it and `side` panels face -X, toward the fill. */
  key: Object.freeze({
    color: 0xffffff,
    intensity: 0.136,
    position: Object.freeze([4, 7, 5]) as Vec3,
  }) as RigLight,
  fill: Object.freeze({
    color: 0xffffff,
    intensity: 0.0204,
    position: Object.freeze([-4, 3, 2]) as Vec3,
  }) as RigLight,
  rim: Object.freeze({
    color: 0xffffff,
    intensity: 0.0204,
    position: Object.freeze([-2, 5, -5]) as Vec3,
  }) as RigLight,
  /** No sun and no shadows: the rig lights the asset, it does not stage it. */
  shadows: false,
  /** Review Neutral: the Khronos PBR Neutral construction with a smaller, rig-calibrated glare offset (Khronos uses 0.04). */
  toneMapping: Object.freeze({
    name: 'review-neutral',
    offset: 0.015,
    startCompression: 0.785,
    desaturation: 0.15,
  }),
});

export type ReviewNeutralConstants = {
  readonly offset: number;
  readonly startCompression: number;
  readonly desaturation: number;
};

/** The rig's tone mapping of a linear colour, exactly as its render service computes it. */
export function reviewNeutral(
  linear: Vec3,
  exposure: number = REVIEW_RIG.exposure,
  constants: ReviewNeutralConstants = REVIEW_RIG.toneMapping,
): [number, number, number] {
  const { offset, startCompression: start, desaturation } = constants;
  const scaled = linear.map((c) => c * exposure) as [number, number, number];
  const minimum = Math.min(...scaled);
  const glare = minimum < 2 * offset ? minimum - (minimum * minimum) / (4 * offset) : offset;
  const shifted = scaled.map((c) => c - glare) as [number, number, number];
  const peak = Math.max(...shifted);
  if (peak < start) return shifted;
  const d = 1 - start;
  const newPeak = 1 - (d * d) / (peak + 1 - 2 * start);
  const whiteMix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return shifted.map((c) => ((c * newPeak) / peak) * (1 - whiteMix) + newPeak * whiteMix) as [
    number,
    number,
    number,
  ];
}

/** three's sRGB transfer function, including its 0.41666 exponent. */
export const srgbEncode = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** 0.41666 - 0.055;

/** The byte triple a linear colour reads back as after the rig's output pass. */
export const reviewNeutralBytes = (linear: Vec3, exposure: number = REVIEW_RIG.exposure) =>
  reviewNeutral(linear, exposure).map((c) =>
    Math.round(srgbEncode(Math.min(1, Math.max(0, c))) * 255),
  );

const srgbDecode = (e: number) =>
  e <= 0.04045 ? e / 12.92 : ((e + 0.055) / 1.055) ** (1 / 0.41666);

// three's ACES filmic mapping, read row-major (the engine's `render-service/src/display-transform.mjs`), inverted.
const ACES_INPUT = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const ACES_OUTPUT = [
  1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602,
];
const ACES_FIT = { a: 0.0245786, b: 0.000090537, c: 0.983729, d: 0.432951, e: 0.238081 };

const multiply = (m: readonly number[], v: readonly number[]): [number, number, number] =>
  [0, 1, 2].map(
    (row) =>
      (m[row * 3] as number) * (v[0] as number) +
      (m[row * 3 + 1] as number) * (v[1] as number) +
      (m[row * 3 + 2] as number) * (v[2] as number),
  ) as [number, number, number];

function invert3(m: readonly number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ].map((v) => v / det);
}

/** The non-negative root of the ACES fit, which is monotonic there: one quadratic per channel. */
function acesFitInverse(t: number) {
  const { a, b, c, d, e } = ACES_FIT;
  const qa = 1 - c * t;
  const qb = a - c * d * t;
  const qc = -(b + e * t);
  return (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
}

function reviewNeutralInverse(display: Vec3, exposure: number): [number, number, number] {
  const { offset, startCompression: start, desaturation } = REVIEW_RIG.toneMapping;
  const newPeak = Math.max(...display);
  let colour: readonly number[] = display;
  if (newPeak >= start) {
    const d = 1 - start;
    const peak = 2 * start - 1 + (d * d) / (1 - newPeak);
    const whiteMix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
    colour = display.map((c) => (((c - newPeak * whiteMix) / (1 - whiteMix)) * peak) / newPeak);
  }
  const minimum = Math.min(...colour);
  const originalMinimum = minimum < offset ? Math.sqrt(4 * offset * minimum) : minimum + offset;
  return colour.map((c) => (c + originalMinimum - minimum) / exposure) as [number, number, number];
}

/**
 * The linear clear colour that comes out of the output pass as the rig's backdrop. The scene background is cleared into
 * the same framebuffer as the model and tone mapped with it, so a plain colour would come out shifted. Compositing the
 * backdrop afterwards would leave a fringe on every silhouette, so it stays in the pass and this answers what goes in,
 * as the engine's `backdropClearColor` does for its captures.
 */
export function backdropLinear(mapping: 'neutral' | 'aces' | 'linear'): [number, number, number] {
  const display = [1, 3, 5].map((at) =>
    srgbDecode(Number.parseInt(REVIEW_RIG.backdrop.slice(at, at + 2), 16) / 255),
  ) as [number, number, number];
  if (mapping === 'neutral') return reviewNeutralInverse(display, REVIEW_RIG.exposure);
  if (mapping === 'linear') return display;
  const fitted = multiply(invert3(ACES_OUTPUT), display).map(acesFitInverse);
  return multiply(invert3(ACES_INPUT), fitted).map((c) => c * 0.6) as [number, number, number];
}
