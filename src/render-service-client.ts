/** HTTP transport and verified renderer identity. CPU degradation belongs to views/port. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  compatibilityFingerprint,
  RENDER_SERVICE_DEPENDENCIES,
  RENDER_SERVICE_PROTOCOL,
  REQUIRED_RENDER_CAPABILITIES,
} from '../render-service/src/build-identity.mjs';
import { fingerprintSourceDir } from '../render-service/src/instance.mjs';
import type { PbrRenderPort, PbrRenderResult } from './composer/render-port';
import { DEFAULT_BACKDROP_ID } from './views/background';

export interface RenderServiceInstance {
  version: 'kiln.render-service-instance.v2';
  pid: number;
  /** Provenance only. Its exit never authorizes stopping a shared renderer. */
  ownerPid: number | null;
  startedAt: string;
  sourceDir: string;
  sourceFingerprint: string;
  mode: 'managed' | 'manual';
  idleTimeoutMs: number | null;
}
export interface RenderServiceHealth {
  ok: true;
  authRequired: boolean;
  protocol: typeof RENDER_SERVICE_PROTOCOL;
  rendererId: string;
  instance: RenderServiceInstance;
  capabilities: string[];
  compatibility: {
    version: 'kiln.render-service-build.v1';
    sourceFingerprint: string;
    dependencies: Record<string, string>;
    fingerprint: string;
  };
  captureIdentity: {
    version: 'kiln.capture-producer.v1';
    fingerprint: string;
    instanceId: string;
  };
}
export type RenderHealthProbe =
  | { kind: 'absent' }
  | { kind: 'unknown'; reason: string }
  | { kind: 'foreign' }
  | { kind: 'incompatible'; reason: string }
  | { kind: 'service'; health: RenderServiceHealth };
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const pid = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function packagedRendererSourceFingerprint(): string | undefined {
  const source = fileURLToPath(new URL('../render-service/src/', import.meta.url));
  return existsSync(source) ? fingerprintSourceDir(source) : undefined;
}

/** No inferred defaults: every field needed for adoption is attested by the producer. */
export function validateRenderServiceHealth(value: unknown): RenderHealthProbe {
  if (!value || typeof value !== 'object') return { kind: 'foreign' };
  const raw = value as Partial<RenderServiceHealth>;
  if (raw.ok !== true || !nonempty(raw.rendererId)) return { kind: 'foreign' };
  const bad = (reason: string): RenderHealthProbe => ({ kind: 'incompatible', reason });
  if (raw.protocol !== RENDER_SERVICE_PROTOCOL)
    return bad(`renderer protocol must be ${RENDER_SERVICE_PROTOCOL}`);
  if (typeof raw.authRequired !== 'boolean')
    return bad('renderer authentication policy is missing or invalid');
  const instance = raw.instance;
  if (
    instance?.version !== 'kiln.render-service-instance.v2' ||
    !pid(instance.pid) ||
    !(instance.ownerPid === null || pid(instance.ownerPid)) ||
    !nonempty(instance.startedAt) ||
    !Number.isFinite(Date.parse(instance.startedAt)) ||
    !nonempty(instance.sourceDir) ||
    !digest(instance.sourceFingerprint) ||
    !(
      (instance.mode === 'manual' && instance.idleTimeoutMs === null) ||
      (instance.mode === 'managed' &&
        typeof instance.idleTimeoutMs === 'number' &&
        Number.isSafeInteger(instance.idleTimeoutMs) &&
        instance.idleTimeoutMs > 0)
    )
  )
    return bad('renderer instance identity is missing or invalid');
  if (
    !Array.isArray(raw.capabilities) ||
    !REQUIRED_RENDER_CAPABILITIES.every((name) => raw.capabilities!.includes(name))
  )
    return bad('renderer required capabilities are missing');
  const build = raw.compatibility;
  if (
    build?.version !== 'kiln.render-service-build.v1' ||
    !digest(build.sourceFingerprint) ||
    !digest(build.fingerprint) ||
    build.sourceFingerprint !== instance.sourceFingerprint
  )
    return bad('renderer build identity is missing or inconsistent');
  for (const [name, expected] of Object.entries(RENDER_SERVICE_DEPENDENCIES))
    if (build.dependencies?.[name] !== expected)
      return bad(
        `renderer dependency ${name} must be ${expected}; reported ${build.dependencies?.[name] ?? 'unknown'}`,
      );
  if (build.fingerprint !== compatibilityFingerprint(build))
    return bad('renderer build fingerprint is invalid');
  const capture = raw.captureIdentity;
  if (
    capture?.version !== 'kiln.capture-producer.v1' ||
    !digest(capture.fingerprint) ||
    !nonempty(capture.instanceId)
  )
    return bad('renderer capture identity is missing or invalid');
  return { kind: 'service', health: raw as RenderServiceHealth };
}

export async function readRenderServiceHealth(
  url: string,
  options: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<RenderHealthProbe> {
  try {
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 1_500);
    const response = await fetch(new URL('/health', url), {
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
      cache: 'no-store',
      redirect: 'error',
      ...(options.token ? { headers: { 'x-render-token': options.token } } : {}),
    });
    if (!response.ok) return { kind: 'unknown', reason: `health returned HTTP ${response.status}` };
    return validateRenderServiceHealth(await response.json());
  } catch (error) {
    if ((error as Error)?.name === 'SyntaxError') return { kind: 'foreign' };
    const detail = error as { code?: string; cause?: { code?: string }; name?: string };
    if (
      detail.code === 'ECONNREFUSED' ||
      detail.code === 'ConnectionRefused' ||
      detail.cause?.code === 'ECONNREFUSED'
    )
      return { kind: 'absent' };
    return {
      kind: 'unknown',
      reason:
        detail.name === 'TimeoutError'
          ? 'health timed out; renderer identity is unknown'
          : 'health could not be verified',
    };
  }
}

async function verifiedHealth(
  url: string,
  token?: string,
  sourceFingerprint = packagedRendererSourceFingerprint(),
  signal?: AbortSignal,
): Promise<RenderServiceHealth> {
  const probe = await readRenderServiceHealth(url, { token, signal });
  signal?.throwIfAborted();
  if (probe.kind !== 'service')
    throw new Error(
      `render service ${url} is ${probe.kind}${'reason' in probe ? `: ${probe.reason}` : ''}`,
    );
  if (!sourceFingerprint || probe.health.compatibility.sourceFingerprint !== sourceFingerprint)
    throw new Error(
      `render service ${url} runs incompatible source; install the same Kiln build on both hosts`,
    );
  if (probe.health.authRequired && !token)
    throw new Error(
      `render service ${url} requires authentication; configure KILN_RENDER_TOKEN with the renderer's matching token. A listening service does not establish client access.`,
    );
  return probe.health;
}

/** Fresh identity prevents capture reuse after service restart or dependency changes. */
export async function probeCaptureIdentity(
  url: string,
  token?: string,
  sourceFingerprint?: string,
): Promise<string | undefined> {
  try {
    const health = await verifiedHealth(url, token, sourceFingerprint);
    return JSON.stringify([
      health.captureIdentity.version,
      health.captureIdentity.fingerprint,
      health.captureIdentity.instanceId,
      health.rendererId,
      health.compatibility.fingerprint,
    ]);
  } catch {
    return undefined;
  }
}

export async function probeRenderService(url: string): Promise<string | undefined> {
  try {
    return (await verifiedHealth(url)).rendererId;
  } catch {
    return undefined;
  }
}

/** The owner's signal covers both handshake and HTTP body read, without a second render deadline. */
export function makeRemoteRenderPort(
  url: string,
  token?: string,
  sourceFingerprint?: string,
): PbrRenderPort {
  return async (req, execution): Promise<PbrRenderResult> => {
    const health = await verifiedHealth(url, token, sourceFingerprint, execution?.signal);
    execution?.signal?.throwIfAborted();
    const inputGlbSha256 = `sha256:${createHash('sha256').update(req.glb).digest('hex')}` as const;
    const body = {
      glb_base64: Buffer.from(req.glb).toString('base64'),
      input_glb_sha256: inputGlbSha256,
      ...(req.cameras
        ? {
            cameras: req.cameras,
            width: req.width,
            height: req.height,
            ...(req.lightingPresetId ? { lighting_preset_id: req.lightingPresetId } : {}),
          }
        : {}),
      ...(req.viewDirs ? { views: req.viewDirs } : {}),
      backdrop: req.backdrop ?? DEFAULT_BACKDROP_ID,
      ...(req.size !== undefined ? { size: req.size } : {}),
      ...(req.beautySize !== undefined ? { beauty_size: req.beautySize } : {}),
    };
    const response = await fetch(new URL('/render', url), {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-render-token': token } : {}),
      },
      body: JSON.stringify(body),
      signal: execution?.signal,
    });
    if (response.status === 401)
      throw new Error(
        "render service rejected client authentication (HTTP 401); configure KILN_RENDER_TOKEN with the renderer's matching token",
      );
    if (!response.ok) throw new Error(`render service returned ${response.status}`);
    const json = (await response.json()) as {
      ok?: boolean;
      rendererId?: string;
      views?: string[];
      beauty?: string;
      error?: string;
      cameras?: PbrRenderResult['cameras'];
      width?: number;
      height?: number;
      fidelity?: {
        version?: string;
        producer?: string;
        materialFaithful?: boolean;
        delivered?: string;
        degraded?: boolean;
        inputGlbSha256?: string;
        rendererId?: string;
      };
    };
    if (!json.ok) throw new Error(json.error ?? 'render service reported failure');
    if (json.rendererId !== health.rendererId)
      throw new Error('render service producer changed after health verification');
    // rendererId names the implementation, not the running process. A replacement can
    // have the same rendererId while invalidating the capture/cache instance attestation.
    const after = await verifiedHealth(url, token, sourceFingerprint, execution?.signal);
    if (
      after.captureIdentity.instanceId !== health.captureIdentity.instanceId ||
      after.captureIdentity.fingerprint !== health.captureIdentity.fingerprint ||
      after.compatibility.fingerprint !== health.compatibility.fingerprint ||
      after.rendererId !== health.rendererId
    )
      throw new Error('render service instance changed during capture');
    return {
      ok: true,
      rendererId: health.rendererId,
      ...(json.cameras ? { cameras: json.cameras, width: json.width, height: json.height } : {}),
      ...(json.fidelity?.version === 'kiln.render-fidelity.v1' &&
      json.fidelity.producer === 'kiln-render-service' &&
      json.fidelity.materialFaithful === true &&
      json.fidelity.delivered === 'full-material' &&
      json.fidelity.degraded === false &&
      json.fidelity.inputGlbSha256 === inputGlbSha256 &&
      json.fidelity.rendererId === json.rendererId
        ? { derivativeFidelity: { materialFaithful: true as const, inputGlbSha256 } }
        : {}),
      ...(json.views
        ? { viewsPng: json.views.map((b64) => new Uint8Array(Buffer.from(b64, 'base64'))) }
        : {}),
      ...(json.beauty ? { beautyPng: new Uint8Array(Buffer.from(json.beauty, 'base64')) } : {}),
    };
  };
}
