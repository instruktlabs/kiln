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
      .describe(
        'Optional project. Omission is standalone unless the host explicitly configures a default; null always selects standalone authoring.',
      ),
    projectRevision: projectRevisionIdSchema
      .optional()
      .describe('Exact project revision; requires a selected or configured project.'),
    materialDependencies: materialDependenciesSchema
      .optional()
      .describe(
        'Exact immutable material pins for this invocation, usable with or without a project. Project locks cannot be replaced.',
      ),
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
}
