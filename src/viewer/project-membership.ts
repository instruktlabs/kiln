import type { ProjectRevision } from '../projects';

export type MembershipAsset = NonNullable<ProjectRevision['inventory'][number]['asset']>;
export function membershipPatch(
  project: ProjectRevision,
  inventoryId: string,
  asset: MembershipAsset | null,
  name: string,
) {
  const existing = project.inventory.find((item) => item.id === inventoryId);
  if (!existing && !asset) throw new Error('Inventory item not found');
  const inventory: ProjectRevision['inventory'] = project.inventory.map((item) => {
    if (item.id !== inventoryId) return item;
    const { asset: _previous, ...fields } = item;
    return asset ? { ...fields, asset } : fields;
  });
  if (!existing && asset)
    inventory.push({ id: inventoryId, name, kind: 'asset', brief: '', references: [], asset });
  return { inventory };
}
