import type { AssetManifest } from '../assets';
import type { ProjectRevision } from '../projects';
import { matchesAssetQuery } from '../tools/asset-text';

type Entry = { collection: string; manifest: AssetManifest };
export const assetIdentity = (entry: Entry) => `${entry.collection}/${entry.manifest.assetId}`;
/** The Library search: the same word matching over name and tags as `kiln_assets`. */
export const entriesMatching = <T extends Entry>(entries: T[], query: string): T[] =>
  entries.filter((e) =>
    matchesAssetQuery(`${e.manifest.name} ${e.manifest.tags.join(' ')}`, query),
  );
export function entriesForProject<T extends Entry>(
  entries: T[],
  projects: ProjectRevision[],
  selection: string,
): T[] {
  if (!selection) return entries;
  if (selection === 'standalone') {
    const members = new Set(
      projects.flatMap((p) =>
        p.inventory.flatMap((item) =>
          item.asset ? [`${item.asset.collectionId}/${item.asset.assetId}`] : [],
        ),
      ),
    );
    return entries.filter((entry) => !members.has(assetIdentity(entry)));
  }
  const references = new Set(
    projects
      .find((p) => p.projectId === selection)
      ?.inventory.flatMap((item) =>
        item.asset
          ? [`${item.asset.collectionId}/${item.asset.assetId}/${item.asset.revisionId}`]
          : [],
      ) ?? [],
  );
  return entries.filter((entry) =>
    references.has(`${assetIdentity(entry)}/${entry.manifest.revisionId}`),
  );
}
