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
import type { KilnToolDef } from './registry';

export interface ReviewStore {
  snapshot(options?: { cursor?: string; projectId?: string }): Promise<LiveSnapshot>;
  get(operationId: string): Promise<LiveOperation>;
  pin(operationId: string, pinned: boolean): Promise<void>;
  readFile(operationId: string, name: string): Promise<Uint8Array>;
}
const operationId = z.string().regex(/^op_[a-f0-9-]{36}$/);
const assetId = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const reviewToolInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), projectId: assetId.optional() }),
  z.strictObject({ action: z.literal('get'), operationId }),
  z.strictObject({ action: z.literal('pin'), operationId, pinned: z.boolean() }),
  z.strictObject({
    action: z.literal('save'),
    operationId,
    expectedRevision: z.number().int().nonnegative(),
    collection: assetId.default('project'),
    name: z.string().min(1).max(200),
    assetId: assetId.optional(),
    parentRevision: assetId.optional(),
    description: z.string().max(4000).optional(),
    tags: z.array(z.string().max(80)).max(30).optional(),
  }),
]);
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
      if (input.action === 'list')
        return { ok: true, ...(await store.snapshot({ projectId: input.projectId })) };
      if (input.action === 'pin') {
        await store.pin(input.operationId, input.pinned);
        return { ok: true, operation: await store.get(input.operationId) };
      }
      const operation = await store.get(input.operationId);
      if (input.action === 'get') return { ok: true, operation };
      if (!context.assetLibrary) throw new Error('No asset library configured for reviewed save');
      if (operation.revision !== input.expectedRevision)
        throw new Error('Review revision changed; refresh before saving');
      if (operation.status !== 'complete' || !operation.artifact)
        throw new Error('A completed operation with a retained artifact is required');
      const [glb, source, metadata] = await Promise.all(
        ['asset.glb', 'source.kiln.js', 'evaluation.json'].map((name) =>
          store.readFile(operation.operationId, name),
        ),
      );
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
          (await context.assetLibrary.read(input.collection, input.assetId, input.parentRevision))
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
      const asset = await context.assetLibrary.save(input.collection, {
        name: input.name,
        assetId: input.assetId,
        parentRevision: input.parentRevision,
        description: input.description,
        tags: input.tags,
        code,
        glb: glb!,
        preview,
        previewInfo: {
          fidelity: operation.viewFidelity,
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
      return { ok: true, collection: input.collection, asset };
    },
  };
}
