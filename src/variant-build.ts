/**
 * Variant builds for a local host: a saved revision's source, rebuilt at other values of the
 * parameters it declares. Building runs that source in this host's evaluator, so a host offers
 * it only where the user started it for their own library (`kiln view`).
 */
import type { AssetLibrary, AssetRecord } from './assets';
import type { ParamsInputV1, ParamValue } from './params';
import type { KilnToolContext } from './tools/registry';

export interface VariantBuildRequest {
  collection: string;
  assetId: string;
  revisionId: string;
  params: ParamsInputV1;
}

export interface VariantBuild {
  glb: Uint8Array;
  sha256: string;
  triangles: number;
  /** The resolved values this GLB was built with; absent when the source declares none. */
  params?: { preset?: string; values: Record<string, ParamValue> };
  /** False when this engine builds the saved source to other bytes than the saved GLB. */
  defaultBuildMatchesSaved: boolean;
}

export type VariantBuilder = (request: VariantBuildRequest) => Promise<VariantBuild>;

/**
 * One build at a time: a slider can ask faster than a build finishes, and each build may be a
 * subprocess. `context` may be a function so a host pays for the engine on the first build.
 */
export function createVariantBuilder(
  library: AssetLibrary,
  context: KilnToolContext | (() => Promise<KilnToolContext>),
): VariantBuilder {
  let queue: Promise<unknown> = Promise.resolve();
  let resolved: Promise<KilnToolContext> | undefined;
  const build = async (request: VariantBuildRequest): Promise<VariantBuild> => {
    const { buildSavedRevisionVariant } = await import('./tools/registry');
    resolved ??= typeof context === 'function' ? context() : Promise.resolve(context);
    let record: AssetRecord;
    try {
      record = await library.read(request.collection, request.assetId, request.revisionId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error(
          `Unknown asset ${request.assetId} revision ${request.revisionId} in collection ${request.collection}.`,
        );
      throw error;
    }
    const variant = await buildSavedRevisionVariant(record, await resolved, request.params);
    return {
      glb: variant.rendered.glb,
      sha256: variant.rendered.artifactGlbSha256,
      triangles: variant.rendered.tris,
      ...(variant.params ? { params: variant.params } : {}),
      defaultBuildMatchesSaved: variant.defaultBuildMatchesSaved,
    };
  };
  return (request) => {
    const next = queue.then(() => build(request));
    queue = next.catch(() => undefined);
    return next;
  };
}
