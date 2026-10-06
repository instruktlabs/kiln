import { createHash, randomUUID } from 'node:crypto';
import {
  validatePbrRenderRequest,
  type PbrRenderRequest,
  type PbrRenderResult,
  type PbrRenderPort,
} from '@instruktlabs/kiln/composer';
import { NativeHttpClient } from './native-http';
import { RENDER_LIMITS } from './render-limits';
export { RENDER_LIMITS } from './render-limits';

const fail = () => new Error('Invalid hosted render message');
const hash = (bytes: Uint8Array): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail();
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw fail();
}
function json(bytes: Uint8Array, limit: number): Record<string, unknown> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > limit)
    throw fail();
  try {
    return object(
      JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)),
    );
  } catch {
    throw fail();
  }
}
function serialize(value: unknown, limit: number): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > limit) throw fail();
  return bytes;
}
function base64(value: unknown, limit: number): Buffer {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length % 4 !== 0 ||
    value.length > Math.ceil(limit / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw fail();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > limit || bytes.toString('base64') !== value) throw fail();
  return bytes;
}
function admitted(value: unknown): PbrRenderRequest {
  const request = validatePbrRenderRequest(value);
  if (request.glb.byteLength > RENDER_LIMITS.glbBytes) throw fail();
  if (!request.cameras) {
    request.viewDirs ??= [[1, 0.35, 1]];
    request.size ??= 384;
  }
  const width = request.width ?? request.size!;
  const height = request.height ?? request.size!;
  const count = request.cameras?.length ?? request.viewDirs!.length;
  const beauty = request.beautySize ?? 0;
  if (
    Math.max(width, height, beauty) > RENDER_LIMITS.dimension ||
    width * height * count + beauty * beauty > RENDER_LIMITS.pixels
  )
    throw fail();
  return request;
}
export interface RenderInput {
  requestId: string;
  inputGlbSha256: `sha256:${string}`;
  request: PbrRenderRequest;
}
export function encodeRenderRequest(
  value: PbrRenderRequest,
): RenderInput & { bytes: Uint8Array<ArrayBuffer> } {
  const request = admitted(value);
  const { glb, ...options } = request;
  const requestId = randomUUID();
  return {
    request,
    requestId,
    inputGlbSha256: hash(glb),
    bytes: serialize(
      {
        version: 'kiln.hosted-render.request.v1',
        requestId,
        glbBase64: Buffer.from(glb).toString('base64'),
        options,
      },
      RENDER_LIMITS.requestBytes,
    ),
  };
}
/** Validated before renderer import, GPU initialization or image decoding in the child VM. */
export function decodeRenderRequest(bytes: Uint8Array): RenderInput {
  const value = json(bytes, RENDER_LIMITS.requestBytes);
  keys(value, ['version', 'requestId', 'glbBase64', 'options']);
  if (
    value.version !== 'kiln.hosted-render.request.v1' ||
    typeof value.requestId !== 'string' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value.requestId)
  )
    throw fail();
  const options = object(value.options);
  if (Object.hasOwn(options, 'glb')) throw fail();
  const glb = base64(value.glbBase64, RENDER_LIMITS.glbBytes);
  return {
    requestId: value.requestId,
    inputGlbSha256: hash(glb),
    request: admitted({ ...options, glb }),
  };
}
interface RenderOutput {
  rendererId: string;
  backend: string;
  software: boolean;
  views: Uint8Array[];
  beauty?: Uint8Array;
  cameras?: PbrRenderResult['cameras'];
  width?: number;
  height?: number;
  lightingPresetId?: string;
}
/** No rendering or degradation here; the one-shot producer supplies only rendered bytes. */
export function encodeRenderResult(
  input: RenderInput,
  output: RenderOutput,
): Uint8Array<ArrayBuffer> {
  const value = {
    version: 'kiln.hosted-render.result.v1',
    requestId: input.requestId,
    inputGlbSha256: input.inputGlbSha256,
    rendererId: output.rendererId,
    backend: output.backend,
    software: output.software,
    viewsBase64: output.views.map((bytes) => Buffer.from(bytes).toString('base64')),
    ...(output.beauty ? { beautyBase64: Buffer.from(output.beauty).toString('base64') } : {}),
    ...(output.cameras
      ? {
          cameras: output.cameras,
          width: output.width,
          height: output.height,
          lightingPresetId: output.lightingPresetId,
        }
      : {}),
  };
  const bytes = serialize(value, RENDER_LIMITS.responseBytes);
  decodeRenderResult(bytes, input);
  return bytes;
}
export function decodeRenderResult(bytes: Uint8Array, input: RenderInput): PbrRenderResult {
  const value = json(bytes, RENDER_LIMITS.responseBytes);
  keys(value, [
    'version',
    'requestId',
    'inputGlbSha256',
    'rendererId',
    'backend',
    'software',
    'viewsBase64',
    'beautyBase64',
    'cameras',
    'width',
    'height',
    'lightingPresetId',
  ]);
  if (
    value.version !== 'kiln.hosted-render.result.v1' ||
    value.requestId !== input.requestId ||
    value.inputGlbSha256 !== input.inputGlbSha256 ||
    value.software !== true ||
    value.backend !== 'vulkan' ||
    typeof value.rendererId !== 'string' ||
    !value.rendererId.trim() ||
    value.rendererId.length > 512 ||
    [...value.rendererId].some(
      (character) => character.charCodeAt(0) < 32 || character === '\u007f',
    )
  )
    throw fail();
  const expected = input.request.cameras?.length ?? input.request.viewDirs!.length;
  if (!Array.isArray(value.viewsBase64) || value.viewsBase64.length !== expected) throw fail();
  const viewsPng = value.viewsBase64.map((value) => base64(value, RENDER_LIMITS.pngBytes));
  const beautyPng =
    value.beautyBase64 === undefined
      ? undefined
      : base64(value.beautyBase64, RENDER_LIMITS.pngBytes);
  if (Boolean(beautyPng) !== Boolean(input.request.beautySize)) throw fail();
  if (
    viewsPng.reduce((sum, png) => sum + png.byteLength, beautyPng?.byteLength ?? 0) >
    RENDER_LIMITS.pngBytes
  )
    throw fail();
  const result: PbrRenderResult = {
    ok: true,
    rendererId: value.rendererId,
    backend: 'vulkan',
    viewsPng,
    derivativeFidelity: { materialFaithful: true, inputGlbSha256: input.inputGlbSha256 },
    ...(beautyPng ? { beautyPng } : {}),
  };
  if (input.request.cameras) {
    const validated = validatePbrRenderRequest({
      glb: input.request.glb,
      cameras: value.cameras,
      width: value.width,
      height: value.height,
      lightingPresetId: value.lightingPresetId,
    });
    if (
      !validated.cameras ||
      JSON.stringify(validated.cameras) !== JSON.stringify(input.request.cameras) ||
      validated.width !== input.request.width ||
      validated.height !== input.request.height ||
      validated.lightingPresetId !== (input.request.lightingPresetId ?? 'review-neutral-v1')
    )
      throw fail();
    Object.assign(result, {
      cameras: validated.cameras,
      width: validated.width,
      height: validated.height,
      lightingPresetId: validated.lightingPresetId,
    });
  } else if (
    ['cameras', 'width', 'height', 'lightingPresetId'].some((key) => Object.hasOwn(value, key))
  )
    throw fail();
  return result;
}
export function createNativeRenderPort(
  options: { fetch?: (request: Request) => Promise<Response> } = {},
): PbrRenderPort {
  return async (request, execution) => {
    try {
      execution?.signal?.throwIfAborted();
      const input = encodeRenderRequest(request);
      const client = new NativeHttpClient(
        { fetch: options.fetch, signal: () => execution?.signal, timeoutMs: 60_000 },
        'Renderer',
        'renderer',
      );
      const bytes = await client.bytes('/render', {
        method: 'POST',
        body: input.bytes,
        headers: {
          'content-type': 'application/json',
          'x-kiln-deadline-ms': String(RENDER_LIMITS.deadlineMs),
          'x-kiln-max-response-bytes': String(RENDER_LIMITS.responseBytes),
        },
        limit: RENDER_LIMITS.responseBytes,
      });
      return decodeRenderResult(bytes, input);
    } catch {
      // The engine owns PNG validation, deadline policy and CPU degradation.
      return {
        ok: false,
        rendererId: 'unavailable',
        error: 'Hosted software rendering is unavailable',
      };
    }
  };
}
