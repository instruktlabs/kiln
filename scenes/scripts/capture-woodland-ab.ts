import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { PNG } from 'pngjs';
import { compareLuminanceImages, compareParityImages } from './parity-images';
import type { RgbaImage } from './parity-images';

interface WoodlandCapture {
  png: RgbaImage; file: string; diagnostics: unknown[];
  stats: {
    backend: { backend: string }; camera?: unknown;
    motion: { time: number; ambient: number };
    tier: { tier: string; level: number; live: unknown };
    counts: { stage: string; woodlandTrees: number; woodlandCells: number; woodlandMeshes: number; woodlandPackedGroups?: number; tangentOffenders: string[] };
    [key: string]: unknown;
  };
}
export interface CropRectangle { x: number; y: number; width: number; height: number }
/** Fixed from the existing 1280×720 hero: near left-hand woodland includes visible trunks. */
export const WOODLAND_CROP: CropRectangle = { x: 0, y: 180, width: 320, height: 540 };

export function cropImage(source: RgbaImage, crop: CropRectangle): RgbaImage {
  assert(Object.values(crop).every(Number.isInteger) && crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 && crop.x + crop.width <= source.width && crop.y + crop.height <= source.height, 'Invalid woodland crop rectangle');
  assert.equal(source.data.length, source.width * source.height * 4, 'Source RGBA length differs from dimensions');
  const data = new Uint8Array(crop.width * crop.height * 4);
  for (let y = 0; y < crop.height; y++) {
    const start = ((crop.y + y) * source.width + crop.x) * 4;
    data.set(source.data.subarray(start, start + crop.width * 4), y * crop.width * 4);
  }
  return { width: crop.width, height: crop.height, data };
}

/** Fail if packing repaired the unsafe branch or a changed scene invalidated the comparison. */
export function validateWoodlandAb(safe: WoodlandCapture, repeat: WoodlandCapture, unsafe: WoodlandCapture, backend: string) {
  for (const [name, capture] of [['safe', safe], ['safe repeat', repeat], ['unsafe', unsafe]] as const) {
    assert.equal(capture.png.width, 1280); assert.equal(capture.png.height, 720);
    assert.equal(capture.stats.backend.backend, backend, `${name} backend differs`);
    assert.equal(capture.stats.tier.tier, 'high'); assert.equal(capture.stats.tier.level, 0);
    assert.equal(capture.stats.motion.time, 0); assert.equal(capture.stats.motion.ambient, 0);
    assert.equal(capture.stats.counts.woodlandTrees, 843); assert.equal(capture.stats.counts.woodlandCells, 16);
    assert.equal(capture.stats.counts.woodlandMeshes, 64, `${name} must retain64 unoptimized woodland meshes`);
    assert.equal(capture.stats.counts.stage, 'M2a pre-batching', `${name} must use the static baseline`);
    assert(!capture.stats.counts.woodlandPackedGroups, `${name} must not contain packed woodland groups`);
    assert(capture.stats.camera, 'Camera pose must be recorded');
    assert.deepEqual(capture.stats.camera, safe.stats.camera, `${name} camera differs`);
    assert.deepEqual(capture.stats.tier.live, safe.stats.tier.live, `${name} live knobs differ`);
  }
  assert.deepEqual(safe.stats.counts.tangentOffenders, [], 'Safe branch has tangent offenders');
  assert.deepEqual(repeat.stats.counts.tangentOffenders, [], 'Safe repeat has tangent offenders');
  const offenders = unsafe.stats.counts.tangentOffenders;
  assert.equal(offenders.length, 16, 'The unsafe branch must expose16 affected cell meshes');
  assert.equal(new Set(offenders).size, 16, 'Unsafe offenders must identify16 different cell meshes');
  assert(offenders.every(name => name.startsWith('Boundary woodland ')), 'Unsafe offenders must be confined to the woodland');
}

/** Browser/server ownership remains with the parity runner; this helper only uses its capture callback. */
export async function captureWoodlandAb(options: {
  backend: 'webgpu' | 'webgl2'; out: string;
  capture(file: string, woodlandTangents: boolean): Promise<WoodlandCapture>;
}) {
  const out = resolve(options.out), rel = relative(process.cwd(), out);
  assert(rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel), 'Woodland evidence must stay in the workspace');
  assert(!existsSync(out), 'Refusing to overwrite woodland evidence'); await mkdir(out, { recursive: true });
  const report: Record<string, unknown> = { schema: 'kiln.woodland-ab/1', backend: options.backend, view: 'hero', stage: 'M2a before woodland packing', status: 'pending', crop: WOODLAND_CROP,
    conditions: { width: 1280, height: 720, dpr: 1, tier: 'high', time: 0, ambient: 0, captureOrder: ['safe', 'safe-repeat', 'unsafe'], noise: 'Independent safe capture with a fresh mount, using the same fixed conditions', cropReason: 'Fixed close-left woodland region includes visible trunks; selected from the existing hero before this comparison', scope: 'D-06 intentional tangent-derivative difference; numeric thresholds are reported for context, not used to reverse the owner decision', diffVisualGain: 4, performanceTiming: 'not collected' } };
  const save = () => writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  const writePng = (file: string, image: RgbaImage) => writeFile(resolve(out, file), PNG.sync.write({ width: image.width, height: image.height, data: Buffer.from(image.data) }));
  const captures: Record<string, unknown> = {}; report.captures = captures;
  const record = async (name: string, capture: WoodlandCapture) => { captures[name] = { file: capture.file, stats: capture.stats, diagnostics: capture.diagnostics }; await save(); };
  try {
    const safe = await options.capture(resolve(out, 'safe-full.png'), true);
    await record('safe', safe);
    const repeat = await options.capture(resolve(out, 'safe-repeat-full.png'), true);
    await record('repeat', repeat);
    const unsafe = await options.capture(resolve(out, 'unsafe-full.png'), false);
    await record('unsafe', unsafe);
    validateWoodlandAb(safe, repeat, unsafe, options.backend);
    const a = cropImage(safe.png, WOODLAND_CROP), b = cropImage(repeat.png, WOODLAND_CROP), c = cropImage(unsafe.png, WOODLAND_CROP);
    const full = compareParityImages(safe.png, repeat.png, unsafe.png), crop = compareLuminanceImages(a, b, c);
    await writePng('safe-crop.png', a); await writePng('safe-repeat-crop.png', b); await writePng('unsafe-crop.png', c);
    await writePng('diff-full.png', full.diff); await writePng('diff-crop.png', crop.diff);
    const { diff: _full, ...fullMetric } = full, { diff: _crop, ...cropMetric } = crop;
    Object.assign(report, { status: 'captured', branchValidation: 'pass', full: fullMetric, cropMetric, visualReviewRequired: !full.pass || !crop.pass,
      images: ['safe-full.png', 'safe-repeat-full.png', 'unsafe-full.png', 'safe-crop.png', 'safe-repeat-crop.png', 'unsafe-crop.png', 'diff-full.png', 'diff-crop.png'] });
    await save(); return report;
  } catch (error) { Object.assign(report, { status: 'fail', error: error instanceof Error ? error.stack : String(error) }); await save(); throw error; }
}
