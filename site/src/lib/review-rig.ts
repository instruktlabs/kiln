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

/** The rig's tone mapping of a linear colour, exactly as its render service computes it (used to check the shader). */
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

const glslNumber = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** The GLSL of `CustomToneMapping` for three's WebGL renderer: the same construction as `reviewNeutral`, from the same constants. */
export function reviewNeutralGlsl(
  constants: ReviewNeutralConstants = REVIEW_RIG.toneMapping,
): string {
  const { offset, startCompression, desaturation } = constants;
  return `// ${REVIEW_RIG.id}: Review Neutral (Khronos PBR Neutral construction, rig-calibrated constants)
vec3 CustomToneMapping( vec3 color ) {
	const float ReviewNeutralOffset = ${glslNumber(offset)};
	const float ReviewNeutralStart = ${glslNumber(startCompression)};
	const float ReviewNeutralDesaturation = ${glslNumber(desaturation)};
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float glare = x < 2. * ReviewNeutralOffset ? x - x * x / ( 4. * ReviewNeutralOffset ) : ReviewNeutralOffset;
	color -= glare;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < ReviewNeutralStart ) return color;
	float d = 1. - ReviewNeutralStart;
	float newPeak = 1. - d * d / ( peak + d - ReviewNeutralStart );
	color *= newPeak / peak;
	float g = 1. - 1. / ( ReviewNeutralDesaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}`;
}

/** The stub three ships for its `CustomToneMapping` slot: the only text the rig's shader replaces. */
export const CUSTOM_TONE_MAPPING_STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

/**
 * Put Review Neutral into three's tone mapping chunk, in place of the empty `CustomToneMapping` stub. Returns
 * whether the rig's mapper is installed. It refuses (and changes nothing) when the chunk is not the text this
 * was written against, so a three upgrade falls back to three's own Neutral mapping instead of a broken shader.
 * Idempotent. `chunks` is three's `ShaderChunk` object; nothing else about three is modified.
 */
export function installReviewNeutral(
  chunks: Record<string, string>,
  constants: ReviewNeutralConstants = REVIEW_RIG.toneMapping,
): boolean {
  const chunk = chunks.tonemapping_pars_fragment;
  if (typeof chunk !== 'string') return false;
  if (chunk.includes('ReviewNeutralOffset')) return true;
  if (!chunk.includes(CUSTOM_TONE_MAPPING_STUB)) return false;
  const glsl = reviewNeutralGlsl(constants);
  chunks.tonemapping_pars_fragment = chunk.replace(CUSTOM_TONE_MAPPING_STUB, () => glsl);
  return true;
}
