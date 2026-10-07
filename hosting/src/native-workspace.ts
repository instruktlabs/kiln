import { AsyncLocalStorage } from 'node:async_hooks';
import {
  workspaceSelectionSchema,
  type WorkspaceBinding,
  type WorkspacePort,
  type WorkspaceSelection,
} from '@instruktlabs/kiln/workspace';
import {
  MATERIAL_LIBRARY_LIMITS,
  type MaterialLibrary,
  type MaterialRecordV1,
} from '@instruktlabs/kiln/material-library';
import { createMaterialLibraryPayload } from '@instruktlabs/kiln/material-library/node';

/** Standalone operations bind explicit material revisions, never a local directory or inferred project. */
export class NativeMaterialWorkspace implements WorkspacePort {
  private readonly active = new AsyncLocalStorage<WorkspaceBinding>();
  constructor(private readonly materials: MaterialLibrary) {}
  current(): WorkspaceBinding | undefined {
    return this.active.getStore();
  }

  async run<T>(requested: WorkspaceSelection, execute: () => Promise<T>): Promise<T> {
    const selection = workspaceSelectionSchema.parse(requested);
    if (selection.projectId != null || selection.projectRevision !== undefined)
      throw new Error(
        'Hosted project storage is not available; omit the project or use projectId: null with explicit materialDependencies.',
      );
    const existing = this.current();
    const inherit = existing && selection.projectId !== null;
    if (inherit && selection.materialDependencies === undefined) return execute();
    const pins = new Map<string, WorkspaceBinding['materialDependencies'][number]>();
    for (const pin of inherit ? existing.materialDependencies : []) pins.set(pin.resourceId, pin);
    for (const pin of selection.materialDependencies ?? []) pins.set(pin.resourceId, pin);
    const dependencies = [...pins.values()].sort((a, b) =>
      a.resourceId.localeCompare(b.resourceId),
    );
    if (dependencies.length > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
      throw new Error(
        `An evaluation may resolve at most ${MATERIAL_LIBRARY_LIMITS.maxPayloadRecords} material resources; select a smaller dependency closure.`,
      );
    // Validate the entire selection before reading any tenant storage.
    for (const pin of dependencies) {
      if (
        !/^[a-z][a-z0-9_-]{0,79}(?![\s\S])/.test(pin.resourceId) ||
        !/^sha256:[a-f0-9]{64}(?![\s\S])/.test(pin.revisionId)
      )
        throw new Error('Invalid material identity');
      if (pin.sha256 !== pin.revisionId)
        throw new Error(`Material lock hash mismatch: ${pin.resourceId}`);
    }
    const records: MaterialRecordV1[] = [];
    let bytes = 0,
      pixels = 0;
    // Bound accumulated decoded resources before reading another record. The
    // native library separately verifies each immutable record before returning it.
    for (const pin of dependencies) {
      let record: MaterialRecordV1;
      try {
        record = await this.materials.read(pin.resourceId, pin.revisionId);
      } catch {
        throw new Error(`Locked material unavailable: ${pin.resourceId} at ${pin.revisionId}`);
      }
      if (
        record.manifest.materialId !== pin.resourceId ||
        record.manifest.revisionId !== pin.revisionId
      )
        throw new Error('Locked material identity mismatch');
      for (const map of record.manifest.maps) {
        bytes += map.bytes;
        pixels += map.width * map.height;
      }
      if (
        bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
        pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
      )
        throw new Error('Material resource payload exceeds byte or pixel budget');
      records.push(record);
    }
    const materialResources = await createMaterialLibraryPayload(records);
    return this.active.run({ materialDependencies: dependencies, materialResources }, execute);
  }
}
