import { z } from 'zod';
import type { AssetLibrary } from '../assets';
import { validateAssetGlb } from '../assets';
import type { LiveOperation, LiveSnapshot } from '../live-review';
import type { RenderResult } from '../render';
import type { RequirementsBinding } from '../requirements-store';
import {
  createRequirementsCheckpoint,
  requirementsContextsEqual,
  resolveRequirementsContext,
  validateRequirementsContext,
} from '../requirements-context';
import { assertSavedRequirementsAuthorized } from '../requirements-assets';
import { programReference } from '../program-store';
import { BACKDROP_IDS } from '../views/background';
import { requireActionFields } from './actions';
import type { KilnToolDef } from './registry';
import { persistedPreviewFidelity } from './preview-fidelity';
import { DEFAULT_RESULT_LIMIT } from './review-detail';

export interface ReviewStore {
  snapshot(options?: { cursor?: string; projectId?: string }): Promise<LiveSnapshot>;
  get(operationId: string): Promise<LiveOperation>;
  pin(operationId: string, pinned: boolean): Promise<void>;
  readFile(operationId: string, name: string): Promise<Uint8Array>;
}
const operationId = z.string().regex(/^op_[a-f0-9-]{36}$/);
const assetId = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const REVIEW_ACTIONS = ['list', 'get', 'pin', 'save'] as const;
type ReviewAction = (typeof REVIEW_ACTIONS)[number];
const REQUIREMENTS: Record<ReviewAction, Parameters<typeof requireActionFields>[3]> = {
  list: { required: [] },
  get: { required: ['operationId'] },
  pin: { required: ['operationId', 'pinned'] },
  save: { required: ['operationId', 'expectedRevision', 'name'] },
};
/** One flat object; each field names the actions it serves. */
export const reviewToolInput = z.strictObject({
  action: z.enum(REVIEW_ACTIONS),
  projectId: assetId.optional().describe('list: only operations bound to this project.'),
  offset: z.number().int().min(0).optional().describe('list: page start; default 0.'),
  limit: z.number().int().min(1).max(100).optional().describe('list: page size; default 20.'),
  operationId: operationId.optional().describe('get, pin, save.'),
  pinned: z.boolean().optional().describe('pin: true keeps the operation past normal retention.'),
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('save: the revision the listing displayed.'),
  collection: assetId.optional().describe('save: destination collection; default project.'),
  name: z.string().min(1).max(200).optional().describe('save.'),
  assetId: assetId.optional().describe('save: revise this asset.'),
  parentRevision: assetId.optional().describe('save: the revision being revised.'),
  description: z.string().max(4000).optional().describe('save.'),
  tags: z.array(z.string().max(80)).max(30).optional().describe('save.'),
});
const DEFAULT_PAGE = 20;
/** Rule 7: a listing record is what a reader needs to pick an operation, not the operation. */
function summarizeOperation(operation: LiveOperation) {
  const fidelity =
    operation.viewFidelity && typeof operation.viewFidelity === 'object'
      ? (operation.viewFidelity as { delivered?: unknown; materialFaithful?: unknown })
      : undefined;
  return {
    operationId: operation.operationId,
    revision: operation.revision,
    tool: operation.tool,
    status: operation.status,
    startedAt: operation.startedAt,
    updatedAt: operation.updatedAt,
    ...(operation.projectId ? { projectId: operation.projectId } : {}),
    ...(operation.programRef ? { programRef: operation.programRef } : {}),
    pinned: operation.pinned,
    ...(operation.artifact ? { artifact: operation.artifact.sha256 } : {}),
    captures: operation.captures.length,
    ...(fidelity && fidelity.delivered !== undefined
      ? {
          viewFidelity: {
            delivered: fidelity.delivered,
            materialFaithful: fidelity.materialFaithful,
          },
        }
      : {}),
    ...(operation.error ? { error: operation.error.slice(0, 200) } : {}),
  };
}
/** One operation inside the default result size: the summary's heaviest parts go first. */
function boundOperation(operation: LiveOperation): LiveOperation & { omitted?: string[] } {
  let bounded: LiveOperation & { omitted?: string[] } = operation;
  const omitted: string[] = [];
  for (const key of ['warnings', 'qaReport', 'requirements'] as const) {
    if (JSON.stringify(bounded).length <= DEFAULT_RESULT_LIMIT) break;
    if (!bounded.result || bounded.result[key] === undefined) continue;
    const { [key]: _dropped, ...result } = bounded.result;
    omitted.push(`result.${key}`);
    bounded = { ...bounded, result, omitted: [...omitted] };
  }
  if (JSON.stringify(bounded).length > DEFAULT_RESULT_LIMIT) {
    omitted.push('phases');
    bounded = { ...bounded, phases: [], omitted: [...omitted] };
  }
  if (omitted.length)
    bounded.result = {
      ...bounded.result,
      retainedReport: `.kiln/review/${operation.operationId}/evaluation.json`,
    };
  return bounded;
}
export function createKilnReviewDef(context: {
  reviewStore: ReviewStore;
  assetLibrary?: AssetLibrary;
  requirements?: RequirementsBinding;
}): KilnToolDef {
  const store = context.reviewStore;
  return {
    name: 'kiln_review',
    description:
      'Read persisted Kiln observation history, pin an operation against normal retention, or save an exact completed reviewed operation into a collection without re-execution. Pinning does not pause an agent. save requires the displayed expectedRevision and matching trusted host requirements, preserves exact source/GLB/capture, and does not assert QA acceptance. Missing or evicted evidence is an error.',
    inputSchema: reviewToolInput,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async run(raw) {
      const input = reviewToolInput.parse(raw);
      requireActionFields('kiln_review', input.action, input, REQUIREMENTS[input.action]);
      if (input.action === 'list') {
        // Rule 7: one short record per operation, paged; `get` returns one in full.
        const snapshot = await store.snapshot({ projectId: input.projectId });
        const offset = input.offset ?? 0;
        const page = snapshot.operations.slice(offset, offset + (input.limit ?? DEFAULT_PAGE));
        const next = offset + page.length;
        return {
          ok: true,
          total: snapshot.operations.length,
          offset,
          nextOffset: next < snapshot.operations.length ? next : null,
          operations: page.map(summarizeOperation),
          cursor: snapshot.cursor,
          retention: snapshot.retention,
          ...(snapshot.observationIssues ? { observationIssues: snapshot.observationIssues } : {}),
        };
      }
      const read = async (id: string) => {
        try {
          return await store.get(id);
        } catch (error) {
          // Rule 9: an unknown or unreadable record names the listing call, not a path.
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT' || code === 'ENOTDIR' || /Invalid|Unsafe/u.test(String(error)))
            throw new Error(
              `Unknown review operation ${id}. kiln_review { action: 'list' } lists the recorded operations.`,
            );
          throw error;
        }
      };
      if (input.action === 'pin') {
        await read(input.operationId!);
        await store.pin(input.operationId!, input.pinned!);
        return { ok: true, operation: boundOperation(await store.get(input.operationId!)) };
      }
      const operation = await read(input.operationId!);
      if (input.action === 'get') return { ok: true, operation: boundOperation(operation) };
      const collection = input.collection ?? 'project';
      if (!context.assetLibrary) throw new Error('No asset library configured for reviewed save');
      if (operation.revision !== input.expectedRevision)
        throw new Error(
          `Review revision changed: operation ${operation.operationId} is at revision ${operation.revision}, not ${input.expectedRevision}. kiln_review { action: 'get', operationId } (CLI: review get) returns the current revision; send it as expectedRevision.`,
        );
      if (operation.status !== 'complete' || !operation.artifact)
        throw new Error(
          `Review operation ${operation.operationId} is ${operation.status}${operation.artifact ? '' : ' with no retained artifact'}; only a completed operation with a retained artifact can be saved. kiln_review { action: 'list' } shows each operation's status, or render again with kiln_render and save that.`,
        );
      let glb: Uint8Array | undefined;
      let source: Uint8Array | undefined;
      let metadata: Uint8Array | undefined;
      try {
        [glb, source, metadata] = await Promise.all(
          ['asset.glb', 'source.kiln.js', 'evaluation.json'].map((name) =>
            store.readFile(operation.operationId, name),
          ),
        );
      } catch (error) {
        throw new Error(
          `Review operation ${operation.operationId} has no readable retained files (${error instanceof Error ? error.message : String(error)}). Its evidence was evicted or never written; kiln_render the program again and save that result, or kiln_review { action: 'list' } for other operations.`,
        );
      }
      validateAssetGlb(glb!);
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(glb!));
      const sha256 = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
      const evaluation = JSON.parse(new TextDecoder().decode(metadata)) as Omit<
        RenderResult,
        'glb'
      >;
      if (sha256 !== operation.artifact.sha256 || sha256 !== evaluation.artifactGlbSha256)
        throw new Error('Reviewed artifact identity mismatch');
      const active = resolveRequirementsContext(context.requirements);
      if (!requirementsContextsEqual(validateRequirementsContext(evaluation.requirements), active))
        throw new Error('Reviewed requirements do not match the current trusted host binding');
      if (input.assetId && input.parentRevision)
        assertSavedRequirementsAuthorized(
          (await context.assetLibrary.read(collection, input.assetId, input.parentRevision))
            .manifest,
          active,
        );
      const code = new TextDecoder().decode(source);
      const checkpoint = evaluation.requirements.binding
        ? createRequirementsCheckpoint(
            await programReference(code),
            evaluation.requirements.binding,
          )
        : undefined;
      const dependencies = [
        ...(evaluation.materialResourceProvenance ?? []),
        ...(evaluation.materialLibraryDependencies ?? []).map((manifest) => ({
          kind: 'kiln.material.v1',
          delivery: 'runtime',
          manifest,
        })),
      ];
      const preview = operation.captures[0]
        ? await store.readFile(operation.operationId, operation.captures[0].name)
        : undefined;
      const capture = z
        .object({ backdrop: z.enum(BACKDROP_IDS).optional() })
        .safeParse(operation.result?.capture);
      const asset = await context.assetLibrary.save(collection, {
        name: input.name!,
        assetId: input.assetId,
        parentRevision: input.parentRevision,
        description: input.description,
        tags: input.tags,
        code,
        glb: glb!,
        preview,
        previewInfo: {
          fidelity: await persistedPreviewFidelity(operation.viewFidelity, glb!),
          ...(preview && capture.success && capture.data.backdrop
            ? { backdrop: capture.data.backdrop }
            : {}),
        },
        build: {
          engine: operation.runtimeIdentity ?? 'recorded-build:identity-unavailable',
          options: {
            ...evaluation.rebuildOptions,
            reviewOperationId: operation.operationId,
            reviewRevision: operation.revision,
            requirements: evaluation.requirements,
            ...(checkpoint ? { requirementsCheckpoint: checkpoint } : {}),
            ...(operation.projectId
              ? { projectId: operation.projectId, projectRevision: operation.projectRevision }
              : {}),
          },
          warnings: evaluation.warnings,
          integration: evaluation.integrationManifest,
          qa: evaluation.meta.qaReport,
          dependencies,
          rebuild: dependencies.some((item) => item.delivery === 'runtime')
            ? 'external-dependencies-required'
            : 'engine-required',
        },
      });
      return { ok: true, collection, asset };
    },
  };
}
