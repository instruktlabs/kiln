import { z } from 'zod';
import {
  projectIdSchema,
  projectRevisionIdSchema,
  materialDependenciesSchema,
  type MaterialDependency,
  type ProjectRevision,
} from './projects';
import type { MaterialLibraryPayloadV1 } from './material-library';

export interface WorkspaceBinding {
  project?: ProjectRevision;
  materialDependencies: MaterialDependency[];
  materialResources: MaterialLibraryPayloadV1;
}
export const workspaceSelectionSchema = z
  .object({
    projectId: projectIdSchema
      .nullable()
      .optional()
      .describe('Project; omit for the configured default, null for standalone.'),
    projectRevision: projectRevisionIdSchema.optional().describe('Exact project revision.'),
    materialDependencies: materialDependenciesSchema
      .optional()
      .describe('Pins for this call; each replaces the project pin of its resourceId.'),
  })
  .strict()
  .superRefine((selection, ctx) => {
    if (selection.projectId === null && selection.projectRevision !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['projectRevision'],
        message: 'projectRevision cannot be combined with standalone projectId: null.',
      });
  });
export type WorkspaceSelection = z.infer<typeof workspaceSelectionSchema>;
/** A host snapshots optional project context and exact material pins per operation. */
export interface WorkspacePort {
  run<T>(selection: WorkspaceSelection, execute: () => Promise<T>): Promise<T>;
  current(): WorkspaceBinding | undefined;
  /** The project an omitted `projectId` selects, when the host configured one. */
  configured?(): string | undefined;
}
