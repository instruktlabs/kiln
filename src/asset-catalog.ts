/** A Library view spans the host's explicitly configured storage collections. */
import type { AssetLibrary, AssetManifest } from './assets';

export interface CatalogEntry {
  collectionId: string;
  manifest: AssetManifest;
}
export async function listAssetCatalog(library: AssetLibrary) {
  const entries: CatalogEntry[] = [];
  const errors: { collectionId: string; message: string }[] = [];
  for (const collection of library.collections()) {
    try {
      for (const manifest of await library.list(collection.id))
        entries.push({ collectionId: collection.id, manifest });
    } catch (error) {
      errors.push({
        collectionId: collection.id,
        message: error instanceof Error ? error.message : 'Collection unavailable',
      });
    }
  }
  entries.sort(
    (a, b) =>
      b.manifest.createdAt.localeCompare(a.manifest.createdAt) ||
      a.collectionId.localeCompare(b.collectionId) ||
      a.manifest.assetId.localeCompare(b.manifest.assetId) ||
      a.manifest.revisionId.localeCompare(b.manifest.revisionId),
  );
  return { entries, errors };
}
