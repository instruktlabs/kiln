import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';
import { FileProjectStore } from './projects-node';
import { FileMaterialLibrary, createMaterialLibraryPayload } from './material-library-node';
import {
  workspaceSelectionSchema,
  type WorkspaceBinding,
  type WorkspacePort,
  type WorkspaceSelection,
} from './workspace';
import { materialDependenciesSchema, type MaterialDependency } from './projects';
import { MATERIAL_LIBRARY_LIMITS } from './material-library';

export { localWorkspaceRoot } from './workspace-location';
export class FileWorkspace implements WorkspacePort {
  readonly projects: FileProjectStore;
  readonly materials: FileMaterialLibrary;
  private readonly active = new AsyncLocalStorage<WorkspaceBinding>();
  constructor(
    readonly root: string,
    private readonly defaultProjectId?: string,
  ) {
    this.projects = new FileProjectStore(root);
    this.materials = new FileMaterialLibrary(join(root, '.kiln', 'materials'));
  }
  current() {
    return this.active.getStore();
  }
  configured() {
    return this.defaultProjectId;
  }
  async run<T>(requested: WorkspaceSelection, execute: () => Promise<T>): Promise<T> {
    const selection = workspaceSelectionSchema.parse(requested);
    const existing = this.current();
    const inherit =
      existing &&
      selection.projectId !== null &&
      (selection.projectId === undefined || selection.projectId === existing.project?.projectId) &&
      selection.projectRevision === undefined;
    if (inherit && selection.materialDependencies === undefined) return execute();
    const projectId =
      selection.projectId === null
        ? undefined
        : (selection.projectId ?? existing?.project?.projectId ?? this.defaultProjectId);
    if (!projectId && selection.projectRevision)
      throw new Error('projectRevision requires a project');
    const project = inherit
      ? existing.project
      : projectId
        ? await this.projects.read(projectId, selection.projectRevision)
        : undefined;
    // A project revision implies its pins, and a pin the call names replaces the
    // project's or the inherited one for the same resource (decision 27 of 2 October
    // 2026: a Codex session repeated the project's five pins on every call, 1,300 to
    // 3,400 characters of arguments each, because the schema said they could not be
    // replaced).
    const pins = new Map<string, MaterialDependency>();
    for (const dependency of inherit
      ? existing.materialDependencies
      : (project?.materialDependencies ?? []))
      pins.set(dependency.resourceId, dependency);
    for (const dependency of selection.materialDependencies ?? [])
      pins.set(dependency.resourceId, dependency);
    const materialDependencies = materialDependenciesSchema.parse(
      [...pins.values()].sort((a, b) => a.resourceId.localeCompare(b.resourceId)),
    );
    if (materialDependencies.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
      throw new Error(
        `An evaluation may resolve at most ${MATERIAL_LIBRARY_LIMITS.maxPayloadRecords} material resources; select a smaller dependency closure.`,
      );
    const materials = await Promise.all(
      materialDependencies.map(async (dependency) => {
        if (dependency.sha256 !== dependency.revisionId)
          throw new Error(`Material lock hash mismatch: ${dependency.resourceId}`);
        try {
          return await this.materials.read(dependency.resourceId, dependency.revisionId);
        } catch (error) {
          throw new Error(
            `Locked material unavailable: ${dependency.resourceId} at ${dependency.revisionId}`,
            { cause: error },
          );
        }
      }),
    );
    const materialResources = await createMaterialLibraryPayload(materials);
    return this.active.run(
      { ...(project ? { project } : {}), materialDependencies, materialResources },
      execute,
    );
  }
}
