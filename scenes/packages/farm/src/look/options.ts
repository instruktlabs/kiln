import type { TierName } from '@kiln-scenes/scene-kit';
import { FARM_LOOK } from '../constants';

/**
 * M3 look and performance exploration (PLAN.md 1.1, D-20): engine-typical post-processing as runtime toggles in
 * the Farm's dev build only. The default is today's look (MSAA through the renderer, ACES at .95, nothing else);
 * D-18 stands, so nothing here becomes a default. Pure module: no three.js, no DOM.
 */
export type FarmAntialias = 'msaa' | 'none' | 'fxaa' | 'smaa' | 'traa' | 'ssaa';
export type FarmToneMapping = 'aces' | 'neutral';
export interface FarmLookOptions {
  /** Anti-aliasing: the renderer's 4x MSAA (default), none, or one of three 0.186's post-process AA nodes. */
  aa: FarmAntialias;
  /** Ground-truth ambient occlusion (GTAO) on indirect light, half resolution; off on the tablet tiers. */
  ao: boolean;
  /** Bloom on the emissive output only (MRT), never on lit colour. */
  bloom: boolean;
  vignette: boolean;
  /** A mild display-space grade (slope, power, saturation). */
  grading: boolean;
  tone: FarmToneMapping;
  /** Tone-mapping exposure; defaults to the Farm's .95 for ACES and the mid-grey match for Neutral. */
  exposure?: number;
}
export const FARM_ANTIALIAS: readonly FarmAntialias[] = ['msaa', 'none', 'fxaa', 'smaa', 'traa', 'ssaa'];
export const FARM_LOOK_DEFAULT: Readonly<FarmLookOptions> = Object.freeze({ aa: 'msaa', ao: false, bloom: false, vignette: false, grading: false, tone: 'aces' });
/** AO is off on the tablet tiers (PLAN.md 1.1); the tablet classifies minimal on both backends (WebGL2 D-03, WebGPU X-07). */
export const FARM_AO_TIERS: readonly TierName[] = ['balanced', 'high'];
/** The grade applied by `grading`: ASC CDL-style slope and power per channel plus saturation, after tone mapping. */
export const FARM_GRADE = Object.freeze({ slope: [1.04, 1.02, .97] as const, offset: [0, 0, .005] as const, power: [.96, .98, 1.02] as const, saturation: 1.08 });
export const FARM_VIGNETTE = Object.freeze({ inner: .45, outer: .95, strength: .28 });
export const FARM_BLOOM = Object.freeze({ strength: .8, radius: .35, threshold: 0 });
export const FARM_AO = Object.freeze({ resolutionScale: .5, radius: .6, samples: 16 });

/** three.js 0.186 ACES Filmic (ToneMappingFunctions.js) for a grey input: exposure / .6, then the RRT and ODT fit. */
export function acesGrey(value: number, exposure: number): number {
  const v = value * exposure / .6, a = v * (v + .0245786) - .000090537, b = v * (.983729 * v + .432951) + .238081;
  return Math.min(1, Math.max(0, a / b));
}
/** three.js 0.186 Khronos PBR Neutral for a grey input below the compression start (.76). */
export function neutralGrey(value: number, exposure: number): number {
  const x = value * exposure, offset = x < .08 ? x - 6.25 * x * x : .04, y = x - offset;
  if (y < .76) return y;
  const d = 1 - .76; return 1 - d * d / (y + d - .76);
}
/** D-18 "matched exposure": the Neutral exposure that maps 18% grey to the same display value as ACES at `acesExposure`. */
export function matchedNeutralExposure(acesExposure = FARM_LOOK.exposure, grey = .18): number {
  const target = acesGrey(grey, acesExposure);
  let low = .1, high = 8;
  for (let i = 0; i < 80; i++) { const mid = (low + high) / 2; if (neutralGrey(grey, mid) < target) low = mid; else high = mid; }
  return Math.round((low + high) / 2 * 1e4) / 1e4;
}
export function lookExposure(o: Pick<FarmLookOptions, 'tone' | 'exposure'>): number {
  return o.exposure ?? (o.tone === 'neutral' ? matchedNeutralExposure() : FARM_LOOK.exposure);
}

/** Named sets for the contact sheet: each AA option alone, each effect alone over the default AA, and all together. */
export const FARM_LOOK_PRESETS: Readonly<Record<string, Partial<FarmLookOptions>>> = Object.freeze({
  default: {}, 'aa-none': { aa: 'none' }, fxaa: { aa: 'fxaa' }, smaa: { aa: 'smaa' }, traa: { aa: 'traa' }, ssaa: { aa: 'ssaa' },
  ao: { ao: true }, bloom: { bloom: true }, vignette: { vignette: true }, grading: { grading: true },
  all: { aa: 'smaa', ao: true, bloom: true, vignette: true, grading: true },
  neutral: { tone: 'neutral' },
});

/** `?look=` accepts a preset name or a comma list such as `fxaa,ao,bloom` or `neutral,exposure=1.2`. Unknown words throw. */
export function parseFarmLook(value: string | null | undefined): FarmLookOptions {
  const look: FarmLookOptions = { ...FARM_LOOK_DEFAULT };
  if (!value) return look;
  for (const raw of value.split(',').map(word => word.trim()).filter(Boolean)) {
    const [word, argument] = raw.split('=');
    if (word! in FARM_LOOK_PRESETS && argument === undefined) Object.assign(look, FARM_LOOK_PRESETS[word!]);
    else if ((FARM_ANTIALIAS as readonly string[]).includes(word!) && argument === undefined) look.aa = word as FarmAntialias;
    else if (['ao', 'bloom', 'vignette', 'grading'].includes(word!) && argument === undefined) look[word as 'ao' | 'bloom' | 'vignette' | 'grading'] = true;
    else if ((word === 'aces' || word === 'neutral') && argument === undefined) look.tone = word;
    else if (word === 'exposure' && argument !== undefined && Number.isFinite(Number(argument)) && Number(argument) > 0) look.exposure = Number(argument);
    else throw new Error(`Unknown look option: ${raw}`);
  }
  return look;
}
export function formatFarmLook(o: FarmLookOptions): string {
  const words = [o.aa !== 'msaa' ? o.aa : '', o.ao ? 'ao' : '', o.bloom ? 'bloom' : '', o.vignette ? 'vignette' : '', o.grading ? 'grading' : '', o.tone !== 'aces' ? o.tone : '', o.exposure !== undefined ? `exposure=${o.exposure}` : ''].filter(Boolean);
  return words.length ? words.join(',') : 'default';
}
/** The options a tier actually runs: AO is removed on the tablet tiers and reported as disabled. */
export function resolveFarmLook(o: FarmLookOptions, tier: TierName): { look: FarmLookOptions; disabled: string[] } {
  if (o.ao && !FARM_AO_TIERS.includes(tier)) return { look: { ...o, ao: false }, disabled: [`ao (off on the ${tier} tier)`] };
  return { look: { ...o }, disabled: [] };
}
/** The default look renders straight to the canvas with the renderer's MSAA; anything else needs a render pipeline. */
export function needsPipeline(o: FarmLookOptions): boolean {
  return o.aa !== 'msaa' || o.ao || o.bloom || o.vignette || o.grading || o.tone !== 'aces' || (o.exposure !== undefined && o.exposure !== FARM_LOOK.exposure);
}
