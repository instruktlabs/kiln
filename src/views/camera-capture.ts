import {
  enforceCapturePixels,
  enforceCaptureBytes,
  MAX_CAPTURE_SHOT_SIZE,
  MIN_CAPTURE_SHOT_SIZE,
  type CaptureLimits,
} from './capture-limits';
import {
  resolveAssetCamera,
  rasterizeCamera,
  withCameraVisibility,
  type CameraShotV1,
  type ResolvedCameraShotV1,
} from './camera';
import { resolveCaptureBackdrop, type CaptureConfig } from './capture';
import type { BackdropId } from './background';
import type { DerivativeCellRenderer, DerivativeCellRenderResult, ViewGridResult } from './index';
import { encodePng } from './png';
import { decodePngShared } from './png-memo';
import { compositeCellGrid, PAD } from './grid';
import { annotateViewCell } from './annotate';
import type { DerivativeViewReceiptV1 } from '../composer/render-port';
import { reviewLodChains, withSubjectLevel } from './lod';
export interface CameraCaptureGridResult extends ViewGridResult {
  cameraShots: ResolvedCameraShotV1[];
  perFramePngs: Buffer[];
  derivativeReceipts: DerivativeViewReceiptV1[];
  /** Per shot, the level each MSFT_lod chain drew (0 for LOD0), in `levelsOfDetail` order.
   *  Present when the scene has chains. */
  viewLevels?: number[][];
}
export interface CaptureGridOptions {
  /**
   * The caller delivers `perFramePngs` for `output: 'separate'` and never reads the sheet, so it
   * is neither built nor charged to the pixel budget; `png` is then empty.
   */
  framesOnly?: boolean;
  /**
   * Draws shots that change only the camera, all at once, from the artifact the scene was loaded
   * from. A shot it leaves undefined, or every shot when it returns undefined, takes `render`.
   */
  renderExactShots?: (input: {
    shots: ResolvedCameraShotV1[];
    size: number;
    backdrop: BackdropId;
  }) => Promise<readonly (DerivativeCellRenderResult | undefined)[] | undefined>;
}
export function validateAdvancedCapture(config: CaptureConfig): void {
  for (const key of Object.keys(config))
    if (!['version', 'shots', 'cols', 'size', 'output', 'backdrop'].includes(key))
      throw new Error(`capture.${key} is unknown or incompatible with shots`);
  if (config.version !== 'kiln.capture.v1' && config.version !== 'kiln.capture.v2')
    throw new Error('advanced capture requires version kiln.capture.v1 or kiln.capture.v2');
  if (!Array.isArray(config.shots) || config.shots.length < 1 || config.shots.length > 9)
    throw new Error('capture.shots must contain 1..9 shots');
  if (config.version !== 'kiln.capture.v2' && config.shots.some((shot) => shot.hide !== undefined))
    throw new Error('shot.hide requires version kiln.capture.v2');
  if (
    config.cols !== undefined &&
    (!Number.isInteger(config.cols) || config.cols < 1 || config.cols > 3)
  )
    throw new Error('capture.cols must be 1..3');
  if (
    config.size !== undefined &&
    (!Number.isInteger(config.size) ||
      config.size < MIN_CAPTURE_SHOT_SIZE ||
      config.size > MAX_CAPTURE_SHOT_SIZE)
  )
    throw new Error(`capture.size must be ${MIN_CAPTURE_SHOT_SIZE}..${MAX_CAPTURE_SHOT_SIZE}`);
  if (config.output !== undefined && !['grid', 'separate'].includes(config.output))
    throw new Error('capture.output must be grid or separate');
  resolveCaptureBackdrop(config.backdrop);
}
export async function renderCaptureGrid(
  root: unknown,
  config: CaptureConfig,
  render?: DerivativeCellRenderer,
  limits?: CaptureLimits,
  options: CaptureGridOptions = {},
): Promise<CameraCaptureGridResult> {
  validateAdvancedCapture(config);
  // A shot whose subject names a lower level of detail resolves and draws with that level in
  // its LOD0's place; every shot resolves before any draws.
  const plans: {
    subject: CameraShotV1['subject'];
    shot: ResolvedCameraShotV1;
    levels: number[];
  }[] = [];
  for (const request of config.shots!)
    plans.push(
      await withSubjectLevel(root, request.subject, async (levels) => ({
        subject: request.subject,
        shot: resolveAssetCamera(root, request),
        levels,
      })),
    );
  const shots = plans.map((plan) => plan.shot);
  const size = config.size ?? 384;
  const cols = config.cols ?? Math.min(3, shots.length);
  const backdrop = resolveCaptureBackdrop(config.backdrop);
  const framesOnly = options.framesOnly === true && config.output === 'separate';
  enforceCapturePixels(shots.length, size, cols, limits, !framesOnly, true);
  const cells: Uint8Array[] = [];
  const perFramePngs: Buffer[] = [];
  const derivativeReceipts: DerivativeViewReceiptV1[] = [];
  // Isolation, hidden parts and a lower level all change what draws, which the artifact cannot show.
  const cameraOnly = plans.flatMap((plan, index) =>
    plan.shot.visibility === 'context' &&
    !plan.shot.hide?.length &&
    plan.levels.every((level) => level === 0)
      ? [index]
      : [],
  );
  const drawn = new Map<number, DerivativeCellRenderResult>();
  if (options.renderExactShots && cameraOnly.length) {
    const results = await options.renderExactShots({
      shots: cameraOnly.map((index) => plans[index]!.shot),
      size,
      backdrop,
    });
    results?.forEach((result, position) => {
      if (result) drawn.set(cameraOnly[position]!, result);
    });
  }
  for (const [index, { subject, shot }] of plans.entries()) {
    const dir = shot.camera.position.map((n, i) => n - shot.camera.target[i]!) as [
      number,
      number,
      number,
    ];
    const view = { name: shot.name, dir };
    const exact = drawn.get(index);
    if (exact) derivativeReceipts.push(exact.receipt);
    const png =
      exact?.png ??
      (await withSubjectLevel(root, subject, () =>
        withCameraVisibility(root, shot, async () => {
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
        }),
      ));
    const decoded = decodePngShared(png);
    if (decoded.width !== size || decoded.height !== size)
      throw new Error('capture cell dimensions do not match request');
    annotateViewCell(decoded.rgb, size, view);
    cells.push(decoded.rgb);
    perFramePngs.push(encodePng(decoded.rgb, size, size));
  }
  const rows = Math.ceil(shots.length / cols);
  const sheet = framesOnly ? undefined : compositeCellGrid(cells, size, cols);
  const png = sheet ? encodePng(sheet.rgb, sheet.width, sheet.height) : Buffer.alloc(0);
  enforceCaptureBytes(config.output === 'separate' ? perFramePngs : [png], limits);
  return {
    png,
    width: sheet?.width ?? cols * size + (cols + 1) * PAD,
    height: sheet?.height ?? rows * size + (rows + 1) * PAD,
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
    ...(reviewLodChains(root).length ? { viewLevels: plans.map((plan) => plan.levels) } : {}),
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
