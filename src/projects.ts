/** Shared project records. Editable preferences and review annotations confer no QA authority. */
import { z } from 'zod';

export const MAX_PROJECT_BYTES = 1024 * 1024;
export const MAX_PROJECT_REVISIONS = 10000;
export const projectIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]{0,79}$/)
  .refine(
    (value) => !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(value),
    'Reserved filesystem name',
  );
export const projectRevisionIdSchema = z.string().regex(/^r_[0-9]{10}_[a-f0-9]{64}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const text = z.string().max(4000);
const resourceId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,199}$/);
const assetReference = z
  .object({
    collectionId: projectIdSchema,
    assetId: projectIdSchema,
    revisionId: projectIdSchema,
  })
  .strict();

export const projectDesignSchema = z
  .object({
    style: text.default(''),
    scale: z.string().max(1000).default(''),
    palette: z
      .array(
        z
          .object({
            role: z.string().min(1).max(100),
            color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
          })
          .strict(),
      )
      .max(64)
      .default([]),
    materialRoles: z
      .array(
        z
          .object({
            role: z.string().min(1).max(100),
            description: text.default(''),
            resourceId: resourceId.optional(),
          })
          .strict(),
      )
      .max(128)
      .default([]),
    conventions: z.array(z.string().max(1000)).max(100).default([]),
    exceptions: z.array(z.string().max(1000)).max(100).default([]),
  })
  .strict();

export const projectMaterialDependencySchema = z
  .object({
    resourceId,
    revisionId: z.string().min(1).max(200),
    sha256: hash,
    role: z.string().max(100).optional(),
  })
  .strict();
/** Shared exact resource pins for projects and standalone authoring invocations. */
export const materialDependenciesSchema = z.array(projectMaterialDependencySchema).max(512);
export type MaterialDependency = z.infer<typeof projectMaterialDependencySchema>;

const content = {
  name: z.string().trim().min(1).max(200),
  brief: z.string().max(16000).default(''),
  design: projectDesignSchema.default(() => projectDesignSchema.parse({})),
  inventory: z
    .array(
      z
        .object({
          id: projectIdSchema,
          name: z.string().trim().min(1).max(200),
          kind: z.enum(['asset', 'environment']).default('asset'),
          brief: text.default(''),
          references: z.array(projectIdSchema).max(64).default([]),
          asset: assetReference.optional(),
        })
        .strict(),
    )
    .max(1000)
    .default([]),
  deliveryProfiles: z
    .array(
      z
        .object({
          id: projectIdSchema,
          target: z.enum(['three', 'godot', 'unity', 'unreal', 'roblox', 'sbox', 'usdz', 'custom']),
          description: text.default(''),
          performanceIntent: z.string().max(1000).default(''),
          constraints: z.array(z.string().max(1000)).max(100).default([]),
        })
        .strict(),
    )
    .max(32)
    .default([]),
  materialDependencies: materialDependenciesSchema.default([]),
  references: z
    .array(
      z
        .object({
          id: projectIdSchema,
          title: z.string().min(1).max(200),
          /** Informational URI only. Reading a project never fetches or executes a reference. */
          uri: z.string().min(1).max(2048),
          description: text.default(''),
          sha256: hash.optional(),
        })
        .strict(),
    )
    .max(256)
    .default([]),
  /** These are attributed annotations, not host authorization or release qualification. */
  reviews: z
    .array(
      z
        .object({
          id: projectIdSchema,
          inventoryId: projectIdSchema,
          projectRevisionId: projectRevisionIdSchema,
          asset: assetReference,
          reviewer: z.string().trim().min(1).max(200),
          verdict: z.enum(['comment', 'changes-requested', 'accepted']),
          notes: text,
        })
        .strict(),
    )
    .max(2000)
    .default([]),
};

type ProjectContent = z.infer<z.ZodObject<typeof content>>;
function checkContent(data: ProjectContent, ctx: z.RefinementCtx): void {
  const unique = (items: string[], path: string) => {
    if (new Set(items).size !== items.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message: 'Duplicate identity' });
  };
  unique(
    data.inventory.map((v) => v.id),
    'inventory',
  );
  unique(
    data.references.map((v) => v.id),
    'references',
  );
  unique(
    data.deliveryProfiles.map((v) => v.id),
    'deliveryProfiles',
  );
  unique(
    data.materialDependencies.map((v) => v.resourceId),
    'materialDependencies',
  );
  unique(
    data.reviews.map((v) => v.id),
    'reviews',
  );
  unique(
    data.design.palette.map((v) => v.role),
    'design.palette',
  );
  unique(
    data.design.materialRoles.map((v) => v.role),
    'design.materialRoles',
  );
  const references = new Set(data.references.map((v) => v.id));
  const inventory = new Set(data.inventory.map((v) => v.id));
  const resources = new Set(data.materialDependencies.map((v) => v.resourceId));
  for (const item of data.inventory) {
    unique(item.references, `inventory.${item.id}.references`);
    if (item.references.some((id) => !references.has(id)))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inventory'],
        message: 'Unknown reference',
      });
  }
  if (data.reviews.some((review) => !inventory.has(review.inventoryId)))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reviews'],
      message: 'Unknown inventory item',
    });
  if (data.design.materialRoles.some((role) => role.resourceId && !resources.has(role.resourceId)))
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['design'],
      message: 'Material role requires a locked resource',
    });
}

export const projectDraftSchema = z
  .object({
    projectId: projectIdSchema.optional(),
    ...content,
  })
  .strict()
  .superRefine(checkContent);
/** Patches replace supplied top-level fields. Omitted fields retain their previous values. */
export const projectPatchSchema = z
  .object({
    name: content.name.optional(),
    brief: content.brief.removeDefault().optional(),
    design: content.design.removeDefault().optional(),
    inventory: content.inventory.removeDefault().optional(),
    deliveryProfiles: content.deliveryProfiles.removeDefault().optional(),
    materialDependencies: content.materialDependencies.removeDefault().optional(),
    references: content.references.removeDefault().optional(),
    reviews: content.reviews.removeDefault().optional(),
  })
  .strict();
export const projectRevisionSchema = z
  .object({
    version: z.literal('kiln.project.v1'),
    projectId: projectIdSchema,
    revisionId: projectRevisionIdSchema,
    parentRevision: projectRevisionIdSchema.optional(),
    createdAt: z.string().datetime(),
    ...content,
  })
  .strict()
  .superRefine(checkContent);

export type ProjectDraft = z.input<typeof projectDraftSchema>;
export type ProjectPatch = z.input<typeof projectPatchSchema>;
export type ProjectRevision = z.infer<typeof projectRevisionSchema>;
export type ProjectDesign = ProjectRevision['design'];
export type ProjectMaterialDependency = ProjectRevision['materialDependencies'][number];

/** Selection is explicit on every read/write. There is no process-global current project. */
export interface ProjectStore {
  create(draft: ProjectDraft): Promise<ProjectRevision>;
  list(): Promise<ProjectRevision[]>;
  read(projectId: string, revisionId?: string): Promise<ProjectRevision>;
  update(
    projectId: string,
    expectedRevision: string,
    patch: ProjectPatch,
  ): Promise<ProjectRevision>;
}

export class ProjectConflictError extends Error {
  readonly code = 'PROJECT_CONFLICT';
  constructor(
    readonly projectId: string,
    readonly expectedRevision: string,
    readonly actualRevision: string,
  ) {
    super(`Project revision conflict: expected ${expectedRevision}, current ${actualRevision}.`);
    this.name = 'ProjectConflictError';
  }
}
export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND';
  constructor(
    readonly projectId: string,
    readonly revisionId?: string,
  ) {
    super(`Project not found: ${projectId}${revisionId ? ` at ${revisionId}` : ''}.`);
    this.name = 'ProjectNotFoundError';
  }
}
export class ProjectExistsError extends Error {
  readonly code = 'PROJECT_EXISTS';
  constructor(readonly projectId: string) {
    super(`Project already exists: ${projectId}.`);
    this.name = 'ProjectExistsError';
  }
}
