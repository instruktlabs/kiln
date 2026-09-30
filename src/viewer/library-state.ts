import type { AssetManifest } from '../assets';
import type { ProjectRevision } from '../projects';

type Entry = { collection: string; manifest: AssetManifest };
export const assetIdentity = (entry: Entry) => `${entry.collection}/${entry.manifest.assetId}`;
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
