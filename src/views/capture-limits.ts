import { PAD } from './grid';
export interface CaptureLimits {
  maxTotalPixels?: number;
  maxOutputBytes?: number;
}
/**
 * Largest square per-shot size for kiln.capture.v1. The render service accepts
 * camera-mode images up to 4096 px a side and 16.7M pixels per request, and 2048
 * is its top legacy rung; the capture pixel and byte budgets below bound the sheet.
 */
export const MAX_CAPTURE_SHOT_SIZE = 2048;
export const MIN_CAPTURE_SHOT_SIZE = 128;
export const DEFAULT_CAPTURE_LIMITS = Object.freeze({
  maxTotalPixels: 24_000_000,
  maxOutputBytes: 32 * 1024 * 1024,
});
export function resolveCaptureLimits(limits: CaptureLimits = {}) {
  const result: Required<CaptureLimits> = { ...DEFAULT_CAPTURE_LIMITS };
  for (const key of ['maxTotalPixels', 'maxOutputBytes'] as const) {
    const value = limits[key];
    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error(`capture limit ${key} must be a positive integer`);
      result[key] = Math.min(value, result[key]);
    }
  }
  return result;
}
/** Pixels a capture allocates: every cell, and the sheet they compose into when one is built. */
function capturePixels(cells: number, size: number, cols: number, compose: boolean): number {
  const rows = Math.ceil(cells / cols);
  return (
    cells * size * size +
    (compose ? (cols * size + (cols + 1) * PAD) * (rows * size + (rows + 1) * PAD) : 0)
  );
}
/** Largest shot size under the budget, or undefined when even the smallest shot is over it. */
function largestShotSize(
  cells: number,
  cols: number,
  compose: boolean,
  maxTotalPixels: number,
): number | undefined {
  for (let size = MAX_CAPTURE_SHOT_SIZE; size >= MIN_CAPTURE_SHOT_SIZE; size--)
    if (capturePixels(cells, size, cols, compose) <= maxTotalPixels) return size;
  return undefined;
}
/**
 * `nameFit` is for a capture whose caller chose the shots and their size: the error then says
 * which sizes fit, since the bare count gives a model nothing to change.
 */
export function enforceCapturePixels(
  cells: number,
  size: number,
  cols: number,
  limits?: CaptureLimits,
  compose = true,
  nameFit = false,
) {
  if (
    !Number.isSafeInteger(cells) ||
    cells < 1 ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !Number.isSafeInteger(cols) ||
    cols < 1
  )
    throw new Error('invalid capture dimensions');
  const pixels = capturePixels(cells, size, cols, compose);
  const { maxTotalPixels } = resolveCaptureLimits(limits);
  if (pixels > maxTotalPixels) {
    const exceeded = `capture pixel budget exceeded: ${pixels} pixels against a limit of ${maxTotalPixels}`;
    if (!nameFit) throw new Error(`${exceeded}.`);
    const asGrid = compose ? largestShotSize(cells, cols, true, maxTotalPixels) : undefined;
    const separate = largestShotSize(cells, cols, false, maxTotalPixels);
    let fits = 'Use fewer shots.';
    if (separate !== undefined)
      fits = compose
        ? `Largest size that fits: ${asGrid ?? 'none'} as a grid, ${separate} with output: "separate".`
        : `Largest size that fits: ${separate}.`;
    throw new Error(
      `${exceeded} (${cells} shots at size ${size}${compose ? ', plus their grid sheet' : ''}). ${fits}`,
    );
  }
  return pixels;
}
export function enforceCaptureBytes(images: readonly Uint8Array[], limits?: CaptureLimits) {
  const bytes = images.reduce((sum, image) => sum + image.byteLength, 0);
  if (bytes > resolveCaptureLimits(limits).maxOutputBytes)
    throw new Error(`capture byte budget exceeded: ${bytes}`);
  return bytes;
}
/** Bound declared raster dimensions before a decoder allocates inflated pixel storage. */
export function enforcePngCaptureBudget(images: readonly Uint8Array[], limits?: CaptureLimits) {
  enforceCaptureBytes(images, limits);
  let pixels = 0;
  for (const png of images) {
    if (png.byteLength < 24) throw new Error('invalid PNG header');
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    if (view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452)
      throw new Error('invalid PNG header');
    pixels += view.getUint32(16) * view.getUint32(20);
  }
  if (pixels > resolveCaptureLimits(limits).maxTotalPixels)
    throw new Error(`capture pixel budget exceeded: ${pixels}`);
}
