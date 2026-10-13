/** Exact saved material closure, shared by standalone asset and project delivery. */
import type { AssetRecord } from './assets';
import { assetMaterialRootManifests, validateAssetMaterialClosure } from './assets';
import {
  MATERIAL_LIBRARY_LIMITS,
  type MaterialLibrary,
  type MaterialManifest,
  type MaterialRecord,
} from './material-library';
import {
  decodeMaterialLibraryPayload,
  validateMaterialManifestIdentityAny,
  resolveMaterialRecordClosure,
} from './material-library-node';

export function dependencyManifests(asset: AssetRecord): MaterialManifest[] {
  const result = assetMaterialRootManifests(asset).map(validateMaterialManifestIdentityAny);
  if (asset.manifest.build?.rebuild === 'external-dependencies-required' && !result.length)
    throw new Error('Saved asset has unrecorded external dependencies');
  let bytes = 0;
  let pixels = 0;
  for (const manifest of result)
    for (const map of manifest.maps) {
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Saved asset material allocation exceeds limit');
  return result;
}

export async function resolveSavedAssetMaterials(
  asset: AssetRecord,
  library?: MaterialLibrary,
): Promise<MaterialRecord[]> {
  const dependencies = dependencyManifests(asset);
  if (asset.materialResources) {
    validateAssetMaterialClosure(asset, true);
    return decodeMaterialLibraryPayload(asset.materialResources);
  }
  if (!dependencies.length) return [];
  if (!library)
    throw new Error('Locked asset material unavailable: No material library configured');
  const roots = new Map(dependencies.map((m) => [`${m.materialId}/${m.revisionId}`, m]));
  const wrap = async <T>(id: string, revision: string, load: () => Promise<T>): Promise<T> => {
    try {
      return await load();
    } catch (error) {
      throw new Error(`Locked asset material unavailable: ${id} at ${revision}`, { cause: error });
    }
  };
  return resolveMaterialRecordClosure(dependencies, {
    readManifest: async (id, revision) =>
      wrap(id, revision, async () => {
        const root = roots.get(`${id}/${revision}`);
        if (root) return root;
        if (!library.readManifest)
          throw new Error('Material library requires manifest-first dependency capability');
        return library.readManifest(id, revision);
      }),
    read: async (id, revision) =>
      wrap(id, revision, () =>
        library.readRecordFiles
          ? library.readRecordFiles(id, revision)
          : library.read(id, revision),
      ),
  });
}
