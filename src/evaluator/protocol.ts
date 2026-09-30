import { authoringDiagnosticAdvice, type AuthoringDiagnostic } from './authoring-diagnostic';
import { createHash } from 'node:crypto';
import {
  assertNoLegacyRuntimePolicy,
  validateRequirementsBinding,
  validateRequirementsContext,
  resolveRequirementsContext,
  requirementsContextsEqual,
  type RequirementsContext,
} from '../requirements-context';
import type { AssetQaReport } from '../qa/types';
import { validateRequirementsQaReport } from '../qa/requirements-report';
import type { RenderGlbOptions, RenderResult } from '../render';
import type { KhronosGltfValidationReport } from '../qa/gltf';
import {
  validateMaterialLibraryPayload,
  validateMaterialManifestIdentity,
} from '../material-library-node';
import type { MaterialLibraryPayloadV1 } from '../material-library';
import { rebuildOptionsSchema } from '../rebuild-options';

export const EVALUATOR_REQUEST_VERSION = 'kiln.evaluator.request.v2' as const;
export const EVALUATOR_RESULT_VERSION = 'kiln.evaluator.result.v2' as const;
export const MAX_EVALUATOR_CODE_BYTES = 512 * 1024;
/** Includes bounded, host-approved PNG payloads; non-resource request data stays at 1 MiB. */
export const MAX_EVALUATOR_REQUEST_BYTES = 24 * 1024 * 1024;
export const DEFAULT_EVALUATOR_DEADLINE_MS = 60_000;
export const DEFAULT_EVALUATOR_MAX_GLB_BYTES = 16 * 1024 * 1024;
export const DEFAULT_EVALUATOR_MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export type EvaluatorOutcomeCode =
  | 'INPUT_INVALID'
  | 'EXECUTION_REJECTED'
  | 'QA_BLOCKED'
  | 'DEADLINE_EXCEEDED'
  | 'CANCELLED'
  | 'OUTPUT_LIMIT_EXCEEDED'
  | 'ISOLATION_UNAVAILABLE'
  | 'WORKER_FAILED'
  | 'PROTOCOL_ERROR';

const EVALUATOR_OUTCOME_MESSAGES: Record<EvaluatorOutcomeCode, string> = {
  INPUT_INVALID:
    'Evaluator request was invalid. Use kiln.evaluator.request.v2 and update the host and worker together. Retired category/intent options require explicit requirements migration; see docs/migration.md.',
  EXECUTION_REJECTED: 'Generated asset execution was rejected.',
  QA_BLOCKED: 'Generated asset did not pass quality checks.',
  DEADLINE_EXCEEDED: 'Evaluator deadline exceeded.',
  CANCELLED: 'Evaluator request was cancelled.',
  OUTPUT_LIMIT_EXCEEDED: 'Evaluator output limit exceeded.',
  ISOLATION_UNAVAILABLE: 'Isolated evaluator is unavailable.',
  WORKER_FAILED: 'Evaluator worker failed.',
  PROTOCOL_ERROR: 'Evaluator returned invalid data.',
};

export function evaluatorOutcomeMessage(code: EvaluatorOutcomeCode): string {
  return EVALUATOR_OUTCOME_MESSAGES[code];
}

export interface EvaluatorRequestV2 {
  version: typeof EVALUATOR_REQUEST_VERSION;
  requestId: string;
  operation: 'execute-export-glb';
  code: string;
  options: Omit<RenderGlbOptions, 'textureResolver' | 'diagnosticConsole'>;
  limits: { maxGlbBytes: number };
}

export interface CreateEvaluatorRequestV2Input {
  requestId: string;
  code: string;
  options?: RenderGlbOptions;
  maxGlbBytes?: number;
}

export interface EvaluatorTransportControlsV2 {
  deadlineMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal;
}

export type EvaluatorTransportV2 = (
  requestJson: string,
  controls: Readonly<EvaluatorTransportControlsV2>,
) => Promise<string>;

export interface EvaluatorPortCallControlsV2 {
  deadlineMs?: number;
  maxGlbBytes?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
}

export interface EvaluatorPortV2 {
  render(
    code: string,
    options?: RenderGlbOptions,
    controls?: EvaluatorPortCallControlsV2,
  ): Promise<RenderResult>;
}

export type EvaluatorExecutionProfileV2 = 'trusted-local' | 'evaluator-required';

export function resolveEvaluatorPortV2(
  port: EvaluatorPortV2 | undefined,
  profile: EvaluatorExecutionProfileV2,
): EvaluatorPortV2 {
  if (port) return port;
  if (profile === 'evaluator-required') {
    throw new EvaluatorPortError('ISOLATION_UNAVAILABLE', 'Evaluator port is required.');
  }
  return trustedInProcessEvaluatorPortV2;
}

export class EvaluatorPortError extends Error {
  constructor(
    readonly code: EvaluatorOutcomeCode,
    message = evaluatorOutcomeMessage(code),
    readonly diagnostic?: AuthoringDiagnostic,
  ) {
    super(diagnostic ? `${message} ${authoringDiagnosticAdvice(diagnostic)}` : message);
    this.name = 'EvaluatorPortError';
  }
}

interface WireDiagnosticView {
  [key: string]: unknown;
  pngBase64: string;
}

interface WireRenderResult extends Omit<RenderResult, 'glb' | 'diagnosticViews'> {
  glbBase64: string;
  diagnosticViews?: WireDiagnosticView[];
}

export type EvaluatorResultV2 =
  | {
      version: typeof EVALUATOR_RESULT_VERSION;
      requestId: string;
      ok: true;
      render: RenderResult;
    }
  | {
      version: typeof EVALUATOR_RESULT_VERSION;
      requestId: string;
      ok: false;
      error: {
        code: EvaluatorOutcomeCode;
        message: string;
        diagnostic?: AuthoringDiagnostic;
        qa?: {
          report: AssetQaReport;
          stage: 'scene' | 'final-glb';
          gltfValidation?: KhronosGltfValidationReport;
        };
      };
    };

export type WireEvaluatorResultV2 =
  | (Omit<Extract<EvaluatorResultV2, { ok: true }>, 'render'> & { render: WireRenderResult })
  | Extract<EvaluatorResultV2, { ok: false }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function fail(kind: 'request' | 'result'): never {
  throw new Error(`invalid evaluator ${kind}`);
}

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function validInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}

function validRequirementsQaReport(value: unknown): boolean {
  try {
    validateRequirementsQaReport(value);
    return true;
  } catch {
    return false;
  }
}

function validGltfValidation(value: unknown): value is KhronosGltfValidationReport {
  const issues = isRecord(value) && isRecord(value.issues) ? value.issues : undefined;
  if (!issues || !Array.isArray(issues.messages)) {
    return false;
  }
  return (
    ['numErrors', 'numWarnings', 'numInfos', 'numHints'].every((key) =>
      validInteger(issues[key], 0, Number.MAX_SAFE_INTEGER),
    ) &&
    issues.messages.length <= 1_000 &&
    issues.messages.every(
      (issue) =>
        isRecord(issue) &&
        typeof issue.code === 'string' &&
        typeof issue.message === 'string' &&
        typeof issue.severity === 'number' &&
        Number.isFinite(issue.severity),
    )
  );
}

function boundedControl(value: number | undefined, fallback: number, max: number): number {
  const resolved = value ?? fallback;
  if (!validInteger(resolved, 1, max)) {
    throw new EvaluatorPortError('INPUT_INVALID');
  }
  return resolved;
}

export function createEvaluatorRequestV2(input: CreateEvaluatorRequestV2Input): {
  request: EvaluatorRequestV2;
  json: string;
} {
  if (input.options?.textureResolver) {
    throw new EvaluatorPortError(
      'INPUT_INVALID',
      'Evaluator requests do not accept a host resolver capability.',
    );
  }
  if (input.options?.diagnosticConsole) {
    throw new EvaluatorPortError(
      'INPUT_INVALID',
      'Evaluator requests do not accept a host console capability.',
    );
  }
  const maxGlbBytes = boundedControl(
    input.maxGlbBytes,
    DEFAULT_EVALUATOR_MAX_GLB_BYTES,
    64 * 1024 * 1024,
  );
  const { textureResolver: _, diagnosticConsole: _console, ...options } = input.options ?? {};
  const request: EvaluatorRequestV2 = {
    version: EVALUATOR_REQUEST_VERSION,
    requestId: input.requestId,
    operation: 'execute-export-glb',
    code: input.code,
    options,
    limits: { maxGlbBytes },
  };
  const json = JSON.stringify(request);
  // Reuse the strict decoder as the single authority for ids, source, options,
  // prototype-key rejection, and request budgets.
  const decoded = decodeEvaluatorRequestV2(json);
  return { request: decoded, json };
}

function parseOptions(
  value: unknown,
): Omit<RenderGlbOptions, 'textureResolver' | 'diagnosticConsole'> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'optimize',
      'instance',
      'intent',
      'category',
      'requirements',
      'geometryPolicy',
      'gltfExporter',
      'materialResources',
    ])
  ) {
    return fail('request');
  }
  const options: Omit<RenderGlbOptions, 'textureResolver' | 'diagnosticConsole'> = {};
  if (value.materialResources !== undefined)
    options.materialResources = validateMaterialLibraryPayload(value.materialResources);
  if (value.gltfExporter !== undefined) {
    if (value.gltfExporter !== 'legacy' && value.gltfExporter !== 'three') fail('request');
    options.gltfExporter = value.gltfExporter;
  }
  if (value.geometryPolicy !== undefined) {
    if (!['warn', 'strict'].includes(String(value.geometryPolicy))) fail('request');
    options.geometryPolicy = value.geometryPolicy as 'warn' | 'strict';
  }
  if (value.optimize !== undefined) {
    if (!['off', 'auto', 'palette', 'full'].includes(String(value.optimize))) fail('request');
    options.optimize = value.optimize as NonNullable<RenderGlbOptions['optimize']>;
  }
  if (value.instance !== undefined) {
    if (!['off', 'auto', 'on'].includes(String(value.instance))) fail('request');
    options.instance = value.instance as NonNullable<RenderGlbOptions['instance']>;
  }
  assertNoLegacyRuntimePolicy(value);
  if (value.requirements !== undefined)
    options.requirements = validateRequirementsBinding(value.requirements);
  return options;
}

export function decodeEvaluatorRequestV2(json: string): EvaluatorRequestV2 {
  if (Buffer.byteLength(json, 'utf8') > MAX_EVALUATOR_REQUEST_BYTES) fail('request');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return fail('request');
  }
  if (isRecord(value) && isRecord(value.options)) {
    const { materialResources: _, ...metadataOptions } = value.options;
    if (
      Buffer.byteLength(JSON.stringify({ ...value, options: metadataOptions }), 'utf8') >
      1024 * 1024
    )
      return fail('request');
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['version', 'requestId', 'operation', 'code', 'options', 'limits']) ||
    value.version !== EVALUATOR_REQUEST_VERSION ||
    !validRequestId(value.requestId) ||
    value.operation !== 'execute-export-glb' ||
    typeof value.code !== 'string' ||
    Buffer.byteLength(value.code, 'utf8') > MAX_EVALUATOR_CODE_BYTES ||
    !isRecord(value.limits) ||
    !hasExactKeys(value.limits, ['maxGlbBytes']) ||
    !validInteger(value.limits.maxGlbBytes, 1, 64 * 1024 * 1024)
  ) {
    return fail('request');
  }
  return {
    version: EVALUATOR_REQUEST_VERSION,
    requestId: value.requestId,
    operation: 'execute-export-glb',
    code: value.code,
    options: parseOptions(value.options),
    limits: { maxGlbBytes: value.limits.maxGlbBytes },
  };
}

export function encodeRenderResultV2(
  requestId: string,
  render: RenderResult,
): WireEvaluatorResultV2 {
  const { glb, diagnosticViews, buildCache: _hostCacheReceipt, ...rest } = render;
  return {
    version: EVALUATOR_RESULT_VERSION,
    requestId,
    ok: true,
    render: {
      ...rest,
      glbBase64: glb.toString('base64'),
      ...(diagnosticViews
        ? {
            diagnosticViews: diagnosticViews.map(({ png, ...view }) => ({
              ...view,
              pngBase64: Buffer.from(png).toString('base64'),
            })),
          }
        : {}),
    },
  };
}

function isSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function decodeEvaluatorResultV2(
  json: string,
  maxGlbBytes: number,
  expectedRequestId?: string,
): EvaluatorResultV2 {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return fail('result');
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['version', 'requestId', 'ok', 'render', 'error']) ||
    value.version !== EVALUATOR_RESULT_VERSION ||
    !validRequestId(value.requestId) ||
    typeof value.ok !== 'boolean'
  ) {
    return fail('result');
  }
  if (expectedRequestId !== undefined && value.requestId !== expectedRequestId) fail('result');
  if (!value.ok) {
    if (value.render !== undefined) return fail('result');
    if (
      !isRecord(value.error) ||
      !hasExactKeys(value.error, ['code', 'message', 'qa', 'diagnostic'])
    ) {
      return fail('result');
    }
    const codes: EvaluatorOutcomeCode[] = [
      'INPUT_INVALID',
      'EXECUTION_REJECTED',
      'QA_BLOCKED',
      'DEADLINE_EXCEEDED',
      'CANCELLED',
      'OUTPUT_LIMIT_EXCEEDED',
      'ISOLATION_UNAVAILABLE',
      'WORKER_FAILED',
      'PROTOCOL_ERROR',
    ];
    if (
      !codes.includes(value.error.code as EvaluatorOutcomeCode) ||
      typeof value.error.message !== 'string' ||
      value.error.message !== evaluatorOutcomeMessage(value.error.code as EvaluatorOutcomeCode)
    ) {
      return fail('result');
    }
    if (
      value.error.diagnostic !== undefined &&
      (value.error.code !== 'EXECUTION_REJECTED' ||
        (value.error.diagnostic !== 'UNBOUND_VARIABLE' &&
          value.error.diagnostic !== 'GEAR_RADII_ORDER' &&
          value.error.diagnostic !== 'ROUNDED_BOX_RADIUS' &&
          value.error.diagnostic !== 'PROCEDURAL_TEXTURE_UNKNOWN_KEY' &&
          value.error.diagnostic !== 'PROCEDURAL_TEXTURE_BLEND' &&
          value.error.diagnostic !== 'MATERIAL_FRACTION_RANGE' &&
          value.error.diagnostic !== 'MATERIAL_RECIPE_TEXTURE_BINDING' &&
          value.error.diagnostic !== 'PORTABLE_TEXTURE_REFERENCE' &&
          value.error.diagnostic !== 'PORTABLE_COLOR_ARGUMENT' &&
          value.error.diagnostic !== 'PARAMETRIC_PERIODIC_ENDPOINT' &&
          value.error.diagnostic !== 'PROFILE_HOLES_UNSUPPORTED' &&
          value.error.diagnostic !== 'PROFILE_BEVEL_COLLAPSE' &&
          value.error.diagnostic !== 'PROFILE_CORRESPONDENCE_COLLAPSE' &&
          value.error.diagnostic !== 'REMOVED_HELPER' &&
          value.error.diagnostic !== 'TUBE_RADIUS' &&
          value.error.diagnostic !== 'TAPER_CONE_AXIS' &&
          value.error.diagnostic !== 'SOLID_FLOAT32_COLLAPSE' &&
          value.error.diagnostic !== 'MESH_DATA_NONFINITE' &&
          value.error.diagnostic !== 'MATERIAL_ALPHA_MODE' &&
          value.error.diagnostic !== 'MATERIAL_COLOR_ARGUMENT' &&
          value.error.diagnostic !== 'PART_NAME_ARGUMENT' &&
          value.error.diagnostic !== 'PART_GEOMETRY_ARGUMENT' &&
          value.error.diagnostic !== 'PART_MATERIAL_ARGUMENT' &&
          value.error.diagnostic !== 'MATERIAL_PACKED_CHANNELS' &&
          value.error.diagnostic !== 'UNINITIALIZED_BINDING' &&
          value.error.diagnostic !== 'BUILD_RESULT' &&
          value.error.diagnostic !== 'MATERIAL_RECIPE_OVERRIDE' &&
          value.error.diagnostic !== 'PROGRAM_TYPE_ERROR' &&
          value.error.diagnostic !== 'PROGRAM_RANGE_ERROR'))
    )
      return fail('result');
    if (value.error.qa !== undefined) {
      if (
        value.error.code !== 'QA_BLOCKED' ||
        !isRecord(value.error.qa) ||
        !hasExactKeys(value.error.qa, ['report', 'stage', 'gltfValidation']) ||
        !validRequirementsQaReport(value.error.qa.report) ||
        !['scene', 'final-glb'].includes(String(value.error.qa.stage)) ||
        (value.error.qa.gltfValidation !== undefined &&
          !validGltfValidation(value.error.qa.gltfValidation))
      ) {
        return fail('result');
      }
    } else if (value.error.code === 'QA_BLOCKED') {
      return fail('result');
    }
    return value as unknown as Extract<EvaluatorResultV2, { ok: false }>;
  }
  if (value.error !== undefined || !isRecord(value.render)) fail('result');
  const renderKeys = [
    'glbBase64',
    'artifactGlbSha256',
    'tris',
    'meta',
    'warnings',
    'diagnosticViews',
    'materialMetrics',
    'materialRecipeApplications',
    'materialResourceProvenance',
    'materialLibraryDependencies',
    'bakedTextures',
    'integrationManifest',
    'requirements',
    'rebuildOptions',
  ] as const;
  if (
    !hasExactKeys(value.render, renderKeys) ||
    typeof value.render.glbBase64 !== 'string' ||
    !validInteger(value.render.tris, 0, Number.MAX_SAFE_INTEGER) ||
    !isRecord(value.render.meta) ||
    !Array.isArray(value.render.warnings) ||
    !value.render.warnings.every((warning) => typeof warning === 'string') ||
    !isRecord(value.render.integrationManifest)
  ) {
    fail('result');
  }
  let requirements: RequirementsContext;
  if (
    value.render.rebuildOptions !== undefined &&
    !rebuildOptionsSchema.strict().safeParse(value.render.rebuildOptions).success
  )
    fail('result');
  if (value.render.materialLibraryDependencies !== undefined) {
    if (
      !Array.isArray(value.render.materialLibraryDependencies) ||
      value.render.materialLibraryDependencies.length > 16
    )
      fail('result');
    try {
      for (const manifest of value.render.materialLibraryDependencies)
        validateMaterialManifestIdentity(manifest);
    } catch {
      return fail('result');
    }
  }
  try {
    requirements = validateRequirementsContext(value.render.requirements);
    validateRequirementsQaReport(value.render.meta.qaReport, requirements);
  } catch {
    return fail('result');
  }
  const glb = Buffer.from(value.render.glbBase64, 'base64');
  if (glb.byteLength > maxGlbBytes || glb.toString('base64') !== value.render.glbBase64)
    fail('result');
  if (!isSha256(value.render.artifactGlbSha256)) fail('result');
  const actualHash = `sha256:${createHash('sha256').update(glb).digest('hex')}`;
  if (actualHash !== value.render.artifactGlbSha256) fail('result');
  const diagnosticViews = value.render.diagnosticViews;
  if (diagnosticViews !== undefined && !Array.isArray(diagnosticViews)) fail('result');
  const decodedViews = diagnosticViews?.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.pngBase64 !== 'string') return fail('result');
    const png = Buffer.from(candidate.pngBase64, 'base64');
    if (png.toString('base64') !== candidate.pngBase64) return fail('result');
    const { pngBase64: _, ...view } = candidate;
    return { ...view, png };
  });
  const { glbBase64: _, diagnosticViews: __, ...rest } = value.render;
  return {
    version: EVALUATOR_RESULT_VERSION,
    requestId: value.requestId,
    ok: true,
    render: {
      ...rest,
      glb,
      ...(decodedViews ? { diagnosticViews: decodedViews } : {}),
    } as unknown as RenderResult,
  };
}

export function createEvaluatorPortV2(
  transport: EvaluatorTransportV2,
  defaults: EvaluatorPortCallControlsV2 = {},
): EvaluatorPortV2 {
  let sequence = 0;
  return {
    async render(code, options = {}, controls = {}) {
      const signal = controls.signal ?? defaults.signal;
      if (signal?.aborted) throw new EvaluatorPortError('CANCELLED');
      const deadlineMs = boundedControl(
        controls.deadlineMs ?? defaults.deadlineMs,
        DEFAULT_EVALUATOR_DEADLINE_MS,
        120_000,
      );
      const maxGlbBytes = boundedControl(
        controls.maxGlbBytes ?? defaults.maxGlbBytes,
        DEFAULT_EVALUATOR_MAX_GLB_BYTES,
        64 * 1024 * 1024,
      );
      const maxResponseBytes = boundedControl(
        controls.maxResponseBytes ?? defaults.maxResponseBytes,
        DEFAULT_EVALUATOR_MAX_RESPONSE_BYTES,
        96 * 1024 * 1024,
      );
      const requestId = `eval-${++sequence}`;
      const built = createEvaluatorRequestV2({ requestId, code, options, maxGlbBytes });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let response: string;
      const transportController = new AbortController();
      let abort: (() => void) | undefined;
      try {
        const cancelled = new Promise<never>((_, reject) => {
          abort = () => {
            reject(new EvaluatorPortError('CANCELLED'));
            transportController.abort();
          };
          signal?.addEventListener('abort', abort, { once: true });
        });
        response = await Promise.race([
          transport(built.json, {
            deadlineMs,
            maxResponseBytes,
            signal: transportController.signal,
          }),
          cancelled,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new EvaluatorPortError('DEADLINE_EXCEEDED'));
              transportController.abort();
            }, deadlineMs);
          }),
        ]);
      } catch (error) {
        if (error instanceof EvaluatorPortError) throw error;
        throw new EvaluatorPortError('WORKER_FAILED');
      } finally {
        clearTimeout(timer);
        if (abort) signal?.removeEventListener('abort', abort);
      }
      if (signal?.aborted) throw new EvaluatorPortError('CANCELLED');
      if (typeof response !== 'string') throw new EvaluatorPortError('PROTOCOL_ERROR');
      if (Buffer.byteLength(response, 'utf8') > maxResponseBytes) {
        throw new EvaluatorPortError('OUTPUT_LIMIT_EXCEEDED');
      }
      let result: EvaluatorResultV2;
      try {
        result = decodeEvaluatorResultV2(response, maxGlbBytes, requestId);
      } catch {
        throw new EvaluatorPortError('PROTOCOL_ERROR');
      }
      assertEvaluatorResultRequirements(
        result,
        resolveRequirementsContext(built.request.options.requirements),
      );
      assertEvaluatorResultMaterialResources(result, built.request.options.materialResources);
      if (!result.ok) {
        if (result.error.code === 'QA_BLOCKED' && result.error.qa) {
          const { AssetQaBlockedError } = await import('../qa/run');
          throw new AssetQaBlockedError(
            result.error.qa.report,
            result.error.qa.stage,
            result.error.qa.gltfValidation,
          );
        }
        throw new EvaluatorPortError(result.error.code, undefined, result.error.diagnostic);
      }
      return result.render;
    },
  };
}

/** All transports bind decoded acceptance evidence to the same current-host snapshot. */
export function assertEvaluatorResultMaterialResources(
  result: EvaluatorResultV2,
  expected?: MaterialLibraryPayloadV1,
): void {
  if (!result.ok) return;
  const actual = result.render.materialLibraryDependencies ?? [];
  const wanted = expected?.records.map((record) => record.manifest.revisionId).sort() ?? [];
  if (
    JSON.stringify(actual.map((manifest) => manifest.revisionId).sort()) !== JSON.stringify(wanted)
  )
    throw new EvaluatorPortError('PROTOCOL_ERROR');
}

/** All transports bind decoded acceptance evidence to the same current-host snapshot. */
export function assertEvaluatorResultRequirements(
  result: EvaluatorResultV2,
  expected: RequirementsContext,
): void {
  try {
    if (result.ok) {
      if (!requirementsContextsEqual(result.render.requirements, expected))
        throw new Error('Requirements mismatch.');
    } else if (result.error.code === 'QA_BLOCKED' && result.error.qa) {
      validateRequirementsQaReport(result.error.qa.report, expected);
    }
  } catch {
    throw new EvaluatorPortError(
      'PROTOCOL_ERROR',
      'Evaluator requirements context differs from the host request.',
    );
  }
}

/** Explicit trusted/test compatibility port. Production hosts must inject a
 * transport-backed port and select `evaluator-required`; there is no fallback. */
export const trustedInProcessEvaluatorPortV2: EvaluatorPortV2 = {
  async render(code, options = {}, controls = {}) {
    if (controls.signal?.aborted) throw new EvaluatorPortError('CANCELLED');
    const { renderGLBInProcess } = await import('../render');
    const result = await renderGLBInProcess(code, options);
    if (controls.signal?.aborted) throw new EvaluatorPortError('CANCELLED');
    return result;
  },
};
