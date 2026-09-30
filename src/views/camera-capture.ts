import {
  enforceCapturePixels,
  enforceCaptureBytes,
  MAX_CAPTURE_SHOT_SIZE,
  type CaptureLimits,
} from './capture-limits';
import {
  resolveAssetCamera,
  rasterizeCamera,
  withCameraVisibility,
  type ResolvedCameraShotV1,
} from './camera';
import { resolveCaptureBackdrop, type CaptureConfig } from './capture';
import type { DerivativeCellRenderer, ViewGridResult } from './index';
import { encodePng, decodePng } from './png';
import { compositeCellGrid } from './grid';
import { annotateViewCell } from './annotate';
import type { DerivativeViewReceiptV1 } from '../composer/render-port';
export interface CameraCaptureGridResult extends ViewGridResult {
  cameraShots: ResolvedCameraShotV1[];
  perFramePngs: Buffer[];
  derivativeReceipts: DerivativeViewReceiptV1[];
}
export function validateAdvancedCapture(config: CaptureConfig): void {
  for (const key of Object.keys(config))
    if (!['version', 'shots', 'cols', 'size', 'output', 'backdrop'].includes(key))
      throw new Error(`capture.${key} is unknown or incompatible with shots`);
  if (config.version !== 'kiln.capture.v1')
    throw new Error('advanced capture requires version kiln.capture.v1');
  if (!Array.isArray(config.shots) || config.shots.length < 1 || config.shots.length > 9)
    throw new Error('capture.shots must contain 1..9 shots');
  if (
    config.cols !== undefined &&
    (!Number.isInteger(config.cols) || config.cols < 1 || config.cols > 3)
  )
    throw new Error('capture.cols must be 1..3');
  if (
    config.size !== undefined &&
    (!Number.isInteger(config.size) || config.size < 128 || config.size > MAX_CAPTURE_SHOT_SIZE)
  )
    throw new Error(`capture.size must be 128..${MAX_CAPTURE_SHOT_SIZE}`);
  if (config.output !== undefined && !['grid', 'separate'].includes(config.output))
    throw new Error('capture.output must be grid or separate');
  resolveCaptureBackdrop(config.backdrop);
}
export async function renderCaptureGrid(
  root: unknown,
  config: CaptureConfig,
  render?: DerivativeCellRenderer,
  limits?: CaptureLimits,
): Promise<CameraCaptureGridResult> {
  validateAdvancedCapture(config);
  const shots = config.shots!.map((s) => resolveAssetCamera(root, s));
  const size = config.size ?? 384;
  const cols = config.cols ?? Math.min(3, shots.length);
  const backdrop = resolveCaptureBackdrop(config.backdrop);
  enforceCapturePixels(shots.length, size, cols, limits);
  const cells: Uint8Array[] = [];
  const perFramePngs: Buffer[] = [];
  const derivativeReceipts: DerivativeViewReceiptV1[] = [];
  for (const shot of shots) {
    const dir = shot.camera.position.map((n, i) => n - shot.camera.target[i]!) as [
      number,
      number,
      number,
    ];
    const view = { name: shot.name, dir };
    const png = await withCameraVisibility(root, shot, async () => {
      if (render) {
        const result = await render({
          root,
          label: shot.name,
          view,
          size,
          camera: shot.camera,
          backdrop,
        });
        derivativeReceipts.push(result.receipt);
        return result.png;
      }
      return encodePng(rasterizeCamera(root, shot.camera, size, true, backdrop), size, size);
    });
    const decoded = decodePng(png);
    if (decoded.width !== size || decoded.height !== size)
      throw new Error('capture cell dimensions do not match request');
    annotateViewCell(decoded.rgb, size, view);
    cells.push(decoded.rgb);
    perFramePngs.push(encodePng(decoded.rgb, size, size));
  }
  const { rgb, width, height } = compositeCellGrid(cells, size, cols);
  const png = encodePng(rgb, width, height);
  enforceCaptureBytes(config.output === 'separate' ? perFramePngs : [png], limits);
  return {
    png,
    width,
    height,
    views: shots.map((s) => s.name),
    capture: {
      preset: `${cols}x${Math.ceil(shots.length / cols)}`,
      cols,
      cells: shots.length,
      backdrop,
      output: config.output ?? 'grid',
    },
    cameraShots: shots,
    perFramePngs,
    derivativeReceipts,
    ...(derivativeReceipts.length
      ? {
          captureCache: {
            hit: derivativeReceipts.every((r) => r.captureCache?.hit),
            reused: derivativeReceipts.filter((r) => r.captureCache?.hit).length,
            total: derivativeReceipts.length,
          },
        }
      : {}),
  };
}
