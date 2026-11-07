import {
  enforceCapturePixels,
  enforcePngCaptureBudget,
  enforceCaptureBytes,
  type CaptureLimits,
} from './capture-limits';
import type { PbrRenderPort } from '../composer/render-port';
import {
  validateResolvedAssetCamera,
  type ResolvedAssetCameraV1,
  type ResolvedCameraShotV1,
} from './camera';
import type { DerivativeCellRenderResult } from './index';
import {
  resolveGridCapture,
  type CaptureConfig,
  type CaptureShape,
  type ResolvedCapture,
} from './capture';
import { decodePng } from './png';
import { compositeViewPngGrid } from './grid';
export const DEFAULT_VIEW_RENDER_TIMEOUT_MS = 8000;
/** What one render request may carry; the render service refuses anything more. */
export const MAX_CAMERAS_PER_REQUEST = 12;
export const MAX_PIXELS_PER_REQUEST = 16_777_216;

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
      captureCacheHits?: boolean[];
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
      ...(result.captureCacheHits ? { captureCacheHits: result.captureCacheHits } : {}),
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

/** How many shots of one size go in each render request, in order. */
export function exactShotRequestSizes(shots: number, size: number): number[] {
  const fit = Math.max(
    1,
    Math.min(MAX_CAMERAS_PER_REQUEST, Math.floor(MAX_PIXELS_PER_REQUEST / (size * size))),
  );
  const sizes: number[] = [];
  for (let left = shots; left > 0; left -= fit) sizes.push(Math.min(left, fit));
  return sizes;
}

/**
 * The shot indices of each render request. Projections stay in separate requests: the renderer
 * compiles a material's view direction for the first camera that draws it and reuses that shader
 * for the scene's later cameras, so a perspective camera after an orthographic one in the same
 * request comes back shaded wrong.
 */
function exactShotRequests(shots: readonly ResolvedCameraShotV1[], size: number): number[][] {
  const byProjection = new Map<string, number[]>();
  for (const [index, shot] of shots.entries()) {
    const group = byProjection.get(shot.camera.projection);
    if (group) group.push(index);
    else byProjection.set(shot.camera.projection, [index]);
  }
  const requests: number[][] = [];
  for (const indices of byProjection.values()) {
    let start = 0;
    for (const count of exactShotRequestSizes(indices.length, size)) {
      requests.push(indices.slice(start, start + count));
      start += count;
    }
  }
  return requests;
}

/**
 * Draw shots that change only the camera from the artifact bytes themselves: one request per
 * projection and service limit, so the renderer loads the scene once for them and a capture cache
 * answers before any upload. Each request keeps its own deadline in {@link captureViewPngsViaPort}, the single owner
 * of that policy. Never throws. A shot left undefined was not drawn, because its request failed or
 * its renderer differed from the earlier ones, and takes the caller's per-shot route with its own
 * degrade; a cancellation surfaces there too.
 */
export async function captureExactArtifactShotsViaPort(
  port: PbrRenderPort,
  glb: Buffer | Uint8Array,
  timeoutMs: number,
  shots: readonly ResolvedCameraShotV1[],
  size: number,
  options: {
    /** Whether these bytes are the artifact a caller can select: see {@link ViewFidelityV1}. */
    exactArtifact: boolean;
    limits?: CaptureLimits;
    backdrop?: import('./background').BackdropId;
    execution?: { signal?: AbortSignal };
  },
): Promise<(DerivativeCellRenderResult | undefined)[]> {
  const cells: (DerivativeCellRenderResult | undefined)[] = shots.map(() => undefined);
  let rendererId: string | undefined;
  for (const indices of exactShotRequests(shots, size)) {
    const batch = indices.map((index) => shots[index]!);
    const result = await captureViewPngsViaPort(
      port,
      glb,
      timeoutMs,
      batch.map(
        ({ camera }) =>
          camera.position.map((n, axis) => n - camera.target[axis]!) as [number, number, number],
      ),
      size,
      batch.map((shot) => shot.camera),
      options.limits,
      options.backdrop,
      options.execution,
    );
    if (!result.ok || !result.derivativeFidelityAttested || !result.inputGlbSha256) break;
    if (rendererId !== undefined && rendererId !== result.rendererId) break;
    rendererId = result.rendererId;
    for (const [index, shot] of batch.entries()) {
      const hit = result.captureCacheHits?.[index];
      cells[indices[index]!] = {
        png: Buffer.from(result.pngs[index]!),
        receipt: {
          version: 'kiln.view-fidelity.v1',
          derivativeLabel: shot.name,
          requested: 'full-preferred',
          delivered: 'full-material',
          exactArtifact: options.exactArtifact,
          rendererId: result.rendererId,
          materialFaithful: true,
          degraded: false,
          inputGlbSha256: result.inputGlbSha256,
          camera: shot.camera,
          cameraFidelity: 'echo-validated',
          ...(hit === undefined ? {} : { captureCache: { hit, reused: hit ? 1 : 0, total: 1 } }),
          ...(options.exactArtifact ? {} : { reasonCodes: ['IN_LOOP_BUILD_NOT_PERSISTED'] }),
        },
      };
    }
  }
  return cells;
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
      const { renderReviewDerivativeGlb } = await import('../render');
      const loaded = await loadGlbReviewScene(Uint8Array.from(glb));
      const grid = await renderCaptureGrid(
        loaded.root,
        capture,
        async (input) => {
          execution?.signal?.throwIfAborted();
          // An isolated shot hides the other meshes; send the GPU only what it may draw.
          const derivative = await renderReviewDerivativeGlb(
            withoutHiddenMeshes(input.root as import('three').Object3D),
            { gltfExporter: 'three' },
          );
          const result = await captureViewPngsViaPort(
            port,
            derivative,
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
        {
          renderExactShots: ({ shots, size, backdrop }) =>
            captureExactArtifactShotsViaPort(port, glb, timeoutMs, shots, size, {
              // These are the bytes the caller produced, which is what it asked to see.
              exactArtifact: true,
              ...(limits ? { limits } : {}),
              backdrop,
              ...(execution ? { execution } : {}),
            }),
        },
      );
      const rendererIds = new Set(grid.derivativeReceipts.map((receipt) => receipt.rendererId));
      if (rendererIds.size > 1) throw new Error('capture renderer changed between cells');
      return {
        ok: true,
        png: grid.png,
        rendererId: grid.derivativeReceipts[0]!.rendererId,
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
