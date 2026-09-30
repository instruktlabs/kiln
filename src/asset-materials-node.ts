/** Exact saved material closure, shared by standalone asset and project delivery. */
import type { AssetRecord } from './assets';
import { validateAssetMaterialClosure } from './assets';
import {
  canonicalMaterialJson,
  MATERIAL_LIBRARY_LIMITS,
  type MaterialLibrary,
  type MaterialManifestV1,
  type MaterialRecordV1,
} from './material-library';
import {
  decodeMaterialLibraryPayload,
  validateMaterialManifestIdentity,
} from './material-library-node';

export function dependencyManifests(asset: AssetRecord): MaterialManifestV1[] {
  const result = new Map<string, MaterialManifestV1>();
  for (const raw of asset.manifest.build?.dependencies ?? []) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Invalid saved asset dependency');
    const dependency = raw as Record<string, unknown>;
    if (dependency.kind === 'kiln.material.v1') {
      if (dependency.delivery !== 'runtime')
        throw new Error('Invalid material dependency delivery');
      const manifest = validateMaterialManifestIdentity(dependency.manifest);
      result.set(`${manifest.materialId}/${manifest.revisionId}`, manifest);
      if (result.size > MATERIAL_LIBRARY_LIMITS.maxPayloadRecords)
        throw new Error('Saved asset material dependency count exceeds limit');
    } else if (dependency.delivery === 'runtime')
      throw new Error(
        `Unsupported runtime dependency: ${String(dependency.resourceId ?? 'unknown')}`,
      );
    else if (dependency.delivery !== 'embedded')
      throw new Error('Unsupported saved asset dependency');
  }
  if (asset.manifest.build?.rebuild === 'external-dependencies-required' && !result.size)
    throw new Error('Saved asset has unrecorded external dependencies');
  let bytes = 0;
  let pixels = 0;
  for (const manifest of result.values())
    for (const map of manifest.maps) {
      bytes += map.bytes;
      pixels += map.width * map.height;
    }
  if (
    bytes > MATERIAL_LIBRARY_LIMITS.maxPayloadBytes ||
    pixels > MATERIAL_LIBRARY_LIMITS.maxPayloadPixels
  )
    throw new Error('Saved asset material allocation exceeds limit');
  return [...result.values()];
}

export async function resolveSavedAssetMaterials(
  asset: AssetRecord,
  library?: MaterialLibrary,
): Promise<MaterialRecordV1[]> {
  const dependencies = dependencyManifests(asset);
  if (asset.materialResources) {
    validateAssetMaterialClosure(asset, true);
    return decodeMaterialLibraryPayload(asset.materialResources);
  }
  return Promise.all(
    dependencies.map(async (manifest) => {
      try {
        if (!library) throw new Error('No material library configured');
        const record = await library.read(manifest.materialId, manifest.revisionId);
        if (canonicalMaterialJson(record.manifest) !== canonicalMaterialJson(manifest))
          throw new Error('Saved dependency manifest mismatch');
        return record;
      } catch (error) {
        throw new Error(
          `Locked asset material unavailable: ${manifest.materialId} at ${manifest.revisionId}`,
          { cause: error },
        );
      }
    }),
  );
}
