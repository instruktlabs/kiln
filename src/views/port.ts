import {
  enforceCapturePixels,
  enforcePngCaptureBudget,
  enforceCaptureBytes,
  type CaptureLimits,
} from './capture-limits';
import type { PbrRenderPort } from '../composer/render-port';
import { validateResolvedAssetCamera, type ResolvedAssetCameraV1 } from './camera';
import {
  resolveGridCapture,
  type CaptureConfig,
  type CaptureShape,
  type ResolvedCapture,
} from './capture';
import { decodePng } from './png';
import { compositeViewPngGrid } from './grid';
export const DEFAULT_VIEW_RENDER_TIMEOUT_MS = 8000;

export async function sha256Bytes(bytes: Uint8Array): Promise<`sha256:${string}`> {
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export type PortViewsOutcome =
  | {
      ok: true;
      png: Buffer;
      rendererId: string;
      captureCache?: { hit: boolean; reused: number; total: number };
      derivativeReceipts?: import('../composer/render-port').DerivativeViewReceiptV1[];
      cameraShots?: import('./camera').ResolvedCameraShotV1[];
      perFramePngs?: Buffer[];
      capture: CaptureShape;
      /** Pixel dimensions of the composited grid — the same `width`/`height` the
       *  CPU path reports alongside its grid, additive here so a caller never has
       *  to decode the PNG to learn them. */
      width: number;
      height: number;
    }
  | { ok: false; reason: string };

export type PortViewPngsOutcome =
  | {
      ok: true;
      pngs: Uint8Array[];
      rendererId: string;
      captureCache?: { hit: boolean; reused: number; total: number };
      derivativeFidelityAttested: boolean;
      inputGlbSha256?: `sha256:${string}`;
    }
  | { ok: false; reason: string };

/**
 * Lowest-level owner of the PBR-port deadline and reply validation. It accepts
 * exact GLB bytes plus explicit view directions and returns unmodified square
 * PNG cells. Contact sheets and derivative review surfaces both build on this
 * function so timeout/error/shape policy cannot drift between them.
 */
export async function captureViewPngsViaPort(
  port: PbrRenderPort,
  glb: Buffer | Uint8Array,
  timeoutMs: number,
  viewDirs: readonly [number, number, number][],
  size: number,
  cameras?: readonly ResolvedAssetCameraV1[],
  limits?: CaptureLimits,
  backdrop?: import('./background').BackdropId,
  execution?: { signal?: AbortSignal },
): Promise<PortViewPngsOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let abort: (() => void) | undefined;
  try {
    execution?.signal?.throwIfAborted();
    const exactCameras = cameras?.map(validateResolvedAssetCamera);
    if (exactCameras && exactCameras.length !== viewDirs.length)
      throw new Error('camera and view count mismatch');
    const requestGlb = Uint8Array.from(glb);
    const inputGlbSha256 = await sha256Bytes(requestGlb);
    execution?.signal?.throwIfAborted();
    const deadline = new Promise<never>((_, reject) => {
      abort = () => {
        const error = execution?.signal?.reason ?? new Error('View request cancelled.');
        reject(error);
        controller.abort(error);
      };
      execution?.signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => {
        const error = new Error(`view render port timed out after ${timeoutMs}ms`);
        reject(error);
        controller.abort(error);
      }, timeoutMs);
    });
    const result = await Promise.race([
      port(
        {
          glb: requestGlb,
          ...(backdrop ? { backdrop } : {}),
          ...(exactCameras
            ? { cameras: exactCameras, width: size, height: size }
            : { viewDirs: viewDirs.map((dir) => [...dir] as [number, number, number]), size }),
        },
        { signal: controller.signal },
      ),
      deadline,
    ]);
    execution?.signal?.throwIfAborted();
    if (!result?.ok) {
      return { ok: false, reason: result?.error ?? 'view render port returned ok: false' };
    }
    if (typeof result.rendererId !== 'string' || !result.rendererId.trim()) {
      return { ok: false, reason: 'view render port returned no rendererId' };
    }
    if (!result.viewsPng || result.viewsPng.length !== viewDirs.length) {
      return {
        ok: false,
        reason: `view render port returned ${result.viewsPng?.length ?? 0} view PNGs, expected ${viewDirs.length}`,
      };
    }
    if (exactCameras) {
      if (
        result.width !== size ||
        result.height !== size ||
        !result.cameras ||
        result.cameras.length !== exactCameras.length
      )
        return { ok: false, reason: 'camera receipt missing or dimensions mismatch' };
      for (let i = 0; i < exactCameras.length; i++) {
        const echoed = validateResolvedAssetCamera(result.cameras[i] as ResolvedAssetCameraV1);
        const wanted = exactCameras[i]!;
        for (const key of Object.keys(wanted) as (keyof ResolvedAssetCameraV1)[])
          if (JSON.stringify(echoed[key]) !== JSON.stringify(wanted[key]))
            return { ok: false, reason: 'camera receipt does not match requested camera' };
      }
    }
    if (result.derivativeFidelity && result.derivativeFidelity.inputGlbSha256 !== inputGlbSha256) {
      return {
        ok: false,
        reason: `view render port derivative receipt hash mismatch (${result.derivativeFidelity.inputGlbSha256} != ${inputGlbSha256})`,
      };
    }
    // Decode here even though callers may decode again for annotation. This is
    // the transport trust boundary: an ok:true reply with malformed/non-square
    // pixels is a degrade, never a successful material attestation.
    enforcePngCaptureBudget(result.viewsPng, limits);
    for (const png of result.viewsPng) {
      const decoded = decodePng(png);
      if (exactCameras && (decoded.width !== size || decoded.height !== size))
        return { ok: false, reason: 'camera PNG dimensions mismatch' };
      if (decoded.width !== decoded.height) {
        return {
          ok: false,
          reason: `view render port returned non-square ${decoded.width}x${decoded.height} PNG`,
        };
      }
    }
    return {
      ok: true,
      pngs: result.viewsPng.map((png) => Uint8Array.from(png)),
      rendererId: result.rendererId,
      ...(result.captureCache ? { captureCache: result.captureCache } : {}),
      derivativeFidelityAttested: result.derivativeFidelity?.materialFaithful === true,
      ...(result.derivativeFidelity ? { inputGlbSha256 } : {}),
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) execution?.signal?.removeEventListener('abort', abort);
  }
}

/**
 * Call the host view-render port with the ALREADY-PRODUCED GLB bytes and
 * composite its per-view PNGs into the same grid the CPU path emits.
 *
 * This shell is NOT a render compute path: the deadline is a plain timer (no
 * Date.now() enters any rasterizer), and every failure mode — thrown/rejected
 * port, ok:false, timeout, missing rendererId, undecodable or mismatched PNGs —
 * returns `{ ok: false, reason }` so the caller degrades to the CPU rasterizer
 * instead of failing the generation.
 *
 * Exported as the single owner of the degrade policy: hosts that assemble their
 * own generation pipeline (rather than calling generateKilnAsset) route their
 * produced GLB through this same shell instead of re-implementing it.
 *
 * T3.3: `capture` selects the grid shape and per-cell cameras, resolved through
 * the SAME {@link resolveGridCapture} the CPU rasterizer uses so both producers
 * lay out identically. Omitted keeps the shipped six-view 3x2 (H-33 env variant
 * included).
 */
export async function captureViewsViaPort(
  port: PbrRenderPort,
  glb: Buffer | Uint8Array,
  timeoutMs: number = DEFAULT_VIEW_RENDER_TIMEOUT_MS,
  capture?: CaptureConfig,
  limits?: CaptureLimits,
  execution?: { signal?: AbortSignal },
): Promise<PortViewsOutcome> {
  if (capture?.shots || capture?.version) {
    try {
      execution?.signal?.throwIfAborted();
      const { loadGlbReviewScene } = await import('./index');
      const { renderCaptureGrid } = await import('./camera-capture');
      const { withoutHiddenMeshes } = await import('./camera');
      const { renderSceneToGLB } = await import('../render');
      const loaded = await loadGlbReviewScene(Uint8Array.from(glb));
      let rendererId = '';
      const grid = await renderCaptureGrid(
        loaded.root,
        capture,
        async (input) => {
          execution?.signal?.throwIfAborted();
          // An isolated shot hides the other meshes; send the GPU only what it may draw.
          const derivative = await renderSceneToGLB(
            withoutHiddenMeshes(input.root as import('three').Object3D),
            { derivative: true },
          );
          const result = await captureViewPngsViaPort(
            port,
            derivative.bytes,
            timeoutMs,
            [input.view.dir],
            input.size,
            [input.camera!],
            limits,
            input.backdrop,
            execution,
          );
          if (!result.ok) throw new Error(result.reason);
          if (!result.derivativeFidelityAttested || !result.inputGlbSha256)
            throw new Error('advanced capture requires derivative material receipt');
          if (rendererId && rendererId !== result.rendererId)
            throw new Error('capture renderer changed between cells');
          rendererId = result.rendererId;
          return {
            png: Buffer.from(result.pngs[0]!),
            receipt: {
              version: 'kiln.view-fidelity.v1',
              derivativeLabel: input.label,
              requested: 'full-preferred',
              delivered: 'full-material',
              exactArtifact: false,
              rendererId: result.rendererId,
              materialFaithful: true,
              degraded: false,
              inputGlbSha256: result.inputGlbSha256,
              camera: input.camera,
              cameraFidelity: 'echo-validated',
              ...(result.captureCache ? { captureCache: result.captureCache } : {}),
            },
          };
        },
        limits,
      );
      return {
        ok: true,
        png: grid.png,
        rendererId,
        capture: grid.capture!,
        width: grid.width,
        height: grid.height,
        cameraShots: grid.cameraShots,
        derivativeReceipts: grid.derivativeReceipts,
        perFramePngs: grid.perFramePngs,
        ...(grid.captureCache ? { captureCache: grid.captureCache } : {}),
      };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  let resolved: ResolvedCapture;
  try {
    execution?.signal?.throwIfAborted();
    resolved = resolveGridCapture(capture, process.env['KILN_GRID_VARIANT']);
    enforceCapturePixels(resolved.views.length, 384, resolved.cols, limits);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const views = resolved.views;
  const shape: CaptureShape = {
    preset: resolved.preset,
    cols: resolved.cols,
    cells: views.length,
    backdrop: resolved.backdrop,
  };

  let cameras: ResolvedAssetCameraV1[] | undefined;
  if (resolved.zooms.some((z) => z !== undefined)) {
    try {
      const { loadGlbReviewScene, measureBounds, cameraFromBounds } = await import('../views');
      const loaded = await loadGlbReviewScene(Uint8Array.from(glb));
      const bounds = measureBounds(loaded.root);
      cameras = views.map((view, i) => cameraFromBounds(bounds, view.dir, resolved.zooms[i] ?? 1));
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  const result = await captureViewPngsViaPort(
    port,
    glb,
    timeoutMs,
    views.map((view) => view.dir),
    384,
    cameras,
    limits,
    resolved.backdrop,
    execution,
  );
  if (!result.ok) return result;
  try {
    // Annotated with the SAME cell labels + gnomon the CPU path stamps. A host
    // returns pixels and knows nothing of the Kiln camera vocabulary, so
    // without this the GPU sheet arrives unlabelled and the model quietly loses
    // its orientation cues on the one path that cannot tell it happened.
    // Degrade stays reportable through `renderDegraded` / `viewsRendererId`,
    // which is a structured field rather than a visual tell.
    const grid = compositeViewPngGrid(result.pngs, resolved.cols, views);
    enforceCaptureBytes([grid.png], limits);
    return {
      ok: true,
      png: grid.png,
      rendererId: result.rendererId,
      ...(result.captureCache ? { captureCache: result.captureCache } : {}),
      capture: shape,
      width: grid.width,
      height: grid.height,
    };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
