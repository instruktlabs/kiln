import { createHash } from 'node:crypto';
import {
  validatePbrRenderRequest,
  type PbrRenderPort,
  type PbrRenderResult,
  type PbrRenderRequest,
} from '../composer/render-port';
import type { GlbViewCellResult } from './index';
import type { ResolvedAssetCameraV1 } from './camera';
import { decodePng } from './png';
import { enforcePngCaptureBudget } from './capture-limits';
export type CaptureCacheEntry =
  | { kind: 'gpu'; result: PbrRenderResult }
  | { kind: 'cpu'; result: GlbViewCellResult };
export interface CaptureCache {
  get(key: string): Promise<CaptureCacheEntry | undefined>;
  put(key: string, value: CaptureCacheEntry): Promise<void>;
}
function clone(entry: CaptureCacheEntry): CaptureCacheEntry {
  const result = structuredClone(entry);
  if (result.kind === 'cpu') result.result.png = Buffer.from(result.result.png);
  return result;
}
/** One host-owned byte budget for disposable cells. Entries retain the producer and evidence. */
export class MemoryCaptureCache implements CaptureCache {
  private readonly entries = new Map<string, { entry: CaptureCacheEntry; bytes: number }>();
  private bytes = 0;
  constructor(private readonly maxBytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
      throw new Error('Capture cache bytes must be a nonnegative integer');
  }
  async get(key: string) {
    const value = this.entries.get(key);
    if (!value) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return clone(value.entry);
  }
  async put(key: string, value: CaptureCacheEntry) {
    const entry = clone(value);
    let bytes: number;
    if (entry.kind === 'gpu') {
      const { viewsPng, beautyPng, ...metadata } = entry.result;
      bytes =
        (viewsPng ?? []).reduce((sum, png) => sum + png.byteLength, 0) +
        (beautyPng?.byteLength ?? 0) +
        Buffer.byteLength(JSON.stringify(metadata));
    } else {
      const { png, ...metadata } = entry.result;
      bytes = png.byteLength + Buffer.byteLength(JSON.stringify(metadata));
    }
    if (bytes > this.maxBytes) return;
    const old = this.entries.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.entries.delete(key);
    }
    while (this.bytes + bytes > this.maxBytes) {
      const first = this.entries.keys().next().value;
      if (first === undefined) break;
      this.bytes -= this.entries.get(first)!.bytes;
      this.entries.delete(first);
    }
    this.entries.set(key, { entry, bytes });
    this.bytes += bytes;
  }
  stats() {
    return { entries: this.entries.size, bytes: this.bytes, maxBytes: this.maxBytes };
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new Error('Non-finite capture identity');
  if (
    value === undefined ||
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value)
  )
    return value;
  throw new Error('Capture identity must be data');
}
const text = (value: unknown) => JSON.stringify(canonical(value));
const digest = (value: string | Uint8Array) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}` as const;
function usable(result: PbrRenderResult, request: PbrRenderRequest, hash: string): boolean {
  try {
    if (
      !result.ok ||
      !result.rendererId?.trim() ||
      result.derivativeFidelity?.materialFaithful !== true ||
      result.derivativeFidelity.inputGlbSha256 !== hash
    )
      return false;
    const count = (request.cameras ?? request.viewDirs)!.length;
    if (result.viewsPng?.length !== count) return false;
    if (
      request.cameras &&
      (result.width !== request.width ||
        result.height !== request.height ||
        text(result.cameras) !== text(request.cameras))
    )
      return false;
    enforcePngCaptureBudget(result.viewsPng);
    for (const png of result.viewsPng) {
      const image = decodePng(png);
      if (
        image.width !== image.height ||
        (request.cameras && (image.width !== request.width || image.height !== request.height))
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
/** Cache only acknowledged material-faithful GPU cells. Identity must include backend/version and hidden render settings. */
export function createCachedRenderPort(
  port: PbrRenderPort,
  options: { cache: CaptureCache; identity(): string | undefined | Promise<string | undefined> },
): PbrRenderPort {
  return async (input, execution) => {
    execution?.signal?.throwIfAborted();
    const identity = await Promise.resolve()
      .then(() => options.identity())
      .catch(() => undefined);
    execution?.signal?.throwIfAborted();
    if (!identity || input.beautySize !== undefined || !(input.cameras ?? input.viewDirs)?.length)
      return port(input, execution);
    const validated = validatePbrRenderRequest(input);
    const request = { ...validated, glb: Uint8Array.from(validated.glb) };
    const hash = digest(request.glb);
    const selectors = request.cameras ?? request.viewDirs!;
    const keys = selectors.map((selector) =>
      digest(
        text({
          version: 'kiln.capture-cache.v1',
          kind: 'gpu',
          identity,
          artifact: hash,
          selector,
          size: request.size,
          width: request.width,
          height: request.height,
          lighting: request.lightingPresetId,
          backdrop: request.backdrop,
        }),
      ),
    );
    const cells: Array<PbrRenderResult | undefined> = [];
    const missing: number[] = [];
    for (let i = 0; i < keys.length; i++) {
      const cached = await options.cache.get(keys[i]!).catch(() => undefined);
      execution?.signal?.throwIfAborted();
      const single = {
        ...request,
        ...(request.cameras
          ? { cameras: [request.cameras[i]!] }
          : { viewDirs: [request.viewDirs![i]!] }),
      };
      if (cached?.kind === 'gpu' && usable(cached.result, single, hash)) cells[i] = cached.result;
      else missing.push(i);
    }
    if (missing.length) {
      const subrequest = {
        ...request,
        ...(request.cameras
          ? { cameras: missing.map((i) => request.cameras![i]!) }
          : { viewDirs: missing.map((i) => request.viewDirs![i]!) }),
      };
      const produced = await port(subrequest, execution);
      execution?.signal?.throwIfAborted();
      const afterIdentity = await Promise.resolve()
        .then(() => options.identity())
        .catch(() => undefined);
      execution?.signal?.throwIfAborted();
      if (afterIdentity !== identity)
        return missing.length === selectors.length
          ? produced
          : {
              ok: false,
              rendererId: produced.rendererId,
              error: 'capture producer changed during render',
            };
      if (!usable(produced, subrequest, hash)) {
        // Returning a partial batch as a successful full sheet would mislabel images.
        return missing.length === selectors.length
          ? produced
          : {
              ok: false,
              rendererId: produced.rendererId,
              error: produced.error ?? 'uncacheable partial camera response',
            };
      }
      for (let j = 0; j < missing.length; j++) {
        const i = missing[j]!;
        const cell = {
          ...produced,
          viewsPng: [Uint8Array.from(produced.viewsPng![j]!)],
          ...(produced.cameras ? { cameras: [produced.cameras[j]!] } : {}),
        };
        cells[i] = cell;
        await options.cache.put(keys[i]!, { kind: 'gpu', result: cell }).catch(() => {});
      }
    }
    const first = cells[0]!;
    if (cells.some((c) => c!.rendererId !== first.rendererId))
      return {
        ok: false,
        rendererId: first.rendererId,
        error: 'capture producer changed; refresh host cache identity',
      };
    return {
      ...first,
      viewsPng: cells.map((c) => Uint8Array.from(c!.viewsPng![0]!)),
      ...(request.cameras ? { cameras: structuredClone(request.cameras) } : {}),
      captureCache: {
        hit: missing.length === 0,
        reused: selectors.length - missing.length,
        total: selectors.length,
      },
      captureCacheHits: selectors.map((_, index) => !missing.includes(index)),
    };
  };
}
export interface CpuCaptureIdentity {
  artifactGlbSha256: `sha256:${string}`;
  rendererId: string;
  camera: ResolvedAssetCameraV1;
  size: number;
  backfaceCull?: boolean;
  /** Painted backdrop; part of the key because the pixels differ per backdrop. */
  backdrop?: import('./background').BackdropId;
}
/** CPU entries are explicitly geometry-flat and live in a different key namespace from GPU cells. */
export async function captureCpuCell(
  cache: CaptureCache,
  identity: CpuCaptureIdentity,
  produce: () => Promise<GlbViewCellResult>,
): Promise<GlbViewCellResult & { captureCache?: { hit: boolean } }> {
  const snapshot = structuredClone(identity);
  const key = digest(text({ version: 'kiln.capture-cache.v1', kind: 'cpu', ...snapshot }));
  const valid = (result: GlbViewCellResult) => {
    try {
      enforcePngCaptureBudget([result.png]);
      const image = decodePng(result.png);
      return (
        result.inputGlbSha256 === snapshot.artifactGlbSha256 &&
        image.width === snapshot.size &&
        image.height === snapshot.size &&
        result.width === snapshot.size &&
        result.height === snapshot.size
      );
    } catch {
      return false;
    }
  };
  const cached = await cache.get(key).catch(() => undefined);
  if (cached?.kind === 'cpu' && valid(cached.result))
    return { ...cached.result, png: Buffer.from(cached.result.png), captureCache: { hit: true } };
  const result = await produce();
  if (!valid(result)) return result;
  await cache.put(key, { kind: 'cpu', result }).catch(() => {});
  return { ...result, png: Buffer.from(result.png), captureCache: { hit: false } };
}
