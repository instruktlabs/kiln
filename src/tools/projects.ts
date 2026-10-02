import { z } from 'zod';
import {
  projectDraftSchema,
  projectPatchSchema,
  projectIdSchema,
  projectRevisionIdSchema,
  type ProjectStore,
} from '../projects';
import { nestedRecordDescription, requireActionFields } from './actions';
import type { KilnToolDef } from './registry';

export type ProjectBundleReader = (
  projectId: string,
  revisionId: string,
  profile: 'editable' | 'runtime',
) => Promise<Uint8Array>;

const PROJECT_ACTIONS = ['list', 'get', 'create', 'update', 'export'] as const;
type ProjectAction = (typeof PROJECT_ACTIONS)[number];
const REQUIREMENTS: Record<ProjectAction, Parameters<typeof requireActionFields>[3]> = {
  list: { required: [] },
  get: { required: ['projectId'] },
  create: { required: ['draft'], shapes: { draft: 'shape:project-draft' } },
  update: {
    required: ['projectId', 'expectedRevision', 'patch'],
    shapes: { patch: 'shape:project-patch' },
  },
  export: { required: ['projectId'] },
};

/** The nested records stay opaque in the advertised schema and are validated when the action runs. */
const record = (description: string) =>
  z.record(z.string(), z.unknown()).optional().describe(description);

/** One flat object: `export` is offered only when the host can read project bundles. */
export function projectToolInput(actions: readonly ProjectAction[] = PROJECT_ACTIONS) {
  return z.strictObject({
    action: z.enum(actions as [ProjectAction, ...ProjectAction[]]),
    projectId: projectIdSchema.optional().describe('get, update, export.'),
    revisionId: projectRevisionIdSchema
      .optional()
      .describe('get, export: an exact revision; omit for the current one.'),
    expectedRevision: projectRevisionIdSchema
      .optional()
      .describe('update: the revision being replaced; a stale value is a conflict.'),
    draft: record(
      nestedRecordDescription(
        'create: name, brief, design, inventory, deliveryProfiles, materialDependencies, references, reviews; optional projectId.',
        'shape:project-draft',
      ),
    ),
    patch: record(
      nestedRecordDescription(
        'update: the same top-level fields as draft; each supplied field replaces its previous value whole.',
        'shape:project-patch',
      ),
    ),
    profile: z
      .enum(['editable', 'runtime'])
      .optional()
      .describe(
        'export: editable (default) keeps source and resources; runtime is GLB plus metadata.',
      ),
  });
}

export function createKilnProjectDef(
  store: ProjectStore,
  bundleReader?: ProjectBundleReader,
): KilnToolDef {
  const schema = projectToolInput(
    bundleReader ? PROJECT_ACTIONS : PROJECT_ACTIONS.filter((action) => action !== 'export'),
  );
  return {
    name: 'kiln_project',
    description:
      'Manage optional shared workspace projects: list discovers IDs; get reads the current or an exact historical configuration; create adds a project; update needs the exact expectedRevision and replaces each supplied top-level field. Assets and materials are authored, saved and exported without a project, and creating one never binds unrelated authoring. Design preferences, inventory, references, delivery profiles and pinned material dependencies are versioned; review annotations do not change trusted QA or authorize a release. CLI and the local dashboard use the same records.' +
      (bundleReader
        ? ' export returns an MCP resource URI for an exact editable project ZIP with normalized material maps and recipes, or a runtime GLB/metadata ZIP; only inventory entries linked to saved revisions contribute assets, and referenced concept images and acquisition archives are not embedded.'
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
      requireActionFields('kiln_project', input.action, input, REQUIREMENTS[input.action]);
      switch (input.action) {
        case 'list':
          return { ok: true, projects: await store.list() };
        case 'get':
          return { ok: true, project: await store.read(input.projectId!, input.revisionId) };
        case 'create':
          return { ok: true, project: await store.create(projectDraftSchema.parse(input.draft)) };
        case 'update':
          return {
            ok: true,
            project: await store.update(
              input.projectId!,
              input.expectedRevision!,
              projectPatchSchema.parse(input.patch),
            ),
          };
        case 'export': {
          const profile = input.profile ?? 'editable';
          const project = await store.read(input.projectId!, input.revisionId);
          const bytes = await bundleReader!(project.projectId, project.revisionId, profile);
          const { projectBundleHash } = await import('../project-bundle');
          return {
            ok: true,
            projectId: project.projectId,
            revisionId: project.revisionId,
            profile,
            resource: {
              uri: `kiln://projects/${project.projectId}/${project.revisionId}/${profile}.zip`,
              mimeType: 'application/zip',
              bytes: bytes.length,
              sha256: await projectBundleHash(bytes),
            },
          };
        }
      }
    },
  };
}
