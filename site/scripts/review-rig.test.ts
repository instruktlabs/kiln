import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ShaderChunk } from 'three';
import { CUSTOM_TONE_MAPPING_STUB, REVIEW_RIG, REVIEW_RIG_SOURCE, installReviewNeutral, reviewNeutral, reviewNeutralBytes, reviewNeutralGlsl } from '../src/lib/review-rig';
import { DEFAULT_ENGINE_DIR } from './rig-render.mjs';

const engineDir = process.env.KILN_RIG_ENGINE_DIR ?? DEFAULT_ENGINE_DIR;
const presetFile = join(engineDir, 'render-service/src/presentation-presets.mjs');
// The separate site branch predates this rig; the integrated engine candidate must run these tests.
const hasEngine = existsSync(presetFile) && readFileSync(presetFile, 'utf8').includes('review-neutral-v1');
const engine = (file: string) => import(pathToFileURL(join(engineDir, 'render-service/src', file)).href);
const chunkWithStub = () => ({ tonemapping_pars_fragment: ShaderChunk.tonemapping_pars_fragment });

describe('the rig constants', () => {
  test('are the review-neutral-v1 rig on the neutral backdrop, white and without shadows', () => {
    expect(REVIEW_RIG.id).toBe('review-neutral-v1');
    expect(REVIEW_RIG.backdrop).toBe('#aab1bc');
    expect(REVIEW_RIG.shadows).toBe(false);
    for (const light of [REVIEW_RIG.key, REVIEW_RIG.fill, REVIEW_RIG.rim]) expect(light.color).toBe(0xffffff);
    expect(REVIEW_RIG.hemisphere).toMatchObject({ sky: 0xffffff, ground: 0xffffff });
    expect(REVIEW_RIG_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(REVIEW_RIG.toneMapping.name).toBe('review-neutral');
  });

  test.skipIf(!hasEngine)('equal the engine’s preset, tone mapping constants and neutral backdrop', async () => {
    const { getPresentationPreset } = await engine('presentation-presets.mjs');
    const { REVIEW_NEUTRAL } = await engine('display-transform.mjs');
    const { BACKDROP_HEX } = await engine('backdrops.mjs');
    const preset = getPresentationPreset(REVIEW_RIG.id);
    expect(preset).toBeDefined();
    expect(preset.exposure).toBe(REVIEW_RIG.exposure);
    expect(preset.toneMapping).toBe(REVIEW_RIG.toneMapping.name);
    expect(preset.environment).toEqual({ type: REVIEW_RIG.environment.type, sigma: REVIEW_RIG.environment.sigma, intensity: REVIEW_RIG.environment.intensity });
    expect(preset.ambient).toEqual({ type: 'hemisphere', sky: REVIEW_RIG.hemisphere.sky, ground: REVIEW_RIG.hemisphere.ground, intensity: REVIEW_RIG.hemisphere.intensity });
    for (const role of ['key', 'fill', 'rim'] as const) {
      expect(preset[role]).toEqual({ enabled: true, color: REVIEW_RIG[role].color, intensity: REVIEW_RIG[role].intensity, position: [...REVIEW_RIG[role].position], castsShadow: false });
    }
    expect(preset.sun).toEqual({ enabled: false });
    expect(preset.shadows.enabled).toBe(REVIEW_RIG.shadows);
    expect(REVIEW_NEUTRAL).toEqual({ offset: REVIEW_RIG.toneMapping.offset, startCompression: REVIEW_RIG.toneMapping.startCompression, desaturation: REVIEW_RIG.toneMapping.desaturation });
    expect(BACKDROP_HEX.neutral).toBe(REVIEW_RIG.backdrop);
  });

  test.skipIf(!hasEngine)('are the values the checked-out engine commit says it is', async () => {
    const { execFileSync } = await import('node:child_process');
    const head = execFileSync('git', ['-C', engineDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    // A newer engine commit is fine as long as the values above still agree; this only reports which one was compared.
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    if (head !== REVIEW_RIG_SOURCE.commit) console.warn(`review-rig: engine is at ${head}, constants were copied at ${REVIEW_RIG_SOURCE.commit}`);
  });
});

describe('Review Neutral, computed on the CPU', () => {
  // Reference values computed by the engine's render service (`toneMap` and `displayBytes` in display-transform.mjs).
  const reference: [[number, number, number], [number, number, number], [number, number, number]][] = [
    [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    [[0.18, 0.18, 0.18], [0.147, 0.147, 0.147], [107, 107, 107]],
    [[0.02, 0.5, 0.9], [0.005476, 0.437066, 0.796724], [17, 177, 231]],
    [[1.794921875, 0.162231445, 0.124450684], [0.95514, 0.155578, 0.137076], [250, 110, 104]],
    [[4, 4, 4], [0.984668, 0.984668, 0.984668], [253, 253, 253]],
    [[0.01, 0.02, 0.03], [0.00135, 0.01035, 0.01935], [4, 26, 38]],
    [[0.5, 0.5, 0.5], [0.435, 0.435, 0.435], [176, 176, 176]],
    [[0.86, 0.9, 0.95], [0.749011, 0.784471, 0.828796], [224, 229, 235]],
  ];

  test.each(reference)('maps %j to the engine’s value', (linear, mapped, bytes) => {
    reviewNeutral(linear).forEach((value, index) => expect(value).toBeCloseTo(mapped[index] as number, 6));
    expect(reviewNeutralBytes(linear)).toEqual(bytes);
  });

  test('never darkens black, never exceeds white and keeps order between grey levels', () => {
    let previous = -1;
    for (let level = 0; level <= 8; level += 0.05) {
      const [value] = reviewNeutral([level, level, level]);
      expect(value).toBeLessThanOrEqual(1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value as number;
    }
  });

  test.skipIf(!hasEngine)('agrees with the engine’s implementation across a colour grid', async () => {
    const { toneMap } = await engine('display-transform.mjs');
    const steps = [0, 0.004, 0.02, 0.09, 0.3, 0.78, 1.4, 6];
    for (const r of steps) for (const g of steps) for (const b of steps) {
      const engineValue = toneMap([r, g, b], REVIEW_RIG.exposure, 'review-neutral') as number[];
      reviewNeutral([r, g, b]).forEach((value, index) => expect(value).toBeCloseTo(engineValue[index] as number, 12));
    }
  });
});

describe('the WebGL tone mapping shader', () => {
  test('is generated from the rig constants, with the same construction as the engine’s node', () => {
    const glsl = reviewNeutralGlsl();
    expect(glsl).toContain('vec3 CustomToneMapping( vec3 color ) {');
    expect(glsl).toContain(`ReviewNeutralOffset = ${REVIEW_RIG.toneMapping.offset};`);
    expect(glsl).toContain(`ReviewNeutralStart = ${REVIEW_RIG.toneMapping.startCompression};`);
    expect(glsl).toContain(`ReviewNeutralDesaturation = ${REVIEW_RIG.toneMapping.desaturation};`);
    expect(glsl).toContain('color *= toneMappingExposure;');
    // Whole numbers are written as GLSL floats, or the compiler rejects the integer.
    expect(reviewNeutralGlsl({ offset: 1, startCompression: 0.5, desaturation: 2 })).toContain('ReviewNeutralOffset = 1.0;');
  });

  test('differs from three’s own Neutral mapping only in constants, which this documents', () => {
    const neutral = ShaderChunk.tonemapping_pars_fragment;
    expect(neutral).toContain('const float StartCompression = 0.8 - 0.04;');
    expect(neutral).toContain('float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;');
    expect(neutral).toContain('const float Desaturation = 0.15;');
  });

  test('replaces only the empty CustomToneMapping stub of three’s chunk, once', () => {
    const chunks = chunkWithStub();
    const original = chunks.tonemapping_pars_fragment;
    expect(original).toContain(CUSTOM_TONE_MAPPING_STUB);
    expect(installReviewNeutral(chunks)).toBe(true);
    expect(chunks.tonemapping_pars_fragment).not.toContain(CUSTOM_TONE_MAPPING_STUB);
    expect(chunks.tonemapping_pars_fragment).toContain('ReviewNeutralOffset');
    // Everything else in the chunk (the built-in mappers) is untouched.
    expect(chunks.tonemapping_pars_fragment.replace(reviewNeutralGlsl(), CUSTOM_TONE_MAPPING_STUB)).toBe(original);
    const installed = chunks.tonemapping_pars_fragment;
    expect(installReviewNeutral(chunks)).toBe(true);
    expect(chunks.tonemapping_pars_fragment).toBe(installed);
  });

  test('refuses a chunk it was not written against instead of guessing', () => {
    const changed = { tonemapping_pars_fragment: 'vec3 CustomToneMapping( vec3 color ) { return color * 2.0; }' };
    expect(installReviewNeutral(changed)).toBe(false);
    expect(changed.tonemapping_pars_fragment).toBe('vec3 CustomToneMapping( vec3 color ) { return color * 2.0; }');
    expect(installReviewNeutral({})).toBe(false);
  });
});
