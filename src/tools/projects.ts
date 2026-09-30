import { z } from 'zod';
import {
  projectDraftSchema,
  projectPatchSchema,
  projectIdSchema,
  projectRevisionIdSchema,
  type ProjectStore,
} from '../projects';
import type { KilnToolDef } from './registry';

export const projectToolInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list') }),
  z.strictObject({
    action: z.literal('get'),
    projectId: projectIdSchema,
    revisionId: projectRevisionIdSchema.optional(),
  }),
  z.strictObject({ action: z.literal('create'), draft: projectDraftSchema }),
  z.strictObject({
    action: z.literal('update'),
    projectId: projectIdSchema,
    expectedRevision: projectRevisionIdSchema,
    patch: projectPatchSchema,
  }),
]);
export type ProjectBundleReader = (
  projectId: string,
  revisionId: string,
  profile: 'editable' | 'runtime',
) => Promise<Uint8Array>;
export function createKilnProjectDef(
  store: ProjectStore,
  bundleReader?: ProjectBundleReader,
): KilnToolDef {
  const schema = bundleReader
    ? z.discriminatedUnion('action', [
        ...projectToolInput.options,
        z.strictObject({
          action: z.literal('export'),
          projectId: projectIdSchema,
          revisionId: projectRevisionIdSchema.optional(),
          profile: z.enum(['editable', 'runtime']).default('editable'),
        }),
      ])
    : projectToolInput;
  return {
    name: 'kiln_project',
    description:
      'Manage optional shared workspace projects. Assets and materials can be authored, saved and exported without a project; creating one never binds unrelated authoring automatically. list discovers IDs; get reads current or exact historical configuration; create adds a project; update requires the exact expectedRevision and replaces supplied top-level fields. Design preferences, inventory, references, delivery profiles and pinned material dependencies are versioned. Review annotations do not change trusted QA or authorize a release. CLI and the local dashboard use these same records.' +
      (bundleReader
        ? ' export returns an MCP resource URI for an exact editable project ZIP with normalized material maps and recipes, or a runtime GLB/metadata ZIP. Only inventory entries linked to saved revisions contribute assets; referenced concept images and original acquisition archives are not embedded.'
        : ''),
    inputSchema: schema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (raw) => {
      const input = schema.parse(raw);
      if (input.action === 'export') {
        const project = await store.read(input.projectId, input.revisionId);
        const bytes = await bundleReader!(project.projectId, project.revisionId, input.profile);
        const { projectBundleHash } = await import('../project-bundle');
        return {
          ok: true,
          projectId: project.projectId,
          revisionId: project.revisionId,
          profile: input.profile,
          resource: {
            uri: `kiln://projects/${project.projectId}/${project.revisionId}/${input.profile}.zip`,
            mimeType: 'application/zip',
            bytes: bytes.length,
            sha256: await projectBundleHash(bytes),
          },
        };
      }
      if (input.action === 'list') return { ok: true, projects: await store.list() };
      const project =
        input.action === 'create'
          ? await store.create(input.draft)
          : input.action === 'update'
            ? await store.update(input.projectId, input.expectedRevision, input.patch)
            : await store.read(input.projectId, input.revisionId);
      return { ok: true, project };
    },
  };
}
