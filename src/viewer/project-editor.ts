import { projectDraftSchema, type InventoryPlacement, type ProjectDraft } from '../projects';

/** What the composed check does with an item: only a stated placement joins it. */
export function placementLabel(placement: InventoryPlacement | undefined): string {
  if (!placement) return 'Not composed';
  const { translation, rotation, scale } = placement;
  const parts = [
    translation && `Move ${translation.join(', ')}`,
    rotation && `turn ${rotation.join(', ')}°`,
    scale && `scale ${scale.join(', ')}`,
  ].filter(Boolean);
  return parts.join(' · ') || 'At origin';
}

export function editableProjectConfig(project: ProjectDraft) {
  const { palette, materialRoles, conventions, exceptions } = project.design ?? {};
  return {
    design: {
      palette: palette ?? [],
      materialRoles: materialRoles ?? [],
      conventions: conventions ?? [],
      exceptions: exceptions ?? [],
    },
    inventory: project.inventory ?? [],
    deliveryProfiles: project.deliveryProfiles ?? [],
    materialDependencies: project.materialDependencies ?? [],
    references: project.references ?? [],
    reviews: project.reviews ?? [],
  };
}

export function projectFormDraft(
  json: string,
  fields: { name: string; brief: string; style: string; scale: string },
) {
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Project configuration must be a JSON object.');
  const config = parsed as Record<string, unknown>;
  const design = config.design ?? {};
  if (!design || typeof design !== 'object' || Array.isArray(design))
    throw new Error('Design configuration must be a JSON object.');
  return projectDraftSchema.parse({
    ...config,
    name: fields.name,
    brief: fields.brief,
    design: { ...design, style: fields.style, scale: fields.scale },
  });
}
